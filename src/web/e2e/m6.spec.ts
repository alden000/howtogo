/**
 * M6 UI round (STYLE-GUIDE 6h): the native-only frames drawn in the WebView, rendered with the mock-only
 * `?m6=<spec>` fake app platform (src/platform/m6fake.ts), plus the web Get-the-app card (Android Chrome UA).
 * Baselines `M6-{id}-{state}-{theme}-{size}-{lang}` at 390×844, deviceScaleFactor 1 like the other dev baselines.
 * Re-record: qa/scripts/dev-e2e-docker.sh e2e/m6.spec.ts --update-snapshots=all
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

const FIXED = new Date('2026-11-20T10:15:00+08:00');
type V = { theme: 'light' | 'dark'; size: 100 | 200; lang: 'zh' | 'en' };
const LZ: V = { theme: 'light', size: 100, lang: 'zh' };
const VARIANTS: V[] = [LZ, { theme: 'dark', size: 100, lang: 'en' }, { theme: 'light', size: 200, lang: 'zh' }];
const name = (f: string, v: V) => `M6-${f}-${v.theme}-${v.size}-${v.lang}`;
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

async function open(page: Page, v: V, m6: string | null, opts: { path?: string; demo?: boolean } = {}) {
  await hermetic(page);
  await page.clock.setFixedTime(FIXED);
  await onboarded(page, { lang: v.lang, theme: v.theme, textSize: v.size === 200 ? 'xxlarge' : 'standard', motion: 'on' });
  const m = m6 === null ? '' : `&m6=${encodeURIComponent(m6)}`;
  await page.goto(`${opts.path ?? '/'}?${opts.demo ? 'demo=1&demoMs=100000' : 'mock=1'}${m}`);
  await page.waitForFunction(() => '__howtogo' in window);
}

const sheet = (page: Page, id: string) => page.evaluate((s) => (window as unknown as { __howtogo: { router: { openSheet(n: string): void } } }).__howtogo.router.openSheet(s), id);
const ctl = <T,>(page: Page, fn: string) => page.evaluate((f) => (window as unknown as { __m6: Record<string, () => T> }).__m6[f]!(), fn);

async function shot(page: Page, n: string) {
  await page.waitForTimeout(250);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
  // pictures are lazy chunks: wait until every one on screen has its SVG
  await page.waitForFunction(() => [...document.querySelectorAll('.igpic')].every((p) => p.querySelector('svg')));
  await expect(page).toHaveScreenshot(`${n}.png`);
}

/** No horizontal scroll, no target under 56 px in the open sheet / screen (6h shared rules). */
async function layoutOk(page: Page) {
  const r = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    const small = [...document.querySelectorAll<HTMLElement>('.sheet button, .sheet a, main button, main a')]
      .filter((e) => e.offsetParent && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 55.5)
      .map((e) => e.dataset.testid ?? e.textContent);
    return { hscroll: doc.scrollWidth > doc.clientWidth + 1, small };
  });
  expect(r.hscroll).toBe(false);
  expect(r.small).toEqual([]);
}

