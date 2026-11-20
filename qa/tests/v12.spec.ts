/**
 * QA 1.2.0 gate: the 1.2 web fixes (director-log 2026-11-20 rulings QA-68…73).
 *  - QA-72 driver card back-fill, "哪一座？/ Which block?" (estate and road picks), postal-code entry and its
 *    error copy, the one-time Home nudge;
 *  - QA-73 Home from "use where I am now": full address + postal, "不对？换一个 / Not right? Pick another";
 *  - QA-71 ranking (station above the 7-Eleven tenant entry), QA-68/69 casing, QA-70 "poly".
 *
 * The /api answers routed to the browser are produced HERE by the Worker's REAL pure parts (alias table,
 * OneMap normalisers, titleCase/BRAND_CASE, rankPlaces) fed with synthetic upper-case OneMap payloads, so each
 * UI check also checks the Worker normaliser/ranking behind it. No network I/O at all; no AI (Anthropic is
 * never called).
 */
import { expect, test, type Page } from '@playwright/test';
import { normaliseNearbyBlocks, normaliseRevGeocode, normaliseSearch } from '../../src/worker/src/normalise';
import { rankPlaces } from '../../src/shared/src/placeRank';
import { expandAliases } from '../../src/shared/src/alias';
import { prettyStopName } from '../../src/shared/src/onemap';
import { setup } from './helpers';

test.use({ serviceWorkers: 'block' });

// ------------------------------------------------------------------ the real Worker, OneMap stubbed
type Row = { SEARCHVAL: string; BLK_NO: string; ROAD_NAME: string; BUILDING: string; ADDRESS: string; POSTAL: string; LATITUDE: string; LONGITUDE: string };
const row = (building: string, blk: string, road: string, postal: string, lat: number, lng: number): Row => ({
  SEARCHVAL: building !== 'NIL' ? building : `${blk} ${road}`,
  BLK_NO: blk,
  ROAD_NAME: road,
  BUILDING: building,
  ADDRESS: [blk, road, building !== 'NIL' ? building : '', `SINGAPORE ${postal}`].filter((x) => x && x !== 'NIL').join(' '),
  POSTAL: postal,
  LATITUDE: String(lat),
  LONGITUDE: String(lng),
});
/** OneMap elastic search: synthetic, upper case, in OneMap's own (tenant-first) order. */
const ONEMAP_SEARCH: Record<string, Row[]> = {
  chinatown: [
    row('7-ELEVEN MART CHINATOWN MRT STATION', '151', 'NEW BRIDGE ROAD', '059443', 1.2844, 103.8441),
    row('CHEERS CHINATOWN MRT STATION', '151', 'NEW BRIDGE ROAD', '059443', 1.2844, 103.8442),
    row('CHINATOWN MRT STATION (NE4 / DT19)', '151', 'NEW BRIDGE ROAD', '059443', 1.2845, 103.8443),
    row('CHINATOWN POINT', '133', 'NEW BRIDGE ROAD', '059413', 1.2852, 103.8448),
  ],
  get 'chinatown mrt station'() {
    return this.chinatown;
  },
  'chinatown mrt': [
    row('7-ELEVEN MART CHINATOWN MRT STATION', '151', 'NEW BRIDGE ROAD', '059443', 1.2844, 103.8441),
    row('CHINATOWN MRT STATION (NE4 / DT19)', '151', 'NEW BRIDGE ROAD', '059443', 1.2845, 103.8443),
  ],
  vivocity: [row('VIVOCITY', '1', 'HARBOURFRONT WALK', '098585', 1.2644, 103.8222)],
  jcube: [row('JCUBE', '2', 'JURONG EAST CENTRAL 1', '609731', 1.3334, 103.7403)],
  'nparks hq': [row('NPARKS HQ', '1', 'CLUNY ROAD', '259569', 1.3138, 103.8159)],
  'ica hq': [row('ICA HQ', '10', 'KALLANG ROAD', '208718', 1.3105, 103.8605)],
  'ngee ann polytechnic': [row('NGEE ANN POLYTECHNIC', '535', 'CLEMENTI ROAD', '599489', 1.3329, 103.7743)],
  'ngee ann poly': [row('NGEE ANN POLYCLINIC CARPARK', '1', 'TEST ROAD', '599001', 1.333, 103.775)],
};
/** OneMap revgeocode around the estate: the estate-only entry is the NEAREST (the QA-73 cause). */
const GEO = (b: string, blk: string, road: string, postal: string, lat: number, lng: number) => ({
  BUILDINGNAME: b,
  BLOCK: blk,
  ROAD: road,
  POSTALCODE: postal,
  XCOORD: '1',
  YCOORD: '1',
  LATITUDE: String(lat),
  LONGITUDE: String(lng),
});
const ONEMAP_REVGEO = {
  GeocodeInfo: [
    GEO('MAPLE GROVE', 'NIL', 'NIL', 'NIL', 1.4302, 103.8352),
    GEO('NIL', '418A', 'SAMPLE AVENUE 4', '561418', 1.4303, 103.8353),
    GEO('NIL', '418B', 'SAMPLE AVENUE 4', '562418', 1.4306, 103.8355),
    GEO('NIL', '420', 'SAMPLE AVENUE 4', '560420', 1.431, 103.836),
  ],
};
const ESTATE_PT = { lat: 1.4301, lng: 103.8351 };

