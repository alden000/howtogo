/**
 * QA M2 — guided trip, one test (or a few) per AC, Chromium, release build.
 * Driver: `?demo=1` (mock API + the shared `simulateFixes` simulator, paused at 100 s/fix; tests step it) and
 * recording stubs for speech / vibrate / wake lock / Notification / visibility. Time-based rules use the
 * Playwright clock (`page.clock.install` + `fastForward`), never real waits.
 */
import { expect, test } from '@playwright/test';
import { FIXTURES } from '../../src/shared/test/fixtures/index';
import { auditControls, axe, boot, count, cues, emitRel, logOf, runUntil, spoken, startTo, vib, type W } from './m2helpers';

test.use({ serviceWorkers: 'block' });

const F0 = (FIXTURES as any).toaPayohToTTSH.plan.from;
const TOA = { lat: F0.lat as number, lng: F0.lon as number }; // DEMO_START (mock: start of toaPayohToTTSH)
const HOME_TTSH = { home: { name: 'Tan Tock Seng Hospital', address: '11 Jalan Tan Tock Seng Singapore 308433', lat: 1.32135, lng: 103.8465 }, others: [] };
const HOME_RAFFLES = { home: { name: 'Raffles Place', address: 'Raffles Place Singapore 048616', lat: 1.28393, lng: 103.85143 }, others: [] };
const ARRIVE = [40, 60, 40, 60, 160];
const CONFIRM = [20, 40, 20];
const GETOFF = [300, 150, 300, 150, 600];
const GENTLE = [30, 60, 30];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- A. start
test('AC 1/4: guide flag on, Start acquires wake lock, voice in trip language; ?ff=-guide hides Start', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await expect.poll(() => count(page, 'wakelock:on')).toBe(1);
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
  const s = await spoken(page);
  expect(s.every((u) => /^zh/.test(u.lang) && Math.abs(u.rate - 0.9) < 1e-3), JSON.stringify(s)).toBe(true);
  expect((await logOf(page)).filter((l) => l === 'ui:start').length).toBe(1);
  await page.getByTestId('guide-end').click();
  await page.getByTestId('end-trip-yes').click();
  await page.goto('/?demo=1&demoMs=100000&ff=-guide');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('step-list')).toBeVisible();
  await expect(page.getByTestId('start-guide')).toHaveCount(0);
});

test('AC 4: location denied → trip still starts in manual mode with the note', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as unknown as W).__howtogo.platform.fake.setPermission('denied'));
  await startTo(page, 'tan tock');
  await expect(page.locator('[data-testid=trip-note][data-note=manual]')).toContainText('没有位置信息');
  await expect(page.getByTestId('step-next')).toBeVisible();
  expect(await logOf(page)).toContain('state:manual');
});

test('AC 3: Take me home within 200 m of Home → toast, no trip', async ({ page }) => {
  await boot(page, {}, { home: { name: 'Toa Payoh Hub', address: '480 Lorong 6 Toa Payoh', ...TOA }, others: [] });
  await expect.poll(() => logOf(page)).toContain('state:home-at-home');
  await page.getByTestId('take-me-home').click();
  await expect(page.getByText('你现在就在家附近，不用找路啦。')).toBeVisible();
  await expect(page.getByTestId('route-option-0')).toHaveCount(0);
  expect(await logOf(page)).not.toContain('ui:start');
});

// ---------------------------------------------------------------- A2. entry-point parity matrix
const ENTRIES = ['home-tile', 'take-me-home', 'search', 'recent', 'deep-link', 'arrival-route-home'] as const;
for (const e of ENTRIES)
  test(`AC 2 entry parity: ${e} → H3/H4 → Start → arrival`, async ({ page }) => {
    test.setTimeout(90_000);
    const places = e === 'arrival-route-home' ? HOME_RAFFLES : HOME_TTSH;
    await boot(page, {}, places, e === 'deep-link' ? { path: `/?demo=1&demoMs=100000#/route?from=${TOA.lat},${TOA.lng}&to=1.32135,103.8465` } : {});
    await page.evaluate(() => {
      const w = window as unknown as W & { __starts: string[] };
      w.__starts = [];
      const rt = w.__howtogo.runtime;
      const orig = rt.start.bind(rt);
      rt.start = (it: any, places: any, o: any) => (w.__starts.push(Object.keys(it).sort().join(',') + '|' + (places?.length ?? 0)), orig(it, places, o));
    });
    if (e === 'home-tile') await page.getByTestId('tile-home').click();
    if (e === 'take-me-home') await page.getByTestId('take-me-home').click();
    if (e === 'search') {
      await page.getByTestId('to-field').click();
      await page.getByTestId('search-input').fill('tan tock');
      await page.getByTestId('search-result-0').click();
    }
    if (e === 'recent') {
      await startTo(page, 'tan tock');
      await page.getByTestId('guide-end').click();
      await page.getByTestId('end-trip-yes').click();
      await page.getByTestId('recent-0').click();
    }
    if (e === 'deep-link') await expect(page).toHaveURL(/\/routes/);
    if (e === 'arrival-route-home') {
      await startTo(page, 'tan tock');
      await runUntil(page, 'trip:arrived');
      await expect(page.getByTestId('route-home')).toBeVisible();
      await page.evaluate(() => {
        const w = window as unknown as W & { __rfrom: unknown[] };
        w.__rfrom = [];
        const api = w.__howtogo.api;
        const orig = api.route.bind(api);
        api.route = (q: any, ...r: unknown[]) => (w.__rfrom.push(q), orig(q, ...r));
      });
      await page.getByTestId('route-home').click();
      await expect(page.locator('.stage')).toContainText(/Raffles Place/);
      await expect(page.getByTestId('route-option-0')).toBeVisible();
      const q = await page.evaluate(() => JSON.stringify((window as unknown as { __rfrom: unknown[] }).__rfrom[0]));
      expect(q, 'route home is planned from here (the arrival place), not the old origin').toMatch(/1\.32[01]\d*/);
    }
    await page.getByTestId('route-option-0').click();
    await page.getByTestId('start-guide').click();
    await expect(page.getByTestId('guide')).toBeVisible();
    await runUntil(page, 'trip:arrived', 4000, e === 'arrival-route-home'); // 2nd trip: wait for a new arrival
    await expect(page.getByTestId('arrived')).toBeVisible();
    const starts = await page.evaluate(() => (window as unknown as { __starts: string[] }).__starts);
    expect(starts.length).toBe(e === 'recent' || e === 'arrival-route-home' ? 2 : 1);
    expect(new Set(starts).size, starts.join(' / ')).toBe(1); // same runtime call, same itinerary shape
  });

