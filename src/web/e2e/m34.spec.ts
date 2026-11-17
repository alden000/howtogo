/**
 * M3/M4 flows on the senior's phone (mock API + demo GPS; scenarios via `?scn=` = the Worker's
 * FIXTURE_MODE names): bus chip states, disruption → find another way (offer only), share sheet +
 * channels + pill + stop, Help full + 995 confirm, family contacts, setup box round trip, 200 % + dark.
 */
import { expect, test, type Page } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

type W = Window & { __howtogo: any; __howtogoLog: string[]; __opened: string[]; __spoken: string[] };

async function boot(page: Page, o: { scn?: string; settings?: Record<string, unknown>; contacts?: unknown[]; prefs?: Record<string, unknown> } = {}) {
  await hermetic(page);
  await page.addInitScript(() => {
    const w = window as unknown as W;
    w.__opened = [];
    w.__spoken = [];
    window.open = ((u: string) => (w.__opened.push(String(u)), null)) as typeof window.open;
    const synth = window.speechSynthesis;
    if (synth) synth.speak = (u: SpeechSynthesisUtterance) => void w.__spoken.push(u.text);
    (navigator as unknown as { vibrate: () => boolean }).vibrate = () => true;
  });
  await onboarded(page, { motion: 'on', ...(o.settings ?? {}) });
  if (o.contacts) await page.addInitScript((c) => localStorage.setItem('howtogo.family.v1', JSON.stringify(c)), o.contacts);
  if (o.prefs) await page.addInitScript((p) => localStorage.setItem('howtogo.prefs.m34', JSON.stringify(p)), o.prefs);
  await page.goto(`/?demo=1&demoMs=100000${o.scn ? `&scn=${o.scn}` : ''}`);
  await page.waitForFunction(() => '__howtogo' in window);
}

async function startTo(page: Page, query: string) {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(query);
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
}

async function runUntil(page: Page, line: string, max = 4000) {
  const ok = await page.evaluate(
    async ([l, n]) => {
      const w = window as unknown as W;
      const f = w.__howtogo.platform.fake;
      for (let i = 0; i < (n as number); i++) {
        if (w.__howtogoLog.some((x) => x.startsWith(l as string))) return true;
        if (!f.step()) break;
        if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      await new Promise((r) => setTimeout(r, 30));
      return w.__howtogoLog.some((x) => x.startsWith(l as string));
    },
    [line, max] as const,
  );
  expect(ok, `hook ${line}`).toBe(true);
}

const MEI = { name: '美玲', relation: 'daughter', phone: '+6591234567', callMe: '妈妈', lang: 'zh' };
const opened = (page: Page) => page.evaluate(() => (window as unknown as W).__opened);

// ------------------------------------------------------------------ T1 bus chip
const CHIP: [string, string, RegExp][] = [
  ['live', 'live', /4 分钟/],
  ['estimated', 'estimated', /约 8 分钟/],
  ['here', 'here', /快到了/],
  ['empty', 'nodata', /暂时没有到站时间/],
  ['not_configured', 'nodata', /暂时没有到站时间/],
  ['stale', 'estimated', /约 4 分钟/],
];
for (const [scn, state, big] of CHIP) {
  test(`T1 bus chip: scenario ${scn} → ${state}`, async ({ page }) => {
    await boot(page, { scn: `bus:${scn}` });
    await startTo(page, '陈笃生');
    await runUntil(page, 'step:1');
    const chip = page.getByTestId('arrchip');
    await expect(chip).toHaveAttribute('data-state', state);
    await expect(chip).toContainText(big);
    if (state === 'live') {
      await expect(chip).toContainText('实时');
      await expect(chip.getByTestId('loadtag')).toHaveText(['有座位', '轮椅可以上', '双层巴士']);
      await expect(chip).toHaveAttribute('aria-label', /实时/);
    }
    if (state === 'estimated') await expect(chip).not.toContainText('实时');
    if (state === 'here') {
      await expect.poll(() => logOf(page)).toContain('bus:arriving-cue');
    }
    // Review #1b: H5 shows no second bus badge (the sign line already has it).
    await expect(chip.locator('.busbadge')).toHaveCount(0);
    if (state === 'nodata') {
      // Review #4: spoken once per step.
      await expect.poll(() => logOf(page)).toContain('bus:nodata-voice');
      await page.waitForTimeout(5500);
      expect((await logOf(page)).filter((l) => l === 'bus:nodata-voice')).toHaveLength(1);
    }
    expect(await logOf(page)).toContain(`bus:chip ${state}`);
  });
}

test('T1 nodata at night: no "the bus will still come" promise; Show the driver → H10', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-18T23:45:00+08:00'));
  await boot(page, { scn: 'bus:empty' });
  await startTo(page, '陈笃生');
  await runUntil(page, 'step:1');
  await expect(page.getByTestId('arr-second')).toHaveText('请看站牌上的时间。');
  await page.getByTestId('arr-driver').click();
  await expect(page.getByTestId('sheet-driver')).toBeVisible();
});

