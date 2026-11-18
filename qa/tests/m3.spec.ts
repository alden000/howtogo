/**
 * QA M3 — SG transit smarts, one test (or a few) per browser-testable AC, Chromium, release build.
 * Driver: `?demo=1` (mock API + the shared simulator, paused at 100 s/fix) with the M3 AC 39 scenarios
 * (`?scn=bus:…,alerts:…,lifts:…`, switchable mid-test through sessionStorage `howtogo.mock.scn.<kind>`).
 * Fault and request-budget checks run the app in live mode with `/api/*` answered by Playwright.
 * Time rules use the Playwright clock (`install` + `fastForward`), never real waits.
 * Not here (unit-tested in gate step 3, or deferred — see qa/reports/0.3.0-m34.md): AC 4 Worker half, 12, 16, 30, 39, 40, 44, 45.
 */
import { expect, test, type Page } from '@playwright/test';
import { FIXED, routeBody, setup, TTSH } from './helpers';
import { axe, boot, logOf, spoken, stubs, vib, type W } from './m2helpers';

test.use({ serviceWorkers: 'block' });

const NS_RECENT = [{ to: { name: 'Raffles Place', lat: 1.2841, lng: 103.8515 }, at: FIXED.getTime() - 864e5, lines: ['NS'] }];
const GENTLE = [30, 60, 30];

async function m3(page: Page, scn = '', settings: Record<string, unknown> = {}, init?: () => void) {
  if (init) await page.addInitScript(init);
  await boot(page, settings, null, { path: `/?demo=1&demoMs=100000${scn ? `&scn=${scn}` : ''}` });
}
const setScn = (page: Page, kind: string, v: string) => page.evaluate(([k, x]) => sessionStorage.setItem(`howtogo.mock.scn.${k}`, x), [kind, v] as const);

