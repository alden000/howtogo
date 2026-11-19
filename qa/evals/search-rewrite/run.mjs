#!/usr/bin/env node
/**
 * Search-rewrite eval runner: compares Claude arms on the Worker's rewrite step, graded against live
 * OneMap results (through the project's own API).
 *
 *   node qa/evals/search-rewrite/run.mjs --dry-run         # no Anthropic calls: validates cases + grader
 *   node qa/evals/search-rewrite/run.mjs                   # paid run, all arms (hard stop at $1.50)
 *   node qa/evals/search-rewrite/run.mjs --models haiku,sonnet-low --repeat 2 --budget 1.5
 *
 * The API key is read from D:\keys\anthropic-key.txt at run time only. It is never printed, logged,
 * written anywhere or taken from the environment.
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prod, grade, search, searchAll, matches, loadCases, costOf, RESULTS_DIR } from "./lib.mjs";

const KEY_FILE = "D:\\keys\\anthropic-key.txt";

/** Arms. `fallbacks`: production sends server-side refusal fallback "default"; Haiku 5.5 has none. */
const ARMS = {
  "opus-low": { model: "claude-opus-5-5", effort: "low", fallbacks: true },
  "sonnet-low": { model: "claude-sonnet-5-5", effort: "low", fallbacks: true },
  "sonnet-between-tools": { model: "claude-sonnet-5-5", effort: "low", fallbacks: true, thinking: { type: "between_tools" } },
  "haiku-low": { model: "claude-haiku-5-5", effort: "low", fallbacks: false },
};
const ALIASES = { opus: "opus-low", sonnet: "sonnet-low", "sonnet-bt": "sonnet-between-tools", haiku: "haiku-low" };

// ---------------- args ----------------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const DRY = flag("--dry-run");
const REPEAT = Math.max(1, Number(opt("--repeat", "1")) || 1);
const BUDGET = Number(opt("--budget", "1.5"));
if (!(BUDGET > 0 && BUDGET <= 1.5)) {
  console.error("--budget must be > 0 and <= 1.50 (the owner's hard cap).");
  process.exit(2);
}
const armNames = opt("--models", Object.keys(ARMS).join(","))
  .split(",")
  .map((s) => ALIASES[s.trim()] ?? s.trim())
  .filter(Boolean);
for (const a of armNames)
  if (!ARMS[a]) {
    console.error(`Unknown arm "${a}". Arms: ${Object.keys(ARMS).join(", ")} (short: ${Object.keys(ALIASES).join(", ")})`);
    process.exit(2);
  }
const onlyCases = opt("--cases", "");

// ---------------- cases ----------------
const P = await prod();
let cases = loadCases();
if (onlyCases) cases = cases.filter((c) => onlyCases.split(",").includes(c.id));
validateCases(cases);

function validateCases(cs) {
  const ids = new Set();
  const problems = [];
  for (const c of cs) {
    if (!c.id || ids.has(c.id)) problems.push(`duplicate/missing id: ${c.id}`);
    ids.add(c.id);
    if (!c.query || c.query.length > P.AI_MAX_QUERY) problems.push(`${c.id}: bad query length`);
    if (c.category !== "dont_invent" && !(c.accept?.postal?.length || c.accept?.names?.length)) problems.push(`${c.id}: no accepted target`);
    // The eval targets queries the alias table does NOT cover (that is when production calls Claude).
    const x = P.expandAliases(c.query);
    if (x.match !== "none") problems.push(`${c.id}: covered by the alias table (${x.match} -> ${x.terms.join(" | ")})`);
  }
  if (problems.length) {
    console.error("Case validation failed:\n  " + problems.join("\n  "));
    process.exit(1);
  }
}

