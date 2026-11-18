/**
 * QA M4 — share & safety, one test (or a few) per browser-testable AC, Chromium, release build.
 * Two drivers:
 *  - senior-side UI in `?demo=1` (mock API incl. a mock share store; window.open recorded) on the QA preview;
 *  - "live" two-browser tests against the real Worker under `wrangler dev --local --env test` (real
 *    Durable Objects, test-only TTL, M4 OQ6), which also serves the release build (D-10). Senior app runs
 *    `?demo=1&realshare=1` (fixture routes, shares + setup to the real Worker); family opens /t/:id.
 * Rate limits: the Worker allows 10 share creates / 5 setup creates per hour per IP — this file stays under.
 * Not here (Worker/shared vitest in gate step 3, or real phones — see qa/reports/0.3.0-m34.md): AC 9, 11, 31,
 * 41 (Worker half), 48 (DO storage), 49; WhatsApp/SMS/tel/Grab/QR camera on real phones.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { QA_SHARE_TTL_S, QA_WORKER_PORT } from '../playwright.config';
import { axe, boot, runUntil, startTo, stubs, type W } from './m2helpers';

test.use({ serviceWorkers: 'block' });

const WORKER = `http://127.0.0.1:${QA_WORKER_PORT}`;
const MEI = { name: '美玲', relation: 'daughter', phone: '+6591234567', callMe: '妈妈', lang: 'zh' };
const JUN = { name: '志明', relation: 'son', phone: '+6598765432', callMe: '妈妈', lang: 'zh' };
type X = W & { __opened: string[]; __shared: unknown[] };

/** Record window.open / navigator.share / clipboard before the app loads. */
async function capture(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as X;
    w.__opened = [];
    w.__shared = [];
    window.open = ((u: string) => (w.__opened.push(String(u)), null)) as typeof window.open;
    (navigator as unknown as { share: (d: unknown) => Promise<void> }).share = (d) => (w.__shared.push(d), Promise.resolve());
    (navigator as unknown as { canShare: () => boolean }).canShare = () => true;
  });
}
const opened = (page: Page) => page.evaluate(() => (window as unknown as X).__opened);
const logOf = (page: Page) => page.evaluate(() => [...((window as unknown as W).__howtogoLog ?? [])]);

/** Demo app with contacts / prefs on the QA preview (mock share store). */
async function senior(page: Page, o: { contacts?: unknown[]; prefs?: Record<string, unknown>; settings?: Record<string, unknown>; scn?: string } = {}) {
  await capture(page);
  if (o.contacts) await page.addInitScript((c) => localStorage.getItem('howtogo.family.v1') || localStorage.setItem('howtogo.family.v1', JSON.stringify(c)), o.contacts);
  if (o.prefs) await page.addInitScript((p) => localStorage.setItem('howtogo.prefs.m34', JSON.stringify(p)), o.prefs);
  await boot(page, o.settings ?? {}, null, { path: `/?demo=1&demoMs=100000${o.scn ? `&scn=${o.scn}` : ''}` });
}
const shareState = (page: Page) =>
  page.evaluate(() => {
    const id = (window as unknown as W).__howtogo.store.trip.value?.share?.id;
    return id ? JSON.parse(localStorage.getItem(`howtogo.mockshare.${id}`) ?? 'null') : null;
  });

// ---------------------------------------------------------------- live helpers (real Worker)
/**
 * Each live context gets its own documentation-range client IP (RFC 5737 TEST-NET-1) in CF-Connecting-IP, which
 * local workerd passes through, so the Worker's per-IP limits (10 share creates/h) apply per test, not per run.
 * On Cloudflare this header is set by the edge and cannot be spoofed; this only partitions the local test Worker.
 */
