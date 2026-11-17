/**
 * M1 UI round: journeys (zh/en), dark mode, 200 % text (no clipping / overlap), 56 px targets,
 * Back on every screen and sheet, location explainer/denied, first run, route states.
 * Demo/mock mode only; tiles and fonts are stubbed (hermetic).
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

const FIXED = new Date('2026-11-18T10:15:00+08:00');

async function setup(page: Page, settings: Record<string, unknown> = {}, places?: unknown) {
  await hermetic(page);
  await page.clock.setFixedTime(FIXED);
  await onboarded(page, settings);
  if (places) await page.addInitScript((p) => localStorage.setItem('howtogo.places', JSON.stringify(p)), places);
}

/** Problems on the current screen: clipped text, horizontal scroll, overlapping controls, small targets. */
async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    /** Rect clipped to the scroll container (content scrolled out of view is not "overlapping"). */
    const rectOf = (el: Element) => {
      const r = el.getBoundingClientRect();
      const box = el.closest('.scroll,.sheet')?.getBoundingClientRect();
      if (!box) return r;
      const top = Math.max(r.top, box.top);
      const bottom = Math.min(r.bottom, box.bottom);
      return { left: r.left, right: r.right, top, bottom, width: r.width, height: Math.max(0, bottom - top) };
    };
    const vis = (el: Element) => {
      const r = rectOf(el);
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.sr');
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? el.className}] "${(el.textContent ?? '').trim().slice(0, 24)}"`;
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page scrolls horizontally: ${document.documentElement.scrollWidth} > ${innerWidth}`);
    const stage = document.querySelector('.stage')!;
    for (const el of stage.querySelectorAll('h1,h2,h3,p,b,li,label,button,.tag,.dur,.chain,.facts,.where,.sub,.nm')) {
      if (!vis(el) || el.closest('.maplibregl-map')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`clipped ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    }
    const ctrls = [...stage.querySelectorAll('button,input,a,[role=radio]')].filter(
      (el) => vis(el) && !el.closest('.maplibregl-ctrl-attrib,.maplibregl-ctrl'),
    );
    for (const el of ctrls) {
      const r = el.getBoundingClientRect();
      if (r.height < 55.5 || r.width < 55.5) out.push(`small target ${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    for (let i = 0; i < ctrls.length; i++)
      for (let j = i + 1; j < ctrls.length; j++) {
        const a = ctrls[i]!;
        const b = ctrls[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        if (a.closest('.sheetwrap') !== b.closest('.sheetwrap')) continue;
        const ra = rectOf(a);
        const rb = rectOf(b);
        const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ox > 1 && oy > 1) out.push(`overlap ${name(a)} × ${name(b)}`);
      }
    return out;
  });
}

async function toRoutes(page: Page, q = 'tan tock') {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(q);
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
}

