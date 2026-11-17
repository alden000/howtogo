// M2 AC 37 (D-4): device APIs only through the Platform adapter.
// Fails on navigator.geolocation, speechSynthesis, navigator.wakeLock, navigator.vibrate or Notification
// in code outside src/web/src/platform/ (comments are stripped first). Also checks the six haptic names.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = new URL('../..', import.meta.url).pathname;
const BAD = /navigator\s*\.\s*geolocation|speechSynthesis|navigator\s*\.\s*wakeLock|navigator\s*\.\s*vibrate|\bNotification\b/;
const findings = [];
let files = 0;
function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (n === 'node_modules' || n === 'dist') continue;
    if (statSync(p).isDirectory()) { if (relative(root, p) !== 'src/web/src/platform') walk(p); continue; }
    if (!/\.(ts|tsx|js|mjs)$/.test(n)) continue;
    files++;
    const code = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    code.split('\n').forEach((l, i) => BAD.test(l) && findings.push(`${relative(root, p)}:${i + 1}: ${l.trim().slice(0, 100)}`));
  }
}
walk(join(root, 'src/web/src'));
walk(join(root, 'src/shared/src'));
// Haptic names (STYLE-GUIDE §3 / 6c.13).
const types = readFileSync(join(root, 'src/web/src/platform/types.ts'), 'utf8') + readFileSync(join(root, 'src/shared/src/trip.ts'), 'utf8');
for (const old of ["'tap'", "'notice'", "'get_off'", "'arrived'"]) if (new RegExp(`(VibratePattern|HapticName)[^;]*${old}`).test(types)) findings.push(`old haptic name ${old}`);
for (const n of ['tick', 'confirm', 'attention', 'getoff', 'arrive', 'gentle']) if (!types.includes(`'${n}'`)) findings.push(`haptic name missing: ${n}`);
if (findings.length) { console.log(`platform-grep FAIL (${findings.length})`); for (const f of findings) console.log('  ' + f); process.exit(1); }
console.log(`platform-grep ok (${files} files outside platform/, 6 haptic names)`);
