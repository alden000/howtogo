/**
 * Viewer states with a mocked API (GET + the live WebSocket are intercepted): one baseline per state
 * at 390 and 1440 (STYLE-GUIDE §6e.2 baselines `M4-V-{state}-{light|dark}-{390|1440}-{zh|en}`), plus
 * 200 % text and dark checks for no clipping and no horizontal scroll. The map canvas is masked
 * (WebGL output is not pixel-stable); OneMap tiles are blocked.
 */
import { expect, test, type Page } from '@playwright/test';

const NOW = Date.parse('2026-11-17T02:23:00Z'); // 10:23 am SGT
const iso = (minFromNow: number) => new Date(NOW + minFromNow * 60_000).toISOString();
const ID = 'aB3dE5fG7hJ9';

const base = {
  destName: '陈笃生医院', lang: 'zh', senderName: '妈妈', senderPhone: '+6591234567', status: 'travelling',
  lat: 1.3346, lng: 103.8491, acc: 12, heading: null, etaISO: iso(16), stepText: '在 139 号巴士上，还有 3 站',
  updatedAt: iso(0), positionAt: iso(0), helpAt: null, expiresAt: iso(200),
};
type S = typeof base | Record<string, unknown>;
const st = (over: Record<string, unknown>) => ({ ...base, ...over });

/** get: first GET answer (or 'hang' / {status, code}); ws: messages after connect; wsClose: close at once. */
interface Mock {
  get: S | 'hang' | { http: number; code: string };
  ws?: unknown[];
  wsClose?: boolean;
  thenOffline?: boolean;
}
const ENDED = { ...base, status: 'ended', lat: null, lng: null, acc: null, senderPhone: null, etaISO: null };
const MOCKS: Record<string, Mock> = {
  loading: { get: 'hang' },
  waiting: { get: st({ status: 'waiting', lat: null, lng: null, acc: null, etaISO: null, stepText: null, positionAt: null }) },
  walk: { get: st({ stepText: '正在走路去 Blk 79 巴士站', step: { k: 'walk', place: 'Blk 79 巴士站' } }) },
  wait: { get: st({ stepText: '在 Blk 79 巴士站 等 139 号巴士', step: { k: 'wait', svc: '139', stop: 'Blk 79 巴士站' } }) },
  bus: { get: st({ step: { k: 'bus', svc: '139', stops: 3 } }) },
  train: { get: st({ stepText: '在地铁上，往 滨海南码头 Marina South Pier 方向，还有 1 站', step: { k: 'train', line: 'NS', towards: 'NS28', stops: 1 } }) },
  help: { get: st({ status: 'help', helpAt: iso(0) }) },
  helpcleared: { get: st({ status: 'help', helpAt: iso(0) }), ws: [{ type: 'state', state: st({}) }] },
  arrived: { get: st({ status: 'arrived', etaISO: null, lat: 1.3214, lng: 103.8458, updatedAt: iso(-1) }) },
  nosignal: { get: st({ updatedAt: iso(-5), positionAt: iso(-5) }) },
  ended: { get: st({}), ws: [{ type: 'state', state: ENDED }] },
  endedArrived: { get: st({ status: 'arrived', etaISO: null, updatedAt: iso(-1) }), ws: [{ type: 'state', state: ENDED }] },
  expired: { get: st({}), ws: [{ type: 'expired' }] },
  invalid: { get: { http: 404, code: 'share_not_found' } },
  offline: { get: st({}), wsClose: true, thenOffline: true },
};

async function open(page: Page, state: string, opts: { lang?: 'zh' | 'en' } = {}) {
  const m = MOCKS[state]!;
  await page.clock.setFixedTime(NOW);
  await page.route('https://www.onemap.gov.sg/**', (r) => r.fulfill({ status: 204 }));
  await page.route('**/api/revgeocode**', (r) => r.fulfill({ json: { name: 'Toa Payoh Lorong 4', address: '', postal: '' } }));
  let gets = 0;
  await page.route(`**/api/share/${ID}`, async (r) => {
    gets++;
    if (m.get === 'hang') return; // never answered
    if (gets > 1 && m.thenOffline) return r.abort('internetdisconnected');
    if ('http' in m.get) {
      const e = m.get as { http: number; code: string };
      return r.fulfill({ status: e.http, json: { error: { code: e.code, message: '' } } });
    }
    return r.fulfill({ json: m.get });
  });
  await page.routeWebSocket(/\/api\/share\/.*\/live$/, (ws) => {
    if (m.wsClose) return ws.close();
    const first = m.get !== 'hang' && !('http' in m.get) ? [{ type: 'state', state: m.get }] : [];
    for (const msg of [...first, ...(m.ws ?? [])]) ws.send(JSON.stringify(msg));
  });
  if (opts.lang) await page.addInitScript((l) => localStorage.setItem('howtogo.viewer.lang', l), opts.lang);
  await page.goto(`/t/${ID}`);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-state', state, { timeout: 8000 });
}

