// Terse bundle report: gzip size of app JS (excluding MapLibre) vs the 150 KB budget.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const dir = new URL('../dist/', import.meta.url);
const BUDGET = 150 * 1024;
const files = readdirSync(new URL('assets/', dir)).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
let app = 0, map = 0, css = 0;
const rows = [];
for (const f of files) {
  const gz = gzipSync(readFileSync(new URL('assets/' + f, dir))).length;
  const isMap = /maplibre/i.test(f);
  if (f.endsWith('.css')) css += gz;
  else if (isMap) map += gz;
  else app += gz;
  rows.push([f, gz]);
}
const sw = gzipSync(readFileSync(new URL('sw.js', dir))).length;
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
if (process.env.SIZE_VERBOSE) for (const [f, gz] of rows.sort((a, b) => b[1] - a[1])) console.log(`  ${f} ${kb(gz)}`);
console.log(`build ok · app js ${kb(app)} gz (budget ${kb(BUDGET)}) · maplibre ${kb(map)} gz (lazy) · css ${kb(css)} · sw ${kb(sw)}`);
if (app > BUDGET) {
  console.error('app JS over budget');
  process.exit(1);
}
