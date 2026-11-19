/**
 * QA 1.1.0 gate (STYLE-GUIDE v1.5 §6g): smart search (alias line, two-request extra help, timing, silent
 * fallback, postal hint), voice "You said" (scripted recognition with alternatives), the C1-A OneMap credit
 * on map cards, privacy v2, the "no AI / Claude in the UI" rule, and Back while listening.
 * The Worker is stubbed here; alias answers are built from the REAL alias table (expandAliases), as the
 * Worker builds them, so the KKH / SGH / 牛车水 / "K K 医院" checks also check the table and its normaliser.
 * Anthropic is never called (no live Worker, no key).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { expandAliases } from '../../src/shared/src/alias';
import { setup } from './helpers';

test.use({ serviceWorkers: 'block' });

type Lang = 'zh' | 'en';
const P = (name: string, postal: string, via = 'direct') => ({
  name,
  address: `1 Test Road Singapore ${postal}`,
  postal,
  lat: 1.3,
  lng: 103.83,
  via,
});
const TEMPLES = [P('Kwan Im Thong Hood Cho Temple', '188046', 'ai'), P('Leong San See Temple', '218154', 'ai'), P('Guan Yin Tang', '650001', 'ai')];
const FORBIDDEN = /\bAI\b|Claude|Anthropic|智能|人工智能|机器人/;

/** What the 1.1 Worker answers on step=1 for q, from the real alias table (OneMap assumed to find each term). */
function layer1(q: string, assistOn = false) {
  const x = expandAliases(q);
  const results = x.terms.map((t, i) => P(t, String(100000 + i), 'alias'));
  return {
    results,
    didYouMean: false,
    ...(x.display && results.length ? { alias: x.display } : {}),
    assist: assistOn && results.length < 2,
  };
}

type Reply = Record<string, unknown> | 'fail' | 'hang' | '429';
interface Stub {
  first: (q: string) => Record<string, unknown>;
  /** ms to hold the step=1 answer for q. */
  slow?: (q: string) => number;
  full?: (q: string) => Reply;
  gate?: Promise<void>;
}
/** Live mode, /api/* answered here. Returns every /api/search URL (path + query) in order. */
async function live(page: Page, s: Stub) {
  const calls: string[] = [];
  await page.route('**/api/**', async (r: Route) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/health') return r.fulfill({ json: { ok: true, fixtureMode: false } });
    if (u.pathname === '/api/search') {
      calls.push(u.pathname + u.search);
      const q = u.searchParams.get('q') ?? '';
      if (u.searchParams.get('step') === '1') {
        const ms = s.slow?.(q) ?? 0;
        if (ms) await new Promise((res) => setTimeout(res, ms));
        return r.fulfill({ json: s.first(q) });
      }
      if (s.gate) await s.gate;
      const a = s.full ? s.full(q) : s.first(q);
      if (a === 'hang') return; // never answers
      if (a === 'fail')
        return r.fulfill({
          status: 500,
          json: { error: { code: 'upstream_error', message: 'x' } },
        });
      if (a === '429')
        return r.fulfill({
          status: 429,
          json: { error: { code: 'rate_limited', message: 'x' } },
        });
      return r.fulfill({ json: { didYouMean: false, ...a } });
    }
    return r.fulfill({
      status: 503,
      json: { error: { code: 'not_configured', message: 'x' } },
    });
  });
  return calls;
}

/** Times (performance.now) when the assist line appears / goes and when the full (non step=1) search starts. */
async function timeline(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __tl: Record<string, number> };
    w.__tl = {};
    const f = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/search') && !url.includes('step=1')) w.__tl.fullStart ??= performance.now();
      return f(input, init);
    };
    new MutationObserver(() => {
      const on = !!document.querySelector('[data-testid=search-assist]');
      if (on) w.__tl.lineOn ??= performance.now();
      if (!on && w.__tl.lineOn !== undefined) w.__tl.lineOff ??= performance.now();
      if (document.querySelector('[data-testid=search-empty],[data-testid=search-results],[data-testid=search-didyoumean]') && w.__tl.fullStart !== undefined) {
        if (!on) w.__tl.settled ??= performance.now();
      }
    }).observe(document, { subtree: true, childList: true });
  });
}
const tl = (page: Page) => page.evaluate(() => (window as unknown as { __tl: Record<string, number> }).__tl);