test.describe('A permission explainers (6h.2, 6h.3)', () => {
  for (const v of VARIANTS) {
    test(`A2 / A3-approx / A4 / A3-notify / A6 sheets ${v.theme} ${v.size} ${v.lang}`, async ({ page }) => {
      await open(page, v, 'loc:prompt,sdk:34');
      await sheet(page, 'loc-explain');
      await expect(page.getByTestId('sheet-loc-explain')).toContainText(v.lang === 'zh' ? '让我知道你在哪里' : 'Let me know where you are');
      await layoutOk(page);
      await shot(page, name('A2-explainer', v));
      await page.goBack();
      await sheet(page, 'loc-approx');
      await expect(page.getByTestId('sheet-loc-approx')).toContainText(v.lang === 'zh' ? '位置不够准' : 'Your location is only approximate');
      await shot(page, name('A3-approx', v));
      await page.goBack();
      await sheet(page, 'loc-denied');
      await expect(page.getByTestId('sheet-loc-denied')).toContainText(v.lang === 'zh' ? '手机没有让我看你的位置' : "Your phone isn't sharing your location");
      await shot(page, name('A4-denied', v));
      await page.goBack();
      await sheet(page, 'm6-notify');
      await expect(page.getByTestId('sheet-m6-notify')).toContainText(v.lang === 'zh' ? '到站前，在锁屏上提醒你' : 'Reminders on your lock screen');
      await layoutOk(page);
      await shot(page, name('A3-notify', v));
      await page.goBack();
      await sheet(page, 'm6-dnd');
      await expect(page.getByTestId('sheet-m6-dnd')).toContainText(v.lang === 'zh' ? '勿扰模式时，也提醒你下车？' : 'Remind you even in Do Not Disturb?');
      await shot(page, name('A6-dnd', v));
    });
  }

  test('A4 open settings → back with permission granted → toast, sheet closes', async ({ page }) => {
    await open(page, LZ, 'loc:blocked');
    await sheet(page, 'loc-denied');
    await page.getByTestId('loc-settings').click();
    expect(await page.evaluate(() => (window as unknown as { __m6: { opened: string[] } }).__m6.opened)).toEqual(['app']);
    await ctl(page, 'away');
    await page.evaluate(() => {
      const d = (window as unknown as { __m6: { device: Record<string, unknown> } }).__m6.device;
      Object.assign(d, { fineLocation: true, coarseLocation: true, locationState: 'granted' });
    });
    await ctl(page, 'back');
    await expect(page.getByTestId('sheet-loc-denied')).toHaveCount(0);
    await expect(page.getByText('好了，可以带你走了。')).toBeVisible();
  });

  test('A6 settings caption + native rows; web-only rows hidden in the app', async ({ page }) => {
    await open(page, LZ, 'dnd,notify:denied,loc:coarse', { path: '/settings' });
    await expect(page.getByTestId('row-battery-guide')).toContainText('还没设置');
    await expect(page.getByTestId('row-notify')).toContainText('关');
    await expect(page.getByTestId('row-loc-perm')).toContainText('只给了大概位置');
    await expect(page.getByTestId('dnd-caption')).toContainText('勿扰模式下可能没有声音。');
    await expect(page.getByTestId('row-install')).toHaveCount(0);
    await page.getByTestId('dnd-caption').scrollIntoViewIfNeeded();
    await shot(page, name('A6-settings-note', LZ));
  });
});

test.describe('B battery guide (6h.4)', () => {
  const BRANDS: [string, string, string][] = [
    ['google', 'Google', 'Google Pixel'],
    ['samsung', 'samsung', '三星 Samsung'],
    ['xiaomi', 'Xiaomi', '小米 / 红米 / POCO'],
    ['oppo', 'OnePlus', 'OPPO / realme / 一加 OnePlus'],
    ['vivo', 'vivo', 'vivo'],
    ['huawei', 'HONOR', '华为 / 荣耀'],
    ['generic', 'motorola', '其他手机'],
  ];
  for (const [id, manu, shown] of BRANDS) {
    test(`B1 ${id}`, async ({ page }) => {
      await open(page, LZ, `brand:${manu}`, { path: '/battery' });
      await expect(page.getByTestId('bg-brand')).toContainText(`你的手机：${shown}`);
      await layoutOk(page);
      await shot(page, name(`B1-${id}`, LZ));
    });
  }

  test('B1 dark / en / 200 % variants', async ({ page }) => {
    for (const v of VARIANTS.slice(1)) {
      await open(page, v, 'brand:Xiaomi', { path: '/battery' });
      await expect(page.getByTestId('bg-steps').locator('li')).toHaveCount(5);
      await layoutOk(page);
      await shot(page, name('B1-xiaomi', v));
    }
  });

  test('brand pick swaps the steps; open settings → B2 not yet → B2 ok with the Autostart caption', async ({ page }) => {
    await open(page, LZ, 'brand:samsung', { path: '/battery' });
    await page.getByTestId('bg-not-this').click();
    await expect(page.getByTestId('brand-samsung')).toHaveAttribute('aria-checked', 'true');
    await shot(page, name('B1-brandpick', LZ));
    await page.getByTestId('brand-vivo').click();
    await expect(page.getByTestId('bg-brand')).toHaveAttribute('data-brand', 'vivo');
    await page.getByTestId('bg-open').click();
    await ctl(page, 'away');
    await ctl(page, 'back');
    await expect(page.getByTestId('bg-notyet')).toHaveText('还没改好。可以再试一次，或者以后再说。');
    // 1.2.0: scroll to the end of the screen (the baseline's framing) - centring the note depended on picture-load timing.
    await page.getByTestId('bg-later').scrollIntoViewIfNeeded();
    await shot(page, name('B2-notyet', LZ));
    await page.getByTestId('bg-open').click();
    await ctl(page, 'away');
    await page.evaluate(() => ((window as unknown as { __m6: { device: { batteryUnrestricted: boolean } } }).__m6.device.batteryUnrestricted = true));
    await ctl(page, 'back');
    await expect(page.getByTestId('bg-ok')).toContainText('已设置好，锁屏时也能提醒你下车。');
    await expect(page.getByTestId('bg-ok')).toContainText('“自启动”这一项手机不告诉我，请你自己看一下。');
    await page.getByTestId('bg-done').scrollIntoViewIfNeeded();
    await shot(page, name('B2-ok', LZ));
    await page.getByTestId('bg-done').click();
    await expect(page.getByTestId('battery-guide')).toHaveCount(0);
  });

  test('B3 home bar after a kill → 去设置 opens B1', async ({ page }) => {
    await open(page, LZ, 'killed');
    await expect(page.getByTestId('b3-home')).toContainText('上次行程中，手机把怎么去关掉了。');
    await shot(page, name('B3-home', LZ));
    await page.getByTestId('b3-setup').click();
    await expect(page.getByTestId('battery-guide')).toBeVisible();
  });
});

