/**
 * Lookups and line topology over STATIONS (./stations.ts, generated; provenance there
 * and in the 2026-11-17 "Dev data round" entry of docs/process/dev-log.md).
 *
 * Direction rules ("往 X 方向 / towards X"):
 * - Linear lines (NS, EW, CG, NE, DT, TE): the terminus is the lowest- or highest-numbered
 *   station that is open on the travel date. Stage openings are dated in the data, so
 *   DT and TE switch to Sungei Bedok (DT37 / TE31) from 2026-12-26 by themselves.
 * - Circle Line (since CCL6, 12 Jul 2026): a loop CC4…CC34→CC4 plus the Dhoby Ghaut spur
 *   CC1–CC3 joining at Promenade (CC4). Rising station numbers = Anticlockwise ↺ (LTA:
 *   HarbourFront platform A "Anticlockwise via CC33 Marina Bay"). Trains are signed by
 *   direction + next interchange, so we return both. OneMap legs follow the shorter way.
 *   Not modelled: peak short-workings (clockwise ends at Dhoby Ghaut, anticlockwise at
 *   Prince Edward Road) and the weekend Dhoby Ghaut–Stadium shuttle.
 * - LRT (BP, SE, SW, PE, PW): loops with no terminus → undefined.
 *
 * Pure: no clock reads. Pass the leg time (epoch ms) or an ISO date as `at`;
 * without it the data date (DATA_AS_OF) is used.
 */
import type { Lang } from '../types';
import { STATIONS } from './stations';
import type { Localized, RailLineCode, Station } from './types';

export const DATA_AS_OF = '2026-11-17';

/** Retired codes still found in older data → current code. */
const CODE_ALIASES: Record<string, string> = { CE1: 'CC34', CE2: 'CC33' };

const BY_CODE = new Map<string, Station>();
for (const st of STATIONS) for (const c of st.codes) BY_CODE.set(c, st);

/** "ns-17", " NS17 " → "NS17"; aliases applied. */
export function normalizeStationCode(code: string | undefined | null): string | undefined {
  if (!code) return undefined;
  const c = code.toUpperCase().replace(/[\s_-]+/g, '');
  if (!/^[A-Z]{2,3}\d{0,2}[A-Z]?$/.test(c)) return undefined;
  return CODE_ALIASES[c] ?? c;
}

export function stationByCode(code: string | undefined | null): Station | undefined {
  const c = normalizeStationCode(code);
  return c ? BY_CODE.get(c) : undefined;
}

/** OneMap stop ids look like "FERRY:NE8" (agency prefix, then the station code). */
export function stationByStopId(id: string | undefined | null): Station | undefined {
  if (!id) return undefined;
  return stationByCode(id.split(':').pop());
}

// ------------------------------------------------------------ names

const ABBREV: Record<string, string> = {
  PK: 'PARK', RD: 'ROAD', STH: 'SOUTH', NTH: 'NORTH', AVE: 'AVENUE', BT: 'BUKIT', JLN: 'JALAN',
  TG: 'TANJONG', UPP: 'UPPER', LOR: 'LORONG', CRES: 'CRESCENT', GDNS: 'GARDENS', GDN: 'GARDEN',
  VILL: 'VILLAGE', CTR: 'CENTRE', HTS: 'HEIGHTS', PT: 'POINT', ST: 'STREET', PR: 'PRINCE', ED: 'EDWARD',
};
const NOISE = new Set(['MRT', 'LRT', 'STATION', 'STN', 'INTERCHANGE', 'INT', 'THE']);

function normName(s: string): string {
  return s
    .toUpperCase()
    .replace(/\bEXIT\s+\w+$/, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !NOISE.has(w))
    .map((w) => ABBREV[w] ?? w)
    .join('');
}

