// Bundle budget (AC 46): app JS excl. MapLibre ≤ 150 KB gz; MapLibre must be a separate (lazy) chunk not referenced by index.html.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const dist = process.argv[2] ?? new URL('../.out/dist', import.meta.url).pathname;
let app = 0, map = 0;
for (const f of readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))) {
  const gz = gzipSync(readFileSync(join(dist, 'assets', f))).length;
  if (/maplibre/i.test(f)) map += gz; else app += gz;
}
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const kb = (n) => (n / 1024).toFixed(1);
const lazy = !/maplibre/i.test(html);
console.log(`size: app js ${kb(app)} KB gz (budget 150) · maplibre ${kb(map)} KB gz · lazy=${lazy}`);
if (app > 150 * 1024 || !lazy || map === 0) { console.log('size FAIL'); process.exit(1); }