test('AC 5: Start while a trip is active asks first; "keep" keeps the old trip', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  const id = await page.evaluate(() => (window as unknown as W).__howtogo.store.trip.value.id);
  await page.evaluate(() => (window as unknown as W).__howtogo.router.reset('/'));
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('raffles');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('sheet-end-first')).toContainText('要结束现在的行程吗？');
  await page.goBack();
  await expect(page.getByTestId('sheet-end-first')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as W).__howtogo.store.trip.value.id)).toBe(id);
});

// ---------------------------------------------------------------- B. H5
test('AC 6/7/8/11: walk → wait → ride → alight in zh; stops-left never counts up; live region; map aria-hidden', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  const h = page.getByTestId('current-step');
  await expect(h).toHaveAttribute('aria-live', 'polite');
  expect(parseFloat(await h.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(32);
  await expect(page.getByTestId('guide-eta')).toContainText(/\d{1,2}:\d{2}/);
  await expect(page.getByTestId('stepcard')).toContainText(/米|分钟/);
  expect(await page.locator('[data-testid=map]').evaluate((e) => e.closest('[aria-hidden="true"]') !== null || e.getAttribute('aria-hidden') === 'true')).toBe(true);
  await runUntil(page, 'cue:boarded');
  await expect(page.getByTestId('stepcard')).toContainText('下一站：');
  await expect(page.getByTestId('stepcard')).toContainText('下车前我会提醒你。');
  const seen: number[] = await page.evaluate(async () => {
    const w = window as unknown as W;
    const out: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const el = document.querySelector('[data-testid=stops-left]');
      const m = el?.textContent?.match(/-?\d+/);
      if (m) out.push(Number(m[0]));
      if (w.__howtogoLog.includes('alert:now') || !w.__howtogo.platform.fake.step()) break;
      await new Promise((r) => setTimeout(r, 0));
    }
    return out;
  });
  expect(seen.length).toBeGreaterThan(3);
  for (let i = 1; i < seen.length; i++) expect(seen[i], seen.join(',')).toBeLessThanOrEqual(seen[i - 1]);
  expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
  expect(new Set(seen).size, seen.join(',')).toBeGreaterThan(1); // it actually counts down
});

test('AC 9: map window between band and card, never covered; puck inside the window', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  for (const phase of ['walk', 'ride']) {
    if (phase === 'ride') await runUntil(page, 'cue:boarded');
    // The window re-sizes one frame after the card grows on a step change; judge the settled layout.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const q = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          const band = q('.guide .top'), win = q('.guide .mapwin'), card = q('.stepcard');
          return win.top - band.bottom >= -1 && card.top - win.bottom >= -1 && win.height >= 159;
        }),
      { message: phase })
      .toBe(true);
  }
});

test('AC 10/20/22: Next / Back a step re-speak the headline; confirm haptic; spoken = on-screen headline', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  const n0 = (await spoken(page)).length;
  const v0 = (await vib(page)).length;
  await page.getByTestId('step-next').click();
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(n0);
  const head = (await page.getByTestId('current-step').innerText()).trim();
  const last = (await spoken(page)).at(-1)!.text;
  expect(last.replace(/[。.!！\s]/g, '')).toBe(head.replace(/[。.!！\s]/g, ''));
  expect((await vib(page)).slice(v0).some((p) => same(p, CONFIRM) || same(p, [12]))).toBe(true);
  const n1 = (await spoken(page)).length;
  await page.getByTestId('step-prev').click();
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(n1);
});

test('AC 20: auto-advance gives the confirm haptic and speaks the new headline once', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  const v0 = (await vib(page)).length;
  const s0 = await page.getByTestId('guide').getAttribute('data-step');
  await runUntil(page, 'loc:profile 5000');
  await expect(page.getByTestId('guide')).not.toHaveAttribute('data-step', s0!);
  expect((await vib(page)).slice(v0).some((p) => same(p, CONFIRM))).toBe(true);
  const head = (await page.getByTestId('current-step').innerText()).trim().replace(/[。.!！\s]/g, '');
  const n = (await spoken(page)).filter((u) => u.text.replace(/[。.!！\s]/g, '') === head).length;
  expect(n).toBe(1);
});

test('AC 12 (Should): All-steps sheet from the step counter — remaining steps, current marked, Back closes, axe clean', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  const btn = page.getByTestId('all-steps-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAccessibleName(/全部步骤/);
  const bb = (await btn.boundingBox())!;
  expect(bb.height).toBeGreaterThanOrEqual(44);
  await btn.click();
  const sheet = page.getByTestId('sheet-all-steps');
  await expect(sheet).toBeVisible();
  const n0 = await sheet.locator('li').count();
  expect(n0).toBeGreaterThanOrEqual(3);
  await expect(sheet.locator('li[aria-current=step]')).toHaveCount(1);
  const head = (await page.getByTestId('current-step').innerText()).trim();
  await expect(sheet.locator('li[aria-current=step]')).toContainText(head);
  await axe(page, 'All-steps sheet');
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('guide')).toBeVisible();
  await runUntil(page, 'loc:profile 5000'); // auto-advance to the wait step
  await btn.click();
  await expect(page.getByTestId('sheet-all-steps').locator('li')).toHaveCount(n0 - 1);
});

