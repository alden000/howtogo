/**
 * D-10 sample-routes banner: the preview Worker runs with FIXTURE_MODE=1 and says so on
 * GET /api/health; the PWA then shows Creative's calm note on Home, Search results and Route options.
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

test.use({ serviceWorkers: 'block' });

const ZH = '示范路线：现在显示的是示范数据，不是真实路线。';
const EN = 'Sample routes: this shows demo data, not real routes.';

async function health(page: Page, fixtureMode: boolean) {
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, fixtureMode } }));
}

test('live mode: /api/health fixtureMode:true shows the banner on Home (zh), under the top bar', async ({ page }) => {
  await hermetic(page);
  await onboarded(page);
  await health(page, true);
  await page.goto('/');
  const b = page.getByTestId('sample-banner');
  await expect(b).toHaveText(ZH);
  await expect(b).toHaveAttribute('role', 'note');
  await expect(b.locator('svg')).toHaveCount(1);
  const bar = await page.locator('.screen > .bar').first().boundingBox();
  const box = await b.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1);
  expect(await logOf(page)).toContain('mode:sample');
});

test('live mode: fixtureMode:false (or a failing health check) shows no banner', async ({ page }) => {
  await hermetic(page);
  await onboarded(page);
  await health(page, false);
  await page.goto('/');
  await expect(page.getByTestId('lang-toggle')).toBeVisible();
  await expect(page.getByTestId('sample-banner')).toHaveCount(0);
  await page.unroute('**/api/health');
  await page.route('**/api/health', (r) => r.fulfill({ status: 500, body: 'x' }));
  await page.reload();
  await expect(page.getByTestId('lang-toggle')).toBeVisible();
  await expect(page.getByTestId('sample-banner')).toHaveCount(0);
});

for (const [lang, text] of [['zh', ZH], ['en', EN]] as const) {
  test(`banner on Home, Search results and Route options, whole and on screen at 200 % (${lang})`, async ({ page }) => {
    await hermetic(page);
    await onboarded(page, { lang, textSize: 'xxlarge' });
    await page.goto('/?demo=1&sample=1');
    const b = page.getByTestId('sample-banner');
    const whole = async () => {
      await expect(b).toHaveText(text);
      await expect(b).toBeInViewport({ ratio: 1 });
      // Not clipped: the note keeps its full content height.
      expect(await b.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    };
    await whole();
    await page.getByTestId('to-field').click();
    await page.getByTestId('search-input').fill('tan tock');
    await expect(page.getByTestId('search-result-0')).toBeVisible();
    await whole();
    await page.getByTestId('search-result-0').click();
    await expect(page.getByTestId('route-option-0')).toBeVisible();
    await whole();
    // Not on screens without route data.
    await page.goto('/settings');
    await expect(page.getByTestId('sample-banner')).toHaveCount(0);
  });
}
