/**
 * M5 UI round part 2 (STYLE-GUIDE 6f.3 L3, 6f.4 L4, 6f.6 L6): behaviour + screenshot baselines
 * `M5-L{n}-{state}-{theme}-{size}-{lang}` at 390×844 (deviceScaleFactor 1 like the other dev baselines), hermetic.
 * Re-record: qa/scripts/dev-e2e-docker.sh e2e/m5-ui2.spec.ts --update-snapshots=all
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

const FIXED = new Date('2026-11-18T10:15:00+08:00');
type V = { theme: 'light' | 'dark'; size: 100 | 200; lang: 'zh' | 'en' };
const LZ: V = { theme: 'light', size: 100, lang: 'zh' };
const name = (f: string, v: V) => `${f}-${v.theme}-${v.size}-${v.lang}`;
const PLACES = {
  home: { name: '大巴窑 1 巷 123 座', lat: 1.3332, lng: 103.8466 },
  others: [{ name: 'Toa Payoh Polyclinic', label: '诊所', lat: 1.3346, lng: 103.8497 }],
};
const MEI = { name: '美玲', relation: 'daughter', phone: '+6591234567', callMe: '妈妈', lang: 'zh' };
const RECENTS = [{ to: { name: 'Bishan MRT', lat: 1.3511, lng: 103.8485 }, date: '2026-11-17', done: true }];

const UA = {
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15',
  waAndroid:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36 WhatsApp/2.23.24.76',
  lineIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.1.0',
};

test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

async function open(page: Page, v: V, opts: { q?: string; install?: unknown; recents?: boolean; path?: string; mock?: boolean } = {}) {
  await hermetic(page);
  await page.clock.setFixedTime(FIXED);
  await onboarded(page, { lang: v.lang, theme: v.theme, textSize: v.size === 200 ? 'xxlarge' : 'standard', motion: 'on' });
  await page.addInitScript(
    ([places, recents, install]) => {
      localStorage.setItem('howtogo.places', JSON.stringify(places));
      if (recents) localStorage.setItem('howtogo.recents.v2', JSON.stringify(recents));
      if (install) localStorage.setItem('howtogo.install.v1', JSON.stringify(install));
    },
    [PLACES, opts.recents ? RECENTS : null, opts.install ?? null] as const,
  );
  // `mock`: the real web platform (with clearPermissions(), nothing is located before the test goes offline).
  await page.goto(`${opts.path ?? '/'}?${opts.mock ? 'mock=1' : 'demo=1&demoMs=100000'}${opts.q ?? ''}`);
  await page.waitForFunction(() => '__howtogo' in window);
}

/** Service workers are blocked here: load the lazy chunks the SW would have precached, then go offline. */
async function goOffline(page: Page) {
  await page.evaluate(() => (window as unknown as { __howtogoPreload: () => Promise<unknown> }).__howtogoPreload());
  await page.context().setOffline(true);
}

/** H1 → search → H3 route options (demo fixtures). */
async function toRoutes(page: Page) {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
}

