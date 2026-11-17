// QA suite (qa/tests) against the release build (qa/.out/dist) served by `vite preview`.
import { defineConfig, devices } from '@playwright/test';
const PORT = Number(process.env.QA_PORT ?? 4174);
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
  webServer: {
    command: `npx vite preview --outDir ${__dirname}/.out/dist --port ${PORT} --strictPort`,
    cwd: `${__dirname}/../src/web`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
  },
});
