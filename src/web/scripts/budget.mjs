// M5 AC 3 bundle budgets (gzip), one implementation for the web build (`npm run build`, scripts/size.mjs) and the
// gate's `build` step (qa/scripts/size.mjs):
//   home    JS index.html loads eagerly (entry + modulepreloads)             ≤ 100 KB
//   app     all app JS excluding MapLibre and the family viewer entry          ≤ 250 KB (ROADMAP hard ceiling 300)
//   viewer  JS reachable from viewer.html, excluding MapLibre                  ≤ 60 KB (M4)
//   css     app CSS (inlined into index.html or linked), excluding MapLibre's ≤ 30 KB
//   maplibre a separate chunk, never referenced by index.html (lazy; static-pwa checks it is not precached)
// An overrun fails with the chunk names and sizes.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

export const BUDGETS = { home: 100 * 1024, app: 250 * 1024, viewer: 60 * 1024, css: 30 * 1024 };
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const gz = (dist, f) => gzipSync(readFileSync(join(dist, f))).length;
const isViewer = (f) => /(^|\/)viewer/i.test(f);
const isMap = (f) => /maplibre/i.test(f);

/** JS files reachable from an HTML entry: its scripts/modulepreloads, plus static/dynamic imports (transitively). */
export function reachable(dist, htmlFile, { dynamic = true } = {}) {
  const html = readFileSync(join(dist, htmlFile), 'utf8');
  const queue = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  const seen = new Set();
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f) || isMap(f) || !existsSync(join(dist, f))) continue;
    seen.add(f);
    if (!dynamic) continue;
    const code = readFileSync(join(dist, f), 'utf8');
    for (const m of code.matchAll(/["'](?:\.\/|\/?assets\/)([\w.-]+\.js)["']/g)) queue.push('assets/' + m[1]);
  }
  return [...seen];
}

export function checkBudgets(dist) {
  const files = readdirSync(join(dist, 'assets'));
  const js = files.filter((f) => f.endsWith('.js')).map((f) => 'assets/' + f);
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const fails = [];
  const rows = (list) => list.map((f) => [f, gz(dist, f)]).sort((a, b) => b[1] - a[1]);
  const sum = (r) => r.reduce((n, [, s]) => n + s, 0);

  // home: what index.html loads before first paint (no dynamic imports)
  const homeRows = rows(reachable(dist, 'index.html', { dynamic: false }));
  const home = sum(homeRows);
  // app: every non-MapLibre, non-viewer chunk
  const appRows = rows(js.filter((f) => !isMap(f) && !isViewer(f)));
  const app = sum(appRows);
  // viewer
  const viewerRows = existsSync(join(dist, 'viewer.html')) ? rows(reachable(dist, 'viewer.html')) : [];
  const viewer = sum(viewerRows);
  // css: inlined <style> blocks + linked app stylesheets
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce((n, m) => n + gzipSync(m[1]).length, 0);
  const linked = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"/g)].reduce((n, m) => n + gz(dist, m[1]), 0);
  const css = inline + linked;
  const mapChunk = js.some(isMap);
  const mapEager = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].some((m) => isMap(m[1]));

  const over = (name, total, budget, list) => {
    if (total <= budget) return;
    fails.push(`${name} ${kb(total)} > ${kb(budget)}: ` + list.slice(0, 8).map(([f, s]) => `${f.replace('assets/', '')} ${kb(s)}`).join(', '));
  };
  over('home entry', home, BUDGETS.home, homeRows);
  over('app js', app, BUDGETS.app, appRows);
  over('viewer js', viewer, BUDGETS.viewer, viewerRows);
  if (css > BUDGETS.css) fails.push(`css ${kb(css)} > ${kb(BUDGETS.css)}`);
  if (!mapChunk) fails.push('maplibre: no separate chunk');
  if (mapEager) fails.push('maplibre: referenced by index.html (must stay lazy)');
  const map = js.filter(isMap).reduce((n, f) => n + gz(dist, f), 0);
  const line = `home ${kb(home)}/${kb(BUDGETS.home)} · app js ${kb(app)}/${kb(BUDGETS.app)} · viewer ${kb(viewer)}/${kb(BUDGETS.viewer)} · css ${kb(css)}/${kb(BUDGETS.css)} · maplibre ${kb(map)} lazy=${mapChunk && !mapEager}`;
  return { ok: fails.length === 0, line, fails, home, app, viewer, css, homeRows, appRows };
}
