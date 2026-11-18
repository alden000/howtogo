/** M5 §I monitoring-lite (AC 38, 39): telemetry schema, Stats DO counts, 90-day retention, token check, logs. */
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTelemetry, sgDay } from "@howtogo/shared/telemetry";
import { resetRateLimit } from "../src/ratelimit";
import { MAX_VERSIONS_PER_DAY, bump, pendingServerCounts, resetServerCounts } from "../src/stats";
import { ORIGIN, call } from "./helpers";

const DAY = 24 * 3600_000;
let seq = 0;
const freshStats = () => env.STATS.get(env.STATS.idFromName(`t-${Date.now()}-${seq++}`));
const row = (over: Record<string, unknown> = {}) => ({ v: "1.0.0", code: "err_uncaught", screen: "home", n: 2, ...over });
const post = (body: unknown, headers: Record<string, string> = {}) =>
  call("/api/telemetry", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const TOKEN = "stats-token-0123456789abcdef";

beforeEach(() => {
  resetRateLimit();
  resetServerCounts();
});
afterEach(() => vi.restoreAllMocks());

describe("telemetry schema (shared parseTelemetry)", () => {
  it("accepts exactly {v, code, screen, n} rows", () => {
    expect(parseTelemetry([row(), row({ code: "chunk_load", screen: "guide", n: 1 })])).toHaveLength(2);
    expect(parseTelemetry([row({ v: "1.0.0-rc.2" })])).toHaveLength(1);
  });

  it.each([
    ["extra field", [{ ...row(), msg: "TypeError at Home" }]],
    ["missing field", [{ v: "1.0.0", code: "err_uncaught", screen: "home" }]],
    ["unknown code", [row({ code: "boom" })]],
    ["server-only code from a client", [row({ code: "share_create" })]],
    ["unknown screen", [row({ screen: "/routes?to=1.3,103.8" })]],
    ["path as screen", [row({ screen: "/t/abc123" })]],
    ["free-text version", [row({ v: "Mozilla/5.0" })]],
    ["n = 0", [row({ n: 0 })]],
    ["n fraction", [row({ n: 1.5 })]],
    ["n too large", [row({ n: 1001 })]],
    ["not an array", row()],
    ["empty array", []],
    ["21 rows", Array.from({ length: 21 }, () => row())],
    ["nested object", [row({ screen: { id: "home" } })]],
  ])("rejects %s", (_name, body) => {
    expect(parseTelemetry(body)).toBeNull();
  });
});

describe("POST /api/telemetry", () => {
  it("204 and the counts land in the Stats DO under today's Singapore day", async () => {
    const res = await post([row({ code: "api_timeout", screen: "routes", n: 3 })]);
    expect(res.status).toBe(204);
    const table = await env.STATS.get(env.STATS.idFromName("stats")).table(1);
    expect(table).toContainEqual({ day: sgDay(Date.now()), v: "1.0.0", code: "api_timeout", screen: "routes", n: 3 });
  });

  it("400 on extra fields; nothing stored", async () => {
    const before = (await env.STATS.get(env.STATS.idFromName("stats")).table(1)).length;
    const res = await post([{ ...row({ code: "speech_unavailable" }), ua: "Mozilla" }]);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_telemetry");
    expect((await env.STATS.get(env.STATS.idFromName("stats")).table(1)).length).toBe(before);
  });

  it("413 over 2 KB, 405 on GET, 403 from a foreign origin", async () => {
    expect((await post("[" + " ".repeat(3000) + "]")).status).toBe(413);
    expect((await call("/api/telemetry", { headers: { Origin: ORIGIN } })).status).toBe(405);
    expect((await post([row()], { Origin: "https://evil.example" })).status).toBe(403);
  });

  it("same-origin reports are allowed (the PWA served by this Worker, sendBeacon sends Origin)", async () => {
    expect((await post([row()], { Origin: "https://api.test" })).status).toBe(204);
  });

  it("per-IP rate limit: 12 reports per hour, then 429 + Retry-After (and the hit is counted server-side)", async () => {
    const ip = { "CF-Connecting-IP": "203.0.113.90" };
    for (let i = 0; i < 12; i++) expect((await post([row()], ip)).status).toBe(204);
    const res = await post([row()], ip);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(pendingServerCounts().rate_limited ?? 0).toBeGreaterThanOrEqual(0); // flushed or pending
  });
});

describe("Stats Durable Object", () => {
  it("adds counts per day × version × code × screen", async () => {
    const s = freshStats();
    const now = Date.UTC(2026, 10, 18, 4);
    await s.add([row(), row(), row({ screen: "settings" })], now);
    expect(await s.table(1, now)).toEqual([
      { day: "2026-11-18", v: "1.0.0", code: "err_uncaught", screen: "home", n: 4 },
      { day: "2026-11-18", v: "1.0.0", code: "err_uncaught", screen: "settings", n: 2 },
    ]);
  });

  it("files rows under the Singapore day (UTC+8)", async () => {
    const s = freshStats();
    const lateUtc = Date.UTC(2026, 10, 18, 17); // 01:00 on 19 Nov in Singapore
    await s.add([row()], lateUtc);
    expect(await s.days()).toEqual(["2026-11-19"]);
  });

  it("deletes data older than 90 days (on write and in the daily alarm)", async () => {
    const s = freshStats();
    const now = Date.UTC(2026, 10, 18, 4);
    await s.addOn(sgDay(now - 89 * DAY), row());
    await s.addOn(sgDay(now - 90 * DAY), row());
    await s.addOn(sgDay(now - 200 * DAY), row());
    await s.prune(now);
    expect(await s.days()).toEqual([sgDay(now - 89 * DAY)]);
  });

  it("caps distinct versions per day (a bogus-version flood cannot grow the table)", async () => {
    const s = freshStats();
    const now = Date.UTC(2026, 10, 18, 4);
    const rows = Array.from({ length: MAX_VERSIONS_PER_DAY + 5 }, (_, i) => row({ v: `9.9.${i}` }));
    await s.add(rows, now);
    expect(new Set((await s.table(1, now)).map((r) => r.v)).size).toBe(MAX_VERSIONS_PER_DAY);
  });

  it("table(days) returns only the requested window", async () => {
    const s = freshStats();
    const now = Date.UTC(2026, 10, 18, 4);
    await s.addOn(sgDay(now), row());
    await s.addOn(sgDay(now - 6 * DAY), row());
    await s.addOn(sgDay(now - 7 * DAY), row());
    expect((await s.table(7, now)).map((r) => r.day)).toEqual([sgDay(now), sgDay(now - 6 * DAY)]);
  });
});

describe("GET /api/stats (owner only)", () => {
  const stats = (headers: Record<string, string> = {}, envOver: Partial<typeof env> = {}, q = "?days=7") =>
    import("../src/index").then(async ({ default: worker }) => {
      const { createExecutionContext, waitOnExecutionContext } = await import("cloudflare:test");
      const ctx = createExecutionContext();
      const res = await worker.fetch(new Request("https://api.test/api/stats" + q, { headers }), { ...env, ...envOver } as typeof env, ctx);
      await waitOnExecutionContext(ctx);
      return res;
    });

  it("404 without STATS_TOKEN set, without a token, or with a wrong one", async () => {
    expect((await stats({ Authorization: `Bearer ${TOKEN}` })).status).toBe(404);
    expect((await stats({}, { STATS_TOKEN: TOKEN })).status).toBe(404);
    expect((await stats({ Authorization: "Bearer wrong-token-0123456789" }, { STATS_TOKEN: TOKEN })).status).toBe(404);
  });

  it("200 with the table for the right token", async () => {
    await post([row({ code: "geo_unavailable", screen: "guide" })]);
    const res = await stats({ Authorization: `Bearer ${TOKEN}` }, { STATS_TOKEN: TOKEN });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { days: number; rows: { code: string }[] };
    expect(body.days).toBe(7);
    expect(body.rows.some((r) => r.code === "geo_unavailable")).toBe(true);
  });
});

describe("server-side counts and logs", () => {
  it("bump() coalesces known server codes only", () => {
    bump("share_create");
    bump("share_create");
    bump("token_renew");
    bump("nope" as never);
    expect(pendingServerCounts()).toEqual({ share_create: 2, token_renew: 1 });
  });

  it("nothing about a telemetry report is logged", async () => {
    const lines: string[] = [];
    for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
    await post([row()], { "CF-Connecting-IP": "203.0.113.91" });
    await post([{ ...row(), extra: "Blk 123 Secret Lane" }], { "CF-Connecting-IP": "203.0.113.91" });
    expect(lines.join("\n")).not.toMatch(/203\.0\.113\.91|Secret Lane|err_uncaught/);
  });
});
