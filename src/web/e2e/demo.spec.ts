import { expect, test, type Page } from '@playwright/test';
import { onboarded } from './util';

test.beforeEach(({ page }) => onboarded(page));

/** Lines from the app's change-only test log (window.__howtogoLog). */
const logOf = (page: Page) => page.evaluate(() => [...(window.__howtogoLog ?? [])]);
const cues = async (page: Page) => (await logOf(page)).filter((l) => l.startsWith('cue:')).map((l) => l.slice(4));

test.describe('demo mode', () => {
  // Demo mode replaces the device GPS with a simulated stream; the SW is exercised separately.
  test.use({ serviceWorkers: 'block' });

  test('search → route → guide: cues in order, Back steps one page, reload resumes', async ({ page }) => {
    await page.goto('/?demo=1&demoMs=30&ff=guide');
    await expect(page.getByTestId('to-field')).toBeVisible();

    await page.getByTestId('to-field').click();
    await expect(page).toHaveURL(/\/search/);
    await page.getByTestId('search-input').fill('tan tock');
    await page.getByTestId('search-result-0').click();

    await expect(page).toHaveURL(/\/routes$/);
    await page.getByTestId('route-option-0').click();
    await expect(page).toHaveURL(/\/trip$/);
    await expect(page.getByTestId('step-list').locator('li').first()).toBeVisible();
    await page.getByTestId('start-guide').click();
    await expect(page).toHaveURL(/\/guide$/);

    // Let the simulated trip run into the bus ride, then reload mid-trip.
    await expect.poll(async () => (await logOf(page)).includes('cue:boarded') || (await cues(page)).length > 4, { timeout: 15_000 }).toBe(true);
    const stepBefore = Number(await page.getByTestId('guide-progress').getAttribute('data-step'));
    await page.reload();
    await expect(page).toHaveURL(/\/guide$/);
    await expect.poll(() => logOf(page)).toContain('trip:resumed');
    const stepAfter = Number(await page.getByTestId('guide-progress').getAttribute('data-step'));
    expect(stepAfter).toBeGreaterThanOrEqual(stepBefore);
    expect(stepAfter).toBeGreaterThan(0);

    // The rest of the trip runs to arrival; get-off cues come in order.
    await expect(page.getByTestId('arrived')).toBeVisible({ timeout: 20_000 });
    const all = await cues(page);
    const nextStop = all.indexOf('get_off_next_stop');
    const now = all.indexOf('get_off_now');
    expect(nextStop).toBeGreaterThan(-1);
    expect(now).toBeGreaterThan(nextStop);
    expect(all.at(-1)).toBe('arrived_destination');
    // M2 runtime hooks (no new screens yet): H6 → H6b order, resume window, location profile.
    const lines = await logOf(page);
    expect(lines.indexOf('alert:next')).toBeGreaterThan(-1);
    expect(lines.indexOf('alert:now')).toBeGreaterThan(lines.indexOf('alert:next'));
    expect(lines).toEqual(expect.arrayContaining(['state:resume', 'loc:profile 2000']));
    expect(lines.some((l) => l.startsWith('state:wakelock-failed') || l === 'wakelock:on')).toBe(true);

    // Back: one in-app step at a time (guide → trip → routes → home).
    await page.goBack();
    await expect(page).toHaveURL(/\/trip$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/routes$/);
    await page.goBack();
    await expect(page).toHaveURL(/:4173\/(\?.*)?$/);
    const screens = (await logOf(page)).filter((l) => l.startsWith('screen:'));
    expect(screens.slice(-4)).toEqual(['screen:/guide', 'screen:/trip', 'screen:/routes', 'screen:/']);
  });

  test('a sheet consumes one Back; in-app Back button works', async ({ page }) => {
    await page.goto('/?demo=1&demoMs=100000&ff=guide');
    await page.getByTestId('to-field').click();
    await page.getByTestId('search-input').fill('raffles');
    await page.getByTestId('search-result-0').click();
    await page.getByTestId('route-option-0').click();
    await page.getByTestId('start-guide').click();
    await expect(page).toHaveURL(/\/guide$/);
    await page.getByTestId('guide-end').click();
    await expect(page.getByTestId('sheet-end-trip')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('sheet-end-trip')).toHaveCount(0);
    await expect(page).toHaveURL(/\/guide$/);
    await page.getByTestId('back').click();
    await expect(page).toHaveURL(/\/trip$/);
    expect(await logOf(page)).toEqual(expect.arrayContaining(['sheet:end-trip', 'cue:step_changed']));
  });
});

test('mock mode uses the (mocked) device geolocation', async ({ page }) => {
  await page.goto('/?mock=1');
  // Permission is already granted, so Home reverse-geocodes without prompting (F8 pill).
  await expect.poll(() => logOf(page)).toContain('loc:ok');
  await expect(page.getByTestId('from-field')).toContainText('Toa Payoh Central');
});

test('service worker precaches the shell: offline reload shows Home', async ({ page, context }) => {
  await page.goto('/?mock=1');
  await expect.poll(() => logOf(page)).toContain('sw:registered');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the SW
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('to-field')).toBeVisible();
  await expect(page.getByTestId('offline-notice')).toBeVisible();
  await context.setOffline(false);
});

test('map lazy-loads MapLibre with OneMap attribution', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Keep the test hermetic: tiles answer 204.
  await page.route('https://www.onemap.gov.sg/**', (r) => r.fulfill({ status: 204 }));
  await page.goto('/?demo=1&demoMs=100000&ff=guide');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Singapore Land Authority', { timeout: 15_000 });
  await expect(page.getByTestId('map')).toHaveAttribute('aria-hidden', 'true');
  expect(errors).toEqual([]);
});
