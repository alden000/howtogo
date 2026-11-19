/**
 * 1.1 smart search: aliases → OneMap → (voice alternatives) → Claude rewrite. The Anthropic API is NEVER
 * called for real: every request to api.anthropic.com is answered by the fetch stub below.
 */
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.embed";
import { AI_CONFIG, AI_MODEL, SYSTEM_PROMPT } from "../src/ai";
import { evictCached, resetMemoryCache } from "../src/cache";
import { TOKEN_KV_KEY, resetTokenCache } from "../src/onemap";
import { LIMITS, resetRateLimit } from "../src/ratelimit";
import { jsonRes, stubFetch } from "./helpers";

const KEY = "sk-ant-test-not-a-real-key";
type E = typeof env;
const aiEnv = (over: Partial<E> = {}): E => ({ ...env, ANTHROPIC_API_KEY: KEY, ...over }) as E;

async function get(path: string, e: E, headers: Record<string, string> = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://api.test" + path, { headers }), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

interface Body {
  results: { name: string; postal: string; via: string }[];
  didYouMean: boolean;
  usedAlternative?: string;
}

let n = 0;
/** A OneMap search row (synthetic test data). */
const row = (building: string) => {
  n++;
  const postal = String(100000 + n);
  return { SEARCHVAL: building, BUILDING: building, BLK_NO: "1", ROAD_NAME: "TEST ROAD", ADDRESS: `1 TEST ROAD ${building} SINGAPORE ${postal}`, POSTAL: postal, LATITUDE: "1.3", LONGITUDE: "103.8" };
};

/** Claude Messages API response with a structured-output text block. */
const claude = (out: unknown, stop_reason = "end_turn") =>
  jsonRes({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: AI_MODEL,
    content: out === null ? [] : [{ type: "text", text: JSON.stringify(out) }],
    stop_reason,
    stop_sequence: null,
    stop_details: stop_reason === "refusal" ? { type: "refusal", category: null, explanation: null } : null,
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  });

type Anth = (req: Request) => Response | Promise<Response>;
/** OneMap answers from `places` (searchVal → building names); Anthropic from `anth`. */
async function upstream(places: Record<string, string[]>, anth?: Anth, alsoEvict: string[] = []) {
  // The Cache API outlives a test: drop every OneMap term this test relies on.
  for (const t of [...Object.keys(places), ...alsoEvict]) await evictCached(`search:v1:${t.toLowerCase()}`);
  const ai: { body: Record<string, unknown>; headers: Headers }[] = [];
  const oneMap: string[] = [];
  const stub = stubFetch(async (url, _init, req) => {
    if (url.hostname === "api.anthropic.com") {
      ai.push({ body: JSON.parse(await req.clone().text()), headers: req.headers });
      if (!anth) throw new Error("unexpected Anthropic call");
      return anth(req);
    }
    const q = url.searchParams.get("searchVal") ?? "";
    oneMap.push(q);
    return jsonRes({ found: 0, results: (places[q] ?? []).map(row) });
  });
  return { ai, oneMap, stub };
}

const Q = "the big hospital near novena";
let logs: unknown[][] = [];
// ai.ts loads the SDK lazily; the first transform of it in the test pool can take seconds, so warm it up once.
beforeAll(async () => {
  await import("../src/claude");
}, 120_000);
beforeEach(async () => {
  resetTokenCache();
  resetMemoryCache();
  resetRateLimit();
  AI_CONFIG.timeoutMs = 4000;
  await env.TOKEN_KV.put(TOKEN_KV_KEY, JSON.stringify({ token: "tok-A", expiresAt: Date.now() + 48 * 3600_000 }));
  for (const k of (await env.TOKEN_KV.list({ prefix: "ai:" })).keys) await env.TOKEN_KV.delete(k.name);
  await evictCached(`search:v1:${Q}`);
  logs = [];
  for (const m of ["log", "warn", "error", "info", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a));
  }
});
afterEach(() => vi.restoreAllMocks());

const noQueryInLogs = (...texts: string[]) => {
  const all = JSON.stringify(logs).toLowerCase();
  for (const t of texts) expect(all).not.toContain(t.toLowerCase());
};