test.describe('journeys', () => {
  test.use({ serviceWorkers: 'block' });

  test('zh: home → search → routes → overview, exact copy, Back on every screen', async ({ page }) => {
    await setup(page);
    await page.goto('/?demo=1');
    await expect(page.getByTestId('greeting')).toHaveText('早上好');
    await expect(page.getByTestId('to-field')).toContainText('说出或打出地方名字');
    await expect(page.getByTestId('set-your-home')).toHaveText('设好你的家');

    await page.getByTestId('to-field').click();
    await expect(page.locator('h1')).toHaveText('去哪里？');
    await page.getByTestId('search-input').fill('zzzz');
    await expect(page.getByTestId('search-empty')).toContainText('没找到“zzzz”');
    await page.getByTestId('search-input').fill('tan tock');
    await expect(page.getByTestId('search-results')).toContainText('Tan Tock Seng Hospital');
    await page.getByTestId('search-result-0').click();

    await expect(page).toHaveURL(/\/routes$/);
    await expect(page.getByTestId('routes-title')).toHaveText('怎么去 Tan Tock Seng Hospital？');
    const card = page.getByTestId('route-option-0');
    await expect(card).toContainText('推荐');
    await expect(card).toContainText('选这条路');
    await expect(card).toHaveAttribute('aria-label', /^推荐，最少走路，\d+ 分钟，上午 \d+:\d\d 到达。走路 \d+ 分钟/);
    await expect(page.locator('.facts')).not.toContainText(['没有楼梯']);
    await expect(page.getByText('有电梯')).toHaveCount(0);
    expect(await logOf(page)).toEqual(expect.arrayContaining(['route:n=' + (await page.locator('.card').count()) + ' pref=least_walk']));
    await card.click();

    await expect(page).toHaveURL(/\/trip$/);
    await expect(page.locator('h1')).toHaveText('去 Tan Tock Seng Hospital');
    await expect(page.getByTestId('step-list').locator('li').last()).toContainText('到达 Tan Tock Seng Hospital');
    await expect(page.getByTestId('start-guide')).toBeVisible(); // M2 AC 1: flag `guide` on
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Singapore Land Authority', { timeout: 15_000 });

    await page.getByTestId('back').click();
    await expect(page).toHaveURL(/\/routes$/);
    await page.getByTestId('back').click();
    await expect(page).toHaveURL(/:\d+\/(\?.*)?$/);
    // M3 AC 35: browsing routes records nothing; a recent trip is recorded when a trip starts.
    await expect(page.getByTestId('recent-trips')).toHaveCount(0);
    const screens = (await logOf(page)).filter((l) => l.startsWith('screen:'));
    expect(screens.slice(-4)).toEqual(['screen:/routes', 'screen:/trip', 'screen:/routes', 'screen:/']);
  });

  test('en: the same journey in English, MRT option', async ({ page }) => {
    await setup(page, { lang: 'en' });
    await page.goto('/?demo=1');
    await expect(page.getByTestId('greeting')).toHaveText('Good morning');
    await expect(page.getByTestId('lang-toggle')).toHaveText('中');
    await toRoutes(page, 'raffles');
    await expect(page.getByTestId('routes-title')).toHaveText('How do I get to Raffles Place MRT Station (NS26)?');
    await expect(page.getByTestId('route-option-0')).toContainText('Choose this way');
    await expect(page.locator('.linetag').first()).toBeVisible();
    await page.getByTestId('route-option-0').click();
    await expect(page.locator('h1')).toHaveText('To Raffles Place MRT Station (NS26)');
    await expect(page.getByTestId('step-list')).toContainText('Take the');
    await page.goBack();
    await expect(page).toHaveURL(/\/routes$/);
  });

  test('language toggle, text-size button and dark theme apply at once', async ({ page }) => {
    await setup(page);
    await page.goto('/?demo=1');
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByTestId('greeting')).toHaveText('Good morning');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-SG');
    await page.getByTestId('text-size').click();
    await expect(page.getByTestId('text-size')).toHaveAttribute('aria-label', 'Text size: 125%');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('25px');
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('setting-theme-dark').click();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(20, 17, 14)');
    await page.getByTestId('setting-motion-on').click();
    await expect(page.locator('html')).toHaveClass(/\brm\b/);
  });
});

test.describe('layout', () => {
  test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  for (const size of ['standard', 'xxlarge'] as const)
    for (const lang of ['zh', 'en'] as const)
      test(`no clipping, overlap or small targets: ${size} ${lang}`, async ({ page }) => {
        await setup(page, { textSize: size, lang }, { home: { name: 'Toa Payoh Central', lat: 1.33465, lng: 103.8491 }, others: [] });
        await page.goto('/?demo=1');
        await expect(page.getByTestId('tile-home')).toBeVisible();
        const all: string[] = [];
        const check = async (where: string) => all.push(...(await layoutProblems(page)).map((p) => `${where}: ${p}`));
        await check('home');
        await page.getByTestId('to-field').click();
        await page.getByTestId('search-input').fill('tan tock');
        await expect(page.getByTestId('search-results')).toBeVisible();
        await check('search');
        await page.getByTestId('search-result-0').click();
        await expect(page.getByTestId('route-option-0')).toBeVisible();
        await check('routes');
        await page.getByTestId('route-option-0').click();
        await expect(page.getByTestId('step-list')).toBeVisible();
        await check('trip');
        await page.getByTestId('back').click();
        await page.getByTestId('back').click();
        await page.getByTestId('nav-settings').click();
        await check('settings');
        await page.getByTestId('report').click();
        await check('report-sheet');
        expect(all).toEqual([]);
      });
});

