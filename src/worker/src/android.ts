// M6 AC 38–40, OQ3, OQ11: the Android distribution endpoints on the Worker.
//   GET /android, /android/        → the W-A download page (STYLE-GUIDE 6h.9; HTML in src/android-page.ts)
//   GET /android/latest.json       → { versionName, versionCode, sha256, size, date } of the latest release
//   GET /android/howtogo-<v>.apk   → the APK from the Worker's own static assets (Director ruling: no R2)
//   GET /android/howtogo-<v>.apk.sha256 → its `sha256sum` line
// Source of truth: src/android/release-history.json (bundled at build time), newest release LAST, written by
// scripts/android/stage-apk.mjs, which also copies the verified APK into src/web/dist/android/ (deploy.mjs
// re-stages it after its web build). A release is "available" only when the history has it AND the static
// assets hold `/android/howtogo-<versionName>.apk` with the recorded size; otherwise latest.json is a 404 and the
// page shows its `unavailable` state, so the app's update notice (D1) never points at a download that can't
// work. The APK never goes into src/web/public (it would end up inside the APK) nor the PWA precache.
import bundledHistory from "../../android/release-history.json";
import type { Env } from "./env";
import { canonicalRedirect, IMMUTABLE } from "./pages";
import { finalize, preflight } from "./http";
import { renderAndroidPage, type Lang } from "./android-page";

export interface Release {
  versionName: string;
  versionCode: number;
  /** YYYY-MM-DD */
  date: string;
  /** APK size in bytes. */
  size: number;
  /** Lower-case hex SHA-256 of the APK (64 chars). */
  sha256: string;
  /** Served path, `/android/howtogo-<versionName>.apk` (stage-apk.mjs writes it; derived when absent). */
  path?: string;
}
export interface ReleaseHistory {
  note?: string;
  minCode?: number;
  releases: Partial<Release>[];
}

export const VERSION_NAME = /^\d+\.\d+\.\d+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SHA256 = /^[0-9a-f]{64}$/;

export const BUNDLED_HISTORY = bundledHistory as ReleaseHistory;

export function isRelease(r: Partial<Release> | undefined): r is Release {
  if (!r) return false;
  const d = typeof r.date === "string" ? DATE.exec(r.date) : null;
  return (
    typeof r.versionName === "string" &&
    VERSION_NAME.test(r.versionName) &&
    Number.isInteger(r.versionCode) &&
    (r.versionCode as number) > 0 &&
    d !== null &&
    Number(d[2]) >= 1 &&
    Number(d[2]) <= 12 &&
    Number(d[3]) >= 1 &&
    Number(d[3]) <= 31 &&
    Number.isInteger(r.size) &&
    (r.size as number) > 0 &&
    typeof r.sha256 === "string" &&
    SHA256.test(r.sha256)
  );
}

/** The newest (last) release, or null when there is none or it is malformed. */
export function latestRelease(history: ReleaseHistory): Release | null {
  const last = history.releases?.[history.releases.length - 1];
  return isRelease(last) ? last : null;
}

export const apkKey = (versionName: string) => `howtogo-${versionName}.apk`;
export const apkPath = (versionName: string) => `/android/${apkKey(versionName)}`;

/** HEAD/GET a staged file from the static assets (null on 404, a missing binding or an error). */
async function assetFetch(env: Env, path: string, method = "HEAD", headers?: Headers): Promise<Response | null> {
  if (!env.ASSETS) return null;
  try {
    const init: RequestInit = { method };
    if (headers?.has("Range")) init.headers = { Range: headers.get("Range")! };
    const res = await env.ASSETS.fetch(new Request(`https://assets.local${path}`, init));
    return res.status === 200 || res.status === 206 ? res : null;
  } catch {
    return null;
  }
}

/** The latest release if its APK can actually be downloaded (history entry + staged asset of that size). */
export async function availableRelease(env: Env, history: ReleaseHistory): Promise<Release | null> {
  const rel = latestRelease(history);
  if (!rel) return null;
  const res = await assetFetch(env, apkPath(rel.versionName));
  const len = res?.headers.get("Content-Length");
  // A stale staging (other build than the history entry) is not offered: wrong size → unavailable.
  return res && (len === null || Number(len) === rel.size) ? rel : null;
}

export { formatDate, formatSize, groupSha, megabytes } from "./android-page";

// ---- request handling ----

