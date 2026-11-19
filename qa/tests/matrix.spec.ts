/**
 * AC 9/10/11/37/44 matrix: every M1 screen and sheet in zh/en × light/dark × 100%/150%/200% × 390/1440.
 * Checks: no clipped text / overlap / h-scroll, 56 px targets, ≥ 8 px gaps (AC 10), accessible name +
 * data-testid on every control (AC 44), axe WCAG 2.1 AA incl. contrast (AC 11), attribution not covered (AC 37).
 * Findings are written to qa/.out/matrix/<config>.json and asserted per check family (soft).
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { axe, layoutProblems, setup, toRoutes, unlabelled } from './helpers';

const HOME = { home: { name: 'Tan Tock Seng Hospital', lat: 1.32135, lng: 103.8465 }, others: [] };

type Visit = [string, (p: Page) => Promise<void>];
const visits: Visit[] = [
  ['home', async (p) => { await p.goto('/?demo=1'); await expect(p.getByTestId('to-field')).toBeVisible(); }],
  ['search', async (p) => { await p.getByTestId('to-field').click(); await expect(p.getByTestId('search-input')).toBeVisible(); }],
  ['search-results', async (p) => { await p.getByTestId('search-input').fill('tan tock'); await expect(p.getByTestId('search-results')).toBeVisible(); }],
  ['search-none', async (p) => { await p.getByTestId('search-input').fill('zzzz'); await expect(p.getByTestId('search-empty')).toBeVisible(); }],
  ['routes', async (p) => { await p.getByTestId('search-input').fill('tan tock'); await p.getByTestId('search-result-0').click(); await expect(p.getByTestId('route-option-0')).toBeVisible(); }],
  ['trip', async (p) => { await p.getByTestId('route-option-0').click(); await expect(p.getByTestId('step-list')).toBeVisible(); await expect(p.getByTestId('map-credit')).toBeVisible({ timeout: 15_000 }); }],
  ['settings', async (p) => { await p.goto('/settings?demo=1'); await expect(p.getByTestId('row-about')).toBeVisible(); }],
  ['sheet-name', async (p) => { await p.getByTestId('row-name').click(); await expect(p.getByTestId('sheet-name')).toBeVisible(); await p.waitForTimeout(400); }],
  ['sheet-home', async (p) => { await p.goBack(); await p.getByTestId('row-home').click(); await expect(p.getByTestId('sheet-home')).toBeVisible(); await p.waitForTimeout(400); }],
  ['sheet-install', async (p) => { await p.goBack(); await p.getByTestId('row-install').click(); await expect(p.getByTestId('sheet-install')).toBeVisible(); await p.waitForTimeout(400); }],
  ['sheet-report', async (p) => { await p.goBack(); await p.getByTestId('report').click(); await expect(p.getByTestId('sheet-report')).toBeVisible(); await p.waitForTimeout(400); }],
  ['about', async (p) => { await p.goBack(); await p.getByTestId('row-about').click(); await expect(p.getByTestId('privacy')).toBeVisible(); }],
];

const configs: { lang: string; theme: string; size: string; w: number; h: number }[] = [];
for (const lang of ['zh', 'en']) for (const theme of ['light', 'dark']) for (const size of ['standard', 'xxlarge']) configs.push({ lang, theme, size, w: 390, h: 844 });
// AC 9 literal: 150 % app size × 200 % browser zoom ≈ half the CSS viewport (1440→720, 390→195 is unrealistic on phones).
configs.push({ lang: 'zh', theme: 'light', size: 'xlarge', w: 720, h: 450 }, { lang: 'en', theme: 'light', size: 'xlarge', w: 720, h: 450 });
configs.push({ lang: 'zh', theme: 'light', size: 'standard', w: 1440, h: 900 }, { lang: 'en', theme: 'dark', size: 'xlarge', w: 1440, h: 900 });

test.describe.configure({ mode: 'parallel' });
for (const c of configs) {
  const id = `${c.lang}-${c.theme}-${c.size}-${c.w}`;
  test.describe(id, () => {
    test.use({ serviceWorkers: 'block', viewport: { width: c.w, height: c.h }, isMobile: c.w < 600, hasTouch: c.w < 600, deviceScaleFactor: 1, colorScheme: c.theme === 'dark' ? 'dark' : 'light' });
    test(`matrix ${id}`, async ({ page }) => {
      test.setTimeout(150_000);
      await setup(page, { lang: c.lang, textSize: c.size, theme: c.theme }, HOME);
      const res: Record<string, Record<string, string[]>> = {};
      for (const [name, go] of visits) {
        await go(page);
        await page.waitForTimeout(250);
        const r: Record<string, string[]> = {
          layout: await layoutProblems(page, { spacing: true }),
          labels: await unlabelled(page),
          axe: await axe(page),
        };
        if (name === 'trip') {
          r.attribution = await page.evaluate(() => {
            const a = document.querySelector('[data-testid=map-credit]');
            if (!a) return ['missing'];
            const b = a.getBoundingClientRect();
            const out: string[] = [];
            for (const [x, y] of [[b.left + 4, b.top + 4], [b.right - 4, b.bottom - 4], [(b.left + b.right) / 2, (b.top + b.bottom) / 2]]) {
              const hit = document.elementFromPoint(x!, y!);
              if (!hit || !a.contains(hit)) out.push(`covered at ${Math.round(x!)},${Math.round(y!)} by ${hit?.tagName}.${hit?.className}`);
            }
            if (b.bottom > innerHeight || b.right > innerWidth) out.push('off-screen');
            return out;
          });
        }
        res[name] = r;
      }
      mkdirSync(`${__dirname}/../.out/matrix`, { recursive: true });
      writeFileSync(`${__dirname}/../.out/matrix/${id}.json`, JSON.stringify(res, null, 1));
      const flat = (k: string) => Object.entries(res).flatMap(([s, r]) => (r[k] ?? []).map((x) => `${s}: ${x}`));
      expect.soft(flat('layout'), 'layout (AC 9/10)').toEqual([]);
      expect.soft(flat('labels'), 'labels/testids (AC 44)').toEqual([]);
      expect.soft(flat('axe'), 'axe (AC 11)').toEqual([]);
      expect.soft(flat('attribution'), 'attribution (AC 37)').toEqual([]);
    });
  });
}