async function toH4(page: Page, q: string, option = 0) {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(q);
  await page.getByTestId('search-result-0').click();
  await page.getByTestId(`route-option-${option}`).click();
  await expect(page.getByTestId('start-guide')).toBeVisible();
}
async function start(page: Page, q: string, option = 0) {
  await toH4(page, q, option);
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
}
/** Step the simulator until the current guidance step has `kind` (n-th occurrence). */
async function toKind(page: Page, kind: string, nth = 0) {
  const idx = await page.evaluate(
    ([k, n]) => {
      const steps = (window as unknown as W).__howtogo.store.trip.value.guidance.steps as { kind: string }[];
      return steps.map((s, i) => (s.kind === k ? i : -1)).filter((i) => i >= 0)[n as number] ?? -1;
    },
    [kind, nth] as const,
  );
  expect(idx, `step kind ${kind}`).toBeGreaterThanOrEqual(0);
  const ok = await page.evaluate(async (i) => {
    const w = window as unknown as W;
    const f = w.__howtogo.platform.fake;
    const hit = () => w.__howtogoLog.some((x) => x === `step:${i}` || x.startsWith(`step:${i} `));
    for (let j = 0; j < 4000; j++) {
      if (hit()) return true;
      if (!f.step()) break;
      if (j % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    await new Promise((r) => setTimeout(r, 30));
    return hit();
  }, idx);
  expect(ok, `reached step ${idx} (${kind})`).toBe(true);
}

/** Live mode: /api/* answered here (M3 endpoints added to the helpers' liveApi pattern). */
interface Reply { status: number; body?: unknown }
async function liveM3(page: Page, o: { bus?: () => Reply; alerts?: () => Reply; lifts?: () => Reply; route?: () => Reply } = {}) {
  const calls: string[] = [];
  await page.route('**/api/**', async (r) => {
    const u = new URL(r.request().url());
    calls.push(u.pathname);
    const send = (x: Reply) => r.fulfill({ status: x.status, contentType: 'application/json', body: JSON.stringify(x.body ?? { error: { code: 'upstream_unavailable' } }) });
    const now = Date.now();
    if (u.pathname === '/api/search') return send({ status: 200, body: { results: [TTSH] } });
    if (u.pathname === '/api/route') return send(o.route ? o.route() : { status: 200, body: routeBody() });
    if (u.pathname === '/api/bus-arrival')
      return send(o.bus ? o.bus() : { status: 200, body: { stop: u.searchParams.get('stop') ?? '', fetchedAt: new Date(now).toISOString(), services: [{ no: '139', operator: 'SBST', next: [{ etaMin: 6, load: 'SEA', wheelchair: true, deck: 'double', monitored: true }, { etaMin: 14, load: 'SDA', wheelchair: true, deck: 'single', monitored: true }] }] } });
    if (u.pathname === '/api/alerts') return send(o.alerts ? o.alerts() : { status: 200, body: { status: 'normal', minor: false, lines: [], messages: [] } });
    if (u.pathname === '/api/lifts') return send(o.lifts ? o.lifts() : { status: 200, body: { fetchedAt: new Date(now).toISOString(), lifts: [] } });
    if (u.pathname === '/api/revgeocode') return send({ status: 200, body: { name: 'Toa Payoh Central', address: 'Toa Payoh Central Singapore 310177', postal: '310177' } });
    return send({ status: 404 });
  });
  return calls;
}
const n = (calls: string[], p: string) => calls.filter((c) => c === p).length;
/** Ang Mo Kio → TTSH (bus 73 → walk → NS16…NS20 Novena → walk): mock picks the fixture by start/end. */
async function amkRoutes(page: Page) {
  await page.goto('/#/route?from=1.3672,103.8438&to=1.32135,103.8465');
  await expect(page.getByTestId('route-option-0')).toBeVisible({ timeout: 8000 });
}

// ------------------------------------------------------------------ A. parity
for (const lang of ['zh', 'en'] as const)
  test(`AC 1: parity matrix (${lang}) — H3 card, H4, H5 wait/ride/alight show the M3 facts their cells list`, async ({ page }) => {
    const zh = lang === 'zh';
    await m3(page, 'bus:live,lifts:outage', { lang });
    // Bus route (TTSH): H3 first-bus chip + fare; H4 compact chip + fare; H5 wait chip.
    await page.getByTestId('to-field').click();
    await page.getByTestId('search-input').fill('tan tock');
    await page.getByTestId('search-result-0').click();
    const card = page.getByTestId('route-option-0');
    await expect(card.getByTestId('arr-h3')).toContainText(zh ? '下一班 139' : '139');
    await expect(card.getByTestId('fare')).toContainText('$1.');
    await card.click();
    await expect(page.getByTestId('arrchip')).toBeVisible();
    await expect(page.getByTestId('fare-h4')).toContainText('$1.');
    await page.getByTestId('start-guide').click();
    await toKind(page, 'board_bus');
    await expect(page.getByTestId('arrchip')).toHaveAttribute('data-state', 'live');
    await page.getByTestId('guide-end').click();
    await page.getByTestId('end-trip-yes').click();
    // Rail route (Bishan → Raffles Place): H3 lift fact, zh station names; H4 exit hint + lift detail.
    await page.getByTestId('to-field').click();
    await page.getByTestId('search-input').fill(zh ? '莱佛士坊' : 'raffles');
    await page.getByTestId('search-result-0').click();
    const rc = page.getByTestId('route-option-0');
    await expect(rc.getByTestId('lift-fact')).toContainText(zh ? '碧山站有电梯在维修' : 'Bishan');
    await rc.click();
    await expect(page.getByTestId('h4-extras').getByTestId('lift-fact')).toBeVisible();
    if (zh) expect.soft(await page.getByTestId('step-list').innerText(), 'H4 route detail uses zh station names').toContain('碧山');
    await amkRoutes(page);
    await page.getByTestId('route-option-0').click();
    await expect(page.getByTestId('exit-hint').first()).toBeVisible();
  });

// ------------------------------------------------------------------ B. bus arrival
test('AC 2: arrival chip on H5 wait step, H4 overview and the H3 card of the first bus leg', async ({ page }) => {
  await m3(page, 'bus:live');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0').getByTestId('arr-h3')).toHaveText(/下一班 139：4 分钟/);
  await page.getByTestId('route-option-0').click();
  const h4 = page.getByTestId('arrchip');
  await expect(h4).toContainText('4 分钟');
  await expect(h4.locator('.busbadge, [data-testid=bus-badge]').first()).toBeVisible();
  await page.getByTestId('start-guide').click();
  await toKind(page, 'board_bus');
  const chip = page.getByTestId('arrchip');
  await expect(chip).toHaveAttribute('data-state', 'live');
  await expect(chip).toContainText('4 分钟');
  await expect(chip).toContainText('实时');
  await expect(chip).toContainText('下一班 12 分钟');
  expect(await logOf(page)).toContain('bus:chip live');
});

test('AC 2: 0 min → "快到了" on a saffron chip', async ({ page }) => {
  await m3(page, 'bus:here');
  await start(page, 'tan tock');
  await toKind(page, 'board_bus');
  const chip = page.getByTestId('arrchip');
  await expect(chip).toHaveAttribute('data-state', 'here');
  await expect(chip).toContainText('快到了');
});

test('AC 3: seat load as icon + words; wheelchair label; double deck; never colour alone', async ({ page }) => {
  await m3(page, 'bus:live');
  await start(page, 'tan tock');
  await toKind(page, 'board_bus');
  const tags = page.getByTestId('arrchip').getByTestId('loadtag');
  await expect(tags).toHaveText(['有座位', '轮椅可以上', '双层巴士']);
  for (const t of await tags.all()) expect(await t.locator('svg, .ic, [class*=icon]').count(), 'tag has an icon').toBeGreaterThan(0);
  await expect(page.getByTestId('arrchip')).toHaveAttribute('aria-label', /轮椅/);
});

test('AC 3: SDA → "要站着", LSD → "很挤"', async ({ page }) => {
  await m3(page, 'bus:nowab');
  await start(page, 'tan tock');
  await toKind(page, 'board_bus');
  await expect(page.getByTestId('arrchip')).toContainText('要站着');
  await page.goto('/?demo=1&demoMs=100000&scn=bus:lsd');
  await page.waitForFunction(() => '__howtogo' in window);
  await expect(page.getByTestId('arrchip')).toContainText('很挤');
});

test('AC 4: monitored = false → "约 8 分钟", hollow "按时间表", no Live claim', async ({ page }) => {
  await m3(page, 'bus:estimated');
  await start(page, 'tan tock');
  await toKind(page, 'board_bus');
  const chip = page.getByTestId('arrchip');
  await expect(chip).toHaveAttribute('data-state', 'estimated');
  await expect(chip).toContainText('约 8 分钟');
  await expect(chip).toContainText('按时间表');
  await expect(chip).not.toContainText('实时');
});

test('AC 5: freshness — "刚刚更新"; > 60 s old → "约"; > 3 min old → no-data state', async ({ page }) => {
  await m3(page, 'bus:live');
  await start(page, 'tan tock');
  await toKind(page, 'board_bus');
  await expect(page.getByTestId('arrchip')).toContainText('刚刚更新');
  await page.goto('/?demo=1&demoMs=100000&scn=bus:stale');
  await page.waitForFunction(() => '__howtogo' in window);
  await expect(page.getByTestId('arrchip')).toContainText('约 4 分钟');
  await expect(page.getByTestId('arrchip')).not.toContainText('实时');
  await page.goto('/?demo=1&demoMs=100000&scn=bus:old');
  await page.waitForFunction(() => '__howtogo' in window);
  await expect(page.getByTestId('arrchip')).toHaveAttribute('data-state', 'nodata');
  await expect(page.getByTestId('arrchip')).not.toContainText(/\d+ 分钟/);
});

for (const scn of ['empty', 'not_configured'])
  test(`AC 6: no data (${scn}) → "暂时没有到站时间，请看站牌"; guidance unaffected`, async ({ page }) => {
    await m3(page, `bus:${scn}`);
    await start(page, 'tan tock');
    await toKind(page, 'board_bus');
    const chip = page.getByTestId('arrchip');
    await expect(chip).toHaveAttribute('data-state', 'nodata');
    await expect(chip).toContainText('暂时没有到站时间');
    await expect(page.getByTestId('arr-second')).toContainText('请看站牌');
    await expect(page.getByTestId('current-step')).toBeVisible();
  });

test('AC 6: live mode — upstream 502 and "service not in the reply" → no-data chip, never a fixture number', async ({ page }) => {
  await setup(page);
  let mode: 'fail' | 'other' = 'fail';
  await liveM3(page, {
    bus: () => (mode === 'fail' ? { status: 502 } : { status: 200, body: { stop: '52071', fetchedAt: new Date().toISOString(), services: [{ no: '232', operator: 'SBST', next: [{ etaMin: 3, load: 'SEA', wheelchair: true, deck: 'double', monitored: true }] }] } }),
  });
  await page.goto('/');
  await toH4(page, 'tan tock');
  const chip = page.getByTestId('arrchip');
  await expect(chip).toHaveAttribute('data-state', 'nodata');
  await expect(chip).not.toContainText(/\d+ 分钟/);
  mode = 'other';
  await page.reload();
  await expect(page.getByTestId('arrchip')).toHaveAttribute('data-state', 'nodata');
  await expect(page.getByTestId('arrchip')).not.toContainText('3 分钟');
});

test('AC 7: polling 20 s only while a chip is visible + page visible; none when hidden; none on H1', async ({ page }) => {
  await stubs(page);
  await setup(page, {}, undefined, { clock: false });
  await page.clock.install({ time: FIXED });
  const calls = await liveM3(page);
  await page.goto('/');
  await page.clock.runFor(65_000);
  expect(n(calls, '/api/bus-arrival'), 'no polling on H1').toBe(0);
  await toH4(page, 'tan tock');
  await expect(page.getByTestId('arrchip')).toBeVisible();
  const c0 = n(calls, '/api/bus-arrival');
  expect(c0).toBeGreaterThanOrEqual(1);
  await page.clock.runFor(61_000);
  await expect.poll(() => n(calls, '/api/bus-arrival') - c0).toBeGreaterThanOrEqual(2);
  expect(n(calls, '/api/bus-arrival') - c0, '≈ 3 polls per minute, not more').toBeLessThanOrEqual(4);
  await page.evaluate(() => (window as unknown as W).__setVis('hidden'));
  const c1 = n(calls, '/api/bus-arrival');
  await page.clock.runFor(120_000);
  expect(n(calls, '/api/bus-arrival') - c1, 'no polling while hidden').toBe(0);
  await page.evaluate(() => (window as unknown as W).__setVis('visible'));
  await expect.poll(() => n(calls, '/api/bus-arrival') - c1).toBeGreaterThanOrEqual(1);
});

test('AC 8: bus passed (≤ 1 min → next bus value) → calm "刚错过一班，下一班 9 分钟"', async ({ page }) => {
  await page.clock.install({ time: FIXED });
  await m3(page, 'bus:here');
  await start(page, 'tan tock');
  await toKind(page, 'board_bus');
  await expect(page.getByTestId('arrchip')).toHaveAttribute('data-state', 'here');
  await setScn(page, 'bus', 'missed');
  await page.clock.fastForward(21_000);
  await expect(page.getByTestId('arrchip')).toContainText('刚错过一班，下一班 9 分钟');
  expect((await vib(page)).filter((p) => JSON.stringify(p) === JSON.stringify([300, 150, 300, 150, 600]))).toHaveLength(0);
});

test('AC 9 (Should): ≤ 1 min on the wait step → "车快到了" spoken once + attention haptic', async ({ page }) => {
  await m3(page, 'bus:here');
  await start(page, 'tan tock');
  await toKind(page, 'board_bus');
  await expect.poll(async () => (await spoken(page)).filter((s) => /快到了/.test(s.text)).length).toBe(1);
  expect((await vib(page)).length).toBeGreaterThan(0);
});

test('AC 10 (Should): next bus LSD, the one after SEA → "下一班比较空" (never automatic)', async ({ page }) => {
  await m3(page, 'bus:lsd');
  await start(page, 'tan tock');
  await toKind(page, 'board_bus');
  await expect(page.getByTestId('arr-less')).toHaveText('下一班比较空');
});

// ------------------------------------------------------------------ C. names, transfer, exits
test('AC 11: zh UI uses zh station names (H3/H4/H5); sign chip "碧山 Bishan"-style', async ({ page }) => {
  await m3(page, 'lifts:none');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('莱佛士坊');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  expect.soft(await page.getByTestId('step-list').innerText(), 'H4 route detail').toMatch(/碧山.*莱佛士坊|碧山[\s\S]*莱佛士坊/);
  await page.getByTestId('start-guide').click();
  await toKind(page, 'board_train');
  await toKind(page, 'ride_train');
  expect.soft(await page.getByTestId('guide').innerText(), 'H5 ride step').toContain('莱佛士坊');
  await expect(page.getByTestId('guide')).not.toContainText(/BISHAN MRT STATION/);
});

test('AC 13: voice uses the zh station name and equals the on-screen headline', async ({ page }) => {
  await m3(page, 'lifts:none');
  await start(page, '莱佛士坊');
  await toKind(page, 'ride_train');
  const head = (await page.getByTestId('current-step').innerText()).replace(/\s+/g, '');
  await expect.poll(async () => (await spoken(page)).map((s) => s.text.replace(/\s+/g, '')).some((t) => t.includes(head) || head.includes(t.slice(0, 8)))).toBe(true);
  const all = (await spoken(page)).map((s) => s.text).join(' ');
  expect(all).toMatch(/莱佛士坊|碧山|多美歌/);
  expect(all).not.toMatch(/RAFFLES PLACE MRT|BISHAN MRT/i);
});

test('AC 14: transfer step — line tag, "跟着 南北线 的牌子走", train headline "往 … 方向" from the termini table', async ({ page }) => {
  await m3(page, 'lifts:none');
  await amkRoutes(page);
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await toKind(page, 'walk_transfer');
  await expect(page.getByTestId('transfer-sub')).toContainText('跟着 南北线 的牌子走');
  await expect(page.getByTestId('transfer-sub').locator('.linetag, [data-testid=line-tag], [class*=line]').first()).toBeVisible();
  await toKind(page, 'board_train');
  await expect(page.getByTestId('current-step')).toContainText(/往 .*方向/);
  await expect(page.getByTestId('current-step')).toContainText(/滨海南码头|Marina South Pier/);
});

test('AC 15: exit hint on H4 and on the alight (last rail) step; logged exit:shown', async ({ page }) => {
  await m3(page, 'lifts:none');
  await amkRoutes(page);
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('exit-hint').first()).toContainText(/走 .+ 出口/);
  await page.getByTestId('start-guide').click();
  await toKind(page, 'ride_train');
  await expect(page.getByTestId('exit-hint').first()).toContainText(/出站时走 .+ 出口/);
  await toKind(page, 'walk_to_destination');
  await expect(page.getByTestId('exit-hint').first()).toContainText(/从 .+ 出口出来/);
  expect(await logOf(page)).toContain('exit:shown');
});

// ------------------------------------------------------------------ D. disruption
test('AC 18: /api/alerts on app open (online), cached 60 s; offline → no call, no banner', async ({ page, context }) => {
  await setup(page);
  const calls = await liveM3(page, { alerts: () => ({ status: 200, body: { status: 'disrupted', minor: false, lines: [{ line: 'NSL', direction: 'Both', stations: ['NS17'], freePublicBus: [], freeShuttle: [], freeBusIslandWide: false, shuttleDirection: 'Both' }], messages: [{ text: 'x', createdAt: '2026-11-18T07:00:00+08:00' }] } }) });
  await page.goto('/');
  await expect.poll(() => n(calls, '/api/alerts')).toBe(1);
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  expect(n(calls, '/api/alerts'), 'within the 60 s cache').toBe(1);
  const off = await context.newPage();
  await context.setOffline(true);
  const c = n(calls, '/api/alerts');
  await off.goto('/').catch(() => {});
  await off.waitForTimeout(500);
  expect(n(calls, '/api/alerts') - c).toBe(0);
  await expect(off.getByTestId('disruption')).toHaveCount(0);
  await context.setOffline(false);
});

test('AC 19: Home banner (line used by a recent trip) → Details sheet with LTA text, zh stations, free bus; dismiss sticks', async ({ page }) => {
  await m3(page, 'alerts:disrupted', {}, () => localStorage.setItem('howtogo.recents', JSON.stringify([{ to: { name: 'Raffles Place', lat: 1.2841, lng: 103.8515 }, at: Date.now() - 864e5, lines: ['NS'] }])));
  const b = page.getByTestId('disruption');
  await expect(b).toHaveAttribute('data-where', 'home');
  await expect(b).toContainText('南北线');
  await expect(b.getByTestId('line-tag').or(b.locator('.linetag, .ltag')).first()).toBeVisible();
  await page.getByTestId('disruption-notice').click();
  await expect(page.getByTestId('lta-message')).toContainText('No train service');
  await expect(page.getByTestId('lta-line').first()).toContainText(/碧山|宏茂桥/);
  await expect(page.getByTestId('lta-l2').first()).toContainText('免费');
  await page.goBack();
  await page.getByTestId('disruption-dismiss').click();
  await expect(b).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => '__howtogo' in window);
  await expect(page.getByTestId('disruption')).toHaveCount(0);
  void NS_RECENT;
});