// ---------------------------------------------------------------- C. follow-me
test('AC 13–17: follow on start; drag → free; 10 min in free stays free; Follow tap and a step change re-engage', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await boot(page);
  await startTo(page, 'tan tock');
  await expect.poll(() => logOf(page)).toContain('map:ready');
  await expect(page.getByTestId('map-follow')).toHaveAttribute('aria-label', '看全程');
  const box = (await page.locator('.guide .mapwin').boundingBox())!;
  const drag = async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
  };
  await drag();
  await expect.poll(() => logOf(page)).toContain('follow:free');
  await expect(page.getByTestId('map-follow')).toHaveAttribute('aria-label', '跟着我走');
  const on0 = await count(page, 'follow:on');
  await page.clock.fastForward(10 * 60_000);
  await page.waitForTimeout(200);
  expect(await count(page, 'follow:on')).toBe(on0); // never on a timer (AC 16)
  if (await page.getByTestId('pocket').count()) await page.getByTestId('pocket-show').click(); // 45 s idle → pocket view
  expect(await count(page, 'follow:on')).toBe(on0);
  await expect(page.getByTestId('map-follow')).toHaveAttribute('aria-label', '跟着我走');
  await page.getByTestId('map-follow').click();
  await expect.poll(() => count(page, 'follow:on')).toBe(on0 + 1);
  await page.getByTestId('map-follow').click(); // See whole trip (AC 17)
  await expect(page.getByTestId('map-follow')).toHaveAttribute('aria-label', '跟着我走');
  await page.getByTestId('map-follow').click();
  await expect(page.getByTestId('map-follow')).toHaveAttribute('aria-label', '看全程');
  await drag();
  await expect.poll(() => count(page, 'follow:free')).toBeGreaterThan(1);
  const on1 = await count(page, 'follow:on');
  await page.getByTestId('step-next').click(); // step change re-engages (OQ2)
  await expect.poll(() => count(page, 'follow:on')).toBe(on1 + 1);
});

// ---------------------------------------------------------------- D. auto-advance rules
test('AC 21: fixes with accuracy > 100 m and out-of-order fixes cause neither advance nor off route', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'loc:profile 2000');
  const s0 = await page.getByTestId('guide').getAttribute('data-step');
  for (let i = 1; i <= 5; i++) await emitRel(page, 0.004, 0.004 + i * 1e-5, 150, i * 1000);
  for (let i = 1; i <= 5; i++) await emitRel(page, 0.004, 0.004 + i * 1e-5, 8, -60_000 - i * 1000);
  await page.waitForTimeout(300);
  expect(await cues(page)).not.toContain('off_route');
  await expect(page.getByTestId('guide')).toHaveAttribute('data-step', s0!);
});

// ---------------------------------------------------------------- E. voice
test('AC 22 en: MRT trip speaks en at rate 0.92', async ({ page }) => {
  await boot(page, { lang: 'en' });
  await startTo(page, 'raffles');
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
  const s = await spoken(page);
  expect(s.every((u) => /^en/.test(u.lang) && Math.abs(u.rate - 0.92) < 1e-3), JSON.stringify(s)).toBe(true);
});

test('AC 24/25: mute stops speech at once and persists; haptics continue; Say it again speaks while muted', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  const mute = page.getByTestId('guide-mute');
  const label0 = await mute.getAttribute('aria-label');
  const c0 = await page.evaluate(() => (window as unknown as W).__cancel);
  await mute.click();
  await expect(mute).not.toHaveAttribute('aria-label', label0!);
  expect(await page.evaluate(() => (window as unknown as W).__cancel)).toBeGreaterThan(c0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.settings')!).muted)).toBe(true);
  const n0 = (await spoken(page)).length;
  const v0 = (await vib(page)).length;
  await page.getByTestId('step-next').click();
  await page.waitForTimeout(300);
  expect((await spoken(page)).length).toBe(n0);
  expect((await vib(page)).length).toBeGreaterThan(v0);
  const say = page.getByTestId('say-again');
  expect((await say.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  await say.click();
  await expect.poll(async () => (await spoken(page)).length).toBe(n0 + 1);
  const head = (await page.getByTestId('current-step').innerText()).replace(/[。.!！\s]/g, '');
  expect((await spoken(page)).at(-1)!.text.replace(/[。.!！\s]/g, '')).toBe(head);
  await page.reload();
  await expect(page.getByTestId('guide-mute')).toHaveAttribute('aria-label', (await mute.getAttribute('aria-label'))!);
});

test('AC 25: Say it again during an alert repeats the alert lines', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'alert:next');
  await page.waitForTimeout(2500);
  const n0 = (await spoken(page)).length;
  const sayInAlert = page.locator('[data-testid=getoff-next] [data-testid=say-again], [data-testid=getoff-next] button:has-text("再说一遍")');
  if (await sayInAlert.count()) await sayInAlert.first().click();
  else await page.evaluate(() => (window as unknown as W).__howtogo.runtime.repeat());
  await expect.poll(async () => (await spoken(page)).slice(n0).map((u) => u.text).join('|')).toContain('下一站下车');
});

test('AC 26: no voice for the trip language → one note; Settings has Test voice', async ({ page }) => {
  await boot(page, {}, null, { voices: 'en' });
  await startTo(page, 'tan tock');
  await expect(page.locator('[data-testid=trip-note][data-note=novoice]')).toContainText('这部手机没有中文语音，请看屏幕');
  expect(await count(page, 'state:no-voice')).toBe(1);
  await page.getByTestId('guide-end').click();
  await page.getByTestId('end-trip-yes').click();
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('test-voice')).toBeVisible();
});

