#!/usr/bin/env node
// M5 AC 35–36 (M3 AC 45) — live-credential smoke against a DEPLOYED Worker's public API. No secrets on this
// side: the Worker holds the owner's OneMap/LTA credentials (`wrangler secret put`).
//   npm run smoke:live -- <base-url> [--json]        (or SMOKE_LIVE_URL=<base-url>)
// Exit codes: 0 PASS · 1 FAIL (a live call failed or a shape mismatched) · 2 BLOCKED (no URL configured,
// /api/health says fixtureMode:true, or credentials are missing — BLOCKED is not FAIL) · 64 usage.
// At most 20 requests per run, ≥ 300 ms apart. Prints no tokens, no response bodies and no coordinates
// beyond the fixed public test points below. `--json` writes qa/.out/smoke-live.json.
// `--direct` (calling OneMap/LTA directly with a local .dev.vars, AC 37 Should) is not implemented: it needs
// credentials on this machine, which this project never handles.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--direct")) {
  console.log("smoke:live --direct is not available: it would need OneMap/LTA credentials on this machine (owner-only secrets).");
  process.exit(2);
}
const base = (args.find((a) => !a.startsWith("--")) ?? process.env.SMOKE_LIVE_URL ?? "").replace(/\/+$/, "");
if (!base) {
  console.log("smoke:live BLOCKED — no Worker URL configured. Run `npm run smoke:live -- <base-url>` (or set SMOKE_LIVE_URL)");
  console.log("after the owner has set ONEMAP_EMAIL, ONEMAP_PASSWORD and LTA_ACCOUNT_KEY with `wrangler secret put` (docs/process/DEPLOY.md).");
  process.exit(2);
}
if (!/^https?:\/\/[^/]+$/.test(base)) {
  console.error("usage: npm run smoke:live -- <base-url> [--json]");
  process.exit(64);
}

const MAX_REQUESTS = 20;
const GAP_MS = 300;
let requests = 0;
let last = 0;
const UA = "howtogo-smoke-live/1";
const results = [];
const openItems = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, note = "") => {
  results.push({ name, ok: !!ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? ` — ${note}` : ""}`);
};
const item = (name, found, note = "") => {
  openItems[name] = found ? "FOUND" : "MISSING";
  console.log(`${found ? "FOUND  " : "MISSING"} ${name}${note ? ` — ${note}` : ""}`);
};

async function api(path) {
  if (requests >= MAX_REQUESTS) throw new Error("request budget exceeded");
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  requests++;
  try {
    const r = await fetch(base + path, { headers: { "User-Agent": UA, Accept: "application/json" } });
    let body = null;
    try {
      body = await r.json();
    } catch {}
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: null, error: e?.cause?.code ?? e?.name ?? "fetch failed" };
  }
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v) => typeof v === "string";

// Fixed, public test points (no user data): places, hospital/interchange coordinates and two bus stops.
const SEARCHES = ["Tan Tock Seng Hospital", "Bedok Interchange", "579842"];
const P = {
  ttsh: "1.3215,103.8459",
  bedok: "1.3249,103.9295",
  bishan: "1.3510,103.8485",
  jurongEast: "1.3331,103.7422",
  vivo: "1.2644,103.8222",
};
const ROUTES = [
  ["bus-only", `start=${P.bishan}&end=${P.ttsh}&mode=BUS&numItineraries=2`],
  ["MRT + transfer", `start=${P.jurongEast}&end=${P.bedok}&mode=RAIL&numItineraries=2`],
  ["mixed", `start=${P.ttsh}&end=${P.vivo}&mode=TRANSIT&numItineraries=2`],
];
const STOPS = ["53009", "83139"];

// 0. health → BLOCKED?
const h = await api("/api/health");
const hb = h.body ?? {};
console.log(`info  health status=${h.status} fixtureMode=${hb.fixtureMode} onemap=${hb.onemap} lta=${hb.lta} version=${hb.version}`);
if (h.status !== 200) {
  check("/api/health reachable", false, `status ${h.status}${h.error ? " " + h.error : ""}`);
  process.exit(1);
}
const blocked = [];
if (hb.fixtureMode !== false) blocked.push("fixtureMode is not false (sample routes)");
if (hb.onemap !== "ok") blocked.push(`OneMap credentials: ${hb.onemap ?? "unknown"}`);
if (hb.lta !== "key") blocked.push(`LTA key: ${hb.lta ?? "unknown"} (alerts and lifts need the LTA_ACCOUNT_KEY secret)`);
// D-7 ⚠: Bearer prefix and token expiry are handled server-side; health must not leak either.
item("token expiry hidden from /api/health", !/expir|token/i.test(JSON.stringify(hb)));
if (blocked.length) {
  console.log(`smoke:live BLOCKED — ${blocked.join("; ")}. The owner sets the secrets with \`wrangler secret put\` (docs/process/DEPLOY.md).`);
  write("BLOCKED");
  process.exit(2);
}