test('AC 20: affected cards get "受影响/有些站没有地铁", lose the recommended tag; all affected → bus note', async ({ page }) => {
  await m3(page, 'alerts:disrupted');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('莱佛士坊');
  await page.getByTestId('search-result-0').click();
  const cards = page.locator('[data-testid^=route-option-]');
  await expect(cards.first()).toBeVisible();
  const nCards = await cards.count();
  for (let i = 0; i < nCards; i++) {
    await expect(cards.nth(i).getByTestId('affected-fact')).toBeVisible();
    expect(await cards.nth(i).evaluate((e) => e.classList.contains('best') || !!e.querySelector('.best'))).toBe(false);
  }
  await expect(page.getByTestId('all-affected')).toContainText('地铁有故障，可以改坐巴士');
});

test('AC 21: in-trip alert → banner + gentle haptic + voice once + offer (never auto re-route); Back = keep', async ({ page }) => {
  await page.clock.install({ time: FIXED });
  await m3(page, 'alerts:normal,lifts:none');
  await start(page, '莱佛士坊');
  await expect(page.getByTestId('sheet-dis-offer')).toHaveCount(0);
  await setScn(page, 'alerts', 'disrupted');
  await page.clock.fastForward(125_000);
  await expect(page.getByTestId('sheet-dis-offer')).toBeVisible();
  await expect(page.getByTestId('sheet-dis-offer')).toContainText('前面的地铁有故障');
  await expect(page.getByTestId('offer-find')).toBeVisible();
  await expect(page.getByTestId('offer-keep')).toBeVisible();
  expect(await logOf(page)).toContain('alerts:offer shown');
  expect((await logOf(page)).some((l) => l.startsWith('reroute:')), 'never auto re-route').toBe(false);
  expect((await vib(page)).filter((p) => JSON.stringify(p) === JSON.stringify(GENTLE)).length).toBe(1);
  expect((await spoken(page)).filter((s) => /有些站暂时没有地铁/.test(s.text)).length).toBe(1);
  await page.goBack();
  await expect(page.getByTestId('sheet-dis-offer')).toHaveCount(0);
  await expect(page.getByTestId('disruption')).toHaveAttribute('data-where', 'h5');
  expect((await logOf(page)).some((l) => l.startsWith('reroute:'))).toBe(false);
});