describe("alias layer", () => {
  it("KKH → KK Women's and Children's Hospital first, tagged via alias; no AI without a key", async () => {
    const { oneMap, ai } = await upstream({ "KK Women's and Children's Hospital": ["KK WOMEN'S AND CHILDREN'S HOSPITAL"], KKH: ["KKH CLINIC BLOCK"] });
    const res = await get("/api/search?q=KKH", env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.results.map((r) => [r.name, r.via])).toEqual([
      ["Kk Women's and Children's Hospital", "alias"],
      ["KKH Clinic Block", "direct"],
    ]);
    expect(body.didYouMean).toBe(false);
    expect(oneMap.sort()).toEqual(["KK Women's and Children's Hospital", "KKH"]);
    expect(ai).toHaveLength(0);
  });

  it("speech renderings (K K 医院) reach the same alias", async () => {
    const { oneMap } = await upstream({}, undefined, ["KK Women's and Children's Hospital", "K K 医院"]);
    await get("/api/search?q=" + encodeURIComponent("K K 医院"), env);
    expect(oneMap).toContain("KK Women's and Children's Hospital");
  });

  it("de-duplicates by name + postal across layers", async () => {
    const shared = row("TAN TOCK SENG HOSPITAL");
    for (const t of ["TTSH", "Tan Tock Seng Hospital"]) await evictCached(`search:v1:${t.toLowerCase()}`);
    stubFetch(() => jsonRes({ results: [shared] }));
    const body = (await (await get("/api/search?q=TTSH", env)).json()) as Body;
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.via).toBe("alias");
  });
});