/** Nothing in the page is wider than the viewport, and no text box is cut off by its parent. */
async function expectNoClipping(page: Page) {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${vw}`);
    for (const el of document.querySelectorAll<HTMLElement>('#app h1, #app p, #app b, #app span, #app a, header button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || el.closest('[hidden], .sr, .attrib')) continue;
      if (r.right > vw + 1 || r.left < -1) out.push(`${el.tagName} "${el.textContent?.slice(0, 20)}" overflows the viewport`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push(`${el.tagName} "${el.textContent?.slice(0, 20)}" is clipped`);
    }
    return out;
  });
  expect(bad).toEqual([]);
}

const shot = (page: Page, name: string) =>
  expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, mask: [page.locator('.mapcanvas')], maskColor: '#B9D9E4' });

for (const state of Object.keys(MOCKS)) {
  test.describe(`state ${state}`, () => {
    test(`390 baseline`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, state);
      await expectNoClipping(page);
      await shot(page, `M4-V-${state}-light-390-zh`);
    });
    test(`1440 baseline`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, state);
      await expectNoClipping(page);
      await shot(page, `M4-V-${state}-light-1440-zh`);
    });
  });
}

// 200 % text (root font size ×2) and dark mode, at 390: §6e.2 lists bus, help and nosignal.
for (const state of ['bus', 'help', 'nosignal', 'arrived', 'waiting', 'offline']) {
  test(`200% + dark: ${state} has no clipping or sideways scroll`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, state, { lang: 'en' });
    await page.evaluate(() => document.documentElement.setAttribute('data-text-size', 'xxlarge'));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('40px');
    await expectNoClipping(page);
    // Review P1 #1: the card and the ETA text fit their boxes.
    const over = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.card, .eta b')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className || el.tagName),
    );
    expect(over).toEqual([]);
    const call = page.getByTestId('viewer-call');
    if (await call.count()) expect((await call.boundingBox())!.width).toBeGreaterThan(300); // stays full width
    if (await page.locator('#maparea').isVisible()) expect((await page.locator('.map').boundingBox())!.height).toBeGreaterThanOrEqual(240);
    if (['bus', 'help', 'nosignal'].includes(state)) await shot(page, `M4-V-${state}-dark-390-200-en`);
  });
}

test('language toggle switches copy and <html lang>, and is remembered', async ({ page }) => {
  await open(page, 'bus');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  const toggle = page.getByTestId('viewer-lang');
  await expect(toggle).toHaveAccessibleName('Switch to English');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-SG');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('妈妈 is on the way to 陈笃生医院');
  // Structured step: the pill follows the viewer's language (review ruling).
  await expect(page.getByTestId('viewer-pill')).toHaveText('On bus 139, 3 stops to go');
  await expect(toggle).toHaveAccessibleName('切换到中文');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-SG');
});

test('help: assertive announcement once, saffron card with the call button', async ({ page }) => {
  await open(page, 'help');
  await expect(page.locator('#live2')).toHaveText('妈妈按了帮忙。妈妈可能需要你。');
  const card = page.getByTestId('viewer-help');
  await expect(card.getByTestId('viewer-call')).toHaveAttribute('href', 'tel:+6591234567');
  await expect(card).toContainText('妈妈现在在 Toa Payoh Lorong 4 附近');
  expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 210, 63)');
});

test('no phone in the share → no call button and no placeholder', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.route(`**/api/share/${ID}`, (r) => r.fulfill({ json: st({ senderPhone: null }) }));
  await page.routeWebSocket(/\/live$/, () => {});
  await page.goto(`/t/${ID}`);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-state', 'bus');
  await expect(page.getByTestId('viewer-call')).toHaveCount(0);
  await expect(page.locator('#call')).toBeEmpty();
});
