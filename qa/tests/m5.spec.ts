/**
 * QA M5 — 1.0 hardening, one test per browser-testable M5 AC (docs/requirements/M5-hardening-launch.md), Chromium,
 * release build (qa/.out/dist on the QA preview :4184, and the real Worker under `wrangler dev --local --env test`
 * on 127.0.0.1:18797 serving the same build — nothing is sent to Cloudflare).
 * Director rulings applied: static assets default (AC 30), privacy ≤ 400 words (en; zh ≤ 600 Han characters),
 * /api/health lta key|proxy|none, /t/* excluded from SEO, no licences link (AC 24), 主屏幕 (AC 26), the 85 % text
 * option (owner request 2026-11-18), the Help sheet stays in the entry chunk, smoke:live deferred until the owner's
 * secrets.
 * Not here: AC 1/2 (gate `lighthouse`), AC 3 (gate `build`), AC 7/9 replay harness (shared vitest, gate `unit`:
 * battery.test.ts "AC 9 …"), AC 34 redirect (worker vitest pages), real phones / screen readers / field test
 * (DEFERRED, see qa/reports/1.0.0-rc1-m5.md).
 * Test data only: example.com / howtogo.local, RFC 5737 IPs, fixture places.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { QA_WORKER_PORT } from '../playwright.config';
import { axe as axeList, FIXED, layoutProblems, liveApi, setup, toRoutes } from './helpers';
import { boot, logOf, runUntil, spoken, startTo, stubs, type W } from './m2helpers';

const ROOT = join(__dirname, '..', '..');
const DIST = join(__dirname, '..', '.out', 'dist');
const WORKER = `http://127.0.0.1:${QA_WORKER_PORT}`;
const HOME = { home: { name: 'Toa Payoh Central', address: 'Toa Payoh Central Singapore 310177', lat: 1.33465, lng: 103.8491 }, others: [] };
const MEI = { name: '美玲', relation: 'daughter', phone: '+6591234567', callMe: '妈妈', lang: 'zh' };
const RECENTS = [{ to: { name: 'Bishan MRT', lat: 1.3511, lng: 103.8485 }, date: '2026-11-17', done: true }];
const fake = (page: Page) => page.evaluate.bind(page);
const battery = (page: Page, r: { supported: boolean; level: number | null; charging: boolean | null }) =>
  page.evaluate((x) => (window as unknown as W).__howtogo.platform.fake.setBattery(x), r);
async function axe(page: Page, label: string) {
  expect(await axeList(page), `axe ${label}`).toEqual([]);
}
async function controlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
let ipSeq = 0;
const nextIp = () => `192.0.2.${((test.info().workerIndex * 40 + ++ipSeq) % 250) + 1}`;
const liveCtx = (b: Browser) =>
  b.newContext({
    extraHTTPHeaders: { 'CF-Connecting-IP': nextIp() },
    baseURL: WORKER,
    locale: 'zh-CN',
    timezoneId: 'Asia/Singapore',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
    geolocation: { latitude: 1.33465, longitude: 103.8491 },
    permissions: ['geolocation'],
  });
void fake;

// ================================================================ A. performance (static parts)
test('AC 4: no CJK web font; Latin font subset, font-display swap, ≤ 30 KB; raster images WebP/AVIF/PNG with size', async () => {
  const assets = readdirSync(join(DIST, 'assets'));
  const fonts = assets.filter((f) => /\.(woff2?|ttf|otf)$/.test(f));
  for (const f of fonts) {
    expect(f, 'Latin subset only').toMatch(/latin/);
    expect(statSync(join(DIST, 'assets', f)).size, f).toBeLessThanOrEqual(30 * 1024);
  }
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const faces = html.match(/@font-face\{[^}]*\}/g) ?? [];
  for (const ff of faces) expect(ff, 'font-display swap').toMatch(/font-display:\s*swap/);
  expect(html, 'no external font CSS').not.toMatch(/fonts\.(googleapis|gstatic)/);
  for (const ff of faces) expect(ff, 'no CJK @font-face (system fonts only)').not.toMatch(/Noto|CJK|Hei|Song|Kai/);
});

test('AC 5: index.html preloads the entry and inlines the app CSS; Worker caching: hashed immutable, shell no-cache', async ({ request }) => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  expect(html).toMatch(/<style[^>]*>[\s\S]{2000,}<\/style>/);
  expect(html).toMatch(/<script type="module" crossorigin src="\/assets\/index-[\w-]+\.js"/);
  expect(html, 'MapLibre chunk never referenced by index.html').not.toMatch(/\/assets\/maplibre[^"]*\.js/);
  const asset = html.match(/\/assets\/index-[\w-]+\.js/)![0];
  const a = await request.head(`${WORKER}${asset}`);
  expect(a.status()).toBe(200);
  expect(a.headers()['cache-control']).toMatch(/public.*max-age=31536000.*immutable/);
  for (const p of ['/', '/sw.js', '/manifest.webmanifest']) {
    const r = await request.get(`${WORKER}${p}`);
    expect(r.headers()['cache-control'], p).toMatch(/no-cache/);
  }
});

test('AC 6 (Should): MapLibre is prefetched once Home has been idle 3 s', async ({ page }) => {
  await setup(page, {}, HOME, { clock: false });
  await page.goto('/?demo=1&demoMs=100000');
  await page.waitForTimeout(4500);
  const pre = await page.evaluate(() => [...document.querySelectorAll('link[rel=prefetch]')].map((l) => (l as HTMLLinkElement).href));
  expect(pre.some((h) => /maplibre/i.test(h)), 'link rel=prefetch for MapLibre').toBe(true);
});

// ================================================================ B. battery
test('AC 7: per-leg GPS profile on the fake platform — walk 2 s high accuracy; log lines carry no coordinates', async ({ page }) => {
  await boot(page, {}, HOME);
  await startTo(page, 'tan tock');
  await expect.poll(() => logOf(page)).toContain('loc:profile 2000');
  const power = await page.evaluate(() => (window as unknown as W).__howtogo.runtime.power.value);
  expect(power.profile).toMatchObject({ intervalMs: 2000, highAccuracy: true });
  const lines = await logOf(page);
  expect(lines.filter((l) => /\d\.\d{4}/.test(l))).toEqual([]);
});

test('AC 8: battery saver — Auto turns on at 15 % not charging; leaf chip; pocket view after 20 s idle; Off overrides', async ({ page }) => {
  await page.clock.install({ time: FIXED });
  await boot(page, {}, HOME);
  await startTo(page, 'tan tock');
  await battery(page, { supported: true, level: 0.15, charging: false });
  await expect(page.getByTestId('leaf-chip')).toBeVisible();
  expect(await logOf(page)).toContain('battery:saver on');
  expect(await page.evaluate(() => (window as unknown as W).__howtogo.runtime.power.value.saver)).toBe(true);
  await page.clock.fastForward(21_000);
  await expect(page.getByTestId('pocket')).toBeVisible();
  await page.getByTestId('pocket-show').click();
  await battery(page, { supported: true, level: 0.15, charging: true });
  await expect(page.getByTestId('leaf-chip')).toHaveCount(0);
});

test('AC 8: Settings 省电模式 Auto / On / Off; unsupported battery → "not on this phone"; default Auto', async ({ page }) => {
  await boot(page, {}, HOME, { path: '/settings?demo=1&demoMs=100000' });
  const row = page.getByTestId('row-battery');
  await expect(row).toContainText('自动');
  await battery(page, { supported: false, level: null, charging: null });
  await expect(row).toContainText('不支持');
  await row.click();
  await page.getByTestId('battery-on').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.settings')!).batterySaver)).toBe('on');
});

test('AC 9: battery saver never changes the get-off alert sequence (demo replay, normal vs saver)', async ({ browser }) => {
  test.setTimeout(120_000);
  const run = async (saver: boolean) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Singapore', geolocation: { latitude: 1.33465, longitude: 103.8491 }, permissions: ['geolocation'], baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await boot(page, saver ? { batterySaver: 'on' } : { batterySaver: 'off' }, HOME);
    await startTo(page, 'tan tock');
    if (saver) await expect(page.getByTestId('leaf-chip')).toBeVisible();
    await runUntil(page, 'trip:arrived');
    const seq = (await logOf(page)).filter((l) => /^(alert:|trip:arrived|state:offroute)/.test(l));
    const said = (await spoken(page)).length;
    await ctx.close();
    return { seq, said };
  };
  const normal = await run(false);
  const saver = await run(true);
  expect(normal.seq).toEqual(expect.arrayContaining(['alert:next', 'trip:arrived']));
  expect(saver.seq).toEqual(normal.seq);
  expect(saver.said).toBe(normal.said);
});

// ================================================================ C. accessibility
test('AC 11: axe WCAG 2.1 AA — M5 pages, bars and sheets (privacy zh/en/dark/200 %, about, settings + update bar, battery sheet, What’s new, offline Home)', async ({ page }) => {
  test.setTimeout(90_000);
  for (const s of [{}, { lang: 'en' }, { theme: 'dark' }, { textSize: 'xxlarge' }]) {
    await page.context().clearCookies();
    await page.goto('/privacy?demo=1');
    await page.evaluate((x) => localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: true, motion: 'on', ...x })), s);
    await page.reload();
    await expect(page.getByTestId('privacy-page')).toBeVisible();
    await axe(page, `privacy ${JSON.stringify(s)}`);
  }
  await page.goto('/about?demo=1&sample=1');
  await expect(page.getByTestId('about-version')).toBeVisible();
  await axe(page, 'about');
  await page.goto('/settings?demo=1&upd=1');
  await expect(page.getByTestId('update-banner')).toBeVisible();
  await axe(page, 'settings + update bar');
  await page.getByTestId('row-battery').click();
  await axe(page, 'battery sheet');
  await page.goto('/?demo=1&whatsnew=1');
  await expect(page.getByTestId('sheet-whatsnew')).toBeVisible();
  await axe(page, "what's new");
  await page.getByTestId('whatsnew-ok').click();
  await page.evaluate(() => (window as unknown as { __howtogoPreload: () => Promise<unknown> }).__howtogoPreload());
  await page.context().setOffline(true);
  await expect(page.getByTestId('offline-notice')).toBeVisible();
  await axe(page, 'offline Home');
  await page.context().setOffline(false);
});

async function tabTo(page: Page, id: string, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const cur = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    if (cur === id) return;
  }
  throw new Error(`Tab never reached ${id}`);
}
const focusVisible = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
  });

test('AC 12: keyboard only — Home → search → routes → detail → Start → Help/Share/End sheets; focus visible, returns to trigger', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, {}, HOME);
  await tabTo(page, 'to-field');
  expect(await focusVisible(page), 'focus ring on to-field').toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('search-input')).toBeFocused();
  await page.keyboard.type('tan tock');
  await tabTo(page, 'search-result-0');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await tabTo(page, 'route-option-0');
  await page.keyboard.press('Enter');
  await tabTo(page, 'start-guide');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('guide')).toBeVisible();
  for (const [trigger, sheet] of [['guide-help', 'sheet-help'], ['guide-share', 'sheet-share'], ['guide-end', 'sheet-end-trip']] as const) {
    await page.locator('body').focus().catch(() => {});
    await tabTo(page, trigger);
    expect(await focusVisible(page), `focus ring on ${trigger}`).toBe(true);
    await page.keyboard.press('Enter');
    const sh = page.getByTestId(sheet).or(page.locator('.sheet').last());
    await expect(sh).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('.sheet,[role=dialog]')), `focus moved into ${sheet}`).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(sheet)).toHaveCount(0);
    await expect(page.getByTestId(trigger), `focus back on ${trigger}`).toBeFocused();
  }
});

test('AC 13: guided trip has exactly one assertive live region and a polite headline; every control named (zh and en)', async ({ page }) => {
  await boot(page, {}, HOME);
  await startTo(page, 'tan tock');
  await expect(page.getByTestId('current-step')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('h1')).toHaveCount(1);
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button,a[href],[role=button],[role=switch]')].filter((e) => (e as HTMLElement).offsetParent && !(e.getAttribute('aria-label') || (e as HTMLElement).innerText.trim())).map((e) => e.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
  const icons = await page.evaluate(() => [...document.querySelectorAll('svg')].filter((s) => s.getAttribute('aria-hidden') !== 'true' && !s.closest('[aria-hidden=true]') && !s.getAttribute('role')).length);
  expect(icons, 'decorative svgs hidden').toBe(0);
  await runUntil(page, 'alert:next');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(await page.locator('[aria-live=assertive]').count(), 'one assertive region at the get-off alert').toBe(1);
});

test('AC 14: 320 CSS px at 200 % text — Home, Settings, Privacy, About, guidance: no h-scroll, clipping, overlap; targets ≥ 56 px', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 640 });
  await boot(page, { textSize: 'xxlarge' }, HOME);
  const bad: string[] = [];
  const check = async (what: string) => bad.push(...(await layoutProblems(page, { spacing: true })).map((p) => `${what}: ${p}`));
  await check('home');
  for (const p of ['/settings', '/privacy', '/about']) {
    await page.goto(`${p}?demo=1&demoMs=100000`);
    await page.waitForFunction(() => '__howtogo' in window);
    await page.waitForTimeout(300);
    await check(p);
  }
  await page.goto('/?demo=1&demoMs=100000');
  await page.waitForFunction(() => '__howtogo' in window);
  await startTo(page, 'tan tock');
  await check('guide');
  expect(bad).toEqual([]);
});

test('AC 16 (Should): prefers-reduced-motion — no running animation/transition > 0 s on H1 and H5', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, { motion: 'auto' }, HOME);
  const running = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running' && Number(a.effect?.getComputedTiming().duration ?? 0) > 1)
        .map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'anim'),
    );
  await page.waitForTimeout(500);
  expect(await running(), 'H1').toEqual([]);
  await startTo(page, 'tan tock');
  await page.waitForTimeout(500);
  expect(await running(), 'H5').toEqual([]);
});

// ================================================================ text size 85 % (owner request, Director 2026-11-18)
test('85 % text: first run offers 较小 85 %, default 100 %; picking it applies; step dots stay in a row; targets ≥ 56 px', async ({ page }) => {
  await setup(page, {}, null, { clock: false });
  await page.addInitScript(() => localStorage.setItem('howtogo.settings', '{"motion":"on"}'));
  await page.goto('/?demo=1');
  await expect(page.getByTestId('fr-size-small')).toBeVisible();
  await expect(page.getByTestId('fr-size-standard')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'standard');
  await page.getByTestId('fr-size-small').click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'small');
  expect(await layoutProblems(page)).toEqual([]);
  // Director report 2026-11-18: the first-run step dots must sit in one row (as in 0.3.0).
  const dots = await page.evaluate(() => {
    const d = document.querySelector('.dots');
    return d ? { dir: getComputedStyle(d).flexDirection, tops: [...d.querySelectorAll('i')].map((i) => Math.round(i.getBoundingClientRect().top)) } : null;
  });
  expect(dots, 'first-run step dots').not.toBeNull();
  expect(new Set(dots!.tops).size, `step dots in one row (flex-direction ${dots!.dir})`).toBe(1);
});

test('85 % text: Settings and /setup offer it; Home AA cycle never lands on 85 %; Home targets ≥ 56 px at 85 %', async ({ page }) => {
  await boot(page, { textSize: 'small' }, HOME);
  expect(await layoutProblems(page, { spacing: true })).toEqual([]);
  const aa = page.getByTestId('text-size');
  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    await aa.click();
    seen.push((await page.locator('html').getAttribute('data-text-size'))!);
  }
  expect(seen).not.toContain('small');
  await page.goto('/settings?demo=1');
  await page.getByTestId('setting-textSize-small').click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'small');
  const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main button, main [role=switch], main [role=radio]')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 55.5).map((b) => b.dataset.testid ?? b.textContent));
  expect(small).toEqual([]);
  await page.goto('/setup?mock=1');
  await expect(page.getByTestId('w-size-small')).toBeVisible();
});

// ================================================================ D. updates and offline
const QA = join(__dirname, '..');
const A = join(QA, '.out/dist');
const B = join(QA, '.out/dist-b');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
let root = A;
let server: Server;
let PORT = 0;
test.describe('AC 17 two builds', () => {
  test.skip(!existsSync(B), 'qa/.out/dist-b missing (run qa/gate.sh)');
  test.beforeAll(async () => {
    server = createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
      let f = join(root, p);
      if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) f = join(root, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': p === '/sw.js' ? 'no-cache' : 'max-age=0' });
      res.end(readFileSync(f));
    });
    await new Promise<void>((r) => server.listen(0, r));
    PORT = (server.address() as { port: number }).port;
  });
  test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

  test('AC 17: new build during an active trip + share — no update bar, no reload; after End the bar shows on Home and works; storage kept', async ({ browser }) => {
    test.setTimeout(90_000);
    root = A;
    const ctx = await browser.newContext({ baseURL: `http://localhost:${PORT}`, viewport: { width: 390, height: 844 }, locale: 'zh-CN', geolocation: { latitude: 1.33465, longitude: 103.8491 }, permissions: ['geolocation'] });
    const page = await ctx.newPage();
    await boot(page, {}, HOME);
    await page.evaluate((c) => localStorage.setItem('howtogo.family.v1', JSON.stringify([c])), MEI);
    await controlled(page);
    await page.waitForFunction(() => '__howtogo' in window);
    await startTo(page, 'tan tock');
    await page.getByTestId('guide-share').click();
    await page.getByTestId('share-copy').click();
    await expect(page.getByTestId('share-pill')).toBeVisible();
    const shareId = await page.evaluate(() => (window as unknown as W).__howtogo.store.trip.value.share.id);
    let loads = 0;
    page.on('load', () => loads++);
    root = B;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting), { timeout: 20_000 }).toBe(true);
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('guide')).toBeVisible();
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
    expect(loads, 'no reload during the trip').toBe(0);
    expect(await page.evaluate(() => (window as unknown as W).__howtogo.store.trip.value?.share?.id)).toBe(shareId);
    await page.getByTestId('guide-end').click();
    await page.getByTestId('end-trip-yes').click();
    if (await page.getByTestId('arrived').count()) await page.goto('/');
    await expect(page.getByTestId('to-field')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('update-banner')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('sw-update').click();
    await expect.poll(() => loads, { timeout: 15_000 }).toBe(1);
    await page.waitForTimeout(3000);
    expect(loads, 'exactly one reload').toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('howtogo.family.v1'))).toContain('美玲');
    expect(await page.evaluate(() => localStorage.getItem('howtogo.places'))).toContain('Toa Payoh');
    await ctx.close();
  });
});

test('AC 18: a chunk that fails to load triggers ONE clean reload, never a loop', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block', viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await setup(page, {}, HOME, { clock: false });
  await page.route(/\/assets\/Settings-[\w-]+\.js$/, (r) => r.fulfill({ status: 404, body: 'gone' }));
  let loads = 0;
  page.on('load', () => loads++);
  await page.goto('/');
  await page.waitForFunction(() => '__howtogo' in window);
  await page.getByTestId('nav-settings').click();
  await expect.poll(() => loads, { timeout: 10_000 }).toBe(2);
  await page.waitForFunction(() => '__howtogo' in window);
  await expect.poll(() => logOf(page), { timeout: 10_000 }).toContain('chunk:reload-skipped');
  await page.waitForTimeout(4000);
  expect(loads, 'initial load + exactly one reload').toBe(2);
  await ctx.close();
});

test('AC 19: offline active trip (release build, SW) — steps, alerts, voice and arrival work with no network', async ({ page, context }) => {
  test.setTimeout(90_000);
  await boot(page, {}, HOME);
  await controlled(page);
  await page.waitForFunction(() => '__howtogo' in window);
  await startTo(page, 'tan tock');
  await context.setOffline(true);
  await runUntil(page, 'alert:next');
  await runUntil(page, 'trip:arrived');
  expect((await spoken(page)).length).toBeGreaterThan(2);
  await context.setOffline(false);
});

test('AC 20: offline cold start of the installed app — Home with places/recents, 需要网络 captions, Settings, Help (call family, driver, 995)', async ({ page, context }) => {
  await setup(page, {}, HOME, { clock: false });
  await page.addInitScript(
    ([c, r]) => {
      localStorage.getItem('howtogo.family.v1') || localStorage.setItem('howtogo.family.v1', JSON.stringify([c]));
      localStorage.getItem('howtogo.recents.v2') || localStorage.setItem('howtogo.recents.v2', JSON.stringify(r));
    },
    [MEI, RECENTS] as const,
  );
  await page.goto('/');
  await controlled(page);
  await page.waitForTimeout(1500); // let the SW finish precaching the lazy chunks
  await context.setOffline(true);
  const p2 = await context.newPage();
  await p2.goto('/');
  await expect(p2.getByTestId('tile-home')).toBeVisible();
  await expect(p2.getByTestId('to-field')).toContainText('需要网络');
  await expect(p2.getByTestId('recent-0')).toContainText('需要网络');
  await expect(p2.locator('.spinner,[aria-busy=true]')).toHaveCount(0);
  await p2.getByTestId('nav-help').click();
  await expect(p2.getByTestId('help-call')).toBeVisible();
  await expect(p2.getByTestId('help-driver')).toBeVisible();
  await expect(p2.getByTestId('help-995')).toBeVisible();
  const p3 = await context.newPage();
  await p3.goto('/settings');
  await expect(p3.getByTestId('row-about')).toBeVisible();
  await context.setOffline(false);
});

test('AC 21 (Should): What’s new sheet — once, never during a trip', async ({ page }) => {
  await boot(page, {}, HOME, { path: '/?demo=1&demoMs=100000&whatsnew=1' });
  await expect(page.getByTestId('sheet-whatsnew')).toBeVisible();
  await page.getByTestId('whatsnew-ok').click();
  await page.reload();
  await page.waitForFunction(() => '__howtogo' in window);
  await expect(page.getByTestId('sheet-whatsnew')).toHaveCount(0);
  // During a trip: never.
  await page.evaluate(() => localStorage.removeItem('howtogo.whatsnew.v1'));
  await startTo(page, 'tan tock');
  await page.goto('/?demo=1&demoMs=100000&whatsnew=1');
  await page.waitForFunction(() => '__howtogo' in window);
  await page.waitForTimeout(800);
  await expect(page.getByTestId('sheet-whatsnew')).toHaveCount(0);
});

test('expired API cache entries are never served offline and are deleted; fresh ones are served (L1 fact 2)', async ({ page, context }) => {
  await setup(page, {}, HOME, { clock: false });
  await page.goto('/');
  await controlled(page);
  await page.evaluate(async () => {
    const c = await caches.open('api-v1');
    const put = (u: string, ageMs: number) => c.put(u, new Response('{"results":[]}', { headers: { 'content-type': 'application/json', 'x-sw-cached-at': String(Date.now() - ageMs) } }));
    await put('/api/search?q=old', 25 * 3600_000);
    await put('/api/search?q=fresh', 60_000);
    await put('/api/route?a=old', 11 * 60_000);
  });
  await context.setOffline(true);
  const got = await page.evaluate(async () => {
    const f = async (u: string) => {
      try {
        return (await fetch(u)).status;
      } catch {
        return 'net-error';
      }
    };
    return { old: await f('/api/search?q=old'), fresh: await f('/api/search?q=fresh'), route: await f('/api/route?a=old') };
  });
  await context.setOffline(false);
  expect(got).toEqual({ old: 'net-error', fresh: 200, route: 'net-error' });
  const left = await page.evaluate(async () => (await (await caches.open('api-v1')).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search));
  expect(left).toEqual(['/api/search?q=fresh']);
});

test('update bar never during a trip (?upd=1 hook): Home yes, guidance no', async ({ page }) => {
  await boot(page, {}, HOME, { path: '/?demo=1&demoMs=100000&upd=1' });
  await expect(page.getByTestId('update-banner')).toBeVisible();
  await startTo(page, 'tan tock');
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
  await page.getByTestId('pocket-btn').click();
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

// ================================================================ E. privacy, about
test('AC 22: /privacy zh/en — ≤ 400 en words (≤ 600 zh Han), required facts, notice version/date; linked from Settings, About, /setup, family page', async ({ page, request }) => {
  await boot(page, {}, HOME, { path: '/privacy?lang=en&demo=1' });
  const pv = page.getByTestId('privacy-page');
  await expect(pv).toHaveAttribute('lang', 'en');
  const en = await page.evaluate(() => {
    const root = document.querySelector('[data-testid=privacy-page]')!.cloneNode(true) as HTMLElement;
    root.querySelectorAll('[data-testid=pv-footer],[data-testid=pv-open]').forEach((e) => e.remove());
    return root.innerText;
  });
  const words = en.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  test.info().annotations.push({ type: 'privacy-words-en', description: String(words) });
  expect(words).toBeLessThanOrEqual(400);
  for (const re of [/OneMap|Singapore Land Authority/, /LTA/, /Cloudflare/, /4 hours|4 h/, /24 hours|24 h/, /WhatsApp/, /[Dd]elete/, /ads|advert/i]) expect(en, String(re)).toMatch(re);
  await expect(page.getByTestId('pv-footer')).toContainText(/\d/);
  await page.goto('/privacy?lang=zh&demo=1');
  const zh = await pv.innerText();
  const han = (zh.match(/\p{Script=Han}/gu) ?? []).length;
  test.info().annotations.push({ type: 'privacy-han-zh', description: String(han) });
  expect(han).toBeLessThanOrEqual(700);
  // Entry points.
  await page.goto('/settings?demo=1');
  await expect(page.getByTestId('row-privacy')).toBeVisible();
  await page.goto('/about?demo=1');
  await expect(page.getByTestId('about-privacy')).toBeVisible();
  await page.goto('/setup?mock=1');
  await expect(page.getByTestId('w-privacy')).toHaveAttribute('href', /\/privacy/);
  void request;
  await page.goto(`${WORKER}/t/abcdefghjkmn`);
  await expect(page.getByTestId('viewer-privacy')).toHaveAttribute('href', /\/privacy/);
});

test('AC 23: no contact e-mail; the contact line points to Report a problem', async ({ page }) => {
  await boot(page, {}, HOME, { path: '/privacy?lang=zh&demo=1' });
  await expect(page.getByTestId('pv-contact')).toContainText('报告问题');
  expect(await page.getByTestId('privacy-page').innerText()).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  await page.getByTestId('pv-report').click();
  await expect(page.getByTestId('sheet-report')).toBeVisible();
});

test('AC 24: About — version + build date, sample line in fixture mode, OneMap + LTA ODL attribution, privacy + report; no licences link (ruling)', async ({ page }) => {
  await boot(page, {}, HOME, { path: '/about?demo=1&sample=1' });
  await expect(page.getByTestId('about-version')).toHaveText(/\d+\.\d+\.\d+.*\d{4}/);
  await expect(page.getByTestId('about-sample')).toBeVisible();
  await expect(page.getByTestId('about-attrib')).toContainText('Map data © contributors, Singapore Land Authority');
  await expect(page.locator('body')).toContainText('Singapore Open Data Licence version 1.0');
  await expect(page.locator('body')).toContainText(/Contains information from LTA DataMall accessed on/);
  await expect(page.getByTestId('about-attrib').locator('img')).toHaveCount(1);
  await expect(page.getByTestId('about-privacy')).toBeVisible();
  await expect(page.getByTestId('about-report')).toBeVisible();
  await expect(page.locator('a[href*="licenses"]')).toHaveCount(0);
});

test('AC 25: privacy review (local Worker) — storage keys documented, no cookies, no third-party requests, CSP blocks inline script', async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await liveCtx(browser);
  const page = await ctx.newPage();
  const third: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== WORKER && !/(^|\.)onemap\.gov\.sg$/.test(u.hostname) && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) third.push(u.origin);
  });
  await page.route(/onemap\.gov\.sg/, (r) => r.fulfill({ status: 204 }));
  await stubs(page);
  await page.addInitScript(([p, c]) => {
    localStorage.getItem('howtogo.settings') || localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: true, motion: 'on' }));
    localStorage.getItem('howtogo.places') || localStorage.setItem('howtogo.places', JSON.stringify(p));
    localStorage.getItem('howtogo.family.v1') || localStorage.setItem('howtogo.family.v1', JSON.stringify([c]));
  }, [HOME, MEI] as const);
  const res = await page.goto('/?demo=1&demoMs=100000&realshare=1');
  await page.waitForFunction(() => '__howtogo' in window);
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  const docs = ['schema', 'settings', 'places', 'recents.v2', 'trip.v1', 'family.v1', 'prefs.m34', 'helpshare.v1', 'notify.asked', 'm6.batteryGuideSeen', 'telemetry.v1', 'install.v1', 'whatsnew.v1'];
  expect(keys.filter((k) => !docs.includes(k.replace(/^howtogo\./, ''))), 'undocumented localStorage keys').toEqual([]);
  expect(await ctx.cookies()).toEqual([]);
  expect([...new Set(third)]).toEqual([]);
  const csp = res!.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self'(;|$| 'sha)/);
  expect(csp).not.toMatch(/unsafe-inline[^;]*;?.*script-src|script-src[^;]*unsafe-inline/);
  const ran = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__inl = 1';
    document.head.appendChild(s);
    return (window as unknown as { __inl?: number }).__inl === 1;
  });
  expect(ran, 'inline script blocked by CSP').toBe(false);
  await ctx.close();
});

// ================================================================ F. install helper
const UA = {
  safari17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  chrome17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
  edge17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/120.0.2210.126 Mobile/15E148 Safari/605.1.15',
  chrome16_0: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/108.0.5359.112 Mobile/15E148 Safari/604.1',
  firefox17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15',
  waAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36 WhatsApp/2.23.24.76',
  fbIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0.33.116;FBBV/1;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.1;FBSS/3;FBLC/en_US;FBOP/5]',
  wechatAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160065 MMWEBSDK/20231202 MicroMessenger/8.0.47.2560(0x28002F30) WeChat/arm64 Weixin NetType/4G Language/zh_CN ABI/arm64',
  lineIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.1.0',
  telegramAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 Telegram-Android/10.2.6 (Google Pixel 7; Android 13; SDK 33; HIGH)',
};
async function homeWithInstall(page: Page, install: unknown = { views: 2, dismissals: 0, hiddenUntil: 0 }) {
  await page.addInitScript((i) => localStorage.setItem('howtogo.install.v1', JSON.stringify(i)), install);
  await boot(page, {}, HOME);
}
const firePrompt = (page: Page) =>
  page.evaluate(() => {
    const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = async () => {};
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    dispatchEvent(e);
  });

test('AC 26: Android Chrome — card only after the 2nd route view; button calls the captured prompt; never during a trip; hooks carry no UA', async ({ page }) => {
  await homeWithInstall(page, { views: 0, dismissals: 0, hiddenUntil: 0 });
  await firePrompt(page);
  await expect(page.getByTestId('install-card')).toHaveCount(0);
  for (let i = 0; i < 2; i++) {
    await toRoutes(page);
    await expect(page.getByTestId('route-option-0')).toBeVisible();
    await page.getByTestId('back').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/routes'));
    if (new URL(page.url()).pathname.startsWith('/search')) await page.getByTestId('back').click();
    await expect(page.getByTestId('greeting')).toBeVisible();
    if (i === 0) await expect(page.getByTestId('install-card')).toHaveCount(0);
  }
  const card = page.getByTestId('install-card');
  await expect(card).toHaveAttribute('data-variant', 'android-prompt');
  await expect(card).toContainText('主屏幕');
  await card.scrollIntoViewIfNeeded();
  await page.getByTestId('install-go').click();
  await expect(card).toHaveCount(0);
  const lines = await logOf(page);
  expect(lines).toEqual(expect.arrayContaining(['install:shown', 'install:accepted']));
  expect(lines.filter((l) => /Mozilla|Chrome\/|Android \d/.test(l))).toEqual([]);
});

for (const [ua, variant] of [
  ['safari17', 'ios-guide'],
  ['chrome17', 'ios-guide'],
  ['edge17', 'ios-guide'],
  ['chrome16_0', 'ios-safari'],
  ['firefox17', 'ios-safari'],
] as const) {
  test.describe(`AC 27 iOS ${ua}`, () => {
    test.use({ userAgent: UA[ua] });
    test(`AC 27: iOS ${ua} → install card variant ${variant}`, async ({ page }) => {
      await homeWithInstall(page);
      await expect(page.getByTestId('install-card')).toHaveAttribute('data-variant', new RegExp(`^${variant}`));
      if (variant === 'ios-guide') {
        await page.getByTestId('install-card').scrollIntoViewIfNeeded();
        await page.getByTestId('install-go').click();
        await expect(page.getByTestId('sheet-install-guide').locator('ol > li')).toHaveCount(3);
      }
    });
  });
}

for (const ua of ['waAndroid', 'fbIos', 'wechatAndroid', 'lineIos', 'telegramAndroid'] as const) {
  test.describe(`AC 28 in-app ${ua}`, () => {
    test.use({ userAgent: UA[ua] });
    test(`AC 28: in-app browser ${ua} → "works best in your browser" bar, no card`, async ({ page }) => {
      await homeWithInstall(page, { views: 9, dismissals: 0, hiddenUntil: 0 });
      await expect(page.getByTestId('iab-bar')).toBeVisible();
      await expect(page.getByTestId('iab-bar')).toHaveAttribute('data-os', /android|ios/.test(ua) ? (ua.includes('Ios') ? 'ios' : 'android') : /.*/);
      await expect(page.getByTestId('install-card')).toHaveCount(0);
    });
  });
}

