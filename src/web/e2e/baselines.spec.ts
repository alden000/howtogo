/**
 * Screenshot baselines for the M1 frames (390×844 at DPR 1, plus 1440 wide for H1/H3/H4).
 * Names follow STYLE-GUIDE §6 (`H{n}-{state}-{theme}-{size}-{lang}`) and §6b (`M1-F{n}-…`).
 * Hermetic: fonts and OneMap tiles are stubbed (system fallback fonts), time is fixed, the map canvas is masked.
 * Re-record with `npx playwright test e2e/baselines.spec.ts --update-snapshots`.
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, onboarded } from './util';

const FIXED = new Date('2026-11-18T10:15:00+08:00');
const AT_HOME = { home: { name: 'Toa Payoh Central', address: 'Toa Payoh Central Singapore 310177', lat: 1.33465, lng: 103.8491 }, others: [] };
const AWAY = { home: { name: 'Tan Tock Seng Hospital', address: '11 Jalan Tan Tock Seng Singapore 308433', lat: 1.32135, lng: 103.8465 }, others: [] };
const RECENTS = [{ to: { name: 'Tan Tock Seng Hospital', address: '11 Jalan Tan Tock Seng Singapore 308433', lat: 1.32135, lng: 103.8465 }, at: FIXED.getTime() }];

type Variant = { theme: 'light' | 'dark'; size: 100 | 200; lang: 'zh' | 'en' };
const ALL: Variant[] = [
  { theme: 'light', size: 100, lang: 'zh' },
  { theme: 'dark', size: 100, lang: 'zh' },
  { theme: 'light', size: 200, lang: 'zh' },
  { theme: 'light', size: 100, lang: 'en' },
];
const ONE: Variant[] = [ALL[0]!];

async function open(page: Page, v: Variant, places: unknown = AT_HOME, recents: unknown = []) {
  await hermetic(page);
  await page.clock.setFixedTime(FIXED);
  await onboarded(page, { lang: v.lang, theme: v.theme, textSize: v.size === 200 ? 'xxlarge' : 'standard', motion: 'on' });
  await page.addInitScript(
    ([p, r]) => {
      localStorage.setItem('howtogo.places', JSON.stringify(p));
      localStorage.setItem('howtogo.recents', JSON.stringify(r));
    },
    [places, recents] as const,
  );
}

/**
 * QA-13 root cause: the capture could land inside the new screen's enter cross-fade (a compositor-run opacity
 * animation that `animations: 'disabled'` does not always reach in time), giving a washed-out / shifted frame.
 * Capture only once the app's own finite animations (screen enter, sheet rise, exit ghosts) have ended.
 */
const settled = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
const shot = async (page: Page, name: string) => {
  await settled(page);
  await expect(page).toHaveScreenshot(`${name}.png`, { mask: [page.locator('[data-testid=map], img')] });
};
/** Open a sheet over Home through the app's router (the same call the screens make). */
const openSheet = async (p: Page, name: string) => {
  await p.waitForFunction(() => '__howtogo' in window);
  await p.evaluate((n) => (window as unknown as { __howtogo: { router: { openSheet(n: string): void } } }).__howtogo.router.openSheet(n), name);
};
const vname = (frame: string, v: Variant) => `${frame}-${v.theme}-${v.size}-${v.lang}`;

