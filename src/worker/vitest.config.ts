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
      },
    }),
  ],
  test: { reporters: ["dot"], onConsoleLog: () => false },
});
