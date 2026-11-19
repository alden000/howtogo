/** M3/M4 fix round A (2026-11-18): QA-29, QA-31/32/35, QA-34, QA-35 (report), QA-47. */
import { describe, expect, it } from 'vitest';
import { DATA_AS_OF, normalizeOneMapPlan, type Itinerary } from '@howtogo/shared';
import { FIXTURES } from '@howtogo/shared/fixtures';
import { tf, type UiKey } from '../src/i18n/ui';
import { logLines, resetLog } from '../src/log';
import { buildReport } from '../src/report';
import { createStore, DEFAULT_SETTINGS, HOME_RECENTS, MAX_RECENTS, sgDateOf } from '../src/state/store';
import { memoryKV } from '../src/state/storage';
import { dataDate, lastRailLeg, relDate } from '../src/transit/m3';
import { APP_VERSION } from '../src/version';
import pkgRaw from '../package.json?raw';
import { timeline } from '../src/views/present';

const T = (lang: 'zh' | 'en') => (k: UiKey, p?: Record<string, string | number>) => tf(lang, k, p);
const railIt = (): Itinerary => {
  const p = normalizeOneMapPlan(FIXTURES.bishanToRafflesPlace);
  if (!p.ok) throw new Error('fixture');
  return p.itineraries.find((i) => i.legs.some((l) => l.mode === 'mrt'))!;
};

describe('QA-47 version', () => {
  it('APP_VERSION matches src/web/package.json and is 1.0.1', () => {
    const pkg = JSON.parse(pkgRaw) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toBe('1.0.1');
  });
});

describe('QA-29 H4 timeline station names (AC 11)', () => {
  it('zh: rail stops come from the zh table by code; en: English', () => {
    const it0 = railIt();
    const zh = timeline(it0, { name: 'X' }, T('zh'), 'zh').map((r) => `${r.title} ${r.sub}`).join('\n');
    expect(zh).toMatch(/碧山 Bishan/);
    expect(zh).toMatch(/在 莱佛士坊 Raffles Place/);
    const en = timeline(it0, { name: 'X' }, T('en'), 'en').map((r) => `${r.title} ${r.sub}`).join('\n');
    expect(en).not.toMatch(/[碧莱]/);
  });

  it('zh: an unknown station falls back to English and logs zh_name_missing:<code> once', () => {
    resetLog();
    const it0 = structuredClone(railIt());
    const leg = it0.legs.find((l) => l.mode === 'mrt')!;
    leg.to = { ...leg.to, name: 'NOWHERE MRT STATION', displayName: 'Nowhere', code: 'ZZ9' };
    delete leg.to.id;
    const rows = timeline(it0, { name: 'X' }, T('zh'), 'zh');
    timeline(it0, { name: 'X' }, T('zh'), 'zh');
    expect(rows.find((r) => r.kind === 'train')!.sub).toBe('在 Nowhere 下车');
    expect(logLines().filter((l) => l === 'zh_name_missing:ZZ9')).toHaveLength(1);
  });
});

describe('QA-34 exit hook helper', () => {
  it('lastRailLeg finds the alight leg, -1 without rail', () => {
    const it0 = railIt();
    const i = lastRailLeg(it0);
    expect(it0.legs[i]!.mode).toBe('mrt');
    expect(lastRailLeg({ ...it0, legs: it0.legs.filter((l) => l.mode === 'walk') })).toBe(-1);
  });
});

describe('QA-31/32 recents (AC 34/35)', () => {
  const P = (name: string, lat: number) => ({ name, lat, lng: 103.85 });
  it('stores the Singapore date only, done=false on start; dedupes on from+to; arrival marks done', () => {
    const kv = memoryKV();
    const s = createStore(kv, memoryKV());
    const at = Date.parse('2026-11-18T23:30:00+08:00');
    s.addRecent(P('TTSH', 1.32), undefined, at);
    s.addRecent(P('TTSH', 1.32), P('Home', 1.33), at);
    s.addRecent(P('TTSH', 1.32), undefined, at + 1000);
    expect(s.recents.value).toHaveLength(2);
    expect(s.recents.value[0]).toEqual({ to: P('TTSH', 1.32), date: '2026-11-18', done: false });
    expect(s.recents.value[1]!.from?.name).toBe('Home');
    s.markRecentDone(P('TTSH', 1.32));
    expect(s.recents.value[0]!.done).toBe(true);
    expect(s.recents.value[1]!.done).toBe(false);
    const raw = kv.data['recents.v2']!;
    expect(raw).not.toMatch(/"at"|T\d\d:/);
    expect(sgDateOf(Date.parse('2026-11-18T16:30:00Z'))).toBe('2026-11-19');
  });

  it('keeps up to MAX_RECENTS (10); Home shows HOME_RECENTS (5)', () => {
    const s = createStore(memoryKV(), memoryKV());
    for (let i = 0; i < 12; i++) s.addRecent(P(`P${i}`, 1.3 + i / 100), undefined, i);
    expect(MAX_RECENTS).toBe(10);
    expect(HOME_RECENTS).toBe(5);
    expect(s.recents.value).toHaveLength(10);
    expect(s.recents.value[0]!.to.name).toBe('P11');
  });

  it('migrates 0.2.0 `recents` (full timestamps) into `recents.v2` as dates, then removes the old key', () => {
    const at = Date.parse('2026-11-10T09:15:00+08:00');
    const kv = memoryKV({ recents: JSON.stringify([{ to: P('TTSH', 1.32), at, lines: ['NS'] }, { to: P('TTSH', 1.32), at: at - 1 }, { bad: 1 }]) });
    const s = createStore(kv, memoryKV());
    expect(s.recents.value).toEqual([{ to: P('TTSH', 1.32), date: '2026-11-10', lines: ['NS'] }]);
    expect(kv.data['recents']).toBeUndefined();
    expect(JSON.parse(kv.data['recents.v2']!)).toHaveLength(1);
    expect(createStore(kv, memoryKV()).recents.value).toHaveLength(1);
  });

  it('relDate reads the stored date', () => {
    const now = Date.parse('2026-11-18T10:00:00+08:00');
    expect(relDate('2026-11-18', now, 'zh-CN')).toBe('今天');
    expect(relDate('2026-11-17', now, 'en-SG')).toBe('Yesterday');
  });
});

describe('Creative m34-fix-a F4: About data date in plain words', () => {
  it('zh 2026年11月17日 · en 17 Nov 2026', () => {
    expect(dataDate('2026-11-17', 'zh')).toBe('2026年11月17日');
    expect(dataDate('2026-01-05', 'en')).toBe('5 Jan 2026');
    expect(dataDate('bad', 'en')).toBe('bad');
  });
});

describe('QA-35 report data date (AC 44)', () => {
  it('the problem report carries the data-round date', () => {
    expect(buildReport(DEFAULT_SETTINGS, 'ua')).toContain(`data: ${DATA_AS_OF}`);
  });
});