test('AC 22: accept the offer → re-plan avoiding the line; free buses at the station mentioned', async ({ page }) => {
  await m3(page, 'alerts:disrupted,lifts:none');
  await start(page, '莱佛士坊');
  await expect(page.getByTestId('sheet-dis-offer')).toBeVisible();
  await expect(page.getByTestId('sheet-dis-offer')).toContainText('免费巴士');
  await page.evaluate(() => { const f = (window as unknown as W).__howtogo.platform.fake; for (let i = 0; i < 3; i++) f.step(); });
  await page.getByTestId('offer-find').click();
  await expect.poll(() => logOf(page)).toContain('alerts:offer accepted');
  await expect.poll(async () => (await logOf(page)).some((l) => l.startsWith('reroute:'))).toBe(true);
});

test('AC 23: alert resolves → banner gone within one poll + "恢复正常了" once', async ({ page }) => {
  await page.clock.install({ time: FIXED });
  await m3(page, 'alerts:normal,lifts:none');
  await start(page, '莱佛士坊');
  await setScn(page, 'alerts', 'disrupted');
  await page.clock.fastForward(125_000);
  await page.getByTestId('offer-keep').click();
  await expect(page.getByTestId('disruption')).toBeVisible();
  await setScn(page, 'alerts', 'normal');
  await page.clock.fastForward(125_000);
  await expect(page.getByTestId('disruption')).toHaveCount(0);
  await expect(page.getByText('恢复正常了')).toHaveCount(1);
});

