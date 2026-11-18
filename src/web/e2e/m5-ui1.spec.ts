/**
 * M5 UI round part 1 (STYLE-GUIDE §6f L1, L2, L5, L7, L8, 6f.11): behaviour + screenshot baselines
 * `M5-…-{theme}-{size}-{lang}` at 390×844, deviceScaleFactor 1, hermetic (fonts/tiles stubbed, time fixed).
 * Re-record only these: `qa/scripts/dev-e2e-docker.sh e2e/m5-ui1.spec.ts --update-snapshots=all -g M5-`.
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

type W = Window & { __howtogo: any; __howtogoLog: string[] };
const FIXED = new Date('2026-11-18T10:15:00+08:00');
type Size = 85 | 100 | 200;
type V = { theme: 'light' | 'dark'; size: Size; lang: 'zh' | 'en' };
const LZ: V = { theme: 'light', size: 100, lang: 'zh' };
const SIZE = { 85: 'small', 100: 'standard', 200: 'xxlarge' } as const;
const HOME = { home: { name: 'Toa Payoh Central', address: 'Toa Payoh Central Singapore 310177', lat: 1.33465, lng: 103.8491 }, others: [] };

test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

async function open(page: Page, v: V, path = '/?demo=1&demoMs=100000') {
  await hermetic(page);
  await page.clock.setFixedTime(FIXED);
  await onboarded(page, { lang: v.lang, theme: v.theme, textSize: SIZE[v.size], motion: 'on' });
  await page.addInitScript((p) => {
    localStorage.getItem('howtogo.places') || localStorage.setItem('howtogo.places', JSON.stringify(p));
    speechSynthesis.getVoices = () => [{ lang: 'zh-CN' }, { lang: 'en-SG' }] as SpeechSynthesisVoice[];
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => void setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 5);
    Object.defineProperty(SpeechSynthesisUtterance.prototype, 'voice', { configurable: true, get: () => null, set: () => {} });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => Promise.resolve({ release: () => Promise.resolve(), addEventListener() {} }) } });
  }, HOME);
  await page.goto(path);
  await page.waitForFunction(() => '__howtogo' in window);
}
const name = (f: string, v: V) => `M5-${f}-${v.theme}-${v.size}-${v.lang}`;
async function shot(page: Page, n: string, opts: { el?: string; full?: boolean } = {}) {
  await page.waitForTimeout(200);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
  await page.addStyleTag({ content: '.mapcanvas canvas, .attribhost, .mapbox .maplibregl-canvas { visibility: hidden !important }' });
  const mask = [page.locator('img, [data-testid=about-version]')];
  if (opts.el) await expect(page.locator(opts.el).first()).toHaveScreenshot(`${n}.png`, { mask });
  else await expect(page).toHaveScreenshot(`${n}.png`, { mask, fullPage: !!opts.full });
}
async function start(page: Page, q: string) {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(q);
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
}
async function runUntil(page: Page, line: string) {
  await page.evaluate(async (l) => {
    const w = window as unknown as W;
    for (let i = 0; i < 4000 && !w.__howtogoLog.includes(l); i++) {
      if (!w.__howtogo.platform.fake.step()) break;
      if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }, line);
}
const noHScroll = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.scroll, body')].every((e) => e.scrollWidth <= e.clientWidth + 1));
const battery = (page: Page, r: { supported: boolean; level: number | null; charging: boolean | null }) =>
  page.evaluate((x) => (window as unknown as W).__howtogo.platform.fake.setBattery(x), r);

// ------------------------------------------------------------------ L1 Privacy
test.describe('L1 privacy page', () => {
  test('one h1, five h2, glance list, contact line, footer with version; Report opens the sheet', async ({ page }) => {
    await open(page, LZ, '/settings?demo=1');
    await page.getByTestId('row-privacy').click();
    await expect(page.getByTestId('privacy-page')).toBeVisible();
    await expect(page.locator('.screen h1')).toHaveCount(1);
    await expect(page.locator('.screen h1')).toHaveText('隐私说明');
    await expect(page.locator('.pv h2')).toHaveCount(5);
    await expect(page.getByRole('list', { name: '一眼看懂' })).toBeVisible();
    await expect(page.getByTestId('pv-footer')).toHaveText(/^说明版本 1 · 2026年11月18日（怎么去\? \d+\.\d+\.\d+）$/);
    await expect(page.getByTestId('pv-contact')).toHaveText('有问题？用设置里的 报告问题。');
    expect(await page.locator('.pv').innerText()).not.toMatch(/@\w/);
    await page.getByTestId('pv-report').click();
    await expect(page.getByTestId('sheet-report')).toBeVisible();
    await page.goBack();
    await page.getByTestId('back').click();
    await expect(page).toHaveURL(/\/settings(\?|$)/);
    expect(await noHScroll(page)).toBe(true);
  });

  test('from the family page or /setup: ?lang=en, Back = history.back(); opened alone: "Open 怎么去?"', async ({ page }) => {
    await open(page, { ...LZ, lang: 'en' }, '/privacy?demo=1');
    await expect(page.getByTestId('pv-open')).toHaveText('Open 怎么去?');
    await page.goto('/privacy?lang=en&demo=1');
    await expect(page.locator('.screen h1')).toHaveText('Privacy');
    await expect(page.getByTestId('privacy-page')).toHaveAttribute('lang', 'en');
    await page.goto('/setup?demo=1');
    await page.getByTestId('w-privacy').click();
    await expect(page).toHaveURL(/\/privacy\?lang=en$/);
    await page.getByTestId('back').click();
    await expect(page).toHaveURL(/\/setup\?demo=1$/);
  });

  test('Delete all in the privacy text goes to Settings → the delete sheet', async ({ page }) => {
    await open(page, LZ, '/privacy?lang=zh&demo=1');
    await page.getByTestId('pv-delete').click();
    await expect(page).toHaveURL(/\/settings(\?|$)/);
    await expect(page.getByTestId('sheet-delete-all')).toBeVisible();
  });

  for (const v of [LZ, { ...LZ, theme: 'dark' } as V, { ...LZ, lang: 'en' } as V, { ...LZ, size: 200 } as V])
    test(`${name('L1-top', v)}`, async ({ page }) => {
      await open(page, v, '/privacy?demo=1');
      await shot(page, name('L1-top', v));
    });
  for (const v of [LZ, { ...LZ, lang: 'en' } as V])
    test(`${name('L1-full', v)}`, async ({ page }) => {
      await open(page, v, '/privacy?demo=1');
      // Full page: let the page (not the inner scroller) grow with its content.
      await page.addStyleTag({ content: 'html,body,#app,.stage,.screen{height:auto!important;overflow:visible!important} .scroll{overflow:visible!important}' });
      await shot(page, name('L1-full', v), { full: true });
    });
});

// ------------------------------------------------------------------ L2 About
test.describe('L2 About', () => {
  test('version (build date), attribution, LTA line with the data date, privacy row → L1, report row', async ({ page }) => {
    await open(page, LZ, '/about?demo=1');
    await expect(page.getByTestId('about-version')).toHaveText(/^版本 \d+\.\d+\.\d+（\d{4}年\d{1,2}月\d{1,2}日）$/);
    await expect(page.getByTestId('about-attrib')).toContainText('Map data © contributors, Singapore Land Authority');
    await expect(page.getByTestId('about-lta')).toContainText(/accessed on \d{1,2} [A-Z][a-z]+ \d{4} which/);
    const logo = page.locator('[data-testid=about-attrib] img');
    await expect(logo).toHaveAttribute('alt', 'OneMap');
    // Creative M5 review fix 10: self-hosted (works offline), never hotlinked.
    await expect(logo).toHaveAttribute('srcset', /onemap-logo@2x[\w-]*\.png 2x/);
    await expect(logo).not.toHaveAttribute('src', /onemap\.gov\.sg/);
    await expect.poll(() => logo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    // Creative M5 review fix 10: the About seal is 72 px.
    expect((await page.locator('main .wordmark svg').boundingBox())!.height).toBe(72);
    expect((await logo.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await expect(page.getByTestId('about-sample')).toHaveCount(0);
    await expect(page.locator('a[href$="licenses.txt"]')).toHaveCount(0);
    await page.getByTestId('about-privacy').click();
    await expect(page.getByTestId('privacy-page')).toBeVisible();
    await page.getByTestId('back').click();
    await page.getByTestId('about-report').click();
    await expect(page.getByTestId('sheet-report')).toBeVisible();
  });
  for (const v of [LZ, { ...LZ, theme: 'dark', lang: 'en' } as V])
    test(`${name('L2-live', v)}`, async ({ page }) => {
      await open(page, v, '/about?demo=1');
      await shot(page, name('L2-live', v));
    });
  test(name('L2-sample', LZ), async ({ page }) => {
    await open(page, LZ, '/about?demo=1&sample=1');
    await expect(page.getByTestId('about-sample')).toHaveText('现在是示范路线，不是真的巴士和地铁资料。');
    await shot(page, name('L2-sample', LZ));
  });
});

// ------------------------------------------------------------------ L7 Settings
test.describe('L7 Settings', () => {
  test('group order Me · Display · Travel · Privacy · This app; error counts on by default; off drops queued counts', async ({ page }) => {
    await open(page, LZ, '/settings?demo=1');
    await expect(page.locator('main h2.grp')).toHaveText(['我', '看和听', '出行', '隐私', '这个应用']);
    const sw = page.getByTestId('set-errors');
    await expect(sw).toHaveAttribute('role', 'switch');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(sw).toHaveAccessibleName(/发送匿名错误统计/);
    await expect(sw).toHaveAccessibleDescription(/只发"哪种问题、几次"/);
    await page.evaluate(() => localStorage.setItem('howtogo.telemetry.v1', JSON.stringify({ day: '2026-11-18', sent: 0, lastAt: 0, rows: [{ v: '0', code: 'js_error', screen: 'home', n: 1 }] })));
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.settings')!).errorCounts)).toBe(false);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('howtogo.telemetry.v1'))).toBeNull();
    const more = page.getByTestId('set-errors-more');
    expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    await more.click();
    await expect(page).toHaveURL(/\/privacy\?s=sent$/);
    await expect(page.locator('#pv-h2')).toBeInViewport();
  });
  for (const v of [LZ, { ...LZ, lang: 'en' } as V, { ...LZ, theme: 'dark' } as V, { ...LZ, size: 200 } as V])
    test(`${name('L7-settings', v)}`, async ({ page }) => {
      await open(page, v, '/settings?demo=1');
      await page.addStyleTag({ content: 'html,body,#app,.stage,.screen{height:auto!important;overflow:visible!important} .scroll{overflow:visible!important}' });
      await shot(page, name('L7-settings', v), { full: true });
    });
  test(name('L7-errors-off', LZ), async ({ page }) => {
    await open(page, LZ, '/settings?demo=1');
    await page.getByTestId('set-errors').click();
    await page.getByTestId('row-errors').scrollIntoViewIfNeeded();
    await shot(page, name('L7-errors-off', LZ), { el: '[data-testid=row-errors]' });
  });
});

// ------------------------------------------------------------------ L5 battery saver
test.describe('L5 battery saver', () => {
  test('row value follows the state; sheet Auto/On/Off; unsupported line; changes apply at once', async ({ page }) => {
    await open(page, LZ, '/settings?demo=1');
    const row = page.getByTestId('row-battery');
    await expect(row).toContainText('省电模式');
    await expect(row).toContainText('自动');
    await battery(page, { supported: true, level: 0.15, charging: false });
    await expect(row).toContainText('自动（现在开着）');
    await battery(page, { supported: false, level: null, charging: null });
    await expect(row).toContainText('自动（这部手机不支持）');
    await row.click();
    await expect(page.getByTestId('battery-auto-sub')).toHaveText('这部手机不能告诉我电量，所以"自动"不会打开省电。需要时请选"开"。');
    await expect(page.getByRole('radiogroup')).toBeVisible();
    await page.getByTestId('battery-on').click();
    await expect(page.getByTestId('battery-on')).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.settings')!).batterySaver)).toBe('on');
    for (const b of await page.locator('[role=radio]').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  });

  test('H5 leaf chip: Auto turns on mid-trip → chip + one polite line; charging removes it; pocket line', async ({ page }) => {
    await open(page, LZ);
    await start(page, 'tan tock');
    await expect(page.getByTestId('leaf-chip')).toHaveCount(0);
    await battery(page, { supported: true, level: 0.15, charging: false });
    await expect(page.getByTestId('leaf-chip')).toHaveText('省电模式');
    await expect(page.getByTestId('live')).toHaveText('电量低了，已经打开省电模式。下车提醒照样会响。');
    expect(await logOf(page)).toContain('battery:saver on');
    await expect(page.getByTestId('leaf-chip')).not.toHaveAttribute('tabindex', /.*/);
    await page.getByTestId('pocket-btn').click();
    await expect(page.getByTestId('pocket-saver')).toHaveText('省电模式');
    await battery(page, { supported: true, level: 0.15, charging: true });
    await expect(page.getByTestId('pocket-saver')).toHaveCount(0);
  });

  for (const v of [LZ, { ...LZ, theme: 'dark', lang: 'en' } as V])
    test(`${name('L5-sheet', v)}`, async ({ page }) => {
      await open(page, v, '/settings?demo=1');
      await page.getByTestId('row-battery').click();
      await shot(page, name('L5-sheet', v));
    });
  test(name('L5-sheet-unsupported', LZ), async ({ page }) => {
    await open(page, LZ, '/settings?demo=1');
    await battery(page, { supported: false, level: null, charging: null });
    await page.getByTestId('row-battery').click();
    await shot(page, name('L5-sheet-unsupported', LZ));
  });
  test(name('L5-row', LZ), async ({ page }) => {
    await open(page, LZ, '/settings?demo=1');
    await page.getByTestId('row-battery').scrollIntoViewIfNeeded();
    await shot(page, name('L5-row', LZ), { el: '[data-testid=row-battery]' });
  });
  for (const v of [LZ, { ...LZ, size: 200 } as V])
    test(`${name('L5-h5-chip', v)}`, async ({ page }) => {
      await open(page, v);
      await battery(page, { supported: true, level: 0.15, charging: false });
      await start(page, 'tan tock');
      await expect(page.getByTestId('leaf-chip')).toBeVisible();
      await shot(page, name('L5-h5-chip', v), { el: '[data-testid=stepcard]' });
    });
  test(name('L5-g1', { ...LZ, theme: 'dark' }), async ({ page }) => {
    const v: V = { ...LZ, theme: 'dark' };
    await open(page, v);
    await battery(page, { supported: true, level: 0.15, charging: false });
    await start(page, 'tan tock');
    await page.getByTestId('pocket-btn').click();
    await expect(page.getByTestId('pocket-saver')).toBeVisible();
    await shot(page, name('L5-g1', v));
  });
});