async function openSearch(page: Page, lang: Lang, s: Stub, opts: { mic?: boolean; demo?: boolean; textSize?: string } = {}) {
  const calls = opts.demo ? [] : await live(page, s);
  await setup(page, { lang, ...(opts.textSize ? { textSize: opts.textSize } : {}) }, undefined, { clock: false });
  if (opts.mic) await scriptedMic(page);
  await page.goto(opts.demo ? '/?demo=1' : '/');
  await page.getByTestId('to-field').click();
  await expect(page.getByTestId('search-input')).toBeVisible();
  return calls;
}

/** A scripted SpeechRecognition (window.__sr = newest instance), so the real web adapter runs. */
async function scriptedMic(page: Page) {
  await page.addInitScript(() => {
    class FakeSR {
      lang = '';
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (window as unknown as { __sr: FakeSR }).__sr = this;
      }
      stop() {
        this.onerror?.({ error: 'aborted' });
        this.onend?.();
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeSR,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: FakeSR,
    });
  });
}
/** Final result with alternatives (best first), honouring the adapter's maxAlternatives like a real engine. */
const hear = (page: Page, alts: string[]) =>
  page.evaluate((a) => {
    const r = (
      window as unknown as {
        __sr: {
          maxAlternatives: number;
          onresult: (e: unknown) => void;
          onend: () => void;
        };
      }
    ).__sr;
    const list = a.slice(0, Math.max(1, r.maxAlternatives)).map((t, i) => ({ transcript: t, confidence: 0.9 - i * 0.2 }));
    r.onresult({ results: [Object.assign(list, { isFinal: true })] });
    r.onend();
  }, alts);

const liveText = (page: Page) => page.getByTestId('live');

// ------------------------------------------------------------------ alias line (6g.2 a)
const ALIAS_CASES: {
  q: string;
  lang: Lang;
  line: string | null;
  rows: number;
}[] = [
  {
    q: 'KKH',
    lang: 'en',
    line: "“KKH” means “KK Women's and Children's Hospital”",
    rows: 1,
  },
  { q: 'KKH', lang: 'zh', line: '“KKH”就是“竹脚妇幼医院”', rows: 1 },
  {
    q: 'SGH',
    lang: 'en',
    line: '“SGH” means “Singapore General Hospital”',
    rows: 1,
  },
  { q: 'SGH', lang: 'zh', line: '“SGH”就是“新加坡中央医院”', rows: 1 },
  // Speech spells letters out: "K K 医院" normalises to kk医院 → KK hospital.
  { q: 'K K 医院', lang: 'zh', line: '“K K 医院”就是“竹脚妇幼医院”', rows: 1 },
  // 牛车水 names three places (MRT, Chinatown Point, Chinatown Complex): rows, but no "means" line (one-place rule).
  { q: '牛车水', lang: 'zh', line: null, rows: 3 },
];
for (const c of ALIAS_CASES)
  test(`6g.2(a) alias: "${c.q}" (${c.lang}) → ${c.rows} row(s), ${c.line ? 'explainer line' : 'no explainer line'}`, async ({ page }) => {
    const calls = await openSearch(page, c.lang, { first: (q) => layer1(q) });
    await page.getByTestId('search-input').fill(c.q);
    await expect(page.getByTestId('search-results').locator('li')).toHaveCount(c.rows);
    const line = page.getByTestId('search-alias-line');
    if (c.line) {
      await expect(line).toHaveText(c.line);
      await expect(liveText(page)).toContainText(c.line.replace(/”$/, '”'));
    } else await expect(line).toHaveCount(0);
    await expect(page.getByTestId('search-assist')).toHaveCount(0);
    expect(calls.length, 'one request (no assist)').toBe(1);
    expect(calls[0]).toContain('step=1');
    await expect(page.getByTestId('search-input')).toHaveValue(c.q);
  });

