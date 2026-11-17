/**
 * QA M2 re-check smoke: one bus trip (Toa Payoh → Tan Tock Seng) end to end in zh / en / dark / 200 %.
 * H5 → H6 (next) → H6b (now) → H12, controls ≥ 56 px, no sideways scroll, axe on H5 and H6.
 * Screenshots go to qa/.out/smoke/ for a human look (not baselines).
 */
import { expect, test } from '@playwright/test';
import { auditControls, axe, boot, logOf, runUntil, startTo } from './m2helpers';

test.use({ serviceWorkers: 'block' });

const CASES = [
  { name: 'zh-light-100', s: { lang: 'zh' }, re: /[一-鿿]/ },
  { name: 'en-light-100', s: { lang: 'en' }, re: /^[\x00-\x7F -ɏ·’‘“”…–—]+$/ },
  { name: 'zh-dark-100', s: { lang: 'zh', theme: 'dark' }, re: /[一-鿿]/ },
  { name: 'zh-light-200', s: { lang: 'zh', textSize: 'xxlarge' }, re: /[一-鿿]/ },
] as const;

for (const c of CASES)
  test(`smoke bus trip ${c.name}: H5 → H6 → H6b → H12`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, c.s);
    await startTo(page, 'tan tock');
    const head = (await page.getByTestId('current-step').innerText()).trim();
    expect(head, 'headline language').toMatch(c.re);
    await auditControls(page);
    await axe(page, `H5 ${c.name}`);
    await page.screenshot({ path: `.out/smoke/${c.name}-H5.png` });
    await runUntil(page, 'alert:next');
    await expect(page.getByTestId('getoff-next')).toBeVisible();
    await auditControls(page);
    await axe(page, `H6 ${c.name}`);
    await page.screenshot({ path: `.out/smoke/${c.name}-H6.png` });
    await page.getByTestId('getoff-ack').click();
    await runUntil(page, 'alert:now');
    await page.screenshot({ path: `.out/smoke/${c.name}-H6b.png` });
    await runUntil(page, 'trip:arrived');
    await expect(page.getByTestId('arrived')).toBeVisible();
    await auditControls(page);
    await page.screenshot({ path: `.out/smoke/${c.name}-H12.png` });
    const log = await logOf(page);
    expect(log.indexOf('alert:next')).toBeLessThan(log.indexOf('alert:now'));
  });
