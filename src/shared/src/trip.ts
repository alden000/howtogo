/**
 * Trip policies (M2). Pure decisions around the guidance reducer: haptic map,
 * get-off alert escalation, resume window, pocket view trigger, manual mode,
 * location profile, stops-left countdown, MRT soft estimate, journey progress
 * and total ETA, and the speech queue. No timers, no clock reads: every
 * function takes `now`/`t` explicitly so the runtime can drive it with real or
 * fake timers and tests can pin every boundary.
 */
import type { Cue, CuePriority, CueType, Place, Step, StepKind } from './types';

// ------------------------------------------------------------------ haptics

/** The six canonical haptic names (STYLE-GUIDE 6c.13). No other names exist. */
export type HapticName = 'tick' | 'confirm' | 'attention' | 'getoff' | 'arrive' | 'gentle';

/** Patterns in ms (on·off·on…), copied from STYLE-GUIDE 6c.13. */
export const HAPTIC_PATTERNS: Record<HapticName, number[]> = {
  tick: [12],
  confirm: [20, 40, 20],
  attention: [60, 80, 60],
  getoff: [300, 150, 300, 150, 600],
  arrive: [40, 60, 40, 60, 160],
  gentle: [30, 60, 30],
};

/** Cue → haptic (6c.13). Cues not listed have no haptic (approaching_stop, gps_weak). */
export const HAPTIC_FOR_CUE: Partial<Record<CueType, HapticName>> = {
  step_changed: 'confirm',
  turn: 'confirm',
  transfer: 'confirm',
  boarded: 'confirm',
  back_on_route: 'confirm',
  arrived_at_stop: 'attention',
  arrived_waypoint: 'attention',
  get_off_next_stop: 'getoff',
  get_off_now: 'getoff',
  arrived_destination: 'arrive',
  off_route: 'gentle',
};

const HAPTIC_RANK: HapticName[] = ['tick', 'confirm', 'gentle', 'attention', 'arrive', 'getoff'];

/** One event → at most one haptic: the strongest of its cues (two buzzes on one fix feel like an error). */
export function hapticForCues(cues: readonly Pick<Cue, 'type'>[]): HapticName | null {
  let best: HapticName | null = null;
  for (const c of cues) {
    const h = HAPTIC_FOR_CUE[c.type];
    if (h && (best === null || HAPTIC_RANK.indexOf(h) > HAPTIC_RANK.indexOf(best))) best = h;
  }
  return best;
}

/** `get_off_now` buzzes twice, 800 ms apart (6c.1). */
export const GETOFF_NOW_REPEAT_MS = 800;
/** The alert's second voice line follows the first after 2.2 s (6c.1). */
export const ALERT_SECOND_LINE_MS = 2200;

// ------------------------------------------------------- get-off alert (H6/H6b)

/** Unacknowledged alert repeats voice + haptic once after this (OQ9). */
export const ALERT_ESCALATE_MS = 20_000;

export type AlertKind = 'next' | 'now';

export interface AlertState {
  kind: AlertKind;
  /** Ride step the alert belongs to; the alert ends with that step. */
  stepId: string;
  stop: string;
  /** Sign chip text as on the physical sign (F4); absent on alerts stored before 0.2.0. */
  sign?: string;
  /** Train station code for the chip ("NS26"). */
  code?: string;
  mode: 'bus' | 'train';
  shownAt: number;
  escalated: boolean;
}

export type AlertEvent =
  | { type: 'cue'; cue: Cue; mode: 'bus' | 'train'; t: number }
  | { type: 'ack'; t: number }
  /** The current step id after any guidance event. */
  | { type: 'step'; stepId: string | undefined; t: number }
  | { type: 'tick'; t: number };

/** show = H6 appears · grow = H6 → H6b · escalate = the single repeat · ack / clear = alert gone. */
export type AlertEffect = 'show' | 'grow' | 'escalate' | 'ack' | 'clear';

export interface AlertResult {
  alert: AlertState | null;
  effect: AlertEffect | null;
}

/**
 * H6 "get off at the next stop" → H6b "get off now". The alert stays until
 * acknowledged or until its ride step ends; an unacknowledged alert repeats
 * once 20 s after it was shown (H6 and H6b each have their own single repeat;
 * H6 growing into H6b cancels H6's). Never repeats after the ride step ended.
 */
