import { describe, expect, it } from 'vitest';
import {
  DATA_AS_OF,
  STATIONS,
  inferHeading,
  isStationOpen,
  lineStations,
  lineTermini,
  stationByCode,
  stationByName,
  stationByStopId,
  stationForStop,
  stationLabel,
  zhStationName,
  type RailLineCode,
} from '../src/data';
import { haversine } from '../src/geo';
import { inferTerminus } from '../src/lines';
import { normalizeOneMapPlan } from '../src/onemap';
import { buildSteps } from '../src/steps';
import { buildPlan, type StopSpec } from './fixtures/builder';

/**
 * Per-line counts from the source (Wikipedia "List of Singapore MRT stations", operational /
 * non-operational / under-construction tables, 17 Nov 2026; LRT line articles).
 * open = open on DATA_AS_OF; all = also built-but-unopened and dated openings.
 * NE has no NE2. CC18 Bukit Brown, TE10 Mount Pleasant, TE21 Marina South are shells;
 * TE22A opens ~2028; DT36, DT37/TE31, TE30 open 26 Dec 2026. CG counts Tanah Merah ("CG").
 * LRT counts include the hub (STC / PTC / BP1 / BP6).
 */
const COUNTS: Record<RailLineCode, { open: number; all: number }> = {
  NS: { open: 27, all: 27 },
  EW: { open: 33, all: 33 },
  CG: { open: 3, all: 3 },
  NE: { open: 17, all: 17 },
  CC: { open: 33, all: 34 },
  DT: { open: 35, all: 37 },
  TE: { open: 27, all: 32 },
  BP: { open: 13, all: 13 },
  SE: { open: 6, all: 6 },
  SW: { open: 9, all: 9 },
  PE: { open: 8, all: 8 },
  PW: { open: 8, all: 8 },
};