// 1. search ×3
for (const q of SEARCHES) {
  const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
  const list = r.body?.results;
  const ok = r.status === 200 && Array.isArray(list) && list.length > 0 && list.every((p) => isStr(p.name) && isStr(p.address) && isStr(p.postal) && isNum(p.lat) && isNum(p.lng));
  check(`search "${q}"`, ok, `status ${r.status}, ${Array.isArray(list) ? list.length : 0} results`);
}

// 2. routes ×3 (raw OneMap body; the shared engine normalises it)
let fareSeen = false;
for (const [name, q] of ROUTES) {
  const r = await api(`/api/route?${q}`);
  const its = r.body?.plan?.itineraries;
  const ok = r.status === 200 && Array.isArray(its) && its.length > 0 && its.every((it) => Array.isArray(it.legs) && it.legs.length > 0 && isNum(it.duration));
  if (Array.isArray(its) && its.some((it) => it.fare !== undefined && it.fare !== null && it.fare !== "")) fareSeen = true;
  check(`route ${name}`, ok, `status ${r.status}, ${Array.isArray(its) ? its.length : 0} itineraries`);
}
item("route `fare` present", fareSeen);

// 3. reverse geocode of a fixed point
{
  const r = await api(`/api/revgeocode?lat=1.35101&lng=103.84850`);
  check("revgeocode (fixed point)", (r.status === 200 && isStr(r.body?.name) && isStr(r.body?.address)) || r.status === 404, `status ${r.status}`);
}

// 4. bus arrival ×2
let monitoredSeen = false;
for (const stop of STOPS) {
  const r = await api(`/api/bus-arrival?stop=${stop}`);
  const svcs = r.body?.services;
  const ok = r.status === 200 && r.body?.stop === stop && Array.isArray(svcs) && svcs.every((s) => isStr(s.no) && Array.isArray(s.next) && s.next.every((n) => isNum(n.etaMin) && typeof n.monitored === "boolean"));
  if (Array.isArray(svcs) && svcs.some((s) => s.next?.some((n) => n.monitored === true))) monitoredSeen = true;
  check(`bus arrival ${stop}`, ok, `status ${r.status}, ${Array.isArray(svcs) ? svcs.length : 0} services`);
}
item("bus arrival `Monitored` = 1 seen (live GPS)", monitoredSeen, monitoredSeen ? "" : "may be MISSING late at night");

// 5. alerts
{
  const r = await api("/api/alerts");
  const b = r.body ?? {};
  const ok = r.status === 200 && (b.status === "normal" || b.status === "disrupted") && typeof b.minor === "boolean" && Array.isArray(b.lines) && Array.isArray(b.messages);
  check("alerts (TrainServiceAlerts)", ok, `status ${r.status}, ${b.status ?? "-"}`);
  item("TrainServiceAlerts shape", ok);
}

// 6. lifts
{
  const r = await api("/api/lifts");
  const b = r.body ?? {};
  const ok = r.status === 200 && isStr(b.fetchedAt) && Array.isArray(b.lifts) && b.lifts.every((l) => isStr(l.station) && isStr(l.desc));
  check("lifts (FacilitiesMaintenance)", ok, `status ${r.status}, ${Array.isArray(b.lifts) ? b.lifts.length : 0} lifts`);
  item("FacilitiesMaintenance shape", ok);
}

function write(verdict) {
  if (!args.includes("--json")) return;
  mkdirSync(`${ROOT}qa/.out`, { recursive: true });
  writeFileSync(`${ROOT}qa/.out/smoke-live.json`, JSON.stringify({ base, verdict, at: new Date().toISOString().slice(0, 10), requests, results, openItems }, null, 1));
}
const failed = results.filter((r) => !r.ok);
const verdict = failed.length ? "FAIL" : "PASS";
write(verdict);
console.log(`smoke:live ${verdict} — ${results.length - failed.length}/${results.length} checks, ${requests} requests`);
process.exit(failed.length ? 1 : 0);
