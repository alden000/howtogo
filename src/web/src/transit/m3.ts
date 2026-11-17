/**
 * M3 transit smarts, pure (STYLE-GUIDE §6d, M3 ACs): bus-arrival chip state, disruption match,
 * lift warnings, exit hints, fares and recent-trip dates. No DOM, no timers, no network.
 * Honest data: anything we can't back with LTA data or the bundled tables is hidden, never guessed.
 */
import { haversine, lineByCode, stationByCode, stationForStop, type Itinerary, type Lang, type Leg, type Station } from '@howtogo/shared';
import type { AlertLine, Alerts, BusArrival, BusArrivalNext, LiftOutage, Lifts } from '../api/types';

// ------------------------------------------------------------------ T1 bus chip
export type ChipState = 'live' | 'here' | 'estimated' | 'nodata';
export interface Chip {
  state: ChipState;
  svc: string;
  /** Minutes to the first bus (null in nodata). */
  min: number | null;
  nextMin: number | null;
  first?: BusArrivalNext;
  nextLoad?: BusArrivalNext['load'];
  nextWab?: boolean;
  /** AC 8: the bus that was ≤ 1 min away has gone; we moved on to the next. */
  missed: boolean;
  /** AC 10: first bus very full, the next (≤ +10 min) less crowded. */
  lessCrowded: boolean;
  /** "Updated just now" (≤ 30 s) vs seconds since `fetchedAt`. */
  ageS: number | null;
}

export const STALE_S = 60;
export const NODATA_S = 180;

/** `prevMin` = the minutes shown last time on this wait step (missed-bus detection). */
export function busChip(a: BusArrival | null, svc: string, now: number, prevMin: number | null = null): Chip {
  const none: Chip = { state: 'nodata', svc, min: null, nextMin: null, missed: false, lessCrowded: false, ageS: null };
  if (!a) return none;
  const ageS = Math.max(0, Math.round((now - Date.parse(a.fetchedAt)) / 1000));
  const s = a.services.find((x) => x.no.toUpperCase() === svc.toUpperCase());
  const first = s?.next[0];
  if (!s || !first || !Number.isFinite(ageS) || ageS > NODATA_S) return { ...none, ageS: Number.isFinite(ageS) ? ageS : null };
  const second = s.next[1];
  const state: ChipState = first.etaMin <= 0 ? 'here' : !first.monitored || ageS > STALE_S ? 'estimated' : 'live';
  const c: Chip = {
    state,
    svc,
    min: Math.max(0, first.etaMin),
    nextMin: second ? second.etaMin : null,
    first,
    missed: prevMin !== null && prevMin <= 1 && first.etaMin > prevMin + 1,
    lessCrowded: first.load === 'LSD' && !!second && second.load !== 'LSD' && second.etaMin - first.etaMin <= 10,
    ageS,
  };
  if (second) {
    c.nextLoad = second.load;
    c.nextWab = second.wheelchair;
  }
  return c;
}

// ------------------------------------------------------------------ stations of a leg
const isRail = (l: Leg) => l.mode === 'mrt' || l.mode === 'lrt';

/** LTA line names in TrainServiceAlerts / FacilitiesMaintenance → our line codes. */
const LTA_LINE: Record<string, string[]> = {
  NSL: ['NS'], EWL: ['EW', 'CG'], CGL: ['CG'], NEL: ['NE'], CCL: ['CC', 'CE'], CEL: ['CE', 'CC'], DTL: ['DT'], TEL: ['TE'],
  BPL: ['BP'], STL: ['SE', 'SW'], SKLRT: ['SE', 'SW'], PTL: ['PE', 'PW'], PGLRT: ['PE', 'PW'],
};
export const lineCodesOf = (lta: string): string[] => LTA_LINE[lta.toUpperCase()] ?? [lta.toUpperCase().replace(/L$/, '')];

/** Station objects this rail leg passes (boarding, intermediate, alighting), in order. */
export function legStations(leg: Leg): Station[] {
  const out: Station[] = [];
  for (const s of [leg.from, ...leg.intermediateStops, leg.to]) {
    const st = stationForStop(s);
    if (st && !out.includes(st)) out.push(st);
  }
  return out;
}

const sameStation = (code: string, st: Station) => {
  const x = stationByCode(code);
  return x ? x === st : st.codes.includes(code.toUpperCase());
};

// ------------------------------------------------------------------ T3 disruption
export interface Affected {
  alert: AlertLine;
  /** Our line code ("NS"). */
  line: string;
  legIndex: number;
}

