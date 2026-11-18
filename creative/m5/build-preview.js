// Builds creative/m5/preview.html (M5 frames sketch with the drawn SVGs inlined) and, with --shots,
// renders it at 390 px (light/dark, 100/200 %) plus the feedback form at 390 px and as an A4 PDF.
// Usage: node creative/m5/build-preview.js [--shots]   (needs playwright resolvable, e.g. NODE_PATH)
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const svg = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const icons = svg('icons.svg');
const use = (id) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const T = {
  zh: {
    guideT: '放到主屏幕，三步就好', s1: '按分享按钮（一个方框，上面有箭头）。', s1more: '看不到？先按右下角的“⋯”。',
    s2: '往下滑，按“添加到主屏幕”。', s3: '按右上角的“添加”。', done: '好了，我知道了',
    cardT: '把 怎么去? 放到主屏幕', cardB: '以后一按图标就能打开，像普通应用一样。', cardBtn: '放到主屏幕', later: '以后再说',
    iabT: '在浏览器里打开会更好用', iabBtn: '用 Chrome 打开',
    upd: '有新版本 · 点这里更新', chip: '省电模式',
    bsT: '省电模式', auto: '自动', autoS: '电量剩 20% 或更少、又没在充电时，自动打开。', on: '开', onS: '一直省电。', off: '关', offS: '不省电。',
    bsNote: '省电时，地图动得少一些，家人看到你位置的次数也少一些。下车提醒、帮忙和到达消息不会受影响。',
    step: '坐着就好，还有 4 站', meta: '第 3 步，共 5 步',
  },
  en: {
    guideT: 'Three steps to your home screen', s1: 'Tap the Share button (a square with an arrow pointing up).', s1more: "Can't see it? First tap “⋯” at the bottom right.",
    s2: 'Scroll down and tap “Add to Home Screen”.', s3: 'Tap “Add” at the top right.', done: 'OK, got it',
    cardT: 'Put 怎么去? on your home screen', cardB: 'Then one tap on the icon opens it, like any other app.', cardBtn: 'Add to home screen', later: 'Not now',
    iabT: 'Works best in your browser', iabBtn: 'Open in Chrome',
    upd: 'New version · tap to update', chip: 'Battery saver',
    bsT: 'Battery saver', auto: 'Auto', autoS: "Turns on when the battery is at 20% or less and isn't charging.", on: 'On', onS: 'Always save battery.', off: 'Off', offS: "Don't save battery.",
    bsNote: 'While saving battery, the map moves less and family see your position less often. Get-off alerts, Help and arrival messages are never affected.',
    step: 'Sit back. 4 stops to go', meta: 'Step 3 of 5',
  },
};

function page(lang) {
  const t = T[lang];
  return `<section class="phone" lang="${lang === 'zh' ? 'zh-Hans' : 'en'}">
  <div class="iab" role="region" aria-label="${t.iabT}">${use('open-browser')}<span>${t.iabT}</span><button class="btn sm">${t.iabBtn}</button></div>
  <button class="upd">${use('refresh')}<span>${t.upd}</span></button>
  <article class="card">
    <div class="tilei">${use('install')}</div>
    <h3>${t.cardT}</h3><p>${t.cardB}</p>
    <button class="btn primary">${t.cardBtn}</button><button class="btn quiet">${t.later}</button>
  </article>
  <div class="sheet" role="dialog" aria-label="${t.guideT}">
    <h2>${t.guideT}</h2>
    <ol class="guide">
      <li><span class="num">1</span><div><p>${t.s1}</p>${svg('install/ios-step1-safari.svg')}<p class="cap">${t.s1more}</p></div></li>
      <li><span class="num">2</span><div><p>${t.s2}</p>${svg(`install/ios-step2-${lang}.svg`)}</div></li>
      <li><span class="num">3</span><div><p>${t.s3}</p>${svg(`install/ios-step3-${lang}.svg`)}</div></li>
    </ol>
    <button class="btn primary">${t.done}</button>
    <p class="cap">iOS Chrome, step 1:</p>${svg('install/ios-step1-chrome.svg')}
  </div>
  <div class="stepcard"><div class="metarow"><span>${t.meta}</span><span class="chip">${use('leaf')}${t.chip}</span></div><p class="step">${t.step}</p></div>
  <div class="sheet"><h2>${t.bsT}</h2>
    <div class="opt sel"><div><b>${t.auto}</b><span>${t.autoS}</span></div>${use('check')}</div>
    <div class="opt"><div><b>${t.on}</b><span>${t.onS}</span></div></div>
    <div class="opt"><div><b>${t.off}</b><span>${t.offS}</span></div></div>
    <p class="note">${use('leaf')}<span>${t.bsNote}</span></p>
  </div>
  <div class="icons">${['leaf', 'add-square', 'open-browser'].map((i) => `<span>${use(i)}<small>${i}</small></span>`).join('')}</div>
</section>`;
}