export function alertReducer(a: AlertState | null, ev: AlertEvent): AlertResult {
  switch (ev.type) {
    case 'cue': {
      const kind: AlertKind | null = ev.cue.type === 'get_off_now' ? 'now' : ev.cue.type === 'get_off_next_stop' ? 'next' : null;
      if (!kind) return { alert: a, effect: null };
      // H6 never after H6b on the same ride.
      if (kind === 'next' && a?.kind === 'now' && a.stepId === ev.cue.stepId) return { alert: a, effect: null };
      const alert: AlertState = { kind, stepId: ev.cue.stepId, stop: String(ev.cue.params.stop ?? ''), mode: ev.mode, shownAt: ev.t, escalated: false };
      if (ev.cue.params.sign) alert.sign = String(ev.cue.params.sign);
      if (ev.cue.params.code) alert.code = String(ev.cue.params.code);
      const grow = kind === 'now' && a?.kind === 'next' && a.stepId === ev.cue.stepId;
      return { alert, effect: grow ? 'grow' : 'show' };
    }
    case 'ack':
      return a ? { alert: null, effect: 'ack' } : { alert: null, effect: null };
    case 'step':
      return a && a.stepId !== ev.stepId ? { alert: null, effect: 'clear' } : { alert: a, effect: null };
    case 'tick':
      if (a && !a.escalated && ev.t >= a.shownAt + ALERT_ESCALATE_MS) return { alert: { ...a, escalated: true }, effect: 'escalate' };
      return { alert: a, effect: null };
  }
}

/** When the runtime should next send `tick` to the alert reducer (null = never). */
export function alertDueAt(a: AlertState | null): number | null {
  return a && !a.escalated ? a.shownAt + ALERT_ESCALATE_MS : null;
}

// ------------------------------------------------------------------- resume

export const RESUME_GRACE_MS = 2 * 3600_000;
export const RESUME_DROP_MS = 24 * 3600_000;
export type ResumeDecision = 'resume' | 'ask' | 'drop';

/**
 * OQ5: auto-resume within ETA + 2 h; after that ask Continue/End; drop
 * silently once the trip is more than 24 h old (or already arrived).
 */
export function resumeDecision(trip: { startedAt: number; etaMs?: number | undefined; arrived?: boolean }, now: number): ResumeDecision {
  if (trip.arrived) return 'drop';
  if (!(now - trip.startedAt < RESUME_DROP_MS)) return 'drop';
  const eta = trip.etaMs ?? trip.startedAt;
  return now <= eta + RESUME_GRACE_MS ? 'resume' : 'ask';
}

// --------------------------------------------------------------- pocket view

export const POCKET_IDLE_MS = 45_000;

export interface PocketState {
  on: boolean;
  /** Last touch / step change / alert: the 45 s clock starts here. */
  since: number;
}

export interface PocketContext {
  stepKind: StepKind | undefined;
  /** An alert, sheet, H11 banner/note, waypoint or arrival screen, or the voice-unlock bar is showing. */
  blocked: boolean;
  /** Manual mode hides Pocket (no position updates to wait for). */
  manual: boolean;
}

export type PocketEvent =
  | { type: 'touch'; t: number }
  | { type: 'step'; t: number }
  /** The 放口袋 / Pocket button. */
  | { type: 'manual'; t: number }
  /** An alert (or another break-through screen) appeared. */
  | { type: 'alert'; t: number }
  | { type: 'tick'; t: number };

const pocketStep = (k: StepKind | undefined) => !!k && (k.startsWith('walk') || k.startsWith('ride'));

export function pocketEligible(ctx: PocketContext): boolean {
  return pocketStep(ctx.stepKind) && !ctx.blocked && !ctx.manual;
}

/**
 * OQ7 / 6c.2: dim after 45 s without a touch on a walk or ride step, or on the
 * Pocket button; never during an alert (or sheet, banner, waypoint, voice bar).
 * Any touch or alert leaves at once. A step change keeps pocket view on and
 * restarts the clock.
 */
export function pocketReducer(s: PocketState, ev: PocketEvent, ctx: PocketContext): PocketState {
  switch (ev.type) {
    case 'touch':
    case 'alert':
      return { on: false, since: ev.t };
    case 'step':
      return { on: s.on && !ctx.blocked, since: ev.t };
    case 'manual':
      return pocketEligible(ctx) ? { on: true, since: ev.t } : s;
    case 'tick':
      if (s.on && ctx.blocked) return { on: false, since: ev.t };
      if (!s.on && pocketEligible(ctx) && ev.t - s.since >= POCKET_IDLE_MS) return { on: true, since: s.since };
      return s;
  }
}

