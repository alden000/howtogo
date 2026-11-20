/** 1.1 UI round: two-step search fields, H2 section/line logic, SR sentences, voice states and copy rules (STYLE-GUIDE 6g). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpApi } from '../src/api/client';
import type { SearchResult, SearchResults } from '../src/api/types';
import { UI as UI_GLOBAL } from '../src/i18n/ui';
import { SEARCH_UI } from '../src/i18n/search';

/** H2 copy lives in its own lazy table (QA-63); these checks read both. */
const UI = { zh: { ...UI_GLOBAL.zh, ...SEARCH_UI.zh }, en: { ...UI_GLOBAL.en, ...SEARCH_UI.en } };
import { PV_EN, PV_ZH } from '../src/i18n/privacy';
import { createWebPlatform } from '../src/platform/web';
import { searchView, sentences, voiceError } from '../src/views/Search';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
let pc = 0;
const hit = (name: string, via?: SearchResult['via']): SearchResult => ({ name, address: 'a', postal: String(100000 + ++pc), lat: 1.3, lng: 103.8, ...(via ? { via } : {}) });
const res = (rows: SearchResult[], flags: Partial<Omit<SearchResults, keyof SearchResult[]>> = {}): SearchResults => Object.assign([...rows], flags);

afterEach(() => vi.unstubAllGlobals());

describe('search client: two-step and the UI fields', () => {
  it('step 1 adds &step=1 and passes assist, alias and guess through', async () => {
    const fetch = vi.fn(async (_u: string | URL | Request) => json({ results: [], didYouMean: false, assist: true, alias: { zh: '竹脚妇幼医院', en: "KK Women's and Children's Hospital" }, guess: 'X' }));
    const api = createHttpApi({ base: 'https://w.example/', fetch: fetch as typeof globalThis.fetch });
    const r = await api.search('kkh', undefined, { step: 1 });
    expect(String(fetch.mock.calls[0]![0])).toBe('https://w.example/api/search?q=kkh&step=1&v=2');
    expect(r.assist).toBe(true);
    expect(r.alias).toEqual({ zh: '竹脚妇幼医院', en: "KK Women's and Children's Hospital" });
    expect(r.guess).toBe('X');
  });
  it('the full request has no step; absent flags stay absent', async () => {
    const fetch = vi.fn(async (_u: string | URL | Request) => json({ results: [hit('A', 'direct')], didYouMean: false, assist: false }));
    const r = await createHttpApi({ base: 'https://w.example/', fetch: fetch as typeof globalThis.fetch }).search('a');
    expect(String(fetch.mock.calls[0]![0])).toBe('https://w.example/api/search?q=a&v=2');
    expect(r.assist).toBeUndefined();
    expect(r.alias).toBeUndefined();
    expect(r.guess).toBeUndefined();
  });
});

describe('H2 sections and quiet lines (6g.2)', () => {
  const kk = { zh: '竹脚妇幼医院', en: "KK Women's and Children's Hospital" };
  it('(a) alias line only when the full name differs from what was typed; zh falls back to en', () => {
    const r = res([hit("KK Women's and Children's Hospital", 'alias')], { alias: kk });
    expect(searchView(r, 'KKH', 'zh').line).toEqual({ key: 'alias_line', q: 'KKH', full: '竹脚妇幼医院' });
    expect(searchView(r, 'KKH', 'en').line).toEqual({ key: 'alias_line', q: 'KKH', full: "KK Women's and Children's Hospital" });
    expect(searchView(r, '竹脚妇幼医院', 'zh').line).toBeNull();
    expect(searchView(r, "kk women's and children's hospital", 'en').line).toBeNull();
    expect(searchView(res([...r], { alias: { en: 'Outram Community Hospital' } }), 'och', 'zh').line).toEqual({ key: 'alias_line', q: 'och', full: 'Outram Community Hospital' });
  });
  it('(c) did you mean: Layer 1 rows stay on top, the extra-help rows follow, at most 8', () => {
    const ai = Array.from({ length: 10 }, (_, i) => hit(`Temple ${i}`, 'ai'));
    const v = searchView(res([hit('Guan Yin Road', 'direct'), ...ai], { didYouMean: true }), 'guan yin', 'en');
    expect(v.found.map((x) => x.name)).toEqual(['Guan Yin Road']);
    expect(v.dym).toHaveLength(8);
    expect(v.line).toBeNull();
  });
  it("(c') one guess: the extra help's places under Places found with the guess line", () => {
    const v = searchView(res([hit('Tan Tock Seng Hospital', 'ai')], { guess: 'Tan Tock Seng Hospital' }), 'the big hospital', 'en');
    expect(v.found).toHaveLength(1);
    expect(v.dym).toEqual([]);
    expect(v.line).toEqual({ key: 'guess_line', term: 'Tan Tock Seng Hospital' });
  });
  it('plain results (fixture / mock: no via, no flags): one section, no line', () => {
    const v = searchView(res([hit('A'), hit('B')]), 'a', 'zh');
    expect(v.found).toHaveLength(2);
    expect(v.dym).toEqual([]);
    expect(v.line).toBeNull();
  });
});