/**
 * The Worker's /api/search and /api/revgeocode composition (src/worker/src/api.ts), rebuilt from its REAL pure
 * parts: expandAliases → OneMap per term + the typed text → normaliseSearch (titleCase, BRAND_CASE) → merge on
 * name+postal (alias hits first, as handleSearch merges) → rankPlaces(+2 alias bonus) → top 10; revgeocode →
 * normaliseRevGeocode / normaliseNearbyBlocks. (api.ts itself pulls in `cloudflare:workers`, which Node cannot
 * load; the handlers are covered by the Worker unit tests.) No I/O: OneMap answers come from the tables above.
 */
async function worker(kind: 'search' | 'revgeocode', qs: string): Promise<{ status: number; body: any; onemap: string[] }> {
  const onemap: string[] = [];
  const sp = new URLSearchParams(qs);
  const om = (q: string) => {
    onemap.push(`/api/common/elastic/search?searchVal=${encodeURIComponent(q)}`);
    return normaliseSearch({ results: ONEMAP_SEARCH[q.toLowerCase()] ?? [] }).results;
  };
  if (kind === 'search') {
    const q = (sp.get('q') ?? '').trim().replace(/\s+/g, ' ');
    const x = expandAliases(q);
    const hits: any[] = [];
    const seen = new Set<string>();
    const merge = (list: { name: string; postal?: string }[], via: string) => {
      for (const p of list) {
        const k = `${p.name.toLowerCase()}|${p.postal ?? ''}`;
        if (seen.has(k)) continue;
        seen.add(k);
        hits.push({ ...p, via });
      }
    };
    const direct = om(q);
    for (const t of x.terms) merge(om(t), 'alias');
    merge(direct, 'direct');
    return { status: 200, body: { results: rankPlaces(hits, q, (h) => (h.via === 'alias' ? 2 : 0)).slice(0, 10), didYouMean: false }, onemap };
  }
  if (sp.get('blocks') === '1') return { status: 200, body: { blocks: normaliseNearbyBlocks(ONEMAP_REVGEO) }, onemap };
  return { status: 200, body: normaliseRevGeocode(ONEMAP_REVGEO), onemap };
}
const names = (b: { results: { name: string }[] }) => b.results.map((r) => r.name);

