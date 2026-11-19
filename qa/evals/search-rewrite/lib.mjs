/**
 * Shared helpers for the search-rewrite eval.
 * - prod(): bundles the Worker's OWN ai.ts / claude.ts / shared alias code with esbuild, so the eval uses
 *   the exact SYSTEM_PROMPT, RewriteSchema and sanitise() that production uses (no copy that can drift).
 * - search(): the grader's OneMap lookup through the project's own API, cached on disk.
 * - grade(): deterministic verdicts, no LLM judge.
 *
 * Privacy (owner's cardinal rules): Anthropic only ever receives the test query strings. The grader calls
 * only the project's own API, with a generic UA. No email, domain or key is ever sent elsewhere or logged.
 */
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "../../..");
export const CACHE_DIR = join(HERE, ".cache");
export const RESULTS_DIR = join(HERE, "results");

/** $ per million tokens (owner-supplied). */
export const PRICES = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
};

/** Cost of one call from its usage block (cache writes 1.25x input, cache reads 0.1x input). */
export function costOf(model, u) {
  const p = PRICES[model];
  if (!p || !u) return 0;
  const inTok = (u.input_tokens ?? 0) + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0);
  return (inTok * p.in + (u.output_tokens ?? 0) * p.out) / 1e6;
}

let prodMod;
/** The Worker's own prompt/schema/sanitiser and the shared alias expander. */
export async function prod() {
  if (prodMod) return prodMod;
  mkdirSync(CACHE_DIR, { recursive: true });
  const out = join(CACHE_DIR, "prod.bundle.mjs");
  await build({
    stdin: {
      contents: `
        export { SYSTEM_PROMPT, AI_MAX_QUERY, AI_MODEL } from "./src/worker/src/ai.ts";
        export { RewriteSchema, sanitise } from "./src/worker/src/claude.ts";
        export { expandAliases } from "@howtogo/shared/alias";`,
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    // Resolved at run time from the repo's node_modules, so the eval's SDK/zod are production's.
    external: ["@anthropic-ai/sdk", "@anthropic-ai/sdk/*", "zod", "zod/*"],
    outfile: out,
    logLevel: "error",
  });
  prodMod = await import(pathToFileURL(out).href + `?t=${Date.now()}`);
  return prodMod;
}

// ---------------- Grader: OneMap via the project's own API ----------------
const API = "https://howtogo.wwweeeiii.com/api/search";
const UA = "HowToGo-QA/1.1";
const GAP_MS = 1100;
const searchCacheFile = join(CACHE_DIR, "search-cache.json");
let searchCache;
let lastFetch = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadSearchCache() {
  if (!searchCache) searchCache = existsSync(searchCacheFile) ? JSON.parse(readFileSync(searchCacheFile, "utf8")) : {};
  return searchCache;
}
function saveSearchCache() {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(searchCacheFile, JSON.stringify(searchCache, null, 1));
}

/**
 * OneMap results for one term, as production would get them for an AI term: `step=1` (Layer 1 only, so
 * the grader never triggers the live Claude rewrite or spends the daily cap) and only `via: "direct"`
 * hits (production searches AI terms with plain OneMap, without the alias layer). Cached per lower-cased
 * term (production's cache key), so each term is fetched once across all models and runs.
 */
export async function search(term) {
  return (await searchAll(term)).filter((h) => h.via === "direct");
}

/** Every Layer-1 hit (alias + direct) for a text: used by --dry-run to confirm the AI would really run. */
export async function searchAll(term) {
  const key = term.trim().replace(/\s+/g, " ").toLowerCase();
  const cache = loadSearchCache();
  if (cache[key]) return cache[key];
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastFetch + GAP_MS * (attempt + 1) - Date.now();
    if (wait > 0) await sleep(wait);
    lastFetch = Date.now();
    const url = `${API}?q=${encodeURIComponent(term.trim().slice(0, 100))}&step=1`;
    let res;
    try {
      res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    } catch {
      continue;
    }
    if (res.status === 429 || res.status >= 500) continue;
    if (!res.ok) {
      // 4xx (e.g. query_too_long): a definite "no results".
      cache[key] = [];
      saveSearchCache();
      return cache[key];
    }
    const body = await res.json();
    const hits = (body.results ?? []).map((p) => ({ name: p.name, postal: p.postal ?? "", via: p.via }));
    cache[key] = hits;
    saveSearchCache();
    return hits;
  }
  throw new Error(`grader: search failed after retries for a term (status/network)`);
}

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/['’`.,()&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Does a OneMap hit match one of the case's accepted targets (postal exact, or name contains)? */
export function matches(hit, accept) {
  if ((accept.postal ?? []).includes(hit.postal)) return true;
  const n = norm(hit.name);
  return (accept.names ?? []).some((a) => n.includes(norm(a)));
}

/** Production's merge: terms in order, de-duplicated on name+postal, first 10 shown. */
export function mergeResults(perTerm) {
  const seen = new Set();
  const out = [];
  for (const hits of perTerm)
    for (const h of hits) {
      const k = `${h.name.toLowerCase()}|${h.postal}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(h);
    }
  return out.slice(0, 10);
}

/**
 * Verdict for one model output.
 * CORRECT: an accepted target is in the merged results (don't-invent: confidence low, or no results).
 * WRONG:   results exist but none match (don't-invent: confident output that finds places) - a senior sent elsewhere.
 * NONE:    no results.
 * ERROR:   the call failed (timeout/refusal/no output/API error) - counted as not correct.
 */
export async function grade(c, out) {
  if (!out.ok) return { verdict: "ERROR", firstTermCorrect: false, topResultCorrect: false, nResults: 0 };
  const perTerm = [];
  for (const t of out.terms) perTerm.push(await search(t));
  const merged = mergeResults(perTerm);
  if (c.category === "dont_invent") {
    const ok = out.confidence === "low" || merged.length === 0;
    return { verdict: ok ? "CORRECT" : "WRONG", firstTermCorrect: ok, topResultCorrect: ok, nResults: merged.length };
  }
  if (!merged.length) return { verdict: "NONE", firstTermCorrect: false, topResultCorrect: false, nResults: 0 };
  const hit = merged.some((h) => matches(h, c.accept));
  return {
    verdict: hit ? "CORRECT" : "WRONG",
    // Seniors tap the top: did the FIRST term alone find the target, and is the top merged result it?
    firstTermCorrect: perTerm[0].some((h) => matches(h, c.accept)),
    topResultCorrect: matches(merged[0], c.accept),
    nResults: merged.length,
  };
}

export function loadCases() {
  return JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8")).cases;
}