// ------------------------------------------------------------------ L8 + 6f.11 on /setup
test.describe('L8 /setup link, 6f.11 sizes on /setup', () => {
  test('setup page: privacy link under the lock line; five sizes with SR names; default 125 %', async ({ page }) => {
    await open(page, LZ, '/setup?mock=1');
    await expect(page.getByTestId('w-privacy')).toHaveAttribute('href', '/privacy?lang=zh');
    await expect(page.getByTestId('w-size-large')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('w-size-small')).toHaveAccessibleName('较小，85%');
    await expect(page.locator('[data-testid^=w-size-]')).toHaveCount(5);
  });
  test(name('L8-setup-link', LZ), async ({ page }) => {
    await open(page, LZ, '/setup?mock=1');
    await shot(page, name('L8-setup-link', LZ));
  });
  test(name('W-size-85', LZ), async ({ page }) => {
    await open(page, LZ, '/setup?mock=1');
    await page.getByTestId('w-size-small').click();
    await page.getByTestId('w-size-small').scrollIntoViewIfNeeded();
    await shot(page, name('W-size-85', LZ), { el: '.seg.sizes' });
  });
});

// ------------------------------------------------------------------ 6f.11 text size 85 %
test.describe('6f.11 smaller text size', () => {
  test('first run: five cards, 较小 first, 100 % preselected; 85 % shows the caption; targets ≥ 72 px', async ({ page }) => {
    await hermetic(page);
    await page.addInitScript(() => localStorage.getItem('howtogo.settings') || localStorage.setItem('howtogo.settings', '{"motion":"on"}'));
    await page.goto('/?demo=1');
    const cards = page.locator('[data-testid^=fr-size-]');
    await expect(cards).toHaveCount(5);
    await expect(cards.first()).toHaveText(/较小 85% \/ Smaller/);
    await expect(page.getByTestId('fr-size-standard')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('fr-size-small').click();
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'small');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('17px');
    await expect(page.getByTestId('size-85-note')).toHaveText('字会变小。看不清楚，可以在设置里改回来。');
    for (const c of await cards.all()) expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(72);
    expect(await noHScroll(page)).toBe(true);
  });

  test('Home AA never lands on 85 %: from 85 % it goes to 100 %, then 125/150/200/100', async ({ page }) => {
    await open(page, { ...LZ, size: 85 });
    const aa = page.getByTestId('text-size');
    await expect(aa).toHaveAttribute('aria-label', '字体大小：85%');
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      await aa.click();
      seen.push((await page.locator('html').getAttribute('data-text-size'))!);
    }
    expect(seen).toEqual(['standard', 'large', 'xlarge', 'xxlarge', 'standard']);
  });

  test('Settings: 3 + 2 size grid with SR names, caption at 85 %, every target ≥ 56 px, no text under 14.5 px', async ({ page }) => {
    await open(page, LZ, '/settings?demo=1');
    await page.getByTestId('setting-textSize-small').click();
    await expect(page.getByTestId('setting-textSize-small')).toHaveAccessibleName('较小，85%');
    await expect(page.getByTestId('size-85-note')).toBeVisible();
    const boxes = await Promise.all((await page.locator('.seg.sizes button').all()).map((b) => b.boundingBox()));
    expect(new Set(boxes.map((b) => Math.round(b!.y))).size).toBe(2);
    const small = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('main button, main a, main [role=switch]')) {
        const r = el.getBoundingClientRect();
        if (r.height && r.height < 56) bad.push(`${el.dataset.testid ?? el.textContent} ${r.height}`);
      }
      for (const el of document.querySelectorAll<HTMLElement>('main *')) {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
        const f = parseFloat(getComputedStyle(el).fontSize);
        if (f < 14.4) bad.push(`font ${f} ${el.textContent!.slice(0, 20)}`);
      }
      return bad;
    });
    expect(small).toEqual([]);
    expect(await noHScroll(page)).toBe(true);
  });

  for (const s of [85, 100, 200] as const)
    test(`M5-F1-size-${s}-light-100-zh`, async ({ page }) => {
      await hermetic(page);
      await page.clock.setFixedTime(FIXED);
      await page.addInitScript((z) => localStorage.getItem('howtogo.settings') || localStorage.setItem('howtogo.settings', JSON.stringify({ motion: 'on', textSize: z })), SIZE[s]);
      await page.goto('/?demo=1');
      await expect(page.getByTestId('fr-preview')).toBeVisible();
      await page.getByTestId(`fr-size-${SIZE[s]}`).scrollIntoViewIfNeeded();
      await shot(page, `M5-F1-size-${s}-light-100-zh`);
    });
  test(name('H13-size', { ...LZ, size: 85 }), async ({ page }) => {
    const v: V = { ...LZ, size: 85 };
    await open(page, v, '/settings?demo=1');
    await page.getByTestId('setting-textSize-small').scrollIntoViewIfNeeded();
    await shot(page, name('H13-size', v), { el: '.seg.sizes' });
  });
  test(name('H1-default', { ...LZ, size: 85 }), async ({ page }) => {
    const v: V = { ...LZ, size: 85 };
    await open(page, v);
    await expect(page.getByTestId('greeting')).toBeVisible();
    await shot(page, name('H1-default', v));
  });
  test(name('H5-walk', { ...LZ, size: 85 }), async ({ page }) => {
    const v: V = { ...LZ, size: 85 };
    await open(page, v);
    await start(page, 'tan tock');
    await shot(page, name('H5-walk', v));
  });
  test(name('H6-bus', { ...LZ, size: 85 }), async ({ page }) => {
    // 6f.11 "H8-walk-85" = the get-off alert at 85 %; the build's get-off alert frame is H6 (bus).
    const v: V = { ...LZ, size: 85 };
    await open(page, v);
    await start(page, 'tan tock');
    await runUntil(page, 'alert:next');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await shot(page, name('H6-bus', v));
  });
});

