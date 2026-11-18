import { describe, expect, it } from 'vitest';
import { rankItineraries } from '@howtogo/shared';
import { FIXTURES } from '@howtogo/shared/fixtures';
import { normalizeOneMapPlan } from '@howtogo/shared';
import { tf, UI, type UiKey } from '../src/i18n/ui';
import { inSingapore } from '../src/state/location';
import { createStore, TEXT_SCALE } from '../src/state/store';
import { greetingKey } from '../src/views/Home';
import { cardLabel, chips, clock, facts, tagText, timeline, walkMetres } from '../src/views/present';
import { roundM, walkOnly } from '../src/views/Routes';
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
      expect(text).toMatch(/^走路 \d+0 米/);
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
    const rows = timeline(it0, { name: '陈笃生医院', address: '11 Jalan Tan Tock Seng' }, T('zh'), 'zh');
    expect(rows.at(-1)).toEqual({ kind: 'dest', title: '到达 陈笃生医院', sub: '11 Jalan Tan Tock Seng' });
    expect(rows.at(-2)!.title).toBe('走到 陈笃生医院');
    expect(rows.find((r) => r.kind === 'bus')!.title).toMatch(/^坐 \d+ 号巴士，坐 \d+ 站$/);
  });

  it('MRT rows carry the line tag inline, the direction and the stop count (Creative #12)', () => {
    for (const name of ['bishanToRafflesPlace', 'angMoKioToNovena'] as const) {
      const p = normalizeOneMapPlan(FIXTURES[name]);
      if (!p.ok) throw new Error('fixture');
      const it0 = p.itineraries.find((i) => i.legs.some((l) => l.mode !== 'walk' && l.mode !== 'bus'));
      if (!it0) continue;
      const leg = it0.legs.find((l) => l.mode !== 'walk' && l.mode !== 'bus')!;
      const row = timeline(it0, { name: 'X' }, T('zh'), 'zh').find((r) => r.kind === 'train')!;
      expect(row.line?.code).toBe(leg.line?.code ?? leg.route);
      expect(row.title).toBe(`${row.line!.before}${row.line!.code}${row.line!.after}`);
      expect(row.title).toMatch(leg.headsign ? /^坐地铁 \w+，往 .+ 方向，坐 \d+ 站$/ : /^坐地铁 \w+，坐 \d+ 站$/);
      const en = timeline(it0, { name: 'X' }, T('en'), 'en').find((r) => r.kind === 'train')!;
      expect(en.title).toMatch(/^Take the \w+ train(, | towards .+, )\d+ stops?$/);
      return;
    }
    throw new Error('no MRT fixture');
  });

  it('card walking fact is in metres, rounded to 10 (AC 31)', () => {
    expect(walkMetres(3)).toBe(10);
    expect(walkMetres(347)).toBe(350);
    expect(roundM(4)).toBe(10);
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
  it('text sizes 85/100/125/150/200 and new settings defaults', () => {
    expect(Object.values(TEXT_SCALE)).toEqual([0.85, 1, 1.25, 1.5, 2]);
    const mem = new Map<string, string>();
    const kv = { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v), remove: (k: string) => void mem.delete(k) };
    const s = createStore(kv, kv);
    expect(s.settings.value).toMatchObject({ motion: 'auto', name: '', textSize: 'standard', onboarded: false });
    s.dispose();
  });
});

describe('fix round M1', () => {
  it('deep link #/route?from=&to= resolves names, falls back to coordinates (AC 6)', async () => {
    const { parseRouteLink } = await import('../src/router/deeplink');
    const api = { revgeocode: async (p: { lat: number }) => (p.lat > 1.33 ? { name: 'Toa Payoh Central' } : Promise.reject(new Error('404'))) } as never;
    expect(await parseRouteLink('#/home', api)).toBeNull();
    expect(await parseRouteLink('#/route?from=1.33465,103.8491', api)).toBeNull();
    const r = await parseRouteLink('#/route?from=1.33465,103.8491&to=1.32135,103.8465', api);
    expect(r).toEqual({ from: { name: 'Toa Payoh Central', lat: 1.33465, lng: 103.8491 }, to: { name: '1.32135, 103.84650', lat: 1.32135, lng: 103.8465 } });
    expect((await parseRouteLink('#/route?to=1.32135,103.8465', api))!.from).toBeNull();
  });
  it('map route summary counts drawn lines and markers (AC 38 log hook)', async () => {
    const { routeSummary } = await import('../src/map/map');
    const f = (props: Record<string, unknown>[]) => ({ type: 'FeatureCollection' as const, features: props.map((p) => ({ type: 'Feature' as const, properties: p, geometry: { type: 'Point' as const, coordinates: [0, 0] } })) });
    expect(routeSummary(f([{ mode: 'walk' }, { mode: 'bus' }, { mode: 'walk' }]), f([{ kind: 'stop' }, { kind: 'stop' }, { kind: 'dest' }]))).toBe('walk=2 transit=1 stops=2 dest=1');
  });
});
