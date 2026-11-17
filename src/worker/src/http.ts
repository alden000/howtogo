import type { Env } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export class UpstreamError extends HttpError {
  constructor(message = "The transport data service is not responding. Please try again shortly.") {
    super(502, "upstream_unavailable", message);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function rawJson(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function errorResponse(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, { "Cache-Control": "no-store", ...headers });
}

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/** Returns true if the request may proceed (no Origin header, or Origin is allow-listed). */
export function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return allowedOrigins(env).includes(origin);
}

export function preflight(request: Request, env: Env): Response {
  if (!originAllowed(request, env) || !request.headers.get("Origin")) {
    return finalize(errorResponse(403, "origin_not_allowed", "This website is not allowed to use the service."), request, env);
  }
  return finalize(
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "600",
      },
    }),
    request,
    env,
  );
}

/** Adds CORS + security headers. WebSocket upgrade responses are returned untouched. */
export function finalize(response: Response, request: Request, env: Env): Response {
  if (response.status === 101 || response.webSocket) return response;
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins(env).includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Expose-Headers", "Retry-After, X-Cache");
  }
  res.headers.append("Vary", "Origin");
  return res;
}

export async function readJsonBody(request: Request, maxBytes = 4096): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "payload_too_large", "The request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "The request body is not valid JSON.");
  }
}