// ------------------------------------------------------------------ Delete all (Director ruling)
test.describe('Delete all my data', () => {
  test('stops the live share first, then clears storage and Cache Storage (shell kept)', async ({ page }) => {
    await hermetic(page);
    const calls: string[] = [];
    await page.route('**/api/share/**', (r) => {
      calls.push(`${r.request().method()} ${new URL(r.request().url()).pathname}`);
      return r.fulfill({ status: 204 });
    });
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, fixtureMode: false } }));
    await onboarded(page, { motion: 'on' });
    await page.goto('/settings');
    await page.evaluate(() => {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('howtogo.family.v1', JSON.stringify([{ name: '美玲', relation: 'daughter', phone: '+6591234567', lang: 'zh' }]));
      localStorage.setItem('howtogo.helpshare.v1', JSON.stringify({ id: 'HELP12345', ownerToken: 'tok', viewPath: '/t/HELP12345', expiresAt: '2099-01-01T00:00:00Z', fam: null }));
    });
    await page.reload();
    await page.waitForFunction(() => '__howtogo' in window);
    await page.evaluate(async () => {
      for (const n of ['shell-test', 'api-v1', 'tiles-v1', 'trip-tiles-v1', 'runtime-v1']) await (await caches.open(n)).put(`/x-${n}`, new Response('x'));
    });
    await page.getByTestId('row-delete-all').click();
    await expect(page.getByTestId('sheet-delete-all')).toContainText('如果正在分享，会先停止。');
    await page.getByTestId('delete-all-go').click();
    await page.waitForURL((u) => u.pathname === '/');
    await page.waitForFunction(() => '__howtogo' in window);
    expect(calls).toContain('DELETE /api/share/HELP12345');
    expect(await page.evaluate(() => caches.keys())).toEqual(['shell-test']);
    expect(await page.evaluate(() => localStorage.getItem('howtogo.family.v1') ?? '[]')).toBe('[]');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.helpshare.v1') ?? 'null'))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem('seeded'))).toBeNull();
  });
});

