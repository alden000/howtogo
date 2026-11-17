/**
 * Screenshot baselines for the M2 frames (STYLE-GUIDE §6c): `M2-{frame}-{state}-{theme}-{size}-{lang}.png`
 * at 390×844, deviceScaleFactor 1. Pocket view (G1) is dark only. Hermetic: fonts and tiles stubbed,
 * time fixed, the map canvas masked, reduce motion on (H6b-rm / H12-rm are the static end states).
 * Re-record with `npx playwright test e2e/baselines-m2.spec.ts --update-snapshots`.
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, onboarded } from './util';

type W = Window & { __howtogo: any; __howtogoLog: string[] };
const FIXED = new Date('2026-11-18T10:15:00+08:00');
const FIXED_T = FIXED.getTime();
type Variant = { theme: 'light' | 'dark'; size: 100 | 200; lang: 'zh' | 'en' };
const LZ: Variant = { theme: 'light', size: 100, lang: 'zh' };
const DZ: Variant = { theme: 'dark', size: 100, lang: 'zh' };
const L2: Variant = { theme: 'light', size: 200, lang: 'zh' };
const LE: Variant = { theme: 'light', size: 100, lang: 'en' };
const D2: Variant = { theme: 'dark', size: 200, lang: 'zh' };
const DE: Variant = { theme: 'dark', size: 100, lang: 'en' };
const HOME = { home: { name: 'Toa Payoh Central', address: 'Toa Payoh Central Singapore 310177', lat: 1.33465, lng: 103.8491 }, others: [] };

async function open(page: Page, v: Variant, perm: 'granted' | 'denied' = 'granted') {
  await hermetic(page);
  await page.clock.setFixedTime(FIXED);
  await onboarded(page, { lang: v.lang, theme: v.theme, textSize: v.size === 200 ? 'xxlarge' : 'standard', motion: 'on' });
  await page.addInitScript((p) => {
    localStorage.setItem('howtogo.places', JSON.stringify(p));
    // A held wake lock (headless Chromium has none): the "keep the screen on" note is its own state.
    // Device voices for zh and en (headless has none): the "no voice" note is its own state.
    Object.defineProperty(SpeechSynthesisUtterance.prototype, 'voice', { configurable: true, get: () => null, set: () => {} });
    speechSynthesis.getVoices = () => [{ lang: 'zh-CN' }, { lang: 'en-SG' }] as SpeechSynthesisVoice[];
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => void setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 5);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => Promise.resolve({ release: () => Promise.resolve(), addEventListener() {} }) } });
  }, HOME);
  await page.goto('/?demo=1&demoMs=100000');
  await page.waitForFunction(() => '__howtogo' in window);
  if (perm === 'denied') await page.evaluate(() => (window as unknown as W).__howtogo.platform.fake.setPermission('denied'));
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
  expect(await page.evaluate((l) => (window as unknown as W).__howtogoLog.includes(l), line)).toBe(true);
}
const settled = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
const vname = (frame: string, v: Variant) => `M2-${frame}-${v.theme}-${v.size}-${v.lang}`;
async function shot(page: Page, name: string) {
  await page.waitForTimeout(150); // ResizeObserver layout pass of the band/card
  await settled(page);
  // The WebGL canvas is hidden (not masked: alerts and the pocket view sit on top of it); the m-land background stays.
  await page.addStyleTag({ content: '.mapcanvas canvas, .attribhost, .mapbox .maplibregl-canvas { visibility: hidden !important }' });
  await expect(page).toHaveScreenshot(`${name}.png`);
}

const FRAMES: { frame: string; variants: Variant[]; perm?: 'denied'; go: (p: Page) => Promise<void> }[] = [
  { frame: 'H5-walk', variants: [LZ, DZ, L2, LE], go: (p) => start(p, 'tan tock') },
  {
    frame: 'H5-ride',
    variants: [LZ],
    go: async (p) => {
      await start(p, 'tan tock');
      await runUntil(p, 'cue:boarded');
    },
  },
  { frame: 'H5-manual-walk', variants: [LZ], perm: 'denied', go: (p) => start(p, 'tan tock') },
  {
    frame: 'H6-bus',
    variants: [LZ, DZ, L2],
    go: async (p) => {
      await start(p, 'tan tock');
      await runUntil(p, 'alert:next');
    },
  },
  {
    frame: 'H6-train',
    variants: [LE],
    go: async (p) => {
      await start(p, 'raffles');
      await runUntil(p, 'alert:next');
    },
  },
  {
    frame: 'H6b-bus',
    variants: [LZ, DZ, L2],
    go: async (p) => {
      await start(p, 'tan tock');
      await runUntil(p, 'alert:now');
    },
  },
  {
    frame: 'H6b-train',
    variants: [LE],
    go: async (p) => {
      await start(p, 'raffles');
      await runUntil(p, 'alert:now');
    },
  },
  {
    frame: 'G1-pocket-walk',
    variants: [DZ, D2, DE],
    go: async (p) => {
      await start(p, 'tan tock');
      await p.getByTestId('pocket-btn').click();
      await expect(p.getByTestId('pocket')).toBeVisible();
    },
  },
  {
    frame: 'G1-pocket-ride',
    variants: [DZ],
    go: async (p) => {
      await start(p, 'tan tock');
      await runUntil(p, 'cue:boarded');
      await p.getByTestId('pocket-btn').click();
      await expect(p.getByTestId('pocket')).toBeVisible();
    },
  },
  {
    frame: 'H11-failed',
    variants: [LZ],
    go: async (p) => {
      await start(p, 'tan tock');
      await p.evaluate((T0) => {
        const w = window as unknown as W;
        w.__howtogo.api.route = () => Promise.reject(Object.assign(new Error('x'), { kind: 'server', status: 500 }));
        const g = w.__howtogo.store.trip.value.guidance;
        const s = g.steps[0].start;
        for (let i = 1; i <= 4; i++) w.__howtogo.platform.fake.emit({ lat: s.lat + 0.004, lng: s.lng + 0.004 + i * 0.00002, acc: 8, t: T0 + i * 1000, speed: 1 });
      }, FIXED_T);
      await expect(p.locator('[data-note=reroute-failed]')).toBeVisible();
    },
  },
  {
    frame: 'H12-notshared',
    variants: [LZ, DZ],
    go: async (p) => {
      await start(p, 'tan tock');
      await runUntil(p, 'trip:arrived');
      await expect(p.getByTestId('arrived')).toBeVisible();
    },
  },
  {
    frame: 'H9-m2-trip',
    variants: [LZ],
    go: async (p) => {
      await start(p, 'tan tock');
      await p.getByTestId('guide-help').click();
      await expect(p.getByTestId('sheet-help')).toBeVisible();
    },
  },
  {
    frame: 'H10-dest',
    variants: [LZ],
    go: async (p) => {
      await start(p, 'tan tock');
      await p.getByTestId('guide-help').click();
      await p.getByTestId('help-driver').click();
      await expect(p.getByTestId('driver-card')).toBeVisible();
    },
  },
  {
    frame: 'G2-two',
    variants: [LZ, L2],
    go: async (p) => {
      await p.getByTestId('to-field').click();
      await p.getByTestId('search-input').fill('tan tock');
      await p.getByTestId('search-result-0').click();
      await p.getByTestId('add-stop').click();
      await p.getByTestId('stop-add').click();
      await p.getByTestId('search-input').fill('raffles');
      await p.getByTestId('search-result-0').click();
      await expect(p.getByTestId('stop-1')).toBeVisible();
    },
  },
  {
    frame: 'H4-journey-3',
    variants: [LZ],
    go: async (p) => {
      await p.getByTestId('to-field').click();
      await p.getByTestId('search-input').fill('tan tock');
      await p.getByTestId('search-result-0').click();
      await p.getByTestId('add-stop').click();
      for (const q of ['raffles', 'ang mo kio']) {
        await p.getByTestId('stop-add').click();
        await p.getByTestId('search-input').fill(q);
        await p.getByTestId('search-result-0').click();
      }
      await p.getByTestId('journey-see').click();
      await expect(p.getByTestId('journey-timeline')).toBeVisible();
    },
  },
  {
    frame: 'G3-waypoint',
    variants: [LZ],
    perm: 'denied',
    go: async (p) => {
      await p.getByTestId('to-field').click();
      await p.getByTestId('search-input').fill('tan tock');
      await p.getByTestId('search-result-0').click();
      await p.getByTestId('add-stop').click();
      await p.getByTestId('stop-add').click();
      await p.getByTestId('search-input').fill('raffles');
      await p.getByTestId('search-result-0').click();
      await p.getByTestId('journey-see').click();
      await p.getByTestId('start-guide').click();
      for (let i = 0; i < 30 && !(await p.getByTestId('waypoint').count()); i++) await p.getByTestId('step-next').click();
      await expect(p.getByTestId('waypoint')).toBeVisible();
    },
  },
];

test.describe('M2 baselines 390×844', () => {
  test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  for (const f of FRAMES)
    for (const v of f.variants)
      test(vname(f.frame, v), async ({ page }) => {
        await open(page, v, f.perm);
        await f.go(page);
        await shot(page, vname(f.frame, v));
      });
});
