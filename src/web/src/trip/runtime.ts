/**
 * Trip runtime: platform location → guidanceReducer → cues → speech / vibration /
 * notification (cue dedupe lives in the engine) → live-share PUT (≥ 3 s apart,
 * latest fix wins; status `help` bypasses the limit per D-7) → automatic re-route
 * from the current position on `off_route`.
 *
 * The guidance state lives in the store (persisted), so `resume()` after a reload
 * continues where the trip left off.
 */
import { effect, signal } from '@preact/signals';
import {
  buildSteps,
  createGuidance,
  cueToSpeech,
  guidanceReducer,
  normalizeOneMapPlan,
  rankItineraries,
  toSharePayload,
  type Cue,
  type CueType,
  type GuidanceEvent,
  type GuidanceState,
  type Itinerary,
  type Place,
} from '@howtogo/shared';
import type { Api, SharePut } from '../api/types';
import { ApiError } from '../api/errors';
import { log } from '../log';
import type { LocationFix, Platform, PlatformError, Unsubscribe, VibratePattern } from '../platform/types';
import { toLang, type ActiveTrip, type ShareSession, type Store } from '../state/store';

export const SHARE_MIN_INTERVAL_MS = 3000;
/** Minimum gap between two re-route attempts in one off-route episode. */
export const REROUTE_RETRY_MS = 20_000;
const TICK_MS = 30_000;

const VIBRATE_FOR: Partial<Record<CueType, VibratePattern>> = {
  get_off_now: 'get_off',
  get_off_next_stop: 'notice',
  off_route: 'alert',
  arrived_destination: 'arrived',
  arrived_at_stop: 'tap',
  transfer: 'notice',
};
const NOTIFY_FOR = new Set<CueType>(['get_off_now', 'get_off_next_stop', 'off_route', 'arrived_destination', 'transfer']);

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as number),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id as number),
};

export interface TripRuntimeOptions {
  store: Store;
  platform: Platform;
  api: Api;
  now?: () => number;
  timers?: Timers;
  /** Called each time location watching starts (start or resume). Demo mode loads its fix script here. */
  onAttach?: (trip: ActiveTrip, resumed: boolean) => void;
  /** Guidance config override (tests). */
  idFactory?: () => string;
}

