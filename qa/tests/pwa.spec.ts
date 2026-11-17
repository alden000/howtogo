/**
 * AC 1–4 (PWA shell) against the release build. Lighthouse ≥ 12 has no PWA category, so installability is
 * checked with Chrome's own installability verdict (CDP Page.getInstallabilityErrors) + manifest/SW checks.
 * AC 4 uses two builds (qa/.out/dist = A, qa/.out/dist-b = B, built by gate.sh) behind one origin whose
 * root can be switched (a tiny static server in this file).
 */
import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { hooks, setup } from './helpers';

test('AC-1 manifest served with name, short_name, start_url, scope, standalone, colours, 192/512/maskable icons', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.name).toBe('怎么去?');
  expect(m.short_name).toBeTruthy();
  expect(m.display).toBe('standalone');
  expect(m.start_url).toBe('/');
  expect(m.scope).toBe('/');
  expect(m.theme_color).toBeTruthy();
  const sizes = (m.icons ?? []).flatMap((i: { sizes?: string }) => (i.sizes ?? '').split(' '));
  expect.soft(sizes, 'icons (known fix-round item: logo B icons)').toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect.soft((m.icons ?? []).some((i: { purpose?: string }) => /maskable/.test(i.purpose ?? '')), 'maskable icon').toBe(true);
  for (const i of m.icons ?? []) expect((await request.get(i.src)).ok(), i.src).toBe(true);
});

test('AC-3 Chrome installability verdict has no errors; Settings offers "安装到主屏幕"', async ({ page }) => {
  await setup(page);
  await page.goto('/?mock=1');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] };
  const ids = installabilityErrors.map((e) => e.errorId);
  await page.goto('/settings');
  await expect(page.getByTestId('row-install')).toContainText('安装到主屏幕');
  expect(ids, 'Chrome installability errors').toEqual([]);
});

async function controlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('AC-2 SW precaches the shell: offline cold start of a NEW tab shows Home + offline notice', async ({ context, page }) => {
  await setup(page);
  await page.goto('/?mock=1');
  await controlled(page);
  const keys = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys()) if (k.startsWith('shell-')) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(keys).toEqual(expect.arrayContaining(['/', '/manifest.webmanifest']));
  await context.setOffline(true);
  const p2 = await context.newPage();
  await p2.goto('/');
  await expect(p2.getByTestId('to-field')).toBeVisible();
  await expect(p2.getByTestId('offline-notice')).toBeVisible();
  // A deep path offline also gets the shell (navigation fallback), not a browser error.
  const p3 = await context.newPage();
  await p3.goto('/settings');
  await expect(p3.getByTestId('row-about')).toBeVisible();
  await context.setOffline(false);
});

test('AC-2 offline: route search on a cold offline start shows the offline state, not a crash', async ({ context, page }) => {
  await setup(page);
  await page.goto('/');
  await controlled(page);
  await context.setOffline(true);
  await page.reload();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await expect(page.getByTestId('state-search-offline')).toBeVisible();
  expect(errors).toEqual([]);
  await context.setOffline(false);
});

// ---------- AC 4: two builds ----------
const QA = join(__dirname, '..');
const A = join(QA, '.out/dist');
const B = join(QA, '.out/dist-b');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
let root = A;
let server: Server;
const PORT = 4190 + (process.pid % 7);
test.describe('AC-4 SW update', () => {
  test.skip(!existsSync(B), 'qa/.out/dist-b missing (run qa/gate.sh)');
  test.beforeAll(async () => {
    server = createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
      let f = join(root, p);
      if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) f = join(root, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': p === '/sw.js' ? 'no-cache' : 'max-age=0' });
      res.end(readFileSync(f));
    });
    await new Promise<void>((r) => server.listen(PORT, r));
  });
  test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

  test('AC-4 next launch after a deploy runs build B; banner → Update → "已更新" toast; no stuck version', async ({ browser }) => {
    root = A;
    const ctx = await browser.newContext({ baseURL: `http://localhost:${PORT}` });
    let page = await ctx.newPage();
    await setup(page);
    await page.goto('/?mock=1');
    await controlled(page);
    const swA = await page.evaluate(async () => (await (await fetch('/sw.js')).text()).match(/shell-(\w+)/)?.[1]);
    root = B; // deploy B
    // Same tab returns to the app: the update is found and offered (F7 banner on Home).
    await page.reload();
    await expect(page.getByTestId('update-banner')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('sw-update').click();
    await expect(page.getByTestId('toast-updated')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('toast-updated')).toContainText('已更新');
    const active = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('shell-')));
    expect(active).toHaveLength(1);
    expect(active[0]).not.toBe(`shell-${swA}`);
    expect(await hooks(page)).toContain('sw:updated');
    await ctx.close();
  });

  test('AC-4 closing all tabs and relaunching picks up build B without user action', async ({ browser }) => {
    root = A;
    const ctx = await browser.newContext({ baseURL: `http://localhost:${PORT}` });
    let page = await ctx.newPage();
    await setup(page);
    await page.goto('/?mock=1');
    await controlled(page);
    const jsA = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /index-/.test(s)));
    root = B;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await page.waitForTimeout(1500);
    await page.close();
    page = await ctx.newPage();
    await page.goto('/');
    await page.close(); // the first launch may still be served by A while B waits; the next launch must be B
    page = await ctx.newPage();
    await page.goto('/');
    const jsNow = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /index-/.test(s)));
    expect(jsNow).not.toBe(jsA);
    await ctx.close();
  });
});