test.describe('AC 28 family page in WhatsApp', () => {
  test.use({ userAgent: UA.waAndroid, baseURL: WORKER, serviceWorkers: 'block' });
  test('AC 28: no in-app bar on the family page /t/:id', async ({ page }) => {
    await page.route(/onemap\.gov\.sg|fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 204 }));
    await page.goto('/t/abcdefghjkmn');
    await expect(page.getByTestId('viewer')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('iab-bar')).toHaveCount(0);
  });
});

test.describe('AC 29 standalone', () => {
  test.use({ userAgent: UA.safari17 });
  test('AC 29: hidden when already installed (navigator.standalone) and during a trip', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }));
    await homeWithInstall(page);
    await page.waitForTimeout(800);
    await expect(page.getByTestId('install-card')).toHaveCount(0);
    await expect(page.getByTestId('iab-bar')).toHaveCount(0);
  });
});

// ================================================================ G. production config (local)
test('AC 30: wrangler.toml — placeholders only; SHARE_TEST_TTL_SECONDS only under [env.test]', async () => {
  const toml = readFileSync(join(ROOT, 'src/worker/wrangler.toml'), 'utf8');
  const sections = toml.split(/^(?=\[)/m);
  for (const s of sections) {
    const head = s.split('\n')[0]!;
    if (/^SHARE_TEST_TTL_SECONDS\s*=/m.test(s)) expect(head, 'section setting SHARE_TEST_TTL_SECONDS').toMatch(/^\[env\.test/);
  }
  expect(toml).toMatch(/^\[env\.production\]/m);
  expect(toml).not.toMatch(/^(ONEMAP_PASSWORD|LTA_ACCOUNT_KEY|STATS_TOKEN)\s*=\s*"[^"]+"/m);
});

test('AC 31: /api/health shape {ok, fixtureMode, onemap, lta (key|proxy|none), version}, no secrets; a 503 shows "can’t find the way", never sample routes', async ({ request, page }) => {
  const h = await request.get(`${WORKER}/api/health`);
  const j = await h.json();
  expect(Object.keys(j).sort()).toEqual(['fixtureMode', 'lta', 'ok', 'onemap', 'version']);
  expect(['key', 'proxy', 'none']).toContain(j.lta);
  expect(JSON.stringify(j)).not.toMatch(/expir|token|password|secret/i);
  await setup(page);
  await liveApi(page, { route: () => ({ status: 503, body: { error: { code: 'not_configured' } } }) });
  await page.goto('/');
  await toRoutes(page);
  await expect(page.getByTestId('state-routes-error')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/示范路线|Sample routes/);
  await expect(page.getByTestId('route-option-0')).toHaveCount(0);
});

test('AC 32: security headers on HTML — CSP, nosniff, Permissions-Policy geolocation=self, no-referrer on /t/* and /setup', async ({ request }) => {
  for (const p of ['/', '/settings', '/privacy', '/t/abcdefghjkmn', '/setup']) {
    const r = await request.get(`${WORKER}${p}`);
    const h = r.headers();
    expect(h['content-security-policy'], p).toBeTruthy();
    expect(h['x-content-type-options'], p).toBe('nosniff');
    // The family page and /setup never need location: geolocation=() is stricter than "self" and accepted.
    expect(h['permissions-policy'], p).toMatch(/^\/(t|setup)/.test(p) ? /geolocation=\((self)?\)/ : /geolocation=\(self\)/);
    if (/^\/(t|setup)/.test(p)) expect(h['referrer-policy'], p).toBe('no-referrer');
  }
});

test('AC 33: npm run smoke:deploy against the local Worker PASSes', async () => {
  test.setTimeout(60_000);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/smoke-deploy.mjs'), WORKER], { encoding: 'utf8', timeout: 50_000 });
  const fails = r.stdout.split('\n').filter((l) => l.startsWith('FAIL'));
  test.info().annotations.push({ type: 'smoke-deploy', description: r.stdout.split('\n').filter((l) => /smoke:deploy/.test(l)).join(' ') });
  expect(fails).toEqual([]);
  expect(r.status).toBe(0);
});

test('AC 36: smoke:live on a fixture-mode Worker exits 2 (BLOCKED), prints no tokens or responses', async () => {
  test.setTimeout(60_000);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/smoke-live.mjs'), WORKER], { encoding: 'utf8', timeout: 50_000 });
  expect(r.stdout).toContain('smoke:live BLOCKED');
  // QA-54: on Windows, process.exit(2) right after a fetch aborts in libuv (UV_HANDLE_CLOSING), so the code is not 2.
  expect(r.status, `exit code; ${r.stderr.split('\n').find((l) => /Assertion/.test(l)) ?? ''}`).toBe(2);
  expect(r.stdout + r.stderr).not.toMatch(/eyJ[\w-]{10,}|Bearer\s+\w{8,}/);
});

// ================================================================ I. monitoring-lite
async function telemetryRun(page: Page, settings: Record<string, unknown>) {
  const posts: { body: string; headers: Record<string, string> }[] = [];
  page.on('request', (r) => {
    if (/\/api\/telemetry/.test(r.url())) posts.push({ body: r.postData() ?? '', headers: r.headers() });
  });
  await setup(page, settings, HOME);
  await liveApi(page, { search: () => ({ status: 503, body: { error: { code: 'not_configured' } } }) });
  await page.goto('/?telemetry=1');
  await page.waitForFunction(() => '__howtogo' in window);
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1500);
  return posts;
}

test('AC 38/40: error counts default ON; payload is only [{v, code, screen, n}] with no identifiers', async ({ page }) => {
  const posts = await telemetryRun(page, {});
  expect(posts.length, 'one telemetry report').toBeGreaterThanOrEqual(1);
  const rows = JSON.parse(posts[0]!.body) as Record<string, unknown>[];
  expect(Array.isArray(rows)).toBe(true);
  for (const r of rows) {
    expect(Object.keys(r).sort()).toEqual(['code', 'n', 'screen', 'v']);
    expect(String(r.code)).toMatch(/^[a-z_0-9]+$/);
    expect(String(r.screen)).toMatch(/^[a-z_]+$/);
    expect(Number.isInteger(r.n)).toBe(true);
  }
  expect(rows.map((r) => r.code)).toContain('api_503');
  expect(posts[0]!.body).not.toMatch(/tan|tock|Toa|Payoh|\d\.\d{3}|Mozilla|http|\d{4}-\d\d-\d\dT/);
  const ref = posts[0]!.headers['referer'] ?? '';
  expect(ref, 'no URL with a query in the Referer').not.toMatch(/\?/);
  expect(posts[0]!.headers['cookie'] ?? '').toBe('');
});

test('AC 40: switch off → nothing is sent', async ({ page }) => {
  const posts = await telemetryRun(page, { errorCounts: false });
  expect(posts).toEqual([]);
  await page.goto('/settings?telemetry=1');
  await expect(page.getByTestId('set-errors')).toHaveAttribute('aria-checked', 'false');
});

test('AC 39/40: Worker /api/telemetry strict schema; /api/stats 404 without the token; the family page sends nothing', async ({ browser }) => {
  const ctx = await liveCtx(browser);
  const ok = await ctx.request.post('/api/telemetry', { data: [{ v: '0.3.0', code: 'api_503', screen: 'search', n: 1 }] });
  expect(ok.status()).toBeLessThan(300);
  const extra = await ctx.request.post('/api/telemetry', { data: [{ v: '0.3.0', code: 'api_503', screen: 'search', n: 1, ua: 'x' }] });
  expect(extra.status()).toBe(400);
  const server = await ctx.request.post('/api/telemetry', { data: [{ v: '0.3.0', code: 'share_create', screen: 'search', n: 1 }] });
  expect(server.status()).toBe(400);
  expect((await ctx.request.get('/api/stats?days=7')).status()).toBe(404);
  const page = await ctx.newPage();
  const tel: string[] = [];
  page.on('request', (r) => /\/api\/telemetry/.test(r.url()) && tel.push(r.url()));
  await page.route(/onemap\.gov\.sg/, (r) => r.fulfill({ status: 204 }));
  await page.goto('/t/abcdefghjkmn?telemetry=1');
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new ErrorEvent('error', { message: 'qa' }));
  });
  await page.waitForTimeout(1000);
  expect(tel).toEqual([]);
  await ctx.close();
});