test.describe('C1 no Chinese voice (6h.5)', () => {
  for (const v of [LZ, VARIANTS[2]!]) {
    test(`C1 sheet ${v.size}`, async ({ page }) => {
      await open(page, v, 'nozh');
      await sheet(page, 'm6-novoice');
      await expect(page.getByTestId('sheet-m6-novoice')).toContainText('这部手机没有中文语音');
      await layoutOk(page);
      await shot(page, name('C1-sheet', v));
    });
  }
});

test.describe('D update notice + Get-the-app card (6h.8)', () => {
  test('D1 on Home and Settings; tap opens /android?from= outside the app; ✕ hides it for the day', async ({ page }) => {
    await open(page, LZ, 'upd,v:1.2.0');
    await expect(page.getByTestId('d1-update')).toContainText('有新版本 1.3.0 · 去下载');
    await shot(page, name('D1-home', LZ));
    await page.getByTestId('d1-get').click();
    const urls = await page.evaluate(() => (window as unknown as { __m6: { urls: string[] } }).__m6.urls);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/android\?from=1\.2\.0$/);
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('d1-update')).toBeVisible();
    await expect(page.getByTestId('row-version-new')).toContainText('版本 1.2.0 · 有新版本');
    await shot(page, name('D1-settings', LZ));
    await page.getByTestId('d1-later').click();
    await expect(page.getByTestId('d1-update')).toHaveCount(0);
  });

  test('D2 card in Settings on Android Chrome only; 不用了 hides it for good', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: ANDROID_CHROME, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await open(page, LZ, null, { path: '/settings' });
    await expect(page.getByTestId('d2-card')).toContainText('下载安卓版 怎么去');
    await expect(page.getByTestId('d2-go')).toHaveAttribute('href', '/android');
    await shot(page, name('D2-settings', LZ));
    await page.getByTestId('d2-no').click();
    await expect(page.getByTestId('d2-card')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('settings-title').or(page.locator('h1'))).toBeVisible();
    await expect(page.getByTestId('d2-card')).toHaveCount(0);
    await ctx.close();
  });

  test('no D2 card on desktop / iOS, none inside the app', async ({ page }) => {
    await open(page, LZ, null, { path: '/settings' });
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByTestId('d2-card')).toHaveCount(0);
    await open(page, LZ, 'upd', { path: '/settings' });
    await expect(page.getByTestId('d2-card')).toHaveCount(0);
  });
});