describe('station data: coverage', () => {
  it('has every station once', () => {
    expect(STATIONS).toHaveLength(191);
    expect(STATIONS.filter((s) => isStationOpen(s))).toHaveLength(184);
    expect(new Set(STATIONS.map((s) => s.en)).size).toBe(STATIONS.length);
    const codes = STATIONS.flatMap((s) => s.codes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  for (const [line, n] of Object.entries(COUNTS) as [RailLineCode, { open: number; all: number }][]) {
    it(`${line}: ${n.open} open, ${n.all} in total`, () => {
      expect(lineStations(line)).toHaveLength(n.open);
      expect(lineStations(line, { includeUnopened: true })).toHaveLength(n.all);
    });
  }

  it('numbers run without gaps except where the source has none (NE2, CC18 shell…)', () => {
    const nums = lineStations('NS', { includeUnopened: true }).map((s) => s.n);
    expect(nums).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]);
    expect(lineStations('TE', { includeUnopened: true }).map((s) => s.code)).toContain('TE22A');
  });

  it('every station has names, a line, and a point inside Singapore', () => {
    for (const s of STATIONS) {
      expect(s.en.length, s.en).toBeGreaterThan(1);
      expect(s.zh, s.en).toMatch(/^[一-鿿]+$/);
      expect(s.lines.length, s.en).toBeGreaterThan(0);
      expect(s.lat, s.en).toBeGreaterThan(1.2);
      expect(s.lat, s.en).toBeLessThan(1.48);
      expect(s.lng, s.en).toBeGreaterThan(103.6);
      expect(s.lng, s.en).toBeLessThan(104.05);
    }
  });

  it('neighbouring stations on a line are close (catches swapped coordinates)', () => {
    for (const line of Object.keys(COUNTS) as RailLineCode[]) {
      const list = lineStations(line, { includeUnopened: true });
      for (let i = 1; i < list.length; i++) {
        const d = haversine(list[i - 1]!.station, list[i]!.station);
        expect(d, `${list[i - 1]!.code}→${list[i]!.code}`).toBeLessThan(5000);
      }
    }
  });

  it('exits: codes look like signage, landmarks always cite a source', () => {
    const open = STATIONS.filter((s) => isStationOpen(s));
    expect(open.filter((s) => s.exits.length === 0).map((s) => s.en)).toEqual([]);
    for (const s of STATIONS) {
      for (const e of s.exits) {
        expect(e.code, s.en).toMatch(/^[A-Z]?\d{0,2}[A-Z]?$/);
        expect(haversine(s, e), `${s.en} exit ${e.code}`).toBeLessThan(800);
        if (e.landmark) expect(e.landmarkSource, s.en).toBeTruthy();
      }
    }
    expect(stationByCode('NS20')!.exits.find((e) => e.code === 'A')!.landmark!['zh-CN']).toBe('陈笃生医院');
  });
});

describe('station data: interchanges', () => {
  it('each line of a station has exactly one code (or hub) on it', () => {
    for (const s of STATIONS) {
      for (const line of s.lines) {
        const onLine = lineStations(line, { includeUnopened: true }).filter((x) => x.station === s);
        expect(onLine, `${s.en} on ${line}`).toHaveLength(1);
      }
      for (const c of s.codes) {
        const prefix = c === 'STC' ? 'SE' : c === 'PTC' ? 'PE' : c.slice(0, 2);
        expect(s.lines, `${s.en} ${c}`).toContain(prefix);
      }
    }
  });

  it('known interchanges', () => {
    expect(stationByCode('NS24')!.codes).toEqual(['NS24', 'NE6', 'CC1']);
    expect(stationByCode('TE17')!.en).toBe('Outram Park');
    expect(stationByCode('CC33')!.codes).toEqual(['NS27', 'CC33', 'TE20']);
    expect(stationByCode('BP6')).toBe(stationByCode('DT1'));
    expect(stationByCode('PTC')!.lines).toEqual(['NE', 'PE', 'PW']);
    expect(stationByCode('DT37')).toBe(stationByCode('TE31'));
    expect(stationByCode('CG')!.en).toBe('Tanah Merah');
    expect(STATIONS.filter((s) => s.codes.length > 1)).toHaveLength(31);
  });
});

describe('termini and directions', () => {
  const towards = (line: string, a: string, b: string, at?: string | number) => inferTerminus(line, a, b, at)?.['en-SG'];

  it('linear lines', () => {
    expect(lineTermini('NS')!.map((s) => s.en)).toEqual(['Jurong East', 'Marina South Pier']);
    expect(lineTermini('EW')!.map((s) => s.en)).toEqual(['Pasir Ris', 'Tuas Link']);
    expect(lineTermini('CG')!.map((s) => s.en)).toEqual(['Tanah Merah', 'Changi Airport']);
    expect(lineTermini('NE')!.map((s) => s.en)).toEqual(['HarbourFront', 'Punggol Coast']);
    expect(towards('NS', 'NS26', 'NS17')).toBe('Jurong East');
    expect(inferTerminus('NE', 'NE6', 'NE5')?.['zh-CN']).toBe('港湾');
    expect(towards('CG', 'CG', 'CG2')).toBe('Changi Airport');
  });

  it('TEL and DTL switch to Sungei Bedok when it opens (26 Dec 2026)', () => {
    expect(towards('TE', 'TE1', 'TE20')).toBe('Bayshore');
    expect(towards('TE', 'TE1', 'TE20', '2026-12-25')).toBe('Bayshore');
    expect(towards('TE', 'TE1', 'TE20', '2026-12-26')).toBe('Sungei Bedok');
    expect(towards('DT', 'DT1', 'DT10')).toBe('Expo');
    expect(towards('DT', 'DT1', 'DT10', Date.UTC(2027, 0, 5))).toBe('Sungei Bedok');
    expect(towards('TE', 'TE29', 'TE1')).toBe('Woodlands North');
    // epoch ms is read in Singapore time: 25 Dec 16:30 UTC = 26 Dec 00:30 SGT
    expect(towards('DT', 'DT1', 'DT10', Date.UTC(2026, 11, 25, 16, 30))).toBe('Sungei Bedok');
  });

  it('Circle Line loop: direction + next interchange, shorter way round', () => {
    const h = (a: string, b: string) => {
      const x = inferHeading('CC', a, b);
      return x?.kind === 'loop' ? `${x.direction} via ${x.via?.en}` : x;
    };
    expect(h('CC29', 'CC30')).toBe('anticlockwise via Marina Bay'); // LTA HarbourFront platform A
    expect(h('CC29', 'CC28')).toBe('clockwise via Buona Vista'); // platform B
    expect(h('CC15', 'CC9')).toBe('clockwise via Serangoon');
    expect(h('CC1', 'CC6')).toBe('anticlockwise via Promenade');
    expect(h('CC1', 'CC33')).toBe('clockwise via Promenade');
    expect(h('CC6', 'CC1')).toBe('clockwise via Promenade');
    expect(h('CC3', 'CC1')).toBe('clockwise via Dhoby Ghaut');
    expect(h('CC33', 'CC4')).toBe('anticlockwise via Bayfront');
    expect(h('CC10', 'CC2')).toBe('clockwise via Paya Lebar');
    expect(inferHeading('CE', 'CE2', 'CC32')).toMatchObject({ kind: 'loop', direction: 'clockwise' });
    expect(inferTerminus('CC', 'CC29', 'CC30')).toBeUndefined();
  });

  it('LRT loops and missing codes have no terminus', () => {
    expect(inferTerminus('BP', 'BP1', 'BP5')).toBeUndefined();
    expect(inferHeading('SE', 'STC', 'SE3')).toBeUndefined();
    expect(inferTerminus('NS', undefined, 'NS5')).toBeUndefined();
  });
});

describe('lookups', () => {
  it('zh names by code, including aliases and LRT', () => {
    expect(zhStationName('NS17')).toBe('碧山');
    expect(zhStationName('CC15')).toBe('碧山');
    expect(zhStationName('ns-24')).toBe('多美歌');
    expect(zhStationName('BP11')).toBe('实加');
    expect(zhStationName('SW7')).toBe('同港');
    expect(zhStationName('CE1')).toBe('海湾舫');
    expect(zhStationName('XX9')).toBeUndefined();
  });

  it('OneMap stop ids', () => {
    expect(stationByStopId('FERRY:NE8')!.en).toBe('Farrer Park');
    expect(stationByStopId('SMRT:CC29')!.zh).toBe('港湾');
    expect(stationByStopId('FERRY:52071')).toBeUndefined();
  });

  it('fuzzy English names', () => {
    expect(stationByName('BISHAN MRT STATION')!.codes).toEqual(['NS17', 'CC15']);
    expect(stationByName('FARRER PK STN')!.en).toBe('Farrer Park');
    expect(stationByName('Harbour Front')!.en).toBe('HarbourFront');
    expect(stationByName('ONE-NORTH MRT STATION')!.en).toBe('one-north');
    expect(stationByName('Serangon')!.en).toBe('Serangoon');
    expect(stationByName('Woodlands')!.en).toBe('Woodlands');
    expect(stationByName('Tampines')!.en).toBe('Tampines');
    expect(stationByName('Bukit')).toBeUndefined(); // ambiguous
    expect(stationByName('碧山站')!.en).toBe('Bishan');
    expect(stationByName('Blk 215')).toBeUndefined();
    expect(stationForStop({ name: 'X', id: 'FERRY:EW13' })!.en).toBe('City Hall');
  });

  it('labels follow the sign: zh name, English, code of the line in use', () => {
    const bishan = stationByCode('NS17')!;
    expect(stationLabel(bishan, 'zh-CN', 'CC15')).toBe('碧山 Bishan (CC15)');
    expect(stationLabel(bishan, 'zh-CN')).toBe('碧山 Bishan (NS17)');
    expect(stationLabel(bishan, 'zh-CN', 'EW1')).toBe('碧山 Bishan (NS17)');
    expect(stationLabel(bishan, 'en-SG', 'CC15')).toBe('Bishan');
  });

  it('opening dates', () => {
    const xilin = stationByCode('DT36')!;
    expect(isStationOpen(xilin)).toBe(false);
    expect(isStationOpen(xilin, '2026-12-26')).toBe(true);
    expect(isStationOpen(stationByCode('TE22A')!, '2030-01-01')).toBe(false); // year only: unknown day
    expect(DATA_AS_OF).toBe('2026-11-17');
  });
});

describe('steps on the Circle Line loop', () => {
  const cc = (code: string): StopSpec => {
    const s = stationByCode(code)!;
    return { name: `${s.en.toUpperCase()} MRT STATION`, lat: s.lat, lng: s.lng, code };
  };
  const plan = buildPlan(cc('CC29'), cc('CC33'), Date.UTC(2026, 7, 3, 1), [
    {
      legs: [
        {
          mode: 'SUBWAY',
          route: 'CC',
          routeLongName: 'CIRCLE LINE',
          agencyName: 'SMRT Corporation',
          agencyId: 'SMRT',
          stops: ['CC29', 'CC30', 'CC31', 'CC32', 'CC33'].map(cc),
          waitS: 120,
        },
      ],
    },
  ]);

  it('names the next interchange (6d.6b), never clockwise/anticlockwise', () => {
    const res = normalizeOneMapPlan(plan);
    if (!res.ok) throw new Error(res.message);
    const it0 = res.itineraries[0]!;
    const zh = buildSteps(it0, 'zh-CN').map((s) => s.text);
    const en = buildSteps(it0, 'en').map((s) => s.text);
    expect(zh).toEqual(['坐环线，往 滨海湾 Marina Bay 方向', '坐 4 站，在 滨海湾 Marina Bay (CC33) 下车']);
    expect(en).toEqual(['Take the Circle Line towards Marina Bay', 'Ride 4 stops. Get off at Marina Bay']);
    expect([...zh, ...en].join(' ')).not.toMatch(/顺时针|逆时针|clockwise/i);
    const b = buildSteps(it0, 'zh-CN')[0]!;
    expect(b.towardsCode).toBe('CC33');
    expect(b.nextStop).toBeTruthy();
  });
});
