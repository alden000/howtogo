/** AC 18: log lines never contain coordinates, search text, tokens, credentials or IPs. */
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryCache } from "../src/cache";
import { TOKEN_KV_KEY, resetTokenCache } from "../src/onemap";
import { resetRateLimit } from "../src/ratelimit";
import { call, jsonRes, stubFetch, tokenResponse } from "./helpers";

const lines: string[] = [];
beforeEach(async () => {
  lines.length = 0;
  resetMemoryCache();
  resetTokenCache();
  resetRateLimit();
  await env.TOKEN_KV.delete(TOKEN_KV_KEY);
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a) ?? String(a))).join(" "));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

const IP = "203.0.113.77";
const SECRET_TOKEN = "tok-SECRET-123";
const QUERY = "Blk 123 Secret Lane";
const LAT = "1.351019";
const LNG = "103.850057";

function assertClean() {
  expect(lines.length).toBeGreaterThan(0); // the scenarios below do log
  for (const line of lines) {
    expect(line).not.toMatch(/\b1\.\d{3,}/); // latitude-like
    expect(line).not.toMatch(/\b10[34]\.\d{2,}/); // longitude-like
    expect(line).not.toContain(IP);
    expect(line).not.toContain(SECRET_TOKEN);
    expect(line).not.toContain("s3cret-pass");
    expect(line).not.toContain("test@example.com");
    expect(line).not.toContain("lta-test-key");
    expect(line.toLowerCase()).not.toContain("secret lane");
  }
}

describe("AC 18 log-line test", () => {
  it("upstream errors, token failures, 401 retries and rate limits log no private data", async () => {
    const h = { headers: { "CF-Connecting-IP": IP } };
    // token renewal fails
    stubFetch((u) => (u.pathname.includes("getToken") ? jsonRes({ error: SECRET_TOKEN }, 500) : jsonRes({}, 200)));
    await call(`/api/route?start=${LAT},${LNG}&end=1.30008,103.84552&time=10:00:00&date=11-17-2026`, h);
    vi.mocked(globalThis.fetch).mockRestore();
    // 401 then upstream 500 on route and search, with an echoing body
    stubFetch((u) =>
      u.pathname.includes("getToken")
        ? tokenResponse(SECRET_TOKEN)
        : jsonRes({ echo: `${QUERY} ${LAT},${LNG} ${SECRET_TOKEN}` }, u.pathname.includes("route") ? 401 : 500),
    );
    await call(`/api/route?start=${LAT},${LNG}&end=1.30008,103.84552&time=10:01:00&date=11-17-2026`, h);
    await call(`/api/search?q=${encodeURIComponent(QUERY)}`, h);
    await call(`/api/revgeocode?lat=${LAT}&lng=${LNG}`, h);
    await call("/api/bus-arrival?stop=53009", h);
    await call("/api/alerts", h);
    // rate limit
    for (let i = 0; i < 62; i++) await call(`/api/search?q=${encodeURIComponent(QUERY)}`, h);
    assertClean();
  });
});
