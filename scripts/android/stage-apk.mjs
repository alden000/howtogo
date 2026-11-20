#!/usr/bin/env node
// M6 AC 39 (Director ruling: no R2 bucket) — stage a VERIFIED signed APK for the Worker's own static assets.
//   node scripts/android/stage-apk.mjs <signed.apk> [--replace] [--date YYYY-MM-DD]
//       reads versionName/versionCode/package from the APK's binary manifest, checks it (zip, APK Signing Block,
//       appId, size <= 25 MiB = the static-assets per-file limit, versionCode above every earlier release), then
//         1. keeps a copy in src/android/releases/howtogo-<v>.apk (gitignored; survives web rebuilds),
//         2. appends {versionName, versionCode, date, size, sha256, path} to src/android/release-history.json
//            (committed; the Worker bundles it for /android and /android/latest.json),
//         3. copies the APK + `.sha256` into src/web/dist/android/ (if a web build exists).
//       Same version again: no-op when the bytes match; a different build of the same version needs --replace
//       (only for a version that was never deployed).
//   node scripts/android/stage-apk.mjs --restage
//       after a web build (deploy.mjs runs it): copies the latest release from src/android/releases/ into
//       src/web/dist/android/ after checking its SHA-256 against the history. No release → nothing to do;
//       release without its APK on this machine → warning (the page shows "download not available").
// Run verify-release.sh first (npm run android:release does build → verify → stage). Never prints secrets.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULTS = {
  history: join(ROOT, "src/android/release-history.json"),
  store: join(ROOT, "src/android/releases"),
  dist: join(ROOT, "src/web/dist"),
};
export const APP_ID = "com.wwweeeiii.howtogo";
/** Workers static assets: 25 MiB per file. */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

// ---- APK reading (zip + Android binary XML), no SDK needed ----

function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip/APK (no end-of-central-directory record)");
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip central directory");
    const nameLen = buf.readUInt16LE(p + 28);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.set(name, { method: buf.readUInt16LE(p + 10), compSize: buf.readUInt32LE(p + 20), local: buf.readUInt32LE(p + 42) });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return { entries, cdOffset };
}

function zipRead(buf, e) {
  const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
  const data = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateRawSync(data);
  throw new Error(`unsupported zip method ${e.method}`);
}

function stringPool(buf, off) {
  const hsz = buf.readUInt16LE(off + 2);
  const n = buf.readUInt32LE(off + 8);
  const utf8 = (buf.readUInt32LE(off + 16) & 0x100) !== 0;
  const base = off + buf.readUInt32LE(off + 20);
  const out = [];
  for (let i = 0; i < n; i++) {
    let p = base + buf.readUInt32LE(off + hsz + 4 * i);
    if (utf8) {
      if (buf[p] & 0x80) p += 2; else p += 1; // UTF-16 length (unused)
      let len = buf[p];
      if (len & 0x80) len = ((len & 0x7f) << 8) | buf[p + 1], p += 2; else p += 1;
      out.push(buf.toString("utf8", p, p + len));
    } else {
      let len = buf.readUInt16LE(p);
      if (len & 0x8000) len = ((len & 0x7fff) << 16) | buf.readUInt16LE(p + 2), p += 4; else p += 2;
      out.push(buf.toString("utf16le", p, p + len * 2));
    }
  }
  return out;
}

/** {package, versionName, versionCode} from a binary AndroidManifest.xml. */
export function parseBinaryManifest(buf) {
  if (buf.readUInt16LE(0) !== 0x0003) throw new Error("AndroidManifest.xml is not binary XML");
  let strings = [];
  const resIds = [];
  let off = buf.readUInt16LE(2);
  while (off + 8 <= buf.length) {
    const type = buf.readUInt16LE(off);
    const hsz = buf.readUInt16LE(off + 2);
    const size = buf.readUInt32LE(off + 4);
    if (size < 8) break;
    if (type === 0x0001) strings = stringPool(buf, off);
    else if (type === 0x0180) for (let p = off + hsz; p < off + size; p += 4) resIds.push(buf.readUInt32LE(p));
    else if (type === 0x0102) {
      const ext = off + hsz;
      if (strings[buf.readUInt32LE(ext + 4)] === "manifest") {
        const out = {};
        const attrStart = buf.readUInt16LE(ext + 8);
        const attrSize = buf.readUInt16LE(ext + 10);
        const count = buf.readUInt16LE(ext + 12);
        for (let i = 0; i < count; i++) {
          const a = ext + attrStart + i * attrSize;
          const ni = buf.readUInt32LE(a + 4);
          const raw = buf.readInt32LE(a + 8);
          const dataType = buf[a + 15];
          const data = buf.readUInt32LE(a + 16);
          const str = raw !== -1 ? strings[raw] : dataType === 0x03 ? strings[data] : undefined;
          const id = resIds[ni];
          const name = strings[ni];
          if (id === 0x0101021b || name === "versionCode") out.versionCode = str !== undefined ? Number(str) : data;
          else if (id === 0x0101021c || name === "versionName") out.versionName = str ?? String(data);
          else if (name === "package") out.package = str;
        }
        return out;
      }
    }
    off += size;
  }
  throw new Error("no <manifest> element in AndroidManifest.xml");
}