test.describe('Worker pipeline (real normalisers + ranking, synthetic OneMap)', () => {
  test('QA-71: Chinatown MRT ranks above the 7-Eleven / Cheers tenant entries (direct and alias queries)', async () => {
    for (const q of ['chinatown', 'chinatown mrt']) {
      const { body } = await worker('search', `q=${encodeURIComponent(q)}`);
      const n = names(body);
      expect(n[0], q).toBe('Chinatown MRT Station (NE4 / DT19)');
      const i711 = n.findIndex((x) => /^7-eleven mart chinatown mrt station$/i.test(x));
      expect(i711, q).toBeGreaterThan(0);
      if (q === 'chinatown') {
        expect(n.indexOf('Chinatown Point')).toBeLessThan(i711);
        expect(n.indexOf('Chinatown Point')).toBeLessThan(n.indexOf('Cheers Chinatown MRT Station'));
      }
    }
    // 牛车水 is a curated alias of Chinatown: the alias path ranks the same way.
    expect(expandAliases('牛车水').terms.map((t) => t.toLowerCase())).toContain('chinatown mrt station');
    const { body } = await worker('search', `q=${encodeURIComponent('牛车水')}`);
    expect(names(body)[0]).toBe('Chinatown MRT Station (NE4 / DT19)');
    expect(names(body).at(-1)).toMatch(/7-Eleven|Cheers/);
  });

  test('QA-68/69: VivoCity, JCube, NParks and ICA HQ keep their own case (search + bus-stop names)', async () => {
    const want: Record<string, string> = { vivocity: 'VivoCity', jcube: 'JCube', 'nparks hq': 'NParks HQ', 'ica hq': 'ICA HQ' };
    for (const [q, name] of Object.entries(want)) {
      const { body } = await worker('search', `q=${encodeURIComponent(q)}`);
      expect(body.results[0].name, q).toBe(name);
      expect(body.results[0].address, q).not.toMatch(/VIVOCITY|Vivocity|Jcube|Nparks|Hq\b/);
    }
    expect(prettyStopName('VIVOCITY')).toBe('VivoCity');
    expect(prettyStopName('OPP JCUBE')).toBe('Opp JCube');
    expect(prettyStopName('HARBOURFRONT STN/VIVOCITY')).toBe('Harbourfront Stn/VivoCity');
  });

  test('QA-70: "<name> poly" searches the polytechnic; a town + poly stays a polyclinic', async () => {
    for (const q of ['ngee ann poly', 'np', 'ngee ann poly bus stop']) {
      const terms = expandAliases(q).terms.map((t) => t.toLowerCase());
      expect(terms.join('|'), q).toMatch(/ngee ann polytechnic/);
      expect(terms.join('|'), q).not.toMatch(/polyclinic/);
    }
    for (const q of ['ang mo kio poly', 'bedok poly']) expect(expandAliases(q).terms.join('|').toLowerCase(), q).toMatch(/polyclinic/);
    const { body, onemap } = await worker('search', `q=${encodeURIComponent('ngee ann poly')}`);
    expect(onemap.some((p) => /searchVal=Ngee(%20|\+)Ann(%20|\+)Polytechnic/i.test(p))).toBe(true);
    expect(body.results[0].name).toBe('Ngee Ann Polytechnic');
  });

  test('QA-73: revgeocode prefers the nearest entry with block + postal; the estate is a secondary line', async () => {
    const { body } = await worker('revgeocode', `lat=${ESTATE_PT.lat}&lng=${ESTATE_PT.lng}`);
    expect(body).toMatchObject({ postal: '561418', estate: 'Maple Grove' });
    expect(body.address).toContain('418A Sample Avenue 4');
    const blocks = (await worker('revgeocode', `lat=${ESTATE_PT.lat}&lng=${ESTATE_PT.lng}&blocks=1`)).body.blocks;
    expect(blocks.map((b: { postal: string }) => b.postal)).toEqual(['561418', '562418', '560420']);
  });
});

// ------------------------------------------------------------------ browser, /api routed to the Worker's answers
interface Answers {
  search: Record<string, unknown>;
  rev: unknown;
  blocks: unknown;
}
let cache: Answers | null = null;
async function answers(): Promise<Answers> {
  if (cache) return cache;
  const search: Record<string, unknown> = {};
  for (const q of ['chinatown', 'vivocity']) search[q] = (await worker('search', `q=${q}`)).body;
  // An estate and a road as OneMap search hits: no block, no postal (what the owner's Home was).
  search['maple grove'] = { results: [{ name: 'Maple Grove', address: '', postal: '', lat: ESTATE_PT.lat, lng: ESTATE_PT.lng, via: 'direct' }], didYouMean: false };
  search['sample avenue 4'] = { results: [{ name: 'Sample Avenue 4', address: 'Sample Avenue 4', postal: '', lat: 1.4304, lng: 103.8354, via: 'direct' }], didYouMean: false };
  search['560420'] = { results: [{ name: '420 Sample Avenue 4', address: '420 Sample Avenue 4 Singapore 560420', postal: '560420', lat: 1.431, lng: 103.836, via: 'direct' }], didYouMean: false };
  const rev = (await worker('revgeocode', `lat=${ESTATE_PT.lat}&lng=${ESTATE_PT.lng}`)).body;
  const blocks = (await worker('revgeocode', `lat=${ESTATE_PT.lat}&lng=${ESTATE_PT.lng}&blocks=1`)).body;
  return (cache = { search, rev, blocks });
}

