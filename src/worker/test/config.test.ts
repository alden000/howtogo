/**
 * M4 OQ6 gate check: the test-only short share TTL must never reach production.
 * SHARE_TEST_TTL_SECONDS and ENVIRONMENT="test" may appear only inside wrangler.toml's [env.test] tables;
 * FIXTURE_MODE must not be set in any wrangler.toml table (AC 21 ruling).
 */
import { describe, expect, it } from "vitest";
import toml from "../wrangler.toml?raw";

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

  // D-10 (Director, after the AC 21 ruling): the preview deploy runs FIXTURE_MODE="1" in the top-level
  // [vars] with the visible "Sample routes" banner until the owner's keys are in. It must appear nowhere else.
  it("FIXTURE_MODE is set only in the top-level [vars] (D-10 preview)", () => {
    expect(all.filter(([t, k]) => k.endsWith("FIXTURE_MODE") && t !== "vars")).toEqual([]);
  });

  it("the scanner catches a leak (self-test)", () => {
    const bad = assignments('[vars]\nSHARE_TEST_TTL_SECONDS = "60"\n[env.test.vars]\nENVIRONMENT = "test"\n');
    expect(bad.filter(([t, k]) => !isTestEnv(t) && k === "SHARE_TEST_TTL_SECONDS")).toHaveLength(1);
    expect(bad.filter(([t, k]) => isTestEnv(t) && k === "ENVIRONMENT")).toHaveLength(1);
  });
});
