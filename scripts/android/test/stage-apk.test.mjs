// M6 AC 39: stage-apk.mjs with fixture APK bytes (a real binary AndroidManifest.xml from the 1.1.0 build, in a
// stored zip with an APK Signing Block magic). Run: node --test scripts/
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { MAX_ASSET_BYTES, readApk, restage, stage } from "../stage-apk.mjs";

const MANIFEST = readFileSync(new URL("./fixtures/AndroidManifest.axml", import.meta.url));

/** A minimal APK: [local entries][signing block?][central directory][EOCD]. */
export function fakeApk({ signed = true, manifest = MANIFEST, padding = 0, deflate = true } = {}) {
  const files = [["AndroidManifest.xml", manifest], ["assets/public/index.html", Buffer.from("<!doctype html>" + "x".repeat(padding))]];
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, raw] of files) {
    const data = deflate ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(n.length, 26);
    locals.push(lh, n, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const block = signed ? Buffer.concat([Buffer.alloc(24), Buffer.from("APK Sig Block 42", "latin1")]) : Buffer.alloc(0);
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset + block.length, 16);
  return Buffer.concat([...locals, block, cd, eocd]);
}

const tmp = mkdtempSync(join(tmpdir(), "stage-apk-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
let dirs;
const quiet = () => {};
beforeEach(() => {
  const d = join(tmp, String(n++));
  dirs = { history: join(d, "release-history.json"), store: join(d, "releases"), dist: join(d, "dist"), log: quiet };
  mkdirSync(dirs.dist, { recursive: true });
  writeFileSync(join(dirs.dist, "index.html"), "<!doctype html>");
  writeFileSync(dirs.history, JSON.stringify({ note: "n", minCode: 20000, releases: [] }));
});
const write = (buf, name = "app.apk") => {
  const p = join(tmp, `${n}-${name}`);
  writeFileSync(p, buf);
  return p;
};
const sha = (b) => createHash("sha256").update(b).digest("hex");

describe("readApk", () => {
  it("reads package, versionName and versionCode from the binary manifest (deflated and stored)", () => {
    for (const deflate of [true, false]) {
      const buf = fakeApk({ deflate });
      const info = readApk(buf);
      assert.deepEqual(
        { ...info },
        { package: "com.wwweeeiii.howtogo", versionName: "1.1.0", versionCode: 1010000, signed: true, size: buf.length, sha256: sha(buf) },
      );
    }
  });
  it("detects a missing signing block and rejects non-zips", () => {
    assert.equal(readApk(fakeApk({ signed: false })).signed, false);
    assert.throws(() => readApk(Buffer.from("not a zip at all, just text padding padding")), /not a zip/);
  });
});

describe("stage", () => {
  it("writes the history entry from the APK, keeps a copy and stages APK + .sha256 into dist/android", () => {
    const buf = fakeApk();
    const rel = stage(write(buf), { ...dirs, date: "2026-11-20" });
    const entry = { versionName: "1.1.0", versionCode: 1010000, date: "2026-11-20", size: buf.length, sha256: sha(buf), path: "/android/howtogo-1.1.0.apk" };
    assert.deepEqual(rel, entry);
    const h = JSON.parse(readFileSync(dirs.history, "utf8"));
    assert.deepEqual(h.releases, [entry]);
    assert.equal(h.minCode, 20000);
    assert.equal(h.note, "n");
    assert.deepEqual(readFileSync(join(dirs.store, "howtogo-1.1.0.apk")), buf);
    assert.deepEqual(readFileSync(join(dirs.dist, "android/howtogo-1.1.0.apk")), buf);
    assert.equal(readFileSync(join(dirs.dist, "android/howtogo-1.1.0.apk.sha256"), "utf8"), `${sha(buf)}  howtogo-1.1.0.apk\n`);
  });

  it("same bytes again: no-op; other bytes of the same version: refused unless --replace", () => {
    stage(write(fakeApk()), { ...dirs, date: "2026-11-20" });
    stage(write(fakeApk()), { ...dirs, date: "2026-11-21" });
    assert.equal(JSON.parse(readFileSync(dirs.history, "utf8")).releases[0].date, "2026-11-20");
    const other = fakeApk({ padding: 10 });
    assert.throws(() => stage(write(other), { ...dirs, date: "2026-11-21" }), /already staged with other bytes/);
    stage(write(other), { ...dirs, date: "2026-11-21", replace: true });
    const h = JSON.parse(readFileSync(dirs.history, "utf8"));
    assert.equal(h.releases.length, 1);
    assert.equal(h.releases[0].sha256, sha(other));
  });

  it("refuses unsigned APKs, a versionCode not above the history, and APKs over 25 MiB", () => {
    assert.throws(() => stage(write(fakeApk({ signed: false })), dirs), /signature block/);
    writeFileSync(dirs.history, JSON.stringify({ minCode: 20000, releases: [{ versionName: "1.2.0", versionCode: 1020000, date: "2026-12-01", size: 1, sha256: "a".repeat(64) }] }));
    assert.throws(() => stage(write(fakeApk()), dirs), /not above 1020000/);
    assert.ok(MAX_ASSET_BYTES === 26214400);
    writeFileSync(dirs.history, JSON.stringify({ minCode: 20000, releases: [] }));
    assert.throws(() => stage(write(fakeApk({ padding: MAX_ASSET_BYTES, deflate: false })), dirs), /25 MiB/);
    assert.equal(existsSync(join(dirs.dist, "android")), false);
  });
});

describe("restage (after a web build)", () => {
  it("none → nothing; missing APK → warning; else copies and checks the SHA-256", () => {
    assert.equal(restage(dirs), "none");
    const buf = fakeApk();
    stage(write(buf), { ...dirs, dist: join(tmp, "no-dist"), date: "2026-11-20" });
    assert.equal(existsSync(join(dirs.dist, "android")), false);
    assert.equal(restage(dirs), "staged");
    assert.deepEqual(readFileSync(join(dirs.dist, "android/howtogo-1.1.0.apk")), buf);
    writeFileSync(join(dirs.store, "howtogo-1.1.0.apk"), fakeApk({ padding: 3 }));
    assert.throws(() => restage(dirs), /SHA-256/);
    rmSync(join(dirs.store, "howtogo-1.1.0.apk"));
    assert.equal(restage(dirs), "missing");
  });
});