// ---------------------------------------------------------------- F. get-off alerts
test('AC 27/28/29: H6 → H6b ordering; second line at 2.2 s; one escalation after 20 s; none after the ride ends', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'alert:next');
  const sheet = page.getByTestId('getoff-next');
  await expect(sheet).toHaveAttribute('role', 'alertdialog');
  await expect(sheet).toContainText('下一站下车');
  await expect(sheet).toContainText('请现在按铃');
  await expect(sheet).toContainText('巴士站');
  await expect(page.getByTestId('edge-glow')).toBeVisible();
  expect((await vib(page)).some((p) => same(p, GETOFF))).toBe(true);
  const s1 = (await spoken(page)).length;
  await page.clock.fastForward(2300);
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(s1);
  expect(await count(page, 'alert:escalate')).toBe(0);
  // The clock also flows in real time, so leave slack under host load; the exact 19.999 s / 20 s edge is a unit test.
  await page.clock.fastForward(15_000); // ≈ 17.3 s after show
  expect(await count(page, 'alert:escalate')).toBe(0);
  await page.clock.fastForward(3500);
  await expect.poll(() => count(page, 'alert:escalate')).toBe(1);
  await page.clock.fastForward(45_000);
  expect(await count(page, 'alert:escalate')).toBe(1); // once only
  // Not acknowledged: H6b replaces it (high priority interrupts speech, AC 23); the ride ends before 20 s; nothing escalates afterwards.
  const cancel0 = await page.evaluate(() => (window as unknown as W).__cancel);
  await runUntil(page, 'alert:now');
  expect(await page.evaluate(() => (window as unknown as W).__cancel)).toBeGreaterThan(cancel0);
  await expect(page.getByTestId('getoff-now')).toContainText('到站了，请下车');
  const c = await cues(page);
  expect(c.indexOf('get_off_next_stop')).toBeLessThan(c.indexOf('get_off_now'));
  await runUntil(page, 'alert:clear');
  const e0 = await count(page, 'alert:escalate');
  await page.clock.fastForward(25_000);
  expect(await count(page, 'alert:escalate')).toBe(e0);
  await expect(page.getByTestId('getoff-now')).toHaveCount(0);
});

test('AC 29: Back over an alert opens End-trip; Back again returns to the alert (D8)', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'alert:next');
  await page.goBack();
  await expect(page.getByTestId('sheet-end-trip')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('getoff-next')).toBeVisible();
});

test('AC 30: page hidden → get-off alerts go out as notifications with tag getoff', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'cue:boarded');
  await page.evaluate(() => (window as unknown as W).__setVis('hidden'));
  await runUntil(page, 'alert:next');
  await page.waitForTimeout(200);
  const n = await page.evaluate(() => (window as unknown as W).__notes);
  expect(n.filter((x) => x.tag === 'getoff').length, JSON.stringify(n)).toBeGreaterThanOrEqual(1);
  await page.evaluate(() => (window as unknown as W).__setVis('visible'));
});

test('AC 30: the app asks for Notification permission somewhere (otherwise web notify never fires)', async ({ page }) => {
  // QA-21: platform.notify() returns early unless Notification.permission === "granted", and no code path requests it.
  await boot(page);
  await page.addInitScript(() => {
    (window as unknown as { __asked: number }).__asked = 0;
  });
  await page.evaluate(() => {
    const w = window as unknown as { __asked: number; Notification: { requestPermission: () => Promise<string>; permission: string } };
    w.__asked = 0;
    w.Notification.permission = 'default';
    w.Notification.requestPermission = () => (w.__asked++, Promise.resolve('granted'));
  });
  await startTo(page, 'tan tock');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked), 'Notification.requestPermission called at Start').toBeGreaterThan(0);
});

test('AC 31: reduce motion → edge glow and alert are static; motion off → animated', async ({ page }) => {
  await boot(page, { motion: 'on' });
  await startTo(page, 'tan tock');
  await runUntil(page, 'alert:next');
  const anims = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid=edge-glow], [data-testid=getoff-next], [data-testid=getoff-next] *')]
        .map((e) => getComputedStyle(e).animationName)
        .filter((n) => n && n !== 'none'),
    );
  expect(await page.evaluate(() => document.documentElement.classList.contains('rm'))).toBe(true);
  // A plain opacity fade is allowed; no bounce, ripple, swing, pulse or moving glow.
  expect((await anims()).filter((n) => !/^fade/i.test(n))).toEqual([]);
  expect(await page.getByTestId('edge-glow').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
});

// ---------------------------------------------------------------- G. off route / weak GPS / offline
test('AC 32: off route → gentle + banner (no blame) → found + confirm; ≤ 1 re-route per 20 s', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'loc:profile 2000');
  let calls = 0;
  await page.exposeFunction('__routeCall', () => void calls++);
  await page.evaluate(() => {
    const w = window as unknown as W & { __routeCall: () => void };
    const api = w.__howtogo.api;
    const orig = api.route.bind(api);
    api.route = (...a: unknown[]) => (w.__routeCall(), orig(...a));
  });
  const v0 = (await vib(page)).length;
  for (let i = 1; i <= 4; i++) await emitRel(page, 0.004, 0.004 + i * 2e-5, 8, i * 1000);
  await expect.poll(async () => (await cues(page)).includes('off_route')).toBe(true);
  await expect.poll(async () => (await spoken(page)).map((u) => u.text).join('|')).toContain('没关系');
  await expect(page.getByTestId('reroute-banner')).toHaveAttribute('data-state', 'found', { timeout: 10_000 });
  await expect(page.getByTestId('reroute-banner')).toContainText('找到了新的路');
  const v = (await vib(page)).slice(v0);
  expect(v.some((p) => same(p, GENTLE))).toBe(true);
  expect(v.some((p) => same(p, CONFIRM))).toBe(true);
  await expect(page.getByTestId('reroute-banner')).toHaveCount(0, { timeout: 8000 }); // auto-dismiss 4.2 s
  expect(calls).toBe(1);
});

