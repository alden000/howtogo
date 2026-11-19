/** M5 AC 5, 31, 32, 34: per-origin page headers, caching, workers.dev → custom-domain redirect, health shape. */
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import worker, { health } from "../src/index";
import { IMMUTABLE, appCsp, canonicalRedirect, isPagePath } from "../src/pages";
import type { Env } from "../src/env";

const CANON = "https://howtogo.example.sg";
const PREVIEW = "https://howtogo-preview.someone.workers.dev";
const PROD_DEV = "https://howtogo.someone.workers.dev";

/** A stand-in for the Workers Static Assets binding: SPA fallback for page paths, typed responses. */
const fakeAssets = {
  fetch: async (input: RequestInfo | URL) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    const type = path.startsWith("/assets/") ? "text/javascript" : path === "/sw.js" ? "text/javascript" : path.endsWith(".webmanifest") ? "application/manifest+json" : path.endsWith(".json") ? "application/json" : "text/html; charset=utf-8";
    if (path.endsWith(".missing.js")) return new Response("nope", { status: 404, headers: { "Content-Type": "text/plain" } });
    // not_found_handling = "none": only "/" and real files exist; page paths fall back in the Worker.
    if (path !== "/" && !path.slice(path.lastIndexOf("/") + 1).includes(".")) return new Response("", { status: 404 });
    return new Response(type.startsWith("text/html") ? "<!doctype html><title>怎么去?</title>" : "x", { headers: { "Content-Type": type, "Set-Cookie": "a=b" } });
  },
} as unknown as Fetcher;

async function get(url: string, over: Partial<Env> = {}, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(url, init), { ...env, ASSETS: fakeAssets, ...over } as Env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("page headers on every Worker (static assets binding)", () => {
  it("HTML: per-origin CSP with this origin's wss:, no-cache, HSTS, no cookies", async () => {
    const res = await get(PREVIEW + "/settings");
    expect(res.status).toBe(200);
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("connect-src 'self' wss://howtogo-preview.someone.workers.dev https://www.onemap.gov.sg");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Permissions-Policy")).toContain("geolocation=(self)");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("Referrer-Policy: no-referrer on /setup* and /s/* (caregiver setup)", async () => {
    for (const p of ["/setup", "/setup/start", "/s/AbCdEf123456"]) expect((await get(PREVIEW + p)).headers.get("Referrer-Policy"), p).toBe("no-referrer");
  });

  it("hashed /assets/* immutable; sw.js, manifest, version.json, index.html no-cache; 404 untouched", async () => {
    expect((await get(PREVIEW + "/assets/index-AbC123.js")).headers.get("Cache-Control")).toBe(IMMUTABLE);
    for (const p of ["/sw.js", "/manifest.webmanifest", "/version.json", "/index.html", "/"]) {
      expect((await get(PREVIEW + p)).headers.get("Cache-Control"), p).toBe("no-cache");
    }
    const missing = await get(PREVIEW + "/assets/gone.missing.js");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).not.toBe(IMMUTABLE);
  });

  it("the embedded build gets the same headers (no ASSETS binding)", async () => {
    const res = await get(PREVIEW + "/", { ASSETS: undefined });
    // The test build may be empty (no dist): either the SPA page or a 404, but never immutable HTML.
    if (res.status === 200) expect(res.headers.get("Content-Security-Policy")).toContain("wss://howtogo-preview.someone.workers.dev");
    expect(res.headers.get("Cache-Control")).not.toBe(IMMUTABLE);
  });
});

describe("production: workers.dev HTML → custom domain (AC 34)", () => {
  const prod = { CANONICAL_ORIGIN: CANON } as Partial<Env>;

  it("302 for HTML pages on workers.dev, keeping path and query", async () => {
    const res = await get(PROD_DEV + "/routes?x=1", prod);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(CANON + "/routes?x=1");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await get(PROD_DEV + "/", prod)).headers.get("Location")).toBe(CANON + "/");
  });

  it("no redirect for /t/:id, /api/*, files, non-GET, the custom domain itself, or the preview (no CANONICAL_ORIGIN)", async () => {
    expect((await get(PROD_DEV + "/api/health", prod)).status).toBe(200);
    expect((await get(PROD_DEV + "/sw.js", prod)).status).toBe(200);
    expect((await get(PROD_DEV + "/manifest.webmanifest", prod)).status).toBe(200);
    expect((await get(CANON + "/routes", prod)).status).toBe(200);
    expect((await get(PREVIEW + "/routes")).status).toBe(200);
    const t = await get(PROD_DEV + "/t/AbCdEf123456", prod);
    expect(t.status).not.toBe(302);
    expect(canonicalRedirect(new Request(PROD_DEV + "/", { method: "POST" }), { ...env, ...prod } as Env)).toBeNull();
  });

  it("isPagePath: PWA routes and index.html only", () => {
    for (const p of ["/", "/routes", "/settings/", "/index.html", "/s/abc"]) expect(isPagePath(p), p).toBe(true);
    for (const p of ["/api/health", "/api", "/t/abc", "/t", "/sw.js", "/assets/a.js", "/manifest.webmanifest"]) expect(isPagePath(p), p).toBe(false);
  });

  it("appCsp: ws: on http (local dev), no upgrade-insecure-requests there", () => {
    const csp = appCsp(new URL("http://localhost:8787/"));
    expect(csp).toContain("ws://localhost:8787");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("/api/health shape (AC 31)", () => {
  it("{ ok, fixtureMode, onemap, lta, ai, version } with no token expiry or secrets", async () => {
    const res = await get("https://api.test/api/health", { ASSETS: undefined });
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["ai", "fixtureMode", "lta", "ok", "onemap", "version"]);
    expect(body).toMatchObject({ ok: true, fixtureMode: false, onemap: "ok", lta: "key", ai: "off" });
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(JSON.stringify(body)).not.toMatch(/expir|token|s3cret|lta-test-key|example\.com/i);
  });

  it("onemap: missing without credentials, fixture in fixture mode", () => {
    expect(health({ ...env, ONEMAP_EMAIL: undefined } as Env).onemap).toBe("missing");
    expect(health({ ...env, FIXTURE_MODE: "1" } as Env)).toMatchObject({ fixtureMode: true, onemap: "fixture" });
  });

  it("production without credentials answers 503 not_configured, never sample routes", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("no network in tests", { status: 599 }));
    const noCreds = { ASSETS: undefined, FIXTURE_MODE: "0", ONEMAP_EMAIL: undefined, ONEMAP_PASSWORD: undefined, LTA_ACCOUNT_KEY: undefined, LTA_PROXY: undefined } as Partial<Env>;
    const res = await get("https://api.test/api/route?start=1.3521,103.8198&end=1.3000,103.8000", noCreds);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_configured");
    expect((await get("https://api.test/api/alerts", noCreds)).status).toBe(503);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
