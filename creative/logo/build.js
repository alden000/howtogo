// Generates the logo B ("去 seal") master files and PNG exports.
// Run: node creative/logo/build.js   (needs playwright with chromium)
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'final');
const C = { seal: '#9A3412', paper: '#FBF5EC', dot: '#FFD23F' };

// Glyph on a 512 grid, aligned to 32-unit cells (= 1px at 16px) so the favicon is crisp.
// 土 (vertical, short bar, long bar) over 厶 (撇折 = the path) ending at the saffron dot (点 = arrived).
// hw / vw: horizontal / vertical-and-diagonal stroke weights (horizontals slightly lighter, optically equal).
const GEOM = {
  // master: optically balanced (horizontals lighter), 厶's last arm rises toward the dot
  master: { v: 'M256 96V204', h1: 'M196 128H316', h2: 'M100 216H412', path: 'M262 292L178 408L304 396', dot: [388, 392, 44], hw: 50, vw: 56 },
  // favicon: every bar sits on the 32-unit grid (1 px at 16 px, 2 px at 32 px)
  pixel: { v: 'M256 64V192', h1: 'M192 96H320', h2: 'M96 192H416', path: 'M256 288L160 416H288', dot: [384, 408, 48], hw: 64, vw: 64 },
};
function glyph({ fill = C.paper, dot = C.dot, g = GEOM.master, cls = '' } = {}) {
  const s = `fill="none" stroke="${fill}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<g class="qu ${cls}">
    <path class="qu-v" d="${g.v}" ${s} stroke-width="${g.vw}"/>
    <path class="qu-h1" d="${g.h1}" ${s} stroke-width="${g.hw}"/>
    <path class="qu-h2" d="${g.h2}" ${s} stroke-width="${g.hw}"/>
    <path class="qu-path" d="${g.path}" ${s} stroke-width="${g.vw}"/>
    <circle class="qu-dot" cx="${g.dot[0]}" cy="${g.dot[1]}" r="${g.dot[2]}" fill="${dot}"/>
  </g>`;
}
const svg = (inner, label, vb = '0 0 512 512') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${label}">\n  <title>${label}</title>\n  ${inner}\n</svg>\n`;
const at = (k, g) => `<g transform="translate(256 262) scale(${k}) translate(-256 -256)">${g}</g>`;

// icon: rounded-square seal, inner chop frame, glyph at 78%
const ICON = `<rect width="512" height="512" rx="112" fill="${C.seal}"/>
  <rect x="40" y="40" width="432" height="432" rx="80" fill="none" stroke="${C.paper}" stroke-width="12" opacity=".9"/>
  ${at(0.84, glyph())}`;
// favicon: no inner frame (it would blur), glyph full size on the pixel grid
const FAV = `<rect width="512" height="512" rx="96" fill="${C.seal}"/>\n  ${glyph({ g: GEOM.pixel })}`;
// maskable: full bleed; glyph inside the central 80% circle (r 204.8)
const MASK = `<rect width="512" height="512" fill="${C.seal}"/>\n  ${at(0.74, glyph())}`;
// mono: one colour, glyph and dot knocked out of the seal
const MONO = `<defs><mask id="k"><rect width="512" height="512" fill="#fff"/>${glyph({ fill: '#000', dot: '#000' })}</mask></defs>
  <rect width="512" height="512" rx="112" fill="currentColor" mask="url(#k)"/>`;
// wordmark: mark + 怎么去? (build renders the text as HTML in Noto Sans SC 900; this SVG is for docs/print)
const WORD = `<rect width="512" height="512" rx="112" fill="${C.seal}"/>${at(0.86, glyph())}
  <text x="600" y="368" font-family="'Noto Sans SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei','WenQuanYi Zen Hei',sans-serif" font-weight="900" font-size="300" fill="#1D1915">怎么去?</text>`;