let ipSeq = 0;
const nextIp = () => `192.0.2.${(test.info().workerIndex * 40 + ++ipSeq) % 250 + 1}`;
const liveCtx = (b: Browser, extra: Parameters<Browser['newContext']>[0] = {}) =>
  b.newContext({ extraHTTPHeaders: { 'CF-Connecting-IP': nextIp() }, baseURL: WORKER, locale: 'zh-CN', timezoneId: 'Asia/Singapore', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', geolocation: { latitude: 1.33465, longitude: 103.8491 }, permissions: ['geolocation'], ...extra });
const quiet = (p: Page) => p.route(/onemap\.gov\.sg|fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 204 }));
async function liveSenior(b: Browser, contacts: unknown[] = [MEI], prefs?: Record<string, unknown>) {
  const ctx = await liveCtx(b);
  const page = await ctx.newPage();
  await quiet(page);
  await capture(page);
  await stubs(page);
  await page.addInitScript(
    ([c, p]) => {
      if (!localStorage.getItem('howtogo.settings')) localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: true, motion: 'on' }));
      if (!localStorage.getItem('howtogo.family.v1')) localStorage.setItem('howtogo.family.v1', JSON.stringify(c));
      if (p) localStorage.setItem('howtogo.prefs.m34', JSON.stringify(p));
    },
    [contacts, prefs ?? null] as const,
  );
  const puts: { status?: string }[] = [];
  const posts: Record<string, unknown>[] = [];
  page.on('request', (r) => {
    if (!/\/api\/share/.test(r.url())) return;
    try {
      if (r.method() === 'PUT') puts.push(JSON.parse(r.postData() ?? '{}'));
      if (r.method() === 'POST') posts.push(JSON.parse(r.postData() ?? '{}'));
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?demo=1&demoMs=100000&realshare=1');
  await page.waitForFunction(() => '__howtogo' in window);
  return { ctx, page, puts, posts };
}
const shareOf = (page: Page) => page.evaluate(() => (window as unknown as W).__howtogo.store.trip.value.share as { id: string; ownerToken: string });
async function family(b: Browser, path: string, extra: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await liveCtx(b, { geolocation: undefined, permissions: [], ...extra });
  const page = await ctx.newPage();
  await quiet(page);
  await page.goto(path);
  return { ctx, page, v: page.getByTestId('viewer') };
}
async function apiShare(ctx: BrowserContext, body: Record<string, unknown> = {}) {
  const r = await ctx.request.post('/api/share', { data: { destName: '陈笃生医院', lang: 'zh', senderName: '妈妈', ...body } });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()) as { id: string; ownerToken: string; viewPath: string };
}
async function apiPut(ctx: BrowserContext, s: { id: string; ownerToken: string }, data: Record<string, unknown>) {
  for (let i = 0; i < 6; i++) {
    const r = await ctx.request.put(`/api/share/${s.id}`, { headers: { Authorization: `Bearer ${s.ownerToken}` }, data: { updatedAt: Date.now(), ...data } });
    if (r.status() === 204) return;
    expect(r.status()).toBe(429);
    await new Promise((res) => setTimeout(res, 1000 * Number(r.headers()['retry-after'] ?? 1)));
  }
  throw new Error('PUT kept being rate limited');
}

// ================================================================ A. parity
test('AC 1: parity — Help on H1/H2/H3/H4/H5, Share on H4 and H5, pill while sharing', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  const help = () => page.locator('[data-testid=nav-help], [data-testid=bar-help], [data-testid=guide-help]').first();
  await expect(help(), 'H1').toBeVisible();
  await page.getByTestId('to-field').click();
  await expect(page.getByTestId('search-input')).toBeVisible();
  expect.soft(await help().isVisible(), 'H2 Search: Help button').toBe(true);
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  expect.soft(await help().isVisible(), 'H3: Help button').toBe(true);
  await page.getByTestId('route-option-0').click();
  expect.soft(await help().isVisible(), 'H4: Help button').toBe(true);
  await expect(page.getByTestId('share-before'), 'H4 share').toBeVisible();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide-help'), 'H5').toBeVisible();
  await expect(page.getByTestId('guide-share'), 'H5 share').toBeVisible();
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-copy').click();
  await expect(page.getByTestId('share-pill')).toBeVisible();
  await page.getByTestId('guide-help').click();
  await expect(page.getByTestId('sheet-help')).toBeVisible();
  await expect(page.getByTestId('help-driver')).toBeVisible();
});

// ================================================================ B. start sharing
test('AC 2: H7 "告诉谁？" lists saved contacts (name, relation), first pre-selected; "别的人" option', async ({ page }) => {
  await senior(page, { contacts: [MEI, JUN] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  await expect(page.getByTestId('share-contact-0')).toContainText('美玲');
  await expect(page.getByTestId('share-contact-0')).toContainText('女儿');
  await expect(page.getByTestId('share-contact-0')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('share-contact-1')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('share-someone')).toBeVisible();
});

test('AC 4: channels in order WhatsApp → SMS → More (Web Share) → Copy; each ≥ 56 px; Web Share payload has the /t/ link', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  const ids = await page.locator('[data-testid=sheet-share] [data-testid^=share-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  const order = ids.filter((x) => ['share-wa', 'share-sms', 'share-more', 'share-copy'].includes(x!));
  expect(order).toEqual(['share-wa', 'share-sms', 'share-more', 'share-copy']);
  for (const id of order) {
    const b = (await page.getByTestId(id!).boundingBox())!;
    expect(b.height, id!).toBeGreaterThanOrEqual(55.5);
  }
  await page.getByTestId('share-more').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as X).__shared.length)).toBe(1);
  const d = (await page.evaluate(() => (window as unknown as X).__shared[0])) as { title?: string; text?: string; url?: string };
  expect(d.url ?? d.text).toMatch(/\/t\/[A-Za-z0-9]{12}/);
});

test('AC 4: WhatsApp with no contact → https://wa.me/?text=… (contact case: AC 5)', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-someone').click();
  await page.getByTestId('share-wa').click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  expect((await opened(page))[0]).toMatch(/^https:\/\/wa\.me\/\?text=.+%2Ft%2F[A-Za-z0-9]{12}/);
});

test('AC 4: SMS → sms: hand-off', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-sms').click();
  await expect.poll(() => logOf(page)).toContain('ext:sms');
});

test('AC 4: Copy link → "链接复制好了" toast', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-copy').click();
  await expect(page.getByText('链接复制好了').first()).toBeVisible();
});

test('AC 5: message text — destination name + link, no address, no coordinates, no times', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-wa').click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  const msg = decodeURIComponent((await opened(page))[0]!.split('text=')[1]!);
  expect(msg).toContain('Tan Tock Seng Hospital');
  expect(msg).toMatch(/\/t\/[A-Za-z0-9]{12}/);
  expect(msg, 'no address').not.toMatch(/Jalan|308433/);
  expect(msg, 'no coordinates').not.toMatch(/\d\.\d{4}/);
  expect(msg, 'no times in the text').not.toMatch(/\d{1,2}:\d{2}/);
});

test('AC 6: toast on send + jade share pill; pill → sharing sheet (preview, stop)', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-wa').click();
  await expect(page.getByTestId('toast-share-sent')).toContainText('美玲');
  const pill = page.getByTestId('share-pill');
  await expect(pill).toHaveAttribute('data-state', 'sharing');
  await expect(pill).toContainText('美玲');
  await pill.click();
  await expect(page.getByText('正在分享给 美玲').first()).toBeVisible();
  await expect(page.getByTestId('share-preview')).toBeVisible();
  await expect(page.getByTestId('share-stop')).toBeVisible();
});

