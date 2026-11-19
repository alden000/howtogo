/**
 * Owner bug on 1.0.1 (S2): the family viewer's map was blank (credit only) on a wide desktop window.
 * A fixture share (mocked GET + live WebSocket), OneMap tiles answered with a fixture PNG, at the desktop
 * size the owner used (1252×894, dark) and at 390×844: the map canvas has a real size, OneMap tiles are
 * requested at OneMap zoom levels (11–19) and answered, and the puck is on the map.
 */
import { expect, test, type Page } from '@playwright/test';

const NOW = Date.parse('2026-11-17T02:23:00Z');
const iso = (m: number) => new Date(NOW + m * 60_000).toISOString();
const ID = 'mP4pT3sT5hJ9';
const SHARE = {
  destName: "KK Women's and Children's Hospital", lang: 'zh', senderName: '妈妈', senderPhone: '+6591234567', status: 'travelling',
  lat: 1.3105, lng: 103.8466, acc: 12, heading: 90, etaISO: iso(16), stepText: '正在走路去 Opp Blk 681B', step: { k: 'walk', place: 'Opp Blk 681B' },
  updatedAt: iso(0), positionAt: iso(0), helpAt: null, expiresAt: iso(200),
};
// 1×1 opaque PNG: enough for MapLibre to decode and draw a raster tile.
// (Node's Buffer, without pulling @types/node into the web tsconfig.)
const NodeBuffer = (globalThis as unknown as { Buffer: { from(s: string, enc: 'base64'): Parameters<import('@playwright/test').Route['fulfill']>[0] extends infer O ? O extends { body?: infer B } ? B : never : never } }).Buffer;
const PNG = NodeBuffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function open(page: Page) {
  const tiles: { z: number; status: number }[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(NOW);
  await page.route('https://www.onemap.gov.sg/maps/tiles/**', (r) => {
    const z = Number(/\/tiles\/\w+\/(\d+)\//.exec(r.request().url())?.[1]);
    tiles.push({ z, status: 200 });
    return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  await page.route('https://www.onemap.gov.sg/**', (r) => r.fallback());
  await page.route('**/api/revgeocode**', (r) => r.fulfill({ json: { name: 'Toa Payoh', address: '', postal: '' } }));
  await page.route(`**/api/share/${ID}`, (r) => r.fulfill({ json: SHARE }));
  await page.routeWebSocket(/\/api\/share\/.*\/live$/, (ws) => ws.send(JSON.stringify({ type: 'state', state: SHARE })));
  await page.goto(`/t/${ID}`);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-state', 'walk', { timeout: 8000 });
  return { tiles, errors };
}

for (const vp of [
  { name: 'desktop 1252×894 dark', width: 1252, height: 894, dark: true },
  { name: 'phone 390×844 light', width: 390, height: 844, dark: false },
]) {
  test(`viewer map draws tiles and the puck: ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.emulateMedia({ colorScheme: vp.dark ? 'dark' : 'light' });
    const { tiles, errors } = await open(page);
    // The GL container fills its panel (1.0.1: maplibre-gl.css made it position:relative → 0 px tall, blank).
    await expect(page.locator('#mapcanvas canvas')).toHaveCount(1, { timeout: 15_000 });
    const size = () => page.evaluate(() => {
      const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
      const m = r('.map'), c = r('#mapcanvas'), g = r('#mapcanvas canvas');
      return { map: [Math.round(m.width), Math.round(m.height)], container: [Math.round(c.width), Math.round(c.height)], canvas: [Math.round(g.width), Math.round(g.height)] };
    });
    await expect.poll(async () => { const s = await size(); return s.container[1] === s.map[1] && s.canvas[1] === s.map[1] && s.canvas[0] === s.map[0] ? 'fills' : JSON.stringify(s); }).toBe('fills');
    expect((await size()).map[1]).toBeGreaterThan(200);
    await expect(page.locator('#app')).toHaveAttribute('data-map', 'ready');
    await expect.poll(() => tiles.length, { message: 'OneMap tile requests' }).toBeGreaterThan(0);
    for (const t of tiles) {
      expect(t.z, 'OneMap only serves levels 11–19').toBeGreaterThanOrEqual(11);
      expect(t.z).toBeLessThanOrEqual(19);
    }
    await expect(page.locator('#app')).toHaveAttribute('data-puck', '1');
    expect(errors, 'no page errors').toEqual([]);
  });
}
