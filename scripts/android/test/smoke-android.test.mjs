// M6 AC 39: the smoke:deploy Android check (scripts/smoke-android.mjs) against a fake Worker. The real local
// Worker run is in the dev-log (wrangler dev with a staged APK).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { checkAndroid } from "../../smoke-android.mjs";

const APK = new Uint8Array(4096).map((_, i) => i % 7);
const SHA = createHash("sha256").update(APK).digest("hex");
const LATEST = { versionName: "1.1.0", versionCode: 1010000, sha256: SHA, size: APK.length, date: "2026-11-20", path: "/android/howtogo-1.1.0.apk" };

function worker({ staged = true, latest = LATEST, apk = APK, apkHeaders = {} } = {}) {
  return async (path) => {
    if (path === "/android") return new Response("<html>", { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-cache" } });
    if (path === "/android/latest.json")
      return staged
        ? Response.json(latest, { headers: { "cache-control": "public, max-age=300" } })
        : Response.json({ error: "not_available" }, { status: 404, headers: { "cache-control": "public, max-age=60" } });
    if (staged && path === LATEST.path)
      return new Response(apk, {
        headers: {
          "content-type": "application/vnd.android.package-archive",
          "content-disposition": 'attachment; filename="howtogo-1.1.0.apk"',
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
          ...apkHeaders,
        },
      });
    if (staged && path === `${LATEST.path}.sha256`) return new Response(`${SHA}  howtogo-1.1.0.apk\n`);
    return new Response("Not found", { status: 404 });
  };
}
async function run(opts) {
  const results = [];
  const lines = [];
  const outcome = await checkAndroid(worker(opts), (name, ok, note) => results.push({ name, ok: !!ok, note }), (l) => lines.push(l));
  return { outcome, results, failed: results.filter((r) => !r.ok).map((r) => r.name), lines };
}

describe("smoke:deploy android (AC 39)", () => {
  it("staged release: downloads the APK, SHA-256/size/headers match → all PASS", async () => {
    const r = await run();
    assert.equal(r.outcome, "checked");
    assert.deepEqual(r.failed, []);
    assert.equal(r.results.length, 9);
  });
  it("no release staged → SKIP, only the page is checked, no failure", async () => {
    const r = await run({ staged: false });
    assert.equal(r.outcome, "skipped");
    assert.deepEqual(r.failed, []);
    assert.equal(r.results.length, 1);
    assert.match(r.lines[0], /^SKIP/);
  });
  it("a wrong APK (other bytes) fails the SHA-256 and size checks", async () => {
    const r = await run({ apk: APK.slice(0, 4000) });
    assert.deepEqual(r.failed.map((n) => n.replace(/^\/android\/howtogo-1\.1\.0\.apk /, "")), ["size = latest.json size", "SHA-256 = latest.json sha256"]);
  });
  it("wrong headers fail: inline disposition, short cache on the APK, long cache on latest.json", async () => {
    const r = await run({ apkHeaders: { "content-disposition": "inline", "cache-control": "no-cache", "content-type": "application/octet-stream" } });
    assert.equal(r.failed.length, 3);
    const bad = await checkAndroid(
      async (p) => (p === "/android/latest.json" ? Response.json(LATEST, { headers: { "cache-control": "public, max-age=31536000, immutable" } }) : worker()(p)),
      (name, ok) => !ok && assert.match(name, /short cache/),
      () => {},
    );
    assert.equal(bad, "checked");
  });
});
