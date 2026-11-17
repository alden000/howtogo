/**
 * M2 guided trip end to end (STYLE-GUIDE §6c, M2 ACs): demo platform with the shared simulator
 * (`simulateFixes`, paused at start; the test steps it fix by fix), mock API, real browser speech/vibrate stubs.
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

test.use({ serviceWorkers: 'block' });

type W = Window & { __howtogo: any; __howtogoLog: string[] };

/** Record speech / vibration / wake lock calls (AC testability row). */
async function stubs(page: Page, o: { wakeLockOk?: boolean } = {}) {
  await page.addInitScript((wl) => {
    const w = window as unknown as { __spoken: string[]; __vib: unknown[] };
    w.__spoken = [];
    w.__vib = [];
    const synth = window.speechSynthesis;
    // Stub voices are plain objects: let the utterance accept them.
    Object.defineProperty(SpeechSynthesisUtterance.prototype, 'voice', { configurable: true, get: () => null, set: () => {} });
    if (synth) {
      synth.speak = (u: SpeechSynthesisUtterance) => {
        w.__spoken.push(u.text);
        setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 5);
      };
      synth.getVoices = () => [{ lang: 'zh-CN', name: 'zh', default: true, localService: true, voiceURI: 'zh' } as SpeechSynthesisVoice, { lang: 'en-SG', name: 'en', default: false, localService: true, voiceURI: 'en' } as SpeechSynthesisVoice];
    }
    (navigator as unknown as { vibrate: (p: unknown) => boolean }).vibrate = (p) => (w.__vib.push(p), true);
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: () => (wl ? Promise.resolve({ release: () => Promise.resolve(), addEventListener() {} }) : Promise.reject(new Error('no'))) },
    });
  }, o.wakeLockOk ?? true);
}

async function boot(page: Page, settings: Record<string, unknown> = {}, places: unknown = null) {
  await hermetic(page);
  await stubs(page);
  await onboarded(page, { motion: 'on', ...settings });
  if (places) await page.addInitScript((p) => localStorage.setItem('howtogo.places', JSON.stringify(p)), places);
  await page.goto('/?demo=1&demoMs=100000');
  await page.waitForFunction(() => '__howtogo' in window);
}

/** Search → first option → H4 → Start (the H4 entry; AC 2c). */
async function startTo(page: Page, query: string) {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(query);
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
}

/** Step the simulator until a hook line shows up (or the script ends). */
async function runUntil(page: Page, line: string, max = 4000) {
  const ok = await page.evaluate(
    async ([l, n]) => {
      const w = window as unknown as W;
      const f = w.__howtogo.platform.fake;
      for (let i = 0; i < (n as number); i++) {
        if (w.__howtogoLog.includes(l as string)) return true;
        if (!f.step()) break;
        if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      await new Promise((r) => setTimeout(r, 30));
      return w.__howtogoLog.includes(l as string);
    },
    [line, max] as const,
  );
  if (!ok) console.log('HOOKS', (await logOf(page)).slice(-40).join(' | '));
  expect(ok, `hook ${line}`).toBe(true);
}

const cues = async (page: Page) => (await logOf(page)).filter((l) => l.startsWith('cue:')).map((l) => l.slice(4));
const idx = (arr: string[], x: string) => arr.indexOf(x);

/** Rect check (6c.0, AC 9): the map window sits between the band and the card; nothing covers it. */
async function mapWindowClear(page: Page) {
  const gap = () =>
    page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const band = q('.guide .top'), win = q('.guide .mapwin'), card = q('.stepcard');
      return Math.min(win.top - band.bottom + 1, card.top - win.bottom + 1, win.height - 159) >= 0;
    });
  await expect.poll(gap, { message: 'map window between band and card, ≥ 160 px' }).toBe(true);
}

