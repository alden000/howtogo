import type { Page } from '@playwright/test';

/** Skip the F1 first run: mark settings onboarded unless the test already stored settings. */
export async function onboarded(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript((x) => {
    try {
      if (!localStorage.getItem('howtogo.settings')) localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: true, ...x }));
      localStorage.getItem('howtogo.whatsnew.v1') || localStorage.setItem('howtogo.whatsnew.v1', 'seen'); // an existing 1.0 user: What's new already seen
      // 1.2 QA-72: the one-time Home nudge (a Home without a postal code) has its own test (v12.spec); keep it off elsewhere.
      localStorage.getItem('howtogo.homeNudge.v1') || localStorage.setItem('howtogo.homeNudge.v1', '1');
      // QA-21: headless Chromium reports notifications as denied, which would put the "alerts need the app
      // open" note on every H5. Tests (like a real phone that allowed them) run with permission granted;
      // the prompt and the denied note have their own unit and QA tests.
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
    } catch {
      /* ignore */
    }
  }, extra);
}

/** Lines from the app's change-only test log (window.__howtogoLog). */
export const logOf = (page: Page) => page.evaluate(() => [...(window.__howtogoLog ?? [])]);

/** Tests stay hermetic: no third-party requests (fonts are self-hosted since QA-48; OneMap is stubbed). */
export async function hermetic(page: Page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('https://www.onemap.gov.sg/**', (r) => r.fulfill({ status: 204 }));
}