test('AC 7: Stop sharing → DELETE + toast; End trip also ends the share and its sheet says so', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-copy').click();
  await page.getByTestId('share-pill').click();
  await page.getByTestId('share-stop').click();
  await expect(page.getByTestId('toast-share-stopped')).toContainText('停止分享');
  await expect(page.getByTestId('share-pill')).toHaveCount(0);
  expect.soft(await page.evaluate(() => JSON.stringify(localStorage)), 'owner token deleted after Stop').not.toMatch(/ownerToken\\?"\s*:\s*\\?"[^"\\]{8,}/);
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-copy').click();
  await expect(page.getByTestId('share-pill')).toBeVisible();
  const id = (await page.evaluate(() => (window as unknown as W).__howtogo.store.trip.value.share.id)) as string;
  await page.getByTestId('guide-end').click();
  await expect(page.getByTestId('sheet-end-trip').or(page.locator('.sheet').last())).toContainText('分享也会停止');
  await page.getByTestId('end-trip-yes').click();
  await expect.poll(() => page.evaluate((i) => JSON.parse(localStorage.getItem(`howtogo.mockshare.${i}`) ?? '{}').status, id)).toBe('ended');
  // Polled: End clears the stored trip right after the share DELETE, so give it the usual 5 s.
  await expect
    .poll(() => page.evaluate(() => JSON.stringify(localStorage)), { message: 'owner token deleted when the trip ends' })
    .not.toMatch(/ownerToken\\?"\s*:\s*\\?"[^"\\]{8,}/);
});

test('AC 8: a share can be created on H4 before Start (approved deviation: it starts the trip, sheet opens on H5)', async ({ page }) => {
  // Creative M34 review "Share before Start (starts the trip): Approved", accepted by the Director (director-log
  // 2026-11-17, "Deviation rulings accepted as Creative ruled"). The family-side "not started yet" state before the
  // first fix is covered by the live test (AC 3/10/…/28: waiting state).
  await senior(page, { contacts: [MEI] });
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('share-before').click();
  await expect(page.getByTestId('sheet-share')).toBeVisible();
  await expect(page.getByTestId('guide'), 'trip started by the H4 share entry (ruling)').toHaveCount(1);
  await page.getByTestId('share-copy').click();
  await expect(page.getByTestId('share-pill')).toBeVisible();
});

// ================================================================ C/D. live two-browser share (real Worker)
test('AC 3/10/14/15/18/21/28: live share — app → Worker → family page (waiting/travelling, paused, help, arrived, ended)', async ({ browser }) => {
  test.setTimeout(120_000);
  const s = await liveSenior(browser, [MEI], { myPhone: '+6587654321', sendPhone: true });
  const p = s.page;
  await startTo(p, 'tan tock');
  await p.getByTestId('guide-share').click();
  await p.getByTestId('share-wa').click();
  await expect(p.getByTestId('share-pill')).toHaveAttribute('data-state', 'sharing');
  // AC 3: POST carries destName, lang, senderName (what Mei Ling calls her) and the allowed phone; link = /t/<id>.
  expect(s.posts[0]).toMatchObject({ destName: 'Tan Tock Seng Hospital', lang: 'zh', senderName: '妈妈', senderPhone: '+6587654321' });
  const sh = await shareOf(p);
  expect(sh.id).toMatch(/^[A-Za-z0-9]{12}$/);
  expect(decodeURIComponent((await opened(p))[0]!)).toContain(`/t/${sh.id}`);
  expect(await p.evaluate(() => Object.values(localStorage).join('|'))).toContain(sh.ownerToken);

  const f = await family(browser, `/t/${sh.id}`);
  await expect(f.v).toHaveAttribute('data-state', /^(walk|wait|bus|train|waiting)$/, { timeout: 5000 });
  await runUntil(p, 'step:1', 400);
  await expect(f.v).toHaveAttribute('data-state', /^(walk|wait|bus|train)$/, { timeout: 8000 });
  await expect(f.page.getByRole('heading', { level: 1 })).toHaveText('妈妈正在去 Tan Tock Seng Hospital');
  await expect(f.page.getByTestId('viewer-call')).toHaveAttribute('href', 'tel:+6587654321');
  await expect(f.page.getByTestId('viewer-updated')).toContainText(/更新/);
  await expect(f.page.getByText(/约 .*到达/)).toBeVisible();

  // AC 14: hidden → paused (family: no-signal/paused state); visible → travelling again.
  await p.evaluate(() => (window as unknown as W).__setVis('hidden'));
  await expect(f.v).toHaveAttribute('data-state', 'nosignal', { timeout: 8000 });
  await p.evaluate(() => (window as unknown as W).__setVis('visible'));
  await expect(f.v).toHaveAttribute('data-state', /^(walk|wait|bus|train)$/, { timeout: 10_000 });

  // AC 21 help (≤ 2 s on the family page) + "I'm OK".
  await p.getByTestId('guide-help').click();
  await p.getByTestId('help-call').click();
  await expect(f.v).toHaveAttribute('data-state', 'help', { timeout: 2500 });
  await expect(f.page.getByTestId('viewer-help')).toContainText('妈妈按了');
  await expect(f.page).toHaveTitle(/帮忙/);
  await p.getByTestId('help-ok').click();
  await expect(f.v).toHaveAttribute('data-state', /helpcleared|walk|wait|bus|train/, { timeout: 8000 });

  // AC 15: arrival → arrived + title (AC 28); H12 says Mei Ling's page shows it.
  await runUntil(p, 'trip:arrived', 4000);
  await expect(p.getByTestId('arrived-shared')).toContainText('美玲');
  await expect(f.v).toHaveAttribute('data-state', 'arrived', { timeout: 8000 });
  await expect(f.page).toHaveTitle(/到了/);

  // AC 10: every PUT status is in the Worker enum; off-route never exposed.
  expect(s.puts.length).toBeGreaterThan(0);
  for (const b of s.puts) expect(['travelling', 'arrived', 'paused', 'help']).toContain(b.status);

  // Ended by the sender → family sees ended, no marker; GET has no coordinates (AC 48 in-browser half).
  const del = await s.ctx.request.delete(`/api/share/${sh.id}`, { headers: { Authorization: `Bearer ${sh.ownerToken}` } });
  expect([204, 410]).toContain(del.status());
  await expect(f.v).toHaveAttribute('data-state', /ended/, { timeout: 8000 });
  await expect(f.page.locator('#maparea')).toBeHidden();
  const g = await f.ctx.request.get(`/api/share/${sh.id}`);
  expect(await g.text()).not.toMatch(/"lat"\s*:\s*\d|"lng"\s*:\s*\d/);
  await s.ctx.close();
  await f.ctx.close();
});

test('AC 12/16: reload resumes the live share; share ended elsewhere → pill gone + "分享已经结束" once', async ({ browser }) => {
  test.setTimeout(90_000);
  const s = await liveSenior(browser);
  const p = s.page;
  await startTo(p, 'tan tock');
  await p.getByTestId('guide-share').click();
  await p.getByTestId('share-copy').click();
  await expect(p.getByTestId('share-pill')).toBeVisible();
  const sh = await shareOf(p);
  await p.reload();
  await p.waitForFunction(() => '__howtogo' in window);
  await expect(p.getByTestId('share-pill'), 'AC 16 resume').toBeVisible();
  expect((await shareOf(p)).id).toBe(sh.id);
  await s.ctx.request.delete(`/api/share/${sh.id}`, { headers: { Authorization: `Bearer ${sh.ownerToken}` } });
  await new Promise((r) => setTimeout(r, 3200));
  await runUntil(p, 'step:1', 400);
  await expect(p.getByTestId('share-pill')).toHaveCount(0, { timeout: 20_000 });
  await expect(p.getByText('分享已经结束')).toHaveCount(1);
  await s.ctx.close();
});

test('AC 17/23/24: /t/:id is a separate light entry — noindex, no-referrer, CSP, generic OG, no SW, no cookies, no third parties', async ({ browser }) => {
  const ctx = await liveCtx(browser);
  const s = await apiShare(ctx, { destName: 'Secret Clinic 123', senderName: 'Ah Ma' });
  const r = await ctx.request.get(s.viewPath);
  const hd = r.headers();
  const html = await r.text();
  expect(hd['x-robots-tag']).toMatch(/noindex/);
  expect(hd['referrer-policy']).toBe('no-referrer');
  expect(hd['content-security-policy'] ?? '').toMatch(/default-src 'self'|script-src 'self'/);
  expect(hd['set-cookie']).toBeUndefined();
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  expect(html).toMatch(/og:title/);
  expect(html).not.toMatch(/Secret Clinic|Ah Ma/);
  const page = await ctx.newPage();
  const hosts = new Set<string>();
  page.on('request', (q) => hosts.add(new URL(q.url()).host));
  await quiet(page);
  await page.goto(s.viewPath);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-state', 'waiting');
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'howtogo.viewer.lang'))).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe('');
  expect(await page.locator('[data-testid=nav-help], [data-testid=to-field]').count(), 'no app chrome').toBe(0);
  expect([...hosts].filter((h) => !/^127\.0\.0\.1|onemap\.gov\.sg$/.test(h))).toEqual([]);
  await ctx.close();
});