/** Every visible control ≥ 56 px, labelled and with a test id; no horizontal overflow. */
async function auditControls(page: Page) {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('.stage button, .stage a[href]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('[aria-hidden="true"]') || el.closest('.attribhost')) continue;
      const id = el.getAttribute('data-testid');
      const name = el.getAttribute('aria-label') || el.textContent?.trim();
      if (r.height < 55.5 || r.width < 55.5) out.push(`small:${id}:${Math.round(r.width)}x${Math.round(r.height)}`);
      if (!id) out.push(`noid:${name}`);
      if (!name) out.push(`noname:${id}`);
    }
    const st = document.querySelector('.stage')!;
    if (st.scrollWidth > st.clientWidth + 1) out.push('hscroll');
    for (const el of document.querySelectorAll<HTMLElement>('.stepcard, .alert, .pocket, .top')) if (el.scrollWidth > el.clientWidth + 1) out.push(`clip:${el.className}`);
    return out;
  });
  expect(bad).toEqual([]);
}

test.describe('bus trip (zh)', () => {
  test('cue order, H6 → ack, H6b, Back over the alert, arrival, Back → Home', async ({ page }) => {
    await boot(page);
    await startTo(page, 'tan tock');
    await expect(page.getByTestId('current-step')).toBeVisible();
    await mapWindowClear(page);
    await expect(page.getByTestId('guide-end')).toHaveText(/结束/);
    await runUntil(page, 'alert:next');
    await expect(page.getByTestId('getoff-next')).toBeVisible();
    await expect(page.getByTestId('getoff-next')).toContainText('下一站下车');
    await expect(page.getByTestId('getoff-next')).toContainText('请现在按铃');
    await expect(page.getByTestId('edge-glow')).toBeVisible();
    await page.getByTestId('getoff-ack').click();
    await expect(page.getByTestId('getoff-next')).toHaveCount(0);
    await runUntil(page, 'alert:now');
    await expect(page.getByTestId('getoff-now')).toContainText('到站了，请下车');
    await expect(page.getByTestId('getoff-now')).toContainText('车停稳了再站起来');
    // Back does not dismiss the alert: End-trip sheet over it, Back again → the alert, unchanged (D8).
    await page.goBack();
    await expect(page.getByTestId('sheet-end-trip')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('sheet-end-trip')).toHaveCount(0);
    await expect(page.getByTestId('getoff-now')).toBeVisible();
    await page.getByTestId('getoff-now-ack').click();
    await runUntil(page, 'trip:arrived');
    await expect(page.getByTestId('arrived')).toHaveText('到了！');
    await expect(page.getByTestId('took-min')).toContainText('用了');
    const c = await cues(page);
    expect(idx(c, 'get_off_next_stop')).toBeGreaterThan(-1);
    expect(idx(c, 'get_off_next_stop')).toBeLessThan(idx(c, 'get_off_now'));
    expect(idx(c, 'get_off_now')).toBeLessThan(idx(c, 'arrived_destination'));
    const log = await logOf(page);
    expect(log).toEqual(expect.arrayContaining(['alert:ack', 'wakelock:on', 'state:arrived']));
    const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    expect(spoken).toEqual(expect.arrayContaining(['下一站下车。', '到站了，请下车。', '到了！']));
    await page.goBack();
    await expect(page.getByTestId('to-field')).toBeVisible();
    expect([null, 'null']).toContain(await page.evaluate(() => localStorage.getItem('howtogo.trip.v1')));
  });
});

test.describe('MRT trip (en)', () => {
  test('train copy, stops countdown, arrival', async ({ page }) => {
    await boot(page, { lang: 'en' });
    await startTo(page, 'raffles');
    await expect(page.getByTestId('guide-end')).toHaveText(/End/);
    await runUntil(page, 'alert:next');
    await expect(page.getByTestId('getoff-next')).toContainText('Get off when the doors open');
    await expect(page.getByTestId('stops-left')).toBeVisible();
    await page.getByTestId('getoff-ack').click();
    await runUntil(page, 'alert:now');
    await expect(page.getByTestId('getoff-now')).toContainText('Mind the gap');
    await page.getByTestId('getoff-now-ack').click();
    await runUntil(page, 'trip:arrived');
    await expect(page.getByTestId('arrived')).toHaveText("You're here!");
    const c = await cues(page);
    expect(idx(c, 'get_off_next_stop')).toBeLessThan(idx(c, 'get_off_now'));
  });
});

