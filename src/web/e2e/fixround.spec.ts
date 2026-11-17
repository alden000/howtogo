/**
 * M1 fix round: Director rulings, Creative High/Medium and QA S2/S3 items that need a browser.
 * Demo/mock mode, hermetic (fonts + tiles stubbed).
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

const FIXED = new Date('2026-11-18T10:15:00+08:00');
test.use({ serviceWorkers: 'block' });

async function setup(page: Page, settings: Record<string, unknown> = {}) {
  await hermetic(page);
  await page.clock.setFixedTime(FIXED);
  await onboarded(page, settings);
}
async function toRoutes(page: Page, q = 'tan tock') {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(q);
  await page.getByTestId('search-result-0').click();
}

test('AC 38: route drawing asserted through the map log hook (walk dashed + transit solid, stops, destination)', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  await expect.poll(async () => (await logOf(page)).find((l) => l.startsWith('map:route')), { timeout: 15_000 }).toMatch(/^map:route walk=[1-9]\d* transit=[1-9]\d* stops=[1-9]\d* dest=1$/);
  const log = await logOf(page);
  expect(log).toContain('map:ready');
  expect(log.some((l) => /\d+\.\d{3}/.test(l)), 'no coordinates in the log').toBe(false);
});

test('AC 39/41 + QA-7: my-location dot, recentre, Bigger map; nothing focusable inside the aria-hidden map', async ({ page }) => {
  await setup(page);
  await page.goto('/?mock=1');
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('map-recentre')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => logOf(page)).toContain('map:me acc=circle');
  await page.getByTestId('map-recentre').click();
  await expect.poll(async () => logOf(page)).toContain('map:centre-me');
  const h0 = await page.getByTestId('map-box').evaluate((e) => e.getBoundingClientRect().height);
  await page.getByTestId('toggle-map').click();
  await expect(page.getByTestId('toggle-map')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('toggle-map')).toContainText('缩小地图');
  expect(await page.getByTestId('map-box').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(h0 * 1.4);
  const focusable = await page.getByTestId('map').evaluate((m) => [...m.querySelectorAll('a[href],button,[tabindex]')].filter((e) => e.getAttribute('tabindex') !== '-1').length);
  expect(focusable).toBe(0);
  await expect(page.locator('.attribhost .maplibregl-ctrl-attrib')).toContainText('OneMap');
});

test('F8 Swap on Route options: start and destination change places', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page);
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await expect(page.getByTestId('routes-title')).toContainText('Tan Tock Seng');
  await page.getByTestId('routes-swap').click();
  await expect(page.getByTestId('routes-from')).toContainText('Tan Tock Seng');
  await expect(page.getByTestId('routes-title')).not.toContainText('Tan Tock Seng');
  expect(await logOf(page)).toContain('swap');
});

test('Ruling 1 + QA-1: no "live" note; Help hidden with ?ff=-help (on by default from M2); ?ff=help,live brings them back', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1&ff=-help');
  await expect(page.getByTestId('nav-help')).toHaveCount(0);
  await toRoutes(page);
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await expect(page.getByTestId('note-honest')).toHaveCount(0);
  await expect(page.getByTestId('bar-help')).toHaveCount(0);
  await page.goto('/?demo=1&ff=help,live');
  await expect(page.getByTestId('nav-help')).toBeVisible();
});

test('H2 From mode title, AC 31 metres, QA-6 focus moves to the new screen heading', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await page.getByTestId('from-field').click();
  await expect(page.locator('h1')).toHaveText('从哪里出发？');
  // Search puts focus straight into its field; other screens focus their heading.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('search-input');
  await page.goBack();
  await page.getByTestId('nav-settings').click();
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('H1');
  await page.goBack();
  await toRoutes(page);
  await expect(page.getByTestId('route-option-0')).toContainText(/走路 \d+0 米/);
});

test('QA-3 deep link /#/route?from=&to= opens Route options; Back lands on Home', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await page.goto('/#/route?from=1.33465,103.8491&to=1.32135,103.8465');
  await expect(page.getByTestId('route-option-0')).toBeVisible({ timeout: 8000 });
  await expect(page).toHaveURL(/\/routes$/);
  await page.getByTestId('back').click();
  await expect(page.getByTestId('to-field')).toBeVisible();
});

test('QA-9 Back from the walking overview returns to the too-close state', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page, 'toa payoh');
  await expect(page.getByTestId('state-routes-close')).toBeVisible();
  await page.getByTestId('routes-show-walk').click();
  await expect(page.getByTestId('step-list')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('state-routes-close')).toBeVisible();
  await expect(page.getByTestId('route-option-0')).toHaveCount(0);
});

test('Exit motion leaves no extra testids or text behind (ghost is inert and unselectable)', async ({ page }) => {
  await setup(page, { motion: 'off' });
  await page.goto('/?demo=1');
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('back')).toHaveCount(1);
  expect(await page.locator('.ghosts .ghost').count()).toBeGreaterThan(0);
  await expect(page.locator('.ghosts .ghost')).toHaveCount(0, { timeout: 2000 });
});
