/**
 * Hotfix 1.0.1 (owner bug): the H4 route map must show the WHOLE journey on load. With a long N-S itinerary
 * (Seletar -> Novena, ~11 km) every route vertex has to project inside the map card, clear of the OneMap
 * attribution (bottom-left) and the 56 px locate button (bottom-right), which must not overlap each other.
 * Live mode against a stubbed Worker (answered here); fonts and tiles stubbed.
 */
import { expect, test, type Page } from '@playwright/test';
import { buildPlan, type StopSpec } from '../../shared/test/fixtures/builder';
import { hermetic, logOf, onboarded } from './util';

const FIXED = new Date('2026-11-18T10:15:00+08:00');
const S = (name: string, lat: number, lng: number, code?: string): StopSpec => (code ? { name, lat, lng, code } : { name, lat, lng });
const ORIGIN = S('Origin', 1.417, 103.865); // Seletar
const DEST = S('Destination', 1.32135, 103.8465); // Tan Tock Seng Hospital, by Novena
const AMK = S('ANG MO KIO INT', 1.3696, 103.8483, '54009');
const NS = [S('ANG MO KIO MRT STATION', 1.36994, 103.84954, 'NS16'), S('BISHAN MRT STATION', 1.35092, 103.84825, 'NS17'), S('BRADDELL MRT STATION', 1.3404, 103.8468, 'NS18'), S('TOA PAYOH MRT STATION', 1.33262, 103.84733, 'NS19'), S('NOVENA MRT STATION', 1.3204, 103.8436, 'NS20')];
const LONG_TRIP = buildPlan(ORIGIN, DEST, FIXED.getTime(), [
  {
    fare: '1.89',
    legs: [
      { mode: 'WALK', from: ORIGIN, to: S('OPP SELETAR CAMP', 1.416, 103.866, '68009') },
      {
        mode: 'BUS',
        route: '103',
        routeLongName: 'SBST BUS 103',
        agencyName: 'SBS Transit',
        agencyId: '1:SBST',
        waitS: 240,
        stops: [S('OPP SELETAR CAMP', 1.416, 103.866, '68009'), S('SELETAR RD', 1.405, 103.8655, '68001'), S('YIO CHU KANG RD', 1.392, 103.86, '55011'), S('AMK AVE 5', 1.38, 103.852, '54301'), AMK],
      },
      { mode: 'WALK', from: AMK, to: NS[0]!, via: [[1.37, 103.8488]] },
      { mode: 'RAIL', route: 'NS', routeLongName: 'NORTH SOUTH LINE', agencyName: 'SMRT Corporation', agencyId: '1:SMRT', stops: NS, waitS: 120 },
      { mode: 'WALK', from: NS[4]!, to: DEST, via: [[1.3208, 103.845]] },
    ],
  },
]);
const NOVENA = { name: 'Tan Tock Seng Hospital', address: '11 Jalan Tan Tock Seng Singapore 308433', postal: '308433', lat: DEST.lat, lng: DEST.lng };

test.use({ serviceWorkers: 'block', geolocation: { latitude: ORIGIN.lat, longitude: ORIGIN.lng, accuracy: 10 } });

async function toTrip(page: Page, textSize: 'standard' | 'xxlarge', theme: 'light' | 'dark' = 'dark') {
  await page.route('**/api/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/health') return r.fulfill({ json: { ok: true, fixtureMode: false } });
    if (u.pathname === '/api/search') return r.fulfill({ json: { results: [NOVENA] } });
    if (u.pathname === '/api/route') return r.fulfill({ json: LONG_TRIP });
    return r.fulfill({ status: 503, json: { error: { code: 'not_configured', message: 'x' } } });
  });
  await hermetic(page);
  await page.clock.setFixedTime(FIXED);
  await onboarded(page, { lang: 'en', theme, textSize, motion: 'on' });
  await page.goto('/');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('step-list')).toBeVisible();
  await expect(page.getByTestId('map-recentre')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await logOf(page)).some((l) => l.startsWith('map:fit')), { timeout: 15_000 }).toBe(true);
}

type Box = { left: number; top: number; right: number; bottom: number };
/** Route vertices projected by the live map (container px), the container size and the overlays (container px). */
const measure = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid=map]') as HTMLElement & { __howtogoMap: { map: { project(p: [number, number]): { x: number; y: number }; isMoving(): boolean }; points(): [number, number][] } };
    const h = el.__howtogoMap;
    const c = el.getBoundingClientRect();
    const rel = (s: string): Box => {
      const r = document.querySelector(s)!.getBoundingClientRect();
      return { left: r.left - c.left, top: r.top - c.top, right: r.right - c.left, bottom: r.bottom - c.top };
    };
    return {
      settled: !h.map.isMoving(),
      w: c.width,
      h: c.height,
      pts: h.points().map((p) => h.map.project(p)),
      attrib: rel('.mapbox .attribhost .credit'),
      locate: rel('[data-testid=map-recentre]'),
    };
  });