test('6g.2(a) the explainer line never pairs NEW typed text with the OLD place while the next search runs', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __lines: string[] };
    w.__lines = [];
    new MutationObserver(() => {
      const t = document.querySelector('[data-testid=search-alias-line]')?.textContent;
      if (t && w.__lines.at(-1) !== t) w.__lines.push(t);
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await openSearch(page, 'en', {
    first: (q) => layer1(q),
    slow: (q) => (q === 'KKH' ? 0 : 1500),
  });
  await page.getByTestId('search-input').fill('KKH');
  await expect(page.getByTestId('search-alias-line')).toHaveText("“KKH” means “KK Women's and Children's Hospital”");
  await page.getByTestId('search-input').fill('Bishan Park');
  await page.waitForTimeout(1200); // debounce + the slow answer still running
  await expect(page.getByTestId('search-empty')).toBeVisible({ timeout: 5000 });
  const lines = await page.evaluate(() => (window as unknown as { __lines: string[] }).__lines);
  test.info().annotations.push({
    type: 'alias-lines-seen',
    description: lines.join(' | '),
  });
  expect(
    lines.filter((l) => !l.startsWith('“KKH”')),
    'explainer lines shown for another query',
  ).toEqual([]);
});

// ------------------------------------------------------------------ two-request flow (6g.2 b/c)
for (const lang of ['zh', 'en'] as const)
  test(`6g.2(b→c) 观音 (${lang}): step=1 then ONE full request with the same q; Did you mean list; field unchanged`, async ({ page }) => {
    const calls = await openSearch(page, lang, {
      first: () => ({ results: [P('Guan Yin Road', '111111')], assist: true }),
      full: () => ({
        results: [P('Guan Yin Road', '111111'), ...TEMPLES],
        didYouMean: true,
      }),
    });
    await page.getByTestId('search-input').fill('观音');
    const dym = page.getByTestId('search-didyoumean');
    await expect(dym).toBeVisible();
    await expect(
      page.locator('.sect h2', {
        hasText: lang === 'zh' ? '你是不是要找：' : 'Did you mean:',
      }),
    ).toBeVisible();
    for (const t of TEMPLES) await expect(dym).toContainText(t.name);
    await expect(page.getByTestId('search-results')).toContainText('Guan Yin Road');
    await expect(page.getByTestId('search-results').locator('li')).toHaveCount(1); // Layer 1 row stays on top, not repeated
    await expect(liveText(page)).toHaveText(lang === 'zh' ? '找到 1 个地方。你是不是要找：3 个地方。' : '1 place found. Did you mean: 3 places.');
    await expect(page.getByTestId('search-input')).toHaveValue('观音');
    expect(calls.map((c) => new URL(c, 'http://x').searchParams.get('step'))).toEqual(['1', null]);
    expect(calls.map((c) => new URL(c, 'http://x').searchParams.get('q'))).toEqual(['观音', '观音']);
  });

test('6g.2(b) "Trying other names…" appears ≥ 400 ms after the full request starts, goes when it answers', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await timeline(page);
  await openSearch(page, 'en', {
    first: () => ({ results: [], assist: true }),
    full: () => ({ results: TEMPLES, didYouMean: true }),
    gate,
  });
  await page.getByTestId('search-input').fill('guan yin');
  await expect(page.getByTestId('search-assist')).toHaveText('Trying other names for it…');
  await expect(page.getByTestId('search-empty')).toHaveCount(0);
  const t1 = await tl(page);
  test.info().annotations.push({
    type: 'assist-line-delay-ms',
    description: (t1.lineOn! - t1.fullStart!).toFixed(0),
  });
  expect(t1.lineOn! - t1.fullStart!).toBeGreaterThanOrEqual(400);
  release();
  await expect(page.getByTestId('search-didyoumean')).toBeVisible();
  await expect(page.getByTestId('search-assist')).toHaveCount(0);
});

test('6g.2(b) fast extra help (< 400 ms): the line never shows', async ({ page }) => {
  await timeline(page);
  await openSearch(page, 'en', {
    first: () => ({ results: [], assist: true }),
    full: () => ({ results: TEMPLES, didYouMean: true }),
  });
  await page.getByTestId('search-input').fill('guan yin');
  await expect(page.getByTestId('search-didyoumean')).toBeVisible();
  expect((await tl(page)).lineOn).toBeUndefined();
});