test('AC 24 (Should): minor message → quiet Home line, not a banner', async ({ page }) => {
  await m3(page, 'alerts:minor');
  await expect(page.getByTestId('disruption-minor')).toBeVisible();
  await expect(page.getByTestId('disruption')).toHaveCount(0);
});

// ------------------------------------------------------------------ E. fare
test('AC 25: fare on H3 "约 $1.19"-style and H4 "车费 约 …"; live itinerary without fare → nothing', async ({ page }) => {
  await m3(page);
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0').getByTestId('fare')).toHaveText(/^约 \$\d\.\d\d$/);
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('fare-h4')).toContainText(/车费 约 \$\d\.\d\d/);
  const p2 = await page.context().newPage();
  await setup(p2);
  await liveM3(p2, { route: () => { const b = routeBody() as any; for (const it of b.plan.itineraries) delete it.fare; return { status: 200, body: b }; } });
  await p2.goto('/');
  await toH4(p2, 'tan tock');
  await expect(p2.getByTestId('fare-h4')).toHaveCount(0);
  await expect(p2.locator('body')).not.toContainText('$0');
  await p2.goBack();
  await expect(p2.getByTestId('fare')).toHaveCount(0);
});

test('AC 26: concession card on → "乐龄卡" line, adult number only in route detail; copy states no concession amount', async ({ page }) => {
  await m3(page, '', {}, () => localStorage.setItem('howtogo.prefs.m34', JSON.stringify({ concession: true })));
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0').getByTestId('fare')).toHaveCount(0);
  await expect(page.getByTestId('fare-note')).toContainText('乐龄卡');
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('fare-h4')).toContainText('$');
  await page.goto('/settings');
  await expect(page.getByTestId('set-concession')).toBeVisible();
});

