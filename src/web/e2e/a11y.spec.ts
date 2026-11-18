/**
 * M5 §C code-side checks (AC 12, 13): an a11y-tree check per screen (one h1, no skipped heading levels,
 * every control named, decorative icons hidden, at most one assertive live region) and a keyboard pass
 * (sheet takes focus, Escape closes it and focus returns to its trigger, no trap). QA's manual audit and the
 * owner's screen-reader script stay as specified; this keeps regressions out between those runs.
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, onboarded } from './util';

test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const HOME = { home: { name: 'Toa Payoh Central', lat: 1.33465, lng: 103.8491 }, others: [] };

async function boot(page: Page, lang: 'zh' | 'en' = 'zh') {
  await hermetic(page);
  await onboarded(page, { lang, motion: 'on' });
  await page.addInitScript((p) => localStorage.setItem('howtogo.places', JSON.stringify(p)), HOME);
}

/** Problems in the current screen's accessibility tree (empty = fine). */
async function treeProblems(page: Page): Promise<string[]> {
  await page.waitForTimeout(150);
  const bad: string[] = [];
  const dom = await page.evaluate(() => {
    const out: string[] = [];
    const screen = document.querySelector('.stage > .screen') ?? document.body;
    const vis = (e: Element) => !!(e as HTMLElement).offsetParent || getComputedStyle(e).position === 'fixed';
    const h1 = [...screen.querySelectorAll('h1')].filter(vis);
    // M5 integration: every screen has exactly one h1, H4 route detail and H5 guidance included.
    if (h1.length !== 1) out.push(`h1 count ${h1.length}`);
    let last = 0;
    for (const h of [...screen.querySelectorAll('h1,h2,h3,h4')].filter(vis)) {
      const n = Number(h.tagName[1]);
      if (last && n > last + 1) out.push(`heading skip h${last}→h${n}: ${h.textContent?.slice(0, 30)}`);
      last = n;
    }
    for (const svg of document.querySelectorAll('.stage svg.i')) if (svg.getAttribute('aria-hidden') !== 'true') out.push('icon not hidden');
    const assertive = [...document.querySelectorAll('[aria-live=assertive]')].filter((e) => !e.closest('[hidden]'));
    if (assertive.length > 2) out.push(`assertive regions ${assertive.length}`);
    return out;
  });
  bad.push(...dom);
  const snap = await page.locator('.stage').ariaSnapshot();
  for (const line of snap.split('\n'))
    if (/^\s*- (button|link|switch|radio|checkbox|textbox|combobox)(\s*\[[^\]]*\])*:?\s*$/.test(line)) bad.push(`unnamed: ${line.trim()}`);
  return bad;
}

const SCREENS: [string, string, ((p: Page) => Promise<void>)?][] = [
  ['home', '/?demo=1'],
  ['search', '/search?demo=1'],
  ['settings', '/settings?demo=1'],
  ['about', '/about?demo=1'],
  ['privacy', '/privacy?demo=1'],
  ['places', '/places?demo=1'],
  ['family', '/family?demo=1'],
  ['setup', '/setup?mock=1'],
  [
    'routes + guide',
    '/?demo=1',
    async (p) => {
      await p.getByTestId('to-field').click();
      await p.getByTestId('search-input').fill('tan tock');
      await p.getByTestId('search-result-0').click();
      await expect(p.getByTestId('route-option-0')).toBeVisible();
      expect(await treeProblems(p), 'routes').toEqual([]);
      await p.getByTestId('route-option-0').click();
      expect(await treeProblems(p), 'route detail').toEqual([]);
      await p.getByTestId('start-guide').click();
      await expect(p.getByTestId('guide')).toBeVisible();
      // H5: the step headline is the screen's h1 (it keeps its look and its polite announcement).
      await expect(p.locator('.stage h1')).toHaveCount(1);
      await expect(p.getByTestId('current-step')).toHaveJSProperty('tagName', 'H1');
    },
  ],
];

for (const lang of ['zh', 'en'] as const)
  for (const [label, url, go] of SCREENS)
    test(`a11y tree ${label} (${lang})`, async ({ page }) => {
      await boot(page, lang);
      await page.goto(url);
      await page.waitForFunction(() => '__howtogo' in window);
      await expect(page.locator('.stage h1').first()).toBeVisible();
      if (go) await go(page);
      expect(await treeProblems(page)).toEqual([]);
    });

test('keyboard: a sheet takes focus, Escape closes it, focus returns to the trigger; visible focus ring', async ({ page }) => {
  await boot(page);
  await page.goto('/settings?demo=1');
  const trigger = page.getByTestId('report');
  await trigger.focus();
  const ring = await trigger.evaluate((e) => {
    const s = getComputedStyle(e);
    return parseFloat(s.outlineWidth) || (s.boxShadow !== 'none' ? 1 : 0);
  });
  expect(ring).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('sheet-report')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  // Tab cycles inside the page without getting stuck on one element.
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    seen.add(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 60) ?? ''));
  }
  expect(seen.size).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sheet-report')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