/** Everything stage needs to know about an APK, read from its bytes. Throws on anything unexpected. */
export function readApk(buf) {
  const { entries, cdOffset } = zipEntries(buf);
  const m = entries.get("AndroidManifest.xml");
  if (!m) throw new Error("no AndroidManifest.xml in the APK");
  const man = parseBinaryManifest(zipRead(buf, m));
  // v2+ signatures live in the APK Signing Block, which ends with this magic right before the central directory.
  const signed = cdOffset >= 16 && buf.toString("latin1", cdOffset - 16, cdOffset) === "APK Sig Block 42";
  return { ...man, signed, size: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

// ---- staging ----

const VERSION = /^\d+\.\d+\.\d+$/;
export const apkName = (v) => `howtogo-${v}.apk`;
const sgToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
const readHistory = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeHistory = (p, h) => writeFileSync(p, JSON.stringify(h, null, 2) + "\n");

function toDist(dist, file, rel, log) {
  if (!existsSync(join(dist, "index.html"))) {
    log(`stage-apk: no web build at ${dist} — skipped the dist copy (deploy.mjs re-stages after its build)`);
    return false;
  }
  const dir = join(dist, "android");
  mkdirSync(dir, { recursive: true });
  copyFileSync(file, join(dir, apkName(rel.versionName)));
  writeFileSync(join(dir, `${apkName(rel.versionName)}.sha256`), `${rel.sha256}  ${apkName(rel.versionName)}\n`);
  log(`stage-apk: ${rel.path} (+ .sha256) → ${dir}`);
  return true;
}

/** Stage one APK. Returns the history entry. */
export function stage(apkPath, opts = {}) {
  const { history = DEFAULTS.history, store = DEFAULTS.store, dist = DEFAULTS.dist, replace = false, log = console.log } = opts;
  const date = opts.date ?? sgToday();
  const buf = readFileSync(apkPath);
  const info = readApk(buf);
  if (info.package !== APP_ID) throw new Error(`package ${info.package} is not ${APP_ID}`);
  if (!info.signed) throw new Error("the APK has no v2+ signature block — sign it and run verify-release.sh first");
  if (info.size > MAX_ASSET_BYTES) throw new Error(`APK is ${info.size} B, over the 25 MiB static-asset limit`);
  if (!VERSION.test(info.versionName ?? "")) throw new Error(`versionName ${info.versionName} is not x.y.z`);
  if (!Number.isInteger(info.versionCode) || info.versionCode <= 0) throw new Error(`bad versionCode ${info.versionCode}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad --date ${date}`);
  const h = readHistory(history);
  h.releases ??= [];
  const rel = {
    versionName: info.versionName,
    versionCode: info.versionCode,
    date,
    size: info.size,
    sha256: info.sha256,
    path: `/android/${apkName(info.versionName)}`,
  };
  const last = h.releases[h.releases.length - 1];
  const same = last && last.versionName === rel.versionName && last.versionCode === rel.versionCode;
  if (same && last.sha256 === rel.sha256) {
    log(`stage-apk: ${rel.versionName} (${rel.versionCode}) already staged with the same bytes`);
    Object.assign(rel, { date: last.date });
  } else if (same && !replace) {
    throw new Error(`${rel.versionName} is already staged with other bytes (${last.sha256.slice(0, 12)}…); pass --replace only if it was never deployed`);
  } else {
    const earlier = same ? h.releases.slice(0, -1) : h.releases;
    const floor = Math.max(h.minCode ?? 0, ...earlier.map((r) => r.versionCode ?? 0));
    if (rel.versionCode <= floor) throw new Error(`versionCode ${rel.versionCode} is not above ${floor} (release-history.json)`);
    if (earlier.some((r) => r.versionName === rel.versionName)) throw new Error(`versionName ${rel.versionName} was released before`);
    h.releases = [...earlier, rel];
    writeHistory(history, h);
    log(`stage-apk: release-history.json += ${rel.versionName} (${rel.versionCode}) ${rel.size} B sha256 ${rel.sha256}`);
  }
  mkdirSync(store, { recursive: true });
  const kept = join(store, apkName(rel.versionName));
  if (resolve(kept) !== resolve(apkPath)) copyFileSync(apkPath, kept);
  writeFileSync(`${kept}.sha256`, `${rel.sha256}  ${apkName(rel.versionName)}\n`);
  toDist(dist, kept, rel, log);
  return rel;
}

/** Copy the latest release from the store into the (fresh) web build. Returns "none" | "missing" | "staged". */
export function restage(opts = {}) {
  const { history = DEFAULTS.history, store = DEFAULTS.store, dist = DEFAULTS.dist, log = console.log } = opts;
  const h = readHistory(history);
  const rel = h.releases?.[h.releases.length - 1];
  if (!rel) {
    log("stage-apk: no release in release-history.json — nothing to stage (/android shows \"not available\")");
    return "none";
  }
  const kept = join(store, apkName(rel.versionName));
  if (!existsSync(kept)) {
    log(`stage-apk: WARNING ${apkName(rel.versionName)} is not in ${store}: /android will show "download not available".`);
    log(`  stage it first: npm run android:stage -- <path to the verified ${apkName(rel.versionName)}>`);
    return "missing";
  }
  const sha = createHash("sha256").update(readFileSync(kept)).digest("hex");
  if (sha !== rel.sha256) throw new Error(`${kept} has SHA-256 ${sha}, release-history.json says ${rel.sha256}`);
  if (!toDist(dist, kept, { ...rel, path: `/android/${apkName(rel.versionName)}` }, log)) throw new Error("no web build to stage into");
  return "staged";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  try {
    if (args.includes("--restage")) restage();
    else {
      const apk = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--date");
      if (!apk) {
        console.error("usage: node scripts/android/stage-apk.mjs <signed.apk> [--replace] [--date YYYY-MM-DD] | --restage");
        process.exit(64);
      }
      stage(resolve(apk), { replace: args.includes("--replace"), date: opt("--date") });
      console.log(`stage-apk: OK (${basename(apk)})`);
    }
  } catch (e) {
    console.error(`stage-apk: FAIL ${e.message}`);
    process.exit(1);
  }
}