export function pocketDueAt(s: PocketState, ctx: PocketContext): number | null {
  return !s.on && pocketEligible(ctx) ? s.since + POCKET_IDLE_MS : null;
}

// --------------------------------------------------------------- manual mode

/** No usable fix for this long → manual mode (6c.7). */
export const MANUAL_NO_FIX_MS = 60_000;

export interface ManualInput {
  /** Location permission (or watch error) says we will never get fixes. */
  denied: boolean;
  /** Last good-accuracy fix, or undefined if none yet. */
  lastGoodFixAt?: number | undefined;
  /** When location watching (re)started. */
  watchingSince: number;
}

export function isManualMode(i: ManualInput, now: number): boolean {
  if (i.denied) return true;
  return now - (i.lastGoodFixAt ?? i.watchingSince) >= MANUAL_NO_FIX_MS;
}

export function manualDueAt(i: ManualInput): number | null {
  return i.denied ? null : (i.lastGoodFixAt ?? i.watchingSince) + MANUAL_NO_FIX_MS;
}

// ---------------------------------------------------------- location profile

export interface LocationProfile {
  intervalMs: number;
  highAccuracy: boolean;
}

/** AC 38: walk 2 s, wait 5 s, ride 5 s (bus) / 10 s (train), the last 2 stops before alighting 2 s. */
export function locationProfile(step: Step | undefined, stopsLeftN: number | null): LocationProfile {
  if (!step || step.kind.startsWith('walk')) return { intervalMs: 2000, highAccuracy: true };
  if (step.kind.startsWith('board')) return { intervalMs: 5000, highAccuracy: true };
  if (stopsLeftN !== null && stopsLeftN <= 2) return { intervalMs: 2000, highAccuracy: true };
  return { intervalMs: step.mode === 'bus' ? 5000 : 10_000, highAccuracy: true };
}

// ---------------------------------------------------------------- stops left

/**
 * Ride steps: stops still ahead (intermediate stops not yet passed + the
 * alighting stop). A stop counts as passed `passStopM` beyond it. With
 * `prev` the count never goes up (AC 8); it never goes below 0.
 */
export function stopsLeft(step: Step, alongM: number, prev?: number | null, passStopM = 25): number {
  const stops = step.stops ?? [];
  const total = stops.length || step.stopCount || 1;
  const passed = stops.slice(0, -1).filter((s) => alongM >= s.alongM + passStopM).length;
  const n = Math.max(0, total - passed);
  return prev === undefined || prev === null ? n : Math.min(prev, n);
}

// ---------------------------------------------------------- MRT soft estimate

const isTrainRide = (s: Step | undefined) => !!s && s.kind === 'ride_train';

/** Seconds after boarding at which each stop (incl. the alighting stop) is scheduled. */
export function stopOffsetsS(step: Step): number[] {
  const stops = step.stops ?? [];
  const last = stops[stops.length - 1];
  if (stops.length > 0 && last?.arrival !== undefined && stops.every((s) => s.arrival !== undefined)) {
    return stops.map((s) => Math.max(0, step.durationS - (last.arrival! - s.arrival!) / 1000));
  }
  return stops.map((s) => (step.lengthM > 0 ? (step.durationS * s.alongM) / step.lengthM : step.durationS));
}

export interface MrtEstimate {
  /** "约 还有 N 站": from the timetable, never below 1, never counting up. */
  stopsLeft: number;
  /** Scheduled time of the second-last station (the soft pre-alert), or null for a one-stop ride. */
  preAlertAt: number | null;
  /** Station to check for at the pre-alert. */
  station: string;
}

/**
 * OQ3: on a train ride without usable GPS, estimate stops left from the
 * schedule. Soft only — the strong "get off now" stays position/button based.
 */
export function mrtEstimate(step: Step | undefined, boardedAt: number, now: number, prev?: number | null): MrtEstimate | null {
  if (!step || !isTrainRide(step)) return null;
  const offs = stopOffsetsS(step);
  const elapsedS = (now - boardedAt) / 1000;
  let n = offs.filter((o) => o > elapsedS).length;
  n = Math.max(1, n);
  if (prev !== undefined && prev !== null) n = Math.min(prev, n);
  const pre = offs.length >= 2 ? boardedAt + offs[offs.length - 2]! * 1000 : null;
  return { stopsLeft: n, preAlertAt: pre, station: String(step.params.stop ?? '') };
}