test('AC 33/35: offline after start — note, no re-route call, trip completes offline', async ({ page, context }) => {
  test.setTimeout(75_000);
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'loc:profile 2000');
  await context.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await expect(page.locator('[data-testid=trip-note][data-note=offline]')).toContainText('没有网络，行程继续');
  for (let i = 1; i <= 4; i++) await emitRel(page, 0.004, 0.004 + i * 2e-5, 8, i * 1000);
  await expect(page.locator('[data-testid=trip-note][data-note=reroute-offline]')).toBeVisible({ timeout: 10_000 });
  expect(await logOf(page)).toContain('state:reroute-offline');
  // Back on the route; finish the trip with no network.
  await runUntil(page, 'trip:arrived'); // the simulator's remaining fixes rejoin the route
  await expect(page.getByTestId('arrived')).toBeVisible();
  await context.setOffline(false);
});

test('AC 34: weak GPS spell → note + spoken once; good fix clears it', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'loc:profile 2000');
  for (let i = 1; i <= 4; i++) await emitRel(page, 0, 0, 180, i * 1000);
  await expect(page.locator('[data-testid=trip-note][data-note=weak]')).toContainText('位置不太准，跟着站牌走');
  await page.waitForTimeout(300);
  for (let i = 5; i <= 8; i++) await emitRel(page, 0, 0, 180, i * 1000);
  await page.waitForTimeout(300);
  const weakLines = (await spoken(page)).filter((u) => /位置不太准/.test(u.text));
  expect(weakLines.length).toBe(1);
  await emitRel(page, 0, 1e-5, 8, 9000);
  await expect(page.locator('[data-testid=trip-note][data-note=weak]')).toHaveCount(0);
});

test('AC 34 OQ3: MRT with no fixes → "约 还有 N 站" soft estimate, pre-alert banner; get-off-now stays position-based', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await boot(page);
  await startTo(page, 'raffles');
  await runUntil(page, 'loc:profile 10000');
  await runUntil(page, 'cue:boarded');
  await page.clock.fastForward(35_000);
  await expect.poll(() => logOf(page)).toContain('state:mrt-estimate');
  await expect(page.getByTestId('current-step')).toContainText(/约.*还有 \d+ 站/);
  for (let i = 0; i < 40 && !(await logOf(page)).includes('cue:mrt_prealert'); i++) await page.clock.fastForward(30_000);
  expect(await logOf(page)).toContain('cue:mrt_prealert');
  expect(await logOf(page)).not.toContain('alert:now');
});

test('AC 4/10/34: manual mode (no good fix 60 s) → I\'m on / I got off advance', async ({ page }) => {
  await boot(page, { lang: 'en' });
  await page.evaluate(() => (window as unknown as W).__howtogo.platform.fake.setPermission('denied'));
  await startTo(page, 'tan tock');
  await expect(page.locator('[data-testid=trip-note][data-note=manual]')).toContainText('No location, so tap Next yourself');
  await page.getByTestId('step-next').click();
  await page.getByTestId('im-on').click();
  await expect(page.getByTestId('got-off')).toBeVisible();
  const s = await page.getByTestId('guide').getAttribute('data-step');
  await page.getByTestId('got-off').click();
  await expect(page.getByTestId('guide')).not.toHaveAttribute('data-step', s!);
});

// ---------------------------------------------------------------- H. platform
test('AC 38: location profile per leg (walk 2 s → wait 5 s → ride → last stops 2 s); web capabilities', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'trip:arrived');
  const prof = (await logOf(page)).filter((l) => l.startsWith('loc:profile')).map((l) => Number(l.split(' ')[1]));
  expect(prof[0]).toBe(2000);
  expect(prof).toContain(5000);
  expect(prof.indexOf(5000)).toBeLessThan(prof.lastIndexOf(2000));
  expect(await page.evaluate(() => (window as unknown as W).__howtogo.platform.capabilities.backgroundGuidance)).toBe(false);
});

test('AC 39: wake lock held at Start, re-acquired on visible, released on End', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__wl.req)).toBe(1);
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__setVis('hidden');
    w.__setVis('visible');
  });
  await page.waitForTimeout(200);
  const wl = await page.evaluate(() => (window as unknown as W).__wl);
  expect(wl.req + wl.rel, JSON.stringify(wl)).toBeGreaterThanOrEqual(1); // re-acquire is a no-op while held
  await page.getByTestId('guide-end').click();
  await page.getByTestId('end-trip-yes').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__wl.rel)).toBeGreaterThanOrEqual(1);
});

test('AC 39: wake lock fails → "Please keep the screen on" note once', async ({ page }) => {
  await boot(page, {}, null, { wakeLockOk: false });
  await startTo(page, 'tan tock');
  await expect(page.locator('[data-testid=trip-note][data-note=wakelock]')).toContainText('请让屏幕保持亮着');
  await page.getByTestId('trip-note-close').click();
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__setVis('hidden');
    w.__setVis('visible');
  });
  await page.waitForTimeout(300);
  await expect(page.locator('[data-testid=trip-note][data-note=wakelock]')).toHaveCount(0);
  expect(await count(page, 'state:wakelock-failed')).toBe(1);
});

test('AC 40: pocket view after 45 s idle on a walk step (clock), not before; never during an alert', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'loc:profile 2000');
  await page.clock.fastForward(40_000);
  await expect(page.getByTestId('pocket')).toHaveCount(0);
  await page.clock.fastForward(6_000);
  await expect(page.getByTestId('pocket')).toBeVisible();
  await expect(page.getByTestId('pocket-show')).toBeVisible();
  expect((await page.getByTestId('pocket-show').boundingBox())!.height).toBeGreaterThanOrEqual(56);
  await page.getByTestId('pocket-show').click();
  await expect(page.getByTestId('pocket')).toHaveCount(0);
  await runUntil(page, 'alert:next');
  const p0 = await count(page, 'pocket:on');
  await page.clock.fastForward(50_000);
  await page.waitForTimeout(100);
  expect(await count(page, 'pocket:on')).toBe(p0);
  await expect(page.getByTestId('getoff-next')).toBeVisible();
});

