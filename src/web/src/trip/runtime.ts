/**
 * Trip runtime (M2): platform location → guidanceReducer → cues → speech queue /
 * haptics / notification → get-off alert escalation → live-share PUT → automatic
 * re-route → waypoint / arrival. Decisions live in pure functions
 * (`@howtogo/shared` trip policies, `map/follow.ts`); this file only wires them
 * to the platform adapter (D-4) and timers.
 *
 * UI contract: `runtime.ui` (one signal, `TripUi`) + the action methods below.
 * The trip itself (journey, guidance, alert, phase) lives in `store.trip` and is
 * persisted as `howtogo.trip.v1`, so `resume()` continues after a reload/kill.
 */
import { effect, signal } from '@preact/signals';
import {
  ALERT_SECOND_LINE_MS,
  alertDueAt,
  alertReducer,
  alertSecondLine,
  buildSteps,
  createGuidance,
  cueToSpeech,
  DEFAULT_DWELL_MIN,
  enqueueSpeech,
  GETOFF_NOW_REPEAT_MS,
  guidanceReducer,
  hapticForCues,
  isManualMode,
  journeyEtaMs,
  journeyProgress,
  gateFix,
  gpsProfile,
  initialFixGate,
  powerPolicy,
  shareCadence,
  type FixGateState,
  type GpsProfile,
  manualDueAt,
  mrtEstimate,
  normalizeDwell,
  normalizeOneMapPlan,
  planJourney,
  pocketDueAt,
  pocketReducer,
  rankItineraries,
  resumeDecision,
  stopsLeft as stopsLeftOf,
  takeSpeech,
  toShareUpdate,
  haversine,
  validateJourney,
  voiceLine,
  type AlertEffect,
  type AlertEvent,
  type AlertState,
  type CuePriority,
  type GuidanceEvent,
  type GuidanceState,
  type HapticName,
  type Itinerary,
  type LatLng,
  type Journey,
  type JourneyProgress,
  type MrtEstimate,
  type Place,
  type PocketContext,
  type PocketEvent,
  type PocketState,
  type SegmentPlan,
  type SpeechItem,
  type Step,
  type VoiceLine,
} from '@howtogo/shared';
import type { Api, SharePut } from '../api/types';
import { ApiError } from '../api/errors';
import { online } from '../api/offline';
import { log } from '../log';
import { followReducer, type FollowEvent, type FollowMode } from '../map/follow';
import type { LegHint, LegKind, LocationFix, NativeAlert, Platform, PlatformError, TripAlertEvent, Unsubscribe } from '../platform/types';
import { alertText, alertTitle, infoCopy, stepShortText, type InfoKind } from '../platform/notifyCopy';
import { toLang, type ActiveTrip, type ShareSession, type Store } from '../state/store';
import { here } from '../state/location';
import { local } from '../state/storage';

/** QA-21: the notification prompt is shown at most once per install. */
const NOTIFY_ASKED_KEY = 'notify.asked';
/** QA-25: a trip's last fix stands in for "here" after End for this long. */
const HERE_MAX_AGE_MS = 15 * 60_000;

export const SHARE_MIN_INTERVAL_MS = 3000;
/** M4 OQ7 cadence. */
export const SHARE_MOVING_MS = 15_000;
export const SHARE_STILL_MS = 60_000;
export const SHARE_MOVE_M = 20;
export const SHARE_BACKOFF_MS = [5000, 10_000, 20_000, 30_000] as const;
/** Minimum gap between two re-route attempts (AC 32: ≤ 1 per 20 s). */
export const REROUTE_RETRY_MS = 20_000;
/** "找到了新的路" banner and the MRT pre-alert banner auto-dismiss (AC 32, 6c.12). */
export const BANNER_MS = 4200;
/** Wake lock is released this long after arrival / at a waypoint (AC 39, 6c.5). */
export const WAKE_RELEASE_AFTER_MS = 60_000;
/** No fix for this long on a train ride → MRT soft estimate (OQ3). */
export const MRT_NO_FIX_MS = 30_000;
const TICK_MS = 30_000;

export type RerouteState = 'idle' | 'searching' | 'found' | 'failed' | 'offline';
export type TripPhaseUi = 'idle' | 'guiding' | 'waypoint' | 'arrived';

/** Everything the UI round needs to render H5/H6/H6b/H11/G1/G3/G4/G5 (state only). */
export interface TripUi {
  phase: TripPhaseUi;
  /** H6 (`kind: 'next'`) / H6b (`kind: 'now'`) get-off alert, or null. */
  alert: AlertState | null;
  /** H11 banner (`searching`, `found`) / trip note (`failed`, `offline`). */
  reroute: RerouteState;
  /** G5 manual mode: location denied or no usable fix for 60 s. */
  manual: boolean;
  /** Weak GPS spell (note + emphasised manual controls). */
  gpsWeak: boolean;
  /** G1 pocket view. */
  pocket: boolean;
  /** Follow-me camera (OQ2: step change re-engages; never a timer). */
  follow: FollowMode;
  /** Wake lock refused: show "请让屏幕保持亮着" (once per trip, ✕ → `dismissWakeNote`). */
  wakeLockFailed: boolean;
  /** G4 voice bar: speech / wake lock need a tap after a resume (iOS-like or refused wake lock). */
  voiceUnlockNeeded: boolean;
  /** No voice for the trip language (AC 26 note). */
  noVoice: boolean;
  /** QA-21: `asking` = explainer note while the permission prompt is up; `denied` = "alerts need the app open" note. */
  notify: 'idle' | 'asking' | 'denied';
  /** G4 stale-trip sheet (older than ETA + 2 h): ask Continue / End. */
  stale: { dest: string } | null;
  /** G4 resume toast: true right after a resume (`dismissResumed`). */
  resumed: boolean;
  /** Ride steps: stops left (never counts up), else null. */
  stopsLeft: number | null;
  /** OQ3 MRT soft estimate while underground, else null. */
  mrt: MrtEstimate | null;
  /** OQ3 soft pre-alert banner showing (auto-dismiss 4.2 s). */
  mrtPreAlert: boolean;
  /** G3 "continue" in progress (spinner). */
  continuing: boolean;
  /** G3 continue failed: the next segment has no route (H3 none state for that part). */
  segmentError: string | null;
  /** Journey progress ("Place 2 of 4"); for a single trip place = places = 1. */
  progress: JourneyProgress | null;
  /** Total ETA (epoch ms) including later segments and dwell. */
  etaMs: number | null;
  /** Last headline / alert line spoken. */
  lastLine: string | null;
  /** M4 AC 12: the share ended on the server (410) while running → one toast. */
  shareGone: boolean;
  /** Pill `paused` (6e.1): PUTs have been failing for > 60 s. */
  sharePaused: boolean;
}