// ------------------------------------------------------------- multi-stop

export const MAX_JOURNEY_STOPS = 5;
export const DWELL_CHOICES_MIN = [15, 30, 60, 90] as const;
export const DEFAULT_DWELL_MIN = 30;

/** A dwell value from the allowed choices (default 30). */
export function normalizeDwell(min: number | undefined): number {
  return (DWELL_CHOICES_MIN as readonly number[]).includes(min as number) ? (min as number) : DEFAULT_DWELL_MIN;
}

/** `places` = [start, …stops]; 1..5 stops after the start (OQ8). */
export function validateJourney(places: readonly Place[]): 'too_few' | 'too_many' | null {
  if (places.length < 2) return 'too_few';
  if (places.length - 1 > MAX_JOURNEY_STOPS) return 'too_many';
  return null;
}

/** One planned segment as the runtime keeps it (planning estimate for ETA / H4). */
export interface SegmentPlan {
  /** Planned travel time of the segment. */
  durationS: number;
  /** Planned stay at the segment's start place (0 for the first segment). */
  dwellS: number;
}

export interface JourneyProgress {
  /** 1-based index of the place being travelled to ("Place 2 of 4"), counted after the start. */
  place: number;
  /** Number of places after the start. */
  places: number;
  to: Place | undefined;
  next: Place | undefined;
  isLast: boolean;
  /** 0..1 over the whole journey by planned time. */
  overall: number;
}

export function journeyProgress(
  places: readonly Place[],
  segment: number,
  plans: readonly SegmentPlan[],
  segmentProgress: number,
  atWaypoint = false,
): JourneyProgress {
  const n = Math.max(1, places.length - 1);
  const total = plans.reduce((a, p, i) => a + p.durationS + (i > 0 ? p.dwellS : 0), 0);
  let done = 0;
  for (let i = 0; i < segment && i < plans.length; i++) done += plans[i]!.durationS + (i > 0 ? plans[i]!.dwellS : 0);
  const cur = plans[segment];
  if (cur) done += (segment > 0 ? cur.dwellS : 0) + cur.durationS * (atWaypoint ? 1 : Math.min(1, Math.max(0, segmentProgress)));
  return {
    place: segment + 1,
    places: n,
    to: places[segment + 1],
    next: places[segment + 2],
    isLast: segment >= n - 1,
    overall: total > 0 ? Math.min(1, done / total) : 0,
  };
}

/**
 * Total ETA (epoch ms): the current segment's ETA plus, for each later
 * segment, its planned dwell and travel time. At a waypoint the current
 * segment is done, so `segmentEtaMs` is "now".
 */
export function journeyEtaMs(segmentEtaMs: number, segment: number, plans: readonly SegmentPlan[]): number {
  let eta = segmentEtaMs;
  for (let i = segment + 1; i < plans.length; i++) eta += (plans[i]!.dwellS + plans[i]!.durationS) * 1000;
  return eta;
}

// ------------------------------------------------------------- speech queue

/** A queued line older than this that no longer matches the current step is dropped (AC 23). */
export const SPEECH_STALE_MS = 10_000;

export interface SpeechItem {
  text: string;
  priority: CuePriority;
  /** Step the line belongs to (undefined = not step-bound, never stale). */
  stepId?: string | undefined;
  at: number;
}

/** `high` interrupts: clears the queue and speaks now. Others queue. */
export function enqueueSpeech(queue: readonly SpeechItem[], item: SpeechItem): { queue: SpeechItem[]; interrupt: boolean } {
  if (item.priority === 'high') return { queue: [item], interrupt: true };
  return { queue: [...queue, item], interrupt: false };
}

/** Next line to speak, skipping stale lines for another step. */
export function takeSpeech(queue: readonly SpeechItem[], now: number, currentStepId: string | undefined): { item: SpeechItem | undefined; queue: SpeechItem[]; dropped: number } {
  let dropped = 0;
  for (let i = 0; i < queue.length; i++) {
    const it = queue[i]!;
    const stale = now - it.at > SPEECH_STALE_MS && it.stepId !== undefined && it.stepId !== currentStepId;
    if (stale) {
      dropped++;
      continue;
    }
    return { item: it, queue: queue.slice(i + 1), dropped };
  }
  return { item: undefined, queue: [], dropped };
}