export function createTripRuntime(o: TripRuntimeOptions) {
  const { store, platform, api } = o;
  const now = o.now ?? Date.now;
  const timers = o.timers ?? realTimers;
  const newId = o.idFactory ?? (() => Math.random().toString(36).slice(2, 10));

  const heading = signal<number | null>(null);
  const locationError = signal<PlatformError | null>(null);
  const rerouting = signal(false);

  let stopWatch: Unsubscribe | null = null;
  let stopHeading: Unsubscribe | null = null;
  let tick: unknown = null;
  let attached = false;
  // Mute follows the setting for the runtime's lifetime (also covers the first cue at start).
  const muteEffect = effect(() => platform.speech.setMuted(store.settings.value.muted));

  // share throttle state
  let lastShareAt = -Infinity;
  let shareTimer: unknown = null;
  let shareInflight = false;
  let shareDirty = false;

  // re-route state
  let rerouteInflight = false;
  let lastRerouteAt = -Infinity;

  const trip = () => store.trip.peek();

  function stepsFor(it: Itinerary, places: Place[], lang: ActiveTrip['lang']) {
    const dest = places[places.length - 1];
    return buildSteps(it, lang, dest?.name ? { destinationName: dest.name } : {});
  }

  function handleCues(state: GuidanceState, lang: ActiveTrip['lang']) {
    for (const cue of state.cues) {
      log(`cue:${cue.type}`);
      const text = cueToSpeech(cue, lang);
      void platform.speech.speak(text, lang, cue.priority);
      const vib = VIBRATE_FOR[cue.type];
      if (vib) void platform.vibrate(vib);
      if (NOTIFY_FOR.has(cue.type)) void platform.notify({ tag: 'howtogo-cue', title: '怎么去?', body: text, priority: cue.priority });
      if (cue.type === 'off_route') void reroute(cue);
    }
  }

  function dispatch(event: GuidanceEvent): GuidanceState | null {
    const t = trip();
    if (!t) return null;
    const prev = t.guidance;
    const next = guidanceReducer(prev, event);
    if (next.stepIndex !== prev.stepIndex) log(`step:${next.stepIndex}`);
    store.patchTrip((tr) => ({ ...tr, guidance: next }));
    handleCues(next, t.lang);
    if (next.status === 'arrived' && prev.status !== 'arrived') onArrived();
    else if (event.type === 'fix') scheduleShare(false);
    // Off-route that persists after a failed attempt: retry on later fixes, at most every REROUTE_RETRY_MS.
    if (event.type === 'fix' && next.status === 'off_route' && !next.cues.some((c) => c.type === 'off_route')) void reroute();
    return next;
  }

  function onFix(f: LocationFix) {
    locationError.value = null;
    const fix = { lat: f.lat, lng: f.lng, acc: f.acc, t: f.t, ...(f.heading !== undefined ? { heading: f.heading } : {}), ...(f.speed !== undefined ? { speed: f.speed } : {}) };
    dispatch({ type: 'fix', fix });
  }

  function onArrived() {
    log('trip:arrived');
    const t = trip();
    if (t?.share && t.share.status !== 'help') setShareStatus('arrived');
    else scheduleShare(true);
    void platform.wakeLock.release();
  }

  async function reroute(_cue?: Cue) {
    const t = trip();
    const fix = t?.guidance.fix;
    if (!t || !fix || rerouteInflight || now() - lastRerouteAt < REROUTE_RETRY_MS) return;
    rerouteInflight = true;
    rerouting.value = true;
    lastRerouteAt = now();
    log('reroute:start');
    try {
      const dest = t.places[t.places.length - 1]!;
      const body = await api.route({ start: fix, end: dest, departAt: now(), numItineraries: 3 });
      const plan = normalizeOneMapPlan(body);
      if (!plan.ok || plan.itineraries.length === 0) throw new Error(plan.ok ? 'no_route' : plan.error);
      const best = rankItineraries(plan.itineraries, store.settings.peek().preference)[0]!.itinerary;
      const cur = trip();
      if (!cur || cur.id !== t.id) return;
      const places = [{ name: '', lat: fix.lat, lng: fix.lng }, ...cur.places.slice(1)];
      const steps = stepsFor(best, places, cur.lang);
      store.patchTrip((tr) => ({ ...tr, itinerary: best, reroutes: tr.reroutes + 1 }));
      dispatch({ type: 'reroute_done', steps, t: now() });
      log('reroute:done');
    } catch {
      log('reroute:fail');
    } finally {
      rerouteInflight = false;
      rerouting.value = false;
    }
  }

  // ------------------------------------------------------------ live share
  function sharePayload(t: ActiveTrip, share: ShareSession): SharePut | null {
    const p = toSharePayload(t.guidance);
    if (!p) return null;
    const status = share.status === 'help' || share.status === 'paused' ? share.status : t.guidance.status === 'arrived' ? 'arrived' : 'travelling';
    return {
      lat: p.lat,
      lng: p.lng,
      acc: p.acc,
      heading: p.heading ?? null,
      speed: p.speed ?? null,
      etaISO: p.etaISO ?? null,
      stepText: p.stepText ? p.stepText.slice(0, 280) : null,
      status,
      updatedAt: now(),
    };
  }

  /** Send the latest state, at most every 3 s (latest wins). `force` (help) bypasses the limit. */
  function scheduleShare(force: boolean) {
    const t = trip();
    if (!t?.share) return;
    shareDirty = true;
    if (shareInflight) return;
    const wait = force ? 0 : Math.max(0, lastShareAt + SHARE_MIN_INTERVAL_MS - now());
    if (wait === 0) {
      if (shareTimer !== null) timers.clearTimeout(shareTimer);
      shareTimer = null;
      void sendShare();
    } else if (shareTimer === null) {
      shareTimer = timers.setTimeout(() => {
        shareTimer = null;
        void sendShare();
      }, wait);
    }
  }

  async function sendShare() {
    const t = trip();
    if (!t?.share || !shareDirty) return;
    const body = sharePayload(t, t.share);
    if (!body) return;
    shareDirty = false;
    shareInflight = true;
    lastShareAt = now();
    try {
      await api.sharePut(t.share.id, t.share.ownerToken, body);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('network');
      if (err.shareGone) {
        log('share:gone');
        store.patchTrip((tr) => {
          const { share: _s, ...rest } = tr;
          return rest;
        });
        return;
      }
      shareDirty = true; // resend the latest on the next opportunity
      if (err.status === 429) {
        const ms = (err.retryAfterS ?? 3) * 1000;
        if (shareTimer === null)
          shareTimer = timers.setTimeout(() => {
            shareTimer = null;
            void sendShare();
          }, ms);
      }
    } finally {
      shareInflight = false;
    }
    // A forced (help) update that arrived while in flight goes out now.
    if (shareDirty && trip()?.share?.status === 'help' && body.status !== 'help') scheduleShare(true);
    else if (shareDirty && shareTimer === null && trip()?.share) scheduleShare(false);
  }

  function setShareStatus(status: ShareSession['status']) {
    const t = trip();
    if (!t?.share) return;
    store.patchTrip((tr) => ({ ...tr, share: { ...tr.share!, status } }));
    scheduleShare(status === 'help' || status === 'arrived');
  }

  // ------------------------------------------------------------ lifecycle
  async function attach(resumed: boolean) {
    const t = trip();
    if (!t || attached) return;
    attached = true;
    log(resumed ? 'trip:resumed' : 'trip:started');
    void platform.wakeLock.acquire();
    o.onAttach?.(t, resumed);
    stopWatch = await platform.location.watch(onFix, (e) => {
      locationError.value = e;
      log(`loc:${e.code}`);
    });
    stopHeading = await platform.heading.watch((d) => (heading.value = d)).catch(() => null);
    tick = timers.setInterval(() => dispatch({ type: 'tick', t: now() }), TICK_MS);
  }

  function detach() {
    attached = false;
    stopWatch?.();
    stopHeading?.();
    stopWatch = stopHeading = null;
    if (tick !== null) timers.clearInterval(tick);
    if (shareTimer !== null) timers.clearTimeout(shareTimer);
    tick = shareTimer = null;
    void platform.wakeLock.release();
    void platform.speech.cancel();
  }

  return {
    heading,
    locationError,
    rerouting,
    get attached() {
      return attached;
    },
    /** Start guidance for an itinerary. `places` = [from, …, to]. */
    async start(itinerary: Itinerary, places: Place[]) {
      if (attached) detach();
      const lang = toLang(store.settings.peek().lang);
      const steps = stepsFor(itinerary, places, lang);
      const guidance = createGuidance(steps, now());
      const t: ActiveTrip = { id: newId(), places, itinerary, lang, guidance, startedAt: now(), reroutes: 0 };
      store.setTrip(t);
      const to = places[places.length - 1];
      if (to) store.addRecent(to, places[0], now());
      handleCues(guidance, lang);
      await attach(false);
    },
    /** After a reload: re-attach to a persisted, unfinished trip. Returns true if resumed. */
    async resume(): Promise<boolean> {
      const t = trip();
      if (!t || attached) return false;
      if (t.guidance.status === 'arrived') return false;
      await attach(true);
      return true;
    },
    dispatch,
    next: () => dispatch({ type: 'next', t: now() }),
    previous: () => dispatch({ type: 'previous', t: now() }),
    onBoard: () => dispatch({ type: 'on_board', t: now() }),
    gotOff: () => dispatch({ type: 'got_off', t: now() }),
    /** Repeat the current instruction aloud. */
    repeat() {
      const t = trip();
      const step = t?.guidance.steps[t.guidance.stepIndex];
      if (t && step) void platform.speech.speak(step.text, t.lang, 'high');
    },
    reroute: () => reroute(),
    /** End the trip (user tapped "End" or left after arrival). Ends any share. */
    async end() {
      const t = trip();
      detach();
      if (t?.share) await api.shareDelete(t.share.id, t.share.ownerToken).catch(() => {});
      store.setTrip(null);
      log('trip:ended');
    },
    async startShare(): Promise<ShareSession | null> {
      const t = trip();
      if (!t) return null;
      if (t.share) return t.share;
      const dest = t.places[t.places.length - 1]?.name || (t.lang === 'zh-CN' ? '目的地' : 'Destination');
      const c = await api.shareCreate(dest.slice(0, 120), t.lang === 'zh-CN' ? 'zh' : 'en');
      const share: ShareSession = { ...c, status: 'travelling' };
      store.patchTrip((tr) => ({ ...tr, share }));
      log('share:started');
      lastShareAt = -Infinity;
      scheduleShare(true);
      return share;
    },
    async stopShare() {
      const t = trip();
      if (!t?.share) return;
      const s = t.share;
      store.patchTrip((tr) => {
        const { share: _s, ...rest } = tr;
        return rest;
      });
      log('share:stopped');
      await api.shareDelete(s.id, s.ownerToken).catch(() => {});
    },
    /** Help: report status `help` immediately (bypasses the 3 s limit, D-7). */
    help() {
      setShareStatus('help');
      log('share:help');
    },
    clearHelp() {
      setShareStatus('travelling');
    },
    dispose() {
      detach();
      muteEffect();
    },
  };
}

export type TripRuntime = ReturnType<typeof createTripRuntime>;
