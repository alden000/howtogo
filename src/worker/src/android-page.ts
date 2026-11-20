// M6 W-A: the server-rendered /android download page, built to STYLE-GUIDE 6h.9 (sketch
// creative/m6/android.html). Self-contained: tokens copied from src/web/src/styles/tokens.css (no new
// colour/type/space/radius tokens), icons from src/web/src/ui/kit.tsx, the seal from §0, Creative's
// drawn pictures inlined (src/android-pictures.ts) so everything follows dark mode, the QR code drawn
// server-side (src/qr.ts). No third-party requests; the only script is the Copy button (CSP nonce).
import type { Release } from "./android";
import { PICTURES, PICTURE_STYLE, type PictureName } from "./android-pictures";
import { encodeQr, qrSvg } from "./qr";

export type Lang = "zh" | "en";

// ---- formatting (6h.9 items 3–4) ----

/** zh `2026 年 12 月 1 日`, en `1 December 2026`. */
export function formatDate(date: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (lang === "zh") return `${y} 年 ${mo} 月 ${d} 日`;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d} ${months[mo - 1]} ${y}`;
}

/** Decimal megabytes, one decimal place: 1694285 → "1.7". */
export const megabytes = (bytes: number) => (Math.round(bytes / 100_000) / 10).toFixed(1);
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** zh `1.7 MB（1,694,285 字节）`, en `1.7 MB (1,694,285 bytes)`. */
export function formatSize(bytes: number, lang: Lang): string {
  return lang === "zh" ? `${megabytes(bytes)} MB（${thousands(bytes)} 字节）` : `${megabytes(bytes)} MB (${thousands(bytes)} bytes)`;
}

/** The SHA-256 grouped by 4. */
export const groupSha = (sha: string) => (sha.match(/.{1,4}/g) ?? []).join(" ");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- copy (6h.9, exact) ----
// Static, trusted strings; only the {v}/{from}/{size} placeholders take (validated) data.
export const COPY = {
  zh: {
    title: "怎么去? 安卓版",
    brand: "怎么去?",
    toggle: "English",
    h1: "怎么去? 安卓版",
    lead: "锁屏也能提醒你下车。",
    ben: ["手机放在口袋里，也会说话、震动，提醒你下车。", "分享行程时，家人一直看得到你走到哪里。", "和网页版一样用，不用重新学。"],
    from: (from: string, v: string) => `你手机上的是 ${from}，新版本是 ${v}。`,
    download: (v: string) => `下载 怎么去? ${v}`,
    dlCaption: (mb: string) => `${mb} MB · 安卓 7 或更新的手机都能用，安卓 10 或更新的最好。`,
    version: "版本",
    date: "日期",
    size: "大小",
    copy: "复制",
    copied: "已经复制了。",
    shaCaption: "想确认文件没有被改过的家人，可以对一下这串字。",
    qrTitle: "在电脑上？",
    qrBody: "用手机扫一扫，在手机上下载。",
    ios: "这是给安卓手机用的。iPhone 请用网页版。",
    openWeb: "打开网页版",
    unavailable: "现在下载不了，请晚一点再来。",
    installTitle: "怎么安装",
    steps: [
      '按"下载"。如果 Chrome 问"仍要下载吗？"，按"仍然下载"。',
      '下载好了，按"打开"。',
      '手机可能会说"不允许安装未知应用"。按"设置"，打开"允许来自此来源的应用"，再按返回。',
      '按"安装"。',
      '如果出现"Play 保护机制"，看下面的说明。',
      '装好了，按"打开"。',
      '第一次打开时，手机会问位置和通知。请选"使用应用时允许"和"允许"。',
    ],
    ppTitle: '为什么手机会问"Play 保护机制"？',
    pp: ["因为怎么去不是从 Play 商店下载的，手机会小心一点，先问你一下。这很正常。", '看到"扫描应用"，就按它，扫描完再按"安装"。如果写着"仍然安装"，也可以按它。'],
    ppLock: "怎么去不会读你的短信、照片或通讯录。位置只在你用它找路时才用。",
    updTitle: "有新版本时怎么更新",
    upd: ['打开这一页，按"下载"。', '按"打开"，再按"更新"。', "好了。你存的家、常去的地方和家人电话都还在。"],
    warnTitle: "更新时，不要先删掉旧的",
    warn: "删掉怎么去，会把你存的家、常去的地方和家人电话一起删掉。新版本直接装在旧的上面就好。",
    foot: "怎么去? 只在这一页下载，不在 Play 商店上架。",
    privacy: "隐私说明",
    web: "网页版",
  },
  en: {
    title: "怎么去? for Android",
    brand: "怎么去?",
    toggle: "中文",
    h1: "怎么去? for Android",
    lead: "Reminds you to get off, even with the screen locked.",
    ben: [
      "It talks and buzzes to remind you to get off, even in your pocket.",
      "When you share a trip, family keep seeing where you are.",
      "Works just like the web version. Nothing new to learn.",
    ],
    from: (from: string, v: string) => `You have ${from}. The new version is ${v}.`,
    download: (v: string) => `Download 怎么去? ${v}`,
    dlCaption: (mb: string) => `${mb} MB · Works on Android 7 or newer. Best on Android 10 or newer.`,
    version: "Version",
    date: "Date",
    size: "Size",
    copy: "Copy",
    copied: "Copied.",
    shaCaption: "For family who want to check the file hasn't been changed: compare this code.",
    qrTitle: "On a computer?",
    qrBody: "Scan this with the phone to download it there.",
    ios: "This is for Android phones. On iPhone, please use the web version.",
    openWeb: "Open the web version",
    unavailable: "The download isn't available right now. Please come back later.",
    installTitle: "How to install",
    steps: [
      'Tap "Download". If Chrome asks "Download anyway?", tap "Download anyway".',
      'When it has downloaded, tap "Open".',
      'Your phone may say it isn\'t allowed to install unknown apps. Tap "Settings", turn on "Allow from this source", then go back.',
      'Tap "Install".',
      'If you see "Play Protect", read the note below.',
      'When it\'s installed, tap "Open".',
      'The first time, your phone asks about location and notifications. Choose "While using the app" and "Allow".',
    ],
    ppTitle: 'Why does my phone mention "Play Protect"?',
    pp: [
      "怎么去 doesn't come from the Play Store, so your phone takes extra care and asks you first. That's normal.",
      'If you see "Scan app", tap it, and when the scan is done, tap "Install". If it says "Install anyway", you can tap that.',
    ],
    ppLock: "怎么去 doesn't read your messages, photos or contacts. It uses your location only while it shows you the way.",
    updTitle: "When there's a new version",
    upd: ['Open this page and tap "Download".', 'Tap "Open", then "Update".', "Done. Your saved home, places and family numbers are all still there."],
    warnTitle: "To update, don't delete the old one first",
    warn: "Deleting 怎么去 also deletes your saved home, places and family numbers. Just install the new version over the old one.",
    foot: "怎么去? is only downloaded from this page. It isn't on the Play Store.",
    privacy: "Privacy",
    web: "Web version",
  },
} as const;

// ---- icons (src/web/src/ui/kit.tsx, §1.4: 24 grid, 2.2 stroke, currentColor) ----
const ICONS = {
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  family: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.3"/><path d="M3.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6M14.5 14.6c.8-.4 1.6-.6 2.5-.6 2.5 0 4 2 4 5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  install: '<path d="M12 4v10M8 10l4 4 4-4M5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
} as const;
const icon = (name: keyof typeof ICONS) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

/** The seal (§0 master glyph on #9A3412; a solid object, same in dark mode). */
const SEAL =
  '<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><rect width="512" height="512" rx="112" fill="#9A3412"/>' +
  '<rect x="40" y="40" width="432" height="432" rx="80" fill="none" stroke="#FBF5EC" stroke-width="12" opacity=".9"/>' +
  '<g transform="translate(256 262) scale(0.84) translate(-256 -256)" fill="none" stroke="#FBF5EC" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M256 96V204" stroke-width="56"/><path d="M196 128H316" stroke-width="50"/><path d="M100 216H412" stroke-width="50"/>' +
  '<path d="M262 292L178 408L304 396" stroke-width="56"/><circle cx="388" cy="392" r="44" fill="#FFD23F" stroke="none"/></g></svg>';

const pic = (name: PictureName, lang: Lang) => `<div class="pic">${PICTURES[name][lang]}</div>`;
const INSTALL_PICS: PictureName[] = ["install-1-warn", "install-2-open", "install-3-source", "install-4-install", "install-5-protect", "install-6-done", "perm-location"];

// Colour values are tokens.css (light, and dark under prefers-color-scheme); sizes from §1.2/§1.3.
const LIGHT =
  "--c-canvas:#FBF5EC;--c-surface:#FFFFFF;--c-surface-2:#F3EADC;--c-line:#D9CBB6;--c-ink:#1D1915;--c-ink-2:#4A4038;--c-ink-inv:#FBF5EC;" +
  "--c-primary:#9A3412;--c-on-primary:#FFFFFF;--c-primary-soft:#FBE3D3;--c-on-primary-soft:#6E2409;--c-primary-text:#8A2E0B;" +
  "--c-jade:#0E5B49;--c-saffron:#FFD23F;--c-saffron-soft:#FFF1C2;--c-focus:#1D1915;" +
  "--e-1:0 1px 2px rgba(60,40,20,.08),0 2px 8px rgba(60,40,20,.06);--e-3:0 8px 16px rgba(60,40,20,.12),0 24px 56px rgba(60,40,20,.18);color-scheme:light";
const DARK =
  "--c-canvas:#14110E;--c-surface:#1F1A16;--c-surface-2:#2A231D;--c-line:#43392F;--c-ink:#F6EEE4;--c-ink-2:#CFC3B5;--c-ink-inv:#14110E;" +
  "--c-primary:#FF9466;--c-on-primary:#1D1915;--c-primary-soft:#4A2414;--c-on-primary-soft:#FFD9C6;--c-primary-text:#FFA77F;" +
  "--c-jade:#5FD3B0;--c-saffron:#FFD23F;--c-saffron-soft:#3D3212;--c-focus:#F6EEE4;" +
  "--e-1:0 1px 2px rgba(0,0,0,.4);--e-3:0 16px 48px rgba(0,0,0,.6);color-scheme:dark";

export const PAGE_CSS = `:root{${LIGHT};--font:"Atkinson Hyperlegible","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC","Source Han Sans SC","Microsoft YaHei",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root{${DARK}}}
html{font-size:20px;-webkit-text-size-adjust:100%}*{box-sizing:border-box}
body{margin:0;background:var(--c-canvas);color:var(--c-ink);font-family:var(--font);font-size:1rem;line-height:1.45;overflow-wrap:break-word}
h1,h2,h3,p{margin:0}a{color:var(--c-primary-text)}
:focus-visible{outline:3px solid var(--c-focus);outline-offset:3px}
.ic{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.pg{max-width:1120px;margin:0 auto;padding:0 16px 40px}
.hdr{display:flex;align-items:center;gap:12px;min-height:72px}.hdr .logo{display:block;width:40px;height:40px;flex:none}.hdr svg{display:block;width:100%;height:100%}.hdr b{font-size:1.2rem;flex:1;min-width:0}
.langbtn{min-height:56px;min-width:56px;padding:0 16px;border-radius:28px;border:2px solid var(--c-line);background:var(--c-surface);color:var(--c-ink);font-weight:700;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.hero{display:grid;gap:24px;padding:16px 0 8px}.hero>*{min-width:0}.seal{display:block;width:96px;height:96px}.seal svg{display:block;width:100%;height:100%}
.h1{font-size:2.1rem;font-weight:900;line-height:1.15;margin-top:16px}.lead{font-size:1.2rem;font-weight:700;line-height:1.3;margin-top:8px;color:var(--c-primary-text)}
ul.ben{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:12px}ul.ben li{display:flex;gap:12px;align-items:flex-start}ul.ben .ic{color:var(--c-jade)}
.from{margin-top:16px;font-weight:700;background:var(--c-surface-2);border-radius:20px;padding:12px 16px}
.btn{display:flex;gap:12px;align-items:center;justify-content:center;width:100%;min-height:72px;border-radius:28px;border:0;font:inherit;font-size:1.15rem;font-weight:700;padding:12px 20px;margin-top:16px;background:var(--c-primary);color:var(--c-on-primary);text-align:center;text-decoration:none}
.cap{font-size:.85rem;line-height:1.3;color:var(--c-ink-2);margin-top:8px}
.card{background:var(--c-surface);border-radius:28px;padding:20px;margin-top:16px;box-shadow:var(--e-1)}
.facts dl{margin:0;display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 16px}.facts dt{color:var(--c-ink-2)}.facts dd{margin:0;font-weight:700}
.shalabel{margin-top:12px;color:var(--c-ink-2)}
.sha{font-family:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;font-size:.9rem;word-break:break-all;background:var(--c-surface-2);border-radius:12px;padding:12px;margin:8px 0;line-height:1.6;-webkit-user-select:all;user-select:all}
.copy{min-height:56px;padding:0 20px;border-radius:28px;border:2px solid var(--c-line);background:var(--c-surface);color:var(--c-ink);font:inherit;font-weight:700;display:inline-flex;gap:8px;align-items:center;cursor:pointer}
.note{background:var(--c-surface-2);border-radius:20px;padding:16px;margin-top:16px;font-weight:700}
.qr{display:none}
.qr-svg{display:block;width:200px;height:200px;margin:12px auto;color:var(--c-ink)}.qr-bg{fill:var(--c-surface)}.qr-fg{fill:currentColor}
.headline{font-size:1.2rem;font-weight:700;line-height:1.3}
h2.sec{font-size:1.5rem;font-weight:700;line-height:1.2;margin:32px 0 8px}
ol.steps{list-style:none;padding:0;margin:16px 0 0;counter-reset:s}ol.steps>li{counter-increment:s;display:grid;grid-template-columns:32px minmax(0,1fr);gap:12px;margin-bottom:16px}
ol.steps>li::before{content:counter(s);width:32px;height:32px;border-radius:50%;background:var(--c-primary-soft);color:var(--c-on-primary-soft);display:grid;place-items:center;font-weight:700}
.pic{margin:12px 0 4px;max-width:280px;border-radius:20px}.pic svg{display:block;width:100%;height:auto}
.pp{background:var(--c-surface);border-left:8px solid var(--c-jade);border-radius:20px;padding:16px;margin-top:32px}.pp h2{margin-bottom:8px}.pp p+p{margin-top:8px}
.lockline{display:flex;gap:12px;align-items:flex-start;margin-top:16px;color:var(--c-ink-2);font-size:.85rem;line-height:1.3}.lockline .ic{width:24px;height:24px}
.warnrule{border-left:8px solid var(--c-saffron);background:var(--c-surface);border-radius:20px;padding:16px;margin-top:16px}.warnrule p{margin-top:8px}
.foot{margin-top:32px;color:var(--c-ink-2);font-size:.85rem;line-height:1.3;display:grid;gap:4px}
.foot nav{display:flex;flex-wrap:wrap;gap:8px 20px}.foot a{color:var(--c-primary-text);font-weight:700;min-height:56px;min-width:56px;padding:0 4px;display:inline-flex;align-items:center}
.toast{position:fixed;left:16px;right:16px;bottom:24px;z-index:40;max-width:560px;margin:0 auto;display:flex;gap:12px;align-items:center;padding:14px 18px;border-radius:20px;background:var(--c-ink);color:var(--c-ink-inv);font-weight:700;box-shadow:var(--e-3)}.toast.off{opacity:0;pointer-events:none}
@media (min-width:1000px){.pg{padding:0 32px 48px}.hero{grid-template-columns:1.1fr .9fr;align-items:start}
.qr{display:block;background:var(--c-surface);border-radius:28px;padding:20px;text-align:center;box-shadow:var(--e-1)}
ol.inst{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.two{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}}
${PICTURE_STYLE}`;

/** The Copy button: copies the digits (no spaces), then shows the toast for 3 s. */
export const PAGE_SCRIPT = `(function(){var b=document.getElementById("copy"),t=document.getElementById("toast"),m=document.getElementById("toast-msg"),s=document.getElementById("sha");if(!b||!t||!m||!s)return;var h;
function done(){m.textContent=t.getAttribute("data-msg");t.classList.remove("off");clearTimeout(h);h=setTimeout(function(){t.classList.add("off");m.textContent=""},3000)}
function legacy(){var r=document.createRange();r.selectNodeContents(s);var g=getSelection();g.removeAllRanges();g.addRange(r);try{if(document.execCommand("copy"))done()}catch(e){}}
b.addEventListener("click",function(){var v=b.getAttribute("data-sha");if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(v).then(done,legacy);else legacy()})})();`;

export interface PageInput {
  lang: Lang;
  /** The downloadable release, or null → the `unavailable` state. */
  release: Release | null;
  /** Validated installed versionName from `?from=` (D1), or null. */
  from: string | null;
  ios: boolean;
  /** What the desktop QR code encodes: `<origin>/android` (+ `?lang=` when chosen). */
  pageUrl: string;
  nonce: string;
}

export function renderAndroidPage(p: PageInput): string {
  const t = COPY[p.lang];
  const other: Lang = p.lang === "zh" ? "en" : "zh";
  const rel = p.release;
  const v = rel ? esc(rel.versionName) : "";
  const toggleHref = `/android?lang=${other}${p.from ? `&amp;from=${esc(p.from)}` : ""}`;

  let download: string;
  if (p.ios) {
    download = `<div class="note" data-state="ios"><p>${t.ios}</p><a class="btn" href="/">${t.openWeb}</a></div>`;
  } else if (rel) {
    download =
      `<a class="btn" data-state="ready" href="/android/howtogo-${v}.apk" download="howtogo-${v}.apk">${icon("install")}<span>${t.download(v)}</span></a>` +
      `<p class="cap">${t.dlCaption(megabytes(rel.size))}</p>`;
  } else {
    download = `<p class="note" data-state="unavailable">${t.unavailable}</p>`;
  }

  const facts = rel
    ? `<div class="card facts"><dl><dt>${t.version}</dt><dd>${v}</dd><dt>${t.date}</dt><dd>${formatDate(rel.date, p.lang)}</dd>` +
      `<dt>${t.size}</dt><dd>${formatSize(rel.size, p.lang)}</dd></dl>` +
      `<p class="shalabel" aria-hidden="true">SHA-256</p><div class="sha" id="sha" role="group" aria-label="SHA-256">${groupSha(esc(rel.sha256))}</div>` +
      `<button type="button" class="copy" id="copy" data-sha="${esc(rel.sha256)}">${icon("copy")}<span>${t.copy}</span></button>` +
      `<p class="cap">${t.shaCaption}</p></div>`
    : "";

  const code = rel ? encodeQr(p.pageUrl) : null;
  const qr = code
    ? `<aside class="qr" aria-labelledby="qr-h"><h2 class="headline" id="qr-h">${t.qrTitle}</h2>${qrSvg(code)}<p>${t.qrBody}</p></aside>`
    : "";

  const fromLine = p.from && rel ? `<p class="from" data-state="from">${t.from(esc(p.from), v)}</p>` : "";

  const steps = t.steps.map((s, i) => `<li><div>${s}${pic(INSTALL_PICS[i]!, p.lang)}</div></li>`).join("");
  const upd = t.upd.map((s, i) => `<li><div>${s}${i === 1 ? pic("update-1", p.lang) : ""}</div></li>`).join("");

  return `<!doctype html>
<html lang="${p.lang === "zh" ? "zh-Hans" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${t.title}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style nonce="${p.nonce}">${PAGE_CSS}</style>
</head>
<body>
<div class="pg">
<header class="hdr"><span class="logo">${SEAL}</span><b>${t.brand}</b><a class="langbtn" href="${toggleHref}" lang="${other === "zh" ? "zh-Hans" : "en"}" hreflang="${other === "zh" ? "zh-Hans" : "en"}">${t.toggle}</a></header>
<main>
<section class="hero"><div>
<span class="seal">${SEAL}</span>
<h1 class="h1">${t.h1}</h1>
<p class="lead">${t.lead}</p>
<ul class="ben"><li>${icon("bell")}<span>${t.ben[0]}</span></li><li>${icon("family")}<span>${t.ben[1]}</span></li><li>${icon("check")}<span>${t.ben[2]}</span></li></ul>
${fromLine}
${download}
${facts}
</div>${qr}</section>
<section aria-labelledby="install-h"><h2 class="sec" id="install-h">${t.installTitle}</h2>
<ol class="steps inst">${steps}</ol></section>
<div class="two">
<section class="pp" aria-labelledby="pp-h"><h2 class="headline" id="pp-h">${t.ppTitle}</h2><p>${t.pp[0]}</p><p>${t.pp[1]}</p><p class="lockline">${icon("lock")}<span>${t.ppLock}</span></p></section>
<section aria-labelledby="upd-h"><h2 class="sec" id="upd-h">${t.updTitle}</h2><ol class="steps">${upd}</ol>
<div class="warnrule" role="note"><h3 class="headline">${t.warnTitle}</h3><p>${t.warn}</p></div></section>
</div>
</main>
<footer class="foot"><p>${t.foot}</p><nav><a href="/privacy">${t.privacy}</a><a href="/">${t.web}</a></nav></footer>
</div>
<div class="toast off" id="toast" role="status" aria-live="polite" data-msg="${t.copied}">${icon("check")}<span id="toast-msg"></span></div>
${rel ? `<script nonce="${p.nonce}">${PAGE_SCRIPT}</script>` : ""}
</body>
</html>`;
}
