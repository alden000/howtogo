/**
 * M3/M4 fix round B (QA-36…46): Help on H2, Help order + "let family see me" (trip share / help-only share),
 * offline 需要网络 rows, Where-am-I postal, My places editor, relation radiogroup, share create 429.
 * Mock API + demo GPS. Fake SG test numbers only.
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

type W = Window & { __howtogo: any; __opened: string[] };
const MEI = { name: '美玲', relation: 'daughter', phone: '+6591234567', callMe: '妈妈', lang: 'zh' };

async function boot(page: Page, o: { scn?: string; contacts?: unknown[]; places?: unknown } = {}) {
  await hermetic(page);
  await page.addInitScript(() => {
    const w = window as unknown as W;
    w.__opened = [];
    window.open = ((u: string) => (w.__opened.push(String(u)), null)) as typeof window.open;
    (navigator as unknown as { vibrate: () => boolean }).vibrate = () => true;
  });
  await onboarded(page, { motion: 'on' });
  if (o.contacts) await page.addInitScript((c) => localStorage.getItem('howtogo.family.v1') || localStorage.setItem('howtogo.family.v1', JSON.stringify(c)), o.contacts);
  if (o.places) await page.addInitScript((p) => localStorage.getItem('howtogo.places') || localStorage.setItem('howtogo.places', JSON.stringify(p)), o.places);
  await page.goto(`/?demo=1&demoMs=100000${o.scn ? `&scn=${o.scn}` : ''}`);
  await page.waitForFunction(() => '__howtogo' in window);
}
const opened = (page: Page) => page.evaluate(() => (window as unknown as W).__opened);
const waText = async (page: Page) => decodeURIComponent((await opened(page)).at(-1)!.split('text=')[1]!);
async function startTo(page: Page, query: string) {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(query);
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
}
/** The Help sheet is a lazy chunk (M5 integration, Home budget): wait for its last row before reading the order. */
const helpIds = async (page: Page) => {
  await expect(page.getByTestId('help-995')).toBeVisible();
  return page.locator('[data-testid=sheet-help] [data-testid^=help-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
};

test('QA-36: H2 Search has Help', async ({ page }) => {
  await boot(page, { contacts: [MEI] });
  await page.getByTestId('to-field').click();
  await page.getByTestId('bar-help').click();
  await expect(page.getByTestId('sheet-help')).toBeVisible();
});

test('QA-37: Home Help — §6e.3 order + "让家人看到我在哪里" → help-only share → WhatsApp; "我没事了" ends it', async ({ page }) => {
  await boot(page, { contacts: [MEI] });
  await page.getByTestId('nav-help').click();
  expect(await helpIds(page)).toEqual(['help-call', 'help-driver', 'help-where', 'help-share-loc', 'help-995']);
  await expect(page.getByTestId('help-share-loc')).toContainText('让家人看到我在哪里');
  await expect(page.getByTestId('help-share-loc')).toContainText('用 WhatsApp 发链接给美玲');
  await page.getByTestId('help-share-loc').click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  expect((await opened(page))[0]).toMatch(/^https:\/\/wa\.me\/6591234567\?text=/);
  expect(await waText(page)).toMatch(/^我需要帮忙，我在这里：http:\/\/localhost:\d+\/t\/[A-Za-z0-9]{12}$/);
  const hs = await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.helpshare.v1') ?? 'null'));
  expect(hs?.fam).toBe('美玲');
  const state = await page.evaluate((id) => JSON.parse(localStorage.getItem(`howtogo.mockshare.${id}`) ?? 'null'), hs.id);
  expect(state).toMatchObject({ destName: '我在这里', status: 'help' });
  expect(state.lat).toBeGreaterThan(1);
  // Home note while family's page shows help; the share row is gone from Help meanwhile.
  await expect(page.getByTestId('help-note')).toContainText('美玲 的页面显示你需要帮忙');
  await page.getByTestId('nav-help').click();
  await expect(page.getByTestId('help-share-loc')).toHaveCount(0);
  await page.goBack();
  await page.getByTestId('help-ok').click();
  await expect(page.getByTestId('help-note')).toHaveCount(0);
  await expect(page.getByTestId('toast-help-ok')).toContainText('已经停止分享');
  expect(await page.evaluate(() => localStorage.getItem('howtogo.helpshare.v1'))).toBeNull();
  expect(await logOf(page)).toContain('share:help-only-ended');
});

test('QA-37: on a trip, the row starts the trip share in help → pill help; 我没事了 → sharing', async ({ page }) => {
  await boot(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-help').click();
  const ids = await helpIds(page);
  expect(ids.indexOf('help-share-loc')).toBe(ids.indexOf('help-reroute') + 1);
  expect(ids.at(-1)).toBe('help-995');
  await page.getByTestId('help-share-loc').click();
  await expect(page.getByTestId('share-pill')).toHaveAttribute('data-state', 'help');
  expect(await waText(page)).toMatch(/^我需要帮忙，我在这里：.*\/t\/[A-Za-z0-9]{12}$/);
  await page.getByTestId('help-ok').click();
  await expect(page.getByTestId('share-pill')).toHaveAttribute('data-state', 'sharing');
});

test('QA-39 + AC 47: offline Help — re-route and share rows say 需要网络; share falls back to a plain WhatsApp text', async ({ page, context }) => {
  await boot(page, { contacts: [MEI] });
  await startTo(page, 'tan tock');
  await context.setOffline(true);
  await page.getByTestId('guide-help').click();
  await expect(page.getByTestId('help-reroute')).toContainText('需要网络');
  await expect(page.getByTestId('help-share-loc')).toContainText('需要网络');
  await page.getByTestId('help-share-loc').click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  expect(await waText(page)).toMatch(/^我需要帮忙。/);
  await context.setOffline(false);
});

test('QA-45: share create rate-limited → "请稍后再试"; Help share falls back to plain text', async ({ page }) => {
  await boot(page, { contacts: [MEI], scn: 'share:rate_limited' });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-copy').click();
  await expect(page.getByTestId('share-failed')).toContainText('请稍后再试');
  await page.goBack();
  await page.getByTestId('guide-help').click();
  await page.getByTestId('help-share-loc').click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  expect(await waText(page)).toMatch(/^我需要帮忙。我在这里：/);
  expect(await logOf(page)).toContain('state:help-share-limited');
});

test('QA-38: Where am I — address, postal code; Near line only when the building differs', async ({ page }) => {
  await boot(page, { contacts: [MEI] });
  await page.getByTestId('nav-help').click();
  await page.getByTestId('help-where').click();
  const card = page.getByTestId('driver-card');
  await expect(card).toContainText('Toa Payoh Central');
  await expect(card.locator('.postal')).toContainText('310177');
  await expect(page.getByTestId('here-near')).toHaveCount(0);
});

test('QA-40: Settings → My places — add, rename, ↑↓, remove (confirm), Home first, Home tiles follow', async ({ page }) => {
  await boot(page, { places: { home: { name: 'Toa Payoh Central', lat: 1.3328, lng: 103.8475 }, others: [] } });
  await page.goto('/settings');
  await page.getByTestId('row-places').click();
  await expect(page.getByTestId('place-home')).toContainText('Toa Payoh Central');
  for (const q of ['tan tock', 'raffles']) {
    await page.getByTestId('place-add').click();
    await page.getByTestId('search-input').fill(q);
    await page.getByTestId('search-result-0').click();
    await expect(page.getByTestId('places')).toBeVisible();
  }
  await expect(page.getByTestId('place-0')).toContainText('Tan Tock Seng Hospital');
  await page.getByTestId('place-rename-0').click();
  await page.getByTestId('place-name').fill('诊所');
  await page.getByTestId('place-save').click();
  await expect(page.getByTestId('place-0')).toContainText('诊所');
  await page.getByTestId('place-down-0').click();
  await expect(page.getByTestId('place-1')).toContainText('诊所');
  await expect(page.getByTestId('place-down-1')).toBeFocused();
  await page.getByTestId('place-remove-0').click();
  await page.getByTestId('place-remove-go').click();
  await expect(page.getByTestId('place-1')).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.places')!));
  expect(stored.others.map((o: { label: string }) => o.label)).toEqual(['诊所']);
  await page.goto('/');
  await expect(page.locator('.tiles .tile').first()).toHaveAttribute('data-k', 'home');
  await expect(page.getByTestId('tile-place-0')).toHaveAttribute('data-k', 'clinic');
  await expect(page.getByTestId('tile-place-0')).toContainText('诊所');
});

test('QA-40: My places stops at 6 with Home (5 others) and says so', async ({ page }) => {
  const others = Array.from({ length: 5 }, (_, i) => ({ name: `Place ${i}`, label: `Place ${i}`, lat: 1.3 + i / 100, lng: 103.85 }));
  await boot(page, { places: { home: { name: 'Toa Payoh Central', lat: 1.3328, lng: 103.8475 }, others } });
  await page.goto('/places');
  await expect(page.getByTestId('place-add')).toHaveCount(0);
  await expect(page.getByTestId('place-max')).toContainText('最多 6 个地方');
});

test('QA-42: relation chips are a radiogroup — aria-checked, no aria-pressed, one tab stop, arrows move', async ({ page }) => {
  await boot(page);
  await page.goto('/family/edit');
  const chips = page.locator('[role=radiogroup] [role=radio]');
  await expect(chips.first()).toHaveAttribute('aria-checked', 'true');
  expect(await page.locator('[role=radio][aria-pressed]').count()).toBe(0);
  expect(await chips.evaluateAll((els) => els.filter((e) => e.getAttribute('tabindex') === '0').length)).toBe(1);
  await chips.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('rel-son')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('rel-son')).toBeFocused();
});
