/**
 * M4 family viewer e2e (`npm run e2e:viewer`): two-browser live test against `wrangler dev --env test`
 * (real Durable Object, test-only TTL) + mocked-API state baselines. Separate from the app's config so
 * it can start the Worker. Baselines: e2e-viewer/baselines/M4-V-{state}-{theme}-{width}-{lang}.png.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4175;
const WORKER_PORT = 8788;
export const TEST_TTL_S = 25;

export default defineConfig({
  testDir: 'e2e-viewer',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['line']],
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.02 } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Singapore',
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    // QA-65: build + preview first (Playwright starts these in order): wrangler serves ../web/dist as its assets.
    {
      command: `npm run build && npx vite preview --config vite.viewer-e2e.config.ts`,
      url: `http://localhost:${PORT}/t/x`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
    },
    {
      command: `cd ../worker && npx wrangler dev --env test --local --port ${WORKER_PORT} --ip 127.0.0.1 --var ALLOWED_ORIGINS:http://localhost:${PORT} --var SHARE_TEST_TTL_SECONDS:${TEST_TTL_S}`,
      url: `http://127.0.0.1:${WORKER_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 90_000,
      stdout: 'ignore',
    },
  ],
});
