// M6 AC 38–40, OQ3: /android page (STYLE-GUIDE 6h.9), /android/latest.json and the APK route.
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_HISTORY,
  formatDate,
  formatSize,
  groupSha,
  handleAndroid,
  isIos,
  latestRelease,
  negotiateLang,
  type ReleaseHistory,
} from "../src/android";
import { COPY } from "../src/android-page";
import type { Env } from "../src/env";
import { call } from "./helpers";

const SHA = "0cec53af991a5a23f1b61e167dd8dbaa7d986e76c6c4eb38d8b25a8a87603c38";
const HISTORY: ReleaseHistory = {
  minCode: 20000,
  releases: [
    { versionName: "1.0.0", versionCode: 1000000, date: "2026-11-01", size: 1_600_000, sha256: "a".repeat(64) },
    { versionName: "1.0.1", versionCode: 1000100, date: "2026-12-01", size: 1_694_285, sha256: SHA },
  ],
};
const EMPTY: ReleaseHistory = { minCode: 20000, releases: [] };
const bytesOf = (n: number) => new Uint8Array(n).map((_, i) => i % 251);
/** The staged file of each release has the size recorded in the history (the Worker checks it). */
const APK_BYTES = bytesOf(1_694_285);
const SIZES: Record<string, number> = { "howtogo-1.0.0.apk": 1_600_000, "howtogo-1.0.1.apk": 1_694_285 };

