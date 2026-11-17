// Family viewer page `/t/:id` (M4 AC 17, 23, 24): serves the web build's viewer.html for every /t/*
// path with its own headers — noindex, no referrer, and a CSP limited to this origin + OneMap.
// Both deploy paths go through here: [assets] (run_worker_first includes /t/*) and the embedded
// preview build (static.ts). The HTML has generic OG tags only; nothing about the share is injected.
import type { Env } from "./env";
import { serveEmbedded, type EmbeddedAsset, type HeaderRule } from "./static";

export const VIEWER_PATH = /^\/t(?:\/[^/]*)?\/?$/;

export function viewerCsp(url: URL): string {
  const ws = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
  return [
    "default-src 'self'",
    "script-src 'self'",
    // MapLibre sets inline style attributes and runs its workers from blob: URLs.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.onemap.gov.sg",
    `connect-src 'self' ${ws} https://www.onemap.gov.sg`,
    "worker-src 'self' blob:",
    "child-src blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export async function serveViewer(
  request: Request,
  env: Env,
  embedded: { assets: Record<string, EmbeddedAsset>; rules: HeaderRule[] },
): Promise<Response> {
  const url = new URL(request.url);
  let res: Response;
  if (env.ASSETS) {
    // Workers Static Assets serves /viewer.html at /viewer (html_handling auto-trailing-slash).
    res = await env.ASSETS.fetch(new Request(new URL("/viewer", url), { method: request.method, headers: request.headers }));
    if (res.status >= 300 && res.status < 400) {
      res = await env.ASSETS.fetch(new Request(new URL("/viewer.html", url), { method: request.method, headers: request.headers }));
    }
  } else {
    res = serveEmbedded(new Request(new URL("/viewer.html", url), { method: request.method, headers: request.headers }), embedded.assets, embedded.rules);
  }
  if (res.status !== 200 && res.status !== 304) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const h = new Headers(res.headers);
  h.set("Cache-Control", "no-cache");
  h.set("Referrer-Policy", "no-referrer");
  h.set("X-Robots-Tag", "noindex, nofollow");
  h.set("Content-Security-Policy", viewerCsp(url));
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");
  h.delete("Set-Cookie");
  return new Response(res.body, { status: res.status, headers: h });
}
