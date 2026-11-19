/**
 * 1.1 UI round (STYLE-GUIDE 6g.2–6g.4): H2 smart-search states and the voice line, against a stubbed Worker
 * (live mode, answered here; the extra help is never really called). Speech recognition is a scripted stand-in
 * installed as window.SpeechRecognition, so the real web adapter (platform/web.ts) is exercised.
 * Baselines: H2-{state}-{theme}-{size}-{lang}.png at 390×844, DPR 1 (as baselines.spec).
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { hermetic, logOf, onboarded } from './util';

const FIXED = new Date('2026-11-18T10:15:00+08:00');
type Variant = { theme: 'light' | 'dark'; size: 100 | 200; lang: 'zh' | 'en' };
const ALL: Variant[] = [
  { theme: 'light', size: 100, lang: 'zh' },
  { theme: 'dark', size: 100, lang: 'zh' },
  { theme: 'light', size: 200, lang: 'zh' },
  { theme: 'light', size: 100, lang: 'en' },
];
const ONE: Variant[] = [ALL[0]!];
const vname = (frame: string, v: Variant) => `${frame}-${v.theme}-${v.size}-${v.lang}`;

const P = (name: string, postal: string, via?: string) => ({ name, address: `1 Test Road Singapore ${postal}`, postal, lat: 1.3, lng: 103.83, ...(via ? { via } : {}) });
const KK = P("KK Women's and Children's Hospital", '229899', 'alias');
const KK_ALIAS = { zh: '竹脚妇幼医院', en: "KK Women's and Children's Hospital" };
const TEMPLES = [P('Kwan Im Thong Hood Cho Temple', '188046', 'ai'), P('Leong San See Temple', '218154', 'ai'), P('Guan Yin Tang', '650001', 'ai')];
const TTSH = P('Tan Tock Seng Hospital', '308433', 'ai');

/** One search answer per step: `first` for step=1, `full` for the second request (may wait on a gate). */
type Answer = { first: Record<string, unknown>; full?: Record<string, unknown> | 'fail' | 'hang'; gate?: Promise<void> };

async function open(page: Page, v: Variant, answer: (q: string) => Answer, opts: { mic?: boolean; width?: number } = {}) {
  await page.route('**/api/**', async (r: Route) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/health') return r.fulfill({ json: { ok: true, fixtureMode: false } });
    if (u.pathname === '/api/search') {
      const a = answer(u.searchParams.get('q') ?? '');
      if (u.searchParams.get('step') === '1') return r.fulfill({ json: { didYouMean: false, ...a.first } });
      if (a.gate) await a.gate;
      if (a.full === 'hang') return; // never answers: the client gives up after 4 s
      if (a.full === 'fail') return r.fulfill({ status: 500, json: { error: { code: 'upstream', message: 'x' } } });
      return r.fulfill({ json: { didYouMean: false, ...(a.full ?? a.first) } });
    }
    return r.fulfill({ status: 503, json: { error: { code: 'not_configured', message: 'x' } } });
  });
  await hermetic(page);
  await page.clock.setFixedTime(FIXED);
  await onboarded(page, { lang: v.lang, theme: v.theme, textSize: v.size === 200 ? 'xxlarge' : 'standard', motion: 'on' });
  if (opts.mic) {
    // A scripted recognition engine: the test drives it through window.__sr (the newest instance).
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
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeSR });
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: FakeSR });
    });
  }
  await page.goto('/');
  await page.getByTestId('to-field').click();
  await expect(page.getByTestId('search-input')).toBeVisible();
}

const sr = (page: Page, fn: string, arg?: unknown) =>
  page.evaluate(
    ([f, a]) => {
      const r = (window as unknown as { __sr: Record<string, (e?: unknown) => void> }).__sr;
      const final = (t: string) => ({ results: [Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal: true })] });
      const part = (t: string) => ({ results: [Object.assign([{ transcript: t, confidence: 0 }], { isFinal: false })] });
      if (f === 'final') r.onresult!(final(a as string));
      else if (f === 'partial') r.onresult!(part(a as string));
      else if (f === 'error') r.onerror!({ error: a });
      if (f === 'final' || f === 'error' || f === 'end') r.onend!();
    },
    [fn, arg] as const,
  );

const settled = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
const shot = async (page: Page, name: string) => {
  await page.getByTestId('search-input').blur();
  await settled(page);
  await expect(page).toHaveScreenshot(`${name}.png`, { mask: [page.locator('img')] });
};
const live = (page: Page) => page.getByTestId('live');
const noHScroll = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth + 1);

