// `npm run build` bundle report: M5 AC 3 budgets (scripts/budget.mjs). SIZE_VERBOSE=1 lists every chunk.
import { fileURLToPath } from 'node:url';
import { checkBudgets } from './budget.mjs';
const r = checkBudgets(fileURLToPath(new URL('../dist/', import.meta.url)));
if (process.env.SIZE_VERBOSE) for (const [f, s] of r.appRows) console.log(`  ${f} ${(s / 1024).toFixed(1)} KB`);
console.log(`build ok · ${r.line}`);
if (!r.ok) {
  for (const f of r.fails) console.error(`budget FAIL: ${f}`);
  process.exit(1);
}