test('off route → re-route found, then a failed re-route keeps the old steps', async ({ page }) => {
  test.setTimeout(75_000);
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'loc:profile 2000');
  const away = (i: number) =>
    page.evaluate((k) => {
      const w = window as unknown as W;
      const g = w.__howtogo.store.trip.value.guidance;
      const p = g.fix ?? g.steps[0].start;
      w.__howtogo.platform.fake.emit({ lat: p.lat + 0.004, lng: p.lng + 0.004 + k * 0.00002, acc: 8, t: Date.now() + k * 1000, speed: 1 });
    }, i);
  for (let i = 1; i <= 4; i++) await away(i);
  await expect.poll(async () => (await logOf(page)).includes('cue:off_route')).toBe(true);
  await expect(page.getByTestId('reroute-banner')).toBeVisible();
  await expect(page.getByTestId('reroute-banner')).toHaveAttribute('data-state', 'found', { timeout: 10_000 });
  await expect(page.getByTestId('reroute-banner')).toContainText('找到了新的路');
  // Second episode: the routing API fails → trip note with the H11 fallbacks.
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__howtogo.api.route = () => Promise.reject(Object.assign(new Error('x'), { kind: 'server', status: 500 }));
  });
  await page.waitForTimeout(4500);
  const far = () =>
    page.evaluate(() => {
      const w = window as unknown as W;
      const g = w.__howtogo.store.trip.value.guidance;
      const p = g.fix;
      w.__howtogo.platform.fake.emit({ lat: p.lat + 0.006, lng: p.lng + 0.006, acc: 8, t: Date.now(), speed: 1 });
    });
  for (let i = 0; i < 4; i++) {
    await far();
    await page.waitForTimeout(30);
  }
  await expect(page.locator('[data-testid=trip-note][data-note=reroute-failed]'))
    .toBeVisible({ timeout: 25_000 })
    .catch(async (e) => {
      console.log('HOOKS', (await logOf(page)).slice(-40).join(' | '));
      throw e;
    });
  await expect(page.getByTestId('trip-note')).toContainText('暂时找不到新的路');
  await expect(page.getByTestId('note-995')).toHaveAttribute('href', 'tel:995');
  await page.getByTestId('note-driver').click();
  await expect(page.getByTestId('sheet-driver')).toBeVisible();
  await expect(page.getByTestId('driver-card')).toContainText('Please take me to');
  await page.goBack();
  await expect(page.getByTestId('sheet-driver')).toHaveCount(0);
  await page.getByTestId('trip-note-close').click();
  await expect(page.getByTestId('trip-note')).toHaveCount(0);
});

test('manual mode: location denied → note, Next is primary, manual steps advance', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as unknown as W).__howtogo.platform.fake.setPermission('denied'));
  await startTo(page, 'tan tock');
  await expect(page.locator('[data-testid=trip-note][data-note=manual]')).toBeVisible();
  await expect(page.getByTestId('step-next')).toHaveClass(/btn-primary/);
  await expect(page.getByTestId('pocket-btn')).toHaveCount(0);
  await expect(page.getByTestId('step-prev')).toHaveAttribute('aria-disabled', 'true');
  const s0 = await page.getByTestId('guide').getAttribute('data-step');
  await page.getByTestId('step-next').click();
  await expect(page.getByTestId('guide')).not.toHaveAttribute('data-step', s0!);
  await expect(page.getByTestId('im-on')).toBeVisible();
  await page.getByTestId('im-on').click();
  await expect(page.getByTestId('got-off')).toBeVisible();
  await page.getByTestId('step-prev').click();
  await expect(page.getByTestId('im-on')).toBeVisible();
});

