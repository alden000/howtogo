// QA suite (qa/tests) against the release build (qa/.out/dist) served by `vite preview`.
import { defineConfig, devices } from '@playwright/test';
const PORT = Number(process.env.QA_PORT ?? 4184);
// M4 two-browser tests: the real Worker under `wrangler dev --local --env test` (local workerd + Durable
// Objects, nothing sent to Cloudflare), serving the same release build as embedded static assets (D-10)
// with a short test-only share TTL (M4 OQ6). 18797: the usual 87xx ports are taken by other servers on this host.
export const QA_WORKER_PORT = Number(process.env.QA_WORKER_PORT ?? 18797);
export const QA_SHARE_TTL_S = Number(process.env.QA_SHARE_TTL_S ?? 40);
export default defineConfig({
  testDir: 'tests',
  outputDir: '.out/qa-results',
  timeout: 45_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['line'], ['json', { outputFile: '.out/qa-results.json' }]],
  updateSnapshots: 'none',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Singapore',
    geolocation: { latitude: 1.33465, longitude: 103.8491, accuracy: 10 },
    permissions: ['geolocation'],
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: `npx vite preview --outDir ${__dirname}/.out/dist --port ${PORT} --strictPort`,
      cwd: `${__dirname}/../src/web`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
    },
    {
      // `embed-assets --if-missing` only writes the gitignored src/worker/src/generated stub the Worker imports.
      command:
        `node scripts/embed-assets.mjs --if-missing && npx wrangler dev --env test --local --port ${QA_WORKER_PORT} --ip 127.0.0.1` +
        ` --assets ${__dirname}/.out/dist --persist-to ${__dirname}/.out/wrangler-state` +
        ` --var ALLOWED_ORIGINS:http://127.0.0.1:${QA_WORKER_PORT} --var SHARE_TEST_TTL_SECONDS:${QA_SHARE_TTL_S}`,
      cwd: `${__dirname}/../src/worker`,
      url: `http://127.0.0.1:${QA_WORKER_PORT}/api/health`,
      env: { WRANGLER_SEND_METRICS: 'false' },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
    },
  ],
});