const ESTATE_HOME = { home: { name: 'Maple Grove', lat: ESTATE_PT.lat, lng: ESTATE_PT.lng }, others: [] };
const BLOCK_HOME = { home: { name: '420 Sample Avenue 4', address: '420 Sample Avenue 4 Singapore 560420', postal: '560420', lat: 1.431, lng: 103.836 }, others: [] };

/** Where the phone is: the estate (QA-73 tests) or elsewhere (Toa Payoh), so H1's own "where am I" lookup is not a back-fill call. */
const AWAY = { latitude: 1.33465, longitude: 103.8491, accuracy: 10 };
async function boot(page: Page, o: { lang?: 'zh' | 'en'; places?: unknown; nudge?: 'fresh' | 'seen'; onboarded?: boolean; path?: string; atEstate?: boolean } = {}) {
  const a = await answers();
  const calls: string[] = [];
  await page.route('**/api/**', (r) => {
    const u = new URL(r.request().url());
    calls.push(u.pathname + u.search);
    if (u.pathname === '/api/health') return r.fulfill({ json: { ok: true, fixtureMode: false } });
    if (u.pathname === '/api/search') {
      const q = (u.searchParams.get('q') ?? '').toLowerCase().trim();
      return r.fulfill({ json: a.search[q] ?? { results: [], didYouMean: false } });
    }
    if (u.pathname === '/api/revgeocode') return r.fulfill({ json: u.searchParams.get('blocks') === '1' ? a.blocks : a.rev });
    return r.fulfill({ status: 503, json: { error: { code: 'not_configured', message: 'x' } } });
  });
  await setup(page, { lang: o.lang ?? 'zh', ...(o.onboarded === false ? { onboarded: false } : {}) }, o.places, { clock: false });
  if (o.nudge !== 'fresh') await page.addInitScript(() => localStorage.getItem('howtogo.homeNudge.v1') || localStorage.setItem('howtogo.homeNudge.v1', '1'));
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(o.atEstate ? { latitude: ESTATE_PT.lat, longitude: ESTATE_PT.lng, accuracy: 10 } : AWAY);
  await page.goto(o.path ?? '/');
  return calls;
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.places') ?? '{}'));
/** Back-fill lookups: revgeocode of the saved Home's point (not of the phone's position). */
const revCalls = (calls: string[], lat = '1.4301') => calls.filter((c) => c.startsWith('/api/revgeocode') && !c.includes('blocks=1') && c.includes(`lat=${lat}`));

test.describe('QA-72 driver card back-fill', () => {
  test('H10: a Home saved without a postal code shows the full address + postal, and keeps it', async ({ page }) => {
    const calls = await boot(page, { places: ESTATE_HOME });
    await page.getByTestId('nav-help').click();
    await page.getByTestId('help-driver').click();
    const card = page.getByTestId('driver-card');
    await expect(card).toContainText('Maple Grove');
    await expect(card).toContainText('418A Sample Avenue 4');
    await expect(card.locator('.postal')).toHaveText('Singapore 561418');
    await expect.poll(async () => (await stored(page)).home).toMatchObject({ name: 'Maple Grove', postal: '561418' });
    expect(revCalls(calls)).toHaveLength(1);
    // Cached back: the next H10 needs no lookup.
    await page.goto('/');
    await page.getByTestId('nav-help').click();
    await page.getByTestId('help-driver').click();
    await expect(page.getByTestId('driver-card').locator('.postal')).toHaveText('Singapore 561418');
    expect(revCalls(calls)).toHaveLength(1);
  });

  test('H10: a Home that already has a postal code is not looked up again', async ({ page }) => {
    const calls = await boot(page, { places: BLOCK_HOME });
    await page.getByTestId('nav-help').click();
    await page.getByTestId('help-driver').click();
    await expect(page.getByTestId('driver-card').locator('.postal')).toHaveText('Singapore 560420');
    await page.waitForTimeout(500);
    expect(revCalls(calls, '1.431')).toHaveLength(0);
  });
});

test.describe('QA-72 Which block?', () => {
  test('estate picked as Home: zh copy, nearby blocks (nearest first), the pick saves address + postal', async ({ page }) => {
    await boot(page);
    await page.getByTestId('set-your-home').click();
    await page.getByTestId('search-input').fill('maple grove');
    await page.getByTestId('search-result-0').click();
    const pick = page.getByTestId('home-block');
    await expect(pick).toContainText('哪一座？');
    await expect(pick).toContainText('“Maple Grove”有好几座楼。选你的那一座，司机更容易找到。');
    await expect(pick).toContainText('或者输入邮区编号（6 位数）');
    await expect(page.getByTestId('home-block-keep')).toHaveText('先不用，就用“Maple Grove”');
    await expect(page.getByTestId('home-block-0')).toContainText('418A Sample Avenue 4');
    await expect(page.getByTestId('home-block-0')).toContainText('Singapore 561418');
    await expect(page.getByTestId('home-block-2')).toContainText('560420');
    await page.getByTestId('home-block-1').click();
    await expect(page.getByTestId('home-confirm')).toContainText('Maple Grove');
    await expect(page.getByTestId('home-confirm-addr')).toContainText('Singapore 562418');
    await page.getByTestId('home-yes').click();
    expect((await stored(page)).home).toMatchObject({ name: 'Maple Grove', postal: '562418', address: expect.stringContaining('418B Sample Avenue 4') });
  });

  test('road picked as Home: the picker opens and the block name replaces the road name', async ({ page }) => {
    await boot(page, { lang: 'en' });
    await page.getByTestId('set-your-home').click();
    await page.getByTestId('search-input').fill('sample avenue 4');
    await page.getByTestId('search-result-0').click();
    await expect(page.getByTestId('home-block')).toContainText('Which block?');
    await expect(page.getByTestId('home-block')).toContainText('“Sample Avenue 4” has several blocks. Pick yours so drivers find it easily.');
    await page.getByTestId('home-block-0').click();
    await page.getByTestId('home-yes').click();
    const h = (await stored(page)).home;
    expect(h.postal).toBe('561418');
    expect(h.name).toMatch(/^418A Sample Avenue 4/);
  });

  test('postal-code entry: short code and unknown code give the error copy (zh); a good code saves', async ({ page }) => {
    await boot(page);
    await page.getByTestId('set-your-home').click();
    await page.getByTestId('search-input').fill('maple grove');
    await page.getByTestId('search-result-0').click();
    const err = page.getByTestId('home-block-err');
    await page.getByTestId('home-block-postal').fill('5604');
    await page.getByTestId('home-block-postal-go').click();
    await expect(err).toHaveText('请输入 6 位数的邮区编号。');
    await page.getByTestId('home-block-postal').fill('999999');
    await page.getByTestId('home-block-postal-go').click();
    await expect(err).toHaveText('没有找到这个邮区编号。请再看一看。');
    await page.getByTestId('home-block-postal').fill('560420');
    await page.getByTestId('home-block-postal-go').click();
    await expect(page.getByTestId('home-confirm-addr')).toContainText('Singapore 560420');
    await page.getByTestId('home-yes').click();
    expect((await stored(page)).home).toMatchObject({ name: 'Maple Grove', postal: '560420' });
  });

  test('postal-code error copy in English', async ({ page }) => {
    await boot(page, { lang: 'en' });
    await page.getByTestId('set-your-home').click();
    await page.getByTestId('search-input').fill('maple grove');
    await page.getByTestId('search-result-0').click();
    await page.getByTestId('home-block-postal').fill('12a456');
    await page.getByTestId('home-block-postal-go').click();
    await expect(page.getByTestId('home-block-err')).toHaveText('Please type a 6-digit postal code.');
    await page.getByTestId('home-block-postal').fill('999999');
    await page.getByTestId('home-block-postal-go').click();
    await expect(page.getByTestId('home-block-err')).toHaveText("We couldn't find that postal code. Please check it and try again.");
  });
});

test.describe('QA-72 one-time Home nudge', () => {
  test('shows once for a Home without a postal code; 不用了 sets the flag; never again', async ({ page }) => {
    await boot(page, { nudge: 'fresh', places: ESTATE_HOME });
    const nudge = page.getByTestId('home-nudge');
    await expect(nudge).toContainText('加上门牌号，司机更容易找到你家');
    await page.getByTestId('home-nudge-close').click();
    await expect(nudge).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('howtogo.homeNudge.v1'))).toBe('1');
    await page.reload();
    await expect(page.getByTestId('set-your-home').or(page.getByTestId('nav-help')).first()).toBeVisible();
    await expect(page.getByTestId('home-nudge')).toHaveCount(0);
    expect((await stored(page)).home.postal).toBeUndefined();
  });

  test('no nudge when Home has a postal code', async ({ page }) => {
    await boot(page, { nudge: 'fresh', places: BLOCK_HOME });
    await expect(page.getByTestId('nav-help')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('home-nudge')).toHaveCount(0);
  });

  test('no nudge when there is no Home', async ({ page }) => {
    await boot(page, { nudge: 'fresh' });
    await expect(page.getByTestId('set-your-home')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('home-nudge')).toHaveCount(0);
  });

  test('Delete all clears the nudge flag', async ({ page }) => {
    await boot(page, { nudge: 'fresh', places: ESTATE_HOME });
    await page.getByTestId('home-nudge-close').click();
    expect(await page.evaluate(() => localStorage.getItem('howtogo.homeNudge.v1'))).toBe('1');
    await page.goto('/settings');
    await page.getByTestId('row-delete-all').click();
    await page.getByTestId('delete-all-go').click();
    await page.waitForURL((u) => u.pathname === '/', { timeout: 15_000 });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => localStorage.getItem('howtogo.homeNudge.v1'))).toBeNull();
  });
});