test('6g.2(e) silent give-up at 4 s: line goes, (d) with postal hint, no error words', async ({ page }) => {
  await timeline(page);
  await openSearch(page, 'en', {
    first: () => ({ results: [], assist: true }),
    full: () => 'hang',
  });
  await page.getByTestId('search-input').fill('nowhere at all');
  await expect(page.getByTestId('search-assist')).toBeVisible();
  await expect(page.getByTestId('search-empty')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('search-assist')).toHaveCount(0);
  const t = await tl(page);
  const gaveUp = t.lineOff! - t.fullStart!;
  test.info().annotations.push({
    type: 'assist-give-up-ms',
    description: gaveUp.toFixed(0),
  });
  expect(gaveUp).toBeGreaterThanOrEqual(3900);
  expect(gaveUp).toBeLessThanOrEqual(5000);
  await expect(page.getByTestId('search-empty')).toContainText('postal code');
  await expect(page.locator('body')).not.toContainText(/failed|error|失败|错误/i);
});

for (const lang of ['zh', 'en'] as const)
  test(`6g.2(d) empty (${lang}): postal-code hint, polite outcome`, async ({ page }) => {
    await openSearch(page, lang, {
      first: () => ({ results: [], assist: false }),
    });
    await page.getByTestId('search-input').fill('qqqq');
    await expect(page.getByTestId('search-empty')).toContainText(
      lang === 'zh' ? '换个说法试试，比如“医院”“巴刹”、地址或邮区编号。' : 'Try other words, like “hospital”, “market”, an address or a postal code.',
    );
    await expect(liveText(page)).toHaveText(lang === 'zh' ? '没找到“qqqq”。换个说法试试。' : 'Couldn’t find “qqqq”. Try other words.'.replace('’', "'"));
  });

for (const fail of ['fail', '429'] as const)
  test(`6g.2(e) assist answers ${fail === 'fail' ? '500' : '429'}: Layer 1 result stays, nothing about a helper`, async ({ page }) => {
    await openSearch(page, 'en', {
      first: () => ({ results: [P('One Place', '222222')], assist: true }),
      full: () => fail,
    });
    await page.getByTestId('search-input').fill('one place');
    await expect(page.getByTestId('search-result-0')).toContainText('One Place');
    await expect(liveText(page)).toHaveText('1 place found.');
    await expect(page.getByTestId('search-assist')).toHaveCount(0);
    await expect(page.getByTestId('search-didyoumean')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/failed|error|try again later|busy/i);
  });

// ------------------------------------------------------------------ voice (6g.3)
test('6g.3 voice on the demo platform: three alternatives → field holds the best, "You said" row, tap → field focused', async ({ page }) => {
  await openSearch(page, 'en', { first: () => ({}) }, { mic: true, demo: true });
  await page.getByTestId('search-mic').click();
  await expect(page.getByTestId('search-listening')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __sr: { maxAlternatives: number } }).__sr.maxAlternatives)).toBe(3);
  await hear(page, ['tan tock seng', 'tan tok seng', 'ten tock sang']);
  const row = page.getByTestId('search-heard');
  await expect(row).toContainText('You said: “tan tock seng”');
  await expect(row).toContainText('Change');
  await expect(page.getByTestId('search-input')).toHaveValue('tan tock seng');
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  await row.click();
  await expect(page.getByTestId('search-input')).toBeFocused();
  await expect(row).toHaveCount(0);
});

test('6g.3 voice (live): the other two alternatives go to the Worker as alt=, best not repeated; typed search shows no row', async ({ page }) => {
  const calls = await openSearch(page, 'zh', { first: (q) => layer1(q) }, { mic: true });
  await page.getByTestId('search-mic').click();
  await hear(page, ['中央医院', '中样医院', '钟阳医院']);
  await expect(page.getByTestId('search-heard')).toContainText('你说的是：“中央医院”');
  await expect(page.getByTestId('search-alias-line')).toHaveText('“中央医院”就是“新加坡中央医院”');
  await expect(liveText(page)).toHaveText('你说的是：中央医院。找到 1 个地方。“中央医院”就是“新加坡中央医院”。');
  const u = new URL(calls[0]!, 'http://x');
  expect(u.searchParams.get('q')).toBe('中央医院');
  expect(u.searchParams.getAll('alt')).toEqual(['中样医院', '钟阳医院']);
  await page.getByTestId('search-input').fill('SGH');
  await expect(page.getByTestId('search-alias-line')).toHaveText('“SGH”就是“新加坡中央医院”');
  await expect.poll(() => calls.length).toBe(2);
  expect(new URL(calls.at(-1)!, 'http://x').searchParams.get('q')).toBe('SGH');
  await expect(page.getByTestId('search-heard')).toHaveCount(0);
  expect(new URL(calls.at(-1)!, 'http://x').searchParams.getAll('alt')).toEqual([]);
});