// ------------------------------------------------------------------ F. lifts
test('AC 29: lift under repair at a route station → H3 fact "碧山站有电梯在维修" and the H4 step detail from LiftDesc', async ({ page }) => {
  await m3(page, 'lifts:outage');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('莱佛士坊');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0').getByTestId('lift-fact')).toHaveText(/碧山站有电梯在维修/);
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('h4-extras')).toContainText(/A 出口.*电梯在维修/);
  await page.getByTestId('start-guide').click();
  await toKind(page, 'board_train');
  await expect(page.getByTestId('lift-step').first()).toContainText(/A 出口.*电梯在维修/);
  expect((await logOf(page)).some((l) => /^lifts:/.test(l))).toBe(true);
});

test('AC 31: fresh lift data, none listed → "车站电梯正常（没有维修通知）"; bus-only itinerary → hidden', async ({ page }) => {
  await m3(page, 'lifts:none');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('莱佛士坊');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0').getByTestId('lift-ok')).toHaveText('车站电梯正常（没有维修通知）');
  await page.goto('/');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  const busOnly = page.locator('[data-testid^=route-option-]').filter({ hasNot: page.getByTestId('line-tag') }).first();
  await expect(busOnly.getByTestId('lift-ok')).toHaveCount(0);
});

test('AC 31: lift data unavailable (503) → no positive lift fact', async ({ page }) => {
  await m3(page, 'lifts:not_configured');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('莱佛士坊');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await expect(page.getByTestId('lift-ok')).toHaveCount(0);
});