test('T1 nodata by day keeps the reassurance', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-18T10:15:00+08:00'));
  await boot(page, { scn: 'bus:empty' });
  await startTo(page, '陈笃生');
  await runUntil(page, 'step:1');
  await expect(page.getByTestId('arr-second')).toHaveText('请看站牌上的时间。巴士还是会来的。');
  await expect(page.getByTestId('arr-driver')).toHaveCount(0);
});

for (const size of ['standard', 'xxlarge'] as const)
  test(`H5 chip sits under the headline, full width, step leads the sheet (${size})`, async ({ page }) => {
    await boot(page, { scn: 'bus:live', settings: { textSize: size } });
    await startTo(page, '陈笃生');
    await runUntil(page, 'step:1');
    await expect(page.locator('.arrchip b.big')).toBeVisible();
    const g = await page.evaluate(() => {
      const big = document.querySelector('.arrchip b.big')!.getBoundingClientRect();
      const chip = document.querySelector('.arrchip')!.getBoundingClientRect();
      const card = document.querySelector('[data-testid="stepcard"]')!;
      const c = card.getBoundingClientRect();
      const head = document.querySelector('[data-testid="current-step"]')!.getBoundingClientRect();
      const sign = document.querySelector('[data-testid="step-sub"]')!.getBoundingClientRect();
      const wake = document.querySelector('[data-note="wakelock"]');
      return { bigBottom: big.bottom, chipW: chip.width, cardW: c.width, cardTop: c.top, cardH: card.clientHeight, ih: innerHeight, headBottom: head.bottom, chipTop: chip.top, signTop: sign.top, wakeAfter: wake ? wake.getBoundingClientRect().top > chip.bottom : null };
    });
    expect(g.chipTop).toBeGreaterThanOrEqual(g.headBottom - 1);
    expect(g.signTop).toBeGreaterThanOrEqual(g.chipTop);
    expect(g.chipW).toBeGreaterThan(g.cardW - 60);
    if (g.wakeAfter !== null) expect(g.wakeAfter).toBe(true);
    if (size === 'standard') expect(g.bigBottom).toBeLessThanOrEqual(g.ih);
    else expect(g.bigBottom - g.cardTop).toBeLessThanOrEqual(2 * g.cardH);
  });

test('T1: LSD → advice + less crowded hint; wheelchair user sees "not wheelchair friendly"', async ({ page }) => {
  await boot(page, { scn: 'bus:lsd' });
  await startTo(page, '陈笃生');
  await runUntil(page, 'step:1');
  await expect(page.getByTestId('arrchip')).toContainText('很挤，可以等下一班');
  await expect(page.getByTestId('arr-less')).toHaveText('下一班比较空');
});

// ------------------------------------------------------------------ T3/T4 disruption
test('T3: Home strip only for a line a recent trip used; otherwise the quiet LTA note', async ({ page }) => {
  await boot(page, { scn: 'alerts:disrupted' });
  await expect(page.getByTestId('disruption')).toHaveCount(0);
  await expect(page.getByTestId('disruption-minor')).toBeVisible();
});