const BY_NAME = new Map<string, Station>();
const BY_ZH = new Map<string, Station>();
for (const st of STATIONS) {
  BY_NAME.set(normName(st.en), st);
  BY_ZH.set(st.zh, st);
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * Fuzzy lookup by station name: "BISHAN MRT STATION", "Farrer Pk Stn", "Harbour Front",
 * "Bugis" or the Chinese name "碧山". Only call it for rail stops: bus stop names such as
 * "FARRER PK STN EXIT A" would match the station too. Ambiguous matches return undefined.
 */
export function stationByName(name: string | undefined | null): Station | undefined {
  if (!name) return undefined;
  const zh = BY_ZH.get(name.trim().replace(/站$/, ''));
  if (zh) return zh;
  const n = normName(name);
  if (n.length < 3) return undefined;
  const exact = BY_NAME.get(n);
  if (exact) return exact;
  const pick = (cands: Station[]) => (cands.length === 1 ? cands[0] : undefined);
  if (n.length >= 5) {
    const pre = pick(STATIONS.filter((s) => normName(s.en).startsWith(n)));
    if (pre) return pre;
  }
  if (n.length >= 6) {
    let best: Station[] = [];
    let bestD = 3;
    for (const s of STATIONS) {
      const d = editDistance(n, normName(s.en), 2);
      if (d < bestD) [best, bestD] = [[s], d];
      else if (d === bestD) best.push(s);
    }
    return bestD <= 2 ? pick(best) : undefined;
  }
  return undefined;
}

export interface StopLike {
  code?: string | undefined;
  id?: string | undefined;
  name?: string | undefined;
}

/** Best station for a OneMap rail stop: by code, then stop id, then name. */
export function stationForStop(stop: StopLike): Station | undefined {
  return stationByCode(stop.code) ?? stationByStopId(stop.id) ?? stationByName(stop.name);
}

/** Official Chinese name for a station code ("NS17" → "碧山"). */
export function zhStationName(code: string): string | undefined {
  return stationByCode(code)?.zh;
}

/**
 * Sign-style label. zh: "碧山 Bishan (NS17)" (Chinese name first, then the English name
 * and code exactly as on the platform sign). en: "Bishan". `code` picks which of an
 * interchange's codes to show (the one for the line being used); it must belong to it.
 */
export function stationLabel(station: Station, lang: Lang, code?: string): string {
  if (lang !== 'zh-CN') return station.en;
  const c = normalizeStationCode(code);
  const shown = c && station.codes.includes(c) ? c : station.codes[0];
  return `${station.zh} ${station.en} (${shown})`;
}

// ------------------------------------------------------------ dates

function refDate(at: number | string | undefined): string {
  if (at === undefined) return DATA_AS_OF;
  if (typeof at === 'string') return at.slice(0, 10);
  // Singapore is UTC+8 all year.
  return new Date(at + 8 * 3600_000).toISOString().slice(0, 10);
}

/** Open on that date? Stations with a year or "TBC" are never open. */
export function isStationOpen(st: Station, at?: number | string): boolean {
  if (!st.opens) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(st.opens)) return false;
  return refDate(at) >= st.opens;
}

// ------------------------------------------------------------ topology

/** Hub codes that start each LRT loop, and the CG branch start at Tanah Merah ("CG"). */
const LINE_HUB: Partial<Record<RailLineCode, string>> = { SE: 'STC', SW: 'STC', PE: 'PTC', PW: 'PTC', CG: 'CG' };

/** Position of a code on its line: "NS17" → 17, "TE22A" → 22.5, hub codes → 0. */
export function stationNumber(code: string | undefined): number | undefined {
  const c = normalizeStationCode(code);
  if (!c) return undefined;
  if (c === 'STC' || c === 'PTC' || c === 'CG') return 0;
  const m = /^[A-Z]{2}(\d+)([A-Z]?)$/.exec(c);
  if (!m) return undefined;
  return Number(m[1]) + (m[2] ? 0.5 : 0);
}

export interface LineStop {
  code: string;
  n: number;
  station: Station;
}

const SEQ = new Map<RailLineCode, LineStop[]>();
for (const st of STATIONS) {
  for (const line of st.lines) {
    const hub = LINE_HUB[line];
    const code = st.codes.find((c) => c.startsWith(line) && c !== 'CG') ?? (hub && st.codes.includes(hub) ? hub : undefined);
    if (!code) continue;
    const list = SEQ.get(line) ?? [];
    list.push({ code, n: stationNumber(code)!, station: st });
    SEQ.set(line, list);
  }
}
for (const list of SEQ.values()) list.sort((a, b) => a.n - b.n);

/** Stations of a line in code order. By default only those open on `at`. */
export function lineStations(line: RailLineCode, opts: { at?: number | string; includeUnopened?: boolean } = {}): LineStop[] {
  const list = SEQ.get(line) ?? [];
  return opts.includeUnopened ? [...list] : list.filter((s) => isStationOpen(s.station, opts.at));
}