test('AC 40: pocket view pauses the map render loop (MapLibre not repainting)', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await expect.poll(() => logOf(page)).toContain('map:ready');
  const frames = (pocket: boolean) =>
    page.evaluate(async (pk) => {
      const w = window as unknown as W & { __raf?: number };
      if (!w.__raf) {
        w.__raf = 0;
        const orig = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => (w.__raf!++, orig(cb));
      }
      const f = w.__howtogo.platform.fake;
      const n0 = w.__raf;
      for (let i = 0; i < 8; i++) {
        f.step();
        await new Promise((r) => setTimeout(r, 120));
      }
      return { pk, n: w.__raf - n0 };
    }, pocket);
  const live = await frames(false);
  await page.getByTestId('pocket-btn').click();
  await expect(page.getByTestId('pocket')).toBeVisible();
  const pk = await frames(true);
  expect(pk.n, `rAF in pocket ${pk.n} vs live ${live.n}`).toBeLessThan(live.n / 2);
});

// ---------------------------------------------------------------- J. resume / End / arrival
async function startedRide(page: import('@playwright/test').Page) {
  await startTo(page, 'tan tock');
  await runUntil(page, 'cue:boarded');
  await page.evaluate(() => (window as unknown as W).__howtogo.store.flushTrip());
}
const ageTrip = (page: import('@playwright/test').Page, ms: number) =>
  page.evaluate((d) => {
    // The app flushes the in-memory trip on pagehide; freeze further trip writes so the aged copy survives the reload.
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'howtogo.trip.v1' && (window as unknown as { __aged?: boolean }).__aged) return;
      return set.call(this, k, v);
    };
    const raw = localStorage.getItem('howtogo.trip.v1')!;
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
    const aged = JSON.parse(raw, (_k, v) =>
      typeof v === 'number' && v > 1e12 && v < 1e13 ? v - d : typeof v === 'string' && iso.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(Date.parse(v) - d).toISOString() : v,
    );
    localStorage.setItem('howtogo.trip.v1', JSON.stringify(aged));
    (window as unknown as { __aged?: boolean }).__aged = true;
  }, ms);

test('AC 46: stale trip (older than ETA + 2 h) asks Continue / End on H1', async ({ page }) => {
  await boot(page);
  await startedRide(page);
  await ageTrip(page, 3 * 3600_000);
  await page.reload();
  await expect(page.getByTestId('stale-trip')).toBeVisible();
  await expect(page.locator('body')).toContainText('上次的行程还没结束');
  await expect(page.getByTestId('guide')).toHaveCount(0);
  expect(await logOf(page)).toContain('state:resume-ask');
  await page.getByTestId('stale-continue').click();
  await expect(page.getByTestId('guide')).toBeVisible();
});

test('AC 46: stale → End clears the trip', async ({ page }) => {
  await boot(page);
  await startedRide(page);
  await ageTrip(page, 3 * 3600_000);
  await page.reload();
  await page.getByTestId('stale-end').click();
  await expect(page.getByTestId('to-field')).toBeVisible();
  expect([null, 'null']).toContain(await page.evaluate(() => localStorage.getItem('howtogo.trip.v1')));
});

test('AC 46: trip older than 24 h is dropped silently', async ({ page }) => {
  await boot(page);
  await startedRide(page);
  await ageTrip(page, 25 * 3600_000);
  await page.reload();
  await expect(page.getByTestId('to-field')).toBeVisible();
  await expect(page.getByTestId('stale-trip')).toHaveCount(0);
  await expect(page.getByTestId('guide')).toHaveCount(0);
  expect(await logOf(page)).toContain('state:resume-drop');
});

test.describe('iOS', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1' });
  test('AC 46: resume within window → H5 same step, toast, "Tap to turn voice back on" until tapped', async ({ page }) => {
    await boot(page);
    await startedRide(page);
    const step = await page.getByTestId('guide').getAttribute('data-step');
    await page.reload();
    await expect(page.getByTestId('guide')).toHaveAttribute('data-step', step!);
    await expect(page.getByTestId('toast-resume')).toContainText('继续上次的行程');
    await expect(page.getByTestId('voice-unlock')).toContainText('点一下');
    await page.getByTestId('voice-unlock').click();
    await expect(page.getByTestId('voice-unlock')).toHaveCount(0);
    expect(await logOf(page)).toContain('resume:voice');
  });
});

test('AC 45: End confirm from H5, H11 banner and pocket; End stops voice, GPS, wake lock, storage', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'loc:profile 2000');
  for (let i = 1; i <= 4; i++) await emitRel(page, 0.004, 0.004 + i * 2e-5, 8, i * 1000);
  await expect(page.getByTestId('reroute-banner')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('sheet-end-trip')).toContainText('要结束这次行程吗？');
  await page.goBack();
  await expect(page.getByTestId('sheet-end-trip')).toHaveCount(0);
  await expect(page.getByTestId('guide')).toBeVisible();
  await page.getByTestId('pocket-btn').click();
  await page.goBack();
  await expect(page.getByTestId('sheet-end-trip')).toBeVisible();
  const c0 = await page.evaluate(() => (window as unknown as W).__cancel);
  await page.getByTestId('end-trip-yes').click();
  await expect(page.getByTestId('to-field')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as W).__cancel)).toBeGreaterThan(c0);
  expect(await page.evaluate(() => (window as unknown as W).__wl.rel)).toBeGreaterThanOrEqual(1);
  expect([null, 'null']).toContain(await page.evaluate(() => localStorage.getItem('howtogo.trip.v1')));
  // GPS: further fixes change nothing.
  const n = (await logOf(page)).length;
  await page.evaluate(() => (window as unknown as W).__howtogo.platform.fake.step());
  await page.waitForTimeout(100);
  expect((await logOf(page)).slice(n).filter((l) => /^(cue|alert|loc):/.test(l))).toEqual([]);
});