/** Chrome's install prompt, captured by the app (accepted unless told otherwise). */
const firePrompt = (page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') =>
  page.evaluate((o) => {
    const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = async () => {};
    e.userChoice = Promise.resolve({ outcome: o });
    dispatchEvent(e);
  }, outcome);

async function shot(page: Page, n: string) {
  await page.waitForTimeout(200);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
  await expect(page).toHaveScreenshot(`${n}.png`);
}

test.describe('L3 update bar', () => {
  test('waiting → updating → slow; ✕ hides it until the next launch', async ({ page }) => {
    await open(page, LZ, { q: '&upd=1' });
    const bar = page.getByTestId('update-banner');
    await expect(bar).toHaveAttribute('data-phase', 'waiting');
    await expect(page.getByTestId('sw-update')).toHaveAccessibleName('有新版本，按一下更新');
    await expect(bar).toContainText('有新版本 · 点这里更新');
    await shot(page, name('M5-L3-bar-home', LZ));
    await page.getByTestId('sw-update').click();
    await expect(bar).toHaveAttribute('data-phase', 'updating');
    await expect(bar).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('update-later')).toHaveCount(0);
    await shot(page, name('M5-L3-updating', LZ));
    // No new service worker took control within 10 s → the calm "next time" line, ✕ back, no retry loop.
    await expect(bar).toHaveAttribute('data-phase', 'slow', { timeout: 15_000 });
    await expect(bar).toContainText('这次没更新好，下次打开时会自动更新。');
    await shot(page, name('M5-L3-slow', LZ));
    await page.getByTestId('update-later').click();
    await expect(bar).toHaveCount(0);
  });

  for (const v of [{ theme: 'dark', size: 200, lang: 'en' }] as V[]) {
    test(`bar ${v.theme} ${v.size} ${v.lang}`, async ({ page }) => {
      await open(page, v, { q: '&upd=1' });
      await expect(page.getByTestId('update-banner')).toContainText('New version · tap to update');
      await shot(page, name('M5-L3-bar-home', v));
    });
  }

  test('Settings: the bar sits at the top of the list, under the title', async ({ page }) => {
    await open(page, LZ, { q: '&upd=1', path: '/settings' });
    const bar = page.getByTestId('update-banner');
    await expect(bar).toHaveAttribute('data-phase', 'waiting');
    await expect(page.getByTestId('sw-update')).toHaveAccessibleName('有新版本，按一下更新');
    // First thing after the h1, above the first group heading (6f.3: "Settings (top of the list)").
    const order = await page.locator('main').evaluate((m) => [...m.children].map((c) => c.getAttribute('data-testid') ?? c.tagName.toLowerCase()));
    expect(order.slice(0, 2)).toEqual(['h1', 'update-banner']);
    await shot(page, name('M5-L3-bar-settings', LZ));
    await page.getByTestId('update-later').click();
    await expect(bar).toHaveCount(0);
  });

  test('never during a trip: no bar on the guidance screen', async ({ page }) => {
    await open(page, LZ, { q: '&upd=1' });
    await expect(page.getByTestId('update-banner')).toBeVisible();
    await toRoutes(page);
    await page.getByTestId('route-option-0').click();
    await page.getByTestId('start-guide').click();
    await expect(page.getByTestId('guide')).toBeVisible();
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
  });
});

test.describe("L3 What's new", () => {
  for (const v of [LZ, { theme: 'light', size: 100, lang: 'en' }] as V[]) {
    test(`sheet ${v.lang}`, async ({ page }) => {
      await open(page, v, { q: '&whatsnew=1' });
      const sheet = page.getByTestId('sheet-whatsnew');
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(v.lang === 'zh' ? '怎么去? 1.0 来了' : '怎么去? 1.0 is here');
      await expect(sheet.locator('li')).toHaveCount(3);
      await expect(page.getByTestId('sheet-close')).toHaveCount(0); // one action only
      await expect(page.locator('#whatsnew-title')).toBeFocused();
      await shot(page, name('M5-L3-whatsnew', v));
      await page.getByTestId('whatsnew-ok').click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId('to-field')).toBeFocused();
      expect(await page.evaluate(() => localStorage.getItem('howtogo.whatsnew.v1'))).toBe('seen');
      expect(await logOf(page)).toContain('whatsnew:shown');
    });
  }
});

