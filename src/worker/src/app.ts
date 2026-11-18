import type { Env } from "./env";
import { handleAlerts, handleBusArrival, handleLifts, handleRevGeocode, handleRoute, handleSearch } from "./api";
import { fixtureMode } from "./fixtures";
import { HttpError, UpstreamError, errorResponse, finalize, json, originAllowed, preflight } from "./http";
import { checkRateLimit } from "./ratelimit";
import { ltaSource } from "./lta";
import { handleCreateSetup, handleSetupByCode } from "./setup";
import { hasOneMapCredentials } from "./onemap";
import { servePage } from "./pages";
import type { EmbeddedAsset, HeaderRule } from "./static";
import { handleCreateShare, handleShareById } from "./share";
import { bump, flushStats, handleStats, handleTelemetry } from "./stats";
import { APP_VERSION } from "./version";
import { VIEWER_PATH, serveViewer } from "./viewer";

/** The embedded web build (wrangler.embed.toml path) or nothing (Workers Static Assets). */
export interface Embedded {
  assets: Record<string, EmbeddedAsset>;
  rules: HeaderRule[];
}
export const NO_EMBED: Embedded = { assets: {}, rules: [] };

/**
 * M5 AC 31: `/api/health` → `{ ok, fixtureMode, onemap, lta, version }`. `onemap` is "ok" when the
 * credentials are set ("missing" otherwise, "fixture" in fixture mode); `lta` keeps its M3 meaning
 * ("key" | "proxy" | "none"). No token expiry, no secrets.
 */
export function health(env: Env) {
  const fx = fixtureMode(env);
  return { ok: true, fixtureMode: fx, onemap: fx ? "fixture" : hasOneMapCredentials(env) ? "ok" : "missing", lta: ltaSource(env), version: APP_VERSION };
}

/** Which upstream an API path talks to (server-side stats only). */
const upstreamOf = (path: string) => (/^\/api\/(bus-arrival|alerts|lifts)$/.test(path) ? "lta" : "onemap");

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (path === "/api/share" && method === "POST") return handleCreateShare(request, env);
  const share = /^\/api\/share\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (share) return handleShareById(request, env, share[1]!, share[2]);
  if (path === "/api/telemetry") return handleTelemetry(request, env);
  if (path === "/api/stats") return handleStats(request, url, env);
  if (path === "/api/setup") {
    if (method === "POST") return handleCreateSetup(request, env);
    return errorResponse(405, "method_not_allowed", "Method not allowed.");
  }
  const setup = /^\/api\/setup\/([^/]+)$/.exec(path);
  if (setup) return handleSetupByCode(request, env, setup[1]!);

  const getRoutes: Record<string, () => Promise<Response>> = {
    "/api/search": () => handleSearch(url, env, ctx),
    "/api/route": () => handleRoute(url, env, ctx),
    "/api/revgeocode": () => handleRevGeocode(url, env, ctx),
    "/api/bus-arrival": () => handleBusArrival(url, env, ctx),
    "/api/alerts": () => handleAlerts(url, env, ctx),
    "/api/lifts": () => handleLifts(url, env, ctx),
    // D-10: the PWA shows the "Sample routes" banner when fixtureMode is true.
    "/api/health": async () => json(health(env), 200, { "Cache-Control": "no-store" }),
  };
  const h = getRoutes[path];
  if (h) {
    if (method !== "GET" && method !== "HEAD") return errorResponse(405, "method_not_allowed", "Method not allowed.");
    if (path !== "/api/health") {
      // AC 20. Share and setup endpoints are excluded here: they have their own limits (M4 AC 47), and
      // a "help" share update must never be blocked (D-7).
      const wait = await checkRateLimit(request.headers.get("CF-Connecting-IP"));
      if (wait !== null) {
        return errorResponse(429, "rate_limited", "Too many requests. Please wait a moment and try again.", {
          "Retry-After": String(wait),
        });
      }
    }
    return h();
  }
  if (path === "/api/share") return errorResponse(405, "method_not_allowed", "Method not allowed.");
  return errorResponse(404, "not_found", "Not found.");
}

/**
 * The Worker. `src/index.ts` (static assets, default) passes NO_EMBED so the bundle never carries the
 * build; `src/index.embed.ts` (opt-in, wrangler.embed.toml) passes the generated asset map.
 */
export function createWorker(embedded: Embedded) {
  return {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    // M4 family viewer page: /t/:id → viewer.html with its own headers (noindex, no-referrer, CSP).
    if (VIEWER_PATH.test(pathname) && (request.method === "GET" || request.method === "HEAD")) {
      return serveViewer(request, env, embedded);
    }
    if (pathname !== "/api" && !pathname.startsWith("/api/")) {
      // Static PWA (M5 AC 5/32/34): Workers Static Assets (wrangler.toml [assets]; every path except the
      // hashed /assets/* runs the Worker first) or the embedded build (wrangler.embed.toml), always with
      // the per-origin page headers and, in production, the workers.dev → custom-domain redirect.
      return servePage(request, env, embedded);
    }
    if (request.method === "OPTIONS") return preflight(request, env);
    if (!originAllowed(request, env)) {
      return finalize(errorResponse(403, "origin_not_allowed", "This website is not allowed to use the service."), request, env);
    }
    let res: Response;
    const path = pathname.replace(/\/+$/, "") || "/";
    try {
      res = await route(request, env, ctx);
    } catch (err) {
      if (err instanceof UpstreamError) bump(`up_${upstreamOf(path)}_${err.kind}`);
      if (err instanceof HttpError) {
        res = errorResponse(err.status, err.code, err.message, err.headers);
      } else {
        // Log only the error class, never request details (coordinates, tokens, IPs).
        console.error("internal_error", err instanceof Error ? err.name : "unknown");
        res = errorResponse(500, "internal_error", "Something went wrong. Please try again.");
      }
    }
    // M5 AC 39: server-side counts (no request details).
    if (res.status === 429) bump("rate_limited");
    else if (path === "/api/share" && request.method === "POST" && res.status === 201) bump("share_create");
    else if (/^\/api\/share\/[^/]+$/.test(path) && request.method === "DELETE" && res.ok) bump("share_end");
    flushStats(env, ctx, APP_VERSION);
    return finalize(res, request, env);
  },
} satisfies ExportedHandler<Env>;
}
