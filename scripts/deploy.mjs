#!/usr/bin/env node
// M5 AC 30 — deploy one of the two Workers from the repo root (owner's machine, wrangler logged in to the
// owner's Cloudflare account). Agents never run this.
//   npm run deploy:preview              → `howtogo-preview` (top level of src/worker/wrangler.toml)
//   npm run deploy:prod                 → `howtogo` ([env.production], custom domain)
//   ... -- --embed                      embedded-assets variant (wrangler.embed.toml) where the assets upload fails
//   ... -- --dry-run                    build + bundle only (`wrangler deploy --dry-run`), nothing is uploaded
// Steps: refuse placeholder ids → release build (VITE_API_BASE="" = same origin) → [embed] → wrangler deploy →
// print the smoke command. Rollback: `npx wrangler rollback [--env production]` (docs/process/DEPLOY.md).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORKER = `${ROOT}src/worker`;
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const embed = args.includes("--embed");
const dryRun = args.includes("--dry-run");
if (target !== "preview" && target !== "production") {
  console.error("usage: node scripts/deploy.mjs <preview|production> [--embed] [--dry-run]");
  process.exit(64);
}
const prod = target === "production";

/** KV ids of the target Worker in wrangler.toml (top level or [env.production]). Exported for the test. */
export function kvIdsFor(toml, production) {
  const ids = [];
  let table = "";
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const h = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
    if (h) {
      table = h[1];
      continue;
    }
    const m = /^id\s*=\s*"([^"]*)"/.exec(line);
    if (m && table === (production ? "env.production.kv_namespaces" : "kv_namespaces")) ids.push(m[1]);
  }
  return ids;
}

const toml = readFileSync(`${WORKER}/wrangler.toml`, "utf8");
const ids = kvIdsFor(toml, prod);
if (!ids.length || ids.some((id) => !/^[0-9a-f]{32}$/.test(id))) {
  console.error(`deploy: the ${target} TOKEN_KV id in src/worker/wrangler.toml is a placeholder (${ids.join(", ") || "none"}).`);
  console.error(`Create it once: cd src/worker && npx wrangler kv namespace create ${prod ? "howtogo-TOKEN_KV" : "howtogo-preview-TOKEN_KV"}`);
  console.error("then paste the id into wrangler.toml (docs/process/DEPLOY.md step 2).");
  process.exit(1);
}

const run = (cmd, argv, opts = {}) => {
  console.log(`$ ${[cmd, ...argv].join(" ")}`);
  const r = spawnSync(cmd, argv, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  if (r.status !== 0) {
    console.error(`deploy: step failed (${cmd} ${argv[0] ?? ""}) — nothing further was run.`);
    process.exit(r.status ?? 1);
  }
};

run("npm", ["run", "build", "-w", "@howtogo/web"], { cwd: ROOT, env: { ...process.env, VITE_API_BASE: "" } });
let config = "wrangler.toml";
if (embed) {
  run("node", ["scripts/embed-config.mjs"], { cwd: WORKER });
  run("node", ["scripts/embed-assets.mjs"], { cwd: WORKER });
  config = "wrangler.embed.toml";
}
// Preview = the top level: `--env=` (empty) says so explicitly, as on the owner's first deploy. The account is
// pinned by `account_id` in wrangler.toml (two accounts are visible to wrangler on the owner's machine).
const wargs = ["wrangler", "deploy", "-c", config, prod ? "--env=production" : "--env=",...(dryRun ? ["--dry-run", "--outdir", "../../qa/.out/wrangler-dry-run"] : [])];
run("npx", wargs, { cwd: WORKER, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });

const version = JSON.parse(readFileSync(`${ROOT}src/web/package.json`, "utf8")).version;
if (dryRun) {
  console.log(`deploy: dry run OK (${target}, ${config}, version ${version}) — nothing was uploaded.`);
} else {
  console.log(`deploy: ${target} ${version} deployed. Now run the post-deploy smoke (AC 33):`);
  console.log(prod ? "  npm run smoke:deploy -- https://howtogo.wwweeeiii.com --expect-live" : "  npm run smoke:deploy -- https://howtogo-preview.genixm.workers.dev");
  console.log(`If it fails: cd src/worker && npx wrangler rollback${prod ? " --env production" : ""}`);
}
