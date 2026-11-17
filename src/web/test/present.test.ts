import { describe, expect, it } from 'vitest';
import { rankItineraries } from '@howtogo/shared';
import { FIXTURES } from '@howtogo/shared/fixtures';
import { normalizeOneMapPlan } from '@howtogo/shared';
import { tf, UI, type UiKey } from '../src/i18n/ui';
import { inSingapore } from '../src/state/location';
import { createStore, TEXT_SCALE } from '../src/state/store';
import { greetingKey } from '../src/views/Home';
import { cardLabel, chips, clock, facts, tagText, timeline } from '../src/views/present';
import { walkOnly } from '../src/views/Routes';
import { itinerary } from './helpers';

const T = (lang: 'zh' | 'en') => (k: UiKey, p?: Record<string, string | number>) => tf(lang, k, p);
const ranked = (name: keyof typeof FIXTURES) => {
  const p = normalizeOneMapPlan(FIXTURES[name]);
  if (!p.ok) throw new Error('fixture');
  return rankItineraries(p.itineraries, 'least_walk');
};

describe('i18n', () => {
  it('zh and en have the same keys and no empty strings (AC 8)', () => {
    expect(Object.keys(UI.en).sort()).toEqual(Object.keys(UI.zh).sort());
    for (const l of ['zh', 'en'] as const) for (const [k, v] of Object.entries(UI[l])) expect(v, `${l}.${k}`).not.toBe('');
  });
  it('fills placeholders and leaves unknown ones', () => {
    expect(tf('zh', 'you_are_near', { p: '家' })).toBe('你在：家附近');
    expect(tf('en', 'none_t', { q: 'abc' })).toBe('Couldn’t find “abc”');
    expect(tf('en', 'arrive_at')).toBe('Arrive {t}');
  });
});

describe('presentation helpers (H3/H4)', () => {
  it('chips: walk minutes, bus badge, MRT line tag with its colour token', () => {
    expect(chips(itinerary('toaPayohToTTSH', 0)).map((c) => c.kind)).toContain('bus');
    const mrt = ranked('bishanToRafflesPlace')[0]!.itinerary;
    expect(chips(mrt).find((c) => c.kind === 'line')).toMatchObject({ code: 'NS', token: 'line-ns' });
  });

  it('tags: best card "推荐 · 最少走路" with alternatives; label only when alone', () => {
    const r = ranked('toaPayohToTTSH');
    expect(tagText(r[0]!, 0, r.length, T('zh'))).toBe(r.length > 1 ? '推荐 · 最少走路' : '最少走路');
    expect(tagText(r[0]!, 0, 1, T('en'))).toBe('Least walking');
  });

  it('facts never mention stairs or lifts (D-8)', () => {
    for (const o of ranked('toaPayohToTTSH')) {
      const text = facts(o.itinerary, T('zh')).map((f) => f.text).join(' ');
      expect(text).toMatch(/^走路 \d+ 分钟/);
      expect(text).not.toMatch(/楼梯|电梯/);
    }
  });

  it('card SR label is one sentence', () => {
    const r = ranked('toaPayohToTTSH');
    expect(cardLabel(r[0]!, 0, r.length, 'zh', T('zh'))).toMatch(/^推荐，最少走路，\d+ 分钟，上午 \d+:\d\d 到达。走路 \d+ 分钟，然后巴士 \d+/);
  });

  it('clock is Singapore time with a spaced day period in zh', () => {
    const t = Date.UTC(2026, 10, 18, 2, 39); // 10:39 SGT
    expect(clock(t, 'zh')).toBe('上午 10:39');
    expect(clock(t, 'en').toLowerCase()).toMatch(/^10:39\s?am$/);
  });

  it('timeline ends with the arrival row and uses the destination name for the last walk', () => {
    const it0 = itinerary('toaPayohToTTSH', 0);
    const rows = timeline(it0, { name: '陈笃生医院', address: '11 Jalan Tan Tock Seng' }, T('zh'));
    expect(rows.at(-1)).toEqual({ kind: 'dest', title: '到达 陈笃生医院', sub: '11 Jalan Tan Tock Seng' });
    expect(rows.at(-2)!.title).toBe('走到 陈笃生医院');
    expect(rows.find((r) => r.kind === 'bus')!.title).toMatch(/^坐 \d+ 号巴士，坐 \d+ 站$/);
  });

  it('walkOnly builds a single walk leg for the too-close state', () => {
    const w = walkOnly({ name: 'A', lat: 1.3, lng: 103.8 }, { name: 'B', lat: 1.3009, lng: 103.8 });
    expect(w.itinerary.legs).toHaveLength(1);
    expect(w.itinerary.legs[0]!.mode).toBe('walk');
    expect(w.itinerary.walkDistanceM).toBeGreaterThan(90);
  });
});

describe('small pure bits', () => {
  it('greeting by hour', () => {
    expect([greetingKey(7), greetingKey(12), greetingKey(18)]).toEqual(['greet_morning', 'greet_afternoon', 'greet_evening']);
  });
  it('Singapore box (AC 16)', () => {
    expect(inSingapore({ lat: 1.3521, lng: 103.8198 })).toBe(true);
    expect(inSingapore({ lat: 1.5, lng: 103.8 })).toBe(false);
    expect(inSingapore({ lat: 1.3, lng: 104.2 })).toBe(false);
  });
  it('text sizes 100/125/150/200 and new settings defaults', () => {
    expect(Object.values(TEXT_SCALE)).toEqual([1, 1.25, 1.5, 2]);
    const mem = new Map<string, string>();
    const kv = { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v), remove: (k: string) => void mem.delete(k) };
    const s = createStore(kv, kv);
    expect(s.settings.value).toMatchObject({ motion: 'auto', name: '', textSize: 'standard', onboarded: false });
    s.dispose();
  });
});