test.describe('first use in the app (6h.10): A2 (my location), then Start: A3 → A6 → C1 → B1, then the trip', () => {
  test('each sheet once, in order; Back on B1 leaves the trip unstarted', async ({ page }) => {
    await open(page, LZ, 'loc:prompt,grant:precise,sdk:34,notify:default,dnd,nozh', { demo: true });
    await page.getByTestId('to-field').click();
    await page.getByTestId('search-input').fill('tan tock');
    await page.getByTestId('search-result-0').click();
    // A2 on the first use of "my location" (route options from here), never at launch
    await expect(page.getByTestId('sheet-loc-explain')).toBeVisible();
    await page.getByTestId('loc-ok').click();
    await page.getByTestId('route-option-0').click();
    await page.getByTestId('start-guide').click();
    await expect(page.getByTestId('sheet-m6-notify')).toBeVisible();
    await page.getByTestId('notify-ok').click();
    await expect(page.getByTestId('sheet-m6-dnd')).toBeVisible();
    await page.getByTestId('dnd-no').click();
    await expect(page.getByTestId('sheet-m6-novoice')).toBeVisible();
    await page.getByTestId('novoice-later').click();
    await expect(page.getByTestId('battery-guide')).toBeVisible();
    await page.getByTestId('back').click();
    await expect(page.getByTestId('start-guide')).toBeVisible();
    expect(await logOf(page)).toContain('m6:start-left');
    // second Start: only the battery guide is still due; 以后再说 starts the trip
    await page.getByTestId('start-guide').click();
    await expect(page.getByTestId('battery-guide')).toBeVisible();
    await page.getByTestId('bg-later').click();
    await expect(page.getByTestId('guide')).toBeVisible();
  });
});

// ------------------------------------------------------------------ Creative M6 review: missing baselines

/** Demo trip in the fake app: search → route → Start, dismissing whatever first-use sheet is due, until the guide. */
async function startTrip(page: Page) {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  const a2 = page.getByTestId('loc-ok');
  if (await a2.isVisible().catch(() => false)) await a2.click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  for (let i = 0; i < 6 && !(await page.getByTestId('guide').isVisible()); i++) {
    for (const id of ['notify-ok', 'dnd-no', 'novoice-later', 'bg-later']) {
      const b = page.getByTestId(id);
      if (await b.isVisible().catch(() => false)) await b.click();
    }
    await page.waitForTimeout(200);
  }
  await expect(page.getByTestId('guide')).toBeVisible();
}

test.describe('H5 trip notes in the app (6h.3 A5, 6h.4 B3, 6h.5 C1)', () => {
  const cases: [string, string, string][] = [
    ['A5-h5-note', 'notify:denied,battery', 'notify-denied'],
    ['B3-h5', 'notify:granted,battery,killed', 'killed'],
    ['C1-h5-note', 'notify:granted,battery,nozh', 'novoice'],
  ];
  for (const [id, spec, note] of cases) {
    // C1 is a zh-trip note (no Chinese voice → speaking English), so its second variant stays zh
    for (const v of [LZ, { theme: 'dark', size: 200, lang: id.startsWith('C1') ? 'zh' : 'en' } as V]) {
      test(`${id} ${v.theme} ${v.size} ${v.lang}`, async ({ page }) => {
        await open(page, v, spec, { demo: true });
        await startTrip(page);
        const el = page.locator(`[data-note="${note}"]`);
        await expect(el).toBeVisible();
        // ✕ sits top-right beside the text (Creative fix 3): its top is level with the note's first line
        const box = await el.boundingBox();
        const x = await el.locator('.iconbtn').first().boundingBox();
        expect(x && box && x.y - box.y).toBeLessThan(24);
        await layoutOk(page);
        await shot(page, name(id, v));
      });
    }
  }
});

test.describe('C2 WebView too old (6h.6), wvcheck.js on https://localhost', () => {
  for (const v of [LZ, { theme: 'dark', size: 100, lang: 'en' } as V]) {
    test(`C2 ${v.theme} ${v.lang}`, async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        serviceWorkers: 'block',
        colorScheme: v.theme,
        locale: v.lang === 'zh' ? 'zh-CN' : 'en-SG',
        userAgent: 'Mozilla/5.0 (Linux; Android 9; SM-J600G Build/PPR1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/86.0.4240.99 Mobile Safari/537.36',
      });
      const page = await ctx.newPage();
      await page.route('https://localhost/**', async (route) => {
        const u = new URL(route.request().url());
        route.fulfill({ response: await page.request.fetch(baseURL + u.pathname + u.search) });
      });
      await page.route(/^(?!https:\/\/localhost\/).*/, (r) => r.abort());
      await page.goto('https://localhost/');
      await page.waitForFunction(() => (window as unknown as { __howtogoWvOld?: boolean }).__howtogoWvOld === true);
      await expect(page.locator('body')).toContainText(v.lang === 'zh' ? '请先更新手机上的一个部件' : 'Please update one part of your phone');
      await page.waitForTimeout(250);
      await expect(page).toHaveScreenshot(`${name('C2-webview', v)}.png`);
      await ctx.close();
    });
  }
});