const files = {
  'icon.svg': svg(ICON, '怎么去? app icon'),
  'favicon.svg': svg(FAV, '怎么去?'),
  'maskable.svg': svg(MASK, '怎么去? maskable icon'),
  'mono.svg': svg(MONO, '怎么去? mono mark'),
  'wordmark.svg': svg(WORD, '怎么去?', '0 0 1820 512'),
};
for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), s);

(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  const shot = async (file, size, out) => {
    const src = fs.readFileSync(path.join(OUT, file), 'utf8');
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${src}`);
    await p.screenshot({ path: path.join(OUT, out), omitBackground: true });
  };
  await shot('icon.svg', 192, 'icon-192.png');
  await shot('icon.svg', 512, 'icon-512.png');
  await shot('maskable.svg', 192, 'maskable-192.png');
  await shot('maskable.svg', 512, 'maskable-512.png');
  // Apple applies its own corner mask: use the full-bleed art
  await shot('maskable.svg', 180, 'apple-touch-icon-180.png');
  await shot('favicon.svg', 32, 'favicon-32.png');
  await shot('favicon.svg', 16, 'favicon-16.png');

  // check sheet: PNG exports shown at native pixels (no smoothing) on light and dark
  const img = f => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64');
  const svgUrl = f => 'data:image/svg+xml;base64,' + Buffer.from(fs.readFileSync(path.join(OUT, f))).toString('base64');
  const row = (bg, ink) => `<div class="row" style="background:${bg};color:${ink}">
      <figure><img src="${img('favicon-16.png')}" width="16"><figcaption>16</figcaption></figure>
      <figure><img src="${img('favicon-32.png')}" width="32"><figcaption>32</figcaption></figure>
      <figure><img src="${svgUrl('favicon.svg')}" width="48"><figcaption>48</figcaption></figure>
      <figure><img src="${img('icon-192.png')}" width="192"><figcaption>icon 192</figcaption></figure>
      <figure><img class="circle" src="${img('maskable-192.png')}" width="192"><figcaption>maskable · circle</figcaption></figure>
      <figure><img class="squircle" src="${img('maskable-192.png')}" width="192"><figcaption>maskable · squircle</figcaption></figure>
      <figure><img src="${img('apple-touch-icon-180.png')}" width="180" style="border-radius:40px"><figcaption>apple 180</figcaption></figure>
      <figure style="color:${ink}"><span class="mono">${fs.readFileSync(path.join(OUT, 'mono.svg'), 'utf8')}</span><figcaption>mono 48 · 24</figcaption></figure>
    </div>`;
  await p.setViewportSize({ width: 1500, height: 900 });
  await p.setContent(`<style>body{margin:0;font:14px system-ui}.row{display:flex;gap:28px;align-items:flex-end;padding:28px}
    figure{margin:0;text-align:center}figcaption{margin-top:8px;opacity:.75}img{image-rendering:pixelated;display:block;margin:auto}
    .circle{clip-path:circle(50%)}.squircle{border-radius:32%}.safe{position:relative}
    .mono svg{width:48px;height:48px;display:inline-block}.mono svg+svg{}
    .word{padding:28px;display:flex;gap:40px;align-items:center}.word img{height:72px}.zoom img{image-rendering:pixelated}</style>
    ${row('#FBF5EC', '#1D1915')}${row('#14110E', '#F6EEE4')}${row('#FFFFFF', '#1D1915')}
    <div class="word" style="background:#FBF5EC"><img src="${svgUrl('wordmark.svg')}"><span class="zoom"><img src="${img('favicon-16.png')}" style="height:128px"> <img src="${img('favicon-32.png')}" style="height:128px"></span><span style="opacity:.7">16 and 32 px exports at 8× / 4× (pixel check)</span></div>`);
  await p.evaluate(() => document.querySelectorAll('.mono').forEach(m => m.insertAdjacentHTML('beforeend', m.innerHTML.replace('<svg', '<svg style="width:24px;height:24px"'))));
  await p.screenshot({ path: path.join(OUT, 'check.png'), fullPage: true });
  await b.close();
})();
