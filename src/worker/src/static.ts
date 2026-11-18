// Static PWA serving for the preview deploy without Workers Static Assets (wrangler.embed.toml).
// The web build is embedded at build time by scripts/embed-assets.mjs; `_headers` rules are applied
// here exactly as Cloudflare would (every matching rule's headers, first value wins on clashes).

export interface EmbeddedAsset {
  body: string;
  base64: boolean;
  contentType: string;
  etag: string;
}
export interface HeaderRule {
  pattern: string;
  headers: Record<string, string>;
}

/** Cloudflare's default for assets without a Cache-Control rule (e.g. SPA fallback paths). */
const DEFAULT_CACHE_CONTROL = "public, max-age=0, must-revalidate";
/** Build-time files that must never be served. */
const HIDDEN = new Set(["/_headers", "/_redirects"]);

const bytesCache = new WeakMap<EmbeddedAsset, Uint8Array>();
function bodyOf(a: EmbeddedAsset): Uint8Array | string {
  if (!a.base64) return a.body;
  let b = bytesCache.get(a);
  if (!b) {
    const bin = atob(a.body);
    b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    bytesCache.set(a, b);
  }
  return b;
}

const ruleRegex = new Map<string, RegExp>();
function matches(pattern: string, path: string): boolean {
  let re = ruleRegex.get(pattern);
  if (!re) {
    const src = pattern
      .split("*")
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/:\w+/g, "[^/]+"))
      .join(".*");
    re = new RegExp(`^${src}$`);
    ruleRegex.set(pattern, re);
  }
  return re.test(path);
}

export function headersFor(path: string, rules: HeaderRule[]): Headers {
  const h = new Headers();
  for (const r of rules) {
    if (!matches(r.pattern, path)) continue;
    for (const [k, v] of Object.entries(r.headers)) if (!h.has(k)) h.set(k, v);
  }
  if (!h.has("Cache-Control")) h.set("Cache-Control", DEFAULT_CACHE_CONTROL);
  return h;
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header.split(",").some((t) => t.trim().replace(/^W\//, "") === etag);
}

export function serveEmbedded(request: Request, assets: Record<string, EmbeddedAsset>, rules: HeaderRule[]): Response {
  const url = new URL(request.url);
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  const notFound = () => {
    const h = headersFor(path, rules);
    h.set("Content-Type", "text/plain; charset=utf-8");
    h.set("Cache-Control", "no-store");
    return new Response("Not found", { status: 404, headers: h });
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const h = headersFor(path, rules);
    h.set("Allow", "GET, HEAD");
    h.set("Cache-Control", "no-store");
    return new Response("Method not allowed", { status: 405, headers: h });
  }
  if (HIDDEN.has(path)) return notFound();

  let asset = assets[path === "/" ? "/index.html" : path];
  if (!asset) {
    // A missing file (last segment has an extension) is a real 404; anything else is a PWA route.
    const last = path.slice(path.lastIndexOf("/") + 1);
    if (last.includes(".")) return notFound();
    asset = assets["/index.html"];
    if (!asset) return notFound();
  }

  const h = headersFor(path, rules);
  h.set("Content-Type", asset.contentType);
  h.set("ETag", asset.etag);
  if (etagMatches(request.headers.get("If-None-Match"), asset.etag)) {
    h.delete("Content-Type");
    return new Response(null, { status: 304, headers: h });
  }
  return new Response(request.method === "HEAD" ? null : bodyOf(asset), { status: 200, headers: h });
}