/** AC 20/21: the first rail leg on an affected line that uses an affected station. */
export function affectedBy(alerts: Alerts | null, it: Itinerary, fromLeg = 0): Affected | null {
  if (!alerts || alerts.status !== 'disrupted') return null;
  for (let i = fromLeg; i < it.legs.length; i++) {
    const leg = it.legs[i]!;
    if (!isRail(leg) || !leg.line) continue;
    const stations = legStations(leg);
    for (const a of alerts.lines) {
      if (!lineCodesOf(a.line).includes(leg.line.code)) continue;
      if (a.stations.length === 0 || a.stations.some((c) => stations.some((st) => sameStation(c, st)))) return { alert: a, line: leg.line.code, legIndex: i };
    }
  }
  return null;
}

/** Line display name ("东北线" / "North East Line") from the shared LINES table. */
export function lineName(code: string, lang: Lang): string {
  return lineByCode(code)?.name[lang] ?? code;
}

/** Any line code of an alert (for Home, where no itinerary exists). */
export const alertLineCode = (a: AlertLine) => lineCodesOf(a.line)[0]!;

/** "Delay" titles when LTA's message says so; otherwise "no trains at some stations". */
export const isDelay = (alerts: Alerts) => alerts.messages.some((m) => /delay|slow/i.test(m.text)) && alerts.lines.every((l) => l.stations.length === 0);

/** Station label for banners (T7): zh "碧山 NS17", en "Bishan"; unknown code → as given. */
export function stationText(code: string, lang: Lang): string {
  const st = stationByCode(code);
  if (!st) return code;
  return lang === 'zh-CN' ? `${st.zh} ${code}` : st.en;
}

/** Dismissal key for the Home banner (AC 19): the first message's createdAt, else its text. */
export const alertKey = (a: Alerts) => a.messages[0]?.createdAt ?? a.messages[0]?.text.slice(0, 40) ?? a.lines.map((l) => l.line).join(',');

// ------------------------------------------------------------------ F lifts
export interface LiftIssue {
  station: Station;
  code: string;
  outage: LiftOutage;
  /** Exit code parsed from LTA's `desc` ("Exit B …" → "B"). */
  exit?: string;
}

export const LIFTS_FRESH_MS = 15 * 60_000;
const exitOf = (desc: string) => /\bExit\s+([A-Z]\d?|\d{1,2})\b/i.exec(desc)?.[1]?.toUpperCase();

/** AC 29: lifts under repair at any boarding, transfer or alighting station of the itinerary. */
export function liftIssues(it: Itinerary, lifts: Lifts | null): LiftIssue[] {
  if (!lifts) return [];
  const out: LiftIssue[] = [];
  for (const leg of it.legs) {
    if (!isRail(leg)) continue;
    for (const stop of [leg.from, leg.to]) {
      const st = stationForStop(stop);
      if (!st) continue;
      for (const o of lifts.lifts) {
        if (!sameStation(o.station, st) || out.some((x) => x.outage === o)) continue;
        const exit = exitOf(o.desc);
        out.push({ station: st, code: o.station, outage: o, ...(exit ? { exit } : {}) });
      }
    }
  }
  return out;
}

/** AC 31: "Station lifts OK (no repairs reported)" only with fresh data, rail in the trip and nothing listed. */
export function liftsOk(it: Itinerary, lifts: Lifts | null, now: number): boolean {
  if (!lifts || now - Date.parse(lifts.fetchedAt) > LIFTS_FRESH_MS) return false;
  if (!it.legs.some(isRail)) return false;
  return liftIssues(it, lifts).length === 0;
}

const LEVELS: [RegExp, string][] = [
  [/street level/i, '地面层'], [/concourse/i, '大堂'], [/platform/i, '月台'], [/basement\s*(\d)?/i, '地下层'],
];
/** "Exit B Street level - Concourse" → zh "B 出口 地面层—大堂 的电梯在维修" / en "Lift at Exit B (street level – concourse) is under repair". */
export function liftDetail(i: LiftIssue, lang: Lang): string {
  const rest = i.outage.desc.replace(/\bExit\s+\S+\s*/i, '').trim();
  const parts = rest.split(/\s*-\s*/).filter(Boolean);
  if (lang === 'zh-CN') {
    const zh = parts.map((p) => LEVELS.find(([re]) => re.test(p))?.[1]).filter(Boolean);
    const lv = zh.length === parts.length && zh.length ? ` ${zh.join('—')}` : '';
    return i.exit ? `${i.exit} 出口${lv} 的电梯在维修` : `${i.station.zh}站有电梯在维修`;
  }
  const lv = parts.length ? ` (${parts.map((p) => p.toLowerCase()).join(' – ')})` : '';
  return i.exit ? `Lift at Exit ${i.exit}${lv} is under repair` : `A lift at ${i.station.en} is under repair`;
}

