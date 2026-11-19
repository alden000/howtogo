#!/usr/bin/env node
/**
 * Report for a search-rewrite eval run. Accuracy is the headline.
 *   node qa/evals/search-rewrite/report.mjs [results/run-*.jsonl]   (default: newest run-*.jsonl)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RESULTS_DIR } from "./lib.mjs";

const CALLS_PER_DAY = 50;
let file = process.argv[2];
if (!file) {
  const runs = readdirSync(RESULTS_DIR).filter((f) => /^run-.*\.jsonl$/.test(f)).sort();
  if (!runs.length) {
    console.error("No results/run-*.jsonl yet. Run run.mjs first (or pass a file).");
    process.exit(1);
  }
  file = join(RESULTS_DIR, runs.at(-1));
}
const all = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const rows = all.filter((r) => !r.rejected);
const rejected = all.filter((r) => r.rejected);

// ---------------- stats ----------------
/** Wilson 95 % interval for k successes of n. */
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
/** Exact two-sided McNemar p from discordant counts b, c (binomial, p = 0.5). */
function mcnemar(b, c) {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let lp = -n * Math.log(2);
  let term = Math.exp(lp); // C(n,0)/2^n
  let s = term;
  for (let i = 1; i <= k; i++) {
    term *= (n - i + 1) / i;
    s += term;
  }
  return Math.min(1, 2 * s);
}
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const ci = (k, n) => {
  const [lo, hi] = wilson(k, n);
  return `${pct(k / (n || 1))} [${(100 * lo).toFixed(0)}–${(100 * hi).toFixed(0)}]`;
};
const quant = (xs, q) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
function table(head, body) {
  const w = head.map((h, i) => Math.max(h.length, ...body.map((r) => String(r[i]).length)));
  const line = (r) => "| " + r.map((x, i) => String(x).padEnd(w[i])).join(" | ") + " |";
  return [line(head), "|" + w.map((n) => "-".repeat(n + 2)).join("|") + "|", ...body.map(line)].join("\n");
}

// ---------------- per arm ----------------
const arms = [...new Set(rows.map((r) => r.arm))];
const key = (r) => `${r.case}#${r.rep}`;
const S = {};
for (const a of arms) {
  const rs = rows.filter((r) => r.arm === a);
  const n = rs.length;
  const k = rs.filter((r) => r.verdict === "CORRECT").length;
  const wrong = rs.filter((r) => r.verdict === "WRONG").length;
  const none = rs.filter((r) => r.verdict === "NONE").length;
  const err = rs.filter((r) => r.verdict === "ERROR").length;
  const di = rs.filter((r) => r.category === "dont_invent");
  const firsts = rs.filter((r) => r.category !== "dont_invent");
  const lat = rs.map((r) => r.latencyMs).filter((x) => x != null);
  const u = rs.map((r) => r.usage).filter(Boolean);
  const cost = rs.reduce((s, r) => s + (r.cost ?? 0), 0);
  const perCall = n ? cost / n : 0;
  S[a] = {
    n, k, wrong, none, err, cost, perCall,
    model: rs[0]?.model,
    di: [di.filter((r) => r.verdict === "CORRECT").length, di.length],
    first: [firsts.filter((r) => r.firstTermCorrect).length, firsts.length],
    top: [firsts.filter((r) => r.topResultCorrect).length, firsts.length],
    p50: quant(lat, 0.5), p90: quant(lat, 0.9),
    inTok: u.length ? u.reduce((s, x) => s + (x.input_tokens ?? 0) + (x.cache_creation_input_tokens ?? 0) + (x.cache_read_input_tokens ?? 0), 0) / u.length : 0,
    outTok: u.length ? u.reduce((s, x) => s + (x.output_tokens ?? 0), 0) / u.length : 0,
    fallbacks: rs.filter((r) => r.servedModel && r.model && !String(r.servedModel).startsWith(r.model)).length,
    byKey: new Map(rs.map((r) => [key(r), r])),
  };
}

console.log(`# Search-rewrite eval — ${file}${rows.some((r) => r.stub) ? "  (STUB data: dry run, numbers are not real)" : ""}\n`);
const cases = new Set(rows.map((r) => r.case));
const reps = new Set(rows.map((r) => r.rep));
console.log(`${cases.size} cases x ${reps.size} rep(s). Accuracy = CORRECT / all calls (errors count as not correct). [..] = Wilson 95 % CI.\n`);

console.log("## Accuracy (headline)\n");
console.log(
  table(
    ["arm", "n", "accuracy", "WRONG place (danger)", "none", "errors", "first term correct", "top result correct", "don't-invent pass"],
    arms.map((a) => {
      const s = S[a];
      return [a, s.n, ci(s.k, s.n), `${s.wrong} = ${ci(s.wrong, s.n)}`, pct(s.none / (s.n || 1)), s.err, ci(...s.first), ci(...s.top), ci(...s.di)];
    }),
  ),
);

