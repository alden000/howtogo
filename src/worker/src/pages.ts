// M5 AC 5, 32, 34: every non-API response the Worker serves (Workers Static Assets or the embedded
// build) goes through here, so both Workers send the right per-origin headers whatever `_headers` says:
//  - HTML: a CSP whose connect-src names THIS origin's WebSocket (live share) instead of a hard-coded
//    host, `Cache-Control: no-cache`, Referrer-Policy no-referrer on /setup* and /s/* (caregiver setup);
//  - hashed `/assets/*`: `public, max-age=31536000, immutable`; `sw.js`, the manifest and
//    `version.json`: `no-cache`;
//  - production (`CANONICAL_ORIGIN` set): HTML pages asked for on a *.workers.dev host redirect to the
//    custom domain, except `/t/*` (family links already sent) and `/api/*`; HSTS on the custom domain.
import type { Env } from "./env";
import { serveEmbedded, type EmbeddedAsset, type HeaderRule } from "./static";

export const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_CACHE_PATHS = new Set(["/", "/index.html", "/sw.js", "/manifest.webmanifest", "/version.json"]);
export const HSTS = "max-age=31536000; includeSubDomains";

export function appCsp(url: URL): string {
  const ws = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
  return [
    "default-src 'self'",
    "script-src 'self'",
    // MapLibre sets inline style attributes and runs its workers from blob: URLs.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https://www.onemap.gov.sg",
    `connect-src 'self' ${ws} https://www.onemap.gov.sg`,
    "worker-src 'self' blob:",
    "child-src blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(url.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const lastSegmentHasDot = (path: string) => path.slice(path.lastIndexOf("/") + 1).includes(".");

/** An HTML page request (a PWA route or index.html), as opposed to a file, the API or a family link. */
export function isPagePath(path: string): boolean {
  if (path === "/api" || path.startsWith("/api/") || path === "/t" || path.startsWith("/t/")) return false;
  return path === "/index.html" || !lastSegmentHasDot(path);
}

/** AC 34: the redirect target for a workers.dev HTML page in production, or null. */
export function canonicalRedirect(request: Request, env: Env): string | null {
  const canon = env.CANONICAL_ORIGIN?.replace(/\/+$/, "");
  if (!canon || (request.method !== "GET" && request.method !== "HEAD")) return null;
  const url = new URL(request.url);
  if (url.origin === canon || !url.hostname.endsWith(".workers.dev")) return null;
  if (!isPagePath(url.pathname)) return null;
  return canon + url.pathname + url.search;
}

/** Applies the per-origin page/caching headers to a static response. */
export function withPageHeaders(res: Response, request: Request, env: Env): Response {
  if (res.status === 101) return res;
  const url = new URL(request.url);
  const path = url.pathname;
  const h = new Headers(res.headers);
  const type = h.get("Content-Type") ?? "";
  if (type.startsWith("text/html")) {
    h.set("Content-Security-Policy", appCsp(url));
    h.set("Cache-Control", "no-cache");
    h.set("X-Content-Type-Options", "nosniff");
    h.set("X-Frame-Options", "DENY");
    h.set("Permissions-Policy", "geolocation=(self), camera=(), microphone=(), payment=()");
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    h.set("Referrer-Policy", /^\/(setup|s)(\/|$)/.test(path) ? "no-referrer" : "strict-origin-when-cross-origin");
  } else if (res.status === 200 && path.startsWith("/assets/")) {
    h.set("Cache-Control", IMMUTABLE);
  }
  if (NO_CACHE_PATHS.has(path) && res.status < 400) h.set("Cache-Control", "no-cache");
  // HSTS on every HTTPS origin we answer for: the custom domain (AC 32) and workers.dev (preloaded anyway).
  if (url.protocol === "https:") h.set("Strict-Transport-Security", HSTS);
  h.delete("Set-Cookie");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

/** Static PWA: canonical redirect (production), then assets (binding or embedded) with page headers. */
export async function servePage(request: Request, env: Env, embedded: { assets: Record<string, EmbeddedAsset>; rules: HeaderRule[] }): Promise<Response> {
  const target = canonicalRedirect(request, env);
  if (target) {
    return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  let res: Response;
  if (env.ASSETS) {
    res = await env.ASSETS.fetch(request);
    // SPA fallback for page paths only ([assets] not_found_handling = "none"): files 404 for real (AC 18).
    // "/" (not "/index.html": html_handling would redirect it) is the shell.
    if (res.status === 404 && isPagePath(new URL(request.url).pathname)) {
      res = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: request.method, headers: request.headers }));
    }
  } else {
    res = serveEmbedded(request, embedded.assets, embedded.rules);
  }
  return withPageHeaders(res, request, env);
}