test.describe('states', () => {
  test.use({ serviceWorkers: 'block' });

  test('Back closes every sheet first; settings → about → settings → home', async ({ page }) => {
    await setup(page, {}, { home: { name: 'Tan Tock Seng Hospital', lat: 1.32135, lng: 103.8465 }, others: [] });
    await page.goto('/?demo=1');
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL(/\/settings$/);
    for (const [row, sheet] of [
      ['row-name', 'name'],
      ['row-home', 'home'],
      ['row-install', 'install'],
      ['report', 'report'],
    ] as const) {
      await page.getByTestId(row).click();
      await expect(page.getByTestId(`sheet-${sheet}`)).toBeVisible();
      await page.goBack();
      await expect(page.getByTestId(`sheet-${sheet}`)).toHaveCount(0);
      await expect(page).toHaveURL(/\/settings$/);
    }
    await expect(page.getByTestId('row-clear')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('row-about').click();
    await expect(page.getByTestId('privacy')).toContainText('没有广告，不追踪你。');
    await page.getByTestId('back').click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByTestId('back').click();
    await expect(page).toHaveURL(/:\d+\/(\?.*)?$/);
    // Name sheet saves the greeting name
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('row-name').click();
    await page.getByTestId('name-input').fill('林阿姨');
    await page.getByTestId('name-save').click();
    await page.getByTestId('back').click();
    await expect(page.getByTestId('greeting')).toHaveText('早上好，林阿姨');
  });

  test('take me home when already near home → toast', async ({ page }) => {
    await setup(page, {}, { home: { name: 'Toa Payoh Central', lat: 1.33465, lng: 103.8491 }, others: [] });
    await page.goto('/?demo=1');
    await expect(page.getByTestId('from-field')).toContainText('你在：家附近');
    await page.getByTestId('take-me-home').click();
    await expect(page.getByTestId('toast-already-home')).toHaveText('你现在就在家附近，不用找路啦。');
  });

  test('too close → walk state → walking overview', async ({ page }) => {
    await setup(page);
    await page.goto('/?demo=1');
    await page.getByTestId('to-field').click();
    await page.getByTestId('search-input').fill('toa payoh');
    await page.getByTestId('search-result-0').click();
    await expect(page.getByTestId('state-routes-close')).toContainText('很近了，走路就到');
    await page.getByTestId('routes-show-walk').click();
    await expect(page.getByTestId('step-list')).toContainText('走到 Toa Payoh Central');
  });

  test('offline: route and search panels, toast, auto retry when back online', async ({ page, context }) => {
    await setup(page);
    await page.goto('/?demo=1');
    await page.getByTestId('to-field').click();
    await context.setOffline(true);
    await page.getByTestId('search-input').fill('tan tock');
    await expect(page.getByTestId('state-search-offline')).toContainText('没有网络，暂时找不到新的地方。');
    await expect(page.getByTestId('toast-offline')).toBeVisible({ timeout: 6000 });
    await context.setOffline(false);
    await expect(page.getByTestId('search-results')).toBeVisible();
    await expect(page.getByTestId('toast-online')).toHaveText('网络恢复了');
  });

  test('location: explainer before the prompt, denied help, type a place instead', async ({ browser }) => {
    const context = await browser.newContext({ permissions: [], serviceWorkers: 'block', locale: 'zh-CN' });
    const page = await context.newPage();
    await setup(page);
    // Headless Chromium reports an ungranted permission as "denied"; a fresh phone reports "prompt".
    await page.addInitScript(() => {
      const q = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (d: PermissionDescriptor) =>
        d.name === 'geolocation' ? Promise.resolve({ state: 'prompt' } as PermissionStatus) : q(d);
    });
    await page.goto('/?mock=1');
    await expect(page.getByTestId('from-field')).toContainText('从：我的位置');
    await page.getByTestId('to-field').click();
    await page.getByTestId('search-input').fill('tan tock');
    await page.getByTestId('search-result-0').click();
    await expect(page.getByTestId('sheet-loc-explain')).toContainText('让我知道你在哪里');
    expect(await logOf(page)).not.toContain('loc:ok');
    await page.getByTestId('loc-ok').click(); // headless without a grant → denied
    await expect(page.getByTestId('sheet-loc-denied')).toContainText('手机没有让我看你的位置');
    await page.getByTestId('loc-how').click();
    await expect(page.getByTestId('loc-how-steps')).toContainText('回到这里，按“再试一次”。');
    await page.goBack();
    await expect(page.getByTestId('sheet-loc-denied')).toHaveCount(0);
    await expect(page).toHaveURL(/\/routes$/);
    await context.close();
  });

  test('first run: language, size, name, then Home; Skip never shows it again', async ({ page }) => {
    await hermetic(page);
    await page.clock.setFixedTime(FIXED);
    await page.goto('/?demo=1');
    await expect(page).toHaveURL(/\/welcome\?p=1$/);
    await page.getByTestId('fr-lang-en').click();
    await expect(page.getByTestId('fr-preview')).toHaveText('Good morning! Where would you like to go today?');
    await page.getByTestId('fr-size-xxlarge').click();
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'xxlarge');
    await page.getByTestId('fr-next').click();
    await page.getByTestId('fr-name').fill('Auntie Lin');
    await page.getByTestId('fr-next').click();
    await expect(page).toHaveURL(/p=3$/);
    await page.goBack();
    await expect(page).toHaveURL(/p=2$/);
    await page.getByTestId('fr-next').click();
    await page.getByTestId('fr-home-later').click();
    await expect(page.getByTestId('greeting')).toHaveText('Good morning, Auntie Lin');
    await page.reload();
    await expect(page.getByTestId('greeting')).toBeVisible();
    await expect(page).not.toHaveURL(/welcome/);
  });
});
