// M6 AC 39 — the Android part of smoke:deploy (scripts/smoke-deploy.mjs), separate so it can be unit-tested.
//   /android              200 HTML, noindex, no-cache
//   /android/latest.json  404 {error:not_available} → SKIP (no release staged); else 200 with
//                         {versionName, versionCode, sha256, size, date, path}, short cache (≤ 1 h, not immutable)
//   <path> (the APK)      200, application/vnd.android.package-archive, attachment, immutable, Content-Length = size,
//                         SHA-256 of the downloaded bytes = latest.json sha256
//   <path>.sha256         the same digest
import { createHash } from "node:crypto";

export const LATEST_KEYS = "date,path,sha256,size,versionCode,versionName";

/** `get(path, init)` → fetch-like Response; `check(name, ok, note)` records a result; `info(line)` prints. */
export async function checkAndroid(get, check, info = console.log) {
  const page = await get("/android");
  check("/android 200 HTML, noindex, no-cache", page.status === 200 && /text\/html/.test(page.headers.get("content-type") ?? "") && /noindex/.test(page.headers.get("x-robots-tag") ?? "") && /no-cache/.test(page.headers.get("cache-control") ?? ""), `status ${page.status}`);

  const lr = await get("/android/latest.json");
  let latest = {};
  try {
    latest = await lr.json();
  } catch {}
  if (lr.status === 404 && latest?.error === "not_available") {
    info("SKIP  android release: none staged (/android/latest.json 404 not_available) — APK checks skipped");
    return "skipped";
  }
  const keys = Object.keys(latest ?? {}).sort().join(",");
  const cc = lr.headers.get("cache-control") ?? "";
  const maxAge = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? NaN);
  check(`/android/latest.json 200 {${LATEST_KEYS}}`, lr.status === 200 && keys === LATEST_KEYS && /^[0-9a-f]{64}$/.test(latest.sha256) && Number.isInteger(latest.size), `status ${lr.status}, keys ${keys || "-"}`);
  check("/android/latest.json short cache (≤ 1 h, not immutable)", !/immutable/.test(cc) && maxAge <= 3600, cc);
  if (lr.status !== 200 || typeof latest.path !== "string" || !/^\/android\/howtogo-\d+\.\d+\.\d+\.apk$/.test(latest.path)) {
    check("latest.json path is /android/howtogo-<v>.apk", false, String(latest.path));
    return "fail";
  }
  const apk = await get(latest.path);
  const h = (n) => apk.headers.get(n) ?? "";
  check(`${latest.path} 200 application/vnd.android.package-archive`, apk.status === 200 && h("content-type") === "application/vnd.android.package-archive", `status ${apk.status}, ${h("content-type")}`);
  check(`${latest.path} Content-Disposition attachment`, /^attachment;\s*filename="howtogo-[\d.]+\.apk"$/.test(h("content-disposition")), h("content-disposition"));
  check(`${latest.path} immutable, nosniff`, /max-age=31536000/.test(h("cache-control")) && /immutable/.test(h("cache-control")) && h("x-content-type-options") === "nosniff", h("cache-control"));
  const bytes = apk.status === 200 ? new Uint8Array(await apk.arrayBuffer()) : new Uint8Array();
  const sha = createHash("sha256").update(bytes).digest("hex");
  check(`${latest.path} size = latest.json size`, bytes.length === latest.size, `${bytes.length} vs ${latest.size}`);
  check(`${latest.path} SHA-256 = latest.json sha256`, sha === latest.sha256, `${sha.slice(0, 16)}… vs ${String(latest.sha256).slice(0, 16)}…`);
  const side = await get(`${latest.path}.sha256`);
  const sideText = side.status === 200 ? await side.text() : "";
  check(`${latest.path}.sha256 matches`, sideText.split(/\s+/)[0] === latest.sha256, `status ${side.status}`);
  info(`info  android ${latest.versionName} (${latest.versionCode}) ${latest.size} B`);
  return "checked";
}
