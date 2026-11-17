import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { HEADER_RULES } from "../src/generated/assets";
import type { Env } from "../src/env";
import type { EmbeddedAsset } from "../src/static";
import { VIEWER_PATH, serveViewer } from "../src/viewer";
import { call } from "./helpers";

const HTML =
  '<!doctype html><meta name="robots" content="noindex, nofollow"><meta property="og:title" content="家人的行程 · 怎么去? / A family member\'s trip · 怎么去?"><title>家人的行程 · 怎么去?</title>';
const ASSETS: Record<string, EmbeddedAsset> = {
  "/index.html": { body: "<!doctype html><title>app</title>", base64: false, contentType: "text/html; charset=utf-8", etag: '"idx"' },
  "/viewer.html": { body: HTML, base64: false, contentType: "text/html; charset=utf-8", etag: '"v"' },
};
const embedded = { assets: ASSETS, rules: HEADER_RULES };
const req = (path: string, origin = "https://howtogo.test") => new Request(origin + path);

describe("family viewer page /t/:id (M4 AC 17, 23, 24)", () => {
  it("matches /t/* paths only", () => {
    for (const p of ["/t/aB3dE5fG7hJ9", "/t/aB3dE5fG7hJ9/", "/t/", "/t", "/t/bad!id"]) expect(VIEWER_PATH.test(p)).toBe(true);
    for (const p of ["/trip", "/t/a/b", "/api/share/x", "/tt/x"]) expect(VIEWER_PATH.test(p)).toBe(false);
  });

  it("embedded preview: serves viewer.html with noindex, no-referrer and its own CSP", async () => {
    const res = await serveViewer(req("/t/aB3dE5fG7hJ9"), env as Env, embedded);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe(HTML);
    const h = res.headers;
    expect(h.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(h.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(h.get("Referrer-Policy")).toBe("no-referrer");
    expect(h.get("Cache-Control")).toBe("no-cache");
    const csp = h.get("Content-Security-Policy")!;
    expect(csp).toContain("connect-src 'self' wss://howtogo.test https://www.onemap.gov.sg");
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/googleapis|gstatic|analytics/);
    expect(h.get("Set-Cookie")).toBeNull();
  });

  it("an invalid id still gets the page (the page shows 'We can't find this link')", async () => {
    const res = await serveViewer(req("/t/not-a-valid-id!"), env as Env, embedded);
    expect(res.status).toBe(200);
  });

  it("local http origin gets a ws: connect-src", async () => {
    const res = await serveViewer(req("/t/abc", "http://localhost:8787"), env as Env, embedded);
    expect(res.headers.get("Content-Security-Policy")).toContain("ws://localhost:8787");
  });

  it("[assets] deploy: fetches /viewer from ASSETS and overrides its headers", async () => {
    const seen: string[] = [];
    const ASSETS_BINDING = {
      fetch: async (r: Request) => {
        seen.push(new URL(r.url).pathname);
        return new Response(HTML, { headers: { "Content-Type": "text/html", "Referrer-Policy": "strict-origin-when-cross-origin" } });
      },
    } as unknown as Fetcher;
    const res = await serveViewer(req("/t/aB3dE5fG7hJ9"), { ...(env as Env), ASSETS: ASSETS_BINDING }, embedded);
    expect(seen).toEqual(["/viewer"]);
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(await res.text()).toBe(HTML);
  });

  it("no web build → 404, never the app shell", async () => {
    const res = await serveViewer(req("/t/abc"), env as Env, { assets: {}, rules: [] });
    expect(res.status).toBe(404);
  });

  it("the Worker routes /t/* to the viewer (not the API 404)", async () => {
    const res = await call("/t/aB3dE5fG7hJ9");
    // The test build has no web dist embedded: 404 from the viewer handler, with no API error body.
    expect([200, 404]).toContain(res.status);
    expect(res.headers.get("Content-Type")).not.toContain("application/json");
  });
});