// ---------------- dry run ----------------
if (DRY) {
  console.log(`DRY RUN: ${cases.length} cases, arms ${armNames.join(", ")}; no Anthropic calls.`);
  console.log(`Production prompt: ${P.SYSTEM_PROMPT.length} chars; schema + sanitise loaded from src/worker/src/claude.ts.`);
  // Schema check with the production Zod schema.
  const okParse = P.RewriteSchema.safeParse({ terms: ["Tan Tock Seng Hospital"], confidence: "high" }).success;
  const badParse = P.RewriteSchema.safeParse({ terms: [], confidence: "sure" }).success;
  if (!okParse || badParse) throw new Error("RewriteSchema behaves unexpectedly");
  let fails = 0;
  let warn = 0;
  const byCat = {};
  for (const c of cases) {
    // Stub "model": the accepted official name first, then the postal code. A good model should do at least this well.
    const stubTerms = P.sanitise([...(c.accept.names ?? []).slice(0, 1), ...(c.accept.postal ?? []).slice(0, 1)]);
    const stub = c.category === "dont_invent" ? { ok: true, terms: [c.query], confidence: "low" } : { ok: true, terms: stubTerms, confidence: "high" };
    const g = await grade(c, stub);
    // Negative control: a deliberately wrong place must grade WRONG, never CORRECT.
    const neg = c.category === "dont_invent" ? await grade(c, { ok: true, terms: ["Ang Mo Kio Hub"], confidence: "high" }) : await grade(c, { ok: true, terms: ["Jurong Bird Park Road"], confidence: "high" });
    // Would production really call Claude for this query? (Layer 1 = alias + direct OneMap, < 2 hits.)
    const l1 = await searchAll(c.query);
    const l1Hit = c.category !== "dont_invent" && l1.some((h) => matches(h, c.accept ?? {}));
    const msgs = [];
    if (g.verdict !== "CORRECT") msgs.push(`FAIL stub=${g.verdict} (target not found via ${stubTerms.join(" | ")})`);
    if (neg.verdict === "CORRECT") msgs.push(`FAIL negative control graded CORRECT`);
    if (c.category !== "dont_invent" && !g.firstTermCorrect) msgs.push(`warn: name "${stubTerms[0]}" alone does not find it`);
    if (l1.length >= 2) msgs.push(`warn: Layer 1 already returns ${l1.length} hits${l1Hit ? " incl. the target" : ""} (production would not call Claude)`);
    if (msgs.some((m) => m.startsWith("FAIL"))) fails++;
    else if (msgs.length) warn++;
    byCat[c.category] = (byCat[c.category] ?? 0) + 1;
    console.log(`${msgs.some((m) => m.startsWith("FAIL")) ? "FAIL" : msgs.length ? "warn" : " ok "}  ${c.id.padEnd(26)} ${msgs.join("; ")}`);
  }
  console.log(`\nCases by category: ${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(", ")} (total ${cases.length})`);
  console.log(`Grader validation: ${cases.length - fails}/${cases.length} pass, ${warn} with warnings.`);
  // Report pipeline smoke test on stub rows.
  mkdirSync(RESULTS_DIR, { recursive: true });
  const file = join(RESULTS_DIR, "dry-run.jsonl");
  writeFileSync(file, "");
  for (const arm of armNames)
    for (const c of cases) {
      const stubTerms = c.category === "dont_invent" ? [c.query] : P.sanitise([...(c.accept.names ?? []).slice(0, 1)]);
      const out = { ok: true, terms: stubTerms, confidence: c.category === "dont_invent" ? "low" : "high" };
      const g = await grade(c, out);
      const usage = { input_tokens: 400, output_tokens: 120 };
      appendFileSync(file, JSON.stringify({ arm, ...ARMS[arm], case: c.id, category: c.category, rep: 0, out, ...g, latencyMs: 1000, usage, cost: costOf(ARMS[arm].model, usage), stub: true }) + "\n");
    }
  console.log(`Stub results written to ${file} (try: node qa/evals/search-rewrite/report.mjs ${file})`);
  process.exit(fails ? 1 : 0);
}

// ---------------- paid run ----------------
if (!existsSync(KEY_FILE)) {
  console.error(`API key file not found: ${KEY_FILE}\nCreate it (key only, one line) and re-run. Nothing was sent.`);
  process.exit(1);
}
const apiKey = readFileSync(KEY_FILE, "utf8").trim();
if (!apiKey) {
  console.error(`API key file is empty: ${KEY_FILE}`);
  process.exit(1);
}
const { default: Anthropic } = await import("@anthropic-ai/sdk");
const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
// Explicit key (never ANTHROPIC_API_KEY from the env); eval timeout/retries per the brief.
const client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 });