describe('SR sentences and copy', () => {
  it('joins sentences per language exactly as the frames', () => {
    const zh = UI.zh;
    const en = UI.en;
    expect(sentences('zh', [zh.sr_found1, zh.alias_line.replace('{q}', 'KKH').replace('{full}', '竹脚妇幼医院')])).toBe('找到 1 个地方。“KKH”就是“竹脚妇幼医院”。');
    expect(sentences('en', [en.sr_found.replace('{n}', '2'), en.alias_line.replace('{q}', 'KKH').replace('{full}', 'X')])).toBe('2 places found. “KKH” means “X”.');
    expect(sentences('zh', ['你说的是：中央医院。', zh.sr_none.replace('{q}', 'x')])).toBe('你说的是：中央医院。没找到“x”。换个说法试试。');
  });
  it('6g copy is exact', () => {
    expect(UI.zh.assist_line).toBe('换个说法再找找…');
    expect(UI.en.assist_line).toBe('Trying other names for it…');
    expect(UI.zh.didyoumean).toBe('你是不是要找：');
    expect(UI.en.didyoumean).toBe('Did you mean:');
    expect(UI.zh.none_s).toBe('换个说法试试，比如“医院”“巴刹”、地址或邮区编号。');
    expect(UI.en.none_s).toBe('Try other words, like “hospital”, “market”, an address or a postal code.');
    expect(UI.zh.heard_line).toBe('你说的是：“{text}”');
    expect(UI.en.heard_edit).toBe('Change');
    expect(UI.zh.listening).toBe('我在听…请说地方名字');
    expect(UI.en.v_nomic_b).toBe("You can allow it in your phone's settings, or type instead.");
  });
  it('never says AI / 智能 / 人工智能 / 机器人 / Claude in the app UI; Anthropic and Claude only on Privacy', () => {
    for (const lang of ['zh', 'en'] as const) {
      for (const [k, v] of Object.entries(UI[lang])) expect(`${k}: ${v}`).not.toMatch(/\bAI\b|智能|人工智能|机器人|Claude|Anthropic/);
    }
    expect(PV_EN.pv_3e).toContain("Anthropic's Claude");
    expect(PV_ZH.pv_3e).toContain('Anthropic 的 Claude');
  });
});

describe('voice (6g.4)', () => {
  it('recognition errors map to calm states', () => {
    expect(voiceError(new Error('not-allowed'))).toBe('nomic');
    expect(voiceError(new Error('service-not-allowed'))).toBe('nomic');
    expect(voiceError(new Error('audio-capture'))).toBe('nomic');
    expect(voiceError(new Error('network'))).toBe('offline');
    expect(voiceError(new Error('no-match'))).toBe('nomatch');
  });
  it('partial words when asked (interimResults on); stopped mid-sentence keeps the words heard', async () => {
    type Made = { interimResults: boolean; onresult: ((e: unknown) => void) | null; onend: (() => void) | null };
    const made: Made[] = [];
    class FakeSR {
      lang = '';
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        made.push(this);
      }
      stop() {
        this.onend?.();
      }
    }
    vi.stubGlobal('webkitSpeechRecognition', FakeSR);
    const p = createWebPlatform();
    const parts: string[] = [];
    const done = p.recognition!.listenAll!('zh-CN', { onPartial: (x) => parts.push(x) });
    // QA-63: the engine wrapper is a lazy chunk; the first start waits for it.
    await vi.waitFor(() => expect(made).toHaveLength(1));
    expect(made[0]!.interimResults).toBe(true);
    made[0]!.onresult!({ results: [Object.assign([{ transcript: '中央', confidence: 0 }], { isFinal: false })] });
    p.recognition!.stop();
    expect(await done).toEqual({ text: '中央', alternatives: [{ transcript: '中央', confidence: 0 }] });
    expect(parts).toEqual(['中央']);
    // A final result wins over the partial.
    const again = p.recognition!.listenAll!('zh-CN', { onPartial: () => {} });
    made[1]!.onresult!({ results: [Object.assign([{ transcript: '中', confidence: 0 }], { isFinal: false })] });
    made[1]!.onresult!({ results: [Object.assign([{ transcript: '中央医院', confidence: 0.9 }], { isFinal: true })] });
    made[1]!.onend!();
    expect((await again).text).toBe('中央医院');
  });
});