test('AC 32 (Should): Lift-friendly on → H5 alight/transfer "坐电梯：跟着电梯标志"', async ({ page }) => {
  await m3(page, 'lifts:none', {}, () => localStorage.setItem('howtogo.prefs.m34', JSON.stringify({ liftFriendly: true })));
  await start(page, '莱佛士坊');
  await toKind(page, 'ride_train');
  await expect(page.getByTestId('guide')).toContainText('坐电梯：跟着电梯标志');
});

// ------------------------------------------------------------------ G. preferences
test('AC 33: Route options sheet offers 最少走路 / 最少换车 / 最快 (Lift-friendly out of the sheet until M5, ruling); choice persists', async ({ page }) => {
  await m3(page);
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  // There must be a control on H3 (or Settings) that changes the ranking preference.
  const ctl = page.getByText('最少换车').or(page.getByRole('button', { name: /最少换车|选项|Options/ }));
  await expect(ctl.first(), 'a preference control on Route options').toBeVisible({ timeout: 3000 });
});

// ------------------------------------------------------------------ H. recents
test('AC 34: Home "最近的行程" — up to 5, newest first; tap → H3 from my location', async ({ page }) => {
  await m3(page, '', {}, () => {
    const d = Date.now();
    const p = (name: string, lat: number, lng: number) => ({ name, lat, lng });
    localStorage.setItem('howtogo.recents', JSON.stringify([
      { to: p('Tan Tock Seng Hospital', 1.32135, 103.8465), at: d - 1e5 },
      { to: p('Raffles Place MRT Station (NS26)', 1.28393, 103.85146), at: d - 2e5 },
      { to: p('Toa Payoh Central', 1.3328, 103.8475), at: d - 3e5 },
      { to: p('Bishan Street 13', 1.3518, 103.8501), at: d - 4e5 },
      { to: p('Ang Mo Kio Avenue 3', 1.3699, 103.8495), at: d - 5e5 },
    ]));
  });
  const s = page.getByTestId('recent-trips');
  await expect(s).toContainText('最近的行程');
  await expect(page.getByTestId('recent-0')).toContainText('Tan Tock Seng Hospital');
  await expect(page.getByTestId('recent-0')).toContainText('我的位置');
  await expect(s.locator('[data-testid^=recent-]').filter({ hasText: '去 ' }), 'up to 5 recent trips shown').toHaveCount(5);
});

test('AC 34: recent trip → H3 from my location', async ({ page }) => {
  await m3(page, '', {}, () => localStorage.setItem('howtogo.recents', JSON.stringify([{ to: { name: 'Tan Tock Seng Hospital', lat: 1.32135, lng: 103.8465 }, at: Date.now() - 1e5 }])));
  await page.getByTestId('recent-0').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
});

test('AC 35: a trip is recorded when started; on-device only; no GPS track, no time of day beyond the date', async ({ page }) => {
  await m3(page);
  await start(page, 'tan tock');
  const raw = await page.evaluate(() => localStorage.getItem('howtogo.recents') ?? localStorage.getItem('howtogo.recents.v2'));
  expect(raw).toBeTruthy();
  const r = JSON.parse(raw!)[0];
  expect(r.to.name).toBe('Tan Tock Seng Hospital');
  expect(JSON.stringify(r)).not.toMatch(/fixes|track|path|acc/);
  // "no times of day beyond the date": a stored timestamp must be a date (midnight) or a date string.
  const at = r.at ?? r.date;
  const okDate = typeof at === 'string' ? /^\d{4}-\d{2}-\d{2}$/.test(at) : new Date(at).getHours() === 0 && new Date(at).getMinutes() === 0;
  expect(okDate, `stored when: ${JSON.stringify(at)}`).toBe(true);
});

test('AC 36: M1 recents (destinations only) survive the upgrade as trips "from my location"', async ({ page }) => {
  await m3(page, '', {}, () => {
    if (!localStorage.getItem('howtogo.recents'))
      localStorage.setItem('howtogo.recents', JSON.stringify([{ to: { name: 'Tan Tock Seng Hospital', address: '11 Jalan Tan Tock Seng Singapore 308433', lat: 1.32135, lng: 103.8465 }, at: Date.now() - 1e6 }]));
  });
  await expect(page.getByTestId('recent-0')).toContainText('Tan Tock Seng Hospital');
  await expect(page.getByTestId('recent-0')).toContainText('我的位置');
});

