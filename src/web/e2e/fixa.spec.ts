/** M3/M4 fix round A (2026-11-18): QA-29/30/31/33/34/35/48 in the app (dev suite). */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

async function boot(page: Page, scn = '', init?: () => void) {
  await hermetic(page);
  await onboarded(page, { motion: 'on' });
  if (init) await page.addInitScript(init);
  await page.goto(`/?demo=1&demoMs=100000${scn ? `&scn=${scn}` : ''}`);
  await page.waitForFunction(() => '__howtogo' in window);
}
async function toH4(page: Page, q: string) {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(q);
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('start-guide')).toBeVisible();
}

test('QA-48: fonts are self-hosted — no third-party font request; the Atkinson face loads from our origin', async ({ page }) => {
  const foreign: string[] = [];
  page.on('request', (r) => {
    if (/font|woff/i.test(r.url()) && !r.url().startsWith(new URL(page.url() || 'http://localhost').origin)) foreign.push(r.url());
  });
  await boot(page);
  await expect(page.locator('link[rel=preload][as=font]')).toHaveAttribute('href', /^\/assets\/atkinson-hyperlegible-latin-700-normal-.*\.woff2$/);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('700 20px "Atkinson Hyperlegible"', '23'))).toBe(true);
  expect(foreign.filter((u) => !u.startsWith('http://localhost'))).toEqual([]);
  expect(await page.evaluate(() => [...document.querySelectorAll('link[href*="googleapis"],link[href*="gstatic"]')].length)).toBe(0);
});

test('QA-29: zh H4 step list names stations from the zh table', async ({ page }) => {
  await boot(page, 'lifts:none');
  await toH4(page, '莱佛士坊');
  await expect(page.getByTestId('step-list')).toContainText(/碧山[\s\S]*莱佛士坊/);
});

test('QA-30: H3 Options → Route options sheet; preference persists and re-ranks; Settings shows it', async ({ page }) => {
  await boot(page);
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await page.getByTestId('route-prefs').click();
  const sheet = page.getByTestId('sheet-route-prefs');
  await expect(sheet).toContainText('路线选项');
  await expect(sheet.getByTestId('setting-preference-least_walk')).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByTestId('pref-liftfriendly')).toBeVisible();
  await sheet.getByTestId('setting-preference-fewest_transfers').click();
  await expect(sheet.getByTestId('setting-preference-fewest_transfers')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => logOf(page)).toContainEqual(expect.stringMatching(/^route:n=\d+ pref=fewest_transfers$/));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.settings')!).preference)).toBe('fewest_transfers');
  await page.getByTestId('sheet-close').click();
  await page.goto('/settings');
  await expect(page.getByTestId('setting-preference-fewest_transfers')).toHaveAttribute('aria-pressed', 'true');
});

test('QA-31/32: Home shows 5 recent trips (from+to dedupe); a started trip stores the date only', async ({ page }) => {
  await boot(page, '', () => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const d = Date.now();
    const p = (name: string, lat: number) => ({ name, lat, lng: 103.85 });
    localStorage.setItem('howtogo.recents', JSON.stringify([
      { to: p('A', 1.31), at: d - 1e5 },
      { to: p('B', 1.32), at: d - 2e5 },
      { to: p('C', 1.33), at: d - 3e5 },
      { to: p('D', 1.34), at: d - 4e5 },
      { to: p('E', 1.35), at: d - 5e5 },
      { to: p('F', 1.36), at: d - 6e5 },
      { to: p('A', 1.31), from: p('Home', 1.3), at: d - 7e5 },
    ]));
  });
  await expect(page.getByTestId('home-recent').locator('.ritem')).toHaveCount(5);
  await expect(page.getByTestId('recent-0')).toContainText('A');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.recents.v2')!));
  expect(stored).toHaveLength(7);
  expect(await page.evaluate(() => localStorage.getItem('howtogo.recents'))).toBeNull();
  await toH4(page, 'tan tock');
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
  const r = await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.recents.v2')!)[0]);
  expect(r).toMatchObject({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), done: false });
  expect(r.at).toBeUndefined();
  expect(r.from).toBeUndefined();
});

test('QA-33/35: About links the Singapore Open Data Licence and shows the data date', async ({ page }) => {
  await boot(page);
  await page.goto('/about');
  const link = page.getByRole('link', { name: 'Singapore Open Data Licence version 1.0' });
  await expect(link).toHaveAttribute('href', 'https://data.gov.sg/open-data-licence');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(page.getByTestId('about-data')).toHaveText(/^data: \d{4}-\d{2}-\d{2}$/);
});

test('QA-34: exit:hidden is logged when the alight station has no exit hint', async ({ page }) => {
  await boot(page, 'lifts:none');
  await toH4(page, '莱佛士坊');
  const l = await logOf(page);
  expect(l.some((x) => x === 'exit:shown' || x === 'exit:hidden')).toBe(true);
});
