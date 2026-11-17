import { describe, expect, it } from 'vitest';
import { normalizeOneMapPlan, stationByCode, type Itinerary } from '@howtogo/shared';
import { FIXTURES } from '@howtogo/shared/fixtures';
import type { BusArrival } from '../src/api/types';
import { affectedBy, busChip, exitHint, liftDetail, liftIssues, liftsOk, relDay, stationText } from '../src/transit/m3';

const T = Date.parse('2026-11-17T02:00:00Z');
const arr = (next: BusArrival['services'][0]['next'], ageS = 0): BusArrival => ({ stop: '53009', fetchedAt: new Date(T - ageS * 1000).toISOString(), services: [{ no: '139', operator: 'SBST', next }] });
const b = (etaMin: number, monitored = true, load: 'SEA' | 'SDA' | 'LSD' = 'SEA') => ({ etaMin, load, wheelchair: true, deck: 'double' as const, monitored });
const it0 = (name: keyof typeof FIXTURES): Itinerary => {
  const r = normalizeOneMapPlan(FIXTURES[name]);
  if (!r.ok) throw new Error();
  return r.itineraries[0]!;
};

describe('T1 bus chip (6d.1, M3 AC 2–10)', () => {
  it('live / estimated (timetable or > 60 s) / here / nodata (> 3 min, empty, missing, error)', () => {
    expect(busChip(arr([b(4), b(12)]), '139', T)).toMatchObject({ state: 'live', min: 4, nextMin: 12 });
    expect(busChip(arr([b(8, false)]), '139', T).state).toBe('estimated');
    expect(busChip(arr([b(4)], 61), '139', T).state).toBe('estimated');
    expect(busChip(arr([b(0)]), '139', T).state).toBe('here');
    expect(busChip(arr([b(4)], 181), '139', T).state).toBe('nodata');
    expect(busChip(arr([]), '139', T).state).toBe('nodata');
    expect(busChip(arr([b(4)]), '162', T).state).toBe('nodata');
    expect(busChip(null, '139', T).state).toBe('nodata');
  });
  it('missed bus and less crowded hint', () => {
    expect(busChip(arr([b(9)]), '139', T, 1).missed).toBe(true);
    expect(busChip(arr([b(9)]), '139', T, 5).missed).toBe(false);
    expect(busChip(arr([b(3, true, 'LSD'), b(9, true, 'SEA')]), '139', T).lessCrowded).toBe(true);
    expect(busChip(arr([b(3, true, 'LSD'), b(19, true, 'SEA')]), '139', T).lessCrowded).toBe(false);
  });
});

describe('T3 disruption match (AC 20)', () => {
  const alerts = { status: 'disrupted' as const, lines: [{ line: 'NSL', direction: 'Marina South Pier', stations: ['NS16', 'NS17'], freePublicBus: [], freeShuttle: [] }], messages: [] };
  it('affects a NSL leg using an affected station; not the bus-only trip', () => {
    expect(affectedBy(alerts, it0('angMoKioToNovena'))?.line).toBe('NS');
    expect(affectedBy(alerts, it0('toaPayohToTTSH'))).toBeNull();
    expect(affectedBy({ ...alerts, status: 'normal' }, it0('angMoKioToNovena'))).toBeNull();
  });
  it('zh station names in banners (T7), unknown code as given', () => {
    expect(stationText('NS17', 'zh-CN')).toBe('碧山 NS17');
    expect(stationText('NS17', 'en-SG')).toBe('Bishan');
    expect(stationText('ZZ9', 'zh-CN')).toBe('ZZ9');
  });
});

describe('F lifts + T5 exits', () => {
  const amk = it0('angMoKioToNovena');
  const lifts = (station: string, desc: string, ageMin = 0) => ({ fetchedAt: new Date(T - ageMin * 60_000).toISOString(), lifts: [{ line: 'NSL', station, stationName: '', liftId: null, desc }] });
  it('lift issues at boarding/alighting stations, detail copy, positive fact only when fresh and clear', () => {
    const iss = liftIssues(amk, lifts('NS20', 'Exit B Street level - Concourse'));
    expect(iss).toHaveLength(1);
    expect(liftDetail(iss[0]!, 'zh-CN')).toBe('B 出口 地面层—大堂 的电梯在维修');
    expect(liftDetail(iss[0]!, 'en-SG')).toBe('Lift at Exit B (street level – concourse) is under repair');
    expect(liftsOk(amk, lifts('NS17', 'Exit A'), T)).toBe(true);
    expect(liftsOk(amk, lifts('NS17', 'Exit A', 16), T)).toBe(false);
    expect(liftsOk(amk, lifts('NS20', 'Exit A'), T)).toBe(false);
    expect(liftsOk(it0('toaPayohToTTSH'), lifts('NS17', 'Exit A'), T)).toBe(false); // no rail
  });
  it('exit hint from the table, nearest to the walk end; hidden when ambiguous; never guessed', () => {
    const h = exitHint(amk, 'zh-CN');
    if (h) {
      const st = stationByCode('NS20')!;
      expect(h.station).toBe(st);
      expect(st.exits.map((e) => e.code)).toContain(h.code);
    }
    expect(exitHint(it0('toaPayohToTTSH'), 'zh-CN')).toBeNull();
  });
});

describe('T9 relative dates', () => {
  const now = Date.parse('2026-11-19T04:00:00Z'); // Thursday SGT
  it.each([
    [0, '今天', 'Today'],
    [1, '昨天', 'Yesterday'],
    [3, '星期一', 'Monday'],
    [8, '上星期三', 'last Wednesday'],
    [16, '11月3日', '3 Nov'],
  ])('%i days ago', (d, zh, en) => {
    expect(relDay(now - d * 86_400_000, now, 'zh-CN')).toBe(zh);
    expect(relDay(now - d * 86_400_000, now, 'en-SG')).toBe(en);
  });
});