test('6g.4 hardware/browser Back (history.back) while listening stops listening and stays on H2', async ({ page }) => {
  await openSearch(page, 'en', { first: () => ({ results: [] }) }, { mic: true });
  const url = page.url();
  await page.getByTestId('search-mic').click();
  await expect(page.getByTestId('search-listening')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByTestId('search-listening')).toHaveCount(0);
  await expect(page.getByTestId('search-input'), 'still on H2 after Back while listening').toBeVisible();
  expect(page.url()).toBe(url);
});

// ------------------------------------------------------------------ C1-A credit (6g.1)
type Box = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};
const boxes = (page: Page) =>
  page.evaluate(() => {
    const b = (s: string) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    return {
      credit: b('[data-testid=map-credit]'),
      locate: b('[data-testid=map-recentre]'),
      map: b('[data-testid=map-box]'),
    };
  });
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const theme of ['light', 'dark'] as const)
  for (const textSize of ['standard', 'xxlarge'] as const)
    test(`6g.1 C1-A credit on the H4 map card + Bigger map (${theme}, ${textSize === 'standard' ? 100 : 200} %): visible, compact, bottom-left, plain text, clear of locate`, async ({
      page,
    }) => {
      await setup(page, { lang: 'en', theme, textSize });
      await page.goto('/?demo=1');
      await page.getByTestId('to-field').click();
      await page.getByTestId('search-input').fill('tan tock');
      await page.getByTestId('search-result-0').click();
      await page.getByTestId('route-option-0').click();
      const credit = page.getByTestId('map-credit');
      await expect(credit).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('map-recentre')).toBeVisible({
        timeout: 5000,
      });
      for (const big of [false, true]) {
        if (big) {
          await page.getByTestId('toggle-map').click();
          await page.waitForTimeout(400); // the card resizes
        }
        await expect(credit).toHaveText('OneMap © contributors, Singapore Land Authority');
        await expect(credit.locator('a, button, [tabindex]')).toHaveCount(0);
        await expect(credit.locator('img')).toHaveAttribute('alt', '');
        const m = await boxes(page);
        const where = big ? 'bigger map' : 'card';
        expect(m.credit!.width, `${where}: credit width`).toBeLessThanOrEqual(200);
        expect(m.credit!.height, `${where}: credit height`).toBeLessThanOrEqual(40);
        expect(m.credit!.left - m.map!.left, `${where}: credit at left`).toBeLessThanOrEqual(24);
        expect(m.map!.bottom - m.credit!.bottom, `${where}: credit at bottom`).toBeLessThanOrEqual(24);
        expect(m.credit!.bottom <= m.map!.bottom + 0.5 && m.credit!.top >= m.map!.top - 0.5, `${where}: credit inside the card`).toBe(true);
        expect(overlaps(m.credit!, m.locate!), `${where}: locate button overlaps the credit`).toBe(false);
        // Nothing else painted on top of the credit's centre (at 200 % the card's foot can sit below the
        // Start dock in the scroller, which is scrolling, not overlap: bring it into view first).
        await credit.scrollIntoViewIfNeeded();
        Object.assign(m, await boxes(page));
        // The host is pointer-events:none (never a target), so hit-test with it switched on for a moment.
        const top = await page.evaluate(
          ({ x, y }) => {
            const hosts = [...document.querySelectorAll<HTMLElement>('.attribhost, [data-testid=map-credit]')];
            const old = hosts.map((h) => h.style.pointerEvents);
            hosts.forEach((h) => (h.style.pointerEvents = 'auto'));
            const el = document.elementFromPoint(x, y);
            const hit = el?.closest('[data-testid=map-credit]') ? 'credit' : (el?.outerHTML.slice(0, 160) ?? 'nothing');
            hosts.forEach((h, i) => (h.style.pointerEvents = old[i]!));
            return hit;
          },
          {
            x: m.credit!.left + m.credit!.width / 2,
            y: m.credit!.top + m.credit!.height / 2,
          },
        );
        expect(top, `${where}: the element on top of the credit's centre`).toBe('credit');
      }
    });