test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

test.describe('H2 smart search', () => {
  for (const v of ALL)
    test(`(a) alias line ${vname('H2-alias', v)}`, async ({ page }) => {
      await open(page, v, () => ({ first: { results: [KK], alias: KK_ALIAS, assist: false } }));
      await page.getByTestId('search-input').fill('KKH');
      const line = page.getByTestId('search-alias-line');
      await expect(line).toHaveText(v.lang === 'zh' ? '“KKH”就是“竹脚妇幼医院”' : "“KKH” means “KK Women's and Children's Hospital”");
      await expect(live(page)).toHaveText(v.lang === 'zh' ? '找到 1 个地方。“KKH”就是“竹脚妇幼医院”。' : "1 place found. “KKH” means “KK Women's and Children's Hospital”.");
      await expect(page.getByTestId('search-assist')).toHaveCount(0);
      await shot(page, vname('H2-alias', v));
    });

  test('(a) no alias line when the name is what was typed', async ({ page }) => {
    await open(page, ONE[0]!, () => ({ first: { results: [KK], alias: KK_ALIAS, assist: false } }));
    await page.getByTestId('search-input').fill('竹脚妇幼医院');
    await expect(page.getByTestId('search-results')).toBeVisible();
    await expect(page.getByTestId('search-alias-line')).toHaveCount(0);
  });

  for (const v of ALL)
    test(`(b) → (c) extra help: the line only while it runs, then Did you mean ${vname('H2-assist', v)}`, async ({ page }) => {
      let open_!: () => void;
      const gate = new Promise<void>((r) => (open_ = r));
      await open(page, v, () => ({ first: { results: [], assist: true }, full: { results: TEMPLES, didYouMean: true }, gate }));
      await page.getByTestId('search-input').fill('guan yin');
      const line = page.getByTestId('search-assist');
      await expect(line).toHaveText(v.lang === 'zh' ? '换个说法再找找…' : 'Trying other names for it…');
      await expect(page.getByTestId('search-empty')).toHaveCount(0); // (d) waits for the extra help
      await expect(page.locator('.skel')).toHaveCount(0); // no skeletons, no spinner
      await expect(live(page)).toHaveText(v.lang === 'zh' ? '换个说法再找找…' : 'Trying other names for it…');
      await shot(page, vname('H2-assist', v));
      open_();
      await expect(page.getByTestId('search-didyoumean')).toBeVisible();
      await expect(line).toHaveCount(0);
      await expect(page.locator('.sect h2').first()).toHaveText(v.lang === 'zh' ? '你是不是要找：' : 'Did you mean:');
      await expect(page.getByTestId('search-dym-2')).toBeVisible();
      await expect(live(page)).toHaveText(v.lang === 'zh' ? '你是不是要找：3 个地方。' : 'Did you mean: 3 places.');
      await expect(page.getByTestId('search-input')).toHaveValue('guan yin'); // the field never changes
      expect(await noHScroll(page)).toBe(true);
      await shot(page, vname('H2-didyoumean', v));
    });

  test('(b) fast extra help: no line at all (400 ms grace); Layer 1 rows stay on top of Did you mean', async ({ page }) => {
    await open(page, ONE[0]!, () => ({ first: { results: [P('Guan Yin Road', '111111', 'direct')], assist: true }, full: { results: [P('Guan Yin Road', '111111', 'direct'), ...TEMPLES], didYouMean: true } }));
    await page.getByTestId('search-input').fill('guan yin');
    await expect(page.getByTestId('search-didyoumean')).toBeVisible();
    await expect(page.getByTestId('search-result-0')).toContainText('Guan Yin Road');
    await expect(page.getByTestId('search-results').locator('li')).toHaveCount(1);
    expect(await logOf(page)).not.toContain('state:search-assist');
    await expect(live(page)).toHaveText('找到 1 个地方。你是不是要找：3 个地方。');
  });

  test("(c') one guess: places under Places found with the guess line", async ({ page }) => {
    await open(page, ONE[0]!, () => ({ first: { results: [], assist: true }, full: { results: [TTSH], guess: 'Tan Tock Seng Hospital' } }));
    await page.getByTestId('search-input').fill('陈医院');
    await expect(page.getByTestId('search-guess-line')).toHaveText('按“Tan Tock Seng Hospital”找到这些地方');
    await expect(live(page)).toHaveText('找到 1 个地方，按“Tan Tock Seng Hospital”找。');
    await shot(page, vname('H2-guess', ONE[0]!));
    // Picked from the guess: goes to Route options under its real name.
    await page.getByTestId('search-result-0').click();
    await expect(page).toHaveURL(/\/routes$/);
  });

  test('(d) still nothing after the extra help: empty panel with the postal-code hint', async ({ page }) => {
    await open(page, ONE[0]!, () => ({ first: { results: [], assist: true }, full: { results: [] } }));
    await page.getByTestId('search-input').fill('zzzz');
    await expect(page.getByTestId('search-empty')).toContainText('换个说法试试，比如“医院”“巴刹”、地址或邮区编号。');
    await expect(live(page)).toHaveText('没找到“zzzz”。换个说法试试。');
  });

  test('(e) extra help times out (> 4 s) or fails: the line goes silently, plain results / (d)', async ({ page }) => {
    await open(page, ONE[0]!, (q) => ({ first: { results: q === 'one' ? [P('One Place', '222222', 'direct')] : [], assist: true }, full: q === 'one' ? 'fail' : 'hang' }));
    await page.getByTestId('search-input').fill('nothing here');
    await expect(page.getByTestId('search-assist')).toBeVisible();
    await expect(page.getByTestId('search-empty')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('search-assist')).toHaveCount(0);
    await page.getByTestId('search-input').fill('one');
    await expect(page.getByTestId('search-result-0')).toContainText('One Place');
    await expect(page.getByTestId('search-assist')).toHaveCount(0);
    await expect(live(page)).toHaveText('找到 1 个地方。');
    await expect(page.locator('body')).not.toContainText(/失败|failed|error|错误/i);
  });

  test('no "AI / 智能 / Claude" anywhere on H2', async ({ page }) => {
    await open(page, ALL[3]!, () => ({ first: { results: [], assist: true }, full: { results: TEMPLES, didYouMean: true } }));
    await page.getByTestId('search-input').fill('guan yin');
    await expect(page.getByTestId('search-didyoumean')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/\bAI\b|智能|Claude|Anthropic|机器人/);
  });
});