// ------------------------------------------------------------------ T5 exit hint
export interface ExitHint {
  station: Station;
  code: string;
  landmark?: string;
  /** The nearest exit's lift is under repair; we chose `code` instead (AC 29). */
  avoided?: string;
  legIndex: number;
}

export const EXIT_AMBIGUOUS_M = 30;

/**
 * AC 15/16: on the last rail leg's alighting station, the exit nearest (straight line) to the next
 * walk leg's end. Hidden when the table has no exits there or the nearest two are within 30 m
 * of each other in distance-to-destination. Never guessed.
 */
export function exitHint(it: Itinerary, lang: Lang, lifts: LiftIssue[] = []): ExitHint | null {
  const idx = lastRailLeg(it);
  if (idx < 0) return null;
  const leg = it.legs[idx]!;
  const walk = it.legs[idx + 1];
  if (!walk || walk.mode !== 'walk') return null;
  const st = stationForStop(leg.to);
  if (!st) return null;
  const part = leg.mode === 'lrt' ? 'LRT' : 'MRT';
  const exits = st.exits.filter((e) => !e.part || e.part === part);
  if (exits.length === 0) return null;
  const ranked = exits.map((e) => ({ e, d: haversine(e, walk.to) })).sort((a, b) => a.d - b.d);
  if (ranked.length > 1 && ranked[1]!.d - ranked[0]!.d < EXIT_AMBIGUOUS_M) return null;
  let pick = ranked[0]!;
  let avoided: string | undefined;
  const broken = lifts.find((l) => l.station === st && l.exit === pick.e.code);
  if (broken && ranked[1]) {
    avoided = pick.e.code;
    pick = ranked[1];
  }
  const out: ExitHint = { station: st, code: pick.e.code, legIndex: idx };
  if (avoided) out.avoided = avoided;
  if (pick.e.landmark) out.landmark = pick.e.landmark[lang];
  return out;
}

/** Index of the last MRT/LRT leg (the alight leg the exit hint is for), or -1. */
export function lastRailLeg(it: Itinerary): number {
  for (let i = it.legs.length - 1; i >= 0; i--) if (isRail(it.legs[i]!)) return i;
  return -1;
}

// ------------------------------------------------------------------ T6 transfer
/** Engine walk_transfer between two different stations = out-of-system (exit and re-enter the gates). */
export function outOfSystem(walk: Leg): boolean {
  const a = stationForStop(walk.from);
  const b = stationForStop(walk.to);
  return !!a && !!b && a !== b;
}

// ------------------------------------------------------------------ T8 fare
export const fareText = (fare: number) => `$${fare.toFixed(2)}`;

// ------------------------------------------------------------------ T9 recents
const WD_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sgDay = (ms: number) => Math.floor((ms + 8 * 3600_000) / 86_400_000);
const sgDate = (ms: number) => new Date(ms + 8 * 3600_000);

/** A stored recent-trip date (`YYYY-MM-DD`, Singapore) as relative text (AC 35 stores the date only). */
export const relDate = (date: string, now: number, lang: Lang) => relDay(Date.parse(`${date}T12:00:00+08:00`), now, lang);

/** 6d.9 relative dates: 今天 · 昨天 · 星期X (≤ 6 days, this week) · 上星期X · 11月3日. */
export function relDay(at: number, now: number, lang: Lang): string {
  const zh = lang === 'zh-CN';
  const diff = sgDay(now) - sgDay(at);
  const d = sgDate(at);
  const wd = d.getUTCDay();
  if (diff <= 0) return zh ? '今天' : 'Today';
  if (diff === 1) return zh ? '昨天' : 'Yesterday';
  const nowWd = sgDate(now).getUTCDay();
  const thisWeek = diff <= 6 && diff <= ((nowWd + 6) % 7); // since Monday
  if (thisWeek) return zh ? `星期${WD_ZH[wd]}` : WD_EN[wd]!;
  if (diff <= 13) return zh ? `上星期${WD_ZH[wd]}` : `last ${WD_EN[wd]}`;
  return zh ? `${d.getUTCMonth() + 1}月${d.getUTCDate()}日` : `${d.getUTCDate()} ${MON_EN[d.getUTCMonth()]}`;
}
