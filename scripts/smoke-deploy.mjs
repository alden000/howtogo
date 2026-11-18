#!/usr/bin/env node
// M5 AC 33 — post-deploy smoke, no secrets: `npm run smoke:deploy -- <base-url> [--version 1.0.0] [--expect-live] [--json]`
//   e.g. npm run smoke:deploy -- https://howtogo-preview.<subdomain>.workers.dev
// Checks the deployed release build over HTTP only:
//   /                 200 HTML, no-cache, CSP (script-src 'self', own wss:), nosniff, Permissions-Policy, HSTS (https)
//   /version.json     200, version = the expected version (default: src/web/package.json)
//   hashed assets     every /assets/* referenced by index.html: 200 + `public, max-age=31536000, immutable`
//   /sw.js            200 JavaScript, no-cache, precache list injected
//   manifest          200, valid JSON, name/start_url/scope/display, 192 + 512 icons reachable, no-cache
//   /api/health       {ok, fixtureMode, onemap, lta, version}; version matches; no-store
//                     (--expect-live: fixtureMode must be false and onemap "ok" — production)
//   /t/<random>       200 family page with noindex + no-referrer (the page itself shows "not found");
//                     /api/share/<random> → 404 share_not_found
//   /setup            Referrer-Policy: no-referrer
//   /assets/<missing> 404 (a stale index.html never gets HTML for a chunk)
// Prints one line per check and `smoke:deploy PASS|FAIL`. Exit 0 PASS, 1 FAIL, 64 usage.
// Never prints response bodies; sends only `User-Agent: howtogo-smoke/<version>`. On FAIL after a deploy:
// `npx wrangler rollback [--env production]` (docs/process/DEPLOY.md).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = (args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--version") ?? process.env.SMOKE_URL ?? "").replace(/\/+$/, "");
if (!/^https?:\/\/[^/]+$/.test(base)) {
  console.error("usage: npm run smoke:deploy -- <base-url> [--version x.y.z] [--expect-live] [--json]   (or SMOKE_URL=<base-url>)");
  process.exit(64);
}
const expected = opt("--version") ?? JSON.parse(readFileSync(new URL("../src/web/package.json", import.meta.url), "utf8")).version;
const UA = `howtogo-smoke/${expected}`;
const https = base.startsWith("https:");
const results = [];

