import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['line']],
  // Screenshot baselines live next to the specs with the frames' baseline names (STYLE-GUIDE §6/§6b).
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.02 } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    locale: 'zh-CN',
    timezoneId: 'Asia/Singapore',
    // Mocked device location (Toa Payoh, the demo fixtures' origin).
    geolocation: { latitude: 1.33465, longitude: 103.8491, accuracy: 10 },
    permissions: ['geolocation'],
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'ignore',
  },
});
