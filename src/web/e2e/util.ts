import type { Page } from '@playwright/test';

/** Skip the F1 first run: mark settings onboarded unless the test already stored settings. */
export async function onboarded(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript((x) => {
    try {
      if (!localStorage.getItem('howtogo.settings')) localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: true, ...x }));
    } catch {
      /* ignore */
    }
  }, extra);
}

/** Lines from the app's change-only test log (window.__howtogoLog). */
export const logOf = (page: Page) => page.evaluate(() => [...(window.__howtogoLog ?? [])]);

/** Fonts come from Google Fonts in production; tests stay hermetic (system fallback fonts). */
export async function hermetic(page: Page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('https://www.onemap.gov.sg/**', (r) => r.fulfill({ status: 204 }));
}