test('AC 20: WebSocket blocked → GET polling (15 s) still updates the family page', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await liveCtx(browser);
  const s = await apiShare(ctx);
  const f = await liveCtx(browser, { geolocation: undefined, permissions: [] });
  const page = await f.newPage();
  await quiet(page);
  await page.routeWebSocket(/\/live/, (ws) => ws.close());
  await page.goto(s.viewPath);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-state', 'waiting');
  await apiPut(ctx, s, { status: 'travelling', lat: 1.3346, lng: 103.8491, acc: 12, stepText: '在 139 号巴士上', step: { k: 'bus', svc: '139', stops: 3 } });
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-state', 'bus', { timeout: 25_000 });
  await ctx.close();
  await f.close();
});

test('AC 21 signal lost → "最后位置：N 分钟前" + not found; AC 13 help bypasses the 3 s limit, ≤ 1 help write/s', async ({ browser }) => {
  const ctx = await liveCtx(browser);
  const s = await apiShare(ctx);
  await apiPut(ctx, s, { status: 'travelling', lat: 1.3346, lng: 103.8491, acc: 12, stepText: '走路去车站', step: { k: 'walk' } });
  const f = await liveCtx(browser, { geolocation: undefined, permissions: [] });
  const page = await f.newPage();
  await quiet(page);
  await page.clock.install();
  await page.goto(s.viewPath);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-state', 'walk');
  await page.clock.fastForward(3.5 * 60_000);
  await page.clock.runFor(16_000);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-state', 'nosignal');
  await expect(page.getByText(/最后位置：.*分钟前/)).toBeVisible();
  const nf = await f.newPage();
  await quiet(nf);
  await nf.goto('/t/AAAAAAAAAAAA');
  await expect(nf.getByTestId('viewer')).toHaveAttribute('data-state', 'invalid');
  await expect(nf.getByRole('heading', { level: 1 })).toHaveText(/找不到/);
  // AC 13 (D-7) on the same share (saves a create: 10 per hour per IP).
  await new Promise((r) => setTimeout(r, 3100));
  const h = { Authorization: `Bearer ${s.ownerToken}` };
  const put = (d: Record<string, unknown>) => ctx.request.put(`/api/share/${s.id}`, { headers: h, data: { updatedAt: Date.now(), ...d } }).then((r) => r.status());
  // Each limit is asserted only if the requests really landed inside its window (host load can stretch them).
  let t = Date.now();
  expect(await put({ status: 'travelling', lat: 1.3346, lng: 103.8491, acc: 10 })).toBe(204);
  const r2 = await put({ status: 'travelling', lat: 1.3346, lng: 103.8491, acc: 10 });
  if (Date.now() - t < 2500) expect(r2, '3 s write limit').toBe(429);
  t = Date.now();
  expect(await put({ status: 'help' }), 'help bypasses the 3 s limit').toBe(204);
  const r4 = await put({ status: 'help' });
  if (Date.now() - t < 800) expect(r4, 'max 1 help write per second').toBe(429);
  await ctx.close();
  await f.close();
});