describe("Claude rewrite layer (mocked)", () => {
  const q = Q;
  const rewrite = { terms: ["Tan Tock Seng Hospital", "Mount Elizabeth Novena Hospital"], confidence: "medium" };
  const places = { "Tan Tock Seng Hospital": ["TAN TOCK SENG HOSPITAL"], "Mount Elizabeth Novena Hospital": ["MOUNT ELIZABETH NOVENA HOSPITAL"] };

  it("rewrites when OneMap finds < 2, merges with via ai and didYouMean; sends only the query", async () => {
    const { ai } = await upstream(places, () => claude(rewrite));
    const res = await get("/api/search?q=" + encodeURIComponent(q), aiEnv(), { "CF-Connecting-IP": "203.0.113.7" });
    const body = (await res.json()) as Body;
    expect(body.results.map((r) => [r.name, r.via])).toEqual([
      ["Tan Tock Seng Hospital", "ai"],
      ["Mount Elizabeth Novena Hospital", "ai"],
    ]);
    expect(body.didYouMean).toBe(true);

    expect(ai).toHaveLength(1);
    const { body: req, headers } = ai[0]!;
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.max_tokens).toBe(1024);
    expect(req.fallbacks).toBe("default");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    // SDK 1.x sends the key as a bearer token; no client headers (IP, origin, referrer) are forwarded.
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect([...headers.keys()].filter((h) => /cf-|forwarded|origin|referer|cookie/i.test(h))).toEqual([]);
    expect(req).not.toHaveProperty("thinking");
    expect(req).not.toHaveProperty("temperature");
    expect(req).not.toHaveProperty("metadata");
    const oc = req.output_config as { effort: string; format: { type: string; schema: unknown } };
    expect(oc.effort).toBe("low");
    expect(oc.format.type).toBe("json_schema");
    expect(req.system).toEqual([{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    expect(req.messages).toEqual([{ role: "user", content: q }]);
    // Nothing about the client: no IP, no location.
    expect(JSON.stringify(req)).not.toContain("203.0.113.7");
    noQueryInLogs(q);
  });

  it("serves a repeated query from the KV cache (no second Claude call)", async () => {
    const { ai } = await upstream(places, () => claude(rewrite));
    await get("/api/search?q=" + encodeURIComponent(q), aiEnv());
    resetMemoryCache();
    const body = (await (await get("/api/search?q=" + encodeURIComponent(q.toUpperCase()), aiEnv())).json()) as Body;
    expect(ai).toHaveLength(1);
    expect(body.results.map((r) => r.via)).toEqual(["ai", "ai"]);
    // The KV key is a hash: no search text stored in clear.
    const keys = (await env.TOKEN_KV.list({ prefix: "ai:v1:" })).keys.map((k) => k.name);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^ai:v1:[0-9a-f]{32}$/);
  });

  it("does not call Claude when OneMap already has 2+ results", async () => {
    const { ai } = await upstream({ "bishan park": ["BISHAN PARK 1", "BISHAN PARK 2"] }, () => claude(rewrite));
    await get("/api/search?q=bishan%20park", aiEnv());
    expect(ai).toHaveLength(0);
  });

  it("times out after AI_CONFIG.timeoutMs and returns the plain results", async () => {
    AI_CONFIG.timeoutMs = 50;
    const { ai } = await upstream({ [q]: ["ONE PLAIN HIT"] }, (req) => new Promise<Response>((_r, reject) => req.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const res = await get("/api/search?q=" + encodeURIComponent(q), aiEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.results.map((r) => r.via)).toEqual(["direct"]);
    expect(ai).toHaveLength(1);
    expect(logs).toContainEqual(["ai_rewrite", "timeout"]);
    noQueryInLogs(q);
  });

  it("treats a refusal as no rewrite (and caches it)", async () => {
    const { ai } = await upstream({}, () => claude(null, "refusal"));
    const body = (await (await get("/api/search?q=" + encodeURIComponent(q), aiEnv())).json()) as Body;
    expect(body).toEqual({ results: [], didYouMean: false });
    expect(logs).toContainEqual(["ai_rewrite", "refusal"]);
    await get("/api/search?q=" + encodeURIComponent(q), aiEnv());
    expect(ai).toHaveLength(1);
  });

  it.each([
    [429, "api_rate_limited"],
    [500, "api_error_500"],
    [401, "api_error_401"],
  ])("falls back on HTTP %i with a redacted log", async (status, word) => {
    await upstream({}, () => jsonRes({ type: "error", error: { type: "x", message: "boom" } }, status));
    const res = await get("/api/search?q=" + encodeURIComponent(q), aiEnv());
    expect(res.status).toBe(200);
    expect(((await res.json()) as Body).results).toEqual([]);
    expect(logs).toContainEqual(["ai_rewrite", word]);
    noQueryInLogs(q, KEY);
  });

  it("falls back on a connection error and on malformed output", async () => {
    await upstream({}, () => {
      throw new TypeError("network down");
    });
    expect((await get("/api/search?q=zzz1", aiEnv())).status).toBe(200);
    expect(logs).toContainEqual(["ai_rewrite", "connection"]);
    resetMemoryCache();
    vi.restoreAllMocks();
    logs = [];
    vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void logs.push(a));
    await upstream({}, () => claude({ nope: true }));
    expect((await get("/api/search?q=zzz2", aiEnv())).status).toBe(200);
    expect(logs.some((l) => l[0] === "ai_rewrite")).toBe(true);
    noQueryInLogs("zzz1", "zzz2");
  });

  it("per-client limit: 20 rewrites per hour, then plain results", async () => {
    const { ai } = await upstream({}, () => claude({ terms: ["Nowhere"], confidence: "low" }));
    const ip = { "CF-Connecting-IP": "198.51.100.9" };
    for (let i = 0; i < LIMITS.aiRewrite.max + 1; i++) {
      expect((await get(`/api/search?q=unknown-place-${i}`, aiEnv(), ip)).status).toBe(200);
    }
    expect(ai).toHaveLength(LIMITS.aiRewrite.max);
    expect(logs).toContainEqual(["ai_rewrite", "rate_limited"]);
    // Another client is not affected.
    await get("/api/search?q=unknown-place-x", aiEnv(), { "CF-Connecting-IP": "198.51.100.10" });
    expect(ai).toHaveLength(LIMITS.aiRewrite.max + 1);
  });

  it("global daily cap (AI_DAILY_CAP): over the cap → plain results", async () => {
    const { ai } = await upstream({}, () => claude({ terms: ["Nowhere"], confidence: "low" }));
    await get("/api/search?q=capped-1", aiEnv({ AI_DAILY_CAP: "2" }));
    await get("/api/search?q=capped-2", aiEnv({ AI_DAILY_CAP: "2" }));
    await get("/api/search?q=capped-3", aiEnv({ AI_DAILY_CAP: "2" }));
    expect(ai).toHaveLength(2);
    expect(logs).toContainEqual(["ai_rewrite", "over_cap"]);
  });

  it("fixture mode never calls Claude (nor OneMap)", async () => {
    const { ai, oneMap } = await upstream({}, () => claude(rewrite));
    const res = await get("/api/search?q=nothing-matches-this", aiEnv({ FIXTURE_MODE: "1" }));
    expect(res.status).toBe(200);
    expect(ai).toHaveLength(0);
    expect(oneMap).toHaveLength(0);
  });
});

describe("voice alternatives (&alt=)", () => {
  it("tries the other alternatives (alias/OneMap only) when the best one finds < 2", async () => {
    const { ai, oneMap } = await upstream({ "Tan Tock Seng Hospital": ["TAN TOCK SENG HOSPITAL", "TAN TOCK SENG HOSPITAL MEDICAL CENTRE"] }, () => claude({ terms: ["X"], confidence: "low" }));
    const res = await get("/api/search?q=tank%20talk%20sang&alt=tan%20tock%20seng&alt=ten%20talk%20sing", aiEnv());
    const body = (await res.json()) as Body;
    expect(body.usedAlternative).toBe("tan tock seng");
    expect(body.results.map((r) => r.via)).toEqual(["alias", "alias"]);
    expect(ai).toHaveLength(0);
    expect(oneMap).not.toContain("ten talk sing"); // stopped once there were 2 results
  });

  it("makes at most ONE Claude call per voice query, using the best alternative", async () => {
    const { ai } = await upstream({}, () => claude({ terms: ["Nowhere"], confidence: "low" }));
    await get("/api/search?q=best%20guess&alt=second%20guess&alt=third%20guess&alt=fourth%20ignored", aiEnv());
    expect(ai).toHaveLength(1);
    expect(ai[0]!.body.messages).toEqual([{ role: "user", content: "best guess" }]);
  });
});

describe("/api/health ai", () => {
  const ai = async (e: E) => ((await (await get("/api/health", e)).json()) as { ai: string }).ai;
  it("on with a key, off without, off in fixture mode, off with cap 0", async () => {
    expect(await ai(aiEnv())).toBe("on");
    expect(await ai(env)).toBe("off");
    expect(await ai(aiEnv({ FIXTURE_MODE: "1" }))).toBe("off");
    expect(await ai(aiEnv({ AI_DAILY_CAP: "0" }))).toBe("off");
    const text = await (await get("/api/health", aiEnv())).text();
    expect(text).not.toContain(KEY);
  });
});

describe("1.1 UI fields: two-step (step=1), alias display, one guess", () => {
  type UiBody = Body & { alias?: { zh?: string; en: string }; guess?: string; assist?: boolean };
  const read = async (path: string, e: E) => (await (await get(path, e)).json()) as UiBody;

  it("step=1 answers Layer 1 only: assist true when < 2 hits and the extra help is on; never calls Claude", async () => {
    const { ai } = await upstream({ "step one nothing": [] }, () => claude({ terms: ["X"], confidence: "low" }));
    const on = await read("/api/search?step=1&q=step%20one%20nothing", aiEnv());
    expect(on.assist).toBe(true);
    expect(on.results).toEqual([]);
    expect(ai).toHaveLength(0);
    expect((await read("/api/search?step=1&q=step%20one%20nothing", env)).assist).toBe(false); // no key
    expect((await read("/api/search?step=1&q=step%20one%20nothing", aiEnv({ AI_DAILY_CAP: "0" }))).assist).toBe(false);
    expect(ai).toHaveLength(0);
  });

  it("step=1 with 2+ hits: assist false; the full request (no step) carries no assist field", async () => {
    await upstream({ "two plain": ["TWO PLAIN 1", "TWO PLAIN 2"] });
    expect((await read("/api/search?step=1&q=two%20plain", aiEnv())).assist).toBe(false);
    expect(await read("/api/search?q=two%20plain", aiEnv())).not.toHaveProperty("assist");
  });

  it("alias of one place found by it → alias {zh, en}; a two-place alias (AMK) → none", async () => {
    await upstream({ "KK Women's and Children's Hospital": ["KK WOMEN'S AND CHILDREN'S HOSPITAL"] }, undefined, ["KKH"]);
    const kkh = await read("/api/search?q=KKH", env);
    expect(kkh.alias).toEqual({ zh: "竹脚妇幼医院", en: "KK Women's and Children's Hospital" });
    await upstream({ "Ang Mo Kio MRT Station": ["ANG MO KIO MRT STATION"] }, undefined, ["amk", "Ang Mo Kio Bus Interchange"]);
    expect(await read("/api/search?q=amk", env)).not.toHaveProperty("alias");
  });

  it("alias that finds nothing on OneMap → no alias line", async () => {
    await upstream({}, undefined, ["KKH", "KK Women's and Children's Hospital"]);
    expect(await read("/api/search?q=KKH", env)).not.toHaveProperty("alias");
  });

  it("the extra help with hits for exactly one term → guess = that term, didYouMean false", async () => {
    const q = "zzz one guess query";
    await upstream({ "Tan Tock Seng Hospital": ["TAN TOCK SENG HOSPITAL"] }, () => claude({ terms: ["Tan Tock Seng Hospital", "Nowhere Real"], confidence: "medium" }), [q, "Nowhere Real"]);
    const body = await read("/api/search?q=" + encodeURIComponent(q), aiEnv());
    expect(body.didYouMean).toBe(false);
    expect(body.guess).toBe("Tan Tock Seng Hospital");
    expect(body.results.map((r) => r.via)).toEqual(["ai"]);
  });
});
