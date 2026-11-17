// Runs the Developer's e2e suite (src/web/e2e) READ-ONLY against the QA release build
// (qa/.out/dist served by `vite preview` on :4173 — the suite's URL asserts expect that port).
// No @playwright/test import here: the suite resolves it from the root workspace.
// updateSnapshots 'none' → baselines are compared, never written.
const PORT = 4173;
const here = new URL('.', import.meta.url).pathname;
export default {
  testDir: here + '../src/web/e2e',
  outputDir: here + '.out/dev-results',
  timeout: 30_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['line']],
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.02 } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Mobile Safari/537.36',
    viewport: { width: 412, height: 839 }, screen: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Singapore',
    geolocation: { latitude: 1.33465, longitude: 103.8491, accuracy: 10 },
    permissions: ['geolocation'],
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npx vite preview --outDir ${here}.out/dist --port ${PORT} --strictPort`,
    cwd: here + '../src/web',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
  },
};
