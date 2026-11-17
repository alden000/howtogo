#!/usr/bin/env node
/**
 * M3 AC 40: owner-run recorder for LTA DataMall replies, so field drift shows up as a fixture diff.
 *   LTA_ACCOUNT_KEY=... npm run record:lta -w @howtogo/worker
 * Writes test/fixtures/recorded/*.json. NEVER run in CI. The key is read from the environment only and is
 * never written or printed. LTA replies hold no personal data (bus positions, alerts, lift ids).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const key = process.env.LTA_ACCOUNT_KEY;
if (!key) {
  console.error("BLOCKED: no key (set LTA_ACCOUNT_KEY)");
  process.exit(2);
}
if (process.env.CI) {
  console.error("record:lta must not run in CI");
  process.exit(2);
}
const BASE = "https://datamall2.mytransport.sg/ltaodataservice";
const targets = {
  // Busy interchange stops: Toa Payoh Int (52009) and Bishan Int (53009).
  "lta-bus-arrival-v3-52009.json": "/v3/BusArrival?BusStopCode=52009",
  "lta-bus-arrival-v3-53009.json": "/v3/BusArrival?BusStopCode=53009",
  "lta-train-alerts.json": "/TrainServiceAlerts",
  "lta-facilities-maintenance-v2.json": "/v2/FacilitiesMaintenance",
};
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "recorded");
await mkdir(out, { recursive: true });
let failed = 0;
for (const [file, path] of Object.entries(targets)) {
  const res = await fetch(BASE + path, { headers: { AccountKey: key, Accept: "application/json" } });
  if (!res.ok) {
    console.error(`${file}: HTTP ${res.status}`);
    failed++;
    continue;
  }
  const body = await res.json();
  await writeFile(join(out, file), JSON.stringify({ _recorded: new Date().toISOString(), ...body }, null, 2) + "\n");
  console.log(`${file}: ok`);
}
process.exit(failed ? 1 : 0);