test(`AC 21: expiry (test TTL ${QA_SHARE_TTL_S} s) → "这个链接已经过期了", no marker; later visitor → expired / not found`, async ({ browser }) => {
  test.setTimeout((QA_SHARE_TTL_S + 45) * 1000);
  const ctx = await liveCtx(browser);
  const s = await apiShare(ctx);
  await apiPut(ctx, s, { status: 'travelling', lat: 1.3346, lng: 103.8491, acc: 12 });
  const f = await family(browser, s.viewPath);
  await expect(f.v).toHaveAttribute('data-state', /walk|wait|bus|train/);
  await expect(f.v).toHaveAttribute('data-state', 'expired', { timeout: (QA_SHARE_TTL_S + 20) * 1000 });
  await expect(f.page.getByRole('heading', { level: 1 })).toHaveText('这个链接已经过期了');
  await expect(f.page.locator('#maparea')).toBeHidden();
  const late = await f.ctx.newPage();
  await late.goto(s.viewPath);
  await expect(late.getByTestId('viewer')).toHaveAttribute('data-state', /^(expired|invalid)$/, { timeout: 10_000 });
  await ctx.close();
  await f.ctx.close();
});

test('AC 25: 51st viewer of one link sees "看的人太多了，请稍后再试"', async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await liveCtx(browser);
  const s = await apiShare(ctx);
  const sockets: WebSocket[] = [];
  for (let i = 0; i < 50; i++) sockets.push(new WebSocket(`ws://127.0.0.1:${QA_WORKER_PORT}/api/share/${s.id}/live`));
  await new Promise((r) => setTimeout(r, 2500));
  const open = sockets.filter((w) => w.readyState === 1).length;
  expect(open, 'Worker accepted 50 viewers').toBe(50);
  const f = await family(browser, s.viewPath);
  await expect(f.page.getByText('看的人太多了')).toBeVisible({ timeout: 10_000 });
  sockets.forEach((w) => w.close());
  await ctx.close();
  await f.ctx.close();
});

for (const [ac, re, why] of [
  ['AC 26 (Should): viewer offers "在地图上打开 / Open in Maps"', /在地图上打开|Open in Maps/, ''],
  ['AC 30: viewer offers "到了通知我 / Notify me" (DEFERRED: dropped from M4, Creative M34 review)', /到了通知我|Notify me/, 'deferred'],
] as const) {
  test(ac, async ({ browser }) => {
    // AC 30 notify-me was dropped from M4 with Web Push (Creative M34 review, Director-accepted) → known, flags when built.
    test.fail(why === 'deferred', 'DEFERRED to M5');
    const ctx = await liveCtx(browser);
    const s = await apiShare(ctx);
    await apiPut(ctx, s, { status: 'travelling', lat: 1.3346, lng: 103.8491, acc: 12 });
    const f = await family(browser, s.viewPath);
    await expect(f.v).toHaveAttribute('data-state', /walk|wait|bus|train/);
    expect(await f.page.getByText(re).count(), ac).toBeGreaterThan(0);
    await ctx.close();
    await f.ctx.close();
  });
}

test('AC 51: share inputs render as text only; over-long destName refused server-side', async ({ browser }) => {
  const ctx = await liveCtx(browser);
  const evil = '<img src=x onerror="window.__pwn=1">';
  const s = await apiShare(ctx, { destName: evil, senderName: '<b>妈</b>' });
  const f = await family(browser, s.viewPath);
  await apiPut(ctx, s, { status: 'travelling', lat: 1.3346, lng: 103.8491, acc: 12, stepText: '<script>window.__pwn=2</script>' });
  await expect(f.v).toHaveAttribute('data-state', /walk|wait|bus|train/, { timeout: 8000 });
  await expect(f.page.getByRole('heading', { level: 1 })).toContainText('<img');
  expect(await f.page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined();
  expect(await f.page.locator('h1 img, h1 b').count()).toBe(0);
  const long = await ctx.request.post('/api/share', { data: { destName: 'x'.repeat(121), lang: 'zh' } });
  expect(long.status()).toBe(400);
  await ctx.close();
  await f.ctx.close();
});

// ================================================================ E. arrival (senior side)
test('AC 29: no live share → H12 "告诉美玲我到了" opens WhatsApp to the first contact with "我到 … 了"', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await runUntil(page, 'trip:arrived');
  await page.getByTestId('arrived-tell').click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  const u = (await opened(page))[0]!;
  expect(u).toMatch(/^https:\/\/wa\.me\/6591234567\?text=/);
  expect(decodeURIComponent(u)).toMatch(/我到.*Tan Tock Seng Hospital/);
});

