/**
 * 1.1 alias check (QA): for every curated alias entry, ask the project's OWN live search API for the entry's
 * first OneMap term and record the entries that come back with 0 results (the term is dead in OneMap).
 * Station zh names are not checked (they come from the station table, not from this list).
 *   npx vite-node qa/scripts/alias-live.ts            → qa/.out/alias-live.json + a summary on stdout
 * Rules: read-only GETs, `step=1` (Layer 1 only, so the Worker never runs the paid rewrite), ≥ 1.1 s apart,
 * ≤ 200 requests, UA `HowToGo-QA/1.1` (no contact details in any header).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ALIASES } from '../../src/shared/src/alias-data';

const BASE = 'https://howtogo.wwweeeiii.com/api/search';
// The Worker's read limit is 60/min per client: 1.1 s apart stays under it. RETRY=<json file> re-asks only
// the rows of an earlier run that were not answered (429 etc.), de-duplicated by term, and merges them in.
const GAP_MS = Number(process.env.GAP_MS ?? 1100);
const RETRY = process.env.RETRY;
const MAX_REQUESTS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = {
  idx: number;
  keys: string;
  term: string;
  status: number;
  n: number | null;
  error?: string;
};
const prev: Row[] = RETRY ? JSON.parse(readFileSync(RETRY, 'utf8')).rows : [];
const redo = new Set(prev.filter((r) => r.status !== 200 || r.n === null).map((r) => r.idx));
const rows: Row[] = prev.filter((r) => !redo.has(r.idx));
const byTerm = new Map<string, Row>();
let sent = 0;
for (const [idx, e] of ALIASES.entries()) {
  if (RETRY && !redo.has(idx)) continue;
  if (sent >= MAX_REQUESTS) break;
  const same = byTerm.get(e.terms[0]!);
  if (same) {
    rows.push({ ...same, idx, keys: e.keys.slice(0, 3).join(' / ') });
    continue;
  }
  const term = e.terms[0]!;
  const u = `${BASE}?q=${encodeURIComponent(term)}&step=1`;
  let row: Row = {
    idx,
    keys: e.keys.slice(0, 3).join(' / '),
    term,
    status: 0,
    n: null,
  };
  try {
    sent++;
    const res = await fetch(u, {
      headers: { 'User-Agent': 'HowToGo-QA/1.1', Accept: 'application/json' },
    });
    row.status = res.status;
    const body = (await res.json().catch(() => null)) as {
      results?: unknown[];
    } | null;
    row.n = Array.isArray(body?.results) ? body!.results!.length : null;
  } catch (err) {
    row.error = String(err).slice(0, 120);
  }
  rows.push(row);
  byTerm.set(term, row);
  await sleep(GAP_MS);
}
mkdirSync('qa/.out', { recursive: true });
rows.sort((a, b) => a.idx - b.idx);
writeFileSync('qa/.out/alias-live.json', JSON.stringify({ at: new Date().toISOString(), requests: sent, rows }, null, 1));
const dead = rows.filter((r) => r.status === 200 && r.n === 0);
const odd = rows.filter((r) => r.status !== 200 || r.n === null);
console.log(`alias-live: ${rows.length} entries, ${sent} requests, ${dead.length} dead (0 results), ${odd.length} not 200/unparsed`);
for (const r of dead) console.log(`DEAD #${r.idx} [${r.keys}] → "${r.term}"`);
for (const r of odd) console.log(`ODD  #${r.idx} [${r.keys}] → "${r.term}" status ${r.status} ${r.error ?? ''}`);