test.describe('QA-73 Home from my location', () => {
  test('welcome "use where I am now": full address + postal; 不对？换一个 lists blocks; saves address + postal', async ({ page }) => {
    await boot(page, { onboarded: false, path: '/welcome?p=3', atEstate: true });
    await page.getByTestId('fr-home-here').click();
    await expect(page.getByTestId('home-confirm')).toContainText('Maple Grove');
    await expect(page.getByTestId('home-confirm-addr')).toContainText('418A Sample Avenue 4');
    await expect(page.getByTestId('home-confirm-addr')).toContainText('Singapore 561418');
    await expect(page.getByTestId('home-no')).toHaveText('不对？换一个');
    await page.getByTestId('home-yes').click();
    expect((await stored(page)).home).toMatchObject({ postal: '561418', address: expect.stringContaining('418A Sample Avenue 4') });
  });

  test('"Not right? Pick another" (en) picks a nearby block instead', async ({ page }) => {
    await boot(page, { lang: 'en', onboarded: false, path: '/welcome?p=3', atEstate: true });
    await page.getByTestId('fr-home-here').click();
    await expect(page.getByTestId('home-no')).toHaveText('Not right? Pick another');
    await page.getByTestId('home-no').click();
    await expect(page.getByTestId('home-block')).toContainText('Which block?');
    await page.getByTestId('home-block-2').click();
    await expect(page.getByTestId('home-confirm-addr')).toContainText('Singapore 560420');
    await page.getByTestId('home-yes').click();
    expect((await stored(page)).home.postal).toBe('560420');
  });
});

test.describe('QA-71/69 in the search list', () => {
  test('chinatown: the station is the first row, tenant entries below; VivoCity cased', async ({ page }) => {
    await boot(page, { places: BLOCK_HOME });
    await page.goto('/search');
    await page.getByTestId('search-input').fill('chinatown');
    await expect(page.getByTestId('search-result-0')).toContainText('Chinatown MRT Station (NE4 / DT19)');
    const rows = await page.getByTestId('search-results').locator('li').allInnerTexts();
    const iStation = rows.findIndex((t) => t.includes('Chinatown MRT Station (NE4'));
    const i711 = rows.findIndex((t) => /7-eleven/i.test(t));
    expect(iStation).toBe(0);
    expect(i711).toBeGreaterThan(iStation);
    await page.getByTestId('search-input').fill('vivocity');
    await expect(page.getByTestId('search-result-0')).toContainText('VivoCity');
    await expect(page.getByTestId('search-results')).not.toContainText(/VIVOCITY|Vivocity/);
  });
});