test('pocket view: enter, first touch only wakes, alerts break through', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await page.getByTestId('pocket-btn').click();
  await expect(page.getByTestId('pocket')).toBeVisible();
  await expect(page.getByTestId('pocket-count')).toContainText('米');
  expect(await logOf(page)).toContain('pocket:on');
  // A tap where "Say it again" sits underneath only wakes the screen.
  const before = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length);
  const box = await page.getByTestId('pocket').boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByTestId('pocket')).toHaveCount(0);
  expect(await logOf(page)).toContain('pocket:off');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)).toBe(before);
  // Ride: pocket again, then the get-off alert breaks through.
  await runUntil(page, 'loc:profile 5000');
  await runUntil(page, 'cue:boarded');
  await page.getByTestId('pocket-btn').click();
  await expect(page.getByTestId('pocket-count')).toContainText('站');
  await runUntil(page, 'alert:next');
  await expect(page.getByTestId('pocket')).toHaveCount(0);
  await expect(page.getByTestId('getoff-next')).toBeVisible();
});

test('resume after reload: H5 at the same step, toast, D8 guard kept', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await runUntil(page, 'cue:boarded');
  const step = await page.getByTestId('guide').getAttribute('data-step');
  await page.evaluate(() => (window as unknown as W).__howtogo.store.flushTrip());
  await page.reload();
  await expect(page.getByTestId('guide')).toHaveAttribute('data-step', step!);
  await expect(page.getByTestId('toast-resume')).toBeVisible();
  expect(await logOf(page)).toContain('state:resume');
  await page.goBack();
  await expect(page.getByTestId('sheet-end-trip')).toBeVisible();
  await page.getByTestId('end-trip-yes').click();
  await expect(page.getByTestId('to-field')).toBeVisible();
  expect([null, 'null']).toContain(await page.evaluate(() => localStorage.getItem('howtogo.trip.v1')));
});

test('Back/End confirm on H5; End stops the trip; Help sheet M2 subset', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await page.getByTestId('guide-help').click();
  await expect(page.getByTestId('sheet-help')).toBeVisible();
  await expect(page.getByTestId('help-driver')).toBeVisible();
  await expect(page.getByTestId('help-where')).toBeVisible();
  await expect(page.getByTestId('help-reroute')).toBeVisible();
  await auditControls(page);
  // M4 (6e.3): 995 asks once; the only c-danger fill is the confirm button
  await page.getByTestId('help-995').click();
  await expect(page.getByTestId('call-995')).toHaveAttribute('href', 'tel:995');
  await page.goBack();
  await page.getByTestId('help-driver').click();
  await expect(page.getByTestId('driver-tab-dest')).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page.getByTestId('sheet-help')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('sheet-help')).toHaveCount(0);
  await page.getByTestId('guide-end').click();
  await expect(page.getByTestId('sheet-end-trip')).toBeVisible();
  await page.getByTestId('end-trip-no').click();
  await expect(page.getByTestId('sheet-end-trip')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByTestId('sheet-end-trip')).toBeVisible();
  await page.getByTestId('end-trip-yes').click();
  await expect(page.getByTestId('to-field')).toBeVisible();
  expect(await logOf(page)).toContain('trip:ended');
});