/** The production request (src/worker/src/claude.ts), with the arm's model/effort/thinking. */
async function callArm(arm, query) {
  const a = ARMS[arm];
  const params = {
    model: a.model,
    max_tokens: 1024,
    ...(a.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    system: [{ type: "text", text: P.SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: query.trim().slice(0, P.AI_MAX_QUERY) }],
    output_config: { effort: a.effort, format: betaZodOutputFormat(P.RewriteSchema) },
    ...(a.thinking ? { thinking: a.thinking } : {}),
  };
  const t0 = performance.now();
  try {
    const res = await client.beta.messages.parse(params);
    const latencyMs = Math.round(performance.now() - t0);
    const base = { latencyMs, usage: res.usage, servedModel: res.model, stopReason: res.stop_reason };
    if (res.stop_reason === "refusal") return { ...base, out: { ok: false, reason: "refusal" } };
    if (res.stop_reason !== "end_turn" || !res.parsed_output) return { ...base, out: { ok: false, reason: "no_output" } };
    const terms = P.sanitise(res.parsed_output.terms);
    if (!terms.length) return { ...base, out: { ok: false, reason: "no_output" } };
    return { ...base, out: { ok: true, terms, confidence: res.parsed_output.confidence } };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const reason =
      err instanceof Anthropic.APIConnectionTimeoutError ? "timeout"
      : err instanceof Anthropic.RateLimitError ? "api_rate_limited"
      : err instanceof Anthropic.APIConnectionError ? "connection"
      : err instanceof Anthropic.BadRequestError ? "bad_request"
      : err instanceof Anthropic.APIError ? "api_error"
      : "error";
    // API error messages never contain the key; keep a short one for diagnosis.
    const detail = err instanceof Anthropic.APIError ? `${err.status} ${String(err.error?.error?.message ?? err.message).slice(0, 200)}` : String(err?.name ?? "error");
    return { latencyMs, usage: null, out: { ok: false, reason, detail } };
  }
}

mkdirSync(RESULTS_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = join(RESULTS_DIR, `run-${stamp}.jsonl`);
writeFileSync(file, "");
console.log(`Paid run: ${cases.length} cases x ${armNames.length} arms x ${REPEAT} rep(s); budget $${BUDGET.toFixed(2)}; results -> ${file}`);

let spent = 0;
const maxCall = {}; // per arm, the dearest call so far (budget look-ahead)
const PRIOR = { "claude-opus-5-5": 0.012, "claude-sonnet-5-5": 0.006, "claude-haiku-5-5": 0.0004 };
const skipped = new Set();
let stopped = false;

// Interleaved (case-major) so a budget stop leaves every arm with the same cases for paired comparison.
outer: for (let rep = 0; rep < REPEAT; rep++)
  for (const c of cases)
    for (const arm of armNames) {
      if (skipped.has(arm)) continue;
      const model = ARMS[arm].model;
      const next = maxCall[arm] ?? PRIOR[model];
      if (spent + next > BUDGET) {
        console.log(`BUDGET STOP: $${spent.toFixed(4)} spent; next ${arm} call could cost ~$${next.toFixed(4)} (cap $${BUDGET.toFixed(2)}).`);
        stopped = true;
        break outer;
      }
      const r = await callArm(arm, c.query);
      const cost = costOf(model, r.usage);
      spent += cost;
      maxCall[arm] = Math.max(maxCall[arm] ?? 0, cost);
      if (!r.out.ok && r.out.reason === "bad_request") {
        // e.g. the API rejecting between_tools at this effort: record and skip the arm.
        console.log(`  ${arm}: API rejected the request (${r.out.detail}); arm skipped.`);
        appendFileSync(file, JSON.stringify({ arm, ...ARMS[arm], case: c.id, category: c.category, rep, rejected: true, detail: r.out.detail }) + "\n");
        skipped.add(arm);
        continue;
      }
      const g = await grade(c, r.out);
      appendFileSync(file, JSON.stringify({ arm, ...ARMS[arm], case: c.id, category: c.category, rep, ...r, ...g, cost }) + "\n");
      const shown = r.out.ok ? `${r.out.confidence} [${r.out.terms.join(" | ")}]` : r.out.reason;
      console.log(`${g.verdict.padEnd(7)} ${arm.padEnd(21)} ${c.id.padEnd(26)} ${String(r.latencyMs).padStart(5)}ms $${cost.toFixed(5)}  ${shown}`);
    }

console.log(`\nDone${stopped ? " (stopped by budget guard)" : ""}. Total estimated cost $${spent.toFixed(4)}.`);
console.log(`Report: node qa/evals/search-rewrite/report.mjs ${file}`);
