/**
 * Singapore MRT / LRT line catalogue. Colours are token names only
 * (Creative owns the palette): the web app maps `line-ns` → a CSS variable.
 *
 * Termini are used to say "towards X" when OneMap gives no headsign.
 * ASSUMPTION (re-check against LTA network map when lines extend):
 * NE ends at Punggol Coast (NE18, opened Dec 2024), TE at Bayshore (TE29),
 * DT at Expo (DT35), CC treated as Dhoby Ghaut (CC1) ↔ HarbourFront (CC29).
 */
import type { LineInfo, TransitMode } from './types';

interface LineDef extends LineInfo {
  /** Station-number ends of the line: [lowEnd, highEnd]. */
  termini?: [Terminus, Terminus];
}

interface Terminus {
  'zh-CN': string;
  'en-SG': string;
}

const t = (en: string, zh: string): Terminus => ({ 'en-SG': en, 'zh-CN': zh });

const LINES: Record<string, LineDef> = {
  NS: {
    code: 'NS', kind: 'mrt', colorToken: 'line-ns',
    name: { 'en-SG': 'North-South Line', 'zh-CN': '南北线' },
    termini: [t('Jurong East', '裕廊东'), t('Marina South Pier', '滨海南码头')],
  },
  EW: {
    code: 'EW', kind: 'mrt', colorToken: 'line-ew',
    name: { 'en-SG': 'East-West Line', 'zh-CN': '东西线' },
    termini: [t('Pasir Ris', '巴西立'), t('Tuas Link', '大士连路')],
  },
  CG: {
    code: 'CG', kind: 'mrt', colorToken: 'line-ew',
    name: { 'en-SG': 'East-West Line (Changi Airport branch)', 'zh-CN': '东西线（樟宜机场支线）' },
    termini: [t('Tanah Merah', '丹那美拉'), t('Changi Airport', '樟宜机场')],
  },
  NE: {
    code: 'NE', kind: 'mrt', colorToken: 'line-ne',
    name: { 'en-SG': 'North East Line', 'zh-CN': '东北线' },
    termini: [t('HarbourFront', '港湾'), t('Punggol Coast', '榜鹅海岸')],
  },
  CC: {
    code: 'CC', kind: 'mrt', colorToken: 'line-cc',
    name: { 'en-SG': 'Circle Line', 'zh-CN': '环线' },
    termini: [t('Dhoby Ghaut', '多美歌'), t('HarbourFront', '港湾')],
  },
  CE: {
    code: 'CE', kind: 'mrt', colorToken: 'line-cc',
    name: { 'en-SG': 'Circle Line (Marina Bay branch)', 'zh-CN': '环线（滨海湾支线）' },
    termini: [t('Bayfront', '海湾舫'), t('Marina Bay', '滨海湾')],
  },
  DT: {
    code: 'DT', kind: 'mrt', colorToken: 'line-dt',
    name: { 'en-SG': 'Downtown Line', 'zh-CN': '滨海市区线' },
    termini: [t('Bukit Panjang', '武吉班让'), t('Expo', '博览')],
  },
  TE: {
    code: 'TE', kind: 'mrt', colorToken: 'line-te',
    name: { 'en-SG': 'Thomson-East Coast Line', 'zh-CN': '汤申—东海岸线' },
    termini: [t('Woodlands North', '兀兰北'), t('Bayshore', '碧湾')],
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

/** Numeric part of a station code ("NS17" → 17, "CC29" → 29). */
function stationNumber(code: string | undefined): number | undefined {
  if (!code) return undefined;
  const m = /^[A-Za-z]{2}(\d+)/.exec(code);
  return m ? Number(m[1]) : undefined;
}

/**
 * "Towards" terminus for a train leg from boarding/alighting station numbers.
 * Undefined for LRT loops or when station codes are missing.
 */
export function inferTerminus(
  lineCode: string,
  fromCode: string | undefined,
  toCode: string | undefined,
): Terminus | undefined {
  const def = LINES[lineCode];
  if (!def?.termini) return undefined;
  const a = stationNumber(fromCode);
  const b = stationNumber(toCode);
  if (a === undefined || b === undefined || a === b) return undefined;
  return b > a ? def.termini[1] : def.termini[0];
}

export function transitModeForLine(line: LineInfo | undefined): TransitMode {
  return line?.kind === 'lrt' ? 'lrt' : 'mrt';
}

export const ALL_LINE_CODES = Object.keys(LINES);