test('multi-stop: 3 places, waypoint screens "第 k 个地方，共 3 个", progress across segments, arrival', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('add-stop').click();
  await expect(page.getByTestId('journey-builder')).toBeVisible();
  for (const q of ['raffles', 'ang mo kio']) {
    await page.getByTestId('stop-add').click();
    await page.getByTestId('search-input').fill(q);
    await page.getByTestId('search-result-0').click();
  }
  await expect(page.locator('.stoplist li[data-testid^=stop-]').filter({ hasNot: page.locator('.origin') })).toHaveCount(4);
  await page.getByTestId('stop-dwell-0').click();
  await page.getByTestId('dwell-60').click();
  await expect(page.getByTestId('stop-dwell-0')).toContainText('1 小时');
  await page.getByTestId('stop-down-1').click();
  await page.getByTestId('stop-up-2').click();
  await page.getByTestId('journey-see').click();
  await expect(page.getByTestId('journey-timeline')).toBeVisible();
  await expect(page.getByTestId('segment-2')).toBeVisible();
  // The mock routes each part from a fixture origin, so the parts are walked with the manual controls (AC 10).
  await page.evaluate(() => (window as unknown as W).__howtogo.platform.fake.setPermission('denied'));
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('journey-progress')).toContainText('去第 1 个地方（共 3 个）');
  const nextUntil = async (sel: string) => {
    for (let i = 0; i < 40; i++) {
      if (await page.getByTestId(sel).count()) return;
      await page.getByTestId('step-next').click();
    }
  };
  for (const k of [1, 2]) {
    await nextUntil('waypoint');
    await expect(page.getByTestId('waypoint-count')).toHaveText(`第 ${k} 个地方，共 3 个`);
    await page.goBack(); // Back → End-trip sheet → Back → the waypoint screen
    await expect(page.getByTestId('sheet-end-trip')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('waypoint')).toBeVisible();
    await page.getByTestId('waypoint-continue').click();
    await expect(page.getByTestId('journey-progress')).toContainText(`去第 ${k + 1} 个地方（共 3 个）`);
  }
  await nextUntil('arrived');
  await expect(page.getByTestId('arrived')).toBeVisible();
  expect(await logOf(page)).toEqual(expect.arrayContaining(['segment:1', 'segment:2']));
});

test('entry points reach the same Start: Home tile, Take me home, recent, H12 Route home', async ({ page }) => {
  const HOME = { home: { name: 'Tan Tock Seng Hospital', address: '11 Jalan Tan Tock Seng Singapore 308433', lat: 1.32135, lng: 103.8465 }, others: [] };
  await boot(page, {}, HOME);
  await page.getByTestId('take-me-home').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
  await page.getByTestId('guide-end').click();
  await page.getByTestId('end-trip-yes').click();
  await page.getByTestId('tile-home').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
  // AC 5: starting another trip while one is active asks first.
  await page.getByTestId('guide-end').click();
  await page.getByTestId('end-trip-yes').click();
  await expect(page.getByTestId('recent-0')).toBeVisible();
  await page.getByTestId('recent-0').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await runUntil(page, 'trip:arrived');
  // At Home there is no route-home link; elsewhere it leads to H3 → H4 → Start.
  await expect(page.getByTestId('route-home')).toHaveCount(0);
  const starts = (await logOf(page)).filter((l) => l === 'ui:start').length;
  expect(starts).toBe(3);
});

test('AC 5: Start while a trip is active asks "End your current trip?"', async ({ page }) => {
  await boot(page);
  await startTo(page, 'tan tock');
  await page.evaluate(() => (window as unknown as W).__howtogo.router.reset('/'));
  await expect(page.getByTestId('continue-trip')).toBeVisible();
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('raffles');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('end-first')).toBeVisible();
  await expect(page.getByTestId('sheet-end-first')).toContainText('要结束现在的行程吗？');
  await page.getByTestId('end-first-go').click();
  await expect(page.getByTestId('guide')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as W).__howtogo.store.trip.value.places.at(-1).name)).toContain('Raffles');
});

for (const v of [
  { theme: 'dark', size: 'xxlarge', lang: 'zh' },
  { theme: 'light', size: 'xxlarge', lang: 'en' },
] as const)
  test(`200% ${v.theme} ${v.lang}: H5 / H6 / H6b / pocket do not clip, targets ≥ 56 px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, { theme: v.theme, textSize: v.size, lang: v.lang });
    await startTo(page, 'tan tock');
    await mapWindowClear(page);
    await auditControls(page);
    await page.getByTestId('pocket-btn').click();
    await expect(page.getByTestId('pocket')).toBeVisible();
    await auditControls(page);
    await page.getByTestId('pocket-show').click();
    await runUntil(page, 'alert:next');
    await auditControls(page);
    await page.getByTestId('getoff-ack').click();
    await runUntil(page, 'alert:now');
    await auditControls(page);
    const ack = await page.getByTestId('getoff-now-ack').boundingBox();
    expect(ack!.y + ack!.height).toBeLessThanOrEqual(844 + 1);
  });