// Existing approved icons used above (copied from src/web/src/ui/kit.tsx so the sketch is self-contained).
const kit = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
<symbol id="i-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15"/></symbol>
<symbol id="i-install" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10M8 10l4 4 4-4M5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V15"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
</svg>`;

const css = `
:root{--c-canvas:#FBF5EC;--c-surface:#FFFFFF;--c-surface-2:#F3EADC;--c-line:#D9CBB6;--c-ink:#1D1915;--c-ink-2:#4A4038;--c-primary:#9A3412;--c-on-primary:#FFFFFF;--c-primary-soft:#FBE3D3;--c-on-primary-soft:#6E2409;--c-jade:#0E5B49;--c-saffron-soft:#FFF1C2;--ts:1}
:root[data-theme=dark]{--c-canvas:#14110E;--c-surface:#1F1A16;--c-surface-2:#2A231D;--c-line:#43392F;--c-ink:#F6EEE4;--c-ink-2:#CFC3B5;--c-primary:#FF9466;--c-on-primary:#1D1915;--c-primary-soft:#4A2414;--c-on-primary-soft:#FFD9C6;--c-jade:#5FD3B0;--c-saffron-soft:#3D3212}
html{font-size:calc(20px*var(--ts))}
body{margin:0;background:var(--c-canvas);color:var(--c-ink);font-family:"Atkinson Hyperlegible","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;line-height:1.45}
.phone{max-width:390px;margin:0 auto;padding:0 20px 40px;display:flex;flex-direction:column;gap:16px;word-break:keep-all;overflow-wrap:anywhere}
.ic{width:1.4em;height:1.4em;flex:none}
.btn{min-height:56px;border-radius:28px;font-weight:700;font-size:1.15rem;line-height:1.2;padding:12px 20px;border:2px solid var(--c-line);background:var(--c-surface);color:var(--c-ink);width:100%}
.btn.primary{min-height:72px;background:var(--c-primary);border-color:var(--c-primary);color:var(--c-on-primary)}
.btn.quiet{border-color:transparent;background:none;color:var(--c-ink-2)}
.btn.sm{width:auto;font-size:.9rem;min-height:56px}
.iab{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;background:var(--c-surface-2);margin:0 -20px;padding:4px 20px;min-height:64px;font-weight:700;font-size:.9rem;line-height:1.3}
.iab span{flex:1 1 8em}
.upd{display:flex;align-items:center;gap:12px;min-height:56px;width:100%;text-align:left;background:var(--c-surface);color:var(--c-ink);border:0;border-left:8px solid var(--c-jade);border-radius:20px;padding:12px 16px;font-weight:700;font-size:1rem;line-height:1.3;box-shadow:0 2px 6px rgba(80,50,20,.12)}
.card,.sheet,.stepcard{background:var(--c-surface);border-radius:28px;padding:18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 6px rgba(80,50,20,.12)}
.sheet{border-radius:36px 36px 0 0}
.card h3,.sheet h2{margin:0;font-size:1.2rem;line-height:1.3}
.card p{margin:0}
.tilei{width:60px;height:60px;border-radius:20px;background:var(--c-primary-soft);color:var(--c-on-primary-soft);display:grid;place-items:center}
.tilei .ic{width:34px;height:34px}
ol.guide{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:20px}
ol.guide li{display:grid;grid-template-columns:auto 1fr;gap:12px}
ol.guide p{margin:0 0 8px}
.num{width:32px;height:32px;border-radius:50%;background:var(--c-primary-soft);color:var(--c-on-primary-soft);display:grid;place-items:center;font-weight:700}
.sheet svg[viewBox="0 0 280 180"]{display:block;width:100%;max-width:280px;height:auto;border-radius:20px;background:var(--c-surface-2)}
.cap{font-size:.85rem;color:var(--c-ink-2);margin:0}
.metarow{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;font-weight:700;font-size:.9rem;line-height:1.3;color:var(--c-ink-2)}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--c-surface-2);color:var(--c-ink);border-radius:12px;padding:4px 10px}
.chip .ic{width:1.1em;height:1.1em}
.step{margin:0;font-weight:700;font-size:1.45rem;line-height:1.2}
.opt{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:56px;padding:8px 16px;border:2px solid var(--c-line);border-radius:20px}
.opt.sel{border:3px solid var(--c-primary)}
.opt div{display:flex;flex-direction:column}.opt span{font-size:.85rem;color:var(--c-ink-2)}
.note{display:flex;gap:8px;margin:0;font-size:.85rem;color:var(--c-ink-2)}
.icons{display:flex;gap:24px}.icons span{display:flex;flex-direction:column;align-items:center;gap:4px}.icons .ic{width:48px;height:48px}.icons small{font-size:.7rem}
`;

const html = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M5 frames sketch</title><style>${css}</style></head><body>${icons}${kit}${page('zh')}${page('en')}</body></html>`;
fs.writeFileSync(path.join(dir, 'preview.html'), html);
console.log('wrote preview.html');

if (process.argv.includes('--shots')) {
  (async () => {
    const { chromium } = require('playwright');
    const b = await chromium.launch();
    const out = path.join(dir, 'shots');
    const issues = [];
    for (const theme of ['light', 'dark']) for (const ts of [1, 2]) {
      const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      await p.goto('file://' + path.join(dir, 'preview.html'));
      await p.evaluate(([th, s]) => { document.documentElement.dataset.theme = th; document.documentElement.style.setProperty('--ts', s); }, [theme, ts]);
      const r = await p.evaluate(() => {
        const bad = [];
        if (document.documentElement.scrollWidth > innerWidth) bad.push('hscroll ' + document.documentElement.scrollWidth);
        for (const el of document.querySelectorAll('button,.opt')) { const h = el.getBoundingClientRect().height; if (h < 56) bad.push('target<56 ' + el.textContent.trim().slice(0, 20) + ' ' + h); }
        for (const el of document.querySelectorAll('p,h2,h3,span,b')) if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') bad.push('clip ' + el.textContent.slice(0, 20));
        return bad;
      });
      if (r.length) issues.push(`${theme}-${ts}: ${r.join('; ')}`);
      await p.screenshot({ path: path.join(out, `M5-sketch-${theme}-${ts * 100}.png`), fullPage: true });
      await p.close();
    }
    const f = await b.newPage({ viewport: { width: 390, height: 844 } });
    await f.goto('file://' + path.join(dir, 'field-test', 'feedback-form.html'));
    const fw = await f.evaluate(() => document.documentElement.scrollWidth);
    if (fw > 390) issues.push('form hscroll at 390: ' + fw);
    await f.screenshot({ path: path.join(out, 'feedback-form-390.png'), fullPage: true });
    await f.emulateMedia({ media: 'print' });
    const pages = await f.evaluate(() => {
      // overlap check inside each question row
      const bad = [];
      document.querySelectorAll('ol.q > li').forEach((li, i) => { const a = li.children[0].getBoundingClientRect(), c = li.querySelector('.faces').getBoundingClientRect(); if (a.right > c.left + 1 && a.bottom > c.top) bad.push('q' + (i + 1) + ' text overlaps faces'); });
      return bad;
    });
    issues.push(...pages);
    await f.pdf({ path: path.join(dir, 'field-test', 'feedback-form.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
    const pr = await b.newPage({ viewport: { width: 794, height: 1123 } });
    await pr.goto('file://' + path.join(dir, 'field-test', 'feedback-form.html'));
    await pr.emulateMedia({ media: 'print' });
    await pr.screenshot({ path: path.join(out, 'feedback-form-a4-print.png'), fullPage: true });
    await b.close();
    console.log(issues.length ? 'ISSUES:\n' + issues.join('\n') : 'no clipping/overlap/target issues');
  })();
}