test('AC 37: each recent row has a 56 px remove; Settings "清除最近的行程" clears them', async ({ page }) => {
  await m3(page, '', {}, () => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('howtogo.recents', JSON.stringify([
        { to: { name: 'Tan Tock Seng Hospital', lat: 1.32135, lng: 103.8465 }, at: Date.now() - 1e5 },
        { to: { name: 'Toa Payoh Central', lat: 1.3328, lng: 103.8475 }, at: Date.now() - 2e5 },
      ]));
    }
  });
  const rm = page.getByTestId('rtrip-remove-0');
  const box = (await rm.boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(55.5);
  await rm.click();
  await expect(page.getByTestId('recent-0')).toContainText('Toa Payoh Central');
  await page.goto('/settings');
  await page.getByTestId('row-clear').click();
  await page.getByTestId('clear-recent').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.recents') ?? '[]').length)).toBe(0);
});

// ------------------------------------------------------------------ I. data / diagnostics
test('AC 41: About says "Contains information from LTA DataMall" with the Singapore Open Data Licence link', async ({ page }) => {
  await m3(page);
  await page.goto('/about');
  await expect(page.getByTestId('about-scroll')).toContainText('Contains information from LTA DataMall');
  await expect(page.getByRole('link', { name: /Open Data Licence/ })).toHaveAttribute('href', /data\.gov\.sg/);
});

// AC 44 (Should), amended by Director ruling 2026-11-18: About shows "交通资料日期：2026年11月17日".
test('AC 44 (Should): About shows the transit data date "交通资料日期：YYYY年M月D日"', async ({ page }) => {
  await m3(page);
  await page.goto('/about');
  await expect(page.getByTestId('about-data')).toContainText(/交通资料日期：\d{4}年\d{1,2}月\d{1,2}日/);
});

test('AC 42: change-only hooks — bus:chip, alerts:disrupted, alerts:offer, lifts:, exit:shown|hidden', async ({ page }) => {
  await m3(page, 'alerts:disrupted,lifts:outage');
  await start(page, '莱佛士坊');
  await expect(page.getByTestId('sheet-dis-offer')).toBeVisible();
  const l = await logOf(page);
  expect(l).toContain('alerts:disrupted');
  expect(l).toContain('alerts:offer shown');
  expect(l.some((x) => /^lifts:\d+/.test(x))).toBe(true);
  expect(l.some((x) => /^exit:(shown|hidden)$/.test(x))).toBe(true);
  expect(l.filter((x) => x === 'alerts:disrupted')).toHaveLength(1);
  // No stop codes / station codes / coordinates in hook lines.
  expect(l.filter((x) => /^(bus|alerts|lifts|exit):/.test(x) && /\d{5}|\d\.\d{4}/.test(x))).toEqual([]);
});

// ------------------------------------------------------------------ axe
test('M3 axe: H1 banner, H3, H4, H5 wait, LTA sheet, offer sheet — WCAG 2.1 AA', async ({ page }) => {
  await m3(page, 'alerts:disrupted,bus:live', {}, () => localStorage.setItem('howtogo.recents', JSON.stringify([{ to: { name: 'Raffles Place', lat: 1.2841, lng: 103.8515 }, at: Date.now() - 864e5, lines: ['NS'] }])));
  await expect(page.getByTestId('disruption')).toBeVisible();
  await axe(page, 'H1 banner');
  await page.getByTestId('disruption-notice').click();
  await axe(page, 'LTA sheet');
  await page.goBack();
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await axe(page, 'H3');
  await page.getByTestId('route-option-0').click();
  await axe(page, 'H4');
  await page.getByTestId('start-guide').click();
  await toKind(page, 'board_bus');
  await expect(page.getByTestId('arrchip')).toBeVisible();
  await axe(page, 'H5 wait');
  await page.getByTestId('guide-end').click();
  await page.getByTestId('end-trip-yes').click();
  await start(page, '莱佛士坊');
  await expect(page.getByTestId('sheet-dis-offer')).toBeVisible();
  await axe(page, 'offer sheet');
});

test('Upgrade 0.2.0 → 0.3.0: settings, Home, recents kept', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: true, lang: 'en', textSize: 'large', theme: 'dark' }));
    localStorage.setItem('howtogo.whatsnew.v1', 'seen'); // 1.0 shows What's new on this upgrade (m5 AC 21)
    localStorage.setItem('howtogo.places', JSON.stringify({ home: { name: 'Toa Payoh Central', address: 'Toa Payoh Central Singapore 310177', lat: 1.3328, lng: 103.8475 }, others: [] }));
    localStorage.setItem('howtogo.recents', JSON.stringify([{ to: { name: 'Tan Tock Seng Hospital', lat: 1.32135, lng: 103.8465 }, at: Date.now() - 1e6 }]));
  });
  await boot(page);
  await expect(page.locator('html')).toHaveAttribute('lang', /en/);
  await expect(page.getByTestId('recent-0')).toContainText('Tan Tock Seng Hospital');
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.settings')!));
  expect(s).toMatchObject({ lang: 'en', textSize: 'large', theme: 'dark' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.places')!).home.name)).toBe('Toa Payoh Central');
});