/** A minimal stand-in for the static-assets binding (HEAD + GET, Range → 206) holding staged APKs. */
function fakeAssets(keys: string[], opts: { fail?: boolean; size?: number } = {}) {
  const calls: string[] = [];
  const assets = {
    async fetch(input: Request) {
      const path = new URL(input.url).pathname;
      calls.push(`${input.method} ${path}`);
      if (opts.fail) throw new Error("assets down");
      const key = path.replace(/^\/android\//, "");
      const isSha = key.endsWith(".sha256");
      if (!path.startsWith("/android/") || !keys.includes(key.replace(/\.sha256$/, ""))) return new Response("nope", { status: 404 });
      const apk = key.replace(/\.sha256$/, "");
      const size = opts.size ?? SIZES[apk] ?? 1000;
      const body = isSha ? new TextEncoder().encode(`${SHA}  ${apk}\n`) : size === APK_BYTES.length ? APK_BYTES : bytesOf(size);
      const h = { "Content-Length": String(body.length), ETag: `"etag-${key}"`, "Content-Type": "application/octet-stream" };
      const m = /^bytes=(\d+)-(\d*)$/.exec(input.headers.get("Range") ?? "");
      if (m && !isSha) {
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : body.length - 1;
        return new Response(input.method === "HEAD" ? null : body.slice(start, end + 1), {
          status: 206,
          headers: { ...h, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${body.length}` },
        });
      }
      return new Response(input.method === "HEAD" ? null : body, { status: 200, headers: h });
    },
  };
  return { assets: assets as unknown as Fetcher, calls };
}

const withDL = (keys = ["howtogo-1.0.1.apk", "howtogo-1.0.0.apk"], o: { fail?: boolean; size?: number } = {}) => {
  const fa = fakeAssets(keys, o);
  return { env: { ...(env as Env), ASSETS: fa.assets } as Env, calls: fa.calls };
};
const req = (path: string, headers: Record<string, string> = {}, method = "GET", origin = "https://howtogo.test") =>
  new Request(origin + path, { method, headers });
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

async function page(path: string, headers: Record<string, string> = {}, history = HISTORY, e = withDL().env) {
  const res = await handleAndroid(req(path, { "User-Agent": ANDROID_UA, ...headers }), e, history);
  return { res, html: await res.text() };
}

describe("release history model", () => {
  it("the latest release is the LAST valid entry", () => {
    expect(latestRelease(HISTORY)?.versionName).toBe("1.0.1");
    expect(latestRelease(EMPTY)).toBeNull();
    expect(latestRelease({ releases: [{ versionName: "1.0.2", versionCode: 1000200, date: "2026-12-09" }] })).toBeNull(); // no size/sha
    expect(latestRelease({ releases: [{ ...HISTORY.releases[1], sha256: "XYZ" }] })).toBeNull();
  });

  it("the bundled src/android/release-history.json parses (releases newest last)", () => {
    expect(Array.isArray(BUNDLED_HISTORY.releases)).toBe(true);
    expect(BUNDLED_HISTORY.minCode).toBe(20000);
  });

  it("formats date, size and SHA-256 per 6h.9", () => {
    expect(formatDate("2026-12-01", "zh")).toBe("2026 年 12 月 1 日");
    expect(formatDate("2026-12-01", "en")).toBe("1 December 2026");
    expect(formatSize(1_694_285, "zh")).toBe("1.7 MB（1,694,285 字节）");
    expect(formatSize(1_694_285, "en")).toBe("1.7 MB (1,694,285 bytes)");
    expect(groupSha(SHA)).toBe("0cec 53af 991a 5a23 f1b6 1e16 7dd8 dbaa 7d98 6e76 c6c4 eb38 d8b2 5a8a 8760 3c38");
  });

  it("language: ?lang= wins, else the best zh*/en* Accept-Language tag, else en", () => {
    const u = (q = "") => new URL("https://x.test/android" + q);
    expect(negotiateLang(u("?lang=zh"), "en")).toEqual({ lang: "zh", explicit: true });
    expect(negotiateLang(u("?lang=en"), "zh-CN")).toEqual({ lang: "en", explicit: true });
    expect(negotiateLang(u("?lang=fr"), "zh-SG,zh;q=0.9").lang).toBe("zh");
    expect(negotiateLang(u(), "zh-Hans-SG").lang).toBe("zh");
    expect(negotiateLang(u(), "en-GB,zh;q=0.8").lang).toBe("en");
    expect(negotiateLang(u(), "fr-FR,zh;q=0.5").lang).toBe("zh");
    expect(negotiateLang(u(), "en;q=0.4,zh-TW;q=0.6").lang).toBe("zh");
    expect(negotiateLang(u(), "ms-MY").lang).toBe("en");
    expect(negotiateLang(u(), null).lang).toBe("en");
  });

  it("detects iPhone / iPad / iPod", () => {
    expect(isIos(IPHONE_UA)).toBe(true);
    expect(isIos("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIos(ANDROID_UA)).toBe(false);
    expect(isIos(null)).toBe(false);
  });
});

describe("GET /android/latest.json (AC 39, 40)", () => {
  it("returns the latest release with a short cache and API-style CORS for the app WebView", async () => {
    const e = { ...withDL().env, ALLOWED_ORIGINS: "https://localhost" } as Env;
    const res = await handleAndroid(req("/android/latest.json", { Origin: "https://localhost" }), e, HISTORY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ versionName: "1.0.1", versionCode: 1000100, sha256: SHA, size: 1_694_285, date: "2026-12-01", path: "/android/howtogo-1.0.1.apk" });
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://localhost");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("no CORS header for an origin that isn't allowed", async () => {
    const res = await handleAndroid(req("/android/latest.json", { Origin: "https://evil.test" }), withDL().env, HISTORY);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("404 {error:not_available} with an empty history, no ASSETS binding, a missing or stale (other size) APK", async () => {
    for (const [e, h] of [
      [withDL(undefined, { size: 1234 }).env, HISTORY],
      [withDL().env, EMPTY],
      [env as Env, HISTORY],
      [withDL(["howtogo-1.0.0.apk"]).env, HISTORY],
      [withDL(undefined, { fail: true }).env, HISTORY],
    ] as const) {
      const res = await handleAndroid(req("/android/latest.json"), e, h);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_available" });
    }
  });

  it("through the Worker: the bundled (empty) history → 404, CORS for an allowed origin; OPTIONS preflight", async () => {
    const res = await call("/android/latest.json", { headers: { Origin: "https://app.example.sg" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_available" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.sg");
    const pre = await call("/android/latest.json", { method: "OPTIONS", headers: { Origin: "https://app.example.sg" } });
    expect(pre.status).toBe(204);
    expect((await call("/android/latest.json", { method: "POST" })).status).toBe(405);
  });
});

describe("GET /android/howtogo-<v>.apk (AC 39, OQ3)", () => {
  it("serves the staged APK from the static assets with the download headers", async () => {
    const res = await handleAndroid(req("/android/howtogo-1.0.1.apk"), withDL().env, HISTORY);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.android.package-archive");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="howtogo-1.0.1.apk"');
    expect(res.headers.get("Content-Length")).toBe("1694285");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("ETag")).toBe('"etag-howtogo-1.0.1.apk"');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(APK_BYTES);
  });

  it("older released versions are served too; HEAD has headers and no body", async () => {
    expect((await handleAndroid(req("/android/howtogo-1.0.0.apk"), withDL().env, HISTORY)).status).toBe(200);
    const head = await handleAndroid(req("/android/howtogo-1.0.1.apk", {}, "HEAD"), withDL().env, HISTORY);
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Length")).toBe("1694285");
    expect(await head.text()).toBe("");
  });

  it("the .sha256 sidecar is served as text, immutable, only for released versions", async () => {
    const res = await handleAndroid(req("/android/howtogo-1.0.1.apk.sha256"), withDL().env, HISTORY);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe(`${SHA}  howtogo-1.0.1.apk\n`);
    expect((await handleAndroid(req("/android/howtogo-9.9.9.apk.sha256"), withDL().env, HISTORY)).status).toBe(404);
  });

  it("Range requests get 206 + Content-Range (resumed downloads)", async () => {
    const res = await handleAndroid(req("/android/howtogo-1.0.1.apk", { Range: "bytes=100-199" }), withDL().env, HISTORY);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 100-199/1694285");
    expect(res.headers.get("Content-Length")).toBe("100");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(APK_BYTES.slice(100, 200));
  });

  it("404 for a version not in the history (never asks the assets), a missing file, no binding, or an assets error", async () => {
    const unknown = withDL(["howtogo-9.9.9.apk"]);
    expect((await handleAndroid(req("/android/howtogo-9.9.9.apk"), unknown.env, HISTORY)).status).toBe(404);
    expect(unknown.calls).toEqual([]);
    expect((await handleAndroid(req("/android/howtogo-1.0.1.apk"), withDL(["howtogo-1.0.0.apk"]).env, HISTORY)).status).toBe(404);
    expect((await handleAndroid(req("/android/howtogo-1.0.1.apk"), env as Env, HISTORY)).status).toBe(404);
    expect((await handleAndroid(req("/android/howtogo-1.0.1.apk"), withDL(undefined, { fail: true }).env, HISTORY)).status).toBe(404);
    for (const p of ["/android/howtogo-1.0.apk", "/android/howtogo-../x.apk", "/android/other.apk", "/android/x"]) {
      expect((await handleAndroid(req(p), withDL().env, HISTORY)).status).toBe(404);
    }
  });
});

describe("GET /android — the W-A page (6h.9, AC 38)", () => {
  it("ready (zh): noindex, nonce CSP, no third-party URLs, exact copy, download link and facts", async () => {
    const { res, html } = await page("/android", { "Accept-Language": "zh-CN,zh;q=0.9" });
    expect(res.status).toBe(200);
    const h = res.headers;
    expect(h.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(h.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(h.get("Cache-Control")).toBe("no-cache");
    expect(h.get("Referrer-Policy")).toBe("no-referrer");
    expect(h.get("X-Frame-Options")).toBe("DENY");
    const csp = h.get("Content-Security-Policy")!;
    expect(csp).toMatch(/^default-src 'none'; style-src 'nonce-[0-9a-f]{32}'; script-src 'nonce-[0-9a-f]{32}'; img-src 'self'/);
    const nonce = /'nonce-([0-9a-f]+)'/.exec(csp)![1]!;
    expect(html).toContain(`<style nonce="${nonce}">`);
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('<html lang="zh-Hans">');
    // No outside requests or links of any kind.
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/\bsrc=/);
    expect(html).not.toMatch(/style="/);
    // Exact copy (zh).
    const z = COPY.zh;
    for (const s of [z.h1, z.lead, ...z.ben, z.installTitle, ...z.steps, z.ppTitle, ...z.pp, z.ppLock, z.updTitle, ...z.upd, z.warnTitle, z.warn, z.foot, z.shaCaption, z.qrTitle, z.qrBody]) {
      expect(html).toContain(s);
    }
    expect(html).toContain("下载 怎么去? 1.0.1");
    expect(html).toContain("1.7 MB · 安卓 7 或更新的手机都能用，安卓 10 或更新的最好。");
    expect(html).toContain("2026 年 12 月 1 日");
    expect(html).toContain("1.7 MB（1,694,285 字节）");
    expect(html).toContain('href="/android/howtogo-1.0.1.apk" download="howtogo-1.0.1.apk"');
    expect(html).toContain('role="group" aria-label="SHA-256">0cec 53af 991a 5a23 f1b6 1e16 7dd8 dbaa 7d98 6e76 c6c4 eb38 d8b2 5a8a 8760 3c38<');
    expect(html).toContain(`data-sha="${SHA}"`);
    expect(html).toContain('data-msg="已经复制了。"');
    expect(html).toContain(">复制<");
    expect(html).not.toContain('data-state="unavailable"');
    expect(html).not.toContain('data-state="ios"');
    expect(html).not.toContain('data-state="from"');
    // Header toggle → English, footer links.
    expect(html).toContain('<a class="langbtn" href="/android?lang=en" lang="en" hreflang="en">English</a>');
    expect(html).toContain('<a href="/privacy">隐私说明</a><a href="/">网页版</a>');
    // SR structure: one h1, steps in an <ol>, pictures inlined and aria-hidden.
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<h2/g)!.length).toBeGreaterThanOrEqual(4);
    expect(html.match(/<ol class="steps inst"><li>/g)).toHaveLength(1);
    const pics = html.match(/<div class="pic"><svg [^>]*>/g)!;
    expect(pics).toHaveLength(8);
    for (const p of pics) expect(p).toContain('aria-hidden="true"');
    expect(html).toContain("仍然下载"); // zh picture text
    // Desktop QR card (shown ≥ 1000 px by CSS) encodes this page's URL.
    expect(html).toContain('<svg class="qr-svg" viewBox="0 0 37 37"');
    expect(html).toContain("@media (min-width:1000px)");
  });

  it("ready (en) with exact copy; toggle → 中文", async () => {
    const { res, html } = await page("/android?lang=en", { "Accept-Language": "zh-CN" });
    expect(res.headers.get("Content-Language")).toBe("en");
    expect(html).toContain('<html lang="en">');
    const en = COPY.en;
    for (const s of [en.h1, en.lead, ...en.ben, en.installTitle, ...en.steps, en.ppTitle, ...en.pp, en.ppLock, en.updTitle, ...en.upd, en.warnTitle, en.warn, en.foot, en.shaCaption, en.qrTitle, en.qrBody]) {
      expect(html).toContain(s);
    }
    expect(html).toContain("Download 怎么去? 1.0.1");
    expect(html).toContain("1.7 MB · Works on Android 7 or newer. Best on Android 10 or newer.");
    expect(html).toContain("1 December 2026");
    expect(html).toContain("1.7 MB (1,694,285 bytes)");
    expect(html).toContain('data-msg="Copied."');
    expect(html).toContain('<a class="langbtn" href="/android?lang=zh" lang="zh-Hans" hreflang="zh-Hans">中文</a>');
    expect(html).toContain('<a href="/privacy">Privacy</a><a href="/">Web version</a>');
    expect(html).toContain("Download anyway"); // en picture text
    expect(html).not.toContain("仍然下载");
  });

  it("Accept-Language decides when there is no ?lang=; /android/ works too", async () => {
    expect((await page("/android/", { "Accept-Language": "zh-SG" })).html).toContain('<html lang="zh-Hans">');
    expect((await page("/android", { "Accept-Language": "en-SG,en;q=0.9" })).html).toContain('<html lang="en">');
    expect((await page("/android", {})).html).toContain('<html lang="en">');
  });

  it("from: adds the D1 line under the hero; invalid values are ignored; the toggle keeps it", async () => {
    const zh = (await page("/android?from=1.0.0&lang=zh")).html;
    expect(zh).toContain('<p class="from" data-state="from">你手机上的是 1.0.0，新版本是 1.0.1。</p>');
    expect(zh).toContain('href="/android?lang=en&amp;from=1.0.0"');
    const en = (await page("/android?from=1.0.0&lang=en")).html;
    expect(en).toContain("You have 1.0.0. The new version is 1.0.1.");
    for (const bad of ["1.0", "<script>", "1.0.0-beta", "1.0.0%20x"]) {
      const html = (await page(`/android?lang=en&from=${encodeURIComponent(bad)}`)).html;
      expect(html).not.toContain('data-state="from"');
      expect(html).not.toContain("<script>a");
    }
  });

  it("unavailable: no release, no ASSETS binding, or no staged APK → message instead of download + facts; steps stay", async () => {
    for (const [h, e] of [
      [EMPTY, withDL().env],
      [HISTORY, env as Env],
      [HISTORY, withDL(["howtogo-1.0.0.apk"]).env],
      [HISTORY, withDL(undefined, { fail: true }).env],
    ] as const) {
      const { res, html } = await page("/android?lang=zh&from=1.0.0", {}, h, e);
      expect(res.status).toBe(200);
      expect(html).toContain('<p class="note" data-state="unavailable">现在下载不了，请晚一点再来。</p>');
      expect(html).not.toContain(".apk\" download");
      expect(html).not.toContain('class="card facts"');
      expect(html).not.toContain('data-state="from"');
      expect(html).not.toContain("<script");
      expect(html).not.toContain('class="qr-svg"');
      expect(html).toContain(COPY.zh.steps[0]);
    }
    const en = (await page("/android?lang=en", {}, EMPTY)).html;
    expect(en).toContain("The download isn't available right now. Please come back later.");
  });

  it("ios: the download block becomes the iPhone note + Open the web version (primary → /); the rest stays", async () => {
    const { html } = await page("/android?lang=zh", { "User-Agent": IPHONE_UA });
    expect(html).toContain('<div class="note" data-state="ios"><p>这是给安卓手机用的。iPhone 请用网页版。</p><a class="btn" href="/">打开网页版</a></div>');
    expect(html).not.toContain('download="howtogo-');
    expect(html).toContain('class="card facts"');
    expect(html).toContain(COPY.zh.steps[6]);
    const en = (await page("/android?lang=en", { "User-Agent": IPHONE_UA })).html;
    expect(en).toContain("This is for Android phones. On iPhone, please use the web version.");
    expect(en).toContain(">Open the web version</a>");
  });

  it("through the Worker: /android is the page (not the SPA), unavailable with the bundled empty history", async () => {
    const res = await call("/android?lang=en");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const html = await res.text();
    expect(html).toContain("怎么去? for Android");
    expect(html).toContain('data-state="unavailable"');
    expect((await call("/android", { method: "HEAD" })).status).toBe(200);
    expect((await call("/android/nope")).status).toBe(404);
    expect((await call("/android", { method: "POST" })).status).toBe(405);
  });

  it("production: a workers.dev request redirects to the custom domain, keeping the query", async () => {
    const e = { ...(env as Env), CANONICAL_ORIGIN: "https://howtogo.example" } as Env;
    const res = await handleAndroid(req("/android?from=1.0.0", {}, "GET", "https://howtogo.someone.workers.dev"), e, HISTORY);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://howtogo.example/android?from=1.0.0");
    // latest.json is not a page: no redirect.
    expect((await handleAndroid(req("/android/latest.json", {}, "GET", "https://howtogo.someone.workers.dev"), e, EMPTY)).status).toBe(404);
  });
});
