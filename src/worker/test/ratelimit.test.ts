import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryCache } from "../src/cache";
import { RATE_LIMIT, checkRateLimit, resetRateLimit, trackedClients } from "../src/ratelimit";
import { TOKEN_KV_KEY, resetTokenCache } from "../src/onemap";
import bishan from "./fixtures/onemap-search-bishan.json";
import { call, jsonRes, stubFetch } from "./helpers";

beforeEach(async () => {
  resetRateLimit();
  resetMemoryCache();
  resetTokenCache();
  await env.TOKEN_KV.put(TOKEN_KV_KEY, JSON.stringify({ token: "tok-A", expiresAt: Date.now() + 48 * 3600_000 }));
});
afterEach(() => vi.restoreAllMocks());

const ip = (a: string) => ({ headers: { "CF-Connecting-IP": a } });

describe("AC 20 per-IP rate limit", () => {
  it("is 60 requests per minute", () => {
    expect(RATE_LIMIT).toEqual({ max: 60, windowMs: 60_000 });
  });

  it("sliding window: the 61st request in a minute waits, then frees up", async () => {
    const t = 1_000_000;
    for (let i = 0; i < 60; i++) expect(await checkRateLimit("203.0.113.9", t + i * 100)).toBeNull();
    expect(await checkRateLimit("203.0.113.9", t + 30_000)).toBe(30);
    expect(await checkRateLimit("198.51.100.1", t + 30_000)).toBeNull(); // other IPs unaffected
    expect(await checkRateLimit("203.0.113.9", t + 60_001)).toBeNull(); // oldest hit left the window
  });

  it("forgets a client's hits once the window has passed", async () => {
    for (let i = 0; i < 60; i++) await checkRateLimit("203.0.113.9", 0);
    expect(trackedClients()).toBe(1);
    for (let i = 0; i < 60; i++) expect(await checkRateLimit("203.0.113.9", 60_001)).toBeNull();
    expect(trackedClients()).toBe(1);
  });

  it("answers 429 rate_limited with Retry-After on /api/*, never calling upstream again", async () => {
    const { calls } = stubFetch(() => jsonRes(bishan));
    for (let i = 0; i < 60; i++) {
      const r = await call(`/api/search?q=bishan${i % 3}`, ip("203.0.113.7"));
      expect(r.status).toBe(200);
    }
    const before = calls.length;
    const res = await call("/api/route?start=1.35,103.85&end=1.30,103.84", ip("203.0.113.7"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
    expect(calls.length).toBe(before);
    expect((await call("/api/search?q=bishan0", ip("203.0.113.8"))).status).toBe(200);
  });

  it("does not limit health or live-share endpoints", async () => {
    for (let i = 0; i < 61; i++) await checkRateLimit("203.0.113.7");
    expect((await call("/api/health", ip("203.0.113.7"))).status).toBe(200);
    expect((await call("/api/share/aaaaaaaaaaaa", ip("203.0.113.7"))).status).not.toBe(429);
  });
});