test.describe('L4a Android install card', () => {
  test('appears after the 2nd completed route view; Add → native prompt → gone', async ({ page }) => {
    await open(page, LZ, { install: { views: 1, dismissals: 0, hiddenUntil: 0 }, recents: true });
    await firePrompt(page);
    await expect(page.getByTestId('install-card')).toHaveCount(0);
    await toRoutes(page);
    await page.getByTestId('back').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/routes'));
    if (new URL(page.url()).pathname.startsWith('/search')) await page.getByTestId('back').click();
    await expect(page.getByTestId('greeting')).toBeVisible();
    const card = page.getByTestId('install-card');
    await expect(card).toHaveAttribute('data-variant', 'android-prompt');
    await expect(card).toContainText('把 怎么去? 放到主屏幕');
    // Placement: under the place tiles, above Recent.
    const [tiles, c, recent] = await Promise.all(['.tiles', '[data-testid="install-card"]', '[data-testid="recent-trips"]'].map((s) => page.locator(s).boundingBox()));
    expect(c!.y).toBeGreaterThan(tiles!.y + tiles!.height - 1);
    expect(recent!.y).toBeGreaterThan(c!.y + c!.height - 1);
    await card.scrollIntoViewIfNeeded();
    await shot(page, name('M5-L4a-card', LZ));
    await page.getByTestId('install-go').click();
    await expect(card).toHaveCount(0);
    expect(await logOf(page)).toEqual(expect.arrayContaining(['install:shown', 'install:accepted']));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.install.v1')!).installed)).toBe(true);
  });

  test('second showing: Settings caption; second dismissal = never again', async ({ page }) => {
    await open(page, LZ, { install: { views: 5, dismissals: 1, hiddenUntil: 0 }, recents: true });
    await firePrompt(page);
    const card = page.getByTestId('install-card');
    await expect(card).toContainText('以后也可以在设置里安装。');
    await card.scrollIntoViewIfNeeded();
    await shot(page, name('M5-L4a-card-second', LZ));
    await page.getByTestId('install-later').click();
    await expect(card).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.install.v1')!).dismissals)).toBe(2);
  });

  test('no captured prompt: Show me how → the F6 install steps', async ({ page }) => {
    await open(page, LZ, { install: { views: 2, dismissals: 0, hiddenUntil: 0 } });
    await expect(page.getByTestId('install-card')).toHaveAttribute('data-variant', 'android-steps');
    await page.getByTestId('install-go').click();
    await expect(page.getByTestId('sheet-install')).toBeVisible();
  });

  test('dismissed prompt counts as a dismissal (hidden 14 days)', async ({ page }) => {
    await open(page, LZ, { install: { views: 2, dismissals: 0, hiddenUntil: 0 } });
    await firePrompt(page, 'dismissed');
    await page.getByTestId('install-go').click();
    await expect(page.getByTestId('install-card')).toHaveCount(0);
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.install.v1')!));
    expect(s.dismissals).toBe(1);
    expect(s.hiddenUntil - FIXED.getTime()).toBe(14 * 24 * 3600_000);
  });
});

test.describe('L4b iOS Safari', () => {
  test.use({ userAgent: UA.safari });
  test('card → three-step picture guide', async ({ page }) => {
    await open(page, LZ, { install: { views: 2, dismissals: 0, hiddenUntil: 0 } });
    const card = page.getByTestId('install-card');
    await expect(card).toHaveAttribute('data-variant', 'ios-guide');
    await card.scrollIntoViewIfNeeded();
    await shot(page, name('M5-L4b-card', LZ));
    await page.getByTestId('install-go').click();
    const sheet = page.getByTestId('sheet-install-guide');
    await expect(sheet.locator('ol > li')).toHaveCount(3);
    await expect(sheet.locator('.igpic svg')).toHaveCount(3);
    await expect(sheet).toContainText('看不到？先按右下角的“⋯”。');
    await shot(page, name('M5-L4b-guide', LZ));
    await page.getByTestId('guide-ok').click();
    await expect(sheet).toHaveCount(0);
    await expect(card).toBeVisible(); // "OK, got it" is not a dismissal
  });
});

test.describe('L4b iOS Chrome', () => {
  test.use({ userAgent: UA.chromeIos });
  test('guide with the Chrome share position', async ({ page }) => {
    await open(page, LZ, { install: { views: 2, dismissals: 0, hiddenUntil: 0 } });
    await page.getByTestId('install-go').click();
    const sheet = page.getByTestId('sheet-install-guide');
    await expect(sheet).toContainText('分享按钮在网址栏的右边。');
    await shot(page, name('M5-L4b-guide-chrome', LZ));
  });
});

