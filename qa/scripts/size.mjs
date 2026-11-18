// Gate `build` step, M5 AC 3 bundle budgets (gzip): Home entry ≤ 100 KB, app JS excl. MapLibre ≤ 250 KB, family viewer
// ≤ 60 KB, CSS ≤ 30 KB, MapLibre a separate chunk never referenced by index.html. One implementation shared with the
// web build: src/web/scripts/budget.mjs. An overrun prints the chunk names and sizes.
import { fileURLToPath } from 'node:url';
import { checkBudgets } from '../../src/web/scripts/budget.mjs';
const dist = process.argv[2] ?? fileURLToPath(new URL('../.out/dist', import.meta.url));
const r = checkBudgets(dist);
console.log(`size: ${r.line}`);
for (const f of r.fails) console.log(`size FAIL: ${f}`);
if (!r.ok) process.exit(1);