/** Frame states: how to reach each one from a fresh demo page. */
const FRAMES: { name: string; variants: Variant[]; places?: unknown; recents?: unknown; go: (p: Page) => Promise<string | void> }[] = [
  { name: 'H1-default', variants: ALL, go: async (p) => void (await expect(p.getByTestId('from-field')).toContainText(/家|Home/)) },
  { name: 'H1-away', variants: ONE, places: AWAY, go: async (p) => void (await expect(p.getByTestId('from-field')).toContainText('Toa Payoh')) },
  {
    name: 'H2-recent',
    variants: ONE,
    recents: RECENTS,
    go: async (p) => {
      await p.getByTestId('to-field').click();
      await expect(p.getByTestId('search-recent')).toBeVisible();
    },
  },
  {
    name: 'H2-results',
    variants: ALL,
    go: async (p) => {
      await p.getByTestId('to-field').click();
      await p.getByTestId('search-input').fill('tan tock');
      await expect(p.getByTestId('search-results')).toBeVisible();
      await p.getByTestId('search-input').blur();
    },
  },
  {
    name: 'H2-empty',
    variants: ONE,
    go: async (p) => {
      await p.getByTestId('to-field').click();
      await p.getByTestId('search-input').fill('zzzz');
      await expect(p.getByTestId('search-empty')).toBeVisible();
      await p.getByTestId('search-input').blur();
    },
  },
  {
    name: 'H3',
    variants: ALL,
    places: AWAY,
    go: async (p) => {
      await p.getByTestId('take-me-home').click();
      await expect(p.getByTestId('route-option-0')).toBeVisible();
      // M3: the first bus card's live line arrives async; wait for it so the frame is stable
      if (await p.locator('.card .busbadge').count()) await p.getByTestId('arr-h3').first().waitFor({ timeout: 3000 }).catch(() => {});
      const n = await p.locator('.card').count();
      return `H3-${['one', 'two', 'three'][n - 1]}`;
    },
  },
  {
    name: 'H4-bus',
    variants: ALL,
    places: AWAY,
    go: async (p) => {
      await p.getByTestId('take-me-home').click();
      await p.getByTestId('route-option-0').click();
      await expect(p.getByTestId('step-list')).toBeVisible();
    },
  },
  {
    name: 'H4-mrt',
    variants: ONE,
    go: async (p) => {
      await p.getByTestId('to-field').click();
      await p.getByTestId('search-input').fill('raffles');
      await p.getByTestId('search-result-0').click();
      await p.getByTestId('route-option-0').click();
      await expect(p.getByTestId('step-list')).toBeVisible();
    },
  },
  {
    name: 'M1-F3-close',
    variants: ONE,
    go: async (p) => {
      await p.getByTestId('to-field').click();
      await p.getByTestId('search-input').fill('toa payoh');
      await p.getByTestId('search-result-0').click();
      await expect(p.getByTestId('state-routes-close')).toBeVisible();
    },
  },
  {
    name: 'M1-F4-offline',
    variants: ONE,
    recents: RECENTS,
    go: async (p) => {
      await p.getByTestId('to-field').click();
      await p.context().setOffline(true);
      await p.getByTestId('search-input').fill('tan tock');
      await expect(p.getByTestId('state-search-offline')).toBeVisible();
      await p.getByTestId('search-input').blur();
    },
  },
  {
    name: 'M1-F6-settings',
    variants: ALL,
    go: async (p) => {
      await p.getByTestId('nav-settings').click();
      await expect(p.getByTestId('row-name')).toBeVisible();
    },
  },
  {
    name: 'M1-F6-report',
    variants: ONE,
    go: async (p) => {
      await p.getByTestId('nav-settings').click();
      await p.getByTestId('report').click();
      await expect(p.getByTestId('sheet-report')).toBeVisible();
    },
  },
  {
    name: 'M1-F6-about',
    variants: ONE,
    go: async (p) => {
      await p.getByTestId('nav-settings').click();
      await p.getByTestId('row-about').click();
      await expect(p.getByTestId('privacy')).toBeVisible();
    },
  },
  {
    name: 'M1-F2-denied-android',
    variants: ONE,
    go: async (p) => {
      await openSheet(p, 'loc-denied');
      await p.getByTestId('loc-how').click();
      await expect(p.getByTestId('loc-how-steps')).toBeVisible();
    },
  },
  {
    name: 'M1-F2-explainer',
    variants: ONE,
    go: async (p) => {
      await openSheet(p, 'loc-explain');
      await expect(p.getByTestId('sheet-loc-explain')).toBeVisible();
    },
  },
];

test.describe('baselines 390×844', () => {
  test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  for (const f of FRAMES)
    for (const v of f.variants)
      test(vname(f.name, v), async ({ page }) => {
        await open(page, v, f.places ?? AT_HOME, f.recents ?? []);
        await page.goto('/?demo=1');
        const name = (await f.go(page)) ?? f.name;
        await shot(page, vname(name, v));
      });

  test('M1-F1-lang / name / home', async ({ page }) => {
    await hermetic(page);
    await page.clock.setFixedTime(FIXED);
    await page.addInitScript(() => localStorage.getItem('howtogo.settings') || localStorage.setItem('howtogo.settings', '{"motion":"on"}'));
    await page.goto('/?demo=1');
    await expect(page.getByTestId('fr-preview')).toBeVisible();
    await shot(page, 'M1-F1-lang-light-100-zh');
    await page.getByTestId('fr-next').click();
    await shot(page, 'M1-F1-name-light-100-zh');
    await page.getByTestId('fr-next').click();
    await shot(page, 'M1-F1-home-light-100-zh');
  });
});

test.describe('baselines 1440 wide', () => {
  test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  for (const [frame, go] of [
    ['H1', async () => {}],
    ['H3', async (p: Page) => {
      await p.getByTestId('take-me-home').click();
      await expect(p.getByTestId('route-option-0')).toBeVisible();
    }],
    ['H4', async (p: Page) => {
      await p.getByTestId('take-me-home').click();
      await p.getByTestId('route-option-0').click();
      await expect(p.getByTestId('step-list')).toBeVisible();
    }],
  ] as const)
    test(`${frame}-desktop-1440`, async ({ page }) => {
      await open(page, ALL[0]!, AWAY);
      await page.goto('/?demo=1');
      await go(page);
      await shot(page, `${frame}-desktop-1440`);
    });
});