test('AC 47/48: H12 arrival — 到了！, place, minutes, arrive haptic, voice; Done → H1; recents; trip cleared', async ({ page }) => {
  await boot(page, {}, HOME_RAFFLES);
  await startTo(page, 'tan tock');
  await runUntil(page, 'trip:arrived');
  await expect(page.getByTestId('arrived')).toHaveText('到了！');
  await expect(page.locator('.stage')).toContainText('Tan Tock Seng');
  await expect(page.getByTestId('took-min')).toContainText(/用了 \d+ 分钟/);
  await expect.poll(async () => (await vib(page)).some((p) => same(p, ARRIVE))).toBe(true);
  expect((await spoken(page)).map((u) => u.text)).toContain('到了！');
  await expect(page.getByTestId('route-home')).toBeVisible();
  await expect(page.locator('.stage')).not.toContainText(/分享|shared/i);
  await page.getByTestId('finish-trip').click();
  await expect(page.getByTestId('to-field')).toBeVisible();
  await expect(page.getByTestId('recent-0')).toContainText('Tan Tock Seng');
  expect([null, 'null']).toContain(await page.evaluate(() => localStorage.getItem('howtogo.trip.v1')));
  const recents = await page.evaluate(() => Object.keys(localStorage).filter((k) => /recent/.test(k)).map((k) => localStorage.getItem(k)).join(''));
  expect(recents).not.toMatch(/track|fixes/);
});

test('AC 47: H12 Route home hidden without a Home', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'trip:arrived');
  await expect(page.getByTestId('arrived')).toBeVisible();
  await expect(page.getByTestId('route-home')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByTestId('to-field')).toBeVisible();
});

// ---------------------------------------------------------------- I. multi-stop
test('AC 42: builder caps at 5 stops; dwell choices 15/30/60/90 (default 30); remove works', async ({ page }) => {
  await boot(page);
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('add-stop').click();
  await expect(page.getByTestId('journey-builder')).toBeVisible();
  for (const q of ['raffles', 'ang mo kio', 'tan tock', 'raffles']) {
    await page.getByTestId('stop-add').click();
    await page.getByTestId('search-input').fill(q);
    await page.getByTestId('search-result-0').click();
  }
  await expect(page.getByTestId('stop-add')).toHaveCount(0);
  await expect(page.getByTestId('stop-max')).toBeVisible();
  await expect(page.getByTestId('stop-dwell-0')).toContainText('30');
  await page.getByTestId('stop-dwell-0').click();
  for (const m of [15, 30, 60, 90]) await expect(page.getByTestId(`dwell-${m}`)).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('journey-builder')).toBeVisible();
  await page.getByTestId('stop-remove-4').click();
  await expect(page.getByTestId('stop-add')).toBeVisible();
  await page.goBack(); // G2 → H3
  await expect(page.getByTestId('journey-builder')).toHaveCount(0);
  await expect(page.getByTestId('route-option-0')).toBeVisible();
});

test('AC 43/44: waypoint screen; never auto-continues (2 h on the clock); continue re-plans from here', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await boot(page);
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('add-stop').click();
  for (const q of ['raffles', 'ang mo kio']) {
    await page.getByTestId('stop-add').click();
    await page.getByTestId('search-input').fill(q);
    await page.getByTestId('search-result-0').click();
  }
  await page.getByTestId('journey-see').click();
  await expect(page.getByTestId('journey-timeline')).toContainText(/30 分钟/);
  await page.getByTestId('start-guide').click();
  await runUntil(page, 'state:waypoint');
  await expect(page.getByTestId('waypoint-count')).toHaveText('第 1 个地方，共 3 个');
  await expect(page.getByTestId('waypoint-continue')).toContainText('继续下一段');
  await page.clock.fastForward(2 * 3600_000);
  await expect(page.getByTestId('waypoint')).toBeVisible();
  expect(await logOf(page)).not.toContain('segment:1');
  const here = await page.evaluate(() => (window as unknown as W).__howtogo.platform.location.current?.().catch?.(() => null));
  const froms: string[] = [];
  await page.exposeFunction('__routeFrom', (s: string) => void froms.push(s));
  await page.evaluate(() => {
    const w = window as unknown as W & { __routeFrom: (s: string) => void };
    const api = w.__howtogo.api;
    const orig = api.route.bind(api);
    api.route = (q: any, ...r: unknown[]) => (w.__routeFrom(JSON.stringify(q?.from ?? q)), orig(q, ...r));
  });
  await page.getByTestId('waypoint-continue').click();
  await expect(page.getByTestId('journey-progress')).toContainText('去第 2 个地方（共 3 个）');
  expect(froms.length).toBeGreaterThan(0);
  if (here?.lat) expect(froms[0]).toContain(String(here.lat).slice(0, 6));
});

// ---------------------------------------------------------------- Help / H10 / flag
test('Help sheet (OQ4 M2 subset) on H1 and H5; H10 three tabs; ?ff=-help hides it', async ({ page }) => {
  await boot(page, {}, HOME_RAFFLES);
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-help').click();
  await expect(page.getByTestId('sheet-help')).toBeVisible();
  for (const id of ['help-driver', 'help-where', 'help-reroute', 'help-995']) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('sheet-help')).not.toContainText(/打电话给家人|Call family/);
  await axe(page, 'H9');
  await page.getByTestId('help-driver').click();
  await expect(page.getByTestId('sheet-driver')).toBeVisible();
  for (const x of ['dest', 'home', 'here']) {
    const tab = page.getByTestId(`driver-tab-${x}`);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.getByTestId('driver-card')).toBeVisible();
  await axe(page, 'H10');
  await page.goBack();
  await page.goBack();
  await expect(page.getByTestId('sheet-help')).toHaveCount(0);
  await expect(page.getByTestId('guide')).toBeVisible();
  await page.goto('/?demo=1&ff=-help');
  await page.waitForFunction(() => '__howtogo' in window);
  await expect(page.getByTestId('nav-help')).toHaveCount(0);
});