/** `?lang=zh|en`, else the highest-priority zh or en tag of Accept-Language, else en. */
export function negotiateLang(url: URL, acceptLanguage: string | null): { lang: Lang; explicit: boolean } {
  const q = url.searchParams.get("lang");
  if (q === "zh" || q === "en") return { lang: q, explicit: true };
  const tags = (acceptLanguage ?? "")
    .split(",")
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().toLowerCase().split(";");
      const qp = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = qp ? Number(qp.slice(2)) : 1;
      return { tag, weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((t) => t.weight > 0 && (t.tag.startsWith("zh") || t.tag.startsWith("en")))
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  return { lang: tags[0]?.tag.startsWith("zh") ? "zh" : "en", explicit: false };
}

export const isIos = (ua: string | null) => /\b(iPhone|iPad|iPod)\b/.test(ua ?? "");

export const ANDROID_PATH = /^\/android(?:\/.*)?$/;
const APK_PATH = /^\/android\/howtogo-(\d+\.\d+\.\d+)\.apk(\.sha256)?$/;

const notFound = () =>
  new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export function androidPageCsp(url: URL, nonce: string): string {
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    ...(url.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

async function servePageResponse(request: Request, env: Env, history: ReleaseHistory): Promise<Response> {
  const target = canonicalRedirect(request, env);
  if (target) {
    return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const url = new URL(request.url);
  const { lang, explicit } = negotiateLang(url, request.headers.get("Accept-Language"));
  const fromParam = url.searchParams.get("from");
  const from = fromParam && VERSION_NAME.test(fromParam) ? fromParam : null;
  const release = await availableRelease(env, history);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = renderAndroidPage({
    lang,
    release,
    from,
    ios: isIos(request.headers.get("User-Agent")),
    pageUrl: `${url.origin}/android${explicit ? `?lang=${lang}` : ""}`,
    nonce,
  });
  const h = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Language": lang === "zh" ? "zh-Hans" : "en",
    "Cache-Control": "no-cache",
    Vary: "Accept-Language, User-Agent",
    "Content-Security-Policy": androidPageCsp(url, nonce),
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  });
  if (url.protocol === "https:") h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return new Response(request.method === "HEAD" ? null : html, { status: 200, headers: h });
}

async function serveLatest(request: Request, env: Env, history: ReleaseHistory): Promise<Response> {
  const rel = await availableRelease(env, history);
  const body = rel
    ? { versionName: rel.versionName, versionCode: rel.versionCode, sha256: rel.sha256, size: rel.size, date: rel.date, path: apkPath(rel.versionName) }
    : { error: "not_available" };
  const res = new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status: rel ? 200 : 404,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": rel ? "public, max-age=300" : "public, max-age=60" },
  });
  // CORS + security headers exactly like the API: the app's WebView (https://localhost) is in ALLOWED_ORIGINS.
  return finalize(res, request, env);
}

async function serveApk(request: Request, env: Env, history: ReleaseHistory, versionName: string, sha: boolean): Promise<Response> {
  if (!history.releases.some((r) => isRelease(r) && r.versionName === versionName)) return notFound();
  const key = apkKey(versionName) + (sha ? ".sha256" : "");
  const src = await assetFetch(env, `/android/${key}`, request.method === "HEAD" ? "HEAD" : "GET", sha ? undefined : request.headers);
  if (!src) return notFound();
  const h = new Headers({
    "Content-Type": sha ? "text/plain; charset=utf-8" : "application/vnd.android.package-archive",
    "X-Content-Type-Options": "nosniff",
    // The file name carries the version: a published APK never changes (a new build is a new versionName).
    "Cache-Control": IMMUTABLE,
    "Referrer-Policy": "no-referrer",
  });
  if (!sha) {
    h.set("Content-Disposition", `attachment; filename="${key}"`);
    h.set("Accept-Ranges", "bytes");
  }
  for (const k of ["Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
    const v = src.headers.get(k);
    if (v) h.set(k, v);
  }
  if (new URL(request.url).protocol === "https:") h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return new Response(request.method === "HEAD" ? null : src.body, { status: src.status, headers: h });
}

/** Every /android and /android/* request. `history` is injectable for tests. */
export async function handleAndroid(request: Request, env: Env, history: ReleaseHistory = BUNDLED_HISTORY): Promise<Response> {
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (path === "/android/latest.json") {
    if (method === "OPTIONS") return preflight(request, env);
    if (method !== "GET" && method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
    return serveLatest(request, env, history);
  }
  if (method !== "GET" && method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  if (path === "/android" || path === "/android/") return servePageResponse(request, env, history);
  const apk = APK_PATH.exec(path);
  if (apk) return serveApk(request, env, history, apk[1]!, !!apk[2]);
  return notFound();
}