test.describe('L4c other iOS browsers', () => {
  test.use({ userAgent: UA.firefoxIos });
  test('Open in Safari: copy the site root', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, LZ, { install: { views: 2, dismissals: 0, hiddenUntil: 0 } });
    const card = page.getByTestId('install-card');
    await expect(card).toHaveAttribute('data-variant', 'ios-safari');
    await expect(card).toContainText('在 iPhone 上，要用 Safari 才能放到主屏幕。');
    await card.scrollIntoViewIfNeeded();
    await shot(page, name('M5-L4c-safari', LZ));
    await page.getByTestId('install-go').click();
    await expect(page.getByTestId('toast-copied')).toContainText('打开 Safari');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(new URL(page.url()).origin + '/');
  });
});

test.describe('L4d in-app browser, Android', () => {
  test.use({ userAgent: UA.waAndroid });
  test('band at the top; Open in Chrome, then Copy link if still here', async ({ page }) => {
    await open(page, LZ, { install: { views: 9, dismissals: 0, hiddenUntil: 0 } });
    const bar = page.getByRole('region', { name: '打开方式' });
    await expect(bar).toContainText('在浏览器里打开会更好用');
    await expect(page.getByTestId('install-card')).toHaveCount(0); // the band speaks instead
    await shot(page, name('M5-L4d-android', LZ));
    await page.getByTestId('iab-chrome').click();
    await expect(page.getByTestId('iab-copy')).toBeVisible({ timeout: 5000 });
    expect(await logOf(page)).toContain('install:accepted');
    await page.getByTestId('iab-later').click();
    await expect(page.getByTestId('iab-bar')).toHaveCount(0);
    await page.reload();
    await page.waitForFunction(() => '__howtogo' in window);
    await expect(page.getByTestId('iab-bar')).toHaveCount(0); // hidden for the session
  });
});

test.describe('L4d in-app browser, iOS', () => {
  test.use({ userAgent: UA.lineIos });
  test('band → How? sheet', async ({ page }) => {
    await open(page, LZ);
    await expect(page.getByTestId('iab-bar')).toHaveAttribute('data-os', 'ios');
    await shot(page, name('M5-L4d-ios', LZ));
    await page.getByTestId('iab-how').click();
    const sheet = page.getByTestId('sheet-iab-help');
    await expect(sheet).toContainText('没有这个选项？');
    await shot(page, name('M5-L4d-ios-sheet', LZ));
  });
});

