/**
 * App state (Preact signals). Persisted:
 *  - localStorage: settings, saved places, recent destinations/trips, the active trip
 *    (journey + GuidanceState + share credentials) so a reload mid-trip resumes;
 *  - sessionStorage: the in-progress plan (from/to/options) so a reload on /routes works.
 */
import { batch, effect, signal } from '@preact/signals';
import type { AlertState, GuidanceState, Itinerary, Journey, Lang, Place, RankedItinerary, RoutePreference, SegmentPlan } from '@howtogo/shared';
import { local, readJSON, session, writeJSON, type KV } from './storage';

export type UiLang = 'zh' | 'en';
/** 100 / 125 / 150 / 200 % (STYLE-GUIDE §1.2 `--ts`). */
export type TextSize = 'standard' | 'large' | 'xlarge' | 'xxlarge';
export const TEXT_SCALE: Record<TextSize, number> = { standard: 1, large: 1.25, xlarge: 1.5, xxlarge: 2 };
export const TEXT_SIZES = Object.keys(TEXT_SCALE) as TextSize[];
/** Reduce motion: follow the OS, or force on/off (H13). */
export type MotionPref = 'auto' | 'on' | 'off';
export type Theme = 'auto' | 'light' | 'dark';

export interface Settings {
  lang: UiLang;
  textSize: TextSize;
  theme: Theme;
  muted: boolean;
  preference: RoutePreference;
  /** H13 减少动画. */
  motion: MotionPref;
  /** Optional name for the greeting (asked once at first use, D-8). Empty = plain greeting. */
  name: string;
  /** First-run language/size choice done (H1). */
  onboarded: boolean;
  /** 震动提示: off silences all six haptics (6c.13). */
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'zh',
  textSize: 'standard',
  theme: 'auto',
  muted: false,
  preference: 'least_walk',
  motion: 'auto',
  name: '',
  onboarded: false,
  haptics: true,
};

export interface SavedPlaces {
  home?: Place;
  /** Other saved places (M4 adds labels/editing). */
  others: (Place & { label: string })[];
}

/**
 * M3 AC 35 (`howtogo.recents.v2`): one started trip. Place names and the two places' coordinates, the
 * Singapore **date** only (no time of day), done = arrived. No GPS track. `from` absent = "my location"
 * (the GPS start is never stored).
 */
export interface RecentTrip {
  to: Place;
  from?: Place;
  /** Singapore local date, `YYYY-MM-DD`. */
  date: string;
  /** Arrived (true) or started only (false). Absent on trips migrated from 0.2.0. */
  done?: boolean;
  /** Rail line codes the trip used (M34 review #2: the Home disruption strip only for a line a recent trip uses). */
  lines?: string[];
}

/** Singapore (UTC+8, no DST) calendar date of an instant: `YYYY-MM-DD`. */
export const sgDateOf = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);

/** Dedupe key for recent trips (AC 34): from + to place. */
const placeKey = (p: Place | undefined) => (p ? `${p.name}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}` : 'here');
export const tripKey = (r: { to: Place; from?: Place | undefined }) => `${placeKey(r.from)}>${placeKey(r.to)}`;

const isPlace = (v: unknown): v is Place =>
  !!v && typeof v === 'object' && typeof (v as Place).name === 'string' && typeof (v as Place).lat === 'number' && typeof (v as Place).lng === 'number';

/** A stored row (v2, or a 0.1/0.2 row with a full `at` timestamp) → a v2 row; anything else is dropped. */
function toRecent(v: unknown): RecentTrip | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<RecentTrip> & { at?: unknown };
  if (!isPlace(r.to)) return null;
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : typeof r.at === 'number' ? sgDateOf(r.at) : null;
  if (!date) return null;
  const pick = (p: Place): Place => ({ name: p.name, lat: p.lat, lng: p.lng, ...(p.address ? { address: p.address } : {}) });
  return {
    to: pick(r.to),
    ...(isPlace(r.from) ? { from: pick(r.from) } : {}),
    date,
    ...(typeof r.done === 'boolean' ? { done: r.done } : {}),
    ...(Array.isArray(r.lines) && r.lines.length ? { lines: r.lines.filter((x): x is string => typeof x === 'string') } : {}),
  };
}