const INITIAL_UI: TripUi = {
  phase: 'idle',
  alert: null,
  reroute: 'idle',
  manual: false,
  gpsWeak: false,
  pocket: false,
  follow: 'follow',
  wakeLockFailed: false,
  voiceUnlockNeeded: false,
  noVoice: false,
  notify: 'idle',
  stale: null,
  resumed: false,
  stopsLeft: null,
  mrt: null,
  mrtPreAlert: false,
  continuing: false,
  segmentError: null,
  progress: null,
  etaMs: null,
  lastLine: null,
  shareGone: false,
  sharePaused: false,
};

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
  /** Called each time location watching starts (start, resume, next segment). Demo mode loads its fix script here. */
  onAttach?: (trip: ActiveTrip, resumed: boolean) => void;
  idFactory?: () => string;
  /** Network state (default: the `online` signal, which also triggers the offline re-route retry). */
  isOnline?: () => boolean;
  /**
   * M5 AC 8: low-battery mode is on (src/state/battery.ts `saver`). Changes only the GPS middle-of-ride
   * interval, the share cadence (not Help) and the pocket-view delay; call `syncPower()` when it flips.
   */
  saver?: () => boolean;
  /**
   * M5 AC 7b: drop fixes that arrive faster than the leg profile before they reach guidance, the map and the
   * share. Default: on for real platforms, off for the demo platform (its scripted stream keeps M2 timing).
   */
  fixGate?: boolean;
}

/** M5 §B state for the UI round (H5 leaf chip, diagnostics): `runtime.power`. */
export interface TripPower {
  /** Low-battery mode on. */
  saver: boolean;
  /** Current GPS profile (null when not watching). */
  profile: GpsProfile | null;
  /** Fixes let through / dropped by the gate since the trip attached. */
  accepted: number;
  dropped: number;
}

/** Options for `start()`: a multi-stop journey from `planTrip()`. */
export interface StartOptions {
  journey?: Journey;
}

const isRide = (s: Step | undefined) => !!s && s.kind.startsWith('ride');
const rideMode = (s: Step | undefined): 'bus' | 'train' => (s?.mode === 'bus' ? 'bus' : 'train');
/** M6 6h.7: only these cues post a notification (info channel), with lock-screen-safe copy (no place names). */
const NOTIFY_FOR: Record<string, InfoKind> = { off_route: 'offroute', arrived_destination: 'arrival' };

