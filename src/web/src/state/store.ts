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

export interface RecentTrip {
  to: Place;
  from?: Place;
  at: number;
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

export const MAX_RECENTS = 5;
const EMPTY_PLAN: Plan = { from: null, to: null, options: [], selected: 0 };

export const toLang = (l: UiLang): Lang => (l === 'en' ? 'en-SG' : 'zh-CN');

export function createStore(kv: KV = local, ss: KV = session, opts: { tripWriteMs?: number } = {}) {
  const settings = signal<Settings>({ ...DEFAULT_SETTINGS, ...readJSON<Partial<Settings>>(kv, 'settings', {}) });
  const places = signal<SavedPlaces>(readJSON<SavedPlaces>(kv, 'places', { others: [] }));
  const recents = signal<RecentTrip[]>(readJSON<RecentTrip[]>(kv, 'recents', [], Array.isArray as (v: unknown) => v is RecentTrip[]));
  const plan = signal<Plan>({ ...EMPTY_PLAN, ...readJSON<Partial<Plan>>(ss, 'plan', {}) });
  const trip = signal<ActiveTrip | null>(
    readJSON<ActiveTrip | null>(kv, 'trip.v1', null, (v): v is ActiveTrip => !!v && typeof v === 'object' && 'guidance' in v && 'itinerary' in v),
  );

  const disposers = [
    effect(() => writeJSON(kv, 'settings', settings.value)),
    effect(() => writeJSON(kv, 'places', places.value)),
    effect(() => writeJSON(kv, 'recents', recents.value)),
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
    addRecent(to: Place, from?: Place, at = Date.now()) {
      const key = (p: Place) => `${p.name}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;
      const rest = recents.value.filter((r) => key(r.to) !== key(to));
      recents.value = [{ to, ...(from ? { from } : {}), at }, ...rest].slice(0, MAX_RECENTS);
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
