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
    await call("/api/lifts", h);
    // rate limit
    for (let i = 0; i < 62; i++) await call(`/api/search?q=${encodeURIComponent(QUERY)}`, h);
    assertClean();
  });
});

describe("M4 AC 49: a full share + setup run logs no identifiers", () => {
  it("no share id, owner token, setup code, ciphertext, phone, names or coordinates in any log line", async () => {
    const h = { "CF-Connecting-IP": IP, "Content-Type": "application/json" };
    const secrets: string[] = [IP, "+6591234567", "陈太太", "Tan Tock Seng"];
    // force an internal log line too (upstream error) so the capture is known to work
    stubFetch(() => jsonRes({}, 500));
    await call("/api/lifts", { headers: h });
    const created = (await (
      await call("/api/share", {
        method: "POST",
        headers: h,
        body: JSON.stringify({ destName: "Tan Tock Seng Hospital", senderName: "陈太太", senderPhone: "+6591234567" }),
      })
    ).json()) as { id: string; ownerToken: string };
    secrets.push(created.id, created.ownerToken);
    const auth = { ...h, Authorization: `Bearer ${created.ownerToken}` };
    const body = (status: string) => JSON.stringify({ lat: 1.351019, lng: 103.850057, acc: 9, status, updatedAt: Date.now() });
    await call(`/api/share/${created.id}`, { method: "PUT", headers: auth, body: body("travelling") });
    await call(`/api/share/${created.id}`, { method: "PUT", headers: auth, body: body("travelling") }); // 429
    await call(`/api/share/${created.id}`, { method: "PUT", headers: auth, body: body("help") });
    await call(`/api/share/${created.id}`, { method: "PUT", headers: { ...h, Authorization: "Bearer wrong-token-wrong-token-xx" }, body: body("help") });
    await call(`/api/share/${created.id}`, { headers: h });
    await call(`/api/share/${created.id}`, { headers: h }); // 429
    await call(`/api/share/${created.id}`, { method: "DELETE", headers: auth });
    const ct = "Q0lQSEVSVEVYVC1vbmx5LXN5bnRoZXRpYy1jaXBoZXJ0ZXh0LWZvci1sb2dz";
    secrets.push(ct);
    const setup = (await (await call("/api/setup", { method: "POST", headers: h, body: JSON.stringify({ ct }) })).json()) as { code: string };
    secrets.push(setup.code);
    await call(`/api/setup/${setup.code}`, { headers: h });
    await call(`/api/setup/${setup.code}`, { headers: h }); // 410
    await call("/api/setup", { method: "POST", headers: h, body: JSON.stringify({ ct, k: "fragment-key-should-never-be-sent" }) });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (const s of secrets) expect(line).not.toContain(s);
      expect(line).not.toMatch(/\b1\.\d{3,}/);
      expect(line).not.toMatch(/\b10[34]\.\d{2,}/);
      expect(line).not.toContain("fragment-key");
    }
  });
});