/** Newest first, deduped on from+to (the first, i.e. newest, wins), capped. */
function normalizeRecents(list: unknown[]): RecentTrip[] {
  const seen = new Set<string>();
  const out: RecentTrip[] = [];
  for (const v of list) {
    const r = toRecent(v);
    if (!r || seen.has(tripKey(r))) continue;
    seen.add(tripKey(r));
    out.push(r);
  }
  return out.slice(0, MAX_RECENTS);
}

const RECENTS_KEY = 'recents.v2';
const LEGACY_RECENTS_KEY = 'recents';

/** Read `recents.v2`, folding in (then removing) a 0.1/0.2 `recents` list: the upgrade keeps them (M3 AC 36). */
function loadRecents(kv: KV): RecentTrip[] {
  const isArr = Array.isArray as (v: unknown) => v is unknown[];
  const v2 = readJSON<unknown[]>(kv, RECENTS_KEY, [], isArr);
  if (kv.get(LEGACY_RECENTS_KEY) == null) return normalizeRecents(v2);
  const legacy = readJSON<unknown[]>(kv, LEGACY_RECENTS_KEY, [], isArr);
  kv.remove(LEGACY_RECENTS_KEY);
  const at = (x: unknown) => toRecent(x)?.date ?? '';
  // Merge by date, newest first (stable: v2 rows before legacy rows on the same day).
  return normalizeRecents([...v2, ...legacy].map((x, i) => ({ x, i })).sort((a, b) => (at(b.x) < at(a.x) ? -1 : at(b.x) > at(a.x) ? 1 : a.i - b.i)).map((e) => e.x));
}

export interface Plan {
  /** null = "my location". */
  from: Place | null;
  to: Place | null;
  options: RankedItinerary[];
  selected: number;
  /** Resolved origin used for the options (from, or the GPS position for "my location"). */
  start?: Place;
  /** When the options were fetched. */
  fetchedAt?: number;
  /** The route preference the options were ranked for (QA-30). */
  pref?: RoutePreference;
  /** G2 multi-stop builder: places after the start (≤ 5), each with an optional dwell. */
  stops?: Place[];
  /** H4 journey: the planned multi-stop journey (from `runtime.planTrip`). */
  journey?: Journey;
}

export interface ShareSession {
  id: string;
  ownerToken: string;
  viewPath: string;
  expiresAt: string;
  /** Status currently being reported; `help` bypasses the 3 s limit (D-7). */
  status: 'travelling' | 'arrived' | 'paused' | 'help';
}

/** Multi-stop progress: segment k runs places[k] → places[k+1]. */
export interface TripJourneyState {
  segment: number;
  /** Planned travel + dwell per segment (H4 estimate, total ETA). Index = segment. */
  plans: SegmentPlan[];
}

/** guiding = H5 · waypoint = G3 (waiting for "continue") · arrived = H12. */
export type TripPhase = 'guiding' | 'waypoint' | 'arrived';

export interface ActiveTrip {
  id: string;
  /** [from, …waypoints, to]. */
  places: Place[];
  /** Itinerary of the current segment. */
  itinerary: Itinerary;
  /** Fixed at start (OQ10): steps and voice stay in this language. */
  lang: Lang;
  /** Guidance of the current segment. */
  guidance: GuidanceState;
  startedAt: number;
  reroutes: number;
  share?: ShareSession;
  // ---- M2 (all optional so a 0.1.0 stored trip still loads)
  journey?: TripJourneyState;
  phase?: TripPhase;
  /** The get-off alert showing (survives a reload). */
  alert?: AlertState | null;
  /** When the current step was entered (MRT estimate). */
  stepEnteredAt?: number;
  /** Ride countdown floor for the current step (never counts up). */
  stopsLeft?: number | null;
  mrtStopsLeft?: number | null;
  /** When the waypoint screen opened. */
  waypointAt?: number;
  /** Last write (resume diagnostics). */
  updatedAt?: number;
}

/** Stored recent trips (6d.9: max 10). Home shows up to HOME_RECENTS (M3 AC 34), H2 up to 5 destinations. */
export const MAX_RECENTS = 10;
export const HOME_RECENTS = 5;
const EMPTY_PLAN: Plan = { from: null, to: null, options: [], selected: 0 };