// ------------------------------------------------------------------ privacy v2 (6g.5)
test('6g.5 privacy v2: ≤ 400 en words, Anthropic + speech lines (zh/en), notice version 2', async ({ page }) => {
  await setup(page, { lang: 'en' });
  await page.goto('/privacy?lang=en&demo=1');
  const pv = page.getByTestId('privacy-page');
  await expect(pv).toBeVisible();
  const en = await page.evaluate(() => {
    const root = document.querySelector('[data-testid=privacy-page]')!.cloneNode(true) as HTMLElement;
    root.querySelectorAll('[data-testid=pv-footer],[data-testid=pv-open]').forEach((e) => e.remove());
    return (root as HTMLElement).innerText || root.textContent || '';
  });
  const words = en.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  test.info().annotations.push({ type: 'privacy-words-en', description: String(words) });
  expect(words).toBeLessThanOrEqual(400);
  expect(en).toContain("Anthropic's Claude:");
  expect(en).toMatch(/only when a search finds almost nothing, it gets just the words you searched for/);
  expect(en).toMatch(/up to 30 days/);
  expect(en).toMatch(/Your phone's speech service/);
  expect(en).toMatch(/we get only the text/);
  await expect(page.getByTestId('pv-footer')).toContainText('Notice version 2');
  await page.goto('/privacy?lang=zh&demo=1');
  await expect(pv).toContainText('Anthropic 的 Claude：');
  await expect(pv).toContainText('手机的语音服务');
  await expect(page.getByTestId('pv-footer')).toContainText('说明版本 2');
});

// ------------------------------------------------------------------ no "AI / Claude" outside Privacy (6g rule)
test('6g rule (static): no AI / Claude / Anthropic / 智能 in any UI string except the privacy notice', () => {
  const dir = join(__dirname, '../../src/web/src/i18n');
  const hits: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && x !== 'privacy.ts')) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) if (FORBIDDEN.test(m[2]!)) hits.push(`${f}: ${m[2]!.slice(0, 80)}`);
  }
  expect(hits).toEqual([]);
});

for (const lang of ['zh', 'en'] as const)
  test(`6g rule (runtime, ${lang}): no AI / Claude / Anthropic / 智能 on H2 states, Home, Settings, About, H3, H4`, async ({ page }) => {
    test.setTimeout(90_000);
    await openSearch(page, lang, {
      first: () => ({ results: [], assist: true }),
      full: (q) => (q === 'guan yin' ? { results: TEMPLES, didYouMean: true } : { results: [] }),
    });
    const seen: string[] = [];
    const grab = async (label: string) => seen.push(`${label}: ${await page.locator('body').innerText()}`);
    await page.getByTestId('search-input').fill('guan yin');
    await expect(page.getByTestId('search-didyoumean')).toBeVisible();
    await grab('H2 did-you-mean');
    await page.getByTestId('search-input').fill('zzzz');
    await expect(page.getByTestId('search-empty')).toBeVisible({
      timeout: 8000,
    });
    await grab('H2 empty');
    for (const path of ['/?demo=1', '/settings?demo=1', '/about?demo=1']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await grab(path);
    }
    await page.goto('/?demo=1');
    await page.getByTestId('to-field').click();
    await page.getByTestId('search-input').fill('tan tock');
    await page.getByTestId('search-result-0').click();
    await expect(page.getByTestId('route-option-0')).toBeVisible();
    await grab('H3');
    await page.getByTestId('route-option-0').click();
    await expect(page.getByTestId('step-list')).toBeVisible();
    await grab('H4');
    const bad = seen.filter((s) => FORBIDDEN.test(s)).map((s) => `${lang} ${s.split(':')[0]}: ${s.match(FORBIDDEN)![0]}`);
    expect(bad).toEqual([]);
  });