// ================================================================ Delete all (Director ruling 2026-11-18)
test('Delete all my data: live share stopped first (family sees it end), then localStorage, sessionStorage, Cache Storage, IndexedDB emptied', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await liveCtx(browser);
  const page = await ctx.newPage();
  await page.route(/onemap\.gov\.sg|fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 204 }));
  await stubs(page);
  const order: string[] = [];
  page.on('request', (r) => /\/api\/share\//.test(r.url()) && r.method() === 'DELETE' && order.push('DELETE'));
  // Settings is not reachable during a trip (resume → guidance), so the live share here is a Help-only share on the
  // real Worker (the other kind that outlives a screen), created over the API and stored as the app stores it.
  const r = await ctx.request.post('/api/share', { data: { destName: '陈笃生医院', lang: 'zh', senderName: '妈妈' } });
  expect(r.status()).toBe(201);
  const sh = (await r.json()) as { id: string; ownerToken: string; viewPath: string };
  await page.goto('/?realshare=1');
  // Seeded once (not by an init script, which would re-seed after the delete-all reload).
  await page.evaluate(
    ([s, c, p]) => {
      localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: true, motion: 'on', name: '陈' }));
      localStorage.setItem('howtogo.family.v1', JSON.stringify([c]));
      localStorage.setItem('howtogo.places', JSON.stringify(p));
      localStorage.setItem('howtogo.recents.v2', JSON.stringify([{ to: { name: 'Bishan MRT', lat: 1.3511, lng: 103.8485 }, date: '2026-11-17', done: true }]));
      localStorage.setItem('howtogo.prefs.m34', JSON.stringify({ myPhone: '+6587654321' }));
      localStorage.setItem('howtogo.helpshare.v1', JSON.stringify({ ...(s as object), expiresAt: '2099-01-01T00:00:00Z', fam: null }));
    },
    [sh, MEI, HOME] as const,
  );
  await page.evaluate(async () => {
    sessionStorage.setItem('qa.seeded', '1');
    for (const n of ['api-v1', 'tiles-v1', 'trip-tiles-v1', 'runtime-v1']) await (await caches.open(n)).put(`/x-${n}`, new Response('x'));
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open('qa-db', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('s');
      r.onsuccess = () => (r.result.close(), res());
      r.onerror = () => rej(r.error);
    });
  });
  await page.goto('/settings');
  await page.getByTestId('row-delete-all').click();
  await page.getByTestId('delete-all-go').click();
  await page.waitForURL((u) => u.pathname === '/', { timeout: 15_000 });
  await page.waitForTimeout(1000);
  expect(order, 'share DELETE sent').toContain('DELETE');
  const g = await ctx.request.get(`/api/share/${sh.id}`);
  const st = g.status() === 200 ? (await g.json()).status : g.status();
  expect(['ended', 404, 410]).toContain(st);
  const left = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    caches: (await caches.keys()).filter((k) => !k.startsWith('shell-')),
    idb: (await indexedDB.databases()).map((d) => d.name),
  }));
  // The fresh app may write empty defaults on boot; nothing of hers may survive.
  const dump = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  test.info().annotations.push({ type: 'localStorage-after', description: dump.slice(0, 400) });
  expect(dump, 'no personal data left').not.toMatch(/美玲|Toa Payoh|Bishan|\+65|ownerToken|onboarded":true|"陈"/);
  expect(left.local.filter((k) => !/^howtogo\.(schema|settings|recents\.v2|family\.v1|places|prefs\.m34)$/.test(k)), 'unexpected keys after delete-all').toEqual([]);
  expect(left.session).not.toContain('qa.seeded');
  expect(left.caches).toEqual([]);
  expect(left.idb).toEqual([]);
  await ctx.close();
});

// ================================================================ J. field-test kit (files)
test('AC 41: field-test kit present — script, consent, questions (≤ 10), printable form; no participant names', async () => {
  const dir = join(ROOT, 'docs/field-test');
  for (const f of ['script.md', 'consent.md', 'questions.md', 'feedback-form.pdf']) expect(existsSync(join(dir, f)), f).toBe(true);
  const q = readFileSync(join(dir, 'questions.md'), 'utf8');
  const numbered = q.split('\n').filter((l) => /^\s*\d+[.)]\s/.test(l));
  expect(numbered.length).toBeGreaterThan(0);
  expect(new Set(numbered.map((l) => l.trim().match(/^\d+/)![0])).size).toBeLessThanOrEqual(10);
  void gzipSync;
});