const inside = (x: number, y: number, b: Box) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
const overlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const width of [390, 412])
  for (const textSize of ['standard', 'xxlarge'] as const)
    test(`H4 long trip at ${width} px, ${textSize === 'standard' ? 100 : 200} % text: every route vertex inside the map, clear of attribution + locate`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 839 });
      await toTrip(page, textSize);
      await expect.poll(async () => (await measure(page)).settled, { timeout: 15_000 }).toBe(true);
      const m = await measure(page);
      expect(m.pts.length).toBeGreaterThan(10);
      const off = m.pts.filter((p) => !inside(p.x, p.y, { left: 0, top: 0, right: m.w, bottom: m.h }));
      expect(off, `${off.length}/${m.pts.length} vertices outside the ${Math.round(m.w)}x${Math.round(m.h)} map`).toEqual([]);
      const under = m.pts.filter((p) => inside(p.x, p.y, m.attrib) || inside(p.x, p.y, m.locate));
      expect(under, 'vertices under the attribution or the locate button').toEqual([]);
      // Attribution: bottom-left, visible, not covered by the locate button; locate is a 56 px target.
      expect(overlap(m.attrib, m.locate), 'locate button overlaps the attribution').toBe(false);
      expect(m.attrib.bottom).toBeGreaterThan(m.h / 2);
      expect(m.attrib.left).toBeLessThan(m.w / 2);
      expect(m.locate.right - m.locate.left).toBeGreaterThanOrEqual(56);
      expect(m.locate.bottom - m.locate.top).toBeGreaterThanOrEqual(56);
      await expect(page.locator('.mapbox .attribhost .credit')).toContainText('Singapore Land Authority');
      expect(await logOf(page)).toContain('map:fit all');
      // The owner's setup (412 px, dark, en): the card with the attribution bottom-left and locate bottom-right (canvas masked).
      if (width === 412 && textSize === 'standard') {
        await page.addStyleTag({ content: '.mapbox .maplibregl-canvas { visibility: hidden !important }' });
        await expect(page.getByTestId('map-box')).toHaveScreenshot('H4-mapcard-dark-100-en.png', { mask: [page.locator('[data-testid=map-box] img')] });
        await page.addStyleTag({ content: '.mapbox .maplibregl-canvas { visibility: visible !important }' });
      }

      // 1.1 C1-A: the compact credit is about 160 x 35 px at every text size (px, does not follow --ts).
      expect(m.attrib.right - m.attrib.left).toBeLessThanOrEqual(200);
      expect(m.attrib.bottom - m.attrib.top).toBeLessThanOrEqual(40);
      expect(m.attrib.left).toBeGreaterThanOrEqual(11);
      expect(m.h - m.attrib.bottom).toBeGreaterThanOrEqual(11);
      expect(await page.locator('.mapbox .attribhost a, .mapbox .attribhost button').count()).toBe(0);

      // Bigger map: refitted to the new size, still the whole trip.
      await page.getByTestId('toggle-map').click();
      await expect.poll(async () => {
        const b = await measure(page);
        const out = b.pts.filter((p) => !inside(p.x, p.y, { left: 0, top: 0, right: b.w, bottom: b.h }));
        return `settled=${b.settled} tall=${b.h > m.h * 1.4} outside=${out.length}`;
      }, { timeout: 15_000 }).toBe('settled=true tall=true outside=0');
    });

// 1.1 C1-A baselines (STYLE-GUIDE 6g.1): the H4 overview card with the credit bottom-left and the locate button
// bottom-right, light/dark x 100/200 % at 390 px (canvas hidden; the logo masked as in every baseline).
for (const theme of ['light', 'dark'] as const)
  for (const textSize of ['standard', 'xxlarge'] as const)
    test(`C1-A-card-${theme}-${textSize === 'standard' ? 100 : 200}-en`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await toTrip(page, textSize, theme);
      await expect(page.getByTestId('map-credit')).toHaveText('OneMap © contributors, Singapore Land Authority');
      await page.addStyleTag({ content: '.mapbox .maplibregl-canvas { visibility: hidden !important }' });
      await expect(page.getByTestId('map-box')).toHaveScreenshot(`C1-A-card-${theme}-${textSize === 'standard' ? 100 : 200}-en.png`, { mask: [page.locator('[data-testid=map-box] img')] });
    });