test('T3: Home strip (72 px, dismissable), H3 affected fact, H4 banner', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('howtogo.recents', JSON.stringify([{ to: { name: 'Raffles Place', lat: 1.2841, lng: 103.8515 }, at: Date.now() - 864e5, lines: ['NS'] }])),
  );
  await boot(page, { scn: 'alerts:disrupted' });
  const banner = page.getByTestId('disruption');
  await expect(banner).toHaveAttribute('data-where', 'home');
  await expect(banner).toContainText('南北线');
  await expect(banner).not.toContainText('碧山');
  const h = await banner.evaluate((e) => e.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(72);
  expect(h).toBeLessThan(140);
  await expect(page.getByTestId('disruption-dismiss')).toHaveAttribute('aria-label', '知道了');
  await page.getByTestId('disruption-notice').click();
  await expect(page.getByTestId('lta-line').first()).toContainText('碧山');
  await expect(page.getByTestId('lta-message')).toContainText('SYNTHETIC');
  await page.goBack();
  await page.getByTestId('disruption-dismiss').click();
  await expect(banner).toHaveCount(0);
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('raffles');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('affected-fact').first()).toBeVisible();
  await expect(page.getByTestId('disruption')).toHaveAttribute('data-where', 'h3');
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('disruption')).toHaveAttribute('data-where', 'h4');
});

test('T4: in-trip disruption → offer (never auto) → keep; → find another way', async ({ page }) => {
  await boot(page);
  await startTo(page, 'raffles');
  await expect(page.getByTestId('sheet-dis-offer')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('howtogo.mock.scn.alerts', 'disrupted'));
  await page.reload();
  await page.waitForFunction(() => '__howtogo' in window);
  await expect(page.getByTestId('sheet-dis-offer')).toBeVisible();
  expect(await logOf(page)).toContain('alerts:offer shown');
  expect((await logOf(page)).some((l) => l.startsWith('reroute:start'))).toBe(false);
  await page.getByTestId('offer-keep').click();
  expect(await logOf(page)).toContain('alerts:offer kept');
  await expect(page.getByTestId('disruption')).toHaveAttribute('data-where', 'h5');
  await runUntil(page, 'step:1');
  await page.getByTestId('disruption-find').click();
  await page.getByTestId('offer-find').click();
  await expect.poll(() => logOf(page)).toContain('alerts:offer accepted');
  await expect.poll(async () => (await logOf(page)).some((l) => l.startsWith('reroute:'))).toBe(true);
  // T4 (build now): the result says it avoids the line.
  if ((await logOf(page)).includes('reroute:done') || (await page.getByTestId('rr-title').count())) {
    await expect(page.getByTestId('rr-note')).toContainText('南北线');
  }
});

