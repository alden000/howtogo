/**
 * 0.1.1 targeted re-check (after the M1 fix round): AC 38 via the map log hook, QA-19 precache,
 * core-journey smoke in zh/en × light/dark × 200 %, logo B icons served.
 */
import { expect, test, type Page } from '@playwright/test';
import { hooks, layoutProblems, setup, toRoutes } from './helpers';

const mapLog = (page: Page) => page.evaluate(() => [...((window as unknown as { __howtogoLog?: string[] }).__howtogoLog ?? [])]);

test.describe('no SW', () => {
  test.use({ serviceWorkers: 'block' });

  test('AC-38 route drawing via the map log hook: walk + transit lines, stop markers, destination; no coordinates', async ({ page }) => {
    await setup(page);
    await page.goto('/?demo=1');
    await toRoutes(page);
    await page.getByTestId('route-option-0').click();
    await expect.poll(async () => (await mapLog(page)).find((l) => l.startsWith('map:route')), { timeout: 15_000 }).toMatch(/^map:route walk=[1-9]\d* transit=[1-9]\d* stops=[1-9]\d* dest=1$/);
    const log = await mapLog(page);
    expect(log).toContain('map:ready');
    expect(log.some((l) => /\d+\.\d{3}/.test(l)), `no coordinates in the map log: ${log.join(' | ')}`).toBe(false);
  });

  for (const c of [
    { lang: 'zh', scheme: 'light' },
    { lang: 'en', scheme: 'dark' },
    { lang: 'zh', scheme: 'dark' },
    { lang: 'en', scheme: 'light' },
  ] as const)
    test.describe(`smoke ${c.lang}-${c.scheme}-200`, () => {
      test.use({ colorScheme: c.scheme });
      test(`core journey smoke ${c.lang} ${c.scheme} 200 %: Home → Search → Routes → Detail → Back ×2 → Settings → About`, async ({ page }, info) => {
        await setup(page, { lang: c.lang, textSize: 'xxlarge', theme: c.scheme });
        await page.goto('/?demo=1');
        await expect(page.getByTestId('to-field')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.lang)).toMatch(c.lang === 'zh' ? /^zh/ : /^en/);
        await expect(page.getByTestId('nav-help')).toHaveCount(0);
        await toRoutes(page);
        await expect(page.getByTestId('route-option-0')).toBeVisible();
        await expect(page.getByTestId('routes-swap')).toBeVisible();
        await expect(page.getByTestId('route-option-0')).toContainText(c.lang === 'zh' ? /走路 \d+ 米/ : /Walk \d+ m/);
        expect(await layoutProblems(page), 'routes layout').toEqual([]);
        await page.screenshot({ path: info.outputPath(`routes.png`) });
        await page.getByTestId('route-option-0').click();
        await expect(page.getByTestId('step-list')).toBeVisible();
        expect(await layoutProblems(page), 'trip layout').toEqual([]);
        await page.screenshot({ path: info.outputPath(`trip.png`) });
        await page.getByTestId('back').click();
        await expect(page.getByTestId('route-option-0')).toBeVisible();
        await page.goBack(); // Routes → Home (Search is replaced in history by Routes)
        await expect(page.getByTestId('to-field')).toBeVisible();
        await page.getByTestId('nav-settings').click();
        await expect(page.getByTestId('row-about')).toBeVisible();
        expect(await layoutProblems(page), 'settings layout').toEqual([]);
        await page.getByTestId('row-about').click();
        await expect(page.getByTestId('privacy')).toBeVisible();
        expect(await layoutProblems(page), 'about layout').toEqual([]);
        await page.screenshot({ path: info.outputPath(`about.png`) });
        const h = await hooks(page);
        for (const s of ['screen:/', 'screen:/search', 'screen:/routes', 'screen:/settings', 'screen:/about']) expect(h).toContain(s);
        expect(h.filter((l) => l.startsWith('screen:')).length, h.join(' | ')).toBeGreaterThanOrEqual(7);
      });
    });
});

test('QA-19 SW shell precache excludes demo/mock fixtures (mock-*.js); demo still works when online', async ({ page, request }) => {
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).not.toMatch(/mock-[\w-]+\.js/);
  await setup(page);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const shell = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys()) if (k.startsWith('shell-')) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(shell.length).toBeGreaterThan(2);
  expect(shell.filter((p) => /mock/.test(p))).toEqual([]);
  await page.goto('/?demo=1');
  await toRoutes(page);
  await expect(page.getByTestId('route-option-0')).toBeVisible();
});

test('AC-1/K-1 logo B icons: every manifest icon, favicon and apple-touch-icon is served as an image of the declared size', async ({ request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json();
  const purposes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`);
  expect(purposes).toEqual(expect.arrayContaining(['192x192/any', '512x512/any', '192x192/maskable', '512x512/maskable']));
  expect(m).not.toHaveProperty('x_todo_creative');
  for (const i of [...m.icons, { src: '/apple-touch-icon.png', sizes: '180x180' }, { src: '/favicon-32.png', sizes: '32x32' }]) {
    const r = await request.get(i.src);
    expect(r.status(), i.src).toBe(200);
    const b = await r.body();
    expect(b.subarray(1, 4).toString(), i.src).toBe('PNG');
    expect(`${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`, i.src).toBe(i.sizes);
  }
  expect((await request.get('/favicon.svg')).status()).toBe(200);
});
