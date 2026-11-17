/**
 * M4 two-browser share test (AC 17–21, OQ6): context A = the senior's side (talks to the API like the
 * app does), context B = a family member on /t/:id. Real Durable Object under `wrangler dev --env test`,
 * proxied by `vite preview` (playwright.viewer.config.ts).
 */
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { TEST_TTL_S } from '../playwright.viewer.config';

const hermetic = (page: Page) => page.route('https://www.onemap.gov.sg/**', (r) => r.fulfill({ status: 204 }));

async function createShare(api: APIRequestContext, body: Record<string, unknown> = {}) {
  const res = await api.post('/api/share', {
    data: { destName: '陈笃生医院', lang: 'zh', senderName: '妈妈', senderPhone: '+6591234567', ...body },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; ownerToken: string; viewPath: string };
}

/** PUT with the owner token; waits out the 3 s owner rate limit (help bypasses it, D-7). */
async function put(api: APIRequestContext, s: { id: string; ownerToken: string }, data: Record<string, unknown>) {
  for (let i = 0; i < 5; i++) {
    const res = await api.put(`/api/share/${s.id}`, {
      headers: { Authorization: `Bearer ${s.ownerToken}` },
      data: { updatedAt: Date.now(), ...data },
    });
    if (res.status() === 204) return;
    expect(res.status()).toBe(429);
    await new Promise((r) => setTimeout(r, 1000 * Number(res.headers()['retry-after'] ?? 1)));
  }
  throw new Error('PUT kept being rate limited');
}

const viewer = (page: Page) => page.getByTestId('viewer');
const ctx = (b: Browser) => b.newContext({ baseURL: test.info().project.use.baseURL, timezoneId: 'Asia/Singapore', locale: 'zh-CN' });

test('senior shares → family sees waiting, travelling, help, arrived, ended', async ({ browser }) => {
  const senior = await ctx(browser);
  const family = await ctx(browser);
  const s = await createShare(senior.request);
  expect(s.viewPath).toBe(`/t/${s.id}`);

  const page = await family.newPage();
  await hermetic(page);
  await page.goto(s.viewPath);
  await expect(viewer(page)).toHaveAttribute('data-state', 'waiting');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('妈妈还没出发');
  await expect(page.getByTestId('viewer-call')).toHaveAttribute('href', 'tel:+6591234567');

  const eta = new Date(Date.now() + 16 * 60_000).toISOString();
  await put(senior.request, s, { status: 'travelling', lat: 1.3346, lng: 103.8491, acc: 12, etaISO: eta, stepText: '在 139 号巴士上，还有 3 站', step: { k: 'bus', svc: '139', stops: 3 } });
  await expect(viewer(page)).toHaveAttribute('data-state', 'bus', { timeout: 5000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('妈妈正在去 陈笃生医院');
  await expect(page.getByTestId('viewer-pill')).toHaveText('在 139 号巴士上，还有 3 站');
  await expect(page.getByText(/还有 1[56] 分钟/)).toBeVisible();
  await expect(page.getByTestId('viewer-updated')).toHaveText('刚刚更新');
  await expect(page).toHaveTitle('妈妈正在去 陈笃生医院 · 怎么去?');
  await expect(page.locator('#maparea')).toBeVisible();
  // Real MapLibre map (lazy) with the OneMap attribution visible; no destination marker exists (OQ4).
  await expect(page.locator('#mapcanvas canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#attrib')).toContainText('OneMap');

  await put(senior.request, s, { status: 'help', lat: 1.3346, lng: 103.8491, acc: 12 });
  await expect(viewer(page)).toHaveAttribute('data-state', 'help', { timeout: 2000 });
  await expect(page.getByTestId('viewer-help')).toContainText('妈妈按了“帮忙”');
  await expect(page.getByTestId('viewer-help').getByTestId('viewer-call')).toBeVisible();
  await expect(page.locator('#live2')).toHaveText('妈妈按了帮忙。妈妈可能需要你。');
  await expect(page).toHaveTitle('妈妈按了帮忙 · 怎么去?');

  await put(senior.request, s, { status: 'arrived', lat: 1.3214, lng: 103.8458, acc: 10, etaISO: null });
  await expect(viewer(page)).toHaveAttribute('data-state', 'arrived', { timeout: 5000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('妈妈已经到了 陈笃生医院');
  await expect(page).toHaveTitle('妈妈到了 · 怎么去?');

  // A second family member opens the link at the same time (AC 25).
  const page2 = await (await ctx(browser)).newPage();
  await hermetic(page2);
  await page2.goto(s.viewPath);
  await expect(viewer(page2)).toHaveAttribute('data-state', 'arrived');

  const del = await senior.request.delete(`/api/share/${s.id}`, { headers: { Authorization: `Bearer ${s.ownerToken}` } });
  expect(del.status()).toBe(204);
  await expect(viewer(page)).toHaveAttribute('data-state', 'endedArrived', { timeout: 5000 });
  await expect(page.locator('#maparea')).toBeHidden();

  // Opening the link after the end: 410 share_ended → ended (no name, no map, no call).
  const late = await (await ctx(browser)).newPage();
  await late.goto(s.viewPath);
  // Same IP as the other viewers: the 1-per-5-s GET limit may answer 429 first (Retry-After honoured).
  await expect(viewer(late)).toHaveAttribute('data-state', 'ended', { timeout: 10_000 });
  await expect(late.getByTestId('viewer-call')).toHaveCount(0);
});

test('sender stops sharing while travelling → ended, call button kept', async ({ browser }) => {
  const senior = await ctx(browser);
  const s = await createShare(senior.request, { senderName: 'Mum', lang: 'en', destName: 'Tan Tock Seng Hospital' });
  const page = await (await ctx(browser)).newPage();
  await hermetic(page);
  await put(senior.request, s, { status: 'travelling', lat: 1.3346, lng: 103.8491, acc: 12, stepText: 'Walking to the Blk 79 bus stop' });
  await page.goto(s.viewPath);
  await expect(viewer(page)).toHaveAttribute('data-state', 'walk');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-SG');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mum is on the way to Tan Tock Seng Hospital');
  await senior.request.delete(`/api/share/${s.id}`, { headers: { Authorization: `Bearer ${s.ownerToken}` } });
  await expect(viewer(page)).toHaveAttribute('data-state', 'ended', { timeout: 5000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mum stopped sharing');
  await expect(page.getByTestId('viewer-call')).toHaveAttribute('href', 'tel:+6591234567');
});

test(`expiry via the test TTL (${TEST_TTL_S} s) → expired; a later visitor sees expired or not found`, async ({ browser }) => {
  test.setTimeout((TEST_TTL_S + 40) * 1000);
  const senior = await ctx(browser);
  const s = await createShare(senior.request);
  const page = await (await ctx(browser)).newPage();
  await hermetic(page);
  await page.goto(s.viewPath);
  await expect(viewer(page)).toHaveAttribute('data-state', 'waiting');
  await expect(viewer(page)).toHaveAttribute('data-state', 'expired', { timeout: (TEST_TTL_S + 20) * 1000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('这个链接已经过期了');
  const late = await (await ctx(browser)).newPage();
  await late.goto(s.viewPath);
  await expect(viewer(late)).toHaveAttribute('data-state', /^(expired|invalid)$/);
});

test('unknown and malformed ids → "We can\'t find this link"', async ({ page }) => {
  await page.goto('/t/AAAAAAAAAAAA');
  await expect(viewer(page)).toHaveAttribute('data-state', 'invalid');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('找不到这个链接');
  await expect(page.getByTestId('viewer-call')).toHaveCount(0);
  await page.goto('/t/bad!id');
  await expect(viewer(page)).toHaveAttribute('data-state', 'invalid');
});

test('the page is noindex with generic link previews (AC 24)', async ({ request }) => {
  const html = await (await request.get('/t/AAAAAAAAAAAA')).text();
  expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
  expect(html).toContain('家人的行程 · 怎么去?');
  expect(html).not.toMatch(/妈妈|陈笃生|googletagmanager|analytics/);
});
