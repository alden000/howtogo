/**
 * M4 OQ6 gate check: the test-only short share TTL must never reach production.
 * SHARE_TEST_TTL_SECONDS and ENVIRONMENT="test" may appear only inside wrangler.toml's [env.test] tables;
 * FIXTURE_MODE must not be set in any wrangler.toml table (AC 21 ruling).
 */
import { describe, expect, it } from "vitest";
import toml from "../wrangler.toml?raw";
import embedToml from "../wrangler.embed.toml?raw";
import { embedConfig } from "../src/embed-config";

/** Minimal line scanner: returns [tableHeader, key, value] for every `key = value` line. */
export function assignments(text: string): [string, string, string][] {
  const out: [string, string, string][] = [];
  let table = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const h = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
    if (h) {
      table = h[1]!;
      continue;
    }
    const a = /^([A-Za-z0-9_."-]+)\s*=\s*(.*)$/.exec(line);
    if (a) out.push([table, a[1]!.replace(/"/g, ""), a[2]!]);
  }
  return out;
}

const isTestEnv = (table: string) => table === "env.test" || table.startsWith("env.test.");

describe("wrangler.toml production safety (OQ6, AC 21)", () => {
  const all = assignments(toml);

  it("parses the real file", () => {
    expect(all.some(([t, k]) => t === "" && k === "name")).toBe(true);
  });

  it("SHARE_TEST_TTL_SECONDS and ENVIRONMENT=test appear only under [env.test]", () => {
    const leaks = all.filter(
      ([t, k, v]) => !isTestEnv(t) && (k.endsWith("SHARE_TEST_TTL_SECONDS") || (k.endsWith("ENVIRONMENT") && /test/i.test(v))),
    );
    expect(leaks).toEqual([]);
  });

  // D-10 (Director, after the AC 21 ruling): the preview Worker runs FIXTURE_MODE="1" in the top-level
  // [vars] with the visible "Sample routes" banner until the owner's keys are in. M5 AC 30/31: production
  // ([env.production.vars]) sets it to "0"; it may appear nowhere else.
  it("FIXTURE_MODE: \"1\" only in the top-level [vars] (preview), \"0\" in production, nowhere else", () => {
    const fx = all.filter(([, k]) => k.endsWith("FIXTURE_MODE"));
    expect(fx).toEqual([
      ["vars", "FIXTURE_MODE", '"1"'],
      ["env.production.vars", "FIXTURE_MODE", '"0"'],
    ]);
  });
});

describe("two Workers: preview (top level) and production (M5 AC 30–32, 34)", () => {
  const all = assignments(toml);
  const get = (table: string, key: string) => all.find(([t, k]) => t === table && k === key)?.[2];

  it("names: top level = howtogo-preview, [env.production] = howtogo", () => {
    expect(get("", "name")).toBe('"howtogo-preview"');
    expect(get("env.production", "name")).toBe('"howtogo"');
    expect(get("vars", "ENVIRONMENT")).toBe('"preview"');
    expect(get("env.production.vars", "ENVIRONMENT")).toBe('"production"');
  });

  it("production: custom domain route, canonical origin, origins = production + WebView only", () => {
    expect(get("env.production", "routes")).toBe('[{ pattern = "howtogo.wwweeeiii.com", custom_domain = true }]');
    expect(get("env.production.vars", "CANONICAL_ORIGIN")).toBe('"https://howtogo.wwweeeiii.com"');
    expect(get("env.production.vars", "ALLOWED_ORIGINS")).toBe('"https://howtogo.wwweeeiii.com,https://localhost"');
    // The preview never redirects and never lists the production origin.
    expect(get("vars", "CANONICAL_ORIGIN")).toBeUndefined();
    expect(get("vars", "ALLOWED_ORIGINS")).not.toContain("wwweeeiii");
  });

  it("each Worker has its own KV namespace and the TripShare / SetupBox / Stats Durable Objects", () => {
    const kvTop = all.filter(([t, k]) => t === "kv_namespaces" && k === "id").map(([, , v]) => v);
    const kvProd = all.filter(([t, k]) => t === "env.production.kv_namespaces" && k === "id").map(([, , v]) => v);
    expect(kvTop).toHaveLength(1);
    expect(kvProd).toHaveLength(1);
    expect(kvTop[0]).not.toBe(kvProd[0]);
    for (const table of ["durable_objects.bindings", "env.production.durable_objects.bindings", "env.test.durable_objects.bindings"]) {
      const classes = all.filter(([t, k]) => t === table && k === "class_name").map(([, , v]) => v);
      expect(classes, table).toEqual(['"TripShare"', '"SetupBox"', '"Stats"']);
    }
    for (const table of ["migrations", "env.production.migrations"]) {
      expect(all.filter(([t, k]) => t === table && k === "tag").map(([, , v]) => v), table).toEqual(['"v1"', '"v2"', '"v3"']);
    }
  });

  it("no secrets in any [vars] table (they are set with `wrangler secret put`)", () => {
    const secretKeys = /ONEMAP_EMAIL|ONEMAP_PASSWORD|LTA_ACCOUNT_KEY|STATS_TOKEN|VAPID/;
    expect(all.filter(([t, k]) => /(^|\.)vars$/.test(t) && secretKeys.test(k))).toEqual([]);
  });

  it("the LTA_PROXY service binding note and binding stay on both Workers", () => {
    expect(toml).toContain("Optional: reuse the LTA key of the owner's existing Worker via a service binding");
    expect(get("services", "service")).toBe('"whereisthebus-lta-proxy"');
    expect(get("env.production.services", "service")).toBe('"whereisthebus-lta-proxy"');
  });

  it("static assets are the default; hashed /assets/* skip the Worker", () => {
    expect(get("assets", "directory")).toBe('"../web/dist"');
    expect(get("assets", "run_worker_first")).toBe('["/*", "!/assets/*"]');
  });

  it("wrangler.embed.toml is wrangler.toml minus [assets] (run `npm run embed:config -w @howtogo/worker`)", () => {
    const norm = (s: string) => s.replace(/\r\n/g, "\n");
    expect(norm(embedToml)).toBe(norm(embedConfig(toml)));
    expect(assignments(embedToml).some(([t]) => t === "assets")).toBe(false);
    // The embedded build is opt-in: only the embed config bundles src/generated/assets.ts.
    expect(get("", "main")).toBe('"src/index.ts"');
    expect(assignments(embedToml).find(([t, k]) => t === "" && k === "main")?.[2]).toBe('"src/index.embed.ts"');
  });

  it("the owner's account is pinned (two accounts are visible to wrangler there)", () => {
    expect(get("", "account_id")).toBe('"bda70e28e71059956f5f02287522bb66"');
  });

  it("no raus-ums origin anywhere (D-11: the owner's own account only)", () => {
    expect(toml).not.toContain("raus-ums");
  });

  it("the scanner catches a leak (self-test)", () => {
    const bad = assignments('[vars]\nSHARE_TEST_TTL_SECONDS = "60"\n[env.test.vars]\nENVIRONMENT = "test"\n');
    expect(bad.filter(([t, k]) => !isTestEnv(t) && k === "SHARE_TEST_TTL_SECONDS")).toHaveLength(1);
    expect(bad.filter(([t, k]) => isTestEnv(t) && k === "ENVIRONMENT")).toHaveLength(1);
  });
});
