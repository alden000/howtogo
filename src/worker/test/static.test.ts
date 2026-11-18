import { describe, expect, it } from "vitest";
import { HEADER_RULES } from "../src/generated/assets";
import { type EmbeddedAsset, serveEmbedded } from "../src/static";
import { call } from "./helpers";

// Exactly the CSP in src/web/public/_headers (the embedded rules are parsed from it at build time).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https://www.onemap.gov.sg; connect-src 'self' wss://howtogo.raus-ums.workers.dev wss://howtogo.wwweeeiii.com https://www.onemap.gov.sg; worker-src 'self' blob:; child-src blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";
const IMMUTABLE = "public, max-age=31536000, immutable";

const text = (body: string, contentType: string, etag: string): EmbeddedAsset => ({ body, base64: false, contentType, etag });
const ASSETS: Record<string, EmbeddedAsset> = {
  "/index.html": text("<!doctype html><title>怎么去?</title>", "text/html; charset=utf-8", '"idx"'),
  "/sw.js": text("self.addEventListener('fetch',()=>{})", "text/javascript; charset=utf-8", '"sw"'),
  "/manifest.webmanifest": text("{}", "application/manifest+json; charset=utf-8", '"mf"'),
  "/assets/index-AbC123.js": text("console.log(1)", "text/javascript; charset=utf-8", '"js"'),
  // 1x1 PNG header bytes
  "/favicon-32.png": { body: btoa("\x89PNG\r\n\x1a\n"), base64: true, contentType: "image/png", etag: '"png"' },
};

const get = (path: string, init: RequestInit = {}) => serveEmbedded(new Request("https://howtogo.test" + path, init), ASSETS, HEADER_RULES);

describe("embedded static serving (preview, no [assets])", () => {
  it("/ serves index.html with no-cache + all security headers incl. CSP", async () => {
    const res = get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toContain("怎么去?");
    const h = res.headers;
    expect(h.get("Cache-Control")).toBe("no-cache");
    expect(h.get("Content-Security-Policy")).toBe(CSP);
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("X-Frame-Options")).toBe("DENY");
    expect(h.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(h.get("Permissions-Policy")).toBe("geolocation=(self), camera=(), microphone=(), payment=()");
    expect(h.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(h.get("ETag")).toBe('"idx"');
  });

  it("exact paths: hashed asset immutable, entry points no-cache, binary decoded", async () => {
    const js = get("/assets/index-AbC123.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("Cache-Control")).toBe(IMMUTABLE);
    expect(js.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(js.headers.get("Content-Security-Policy")).toBe(CSP);
    expect(await js.text()).toBe("console.log(1)");
    for (const p of ["/sw.js", "/index.html", "/manifest.webmanifest"]) expect(get(p).headers.get("Cache-Control")).toBe("no-cache");
    const png = get("/favicon-32.png");
    expect(png.headers.get("Content-Type")).toBe("image/png");
    expect(png.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect([...new Uint8Array(await png.arrayBuffer())].slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("SPA fallback: extensionless unknown paths get index.html", async () => {
    for (const p of ["/settings", "/routes/abc", "/about/"]) {
      const res = get(p);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<title>怎么去?</title>");
      expect(res.headers.get("Content-Security-Policy")).toBe(CSP);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    }
  });

  it("404 for a missing file with an extension, and for _headers / _redirects", async () => {
    for (const p of ["/assets/index-gone.js", "/nope.png", "/_headers", "/_redirects"]) {
      const res = get(p);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain("Cache-Control");
    }
  });

  it("If-None-Match → 304 with headers and no body; HEAD has no body; POST → 405", async () => {
    const res = get("/assets/index-AbC123.js", { headers: { "If-None-Match": 'W/"x", "js"' } });
    expect(res.status).toBe(304);
    expect(res.body).toBeNull();
    expect(res.headers.get("ETag")).toBe('"js"');
    expect(res.headers.get("Cache-Control")).toBe(IMMUTABLE);
    expect(get("/assets/index-AbC123.js", { headers: { "If-None-Match": '"other"' } }).status).toBe(200);
    const head = get("/sw.js", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(get("/", { method: "POST" }).status).toBe(405);
  });
});

describe("Worker routing with the embedded build", () => {
  it("/api/* still goes to the API (JSON, API headers), not the PWA", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, fixtureMode: false });
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    const nf = await call("/api/nope");
    expect(nf.status).toBe(404);
    expect(((await nf.json()) as { error: { code: string } }).error.code).toBe("not_found");
    expect((await call("/api")).headers.get("Content-Type")).toMatch(/application\/json/);
  });

  it("static paths are served by the embedded map (no origin check), _headers never exposed", async () => {
    const hdr = await call("/_headers");
    expect(hdr.status).toBe(404);
    expect(await hdr.text()).not.toMatch(/Content-Security-Policy/);
    const missing = await call("/assets/missing.js", { headers: { Origin: "https://evil.example" } });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Content-Security-Policy")).toBe(CSP);
  });
});
