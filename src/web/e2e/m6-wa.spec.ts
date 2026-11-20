/**
 * M6 W-A `/android` (STYLE-GUIDE 6h.9): the Worker's server-rendered page, rendered here from
 * src/worker/src/android-page.ts (the dev suite has no Worker) with a placeholder URL. States ready / from /
 * unavailable / ios at 390 and 1440, plus the 320 px no-horizontal-scroll check. Axe runs in QA's suite.
 * Re-record: qa/scripts/dev-e2e-docker.sh e2e/m6-wa.spec.ts --update-snapshots=all
 */
import { expect, test, type Page } from '@playwright/test';
// Loaded at run time (not a static import): the web typecheck must not pull in the Worker's types.
const PAGE_MODULE: string = '../../worker/src/android-page';
let renderAndroidPage: (p: unknown) => string;
test.beforeAll(async () => {
  ({ renderAndroidPage } = await import(PAGE_MODULE));
});

const REL = { versionName: '1.1.0', versionCode: 1010000, date: '2026-11-20', size: 1_775_687, sha256: '4bb787a30af2a0c8bc14a3a3f45ffeb3d44a95db4a534744f35b052dd6e0bbec', path: '/android/howtogo-1.1.0.apk' };
type State = 'ready' | 'from' | 'unavailable' | 'ios';
const input = (state: State, lang: 'zh' | 'en') => ({
  lang,
  release: state === 'unavailable' ? null : REL,
  from: state === 'from' ? '1.0.1' : null,
  ios: state === 'ios',
  pageUrl: 'https://example.invalid/android',
  nonce: 'n0nce',
});

test.use({ serviceWorkers: 'block', deviceScaleFactor: 1 });

async function render(page: Page, state: State, lang: 'zh' | 'en', width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/*', (r) => r.abort()); // the page makes no requests of its own (6h.9: no third parties)
  await page.setContent(renderAndroidPage(input(state, lang)), { waitUntil: 'load' });
}

for (const state of ['ready', 'from', 'unavailable', 'ios'] as State[]) {
  for (const [w, lang] of [[390, 'zh'], [1440, 'en']] as const) {
    test(`W-A ${state} ${w} ${lang}`, async ({ page }) => {
      await render(page, state, lang, w);
      if (state === 'unavailable') await expect(page.locator('body')).toContainText(lang === 'zh' ? '现在下载不了' : "isn't available right now");
      if (state === 'ready') await expect(page.locator('a[download], a[href$=".apk"]').first()).toBeVisible();
      await expect(page).toHaveScreenshot(`M6-WA-${state}-${w}-${lang}.png`, { fullPage: true });
    });
  }
}

test('W-A at 320 px: no horizontal scroll in any state, targets ≥ 56 px', async ({ page }) => {
  for (const state of ['ready', 'from', 'unavailable', 'ios'] as State[]) {
    for (const lang of ['zh', 'en'] as const) {
      await render(page, state, lang, 320);
      const r = await page.evaluate(() => ({
        hscroll: document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1,
        small: [...document.querySelectorAll<HTMLElement>('a.btn, button')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 55.5).map((e) => e.textContent),
      }));
      expect(r.hscroll, `${state} ${lang}`).toBe(false);
      expect(r.small, `${state} ${lang}`).toEqual([]);
    }
  }
});