// ================================================================ F. Help
// Amended by Developer C 2026-11-18 per Director ruling (QA-37): AC 32 follows Creative §6e.3 — the share row
// sits before 995 and there is no taxi row in Help (taxi lives in H10, §6e.6). QA to confirm.
test('AC 32: Help order (§6e.3) — call first contact → others → show the driver → where am I → find my way → let family see me → 995 last', async ({ page }) => {
  await senior(page, { contacts: [MEI, JUN] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-help').click();
  const ids = await page.locator('[data-testid=sheet-help] [data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).filter((x) => /^help-|^taxi$/.test(x!)));
  const want = ['help-call', 'help-call-other', 'help-driver', 'help-where', 'help-reroute', 'help-share-loc', 'help-995'];
  const got = ids.filter((x) => want.includes(x!) || /^help-/.test(x!));
  expect(got[0]).toBe('help-call');
  expect(got[got.length - 1]).toBe('help-995');
  expect(got, 'AC 32 full order (§6e.3) incl. "让家人看到我在哪里" before 995, no taxi row').toEqual(want);
});

test('AC 33: call family is one tap tel:+65…; with no contacts "还没有家人电话 · 添加" → editor', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await page.getByTestId('nav-help').click();
  await page.getByTestId('help-call').click();
  await expect.poll(() => logOf(page)).toContain('ext:tel');
  await expect(page.locator('[data-testid^=confirm], [data-testid=sheet-confirm]')).toHaveCount(0);
  const p2 = await page.context().newPage();
  await capture(p2);
  await boot(p2);
  await p2.evaluate(() => localStorage.removeItem('howtogo.family.v1'));
  await p2.reload();
  await p2.getByTestId('nav-help').click();
  await expect(p2.getByTestId('help-add')).toContainText(/家人/);
  await p2.getByTestId('help-add').click();
  await expect(p2.getByTestId('contact-name')).toBeVisible();
});

test('AC 34: 995 is tel:995, last, outlined (not a big red fill), says what it is for, works offline', async ({ page, context }) => {
  await senior(page, { contacts: [MEI] });
  await context.setOffline(true);
  await page.getByTestId('nav-help').click();
  const b = page.getByTestId('help-995');
  await expect(b).toHaveClass(/outline/);
  await b.click();
  // Director ruling (dev-log 2026-11-17): the 995 confirm sheet is kept; the dialer is the second confirm.
  await expect(page.getByTestId('call-995')).toHaveAttribute('href', 'tel:995');
  await expect(page.getByText(/救护车/).first()).toBeVisible();
  await context.setOffline(false);
});

test('AC 35: "让家人看到我在哪里" — sets help on a live share, or creates a help-only share and opens WhatsApp', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await page.getByTestId('nav-help').click();
  await expect(page.getByText(/让家人看到我在哪里|Let family see where I am/)).toBeVisible({ timeout: 3000 });
});

test('AC 36: 我在哪里 — reverse-geocoded address huge + postal; offline → coordinates + "给别人看这个号码"', async ({ page, context }) => {
  await senior(page, { contacts: [MEI] });
  await page.getByTestId('nav-help').click();
  await page.getByTestId('help-where').click();
  await expect(page.getByTestId('driver-card')).toContainText('Toa Payoh Central');
  await expect(page.getByTestId('driver-card')).toContainText('310177');
  await expect(page.getByTestId('driver-card')).toContainText(/I am here/);
  const p2 = await context.newPage();
  await capture(p2);
  await boot(p2);
  await context.setOffline(true);
  await p2.getByTestId('nav-help').click();
  await p2.getByTestId('help-where').click();
  await expect(p2.getByTestId('here-coords')).toContainText(/1\.\d{3,}, 103\.\d{3,}/);
  await expect(p2.getByTestId('here-coords')).toContainText('给别人看这个号码');
  await context.setOffline(false);
});

test('AC 37: 给司机看地址 — tabs Where I\'m going · My home · Where I am; "Please take me to / 请送我去", name + address + postal; wake lock', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await page.evaluate(() => localStorage.setItem('howtogo.places', JSON.stringify({ home: { name: 'Toa Payoh Central', address: 'Toa Payoh Central Singapore 310177', lat: 1.3328, lng: 103.8475 }, others: [] })));
  await page.reload();
  await page.waitForFunction(() => '__howtogo' in window);
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-help').click();
  await page.getByTestId('help-driver').click();
  for (const t of ['dest', 'home', 'here']) await expect(page.getByTestId(`driver-tab-${t}`)).toBeVisible();
  const card = page.getByTestId('driver-card');
  await expect(card).toContainText('Please take me to');
  await expect(card).toContainText('请送我去');
  await expect(card).toContainText('Tan Tock Seng Hospital');
  await expect(card.locator('.postal')).toContainText('308433');
  await page.getByTestId('driver-tab-home').click();
  await expect(card).toContainText('Toa Payoh Central');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__wl.req)).toBeGreaterThan(0);
});

test('AC 38: offline Help — call family, 995, show the driver work; network rows say "需要网络"', async ({ page, context }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await context.setOffline(true);
  await page.getByTestId('guide-help').click();
  await expect(page.getByTestId('help-call')).toBeEnabled();
  await expect(page.getByTestId('help-995')).toBeEnabled();
  await expect(page.getByTestId('help-reroute')).toContainText('需要网络');
  await page.getByTestId('help-driver').click();
  await expect(page.getByTestId('driver-card')).toContainText('Tan Tock Seng Hospital');
  await context.setOffline(false);
});