console.log("\n## Cost and latency\n");
console.log(
  table(
    ["arm", "model", "p50 ms", "p90 ms", "avg in tok", "avg out tok (incl. thinking)", "cost / call", "monthly @ 50/day", "run cost", "fallbacks served"],
    arms.map((a) => {
      const s = S[a];
      return [a, s.model, s.p50, s.p90, s.inTok.toFixed(0), s.outTok.toFixed(0), `$${s.perCall.toFixed(5)}`, `$${(s.perCall * CALLS_PER_DAY * 30).toFixed(2)}`, `$${s.cost.toFixed(4)}`, s.fallbacks];
    }),
  ),
);
if (rejected.length) console.log(`\nRejected arms: ${rejected.map((r) => `${r.arm} (${r.detail})`).join("; ")}`);

// ---------------- paired comparison ----------------
console.log("\n## Paired comparison (same case+rep; exact McNemar)\n");
const pairRows = [];
const paired = (a, b) => {
  let ab = 0, ba = 0, both = 0;
  for (const [k, ra] of S[a].byKey) {
    const rb = S[b].byKey.get(k);
    if (!rb) continue;
    both++;
    const ca = ra.verdict === "CORRECT", cb = rb.verdict === "CORRECT";
    if (ca && !cb) ab++;
    if (cb && !ca) ba++;
  }
  return { ab, ba, both, p: mcnemar(ab, ba) };
};
for (let i = 0; i < arms.length; i++)
  for (let j = i + 1; j < arms.length; j++) {
    const { ab, ba, both, p } = paired(arms[i], arms[j]);
    pairRows.push([`${arms[i]} vs ${arms[j]}`, both, ab, ba, p.toFixed(3)]);
  }
console.log(pairRows.length ? table(["pair (A vs B)", "paired", "A right, B wrong", "B right, A wrong", "p"], pairRows) : "(one arm only)");

// ---------------- per category ----------------
console.log("\n## Accuracy by category\n");
const cats = [...new Set(rows.map((r) => r.category))].sort();
console.log(
  table(
    ["category", ...arms],
    cats.map((cat) => [
      cat,
      ...arms.map((a) => {
        const rs = rows.filter((r) => r.arm === a && r.category === cat);
        const k = rs.filter((r) => r.verdict === "CORRECT").length;
        const w = rs.filter((r) => r.verdict === "WRONG").length;
        return `${k}/${rs.length}${w ? ` (${w} wrong)` : ""}`;
      }),
    ]),
  ),
);

// ---------------- stability ----------------
if (reps.size > 1) {
  console.log("\n## Run-to-run stability (same verdict on every rep)\n");
  console.log(
    table(
      ["arm", "stable cases"],
      arms.map((a) => {
        const by = {};
        for (const r of rows.filter((x) => x.arm === a)) (by[r.case] ??= new Set()).add(r.verdict);
        const v = Object.values(by);
        return [a, `${v.filter((s) => s.size === 1).length}/${v.length}`];
      }),
    ),
  );
}

// ---------------- wrong-place detail ----------------
const wrongs = rows.filter((r) => r.verdict === "WRONG");
if (wrongs.length) {
  console.log("\n## WRONG-place outputs\n");
  for (const r of wrongs) console.log(`- ${r.arm} ${r.case}: ${r.out?.confidence} [${(r.out?.terms ?? []).join(" | ")}]`);
}

// ---------------- decision ----------------
console.log("\n## Decision\n");
if (!arms.length) process.exit(0);
const acc = (a) => S[a].k / (S[a].n || 1);
const best = [...arms].sort((a, b) => acc(b) - acc(a) || S[a].wrong - S[b].wrong || S[a].perCall - S[b].perCall)[0];
let pick = best;
let why = "it has the best accuracy and no cheaper arm qualifies (or it is the cheapest)";
for (const a of [...arms].sort((x, y) => S[x].perCall - S[y].perCall)) {
  if (a === best) break;
  const { ab, ba, p } = paired(a, best);
  const notBelow = acc(a) >= acc(best) || p >= 0.05;
  const wrongOk = S[a].wrong <= S[best].wrong + 1;
  if (notBelow && wrongOk) {
    pick = a;
    why = `cheapest arm not significantly below the best (${best}: McNemar p = ${p.toFixed(3)}, ${ab} vs ${ba} discordant) with WRONG-place ${S[a].wrong} <= ${S[best].wrong} + 1`;
    break;
  }
}
console.log(`Best accuracy: ${best} (${pct(acc(best))}, ${S[best].wrong} wrong-place).`);
console.log(`RECOMMEND: ${pick} — ${why}. Cost/call $${S[pick].perCall.toFixed(5)}, ~$${(S[pick].perCall * CALLS_PER_DAY * 30).toFixed(2)}/month at ${CALLS_PER_DAY} calls/day.`);
console.log("Rule: cheapest arm whose accuracy is not significantly below the best (McNemar p >= 0.05) AND whose WRONG-place count <= best + 1; else the best arm.");
if (cases.size < 30) console.log("Caution: fewer than 30 cases; the test has little power.");