test.describe('H2 voice', () => {
  for (const v of [ALL[0]!, ALL[2]!, ALL[3]!])
    test(`listening → partial → You said row ${vname('H2-heard', v)}`, async ({ page }) => {
      await open(page, v, () => ({ first: { results: [P('Singapore General Hospital', '169608', 'alias')], assist: false } }), { mic: true });
      await page.getByTestId('search-mic').click();
      const panel = page.getByTestId('search-listening');
      await expect(panel).toContainText(v.lang === 'zh' ? '我在听…请说地方名字' : "I'm listening… say the place");
      await expect(panel).toContainText(v.lang === 'zh' ? '说完了我会自己找。' : "I'll search when you stop talking.");
      await expect(page.getByTestId('search-stop')).toBeFocused();
      await expect(page.getByTestId('search-mic')).toHaveAttribute('aria-pressed', 'true');
      await expect(live(page)).toHaveText(v.lang === 'zh' ? '我在听，请说地方名字' : "I'm listening, say the place");
      if (v === ALL[0]) await shot(page, vname('H2-listening', v));
      await sr(page, 'partial', '中央');
      await expect(page.getByTestId('search-partial')).toHaveText('“中央”');
      if (v === ALL[0]) await shot(page, vname('H2-listening-partial', v));
      await sr(page, 'final', '中央医院');
      const row = page.getByTestId('search-heard');
      await expect(row).toContainText(v.lang === 'zh' ? '你说的是：“中央医院”' : 'You said: “中央医院”');
      await expect(row).toContainText(v.lang === 'zh' ? '改一改' : 'Change');
      await expect(row).toHaveAttribute('aria-label', v.lang === 'zh' ? '你说的是：中央医院。按一下可以改。' : 'You said: 中央医院. Tap to change it.');
      await expect(page.getByTestId('search-result-0')).toBeVisible();
      await expect(live(page)).toHaveText(v.lang === 'zh' ? '你说的是：中央医院。找到 1 个地方。' : 'You said: 中央医院. 1 place found.');
      await expect(page.getByTestId('search-input')).toHaveValue('中央医院');
      const box = await row.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(56);
      expect(await noHScroll(page)).toBe(true);
      await shot(page, vname('H2-heard', v));
      // Tap: the field gets focus with the caret at the end; the row goes.
      await row.click();
      await expect(page.getByTestId('search-input')).toBeFocused();
      expect(await page.getByTestId('search-input').evaluate((e: HTMLInputElement) => e.selectionStart === e.value.length)).toBe(true);
      await expect(row).toHaveCount(0);
    });

  test('You said row with (d), and it goes once the field is edited', async ({ page }) => {
    await open(page, ONE[0]!, () => ({ first: { results: [], assist: false } }), { mic: true });
    await page.getByTestId('search-mic').click();
    await sr(page, 'final', '牛车水大厦');
    await expect(page.getByTestId('search-empty')).toBeVisible();
    await expect(page.getByTestId('search-heard')).toBeVisible();
    await expect(live(page)).toHaveText('你说的是：牛车水大厦。没找到“牛车水大厦”。换个说法试试。');
    await shot(page, vname('H2-heard-empty', ONE[0]!));
    await page.getByTestId('search-input').fill('牛车水');
    await expect(page.getByTestId('search-heard')).toHaveCount(0);
  });

  test('typed searches never show the row; Stop keeps the words heard so far; Back while listening stays on H2', async ({ page }) => {
    await open(page, ONE[0]!, () => ({ first: { results: [P('Bishan MRT Station', '579827', 'alias')], assist: false } }), { mic: true });
    await page.getByTestId('search-input').fill('碧山');
    await expect(page.getByTestId('search-result-0')).toBeVisible();
    await expect(page.getByTestId('search-heard')).toHaveCount(0);
    await page.getByTestId('search-input').fill('');
    await page.getByTestId('search-mic').click();
    await expect(page.getByTestId('search-listening')).toBeVisible();
    await page.getByTestId('back').click();
    await expect(page.getByTestId('search-listening')).toHaveCount(0);
    await expect(page.getByTestId('search-input')).toBeVisible(); // still on H2
    await page.getByTestId('search-mic').click();
    await sr(page, 'partial', '碧山');
    await page.getByTestId('search-stop').click();
    await expect(page.getByTestId('search-input')).toHaveValue('碧山');
    await expect(page.getByTestId('search-result-0')).toBeVisible();
  });

  const states: { name: string; act: (p: Page) => Promise<void>; title: string; focus: string }[] = [
    { name: 'nohear', act: (p) => sr(p, 'end'), title: '没听到声音', focus: 'search-say-again' },
    { name: 'nomatch', act: (p) => sr(p, 'error', 'no-match'), title: '没听清楚', focus: 'search-say-again' },
    { name: 'nomic', act: (p) => sr(p, 'error', 'not-allowed'), title: '没法用麦克风', focus: 'search-input' },
  ];
  for (const s of states)
    test(`H2-voice-${s.name}: calm panel, focus, polite title + body`, async ({ page }) => {
      await open(page, ONE[0]!, () => ({ first: { results: [] } }), { mic: true });
      await page.getByTestId('search-mic').click();
      await expect(page.getByTestId('search-listening')).toBeVisible();
      await s.act(page);
      const panel = page.getByTestId(`search-voice-${s.name}`);
      await expect(panel).toContainText(s.title);
      await expect(page.getByTestId(s.focus)).toBeFocused();
      await expect(live(page)).toContainText(s.title);
      await expect(page.locator('body')).not.toContainText(/失败|错误|不清楚的是你/);
      await shot(page, vname(`H2-voice-${s.name}`, ONE[0]!));
      if (s.focus === 'search-say-again') {
        await page.getByTestId('search-say-again').click();
        await expect(page.getByTestId('search-listening')).toBeVisible();
      }
    });

  test('H2-voice-offline: speaking needs internet, focus to the field', async ({ page, context }) => {
    await open(page, ONE[0]!, () => ({ first: { results: [] } }), { mic: true });
    await context.setOffline(true);
    await page.getByTestId('search-mic').click();
    await expect(page.getByTestId('search-voice-offline')).toContainText('说话找地方需要网络');
    await expect(page.getByTestId('search-input')).toBeFocused();
    await shot(page, vname('H2-voice-offline', ONE[0]!));
    await context.setOffline(false);
  });

  test('200 % at 320 px: the You said row and the alias line wrap, no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await open(page, ALL[2]!, () => ({ first: { results: [KK], alias: KK_ALIAS, assist: false } }), { mic: true });
    await page.getByTestId('search-mic').click();
    await sr(page, 'final', 'KKH');
    await expect(page.getByTestId('search-alias-line')).toBeVisible();
    await expect(page.getByTestId('search-heard')).toBeVisible();
    expect(await noHScroll(page)).toBe(true);
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('.heard, .heard *, .quietline')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline').length,
    );
    expect(clipped).toBe(0);
  });
});