// ================================================================ G. contacts / places
// Amended by Developer C 2026-11-18 per Director ruling (QA-40): up to 5 family members, not 3. QA to confirm.
test('AC 39: Family contacts — validation (SG 8 digits → +65), max 5, first = Help/share default; My places editor exists', async ({ page }) => {
  await senior(page);
  await page.goto('/settings');
  await page.getByTestId('row-family').click();
  const add = async (name: string, phone: string) => {
    await page.getByTestId('contact-add').click();
    await page.getByTestId('contact-name').fill(name);
    await page.getByTestId('contact-phone').fill(phone);
    await page.getByTestId('contact-save').click();
  };
  await page.getByTestId('contact-add').click();
  await page.getByTestId('contact-name').fill('美玲');
  await page.getByTestId('contact-phone').fill('1234');
  await page.getByTestId('contact-save').click();
  await expect(page.locator('.fnote').first()).toBeVisible();
  await page.getByTestId('contact-phone').fill('9123 4567');
  await page.getByTestId('contact-save').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.family.v1')!)[0].phone)).toBe('+6591234567');
  await add('志明', '98765432');
  await add('阿华', '81234567');
  expect.soft(await page.getByTestId('contact-add').count(), 'a 4th contact is allowed (max 5)').toBe(1);
  await add('小英', '82345678');
  await add('阿明', '83456789');
  expect.soft(await page.getByTestId('contact-add').count(), 'no 6th contact (max 5)').toBe(0);
  await page.goto('/settings');
  expect.soft(await page.getByText(/常去的地方/).count(), 'Settings → My places (≤ 6, add/rename/remove/↑↓)').toBeGreaterThan(0);
});