// ------------------------------------------------------------------ SW: expired API entries are deleted
test.describe('service worker API cache pruning', () => {
  test.use({ serviceWorkers: 'allow' });
  test('expired search/route entries are deleted on API_PRUNE; fresh ones stay', async ({ page }) => {
    await hermetic(page);
    await onboarded(page, { motion: 'on' });
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, fixtureMode: false } }));
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    const left = await page.evaluate(async () => {
      const c = await caches.open('api-v1');
      const put = (u: string, ageMs: number) => c.put(u, new Response('{}', { headers: { 'x-sw-cached-at': String(Date.now() - ageMs) } }));
      await put('/api/search?q=old', 25 * 3600_000);
      await put('/api/search?q=new', 60_000);
      await put('/api/route?a=old', 11 * 60_000);
      await put('/api/route?a=new', 60_000);
      const reg = await navigator.serviceWorker.ready;
      const n = await new Promise<number>((res) => {
        navigator.serviceWorker.addEventListener('message', (e) => e.data?.type === 'API_PRUNED' && res(e.data.n));
        reg.active!.postMessage({ type: 'API_PRUNE' });
      });
      const keys = (await c.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search).sort();
      return { n, keys };
    });
    expect(left).toEqual({ n: 2, keys: ['/api/route?a=new', '/api/search?q=new'] });
  });
});
