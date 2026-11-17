import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      // The deployed preview config (no [assets]: the embedded build is served by src/static.ts).
      wrangler: { configPath: "./wrangler.preview.toml" },
      miniflare: {
        bindings: {
          ONEMAP_EMAIL: "test@example.com",
          ONEMAP_PASSWORD: "s3cret-pass",
          LTA_ACCOUNT_KEY: "lta-test-key",
          ALLOWED_ORIGINS: "https://app.example.sg,http://localhost:5173",
          SHARE_TTL_HOURS: "4",
          // wrangler.toml turns fixture mode on for the preview (D-10); unit tests start from real mode.
          FIXTURE_MODE: "0",
        },
        // wrangler.preview.toml binds LTA_PROXY to the owner's whereisthebus-lta-proxy Worker, which does
        // not exist locally; stand in a dead service (tests pass their own fake via env, test/lta-proxy.test.ts).
        serviceBindings: { LTA_PROXY: () => new Response("LTA_PROXY not available in tests", { status: 502 }) },
      },
    }),
  ],
  test: { reporters: ["dot"], onConsoleLog: () => false },
});