test.describe('L6 offline cold start', () => {
  for (const v of [LZ, { theme: 'light', size: 200, lang: 'zh' }] as V[]) {
    test(`Home says 需要网络 and does not navigate (${v.size})`, async ({ page, context }) => {
      await open(page, v, { recents: true });
      await goOffline(page);
      await expect(page.getByTestId('offline-notice')).toBeVisible();
      await expect(page.getByTestId('tile-home')).toHaveAccessibleName(/需要网络$/);
      await expect(page.getByTestId('take-me-home')).toContainText('需要网络');
      await expect(page.getByTestId('recent-0')).toContainText('需要网络');
      await expect(page.getByTestId('to-field')).toContainText('需要网络');
      if (v.size === 100) await shot(page, name('M5-L6-home-offline', v));
      else {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        expect(overflow).toBe(false);
      }
      await page.getByTestId('tile-home').click();
      await page.getByTestId('take-me-home').click();
      await page.getByTestId('recent-0').click();
      await expect(page).toHaveURL(/\/(\?.*)?$/);
      await expect(page.getByTestId('live')).toHaveText('需要网络。连上网络以后再按。');
      // The search button still opens H2 (F4 offline there).
      await page.getByTestId('to-field').click();
      await expect(page).toHaveURL(/\/search/);
      await page.getByTestId('back').click();
      await context.setOffline(false);
      await expect(page.getByTestId('needs-net')).toHaveCount(0);
    });
  }

  test('Help sheet offline: call family, Show the driver and 995 stay; Take me home and Where am I say 需要网络', async ({ page, context }) => {
    await page.addInitScript((c) => localStorage.setItem('howtogo.family.v1', JSON.stringify(c)), [MEI]);
    await page.context().clearPermissions(); // a cold start: nothing has been located yet
    await open(page, LZ, { mock: true });
    await goOffline(page);
    await page.getByTestId('nav-help').click();
    const sheet = page.getByTestId('sheet-help');
    await expect(sheet).toBeVisible();
    // Works offline: no caption on these.
    for (const id of ['help-call', 'help-driver']) await expect(page.getByTestId(id).getByTestId('needs-net')).toHaveCount(0);
    await expect(page.getByTestId('help-995')).toBeVisible();
    // Need the network (M4 AC 38 wording): the caption is part of the row's name.
    await expect(page.getByTestId('help-home')).toHaveAccessibleName(/需要网络/);
    await expect(page.getByTestId('help-where')).toHaveAccessibleName(/需要网络/); // no last known address yet
    await expect(page.getByTestId('help-share-loc')).toContainText('需要网络');
    await shot(page, name('M5-L6-help-offline', LZ));
    // Take me home offline: no navigation, the polite line instead.
    await page.getByTestId('help-home').click();
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('live')).toHaveText('需要网络。连上网络以后再按。');
    await context.setOffline(false);
    await expect(sheet.getByTestId('needs-net')).toHaveCount(0);
  });

  test('Show the driver, cold offline: Home works; 我在哪里 says there is no address; taxis say 需要网络', async ({ page }) => {
    await page.addInitScript((c) => localStorage.setItem('howtogo.family.v1', JSON.stringify(c)), [MEI]);
    await page.context().clearPermissions(); // a cold start: nothing has been located yet
    await open(page, LZ, { mock: true });
    await goOffline(page);
    await page.getByTestId('nav-help').click();
    await page.getByTestId('help-where').click();
    await expect(page.getByTestId('here-none')).toHaveText('现在找不到地址。可以给司机看你家的地址。');
    await expect(page.getByTestId('driver-card')).toHaveCount(0);
    await expect(page.getByTestId('sheet-driver')).not.toContainText('正在');
    // The Home tab is the driver card itself: fully offline.
    await page.getByTestId('driver-tab-home').click();
    await expect(page.getByTestId('driver-card')).toContainText('大巴窑 1 巷 123 座');
    // Taxi hand-off needs the network: captioned, and a tap stays here.
    await expect(page.getByTestId('taxi-grab')).toHaveAccessibleName(/需要网络/);
    await expect(page.getByTestId('taxi-cdg')).toHaveAccessibleName(/需要网络/);
    await page.getByTestId('taxi-cdg').click();
    await expect(page.getByTestId('live')).toHaveText('需要网络。连上网络以后再按。');
    await expect(page.getByTestId('sheet-driver')).toBeVisible();
    await shot(page, name('M5-L6-driver-offline', LZ));
  });

  test('Show the driver offline after a fix: 我在哪里 keeps the last known address, with its time', async ({ page, context }) => {
    await open(page, LZ);
    // Home located the demo position online (address found), then the network goes.
    await page.waitForFunction(() => (window as unknown as { __howtogoLog: string[] }).__howtogoLog.includes('api:revgeocode 200'));
    await goOffline(page);
    await page.getByTestId('nav-help').click();
    await expect(page.getByTestId('help-where').getByTestId('needs-net')).toHaveCount(0);
    await page.getByTestId('help-where').click();
    await expect(page.getByTestId('driver-card')).toContainText('Toa Payoh');
    await expect(page.getByTestId('here-at')).toHaveText(/^这是 .*10:15 的位置。$/);
    await expect(page.getByTestId('here-none')).toHaveCount(0);
    await context.setOffline(false);
    await expect(page.getByTestId('here-at')).toHaveCount(0);
  });

  test('H3 options: cards say 需要网络 and stay put offline', async ({ page, context }) => {
    await open(page, LZ);
    await toRoutes(page);
    await goOffline(page);
    await expect(page.getByTestId('route-option-0')).toContainText('需要网络');
    await page.getByTestId('route-option-0').click();
    await expect(page).toHaveURL(/\/routes/);
    await context.setOffline(false);
    await expect(page.getByTestId('needs-net')).toHaveCount(0);
  });
});
