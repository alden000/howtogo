import type { Env } from "./env";
import { handleAlerts, handleBusArrival, handleRevGeocode, handleRoute, handleSearch } from "./api";
import { fixtureMode } from "./fixtures";
import { HttpError, errorResponse, finalize, json, originAllowed, preflight } from "./http";
import { checkRateLimit } from "./ratelimit";
import { handleCreateShare, handleShareById } from "./share";

export { TripShare } from "./share";

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (path === "/api/share" && method === "POST") return handleCreateShare(request, env);
  const share = /^\/api\/share\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (share) return handleShareById(request, env, share[1]!, share[2]);

  const getRoutes: Record<string, () => Promise<Response>> = {
    "/api/search": () => handleSearch(url, env, ctx),
    "/api/route": () => handleRoute(url, env, ctx),
    "/api/revgeocode": () => handleRevGeocode(url, env, ctx),
    "/api/bus-arrival": () => handleBusArrival(url, env, ctx),
    "/api/alerts": () => handleAlerts(env, ctx),
    // D-10: the PWA shows the "Sample routes" banner when fixtureMode is true.
    "/api/health": async () => json({ ok: true, fixtureMode: fixtureMode(env) }, 200, { "Cache-Control": "no-store" }),
  };
  const h = getRoutes[path];
  if (h) {
    if (method !== "GET" && method !== "HEAD") return errorResponse(405, "method_not_allowed", "Method not allowed.");
    if (path !== "/api/health") {
      // AC 20. Share endpoints are excluded: they have their own write limit, and "help" must never be blocked (D-7).
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request, env);
    if (!originAllowed(request, env)) {
      return finalize(errorResponse(403, "origin_not_allowed", "This website is not allowed to use the service."), request, env);
    }
    let res: Response;
    try {
      res = await route(request, env, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        res = errorResponse(err.status, err.code, err.message, err.headers);
      } else {
        // Log only the error class, never request details (coordinates, tokens, IPs).
        console.error("internal_error", err instanceof Error ? err.name : "unknown");
        res = errorResponse(500, "internal_error", "Something went wrong. Please try again.");
      }
    }
    return finalize(res, request, env);
  },
} satisfies ExportedHandler<Env>;