export const toLang = (l: UiLang): Lang => (l === 'en' ? 'en-SG' : 'zh-CN');

export function createStore(kv: KV = local, ss: KV = session, opts: { tripWriteMs?: number } = {}) {
  const settings = signal<Settings>({ ...DEFAULT_SETTINGS, ...readJSON<Partial<Settings>>(kv, 'settings', {}) });
  const places = signal<SavedPlaces>(readJSON<SavedPlaces>(kv, 'places', { others: [] }));
  const recents = signal<RecentTrip[]>(loadRecents(kv));
  const plan = signal<Plan>({ ...EMPTY_PLAN, ...readJSON<Partial<Plan>>(ss, 'plan', {}) });
  const trip = signal<ActiveTrip | null>(
    readJSON<ActiveTrip | null>(kv, 'trip.v1', null, (v): v is ActiveTrip => !!v && typeof v === 'object' && 'guidance' in v && 'itinerary' in v),
  );

  const disposers = [
    effect(() => writeJSON(kv, 'settings', settings.value)),
    effect(() => writeJSON(kv, 'places', places.value)),
    effect(() => writeJSON(kv, RECENTS_KEY, recents.value)),
    effect(() => writeJSON(ss, 'plan', plan.value)),
  ];

  // The trip changes on every fix: write immediately on step/status change, otherwise at most every tripWriteMs.
  const tripWriteMs = opts.tripWriteMs ?? 2000;
  let lastKey = '';
  let lastWrite = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const flushTrip = () => {
    if (pending) clearTimeout(pending);
    pending = null;
    lastWrite = Date.now();
    writeJSON(kv, 'trip.v1', trip.peek());
  };
  disposers.push(
    effect(() => {
      const t = trip.value;
      const key = t
        ? `${t.id}|${t.guidance.stepIndex}|${t.guidance.status}|${t.share?.id ?? ''}|${t.share?.status ?? ''}|${t.reroutes}|${t.phase ?? ''}|${t.journey?.segment ?? 0}|${t.alert?.kind ?? ''}${t.alert?.escalated ? '!' : ''}`
        : '';
      if (key !== lastKey || !t || Date.now() - lastWrite >= tripWriteMs) {
        lastKey = key;
        flushTrip();
      } else if (!pending) {
        pending = setTimeout(flushTrip, tripWriteMs);
      }
    }),
  );

  return {
    settings,
    places,
    recents,
    plan,
    trip,
    /** Write the trip now (call on pagehide / visibilitychange hidden). */
    flushTrip,
    updateSettings(patch: Partial<Settings>) {
      settings.value = { ...settings.value, ...patch };
    },
    setHome(p: Place | undefined) {
      const next = { ...places.value };
      if (p) next.home = p;
      else delete next.home;
      places.value = next;
    },
    /** Record a started trip (M3 AC 35): date only, not done yet; replaces the same from+to. */
    addRecent(to: Place, from?: Place, at = Date.now(), lines?: string[]) {
      recents.value = normalizeRecents([{ to, ...(from ? { from } : {}), date: sgDateOf(at), done: false, ...(lines?.length ? { lines } : {}) }, ...recents.value]);
    },
    /** The newest recent trip to `to` (the one started last) arrived. */
    markRecentDone(to: Place) {
      const k = placeKey(to);
      const i = recents.value.findIndex((r) => placeKey(r.to) === k);
      if (i < 0 || recents.value[i]!.done) return;
      recents.value = recents.value.map((r, j) => (j === i ? { ...r, done: true } : r));
    },
    clearRecents() {
      recents.value = [];
    },
    setPlan(patch: Partial<Plan>) {
      plan.value = { ...plan.value, ...patch };
    },
    resetPlan() {
      plan.value = EMPTY_PLAN;
    },
    setTrip(t: ActiveTrip | null) {
      trip.value = t;
    },
    patchTrip(fn: (t: ActiveTrip) => ActiveTrip) {
      const t = trip.value;
      if (t) trip.value = fn(t);
    },
    batch,
    dispose() {
      disposers.forEach((d) => d());
      if (pending) flushTrip();
    },
  };
}

export type Store = ReturnType<typeof createStore>;