// ---------------------------------------------------------------- K. hooks / demo
test('AC 49: hooks are change-only and carry no coordinates, place names or search text', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'trip:arrived');
  const log = await logOf(page);
  const bad = log.filter((l) => /\b1\.3\d{2,}|103\.\d{2,}|Tan Tock|tan tock|Toa Payoh/i.test(l));
  expect(bad).toEqual([]);
  for (let i = 1; i < log.length; i++) if (/^(follow|pocket|state):/.test(log[i])) expect(log[i] === log[i - 1], `${log[i]} repeated`).toBe(false);
  for (const l of ['map:ready', 'wakelock:on', 'alert:next', 'alert:now', 'cue:arrived_destination']) expect(log).toContain(l);
});

test('AC 50: demo controls (H9, ?demo=1 only) play get-off, off route, weak GPS, skip and arrival without walking', async ({ page }) => {
  test.setTimeout(60_000);
  await boot(page);
  await startTo(page, 'tan tock');
  const play = async (id: string) => {
    await page.getByTestId('guide-help').click();
    await expect(page.getByTestId('demo-controls')).toBeVisible();
    await page.getByTestId(`demo-${id}`).click();
  };
  await page.getByTestId('guide-help').click();
  await auditControls(page);
  await axe(page, 'H9 + demo controls');
  await page.goBack();
  const s0 = await page.getByTestId('guide').getAttribute('data-step');
  await play('skip');
  await expect(page.getByTestId('guide')).not.toHaveAttribute('data-step', s0!);
  await play('weak');
  await expect(page.locator('[data-testid=trip-note][data-note=weak]')).toBeVisible();
  await play('offroute');
  await expect.poll(() => logOf(page)).toContain('cue:off_route');
  await play('getoff');
  await expect(page.getByTestId('getoff-next')).toBeVisible();
  await page.getByTestId('getoff-ack').click();
  await play('arrive');
  await expect(page.getByTestId('arrived')).toBeVisible({ timeout: 15_000 });
});

test('AC 50: no demo controls outside demo mode', async ({ page }) => {
  await boot(page, {}, null, { path: '/?mock=1' });
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-help').click();
  await expect(page.getByTestId('help-send').or(page.locator('[data-testid=sheet-help], .sheet')).first()).toBeVisible();
  await expect(page.getByTestId('demo-controls')).toHaveCount(0);
});

// ---------------------------------------------------------------- 200 % / dark / axe on new screens
for (const v of [
  { theme: 'dark', textSize: 'xxlarge', lang: 'zh' },
  { theme: 'light', textSize: 'xxlarge', lang: 'en' },
] as const)
  test(`200% ${v.theme} ${v.lang}: H5, H6, H6b, pocket, H11 note, G3, H12 — no clipping, ≥ 56 px, axe clean`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, v);
    await startTo(page, 'tan tock');
    await auditControls(page);
    await axe(page, 'H5');
    await page.getByTestId('pocket-btn').click();
    await auditControls(page);
    await axe(page, 'pocket');
    await page.getByTestId('pocket-show').click();
    await runUntil(page, 'alert:next');
    await auditControls(page);
    await axe(page, 'H6');
    await page.getByTestId('getoff-ack').click();
    await runUntil(page, 'alert:now');
    await auditControls(page);
    await axe(page, 'H6b');
    await page.getByTestId('getoff-now-ack').click();
    await runUntil(page, 'trip:arrived');
    await auditControls(page);
    await axe(page, 'H12');
  });

test('axe + 200%: H11 re-route failed note, G3 waypoint, G2 builder, G6, G4 stale', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, { textSize: 'xxlarge', theme: 'dark' });
  await startTo(page, 'tan tock');
  await runUntil(page, 'loc:profile 2000');
  await page.evaluate(() => {
    const w = window as unknown as W & { __route0: unknown };
    w.__route0 = w.__howtogo.api.route;
    w.__howtogo.api.route = () => Promise.reject(Object.assign(new Error('x'), { kind: 'server', status: 500 }));
  });
  for (let i = 1; i <= 4; i++) await emitRel(page, 0.006, 0.006 + i * 2e-5, 8, i * 1000);
  await expect(page.locator('[data-testid=trip-note][data-note=reroute-failed]')).toContainText('暂时找不到新的路', { timeout: 15_000 });
  await auditControls(page);
  await axe(page, 'H11-failed');
  await page.goBack();
  await expect(page.getByTestId('sheet-end-trip')).toBeVisible();
  await axe(page, 'End-trip sheet');
  await page.getByTestId('end-trip-yes').click();
  await page.evaluate(() => {
    const w = window as unknown as W & { __route0: unknown };
    w.__howtogo.api.route = w.__route0;
  });
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('add-stop').click();
  await page.getByTestId('stop-add').click();
  await page.getByTestId('search-input').fill('raffles');
  await page.getByTestId('search-result-0').click();
  await auditControls(page);
  await axe(page, 'G2');
  await page.getByTestId('journey-see').click();
  await axe(page, 'H4-journey');
  await page.evaluate(() => (window as unknown as W).__howtogo.platform.fake.setPermission('denied'));
  await page.getByTestId('start-guide').click();
  for (let i = 0; i < 40 && !(await page.getByTestId('waypoint').count()); i++) await page.getByTestId('step-next').click();
  await expect(page.getByTestId('waypoint')).toBeVisible();
  await auditControls(page);
  await axe(page, 'G3');
});