const check = (name, ok, note = "") => {
  results.push({ name, ok: !!ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? ` — ${note}` : ""}`);
};
async function get(path, init = {}) {
  try {
    return await fetch(base + path, { redirect: "manual", ...init, headers: { "User-Agent": UA, ...(init.headers ?? {}) } });
  } catch (e) {
    return { ok: false, status: 0, headers: new Headers(), text: async () => "", json: async () => ({}), error: e?.cause?.code ?? e?.name ?? "fetch failed" };
  }
}
const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const cc = (r) => r.headers.get("cache-control") ?? "";
const noCache = (r) => /\bno-cache\b/.test(cc(r)) || /\bmax-age=0\b/.test(cc(r));
const IMMUTABLE = (r) => /public/.test(cc(r)) && /max-age=31536000/.test(cc(r)) && /immutable/.test(cc(r));

// 1. index.html
const home = await get("/");
const html = home.ok ? await home.text() : "";
check("/ 200 text/html", home.status === 200 && /text\/html/.test(home.headers.get("content-type") ?? ""), `status ${home.status}${home.error ? " " + home.error : ""}`);
check("/ Cache-Control no-cache", noCache(home), cc(home));
const csp = home.headers.get("content-security-policy") ?? "";
const host = new URL(base).host;
check("/ CSP: script-src 'self', frame-ancestors 'none', own WebSocket", /script-src 'self'(;|$)/.test(csp) && /frame-ancestors 'none'/.test(csp) && csp.includes(`${https ? "wss" : "ws"}://${host}`), csp ? "" : "missing");
check("/ X-Content-Type-Options nosniff", home.headers.get("x-content-type-options") === "nosniff");
check("/ Permissions-Policy geolocation=(self)", /geolocation=\(self\)/.test(home.headers.get("permissions-policy") ?? ""));
check("/ Referrer-Policy set", !!home.headers.get("referrer-policy"));
if (https) check("/ Strict-Transport-Security", /max-age=\d{7,}/.test(home.headers.get("strict-transport-security") ?? ""));
check("/ no Set-Cookie", !home.headers.get("set-cookie"));

// 2. version.json
const ver = await get("/version.json");
let verBody = {};
try {
  verBody = ver.ok ? await ver.json() : {};
} catch {}
check(`/version.json version = ${expected}`, ver.status === 200 && verBody.version === expected, `got ${verBody.version ?? ver.status}`);
check("/version.json no-cache", noCache(ver), cc(ver));

// 3. hashed assets referenced by index.html
const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
check("index.html references hashed assets", assets.length > 0, `${assets.length} files`);
check("index.html does not reference MapLibre (lazy)", !/maplibre/i.test(html));
let immutableOk = assets.length > 0;
for (const a of assets) {
  const r = await get(a, { method: "HEAD" });
  if (r.status !== 200 || !IMMUTABLE(r)) {
    immutableOk = false;
    check(`${a} immutable`, false, `status ${r.status}, ${cc(r)}`);
  }
}
if (immutableOk) check("hashed assets 200 + public, max-age=31536000, immutable", true, `${assets.length} checked`);
const missing = await get(`/assets/smoke-${rand(10)}.js`);
check("missing chunk → 404 (never HTML)", missing.status === 404, `status ${missing.status}`);

// 4. service worker
const sw = await get("/sw.js");
const swText = sw.ok ? await sw.text() : "";
check("/sw.js 200 JavaScript", sw.status === 200 && /javascript/.test(sw.headers.get("content-type") ?? ""), `status ${sw.status}`);
check("/sw.js no-cache", noCache(sw), cc(sw));
check("/sw.js precache injected", swText.length > 0 && !swText.includes("__PRECACHE__") && !swText.includes("__SW_VERSION__"));

// 5. manifest
const mf = await get("/manifest.webmanifest");
let manifest = null;
try {
  manifest = mf.ok ? JSON.parse(await mf.text()) : null;
} catch {}
check("manifest valid JSON", !!manifest, `status ${mf.status}`);
check("manifest no-cache", noCache(mf), cc(mf));
if (manifest) {
  check("manifest fields", manifest.name === "怎么去?" && manifest.start_url === "/" && manifest.scope === "/" && manifest.display === "standalone");
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const size of ["192x192", "512x512"]) {
    const icon = icons.find((i) => String(i.sizes).split(" ").includes(size));
    const r = icon ? await get(new URL(icon.src, base + "/").pathname, { method: "HEAD" }) : { status: 0 };
    check(`manifest icon ${size} reachable`, r.status === 200, icon ? `status ${r.status}` : "missing");
  }
}

// 6. health
const hr = await get("/api/health");
let health = {};
try {
  health = hr.ok ? await hr.json() : {};
} catch {}
const keys = Object.keys(health).sort().join(",");
check("/api/health shape {fixtureMode, lta, ok, onemap, version}", hr.status === 200 && keys === "fixtureMode,lta,ok,onemap,version", `status ${hr.status}, keys ${keys || "-"}`);
check(`/api/health version = ${expected}`, health.version === expected, `got ${health.version ?? "-"}`);
check("/api/health no-store", /no-store/.test(cc(hr)), cc(hr));
check("/api/health exposes no token expiry", !/expir|token/i.test(JSON.stringify(health)));
console.log(`info  fixtureMode=${health.fixtureMode} onemap=${health.onemap} lta=${health.lta}`);
if (flag("--expect-live")) check("live mode (production): fixtureMode false, onemap ok", health.fixtureMode === false && health.onemap === "ok");

// 7. family page and share API
const id = rand(12);
const t = await get(`/t/${id}`);
check("/t/<random> serves the family page (shows not-found itself)", t.status === 200 && /text\/html/.test(t.headers.get("content-type") ?? ""), `status ${t.status}`);
check("/t/<random> noindex + no-referrer", /noindex/.test(t.headers.get("x-robots-tag") ?? "") && t.headers.get("referrer-policy") === "no-referrer");
const share = await get(`/api/share/${id}`);
let shareBody = {};
try {
  shareBody = await share.json();
} catch {}
check("/api/share/<random> → 404 share_not_found", share.status === 404 && shareBody?.error?.code === "share_not_found", `status ${share.status}`);

// 8. caregiver setup page
const setup = await get("/setup");
check("/setup Referrer-Policy no-referrer", setup.headers.get("referrer-policy") === "no-referrer", `status ${setup.status}`);

const failed = results.filter((r) => !r.ok);
if (flag("--json")) {
  mkdirSync(`${ROOT}qa/.out`, { recursive: true });
  writeFileSync(`${ROOT}qa/.out/smoke-deploy.json`, JSON.stringify({ base, expected, at: new Date().toISOString().slice(0, 10), results }, null, 1));
}
console.log(`smoke:deploy ${failed.length ? "FAIL" : "PASS"} — ${results.length - failed.length}/${results.length} checks${failed.length ? `; failing: ${failed.map((f) => f.name).join("; ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
