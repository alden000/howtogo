/**
 * Singapore MRT / LRT line catalogue. Colours are token names only
 * (Creative owns the palette): the web app maps `line-ns` → a CSS variable.
 *
 * Termini ("towards X" when OneMap gives no headsign) come from the station data in
 * ./data (dated stage openings, Circle Line loop handling), not a hand table.
 */
import { inferHeading } from './data/network';
import type { LineInfo, TransitMode } from './types';

type LineDef = LineInfo;

export interface Terminus {
  'zh-CN': string;
  'en-SG': string;
}

const LINES: Record<string, LineDef> = {
  NS: {
    code: 'NS', kind: 'mrt', colorToken: 'line-ns',
    name: { 'en-SG': 'North-South Line', 'zh-CN': '南北线' },
  },
  EW: {
    code: 'EW', kind: 'mrt', colorToken: 'line-ew',
    name: { 'en-SG': 'East-West Line', 'zh-CN': '东西线' },
  },
  CG: {
    code: 'CG', kind: 'mrt', colorToken: 'line-ew',
    name: { 'en-SG': 'East-West Line (Changi Airport branch)', 'zh-CN': '东西线（樟宜机场支线）' },
  },
  NE: {
    code: 'NE', kind: 'mrt', colorToken: 'line-ne',
    name: { 'en-SG': 'North East Line', 'zh-CN': '东北线' },
  },
  CC: {
    code: 'CC', kind: 'mrt', colorToken: 'line-cc',
    name: { 'en-SG': 'Circle Line', 'zh-CN': '环线' },
  },
  // Retired code (Bayfront CE1 / Marina Bay CE2 are CC34 / CC33 since CCL6, Jul 2026);
  // kept in case OneMap data still uses it.
  CE: {
    code: 'CE', kind: 'mrt', colorToken: 'line-cc',
    name: { 'en-SG': 'Circle Line', 'zh-CN': '环线' },
  },
  DT: {
    code: 'DT', kind: 'mrt', colorToken: 'line-dt',
    name: { 'en-SG': 'Downtown Line', 'zh-CN': '滨海市区线' },
  },
  TE: {
    code: 'TE', kind: 'mrt', colorToken: 'line-te',
    name: { 'en-SG': 'Thomson-East Coast Line', 'zh-CN': '汤申—东海岸线' },
  },
  BP: {
    code: 'BP', kind: 'lrt', colorToken: 'line-lrt',
    name: { 'en-SG': 'Bukit Panjang LRT', 'zh-CN': '武吉班让轻轨' },
  },
  SE: {
    code: 'SE', kind: 'lrt', colorToken: 'line-lrt',
    name: { 'en-SG': 'Sengkang LRT (East Loop)', 'zh-CN': '盛港轻轨（东环）' },
  },
  SW: {
    code: 'SW', kind: 'lrt', colorToken: 'line-lrt',
    name: { 'en-SG': 'Sengkang LRT (West Loop)', 'zh-CN': '盛港轻轨（西环）' },
  },
  PE: {
    code: 'PE', kind: 'lrt', colorToken: 'line-lrt',
    name: { 'en-SG': 'Punggol LRT (East Loop)', 'zh-CN': '榜鹅轻轨（东环）' },
  },
  PW: {
    code: 'PW', kind: 'lrt', colorToken: 'line-lrt',
    name: { 'en-SG': 'Punggol LRT (West Loop)', 'zh-CN': '榜鹅轻轨（西环）' },
  },
};

/** Long names OneMap uses in routeLongName (upper case) → code. */
const LONG_NAME_TO_CODE: [RegExp, string][] = [
  [/NORTH[\s-]*SOUTH/i, 'NS'],
  [/EAST[\s-]*WEST/i, 'EW'],
  [/NORTH[\s-]*EAST/i, 'NE'],
  [/CIRCLE/i, 'CC'],
  [/DOWNTOWN/i, 'DT'],
  [/THOMSON/i, 'TE'],
  [/BUKIT\s*PANJANG/i, 'BP'],
  [/SENGKANG.*WEST/i, 'SW'],
  [/SENGKANG/i, 'SE'],
  [/PUNGGOL.*WEST/i, 'PW'],
  [/PUNGGOL/i, 'PE'],
];

/** Look up a line by its two-letter code ("NS", "nsl", "NS-1" → NS). */
export function lineByCode(code: string | undefined | null): LineInfo | undefined {
  if (!code) return undefined;
  const m = /^([A-Za-z]{2})/.exec(code.trim());
  if (!m) return undefined;
  const def = LINES[m[1]!.toUpperCase()];
  return def ? strip(def) : undefined;
}

function strip(def: LineDef): LineInfo {
  return { code: def.code, kind: def.kind, name: def.name, colorToken: def.colorToken };
}

export interface LineHints {
  route?: string;
  routeShortName?: string;
  routeId?: string;
  routeLongName?: string;
  fromStopCode?: string;
  toStopCode?: string;
}

/**
 * Infer the rail line of a leg from whatever OneMap gives: route / routeId /
 * routeShortName ("NS", "NSL", "SMRT:NS"), station codes ("NS17"), or the long name.
 */
export function inferLine(h: LineHints): LineInfo | undefined {
  const candidates = [h.routeShortName, h.route, h.routeId?.split(':').pop(), h.fromStopCode, h.toStopCode];
  for (const c of candidates) {
    if (!c) continue;
    const m = /^([A-Za-z]{2})(?:L|\d|$|[-_ ])/.exec(c.trim());
    if (m) {
      const line = lineByCode(m[1]);
      if (line) return line;
    }
  }
  if (h.routeLongName) {
    for (const [re, code] of LONG_NAME_TO_CODE) if (re.test(h.routeLongName)) return lineByCode(code);
  }
  return undefined;
}

/**
 * "Towards" terminus for a train leg from boarding/alighting station codes.
 * `at` = travel time (epoch ms) or ISO date, so stage openings apply. Undefined for
 * loops (Circle Line: use `inferHeading` for clockwise/anticlockwise + via; LRT)
 * or when station codes are missing.
 */
export function inferTerminus(
  lineCode: string,
  fromCode: string | undefined,
  toCode: string | undefined,
  at?: number | string,
): Terminus | undefined {
  const h = inferHeading(lineCode, fromCode, toCode, at);
  if (!h || h.kind !== 'terminus') return undefined;
  return { 'en-SG': h.terminus.en, 'zh-CN': h.terminus.zh };
}

export function transitModeForLine(line: LineInfo | undefined): TransitMode {
  return line?.kind === 'lrt' ? 'lrt' : 'mrt';
}

export const ALL_LINE_CODES = Object.keys(LINES);
