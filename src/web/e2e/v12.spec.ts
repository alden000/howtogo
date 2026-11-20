/**
 * 1.2 fixes (QA-72/73): "哪一座？/ Which block?" for a road/estate Home or My place, the Home confirm with the
 * full address + postal, "不对？换一个 / Not right? Pick another" from "use where I am now", the H10 back-fill
 * of a saved Home without a postal code, and the one-time Home nudge. Live mode against a stubbed Worker
 * (answered here, synthetic addresses); fonts and tiles stubbed.
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, onboarded } from './util';

const ESTATE = { name: 'Admiralty Grove', address: '', postal: '', lat: 1.44, lng: 103.801 };
const BLK_A = { name: '676A Woodlands Drive 71', address: '676A Woodlands Drive 71 Singapore 731676', postal: '731676', lat: 1.4401, lng: 103.8011 };
const BLK_B = { name: '676B Woodlands Drive 71', address: '676B Woodlands Drive 71 Singapore 732676', postal: '732676', lat: 1.4404, lng: 103.8013 };
const BY_POSTAL = { name: '680 Woodlands Drive 71', address: '680 Woodlands Drive 71 Singapore 730680', postal: '730680', lat: 1.441, lng: 103.802 };

test.use({ serviceWorkers: 'block', geolocation: { latitude: 1.4401, longitude: 103.8011, accuracy: 10 }, permissions: ['geolocation'] });

interface Opts {
  places?: unknown;
  nudge?: boolean;
  lang?: 'zh' | 'en';
}
async function boot(page: Page, o: Opts = {}) {
  const calls: string[] = [];
  await page.route('**/api/**', (r) => {
    const u = new URL(r.request().url());
    calls.push(u.pathname + u.search);
    if (u.pathname === '/api/health') return r.fulfill({ json: { ok: true, fixtureMode: false } });
    if (u.pathname === '/api/search') {
      const q = u.searchParams.get('q') ?? '';
      return r.fulfill({ json: { results: q === '730680' ? [BY_POSTAL] : /grove/i.test(q) ? [ESTATE] : [] } });
    }
    if (u.pathname === '/api/revgeocode') {
      if (u.searchParams.get('blocks') === '1') return r.fulfill({ json: { blocks: [BLK_A, BLK_B] } });
      return r.fulfill({ json: { name: BLK_A.name, address: BLK_A.address, postal: BLK_A.postal, estate: 'Admiralty Grove' } });
    }
    return r.fulfill({ status: 503, json: { error: { code: 'not_configured', message: 'x' } } });
  });
  await hermetic(page);
  await onboarded(page, { lang: o.lang ?? 'zh', motion: 'on' });
  // util's onboarded() marks the nudge as seen; this test's first load is a fresh 1.2 user.
  if (o.nudge)
    await page.addInitScript(() => {
      if (sessionStorage.getItem('v12.nudge')) return;
      sessionStorage.setItem('v12.nudge', '1');
      localStorage.removeItem('howtogo.homeNudge.v1');
    });
  if (o.places) await page.addInitScript((p) => localStorage.getItem('howtogo.places') || localStorage.setItem('howtogo.places', JSON.stringify(p)), o.places);
  await page.goto('/');
  return calls;
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.places') ?? '{}'));

test('QA-72: an estate picked as Home asks "Which block?"; a nearby block saves address + postal', async ({ page }) => {
  await boot(page);
  await page.getByTestId('set-your-home').click();
  await page.getByTestId('search-input').fill('admiralty grove');
  await page.getByTestId('search-result-0').click();
  const pick = page.getByTestId('home-block');
  await expect(pick).toContainText('哪一座？');
  await expect(pick).toContainText('Admiralty Grove');
  await expect(page.getByTestId('home-block-0')).toContainText('676A Woodlands Drive 71');
  await expect(page.getByTestId('home-block-0')).toContainText('731676');
  await page.getByTestId('home-block-1').click();
  const card = page.getByTestId('home-confirm');
  await expect(card).toContainText('Admiralty Grove');
  await expect(page.getByTestId('home-confirm-addr')).toContainText('676B Woodlands Drive 71');
  await expect(page.getByTestId('home-confirm-addr')).toContainText('Singapore 732676');
  await page.getByTestId('home-yes').click();
  const s = await stored(page);
  expect(s.home).toMatchObject({ name: 'Admiralty Grove', address: BLK_B.address, postal: '732676', lat: BLK_B.lat, lng: BLK_B.lng });
});

test('QA-72: Which block? takes a postal code (bad code → message), or keeps the estate', async ({ page }) => {
  await boot(page, { lang: 'en' });
  await page.getByTestId('set-your-home').click();
  await page.getByTestId('search-input').fill('admiralty grove');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('home-block-postal').fill('7306');
  await page.getByTestId('home-block-postal-go').click();
  await expect(page.getByTestId('home-block-err')).toHaveText('Please type a 6-digit postal code.');
  await page.getByTestId('home-block-postal').fill('730680');
  await page.getByTestId('home-block-postal-go').click();
  await expect(page.getByTestId('home-confirm-addr')).toContainText('Singapore 730680');
  await page.getByTestId('home-yes').click();
  expect((await stored(page)).home.postal).toBe('730680');
  // Keep as is: the estate is saved without a postal code (the driver card back-fills it later).
  await page.goto('/search?mode=home');
  await page.getByTestId('search-input').fill('admiralty grove');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('home-block-keep').click();
  await expect(page.getByTestId('home-confirm')).toContainText('Admiralty Grove');
  await page.getByTestId('home-yes').click();
  expect((await stored(page)).home).toMatchObject({ name: 'Admiralty Grove', lat: ESTATE.lat });
});

test('QA-72: an estate added to My places asks Which block? first; the label stays the estate name', async ({ page }) => {
  await boot(page, { places: { home: { ...BLK_A }, others: [] } });
  await page.goto('/places');
  await page.getByTestId('place-add').click();
  await page.getByTestId('search-input').fill('admiralty grove');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('place-block')).toBeVisible();
  await page.getByTestId('place-block-0').click();
  await expect(page.getByTestId('place-0')).toContainText('Admiralty Grove');
  expect((await stored(page)).others[0]).toMatchObject({ label: 'Admiralty Grove', postal: '731676', address: BLK_A.address });
});

test('QA-73: Home from "use where I am now" shows the full address + postal; "Not right? Pick another" lists blocks', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: false, lang: 'zh' })));
  await boot(page);
  await page.goto('/welcome?p=3');
  await page.getByTestId('fr-home-here').click();
  const card = page.getByTestId('home-confirm');
  await expect(card).toContainText('Admiralty Grove');
  await expect(page.getByTestId('home-confirm-addr')).toContainText('676A Woodlands Drive 71');
  await expect(page.getByTestId('home-confirm-addr')).toContainText('Singapore 731676');
  await expect(page.getByTestId('home-no')).toHaveText('不对？换一个');
  await page.getByTestId('home-no').click();
  await page.getByTestId('home-block-1').click();
  await expect(page.getByTestId('home-confirm-addr')).toContainText('Singapore 732676');
  await page.getByTestId('home-yes').click();
  expect((await stored(page)).home).toMatchObject({ name: 'Admiralty Grove', postal: '732676', address: BLK_B.address });
});

test('QA-72: H10 back-fills a saved Home without a postal code and caches it', async ({ page }) => {
  const calls = await boot(page, { places: { home: { ...ESTATE, address: undefined, postal: undefined }, others: [] } });
  await page.getByTestId('nav-help').click();
  await page.getByTestId('help-driver').click();
  const card = page.getByTestId('driver-card');
  await expect(card).toContainText('Admiralty Grove');
  await expect(card).toContainText('676A Woodlands Drive 71');
  await expect(card.locator('.postal')).toContainText('731676');
  expect(calls.some((c) => c.startsWith('/api/revgeocode?') && !c.includes('blocks=1'))).toBe(true);
  await expect.poll(async () => (await stored(page)).home.postal).toBe('731676');
});

test('QA-72: one-time Home nudge for a Home without a postal code', async ({ page }) => {
  await boot(page, { nudge: true, places: { home: { ...ESTATE, address: undefined, postal: undefined }, others: [] } });
  const nudge = page.getByTestId('home-nudge');
  await expect(nudge).toContainText('加上门牌，司机更容易找到');
  await page.getByTestId('home-nudge-add').click();
  await expect(nudge).toHaveCount(0);
  await expect(page.getByTestId('home-block')).toBeVisible();
  await page.getByTestId('home-block-0').click();
  await page.getByTestId('home-yes').click();
  expect((await stored(page)).home.postal).toBe('731676');
  await page.reload();
  await expect(page.getByTestId('home-nudge')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('howtogo.homeNudge.v1'))).toBe('1');
});
