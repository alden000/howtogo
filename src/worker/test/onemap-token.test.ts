import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryCache } from "../src/cache";
import { TOKEN_KV_KEY, getOneMapToken, parseExpiry, resetTokenCache } from "../src/onemap";
import route from "./fixtures/onemap-route.json";
import { call, jsonRes, stubFetch, tokenResponse } from "./helpers";

let n = 0;
/** Unique minute per test so the route cache never hides upstream calls. */
const routePath = () => {
  n++;
  const mm = String(n % 60).padStart(2, "0");
  return `/api/route?start=1.351019,103.850057&end=1.30008,103.84552&date=11-17-2026&time=09:${mm}:00&mode=TRANSIT`;
};
const isToken = (u: URL) => u.pathname === "/api/auth/post/getToken";
const isRoute = (u: URL) => u.pathname === "/api/public/routingsvc/route";

beforeEach(async () => {
  resetTokenCache();
  resetMemoryCache();
  await env.TOKEN_KV.delete(TOKEN_KV_KEY);
});
afterEach(() => vi.restoreAllMocks());

describe("OneMap token manager", () => {
  it("fetches a token with email+password, caches it in memory and KV", async () => {
    const { calls } = stubFetch((u) => (isToken(u) ? tokenResponse("tok-A") : jsonRes(route)));
    expect(await getOneMapToken(env)).toBe("tok-A");
    expect(await getOneMapToken(env)).toBe("tok-A");
    const tokenCalls = calls.filter((c) => isToken(c.url));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(tokenCalls[0]!.body!)).toEqual({ email: "test@example.com", password: "s3cret-pass" });
    const stored = await env.TOKEN_KV.get<{ token: string; expiresAt: number }>(TOKEN_KV_KEY, "json");
    expect(stored?.token).toBe("tok-A");
  });

  it("dedupes concurrent renewals", async () => {
    const { calls } = stubFetch(() => tokenResponse("tok-A"));
    const tokens = await Promise.all([getOneMapToken(env), getOneMapToken(env), getOneMapToken(env)]);
    expect(tokens).toEqual(["tok-A", "tok-A", "tok-A"]);
    expect(calls).toHaveLength(1);
  });

  it("reuses a KV token with plenty of time left (cold isolate)", async () => {
    await env.TOKEN_KV.put(TOKEN_KV_KEY, JSON.stringify({ token: "kv-tok", expiresAt: Date.now() + 48 * 3600_000 }));
    const { calls } = stubFetch(() => tokenResponse("new"));
    expect(await getOneMapToken(env)).toBe("kv-tok");
    expect(calls).toHaveLength(0);
  });

  it("renews when less than 6 h are left", async () => {
    await env.TOKEN_KV.put(TOKEN_KV_KEY, JSON.stringify({ token: "old", expiresAt: Date.now() + 5 * 3600_000 }));
    const { calls } = stubFetch(() => tokenResponse("new"));
    expect(await getOneMapToken(env)).toBe("new");
    expect(calls).toHaveLength(1);
  });

  it("falls back to a not-yet-expired token if renewal fails", async () => {
    await env.TOKEN_KV.put(TOKEN_KV_KEY, JSON.stringify({ token: "old", expiresAt: Date.now() + 5 * 3600_000 }));
    stubFetch(() => jsonRes({ error: "down" }, 500));
    expect(await getOneMapToken(env)).toBe("old");
  });

  it("parses expiry in seconds or ms", () => {
    expect(parseExpiry("1763400000", 0)).toBe(1763400000_000);
    expect(parseExpiry(1763400000_000, 0)).toBe(1763400000_000);
    expect(parseExpiry(undefined, 1000)).toBe(1000 + 86_400_000);
  });
});

describe("OneMap 401 retry via /api/route", () => {
  it("sends the token raw in Authorization, renews once on 401 and retries", async () => {
    let issued = 0;
    const { calls } = stubFetch((u, _i, req) => {
      if (isToken(u)) return tokenResponse(++issued === 1 ? "tok-A" : "tok-B");
      if (isRoute(u)) return req.headers.get("Authorization") === "tok-B" ? jsonRes(route) : jsonRes({ error: "Unauthorized" }, 401);
      return jsonRes({}, 404);
    });
    const res = await call(routePath());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(route); // raw pass-through
    const routeCalls = calls.filter((c) => isRoute(c.url));
    expect(routeCalls.map((c) => c.headers.get("Authorization"))).toEqual(["tok-A", "tok-B"]);
    expect(calls.filter((c) => isToken(c.url))).toHaveLength(2);
  });

  it("gives up after one retry with 502 upstream_unavailable and leaks nothing", async () => {
    const { calls } = stubFetch((u) =>
      isToken(u) ? tokenResponse("tok-secret") : jsonRes({ error: "bad token tok-secret for test@example.com" }, 401),
    );
    const res = await call(routePath());
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe("upstream_unavailable");
    expect(text).not.toMatch(/tok-secret|s3cret|example\.com/);
    expect(calls.filter((c) => isRoute(c.url))).toHaveLength(2);
  });

  it("token endpoint failure → 502 without echoing the body", async () => {
    stubFetch((u) => (isToken(u) ? jsonRes({ error: "wrong password s3cret-pass" }, 401) : jsonRes(route)));
    const res = await call(routePath());
    expect(res.status).toBe(502);
    expect(await res.text()).not.toMatch(/s3cret/);
  });
});