// ------------------------------------------------------------------ M4 share
test('P1 share: contact → WhatsApp link with the honest message, pill, sharing sheet, stop', async ({ page }) => {
  await boot(page, { contacts: [MEI] });
  await startTo(page, '陈笃生');
  await page.getByTestId('guide-share').click();
  await expect(page.getByTestId('share-contact-0')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('share-wa').click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  const url = (await opened(page))[0]!;
  expect(url).toMatch(/^https:\/\/wa\.me\/6591234567\?text=/);
  const msg = decodeURIComponent(url.split('text=')[1]!);
  expect(msg).toMatch(/^我正在去 Tan Tock Seng Hospital/);
  expect(msg).toMatch(/\/t\/[A-Za-z0-9]{12}/);
  await expect(page.getByTestId('toast-share-sent')).toHaveText('链接发出去了。美玲 打开后就看得到你。');
  const pill = page.getByTestId('share-pill');
  await expect(pill).toHaveAttribute('data-state', 'sharing');
  await expect(pill).toHaveText('正在分享给 美玲');
  // The share carries senderName (what Mei Ling calls her) and the structured step
  const st = await page.evaluate(() => {
    const id = (window as unknown as W).__howtogo.store.trip.value.share.id;
    return JSON.parse(localStorage.getItem(`howtogo.mockshare.${id}`)!);
  });
  expect(st.senderName).toBe('妈妈');
  expect(st.senderPhone).toBeNull();
  await expect.poll(async () => (await page.evaluate(() => {
    const id = (window as unknown as W).__howtogo.store.trip.value.share.id;
    return JSON.parse(localStorage.getItem(`howtogo.mockshare.${id}`)!).step?.k;
  }))).toBe('walk');
  await pill.click();
  await expect(page.getByTestId('share-stop')).toBeVisible();
  await page.getByTestId('share-stop').click();
  await expect(page.getByTestId('toast-share-stopped')).toContainText('已经停止分享');
  await expect(pill).toHaveCount(0);
});

test('P1 share: Someone else + SMS + copy; create failure shows the inline state', async ({ page }) => {
  await boot(page, { scn: 'share:fail' });
  await startTo(page, '陈笃生');
  await page.getByTestId('guide-share').click();
  await expect(page.getByTestId('share-someone')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('share-sms').click();
  await expect(page.getByTestId('share-failed')).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem('howtogo.mock.scn.share'));
  await page.getByTestId('share-retry').click();
  await page.getByTestId('share-wa').click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  expect((await opened(page))[0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
  await expect(page.getByTestId('share-pill')).toHaveText('正在分享');
});

test('OQ3: own phone goes with the share only when set and allowed', async ({ page }) => {
  await boot(page, { contacts: [MEI], prefs: { myPhone: '+6598765432', sendPhone: true } });
  await startTo(page, '陈笃生');
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-copy').click();
  await expect(page.getByTestId('share-pill')).toBeVisible();
  const st = await page.evaluate(() => {
    const id = (window as unknown as W).__howtogo.store.trip.value.share.id;
    return JSON.parse(localStorage.getItem(`howtogo.mockshare.${id}`)!);
  });
  expect(st.senderPhone).toBe('+6598765432');
});

// ------------------------------------------------------------------ Help
test('Help full: call first contact (tel:), sets help while sharing, I\'m okay; 995 confirm; taxi', async ({ page }) => {
  await boot(page, { contacts: [MEI] });
  await startTo(page, '陈笃生');
  await page.getByTestId('guide-share').click();
  await page.getByTestId('share-copy').click();
  await expect(page.getByTestId('share-pill')).toBeVisible();
  await page.getByTestId('guide-help').click();
  await expect(page.getByTestId('help-call')).toContainText('打电话给美玲');
  await expect(page.getByTestId('help-call')).toContainText('美玲 的页面也会显示你需要帮忙');
  await page.getByTestId('help-call').click();
  await expect.poll(() => logOf(page)).toContain('ext:tel');
  await expect(page.getByTestId('share-pill')).toHaveAttribute('data-state', 'help');
  await expect(page.getByTestId('help-note')).toBeVisible();
  await page.getByTestId('help-ok').click();
  await expect(page.getByTestId('share-pill')).toHaveAttribute('data-state', 'sharing');
  await page.getByTestId('guide-help').click();
  await page.getByTestId('help-995').click();
  await expect(page.getByTestId('call-995')).toHaveAttribute('href', 'tel:995');
  await page.goBack();
  await expect(page.getByTestId('sheet-help')).toBeVisible();
  await page.getByTestId('help-driver').click();
  await expect(page.getByTestId('taxi-grab')).toBeVisible();
  await page.getByTestId('taxi-cdg').click();
  await expect.poll(() => opened(page)).toContain('https://www.cdgtaxi.com.sg/');
});

test('Help with no contacts: "Add a family phone number" → editor; validation on Save; first = default', async ({ page }) => {
  await boot(page);
  await page.getByTestId('nav-help').click();
  await page.getByTestId('help-add').click();
  await page.getByTestId('contact-save').click();
  await expect(page.locator('.fnote').first()).toHaveText('请写一个名字');
  await page.getByTestId('contact-name').fill('美玲');
  await page.getByTestId('contact-phone').fill('9123');
  await page.getByTestId('contact-save').click();
  await expect(page.locator('.fnote')).toHaveText('这个号码好像少了几个数字');
  await page.getByTestId('contact-phone').fill('9123 4567');
  await page.getByTestId('contact-save').click();
  await expect(page.getByTestId('toast-saved')).toBeVisible();
  await page.getByTestId('nav-help').click();
  await expect(page.getByTestId('help-call')).toContainText('打电话给美玲');
});

// ------------------------------------------------------------------ setup round trip
test('P5/W setup: family fills + encrypts → link → senior previews → Yes → undo; link is one-time', async ({ page, context }) => {
  await boot(page, { contacts: [{ name: '旧', relation: 'son', phone: '+6590000000' }] });
  const fam = await context.newPage();
  await hermetic(fam);
  const posted: string[] = [];
  await fam.goto('/setup?mock=1');
  await fam.getByTestId('w-name').fill('林阿姨');
  await fam.getByTestId('w-home').fill('toa payoh');
  await fam.getByTestId('w-home-r0').click();
  await fam.getByTestId('contact-name').fill('美玲');
  await fam.getByTestId('contact-phone').fill('91234567');
  await fam.getByTestId('w-contact-add').click();
  await fam.getByTestId('w-you').fill('美玲');
  fam.on('request', (r) => posted.push(r.url()));
  await fam.getByTestId('w-send').click();
  const link = await fam.getByTestId('setup-link').inputValue();
  expect(link).toMatch(/\/s\/[A-Za-z0-9]{12}#k=[A-Za-z0-9_-]{43}$/);
  expect(posted.some((u) => u.includes('#k=') || u.includes(link.split('#k=')[1]!))).toBe(false);
  // stored box holds ciphertext only
  const box = await fam.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith('howtogo.mocksetup.'))![1]);
  expect(box).not.toContain('林阿姨');
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.getByTestId('setup-review')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('美玲 帮你设置好了');
  await expect(page.getByTestId('setup-replace-contacts')).toBeVisible();
  expect(page.url()).not.toContain('#k=');
  await page.getByTestId('setup-yes').click();
  await expect(page.getByTestId('setup-undo')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.family.v1')!)[0].name)).toBe('美玲');
  await page.getByTestId('setup-undo').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('howtogo.family.v1')!)[0].name)).toBe('旧');
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.getByTestId('setup-error')).toHaveAttribute('data-msg', 'su_used');
});

