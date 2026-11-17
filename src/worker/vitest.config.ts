import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          ONEMAP_EMAIL: "test@example.com",
          ONEMAP_PASSWORD: "s3cret-pass",
          LTA_ACCOUNT_KEY: "lta-test-key",
          ALLOWED_ORIGINS: "https://app.example.sg,http://localhost:5173",
          SHARE_TTL_HOURS: "4",
        },
      },
    }),
  ],
  test: { reporters: ["dot"], onConsoleLog: () => false },
});
