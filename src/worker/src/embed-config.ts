// Pure transform wrangler.toml → wrangler.embed.toml (M5 AC 30). Used by scripts/embed-config.mjs (Node runs
// this file with type stripping) and by test/config.test.ts (staleness check). No imports on purpose.

export const EMBED_HEADER =
  "# GENERATED from wrangler.toml by scripts/embed-config.mjs — do not edit; run `npm run embed:config -w @howtogo/worker`.\n" +
  "# Embedded-assets variant: identical to wrangler.toml except WITHOUT [assets] and with main = src/index.embed.ts\n" +
  "# (the build is bundled into the Worker by scripts/embed-assets.mjs and served by src/static.ts with the same\n" +
  "# paths, SPA fallback and headers). Opt-in only: `npm run deploy:preview -- --embed`.\n";

/**
 * wrangler.toml text → wrangler.embed.toml text: every `[assets]` / `[env.*.assets]` table is dropped and
 * `main` points at src/index.embed.ts (the static-assets entry never carries the embedded build).
 */
export function embedConfig(src: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of src.replace(/\r\n/g, "\n").split("\n")) {
    const header = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*$/.exec(line);
    if (header) skipping = header[1] === "assets" || header[1]!.endsWith(".assets");
    if (skipping) continue;
    out.push(/^main\s*=\s*"src\/index\.ts"/.test(line) ? 'main = "src/index.embed.ts"' : line);
  }
  return EMBED_HEADER + out.join("\n");
}