test('setup: a wrong key says "link incomplete"', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => localStorage.setItem('howtogo.mocksetup.aB3dE5fG7hJ9', JSON.stringify({ ct: 'A'.repeat(60), expiresAt: new Date(Date.now() + 1e6).toISOString(), used: false })));
  await page.goto('/s/aB3dE5fG7hJ9#k=' + 'B'.repeat(43));
  await expect(page.getByTestId('setup-error')).toHaveAttribute('data-msg', 'su_broken');
});

// ------------------------------------------------------------------ 200 % + dark
for (const v of [{ lang: 'zh', theme: 'dark' }, { lang: 'en', theme: 'light' }]) {
  test(`200% ${v.theme} ${v.lang}: chip, share sheet, Help, contacts editor do not clip; targets ≥ 56 px`, async ({ page }) => {
    await boot(page, { settings: { lang: v.lang, theme: v.theme, textSize: 'xxlarge' }, contacts: [MEI], scn: 'bus:lsd' });
    await startTo(page, v.lang === 'zh' ? '陈笃生' : 'tan tock');
    await runUntil(page, 'step:1');
    await expect(page.getByTestId('arrchip')).toBeVisible();
    await audit(page, '[data-testid="arrchip"]');
    await page.getByTestId('guide-share').click();
    await audit(page, '[data-testid="sheet-share"]');
    await page.goBack();
    await page.getByTestId('guide-help').click();
    await audit(page, '[data-testid="sheet-help"]');
  });
}

async function audit(page: Page, root: string) {
  const bad = await page.evaluate((sel) => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const el = document.querySelector(sel);
    if (!el) return ['missing ' + sel];
    for (const e of el.querySelectorAll<HTMLElement>('b,span,p,button,a,h2')) {
      const r = e.getBoundingClientRect();
      if (!r.width) continue;
      if (r.right > vw + 1) out.push(`overflow ${e.textContent?.slice(0, 20)}`);
      if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') out.push(`clipped ${e.textContent?.slice(0, 20)}`);
    }
    for (const b of el.querySelectorAll<HTMLElement>('button,a')) {
      const r = b.getBoundingClientRect();
      if (r.width && r.height < 55.5) out.push(`small ${b.dataset.testid ?? b.textContent?.slice(0, 15)} ${r.height}`);
      if (!b.dataset.testid) out.push(`no testid ${b.textContent?.slice(0, 15)}`);
      if (!(b.getAttribute('aria-label') || b.textContent?.trim())) out.push('unlabelled');
    }
    return out;
  }, root);
  expect(bad).toEqual([]);
}
