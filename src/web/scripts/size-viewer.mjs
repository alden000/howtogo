// Family viewer budget (M4 AC 17): JS reachable from viewer.html (static + dynamic imports),
// excluding MapLibre itself, must stay ≤ 60 KB gz.
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const dir = new URL('../dist/', import.meta.url);
const BUDGET = 60 * 1024;
if (!existsSync(new URL('viewer.html', dir))) {
  console.error('viewer.html missing from dist');
  process.exit(1);
}
const html = readFileSync(new URL('viewer.html', dir), 'utf8');
const seen = new Set();
const queue = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let js = 0;
while (queue.length) {
  const f = queue.shift();
  if (seen.has(f) || /maplibre/i.test(f)) continue;
  seen.add(f);
  const code = readFileSync(new URL(f, dir), 'utf8');
  js += gzipSync(code).length;
  for (const m of code.matchAll(/["'](?:\.\/|\/?assets\/)([\w.-]+\.js)["']/g)) queue.push('assets/' + m[1]);
}
const css = [...html.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].reduce((n, m) => n + gzipSync(readFileSync(new URL(m[1], dir))).length, 0);
console.log(`viewer js ${(js / 1024).toFixed(1)} KB gz (budget 60.0 KB, excl. maplibre; ${seen.size} files) · css ${(css / 1024).toFixed(1)} KB`);
if (js > BUDGET) {
  console.error('viewer JS over budget');
  process.exit(1);
}