// ================================================================ H. caregiver setup (real Worker)
test('AC 40/41/43/44: /setup on the family phone → encrypted one-time box → senior previews, saves, undo; reuse → "用过了"; key never sent', async ({ browser }) => {
  test.setTimeout(90_000);
  const fam = await liveCtx(browser, { geolocation: undefined, permissions: [] });
  const fp = await fam.newPage();
  await quiet(fp);
  const sent: string[] = [];
  fp.on('request', (r) => sent.push(r.url() + ' ' + (r.postData() ?? '')));
  await fp.goto('/setup?demo=1&realshare=1');
  await fp.getByTestId('w-name').fill('林阿姨');
  await fp.getByTestId('w-home').fill('toa payoh');
  await fp.getByTestId('w-home-r0').click();
  await fp.getByTestId('contact-name').fill('美玲');
  await fp.getByTestId('contact-phone').fill('91234567');
  await fp.getByTestId('w-contact-add').click();
  await fp.getByTestId('w-you').fill('美玲');
  await fp.getByTestId('w-send').click();
  const link = await fp.getByTestId('setup-link').inputValue();
  expect(link).toMatch(/\/s\/[A-Za-z0-9]{12}#k=[A-Za-z0-9_-]{43}$/);
  const key = link.split('#k=')[1]!;
  expect(sent.some((x) => x.includes(key) || x.includes('#k=')), 'key never leaves the family browser').toBe(false);
  const post = sent.find((x) => /\/api\/setup /.test(x)) ?? sent.find((x) => /\/api\/setup/.test(x)) ?? '';
  expect(post).not.toContain('林阿姨');

  const s = await liveSenior(browser, [{ name: '旧', relation: 'son', phone: '+6590000000' }]);
  const path = link.replace(/^https?:\/\/[^/]+/, '');
  await s.page.goto(path);
  await expect(s.page.getByTestId('setup-review')).toBeVisible();
  await expect(s.page.getByTestId('setup-replace-contacts'), 'replaced items flagged').toBeVisible();
  expect(await s.page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.family.v1')!)[0].name), 'nothing written before Save').toBe('旧');
  await s.page.getByTestId('setup-yes').click();
  await expect(s.page.getByTestId('setup-undo')).toBeVisible();
  expect(await s.page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.family.v1')!)[0].name)).toBe('美玲');
  await s.page.getByTestId('setup-undo').click();
  await expect.poll(() => s.page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.family.v1')!)[0].name)).toBe('旧');
  await s.page.goto(path);
  await expect(s.page.getByTestId('setup-error')).toHaveAttribute('data-msg', 'su_used');
  await s.page.goto(path.replace(/#k=.*/, '#k=' + 'B'.repeat(43)));
  await expect(s.page.getByTestId('setup-error')).toHaveAttribute('data-msg', /su_used|su_broken/);
  await s.ctx.close();
  await fam.close();
});

test('AC 42: delivery — senior side "用家人的设置" with Paste link; family side gets the link', async ({ page }) => {
  await senior(page);
  await page.goto('/settings');
  await page.getByTestId('row-setup').click();
  await expect(page.getByTestId('setup-paste')).toBeVisible();
  const fp = await page.context().newPage();
  await fp.goto('/setup?mock=1');
  await fp.getByTestId('w-name').fill('林阿姨');
  await fp.getByTestId('w-you').fill('美玲');
  await fp.getByTestId('w-send').click();
  await expect(fp.getByTestId('setup-link')).toBeVisible();
});

test('AC 42: QR code on the family phone (DEFERRED to M5: Creative M34 review, Director decides the dependency)', async ({ page }) => {
  test.fail(true, 'DEFERRED to M5');
  const fp = page;
  await fp.goto('/setup?mock=1');
  await fp.getByTestId('w-name').fill('林阿姨');
  await fp.getByTestId('w-you').fill('美玲');
  await fp.getByTestId('w-send').click();
  await expect(fp.getByTestId('setup-link')).toBeVisible();
  await expect(fp.locator('canvas, svg[aria-label*=QR], img[alt*=QR], [data-testid*=qr]').first(), 'QR code on the family phone').toBeVisible({ timeout: 3000 });
});

test('AC 44/47: setup create rate-limited → "请稍后再试"-style message with one next action', async ({ page }) => {
  await page.goto('/setup?mock=1&scn=setup:rate_limited');
  await page.getByTestId('w-name').fill('林阿姨');
  await page.getByTestId('w-you').fill('美玲');
  await page.getByTestId('w-send').click();
  await expect(page.getByText(/稍后再试|等一下|一分钟/).first()).toBeVisible();
});

// ================================================================ I. taxi
test('AC 46: Get a taxi — address card first, Grab, CDG Zig (official links); no booking in-app', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-help').click();
  await page.getByTestId('help-driver').click();
  const card = await page.getByTestId('driver-card').boundingBox();
  const grab = await page.getByTestId('taxi-grab').boundingBox();
  expect(card!.y).toBeLessThan(grab!.y);
  await page.getByTestId('taxi-cdg').click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  expect(new URL((await opened(page))[0]!).host).toMatch(/cdgtaxi\.com\.sg$/);
  await page.getByTestId('taxi-grab').click();
  await expect.poll(() => logOf(page)).toContain('taxi:grab');
});

// ================================================================ J. privacy
test('AC 50: Settings "清除所有资料" (with confirm) removes contacts, places, prefs; privacy page describes sharing', async ({ page }) => {
  await senior(page);
  await page.evaluate((c) => {
    localStorage.setItem('howtogo.family.v1', JSON.stringify([c]));
    localStorage.setItem('howtogo.prefs.m34', JSON.stringify({ myPhone: '+6598765432' }));
    localStorage.setItem('howtogo.places', JSON.stringify({ home: { name: 'Toa Payoh Central', lat: 1.3328, lng: 103.8475 }, others: [] }));
  }, MEI);
  await page.goto('/settings');
  await page.getByTestId('row-delete-all').click();
  await page.getByTestId('delete-all-go').click();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => /family|prefs|places|recents|share/.test(k) && localStorage.getItem(k) !== '[]' && localStorage.getItem(k) !== 'null'))).toEqual([]);
  await page.goto('/about');
  await expect(page.getByTestId('privacy')).toContainText(/分享|链接/);
});

test('AC 52 (Should): H7 lock line — anyone with the link can see it; stops by itself', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  await expect(page.getByTestId('sheet-share')).toContainText(/自己停止/);
});

// ================================================================ axe
test('M4 axe: H7 share, H7 sharing, H9 Help, H10 driver, /setup, setup review — WCAG 2.1 AA', async ({ page }) => {
  await senior(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  await axe(page, 'H7 choose');
  await page.getByTestId('share-copy').click();
  await page.getByTestId('share-pill').click();
  await axe(page, 'H7 sharing');
  await page.goBack();
  await page.getByTestId('guide-help').click();
  await axe(page, 'H9');
  await page.getByTestId('help-driver').click();
  await axe(page, 'H10');
  const w = await (await page.context().browser()!.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  await w.goto('/setup?mock=1');
  await expect(w.getByTestId('w-name')).toBeVisible();
  await axe(w, '/setup');
});

test('AC 22 language default + toggle; M4 axe: family page H8 states (waiting, travelling, help, arrived, ended)', async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await liveCtx(browser);
  const s = await apiShare(ctx, { senderPhone: '+6591234567', lang: 'en', senderName: 'Mum', destName: 'Tan Tock Seng Hospital' });
  const f = await family(browser, s.viewPath);
  await expect(f.v).toHaveAttribute('data-state', 'waiting');
  await expect(f.page.locator('html'), 'AC 22: share lang by default').toHaveAttribute('lang', /^en/);
  await expect(f.page.getByRole('heading', { level: 1 })).toContainText('Mum');
  await axe(f.page, 'H8 waiting en');
  await f.page.getByTestId('viewer-lang').click();
  await expect(f.page.locator('html'), 'AC 22: toggle').toHaveAttribute('lang', /^zh/);
  await expect(f.page.getByRole('heading', { level: 1 })).toContainText('还没出发');
  await axe(f.page, 'H8 waiting zh');
  await apiPut(ctx, s, { status: 'travelling', lat: 1.3346, lng: 103.8491, acc: 12, stepText: '在 139 号巴士上', step: { k: 'bus', svc: '139', stops: 3 } });
  await expect(f.v).toHaveAttribute('data-state', 'bus', { timeout: 8000 });
  await axe(f.page, 'H8 travelling');
  await apiPut(ctx, s, { status: 'help' });
  await expect(f.v).toHaveAttribute('data-state', 'help', { timeout: 5000 });
  await axe(f.page, 'H8 help');
  await apiPut(ctx, s, { status: 'arrived', lat: 1.3214, lng: 103.8458, acc: 10, etaISO: null });
  await expect(f.v).toHaveAttribute('data-state', 'arrived', { timeout: 8000 });
  await axe(f.page, 'H8 arrived');
  await ctx.request.delete(`/api/share/${s.id}`, { headers: { Authorization: `Bearer ${s.ownerToken}` } });
  await expect(f.v).toHaveAttribute('data-state', /ended/, { timeout: 8000 });
  await axe(f.page, 'H8 ended');
  await ctx.close();
  await f.ctx.close();
});
