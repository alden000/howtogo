/**
 * Screenshot baselines for the M3/M4 frames (STYLE-GUIDE §6d/§6e): `M3-…` / `M4-…-{theme}-{size}-{lang}`
 * at 390×844, deviceScaleFactor 1, hermetic (fonts/tiles stubbed, time fixed, map canvas hidden).
 * Re-record with `npx playwright test e2e/baselines-m34.spec.ts --update-snapshots`.
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, onboarded } from './util';

type W = Window & { __howtogo: any; __howtogoLog: string[] };
const FIXED = new Date('2026-11-18T10:15:00+08:00');
type V = { theme: 'light' | 'dark'; size: 100 | 200; lang: 'zh' | 'en' };
const LZ: V = { theme: 'light', size: 100, lang: 'zh' };
const MEI = { name: '美玲', relation: 'daughter', phone: '+6591234567', callMe: '妈妈', lang: 'zh' };

test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

async function open(page: Page, v: V, scn = '', contacts: unknown[] = [MEI]) {
  await hermetic(page);
  await page.clock.setFixedTime(FIXED);
  await onboarded(page, { lang: v.lang, theme: v.theme, textSize: v.size === 200 ? 'xxlarge' : 'standard', motion: 'on' });
  await page.addInitScript((c) => {
    localStorage.setItem('howtogo.family.v1', JSON.stringify(c));
    window.open = (() => null) as typeof window.open;
    speechSynthesis.getVoices = () => [{ lang: 'zh-CN' }, { lang: 'en-SG' }] as SpeechSynthesisVoice[];
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => void setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 5);
  }, contacts);
  await page.goto(`/?demo=1&demoMs=100000${scn ? `&scn=${scn}` : ''}`);
  await page.waitForFunction(() => '__howtogo' in window);
}
async function start(page: Page, q: string, go = true) {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(q);
  await page.getByTestId('search-result-0').click();
  if (!go) return;
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
}
async function toStep(page: Page, line: string) {
  await page.evaluate(async (l) => {
    const w = window as unknown as W;
    for (let i = 0; i < 2000 && !w.__howtogoLog.includes(l); i++) if (!w.__howtogo.platform.fake.step()) break;
  }, line);
}
const name = (f: string, v: V) => `${f}-${v.theme}-${v.size}-${v.lang}`;
async function shot(page: Page, n: string, el?: string) {
  await page.waitForTimeout(200);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
  await page.addStyleTag({ content: '.mapcanvas canvas, .attribhost, .mapbox .maplibregl-canvas { visibility: hidden !important } .arrchip .dot{animation:none!important}' });
  if (el) await expect(page.locator(el).first()).toHaveScreenshot(`${n}.png`);
  else await expect(page).toHaveScreenshot(`${n}.png`);
}

for (const [scn, st] of [['live', 'live'], ['here', 'here'], ['estimated', 'estimated'], ['empty', 'nodata'], ['lsd', 'live']] as const) {
  test(`T1 ${scn}`, async ({ page }) => {
    await open(page, LZ, `bus:${scn}`);
    await start(page, '陈笃生');
    await toStep(page, 'step:1');
    await expect(page.getByTestId('arrchip')).toHaveAttribute('data-state', st);
    await shot(page, name(`M3-T1-${scn === 'empty' ? 'nodata' : scn}`, LZ), '[data-testid="stepcard"]');
  });
}

test('T1 live dark 200', async ({ page }) => {
  const v: V = { theme: 'dark', size: 200, lang: 'zh' };
  await open(page, v, 'bus:live');
  await start(page, '陈笃生');
  await toStep(page, 'step:1');
  await shot(page, name('M3-T1-live', v), '[data-testid="arrchip"]');
});

test('T3 home + T9 recents', async ({ page }) => {
  await open(page, LZ, 'alerts:disrupted');
  await page.evaluate(() => {
    const s = (window as unknown as W).__howtogo.store;
    s.addRecent({ name: 'Tan Tock Seng Hospital', lat: 1.3214, lng: 103.8458 }, undefined, Date.parse('2026-11-16T09:00:00+08:00'));
  });
  await expect(page.getByTestId('disruption')).toBeVisible();
  await shot(page, name('M3-T3-home', LZ));
});

test('T3 h3 en', async ({ page }) => {
  const v: V = { theme: 'light', size: 100, lang: 'en' };
  await open(page, v, 'alerts:disrupted');
  await start(page, 'raffles', false);
  await expect(page.getByTestId('affected-fact').first()).toBeVisible();
  await shot(page, name('M3-T3-h3', v));
});

test('P1 choose + pill + P2 help sharing + 995 confirm', async ({ page }) => {
  await open(page, LZ);
  await start(page, '陈笃生');
  await page.getByTestId('guide-share').click();
  await shot(page, name('M4-P1-choose', LZ));
  await page.getByTestId('share-copy').click();
  await expect(page.getByTestId('share-pill')).toBeVisible();
  await page.waitForTimeout(4000);
  await shot(page, name('M4-P1-pill-sharing', LZ), '[data-testid="guide-band"]');
  await page.getByTestId('guide-help').click();
  await shot(page, name('M4-P2-trip-sharing', LZ));
  await page.getByTestId('help-995').click();
  await shot(page, name('M4-P2-995confirm', LZ));
});

test('P3 list + P4 add invalid', async ({ page }) => {
  await open(page, LZ, '', [MEI, { name: 'Ah Seng', relation: 'son', phone: '+6598765432' }]);
  await page.goto('/family');
  await shot(page, name('M4-P3-list', LZ));
  await page.getByTestId('contact-add').click();
  await page.getByTestId('contact-phone').fill('9123');
  await page.getByTestId('contact-save').click();
  await shot(page, name('M4-P4-invalid', LZ));
});

test('W form + P5b review', async ({ page, context }) => {
  await open(page, LZ, '', []);
  const fam = await context.newPage();
  await hermetic(fam);
  await fam.clock.setFixedTime(FIXED);
  await fam.goto('/setup?mock=1');
  await shot(fam, name('M4-W-form', LZ));
  await fam.getByTestId('w-name').fill('林阿姨');
  await fam.getByTestId('contact-name').fill('美玲');
  await fam.getByTestId('contact-phone').fill('91234567');
  await fam.getByTestId('w-contact-add').click();
  await fam.getByTestId('w-you').fill('美玲');
  await fam.getByTestId('w-send').click();
  const link = await fam.getByTestId('setup-link').inputValue();
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.getByTestId('setup-review')).toBeVisible();
  await shot(page, name('M4-P5b-review', LZ));
});