const LINEAR: RailLineCode[] = ['NS', 'EW', 'CG', 'NE', 'DT', 'TE'];

/** [low-number end, high-number end] of a linear line on `at`; undefined for loops. */
export function lineTermini(line: string, at?: number | string): [Station, Station] | undefined {
  if (!LINEAR.includes(line as RailLineCode)) return undefined;
  const list = lineStations(line as RailLineCode, { at });
  if (list.length < 2) return undefined;
  return [list[0]!.station, list[list.length - 1]!.station];
}

export type LoopDirection = 'clockwise' | 'anticlockwise';

export const LOOP_DIRECTION_LABEL: Record<LoopDirection, Localized> = {
  // zh wording not yet confirmed against LTA Chinese signage (low confidence).
  clockwise: { 'zh-CN': '顺时针', 'en-SG': 'Clockwise' },
  anticlockwise: { 'zh-CN': '逆时针', 'en-SG': 'Anticlockwise' },
};

export type Heading =
  | { kind: 'terminus'; terminus: Station }
  | { kind: 'loop'; direction: LoopDirection; via?: Station };

const CC_RING_FIRST = 4;
const CC_RING_LAST = 34;
const CC_RING_LEN = CC_RING_LAST - CC_RING_FIRST + 1;

function ccDirection(a: number, b: number): LoopDirection | undefined {
  if (a === b) return undefined;
  const spurA = a < CC_RING_FIRST;
  const spurB = b < CC_RING_FIRST;
  if (spurA && spurB) return b > a ? 'anticlockwise' : 'clockwise';
  if (spurA) return b === CC_RING_FIRST ? 'anticlockwise' : ccDirection(CC_RING_FIRST, b);
  if (spurB) return a === CC_RING_FIRST ? 'clockwise' : ccDirection(a, CC_RING_FIRST);
  const fwd = (((b - a) % CC_RING_LEN) + CC_RING_LEN) % CC_RING_LEN;
  return fwd <= CC_RING_LEN - fwd ? 'anticlockwise' : 'clockwise';
}

/**
 * Next open interchange after `a` along the path to `b` and, past `b`, onward in the
 * same direction: what CCL platform signs show ("Anticlockwise via CC33 Marina Bay").
 */
function ccVia(a: number, b: number, dir: LoopDirection, at: number | string | undefined): Station | undefined {
  const byN = new Map(lineStations('CC', { at }).map((s) => [s.n, s.station]));
  const intoSpur = b < CC_RING_FIRST;
  let n = a;
  for (let i = 0; i < CC_RING_LEN + 3; i++) {
    if (n < CC_RING_FIRST) n = intoSpur && b < n ? n - 1 : n + 1; // spur: toward b or Promenade
    else if (n === CC_RING_FIRST && intoSpur && (a >= CC_RING_FIRST || b < a)) n = CC_RING_FIRST - 1;
    else if (dir === 'anticlockwise') n = n === CC_RING_LAST ? CC_RING_FIRST : n + 1;
    else n = n === CC_RING_FIRST ? CC_RING_LAST : n - 1;
    if (n < 1) return undefined;
    const st = byN.get(n);
    if (st && st.lines.length > 1) return st;
  }
  return undefined;
}

/**
 * Which way a train leg runs, from its boarding and alighting station codes.
 * `line` may be "CE" (old Circle Line extension); codes may be aliases ("CE1").
 */
export function inferHeading(
  line: string,
  fromCode: string | undefined,
  toCode: string | undefined,
  at?: number | string,
): Heading | undefined {
  const l = line.toUpperCase() === 'CE' ? 'CC' : line.toUpperCase();
  const a = stationNumber(fromCode);
  const b = stationNumber(toCode);
  if (a === undefined || b === undefined || a === b) return undefined;
  if (l === 'CC') {
    const direction = ccDirection(a, b);
    if (!direction) return undefined;
    const via = ccVia(a, b, direction, at);
    return via ? { kind: 'loop', direction, via } : { kind: 'loop', direction };
  }
  const ends = lineTermini(l, at);
  if (!ends) return undefined;
  return { kind: 'terminus', terminus: b > a ? ends[1] : ends[0] };
}