export function createTripRuntime(o: TripRuntimeOptions) {
  const { store, platform, api } = o;
  const now = o.now ?? Date.now;
  const timers = o.timers ?? realTimers;
  const newId = o.idFactory ?? (() => Math.random().toString(36).slice(2, 10));
  const isOnline = o.isOnline ?? (() => online.value);

  const ui = signal<TripUi>({ ...INITIAL_UI });
  const heading = signal<number | null>(null);
  const locationError = signal<PlatformError | null>(null);
  const rerouting = signal(false);

  let stopWatch: Unsubscribe | null = null;
  let stopHeading: Unsubscribe | null = null;
  let stopVisibility: Unsubscribe | null = null;
  let stopNativeAlerts: Unsubscribe | null = null;
  let tick: unknown = null;
  let attached = false;
  let watchInterval: number | undefined;
  let watchKey: string | undefined;
  let gate: FixGateState = initialFixGate();
  const saver = o.saver ?? (() => false);
  const fixGateOn = o.fixGate ?? (platform.kind !== 'demo' && platform.kind !== 'fake');
  const power = signal<TripPower>({ saver: false, profile: null, accepted: 0, dropped: 0 });
  let watchingSince = 0;
  let lastGoodFixAt: number | undefined;
  let lastFixT = -Infinity;
  let lastFixAt = -Infinity;
  let denied = false;
  let sheetOpen = false;
  let pocketState: PocketState = { on: false, since: 0 };
  let wakeFailLogged = false;
  const firedLocal = new Set<string>();
  // speech queue (AC 23)
  type QItem = SpeechItem & { force?: boolean };
  let queue: QItem[] = [];
  let speakGen = 0;
  let speaking = false;

  // named one-shot timers owned by the runtime
  const T: Record<string, unknown> = {};
  const clear = (k: string) => {
    if (k in T) timers.clearTimeout(T[k]);
    delete T[k];
  };
  const later = (k: string, ms: number, fn: () => void) => {
    clear(k);
    T[k] = timers.setTimeout(() => {
      delete T[k];
      fn();
    }, Math.max(0, ms));
  };

  // Mute follows the setting for the runtime's lifetime (also covers the first cue at start).
  const muteEffect = effect(() => platform.speech.setMuted(store.settings.value.muted));
  // Offline re-route retries once the network is back (AC 33).
  let wasOnline = isOnline();
  const onlineEffect = o.isOnline
    ? () => {}
    : effect(() => {
        const on = online.value;
        if (on && !wasOnline && ui.peek().reroute === 'offline' && trip()?.guidance.status === 'off_route') void reroute();
        wasOnline = on;
      });

  // share throttle state
  let lastShareAt = -Infinity;
  let shareTimer: unknown = null;
  let shareInflight = false;
  let shareDirty = false;

  // re-route state
  let rerouteInflight = false;
  let lastRerouteAt = -Infinity;

  const trip = () => store.trip.peek();
  const lang = () => trip()?.lang ?? toLang(store.settings.peek().lang);
  const curStep = (t = trip()) => t?.guidance.steps[t.guidance.stepIndex];

  // ------------------------------------------------------------ ui + logs
  function patchUi(p: Partial<TripUi>) {
    const prev = ui.peek();
    const next = { ...prev, ...p };
    if (next.pocket !== prev.pocket) {
      log(`pocket:${next.pocket ? 'on' : 'off'}`);
      if (next.pocket) log('state:pocket');
    }
    if (next.manual !== prev.manual) log(next.manual ? 'state:manual' : 'state:auto');
    if (next.follow !== prev.follow) log(`follow:${next.follow === 'follow' ? 'on' : 'free'}`);
    if (next.reroute !== prev.reroute && (next.reroute === 'failed' || next.reroute === 'offline')) log(`state:reroute-${next.reroute}`);
    if (next.gpsWeak !== prev.gpsWeak && next.gpsWeak) log('state:gps-weak');
    if (!!next.mrt !== !!prev.mrt && next.mrt) log('state:mrt-estimate');
    if (next.voiceUnlockNeeded !== prev.voiceUnlockNeeded && next.voiceUnlockNeeded) log('state:voice-unlock');
    ui.value = next;
  }

  function plansOf(t: ActiveTrip): SegmentPlan[] {
    return t.journey?.plans ?? [{ durationS: t.guidance.steps.reduce((a, s) => a + s.durationS, 0), dwellS: 0 }];
  }

  function etaOf(t: ActiveTrip): number {
    const seg = t.journey?.segment ?? 0;
    const segEta = t.phase === 'waypoint' ? now() : t.guidance.etaISO ? Date.parse(t.guidance.etaISO) : now() + t.guidance.remainingS * 1000;
    return journeyEtaMs(segEta, seg, plansOf(t));
  }

  /** Recompute derived ui fields from the stored trip. */
  function derive() {
    const t = trip();
    if (!t) return;
    const step = curStep(t);
    const g = t.guidance;
    const progress = journeyProgress(t.places, t.journey?.segment ?? 0, plansOf(t), g.progress, t.phase === 'waypoint');
    let stopsLeft: number | null = null;
    if (step && isRide(step)) {
      stopsLeft = stopsLeftOf(step, g.alongM, t.stopsLeft);
      if (stopsLeft !== t.stopsLeft) store.patchTrip((tr) => ({ ...tr, stopsLeft }));
    }
    // OQ3: a train ride without usable GPS (weak, manual, or no fix for 30 s) → schedule-based estimate.
    let mrt: MrtEstimate | null = null;
    if (attached && step?.kind === 'ride_train' && (g.gpsWeak || ui.peek().manual || now() - lastFixAt >= MRT_NO_FIX_MS)) {
      mrt = mrtEstimate(step, t.stepEnteredAt ?? now(), now(), t.mrtStopsLeft);
      if (mrt && mrt.stopsLeft !== t.mrtStopsLeft) {
        const n = mrt.stopsLeft;
        store.patchTrip((tr) => ({ ...tr, mrtStopsLeft: n }));
      }
      const key = `${step.id}:mrt_prealert`;
      if (mrt?.preAlertAt != null && !firedLocal.has(key) && !(key in T)) later('mrtPre', mrt.preAlertAt - now(), () => mrtPreAlert(step.id, key));
    } else clear('mrtPre');
    patchUi({ progress, etaMs: etaOf(t), stopsLeft, mrt, gpsWeak: g.gpsWeak, alert: t.alert ?? null });
    syncPocket();
    syncProfile();
    // Re-check the estimate when it could next switch on.
    if (attached && step?.kind === 'ride_train' && !mrt) later('mrtCheck', lastFixAt + MRT_NO_FIX_MS - now(), derive);
    else clear('mrtCheck');
  }

  // ------------------------------------------------------------ speech queue (AC 23)
  function say(text: string, priority: CuePriority, stepId?: string, force = false) {
    if (!text) return;
    const item: QItem = { text, priority, stepId, at: now(), ...(force ? { force } : {}) };
    const r = enqueueSpeech(queue, item);
    queue = r.queue;
    if (r.interrupt) {
      speakGen++;
      speaking = false;
      void platform.speech.cancel();
    }
    void pump();
  }

  async function pump() {
    if (speaking) return;
    speaking = true;
    const gen = speakGen;
    for (;;) {
      if (gen !== speakGen) return; // interrupted: a newer pump owns the queue
      const r = takeSpeech(queue, now(), curStep()?.id);
      queue = r.queue;
      const it = r.item as QItem | undefined;
      if (!it) break;
      await platform.speech.speak(it.text, lang(), it.priority, it.force ? { force: true } : undefined);
    }
    if (gen === speakGen) speaking = false;
  }

  function haptic(h: HapticName | null) {
    if (h && store.settings.peek().haptics !== false) void platform.vibrate(h);
  }

  // ------------------------------------------------------------ cues
  function handleCues(state: GuidanceState, l: ActiveTrip['lang']) {
    const cues = state.cues;
    if (cues.length === 0) return;
    for (const cue of cues) log(`cue:${cue.type}`);
    const plain = cues.filter((c) => c.type !== 'get_off_next_stop' && c.type !== 'get_off_now');
    for (const cue of plain) {
      const text = cueToSpeech(cue, l);
      say(text, cue.priority, cue.stepId);
      if (cue.type === 'step_changed') patchUi({ lastLine: text });
      const info = NOTIFY_FOR[cue.type];
      if (info) void platform.notify({ tag: 'howtogo-cue', ...infoCopy(info, l), priority: cue.priority, kind: info });
    }
    haptic(hapticForCues(plain));
    for (const cue of cues) {
      if (cue.type === 'get_off_next_stop' || cue.type === 'get_off_now') alertEvent({ type: 'cue', cue, mode: rideMode(state.steps[cue.stepIndex]), t: now() });
    }
    alertEvent({ type: 'step', stepId: curStep()?.id, t: now() });
    if (cues.some((c) => c.type === 'off_route')) void reroute();
  }

  // ------------------------------------------------------------ get-off alert (H6/H6b)
  function alertEvent(ev: AlertEvent) {
    const t = trip();
    if (!t) return;
    const r = alertReducer(t.alert ?? null, ev);
    if (r.alert !== (t.alert ?? null)) store.patchTrip((tr) => ({ ...tr, alert: r.alert }));
    if (r.effect === 'ack' && t.alert) platform.trip?.ack(alertId(t.alert.stepId, t.alert.kind));
    if (r.effect) onAlertEffect(r.effect, r.alert);
    const due = alertDueAt(r.alert);
    if (due === null) clear('escalate');
    else if (r.effect === 'show' || r.effect === 'grow' || !('escalate' in T)) later('escalate', due - now(), () => alertEvent({ type: 'tick', t: now() }));
    if (r.alert !== ui.peek().alert) patchUi({ alert: r.alert });
  }

  function speakAlert(a: AlertState, force = false) {
    const l = lang();
    const l1 = cueToSpeech({ id: '', type: a.kind === 'now' ? 'get_off_now' : 'get_off_next_stop', priority: 'high', stepId: a.stepId, stepIndex: 0, params: { stop: a.stop }, t: 0 }, l);
    const l2 = alertSecondLine(a.kind, a.mode, l);
    say(l1, a.kind === 'now' || force ? 'high' : 'normal', a.stepId, force);
    later('line2', ALERT_SECOND_LINE_MS, () => say(l2, 'normal', a.stepId, force));
    patchUi({ lastLine: `${l1} ${l2}` });
  }

  function onAlertEffect(effect: AlertEffect, a: AlertState | null) {
    switch (effect) {
      case 'show':
      case 'grow': {
        if (!a) return;
        log(`alert:${a.kind}`);
        // M6 AC 18: one alert per id. The native service alerted first → the sheet shows, nothing buzzes or speaks twice.
        const id = alertId(a.stepId, a.kind);
        if (platform.trip?.firedNatively(id)) {
          log('alert:dedupe');
          pocketEvent({ type: 'alert', t: now() });
          return;
        }
        platform.trip?.markFired(id);
        haptic('getoff');
        if (a.kind === 'now') later('getoff2', GETOFF_NOW_REPEAT_MS, () => haptic('getoff'));
        speakAlert(a);
        pocketEvent({ type: 'alert', t: now() });
        void platform.notify({
          tag: 'getoff',
          title: alertTitle(a.kind, lang()),
          body: alertText(a.kind, a.mode, a.stop, lang()),
          priority: 'high',
          alertId: id,
          kind: a.kind === 'now' ? 'getoff-now' : 'getoff-next',
        });
        return;
      }
      case 'escalate':
        if (!a) return;
        log('alert:escalate');
        if (platform.trip?.firedNatively(alertId(a.stepId, a.kind))) return; // the service re-buzzes its own alert
        haptic('getoff');
        speakAlert(a);
        return;
      case 'ack':
        log('alert:ack');
        clear('line2');
        clear('getoff2');
        haptic('confirm');
        syncPocket();
        return;
      case 'clear':
        log('alert:clear');
        clear('line2');
        clear('getoff2');
        return;
    }
  }

  // ------------------------------------------------------------ dispatch
  function dispatch(event: GuidanceEvent): GuidanceState | null {
    const t = trip();
    if (!t || t.phase === 'waypoint' || t.phase === 'arrived') return null;
    const prev = t.guidance;
    const next = guidanceReducer(prev, event);
    const stepChanged = next.stepIndex !== prev.stepIndex || event.type === 'reroute_done';
    if (next.stepIndex !== prev.stepIndex) log(`step:${next.stepIndex}`);
    store.patchTrip((tr) => ({
      ...tr,
      guidance: next,
      updatedAt: now(),
      ...(stepChanged ? { stepEnteredAt: now(), stopsLeft: null, mrtStopsLeft: null } : {}),
    }));
    if (stepChanged) {
      const rr = ui.peek().reroute;
      if (event.type !== 'reroute_done' && rr !== 'idle' && rr !== 'searching') patchUi({ reroute: 'idle' });
      follow({ type: 'step_changed' });
      pocketEvent({ type: 'step', t: now() });
      clear('mrtPre');
      if (ui.peek().mrtPreAlert) patchUi({ mrtPreAlert: false });
    }
    handleCues(next, t.lang);
    if (next.status === 'arrived' && prev.status !== 'arrived') {
      if (next.cues.some((c) => c.type === 'arrived_waypoint')) enterWaypoint();
      else onArrived();
    } else if (stepChanged || (event.type === 'fix' && shareDue(next))) scheduleShare(false);
    derive();
    return next;
  }

  function onFix(f: LocationFix) {
    if (f.t <= lastFixT) return; // duplicate or out-of-order (AC 21)
    if (fixGateOn && watchInterval !== undefined) {
      // M5 AC 7b: the web cannot set a watch interval, so fixes faster than the leg profile stop here.
      const g = gateFix(gate, f.t, watchInterval);
      gate = g.state;
      power.value = { ...power.peek(), accepted: gate.accepted, dropped: gate.dropped };
      if (!g.pass) return;
    }
    lastFixT = f.t;
    lastFixAt = now();
    locationError.value = null;
    denied = false;
    const fix = { lat: f.lat, lng: f.lng, acc: f.acc, t: f.t, ...(f.heading !== undefined ? { heading: f.heading } : {}), ...(f.speed !== undefined ? { speed: f.speed } : {}) };
    const g = dispatch({ type: 'fix', fix });
    if (g && !g.gpsWeak && g.fix?.t === f.t) lastGoodFixAt = now();
    syncManual();
    // AC 16: deadlines also run on fixes, since a hidden WebView throttles setTimeout.
    const due = alertDueAt(trip()?.alert ?? null);
    if (due !== null && now() >= due) alertEvent({ type: 'tick', t: now() });
  }

  // ------------------------------------------------------------ manual mode (G5)
  function syncManual() {
    if (!attached) return;
    const input = { denied, lastGoodFixAt, watchingSince };
    const manual = isManualMode(input, now());
    if (manual !== ui.peek().manual) {
      patchUi({ manual });
      if (manual) say(voiceLine('manual', lang()), 'normal');
      syncPocket();
    }
    const due = manualDueAt(input);
    if (!manual && due !== null) later('manual', due - now(), syncManual);
    else clear('manual');
  }

  // ------------------------------------------------------------ pocket view (G1)
  function pocketCtx(): PocketContext {
    const t = trip();
    const u = ui.peek();
    return {
      stepKind: curStep(t)?.kind,
      blocked: !t || !attached || t.phase !== 'guiding' || !!t.alert || sheetOpen || u.reroute !== 'idle' || u.voiceUnlockNeeded || u.stale !== null || u.mrtPreAlert,
      manual: u.manual,
      idleMs: powerPolicy(saver()).pocketIdleMs,
    };
  }

  function pocketEvent(ev: PocketEvent) {
    const ctx = pocketCtx();
    pocketState = pocketReducer(pocketState, ev, ctx);
    if (pocketState.on !== ui.peek().pocket) patchUi({ pocket: pocketState.on });
    const due = pocketDueAt(pocketState, ctx);
    if (due === null) clear('pocket');
    else later('pocket', due - now(), () => pocketEvent({ type: 'tick', t: now() }));
  }

  function syncPocket() {
    pocketEvent({ type: 'tick', t: now() });
  }

  // ------------------------------------------------------------ follow-me (C)
  function follow(ev: FollowEvent) {
    const f = followReducer(ui.peek().follow, ev);
    if (f !== ui.peek().follow) patchUi({ follow: f });
  }

  // ------------------------------------------------------------ location profile (AC 38)
  /** M5 AC 7/8: the leg profile (M2 intervals; low accuracy mid-ride; battery saver widens mid-ride to 10 s). */
  const currentProfile = (): GpsProfile => gpsProfile(curStep(), ui.peek().stopsLeft, saver());
  const profileKey = (p: GpsProfile) => `${p.intervalMs}:${p.highAccuracy ? 'hi' : 'lo'}`;

  function syncProfile() {
    if (!attached || !stopWatch) return;
    if (platform.trip) return syncNative();
    if (profileKey(currentProfile()) !== watchKey) void startWatch();
  }

  async function startWatch() {
    stopWatch?.();
    stopWatch = null;
    const p = currentProfile();
    const prevAcc = watchKey?.split(':')[1];
    watchInterval = p.intervalMs;
    watchKey = profileKey(p);
    power.value = { ...power.peek(), saver: saver(), profile: p };
    log(`loc:profile ${p.intervalMs}`);
    if (prevAcc !== (p.highAccuracy ? 'hi' : 'lo')) log(`loc:accuracy ${p.highAccuracy ? 'high' : 'low'}`);
    const stop = await platform.location.watch(
      onFix,
      (e) => {
        locationError.value = e;
        log(`loc:${e.code}`);
        if (e.code === 'denied' || e.code === 'unsupported') {
          denied = true;
          syncManual();
        }
      },
      { intervalMs: p.intervalMs, highAccuracy: p.highAccuracy },
    );
    if (!attached || watchKey !== profileKey(p)) return stop(); // superseded while awaiting
    stopWatch = stop;
    if (platform.trip) {
      nativeLegKey = nativeArmKey = '';
      syncNative();
    }
  }

  // ------------------------------------------------------------ native trip service (M6 §C/§D)
  let nativeLegKey = '';
  let nativeArmKey = '';
  const alertId = (stepId: string, kind: 'next' | 'now') => `${trip()?.id ?? ''}:${stepId}:${kind}`;

  function legHint(t: ActiveTrip): LegHint {
    const step = curStep(t);
    const kind: LegKind = !step
      ? 'walk'
      : step.kind === 'walk_to_destination'
        ? 'last_walk'
        : step.kind.startsWith('board')
          ? 'wait'
          : isRide(step)
            ? 'ride'
            : 'walk';
    const stopsLeft = kind === 'ride' ? ui.peek().stopsLeft : null;
    const walking = !!step && step.kind.startsWith('walk');
    const remainingM = walking ? Math.max(0, step.lengthM - (t.guidance.alongM ?? 0)) : null;
    // 6h.7: the ongoing title is the step short text; re-routing shows "finding a new way", paused keeps the last.
    const title = stepShortText(step, {
      lang: t.lang,
      stopsLeft,
      remainingM,
      rerouting: ui.peek().reroute === 'searching',
      next: t.guidance.steps[t.guidance.stepIndex + 1],
    });
    return { kind, stopsLeft, lowBattery: false, body: title, title, lang: t.lang };
  }

  /** Native backup alerts for a ride step (AC 17): "next" around the stop before alighting, "now" at the alighting stop. */
  function nativeAlerts(t: ActiveTrip, step: Step): NativeAlert[] {
    const bus = step.mode === 'bus';
    const stops = step.stops ?? [];
    const alight = stops[stops.length - 1] ?? { ...step.end, name: '', displayName: '' };
    const prev = stops.length > 1 ? stops[stops.length - 2]! : null;
    const name = String(step.params.stop ?? alight.displayName ?? alight.name ?? '');
    const line = (kind: 'next' | 'now') =>
      cueToSpeech({ id: '', type: kind === 'now' ? 'get_off_now' : 'get_off_next_stop', priority: 'high', stepId: step.id, stepIndex: 0, params: { stop: name }, t: 0 }, t.lang);
    const mk = (kind: 'next' | 'now', at: LatLng, radiusM: number): NativeAlert => ({
      id: alertId(step.id, kind),
      kind,
      lat: at.lat,
      lng: at.lng,
      radiusM,
      title: alertTitle(kind, t.lang),
      body: alertText(kind, bus ? 'bus' : 'train', name, t.lang),
      speak: line(kind),
      lang: t.lang,
    });
    return [
      prev ? mk('next', prev, bus ? 80 : 200) : mk('next', step.end, bus ? 500 : 1200),
      mk('now', step.end, bus ? 150 : 300),
    ];
  }

  /** Called from derive() on every fix / step change: leg profile + notification text, and arm/disarm per ride step. */
  function syncNative() {
    const svc = platform.trip;
    const t = trip();
    if (!svc || !t || !attached) return;
    const h = legHint(t);
    const key = `${h.kind}:${h.stopsLeft !== null && h.stopsLeft <= 3 ? 'near' : 'far'}:${h.body}`;
    if (key !== nativeLegKey) {
      nativeLegKey = key;
      void svc.setLeg(h);
    }
    const step = curStep(t);
    const ride = isRide(step) && t.guidance.status !== 'off_route' ? step! : null;
    const armKey = ride ? `${t.id}:${ride.id}:${t.reroutes}` : '';
    if (armKey !== nativeArmKey) {
      nativeArmKey = armKey;
      void (ride ? svc.arm(nativeAlerts(t, ride)) : svc.disarm());
    }
  }

  function onNativeAlert(e: TripAlertEvent) {
    const a = trip()?.alert;
    if (e.type === 'fired') log(`alert:native-${e.kind}`);
    else if (a && alertId(a.stepId, a.kind) === e.id) alertEvent({ type: 'ack', t: now() }); // "知道了" on the lock screen
  }

  // ------------------------------------------------------------ wake lock (AC 39)
  async function acquireWake(): Promise<boolean> {
    clear('wakeRelease');
    const ok = await platform.wakeLock.acquire();
    if (!ok && trip()) {
      // QA-23: the note shows once per trip; later failed re-acquires (app switches) stay quiet.
      if (!wakeFailLogged) {
        log('state:wakelock-failed');
        patchUi({ wakeLockFailed: true });
      }
      wakeFailLogged = true;
    } else if (ok) log('wakelock:on');
    return ok;
  }

  function onVisibility(visible: boolean) {
    const t = trip();
    // M4 AC 14: hidden → `paused` (the page cannot send fixes); visible → travelling with a fresh fix.
    if (t?.share && t.share.status !== 'help' && t.share.status !== 'arrived' && t.phase !== 'arrived')
      setShareStatus(visible ? 'travelling' : 'paused');
    if (!visible) {
      store.flushTrip();
      return;
    }
    if (t && attached && t.phase === 'guiding' && !ui.peek().voiceUnlockNeeded) void acquireWake();
  }

  // ------------------------------------------------------------ waypoint / arrival
  function enterWaypoint() {
    store.patchTrip((tr) => ({ ...tr, phase: 'waypoint', waypointAt: now(), alert: null }));
    detachWatch();
    later('wakeRelease', WAKE_RELEASE_AFTER_MS, () => void platform.wakeLock.release());
    log('state:waypoint');
    pocketEvent({ type: 'alert', t: now() });
    patchUi({ phase: 'waypoint', segmentError: null, continuing: false });
  }

  function onArrived() {
    log('trip:arrived');
    const t = trip();
    const dest = t?.places[t.places.length - 1];
    if (dest) store.markRecentDone(dest);
    store.patchTrip((tr) => ({ ...tr, phase: 'arrived', alert: null }));
    if (t?.share && t.share.status !== 'help') setShareStatus('arrived');
    else scheduleShare(true);
    detachWatch();
    pocketEvent({ type: 'alert', t: now() });
    patchUi({ phase: 'arrived' });
    later('wakeRelease', WAKE_RELEASE_AFTER_MS, () => void platform.wakeLock.release());
  }

  function mrtPreAlert(stepId: string, key: string) {
    const t = trip();
    const step = curStep(t);
    if (!t || step?.id !== stepId || firedLocal.has(key) || !ui.peek().mrt) return;
    firedLocal.add(key);
    log('cue:mrt_prealert');
    haptic('attention');
    say(voiceLine('mrt_prealert', t.lang, { station: String(step.params.stop ?? '') }), 'normal', stepId);
    pocketEvent({ type: 'alert', t: now() });
    patchUi({ mrtPreAlert: true });
    later('mrtPreHide', BANNER_MS, () => {
      patchUi({ mrtPreAlert: false });
      syncPocket();
    });
  }

  // ------------------------------------------------------------ re-route (AC 32–33)
  /** `avoid` (M3 AC 22): drop itineraries it matches (affected MRT); none left → bus only. */
  async function reroute(avoid?: (it: Itinerary) => boolean) {
    const t = trip();
    const fix = t?.guidance.fix;
    if (!t || !fix || rerouteInflight || t.phase !== 'guiding') return;
    if (!isOnline()) {
      patchUi({ reroute: 'offline' });
      say(voiceLine('reroute_offline', t.lang), 'normal');
      log('reroute:offline');
      return;
    }
    const wait = lastRerouteAt + REROUTE_RETRY_MS - now();
    if (wait > 0) {
      later('reroute', wait, () => {
        if (trip()?.guidance.status === 'off_route') void reroute();
      });
      return;
    }
    rerouteInflight = true;
    rerouting.value = true;
    lastRerouteAt = now();
    patchUi({ reroute: 'searching' });
    log('reroute:start');
    try {
      const seg = t.journey?.segment ?? 0;
      const dest = t.places[seg + 1] ?? t.places[t.places.length - 1]!;
      const body = await api.route({ start: fix, end: dest, departAt: now(), numItineraries: 3 });
      let plan = normalizeOneMapPlan(body);
      let its = plan.ok ? plan.itineraries.filter((i) => !avoid?.(i)) : [];
      if (avoid && its.length === 0) {
        plan = normalizeOneMapPlan(await api.route({ start: fix, end: dest, departAt: now(), numItineraries: 3, mode: 'BUS' }));
        its = plan.ok ? plan.itineraries.filter((i) => !avoid(i)) : [];
      }
      if (!plan.ok || its.length === 0) throw new Error(plan.ok ? 'no_route' : plan.error);
      const best = rankItineraries(its, store.settings.peek().preference)[0]!.itinerary;
      const cur = trip();
      if (!cur || cur.id !== t.id) return;
      const steps = stepsFor(best, cur, seg);
      store.patchTrip((tr) => ({ ...tr, itinerary: best, reroutes: tr.reroutes + 1 }));
      dispatch({ type: 'reroute_done', steps, t: now() });
      log('reroute:done');
      patchUi({ reroute: 'found' });
      say(voiceLine('reroute_found', cur.lang), 'normal');
      haptic('confirm');
      later('rerouteFound', BANNER_MS, () => {
        if (ui.peek().reroute === 'found') patchUi({ reroute: 'idle' });
        syncPocket();
      });
    } catch {
      log('reroute:fail');
      const cur = trip();
      if (cur?.id === t.id) {
        const off = !isOnline();
        patchUi({ reroute: off ? 'offline' : 'failed' });
        say(voiceLine(off ? 'reroute_offline' : 'reroute_failed', cur.lang), 'normal');
      }
    } finally {
      rerouteInflight = false;
      rerouting.value = false;
    }
  }

  function stepsFor(it: Itinerary, t: Pick<ActiveTrip, 'places' | 'lang'>, seg: number) {
    const dest = t.places[seg + 1];
    const multi = t.places.length > 2;
    const last = seg >= t.places.length - 2;
    return buildSteps(it, t.lang, {
      ...(dest?.name ? { destinationName: dest.name } : {}),
      ...(multi ? { idPrefix: `j${seg}-`, segmentIndex: seg } : {}),
      ...(last ? {} : { isWaypoint: true }),
    });
  }

  // ------------------------------------------------------------ live share
  /** Last update sent: OQ7 cadence (15 s moving ≥ 20 m / 60 s still / every step and status change). */
  let lastSent: { at: number; lat?: number; lng?: number; step: number; status: string } | null = null;
  let shareFailures = 0;
  let shareFailingSince: number | null = null;

  function shareDue(g: GuidanceState): boolean {
    const t = trip();
    if (!t?.share) return false;
    if (!lastSent) return true;
    if (g.stepIndex !== lastSent.step || t.share.status !== lastSent.status) return true;
    const age = now() - lastSent.at;
    // M5 AC 8: battery saver 30 s moving / 120 s still; Help keeps the normal cadence (D-7). Normal = 15 s / 60 s.
    const c = shareCadence(saver(), t.share.status);
    const stillMs = saver() ? c.stillMs : SHARE_STILL_MS;
    const movingMs = saver() ? c.movingMs : SHARE_MOVING_MS;
    if (age >= stillMs) return true;
    const f = g.fix;
    if (!f || lastSent.lat === undefined) return age >= movingMs;
    return age >= movingMs && haversine(f, { lat: lastSent.lat, lng: lastSent.lng! }) >= SHARE_MOVE_M;
  }

  function sharePayload(t: ActiveTrip, share: ShareSession): SharePut {
    // Worker statuses only (API.md): the user's help/paused wins; a waypoint is still travelling.
    const status = share.status === 'help' || share.status === 'paused' || share.status === 'arrived' ? share.status : 'travelling';
    const p = toShareUpdate(t.guidance, { updatedAt: now(), status, stopsLeft: ui.peek().stopsLeft });
    const body: SharePut = { status: p.status, updatedAt: p.updatedAt, etaISO: status === 'arrived' ? null : (p.etaISO ?? null), stepText: p.stepText ?? null, step: p.step ?? null };
    if (p.lat !== undefined) Object.assign(body, { lat: p.lat, lng: p.lng, acc: p.acc, heading: p.heading ?? null, speed: p.speed ?? null });
    return body;
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
    shareDirty = false;
    shareInflight = true;
    lastShareAt = now();
    try {
      await api.sharePut(t.share.id, t.share.ownerToken, body);
      lastSent = { at: now(), step: t.guidance.stepIndex, status: body.status, ...(body.lat !== undefined ? { lat: body.lat, lng: body.lng! } : {}) };
      shareFailures = 0;
      shareFailingSince = null;
      if (ui.peek().sharePaused) patchUi({ sharePaused: false });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('network');
      if (err.shareGone) {
        log('share:gone');
        store.patchTrip((tr) => {
          const { share: _s, ...rest } = tr;
          return rest;
        });
        patchUi({ shareGone: true });
        void platform.notify({ tag: 'howtogo-share', ...infoCopy('share-ended', lang()), priority: 'normal', kind: 'share-ended' });
        return;
      }
      shareDirty = true; // keep only the latest; resend on the next opportunity
      // M4 AC 11/12: 429 → Retry-After; otherwise back off 5, 10, 20, 30 s (cap).
      const ms = err.status === 429 ? (err.retryAfterS ?? 3) * 1000 : SHARE_BACKOFF_MS[Math.min(shareFailures, SHARE_BACKOFF_MS.length - 1)]!;
      if (err.status !== 429) {
        shareFailures++;
        shareFailingSince ??= now();
        if (now() - shareFailingSince > 60_000 && !ui.peek().sharePaused) patchUi({ sharePaused: true });
      }
      if (shareTimer !== null) timers.clearTimeout(shareTimer);
      shareTimer = timers.setTimeout(() => {
        shareTimer = null;
        void sendShare();
      }, ms);
      return;
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
    log(resumed ? 'trip:resumed' : 'trip:started');
    stopVisibility ??= platform.visibility.onChange(onVisibility);
    stopNativeAlerts ??= platform.trip?.onAlert(onNativeAlert) ?? null;
    if (t.phase === 'waypoint' || t.phase === 'arrived') {
      // G3 / H12: no GPS watch, no wake lock until "continue".
      patchUi({ phase: t.phase });
      derive();
      return;
    }
    attached = true;
    patchUi({ phase: 'guiding' });
    o.onAttach?.(t, resumed);
    if (resumed && platform.capabilities.speechNeedsGesture) patchUi({ voiceUnlockNeeded: true });
    else {
      const ok = await acquireWake();
      if (resumed && !ok) patchUi({ voiceUnlockNeeded: true });
    }
    watchingSince = now();
    lastGoodFixAt = undefined;
    lastFixAt = now();
    const perm = await platform.location.permission().catch(() => 'prompt' as const);
    denied = perm === 'denied' || perm === 'unsupported';
    await startWatch();
    stopHeading ??= await platform.heading.watch((d) => (heading.value = d)).catch(() => null);
    if (tick === null)
      tick = timers.setInterval(() => {
        if (!dispatch({ type: 'tick', t: now() })) derive();
      }, TICK_MS);
    syncManual();
    void platform.speech
      .voices()
      .then((v) => {
        const has = trip()?.lang === 'en-SG' ? v.en : v.zh;
        if (!has && !ui.peek().noVoice) {
          log('state:no-voice');
          patchUi({ noVoice: true });
        }
      })
      .catch(() => {});
    derive();
  }

  function detachWatch() {
    if (attached && platform.trip) void platform.trip.disarm();
    nativeLegKey = nativeArmKey = '';
    attached = false;
    stopWatch?.();
    stopHeading?.();
    stopWatch = stopHeading = null;
    watchInterval = undefined;
    watchKey = undefined;
    power.value = { ...power.peek(), profile: null };
    if (tick !== null) timers.clearInterval(tick);
    tick = null;
    for (const k of ['manual', 'pocket', 'mrtPre', 'mrtCheck', 'reroute']) clear(k);
  }

  function detach() {
    detachWatch();
    stopVisibility?.();
    stopVisibility = null;
    stopNativeAlerts?.();
    stopNativeAlerts = null;
    if (shareTimer !== null) timers.clearTimeout(shareTimer);
    shareTimer = null;
    for (const k of Object.keys(T)) clear(k);
    queue = [];
    speakGen++;
    speaking = false;
    void platform.wakeLock.release();
    void platform.speech.cancel();
  }

  function resetUi() {
    pocketState = { on: false, since: now() };
    wakeFailLogged = false;
    firedLocal.clear();
    lastFixT = -Infinity;
    gate = initialFixGate();
    power.value = { saver: saver(), profile: null, accepted: 0, dropped: 0 };
    ui.value = { ...INITIAL_UI };
  }

  /** Plan a multi-stop journey (H4): [start, …stops] (≤ 5 after the start), dwell per waypoint in `Place.dwellMin` (15/30/60/90, default 30). */
  async function planTrip(places: Place[], departAt = now()): Promise<Journey> {
    const invalid = validateJourney(places);
    if (invalid) throw new Error(invalid);
    const withDwell = places.map((p, i) => (i === 0 || i === places.length - 1 ? p : { ...p, dwellMin: normalizeDwell(p.dwellMin) }));
    return planJourney(withDwell, (from, to, at) => api.route({ start: from, end: to, departAt: at, numItineraries: 3 }), {
      departAt,
      preference: store.settings.peek().preference,
      defaultDwellMin: DEFAULT_DWELL_MIN,
    });
  }

  async function currentPlace(t: ActiveTrip): Promise<Place> {
    try {
      const f = await platform.location.current({ highAccuracy: true });
      return { name: '', lat: f.lat, lng: f.lng };
    } catch {
      const f = t.guidance.fix;
      return f ? { name: '', lat: f.lat, lng: f.lng } : t.places[(t.journey?.segment ?? 0) + 1]!;
    }
  }

  /**
   * QA-21 (Director ruling): ask for notification permission once ever, inside the Start tap, with the
   * explainer note on H5 while the prompt is up. Denied → a note that get-off alerts need the app open.
   */
  function askNotify() {
    const n = platform.notifications;
    const p = n?.permission() ?? 'unsupported';
    if (p === 'granted' || p === 'unsupported') return;
    if (p === 'default' && local.get(NOTIFY_ASKED_KEY) !== '1') {
      local.set(NOTIFY_ASKED_KEY, '1');
      log('state:notify-ask');
      patchUi({ notify: 'asking' });
      const id = trip()?.id;
      void n.request().then(
        (r) => {
          log(`notify:${r === 'granted' ? 'granted' : 'denied'}`);
          if (trip()?.id === id) patchUi({ notify: r === 'granted' ? 'idle' : 'denied' });
        },
        () => trip()?.id === id && patchUi({ notify: 'denied' }),
      );
      return;
    }
    // Asked before and still undecided (prompt dismissed): no nagging. Denied: the note, once per trip.
    if (p === 'denied') patchUi({ notify: 'denied' });
  }

  async function start(itinerary: Itinerary, places: Place[], opts: StartOptions = {}) {
    if (attached || trip()) detach();
    resetUi();
    const l = toLang(store.settings.peek().lang);
    const j = opts.journey;
    const plans: SegmentPlan[] | undefined =
      places.length > 2
        ? places.slice(1).map((_, i) => {
            const seg = j?.segments[i];
            const it = i === 0 ? itinerary : seg?.itinerary;
            return {
              durationS: it ? Math.round((it.endTime - it.startTime) / 1000) : 0,
              dwellS: i === 0 ? 0 : (seg?.dwellS ?? normalizeDwell(places[i]?.dwellMin) * 60),
            };
          })
        : undefined;
    const steps = stepsFor(itinerary, { places, lang: l }, 0);
    const guidance = createGuidance(steps, now());
    const t: ActiveTrip = {
      id: newId(),
      places,
      itinerary,
      lang: l,
      guidance,
      startedAt: now(),
      reroutes: 0,
      phase: 'guiding',
      stepEnteredAt: now(),
      alert: null,
      ...(plans ? { journey: { segment: 0, plans } } : {}),
    };
    store.setTrip(t);
    askNotify();
    const to = places[places.length - 1];
    const lines = [...new Set([itinerary, ...(j?.segments ?? []).map((sg) => sg?.itinerary)].flatMap((it) => it?.legs ?? []).flatMap((g) => (g.line?.code ? [g.line.code] : [])))];
    // M3 AC 35: recorded on start. From = the planned start place; "my location" stores no start (no GPS).
    if (to) store.addRecent(to, store.plan.peek().from ?? undefined, now(), lines);
    handleCues(guidance, l);
    await attach(false);
  }

  async function end() {
    const t = trip();
    // QA-25: plans made right after a trip (H12 Route home) start from where the senior is now:
    // the trip's last fix when it is recent, otherwise no cached position (the next plan locates afresh).
    const f = t?.guidance.fix;
    here.value = f && now() - lastFixAt <= HERE_MAX_AGE_MS ? { lat: f.lat, lng: f.lng, label: null, acc: f.acc } : null;
    detach();
    if (t?.share) await api.shareDelete(t.share.id, t.share.ownerToken).catch(() => {});
    store.setTrip(null);
    resetUi();
    log('trip:ended');
  }

  return {
    /** One signal with every UI state (see `TripUi`). */
    ui,
    /** M5 §B: battery-saver state, GPS profile and fix-gate counters (UI round: H5 leaf chip). */
    power,
    /**
     * M5 AC 8: re-apply the power policy after low-battery mode flips (GPS profile, pocket delay; the share
     * cadence is read on every fix). Never touches alerts, Help or arrival.
     */
    syncPower() {
      power.value = { ...power.peek(), saver: saver() };
      if (!attached) return;
      syncProfile();
      syncPocket();
    },
    heading,
    locationError,
    rerouting,
    get attached() {
      return attached;
    },
    planTrip,
    /**
     * Start guidance (H4 Start). Every entry point uses this one call (AC 2).
     * `itinerary` = the chosen option for the first segment; `places` = [from, …, to].
     * A multi-stop journey passes `{ journey }` from `planTrip()` (or use `startJourney`).
     */
    start,
    /** Start a planned journey with each segment's chosen itinerary. */
    async startJourney(journey: Journey) {
      const first = journey.segments[0]?.itinerary;
      if (!first) throw new Error('journey_not_ok');
      await start(first, journey.places, { journey });
    },
    /**
     * After a reload/kill: apply the OQ5 window. `resume` re-attaches (`ui.resumed`
     * toast; `ui.voiceUnlockNeeded` where a tap is needed), `ask` sets `ui.stale`
     * for the G4 sheet, `drop` deletes the trip silently. True only when guidance resumed.
     */
    async resume(): Promise<boolean> {
      const t = trip();
      if (!t || attached) return false;
      const arrived = t.phase === 'arrived' || (t.guidance.status === 'arrived' && t.phase !== 'waypoint');
      const d = resumeDecision({ startedAt: t.startedAt, etaMs: etaOf(t), arrived }, now());
      if (d === 'drop') {
        log('state:resume-drop');
        store.setTrip(null);
        return false;
      }
      resetUi();
      if (d === 'ask') {
        log('state:resume-ask');
        patchUi({ stale: { dest: t.places[t.places.length - 1]?.name ?? '' } });
        return false;
      }
      log('state:resume');
      patchUi({ resumed: true });
      await attach(true);
      return true;
    },
    /** G4 stale sheet → Continue: resume at the stored step. */
    async continueStale(): Promise<boolean> {
      if (!trip()) return false;
      log('state:resume');
      patchUi({ stale: null, resumed: true });
      await attach(true);
      return true;
    },
    /** G4 stale sheet → End: delete the stored trip. */
    endStale: () => end(),
    /** G4 voice bar tap: unlock audio + wake lock, speak the current headline. */
    async unlockVoice() {
      patchUi({ voiceUnlockNeeded: false });
      log('resume:voice');
      haptic('tick');
      await acquireWake();
      const step = curStep();
      if (step) say(step.say ?? step.text, 'high', step.id);
      syncPocket();
    },
    dismissResumed: () => patchUi({ resumed: false }),
    dispatch,
    // ---- manual controls (G5): each speaks the new headline + `confirm` (via step_changed)
    next: () => dispatch({ type: 'next', t: now() }),
    previous: () => dispatch({ type: 'previous', t: now() }),
    onBoard: () => dispatch({ type: 'on_board', t: now() }),
    gotOff: () => dispatch({ type: 'got_off', t: now() }),
    /** "再说一遍": the current headline, or the alert lines while an alert shows. Works while muted (a tap is consent). */
    repeat() {
      const t = trip();
      if (!t) return;
      if (t.alert) return speakAlert(t.alert, true);
      const step = curStep(t);
      if (step) say(step.say ?? step.text, 'high', step.id, true);
    },
    /** H6/H6b "知道了 / OK, got it". */
    ackAlert: () => alertEvent({ type: 'ack', t: now() }),
    reroute: (avoid?: (it: Itinerary) => boolean) => reroute(avoid),
    /** ✕ on the re-route failed / offline note. */
    dismissRerouteNote: () => {
      patchUi({ reroute: 'idle' });
      syncPocket();
    },
    dismissWakeNote: () => patchUi({ wakeLockFailed: false }),
    dismissNotifyNote: () => patchUi({ notify: 'idle' }),
    // ---- pocket view (G1)
    /** Any touch / key press on the guidance screen (also leaves pocket view; `tick` haptic is the UI's). */
    touch: () => pocketEvent({ type: 'touch', t: now() }),
    /** 放口袋 / Pocket button. */
    pocket: () => pocketEvent({ type: 'manual', t: now() }),
    /** The UI reports sheets (End-trip, Help, All steps) so pocket view never starts under one. */
    setSheetOpen(open: boolean) {
      sheetOpen = open;
      if (open) pocketEvent({ type: 'touch', t: now() });
      else syncPocket();
    },
    // ---- follow-me (C)
    mapGesture: () => follow({ type: 'user_gesture' }),
    recentre: () => follow({ type: 'recentre' }),
    overview: () => follow({ type: 'overview' }),
    // ---- multi-stop (I)
    /** G3 "继续下一段": re-plan the next segment from the current position (AC 44). Never automatic. */
    async continueJourney(): Promise<boolean> {
      const t = trip();
      if (!t || t.phase !== 'waypoint') return false;
      const seg = (t.journey?.segment ?? 0) + 1;
      const to = t.places[seg + 1];
      if (!to) return false;
      patchUi({ continuing: true, segmentError: null });
      log('state:continuing');
      const from = await currentPlace(t);
      const journey = await planJourney([from, to], (a, b, at) => api.route({ start: a, end: b, departAt: at, numItineraries: 3 }), {
        departAt: now(),
        preference: store.settings.peek().preference,
      });
      const it = journey.segments[0]?.itinerary;
      const cur = trip();
      if (!cur || cur.id !== t.id || cur.phase !== 'waypoint') return false;
      if (!journey.ok || !it) {
        log('state:segment-failed');
        patchUi({ continuing: false, segmentError: journey.segments[0]?.error ?? 'no_route' });
        return false;
      }
      const guidance = createGuidance(stepsFor(it, cur, seg), now());
      const plans = plansOf(cur).map((p, i) => (i === seg ? { ...p, durationS: Math.round((it.endTime - it.startTime) / 1000) } : p));
      store.patchTrip((tr) => ({ ...tr, itinerary: it, guidance, journey: { segment: seg, plans }, phase: 'guiding', alert: null, stepEnteredAt: now(), stopsLeft: null, mrtStopsLeft: null }));
      log(`segment:${seg}`);
      pocketState = { on: false, since: now() };
      patchUi({ continuing: false, phase: 'guiding', reroute: 'idle', alert: null });
      follow({ type: 'step_changed' });
      handleCues(guidance, cur.lang);
      await attach(false);
      return true;
    },
    /** G3 "在这里结束": arrival at this place (H12); the UI then calls `end()`. */
    endAtWaypoint() {
      const t = trip();
      if (!t || t.phase !== 'waypoint') return;
      log('trip:arrived');
      store.patchTrip((tr) => ({ ...tr, phase: 'arrived' }));
      patchUi({ phase: 'arrived' });
    },
    /** Total ETA (epoch ms) of the trip including remaining segments and dwell. */
    eta: () => {
      const t = trip();
      return t ? etaOf(t) : null;
    },
    /** End the trip (End sheet, Done, stale End). Stops voice, GPS, wake lock; ends any share; deletes the stored trip. */
    end,
    /** M4 AC 3: create the share (sender name/phone only as allowed, OQ3) and send the first update. */
    async startShare(opts: { senderName?: string; senderPhone?: string; destName?: string; lang?: string; help?: boolean } = {}): Promise<ShareSession | null> {
      const t = trip();
      if (!t) return null;
      if (t.share) return t.share;
      const dest = t.places[t.places.length - 1]?.name || (t.lang === 'zh-CN' ? '目的地' : 'Destination');
      const c = await api.shareCreate({ destName: (opts.destName ?? dest).slice(0, 120), lang: opts.lang ?? (t.lang === 'zh-CN' ? 'zh' : 'en'), ...(opts.senderName ? { senderName: opts.senderName } : {}), ...(opts.senderPhone ? { senderPhone: opts.senderPhone } : {}) });
      const share: ShareSession = { ...c, status: opts.help ? 'help' : 'travelling' };
      shareFailures = 0;
      lastSent = null;
      patchUi({ shareGone: false });
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
    /** Settings → 试听 / Test voice (speaks even when muted: a tap is consent). */
    testVoice() {
      const l = toLang(store.settings.peek().lang);
      void platform.speech.speak(voiceLine('test', l), l, 'high', { force: true });
    },
    /** M3/M4 one-off lines (bus arriving, disruption, setup arrived): voice in the queue + one haptic. */
    speakText(text: string, h: HapticName | null = null) {
      haptic(h);
      say(text, 'normal');
    },
    /** Speak one of the runtime voice lines (for UI notes with a spoken line). */
    speakLine(line: VoiceLine) {
      say(voiceLine(line, lang()), 'normal');
    },
    dispose() {
      detach();
      muteEffect();
      onlineEffect();
    },
  };
}

export type TripRuntime = ReturnType<typeof createTripRuntime>;
