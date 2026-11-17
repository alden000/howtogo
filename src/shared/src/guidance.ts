/**
 * Guidance state machine for a trip in progress.
 *
 *   state' = guidanceReducer(state, event)
 *
 * Pure: no timers, no clocks — every decision is tied to an event (a fix, a
 * button press) and to distances along the planned path, never to time
 * windows. `state.cues` holds the cues produced by the latest event only; the
 * UI speaks/shows them. Every cue fires at most once per step (dedupe via
 * `state.fired`), except `step_changed`, which is re-emitted on manual
 * navigation so the instruction is read again.
 */
import { cumulativeDistances, haversine, snapToPolyline } from './geo';
import { totalDurationS } from './steps';
import type { Cue, CuePriority, CueType, Fix, GuidanceEvent, GuidanceState, LatLng, MessageParams, Step } from './types';

export interface GuidanceConfig {
  /** Fixes with accuracy worse than this are ignored (gps_weak once per weak spell). */
  weakAccM: number;
  /** A fix counts towards off-route only if its accuracy is at least this good (walk / wait). */
  goodAccWalkM: number;
  /** Same, for ride steps. */
  goodAccTransitM: number;
  offRouteWalkM: number;
  offRouteWaitM: number;
  offRouteTransitM: number;
  /** Consecutive far fixes needed to declare off-route. */
  offRouteFixes: number;
  /** Consecutive near fixes (closer than factor × threshold) needed to recover. */
  recoverFixes: number;
  recoverFactor: number;
  /** Radius around a step end that counts as "there". */
  arriveRadiusM: number;
  /** Walk: announce the stop when this close (only if the walk is longer than 1.5×). */
  approachStopM: number;
  /** Walk: announce a turn this many metres before it. */
  turnLeadM: number;
  /** Metres past an intermediate stop before it counts as passed. */
  passStopM: number;
  getOffNowBusM: number;
  getOffNowTrainM: number;
  /** Ride with no intermediate stops but longer than this → stops are probably missing; use distance fallback. */
  singleStopMaxBusM: number;
  singleStopMaxTrainM: number;
  /** Distance fallback for get_off_next_stop when intermediate stops are missing. */
  nextStopFallbackBusM: number;
  nextStopFallbackTrainM: number;
  /** Wait step: metres travelled along the ride path that mean "the user is on board". */
  boardDetectM: number;
}

export const DEFAULT_GUIDANCE_CONFIG: GuidanceConfig = {
  weakAccM: 100,
  goodAccWalkM: 50,
  goodAccTransitM: 100,
  offRouteWalkM: 50,
  offRouteWaitM: 80,
  offRouteTransitM: 150,
  offRouteFixes: 3,
  recoverFixes: 2,
  recoverFactor: 0.6,
  arriveRadiusM: 20,
  approachStopM: 60,
  turnLeadM: 25,
  passStopM: 25,
  getOffNowBusM: 150,
  getOffNowTrainM: 300,
  singleStopMaxBusM: 1000,
  singleStopMaxTrainM: 2500,
  nextStopFallbackBusM: 400,
  nextStopFallbackTrainM: 1200,
  boardDetectM: 120,
};

export const CUE_PRIORITY: Record<CueType, CuePriority> = {
  get_off_now: 'high',
  off_route: 'high',
  arrived_destination: 'high',
  get_off_next_stop: 'normal',
  turn: 'normal',
  transfer: 'normal',
  arrived_at_stop: 'normal',
  arrived_waypoint: 'normal',
  approaching_stop: 'normal',
  boarded: 'low',
  back_on_route: 'low',
  gps_weak: 'low',
  step_changed: 'low',
};

// Per-geometry cache of cumulative distances (pure memoisation).
const cumCache = new WeakMap<readonly LatLng[], number[]>();
function cumOf(line: readonly LatLng[]): number[] {
  let c = cumCache.get(line);
  if (!c) {
    c = cumulativeDistances(line);
    cumCache.set(line, c);
  }
  return c;
}

const isWalk = (s: Step) => s.kind.startsWith('walk');
const isBoard = (s: Step) => s.kind.startsWith('board');
const isRide = (s: Step) => s.kind.startsWith('ride');

/** Initial state. Emits `step_changed` for the first step. */
export function createGuidance(steps: Step[], t?: number): GuidanceState {
  const s: GuidanceState = {
    steps,
    stepIndex: 0,
    status: steps.length === 0 ? 'arrived' : 'active',
    alongM: 0,
    offPathM: 0,
    distanceToNextActionM: steps[0]?.lengthM ?? 0,
    progress: 0,
    remainingS: totalDurationS(steps),
    onBoard: false,
    gpsWeak: false,
    offCount: 0,
    onCount: 0,
    offEpisode: 0,
    weakEpisode: 0,
    fired: [],
    cues: [],
  };
  if (t !== undefined) s.t = t;
  if (steps[0]) {
    s.onBoard = isRide(steps[0]);
    emit(s, 'step_changed', { text: steps[0].text }, undefined, true);
  }
  return derive(s);
}

/** Mutating helper on a working copy. */
function emit(s: GuidanceState, type: CueType, params: MessageParams, id?: string, always = false): void {
  const step = s.steps[s.stepIndex];
  if (!step) return;
  const cueId = id ?? `${step.id}:${type}`;
  if (!always && s.fired.includes(cueId)) return;
  if (!s.fired.includes(cueId)) s.fired = [...s.fired, cueId];
  const cue: Cue = {
    id: cueId,
    type,
    priority: CUE_PRIORITY[type],
    stepId: step.id,
    stepIndex: s.stepIndex,
    params,
    t: s.t ?? 0,
  };
  s.cues = [...s.cues, cue];
}

function transferParams(step: Step): MessageParams {
  const p: MessageParams = { mode: step.mode === 'bus' ? 'bus' : 'train' };
  if (step.route) p.route = step.route;
  if (typeof step.params.line === 'string') p.line = step.params.line;
  if (typeof step.params.route === 'string' && step.params.route) p.route = step.params.route;
  return p;
}

function enterStep(s: GuidanceState, idx: number, manual: boolean): void {
  const prev = s.steps[s.stepIndex];
  s.stepIndex = idx;
  const step = s.steps[idx]!;
  s.alongM = 0;
  s.offCount = 0;
  s.onCount = 0;
  s.onBoard = isRide(step);
  if (s.status === 'off_route') s.status = 'active';
  if (step.kind === 'walk_transfer' || (isBoard(step) && step.isTransfer && prev && isRide(prev))) {
    emit(s, 'transfer', transferParams(step.kind === 'walk_transfer' ? (s.steps[idx + 1] ?? step) : step));
  }
  emit(s, 'step_changed', { text: step.text }, undefined, manual);
}

/**
 * The last step is done. A segment of a multi-stop journey guided on its own
 * (its final walk built with `isWaypoint`) ends with `arrived_waypoint` instead
 * of `arrived_destination`; the runtime then waits for the user's "continue".
 */
function arrive(s: GuidanceState): void {
  s.status = 'arrived';
  const step = s.steps[s.stepIndex];
  if (step?.kind === 'walk_to_destination' && step.isFinal === false) emit(s, 'arrived_waypoint', { dest: String(step.params.dest ?? '') });
  else emit(s, 'arrived_destination', {});
}

function turnKey(direction: string): string {
  if (direction.startsWith('UTURN')) return 'uturn';
  if (direction === 'SLIGHTLY_LEFT') return 'slight_left';
  if (direction === 'SLIGHTLY_RIGHT') return 'slight_right';
  if (direction.endsWith('LEFT')) return 'left';
  if (direction.endsWith('RIGHT')) return 'right';
  return 'straight';
}

interface Eval {
  alongM: number;
  offM: number;
  snapped: LatLng;
  advance: boolean;
}

function evalWalk(s: GuidanceState, step: Step, fix: Fix, cfg: GuidanceConfig): Eval {
  const snap = snapToPolyline(fix, step.geometry, cumOf(step.geometry))!;
  const along = Math.max(snap.alongM, 0);
  const remaining = Math.max(0, step.lengthM - along);
  const distEnd = haversine(fix, step.end);
  const onPath = snap.distanceM <= cfg.offRouteWalkM;

  if (onPath && step.turns) {
    step.turns.forEach((turn, k) => {
      const ahead = turn.alongM - along;
      if (ahead <= cfg.turnLeadM && ahead > -10) {
        const p: MessageParams = { direction: turnKey(turn.direction) };
        if (turn.streetName) p.street = turn.streetName;
        emit(s, 'turn', p, `${step.id}:turn:${k}`);
      }
    });
  }

  if (
    onPath &&
    (step.kind === 'walk_to_stop' || step.kind === 'walk_transfer') &&
    step.lengthM > cfg.approachStopM * 1.5 &&
    remaining <= cfg.approachStopM
  ) {
    const next = s.steps[s.stepIndex + 1];
    emit(s, 'approaching_stop', { stop: String(step.params.stop ?? ''), mode: next?.mode === 'bus' ? 'bus' : 'train' });
  }

  const radius = Math.max(cfg.arriveRadiusM, Math.min(fix.acc, 30));
  const arrived = distEnd <= radius || (remaining <= radius && snap.distanceM <= 30);
  return { alongM: along, offM: snap.distanceM, snapped: snap.point, advance: arrived };
}

function evalBoard(s: GuidanceState, step: Step, fix: Fix, cfg: GuidanceConfig): Eval {
  const offStop = haversine(fix, step.end);
  const ride = s.steps[s.stepIndex + 1];
  let offM = offStop;
  let advance = false;
  if (ride && isRide(ride)) {
    const snap = snapToPolyline(fix, ride.geometry, cumOf(ride.geometry))!;
    offM = Math.min(offStop, snap.distanceM);
    if (snap.alongM >= cfg.boardDetectM && snap.distanceM <= 60) advance = true;
  }
  return { alongM: 0, offM, snapped: step.end, advance };
}

function evalRide(s: GuidanceState, step: Step, fix: Fix, cfg: GuidanceConfig): Eval {
  const snap = snapToPolyline(fix, step.geometry, cumOf(step.geometry))!;
  const along = snap.alongM;
  const remaining = Math.max(0, step.lengthM - along);
  const bus = step.mode === 'bus';
  const stops = step.stops ?? [];
  const inter = stops.slice(0, -1);
  const onPath = snap.distanceM <= cfg.offRouteTransitM;

  let nextStop: boolean;
  if (inter.length > 0) {
    nextStop = along >= inter[inter.length - 1]!.alongM + cfg.passStopM;
  } else if (step.lengthM <= (bus ? cfg.singleStopMaxBusM : cfg.singleStopMaxTrainM)) {
    nextStop = true; // genuinely one stop: the next stop is the alighting stop
  } else {
    nextStop = remaining <= (bus ? cfg.nextStopFallbackBusM : cfg.nextStopFallbackTrainM);
  }
  // When the last stop gap is short, shrink the "now" radius so "next stop" gets its own moment.
  let nowM = bus ? cfg.getOffNowBusM : cfg.getOffNowTrainM;
  if (inter.length > 0) nowM = Math.min(nowM, 0.6 * (step.lengthM - inter[inter.length - 1]!.alongM));
  const now = nextStop && remaining <= nowM;
  const nextStopId = `${step.id}:get_off_next_stop`;
  if (onPath && now) {
    // Never say "next stop" after "now": if both become true on one fix, only "now" is spoken.
    if (!s.fired.includes(nextStopId)) s.fired = [...s.fired, nextStopId];
    emit(s, 'get_off_now', { stop: String(step.params.stop ?? '') });
  } else if (onPath && nextStop) {
    emit(s, 'get_off_next_stop', { stop: String(step.params.stop ?? ''), mode: bus ? 'bus' : 'train' });
  }

  let advance = remaining <= 30 || haversine(fix, step.end) <= 30;
  // Missed the alighting moment but clearly walking the next leg already.
  const next = s.steps[s.stepIndex + 1];
  if (!advance && next && isWalk(next) && remaining <= 300) {
    const ns = snapToPolyline(fix, next.geometry, cumOf(next.geometry))!;
    if (ns.distanceM <= 25 && ns.alongM >= 30) advance = true;
  }
  return { alongM: along, offM: snap.distanceM, snapped: snap.point, advance };
}

function offRouteThreshold(step: Step, cfg: GuidanceConfig): number {
  if (isRide(step)) return cfg.offRouteTransitM;
  if (isBoard(step)) return cfg.offRouteWaitM;
  return cfg.offRouteWalkM;
}

function onFix(s: GuidanceState, fix: Fix, cfg: GuidanceConfig): void {
  s.t = fix.t;
  if (s.status === 'arrived') {
    s.fix = fix;
    return;
  }
  if (!(fix.acc <= cfg.weakAccM) || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) {
    if (!s.gpsWeak) {
      s.gpsWeak = true;
      emit(s, 'gps_weak', { acc: Math.round(fix.acc) }, `gps_weak:${s.weakEpisode}`);
    }
    return;
  }
  if (s.gpsWeak) {
    s.gpsWeak = false;
    s.weakEpisode += 1;
  }
  s.fix = fix;

  for (let guard = 0; guard < 8; guard++) {
    const step = s.steps[s.stepIndex]!;
    const ev = isWalk(step) ? evalWalk(s, step, fix, cfg) : isBoard(step) ? evalBoard(s, step, fix, cfg) : evalRide(s, step, fix, cfg);
    s.alongM = ev.alongM;
    s.offPathM = ev.offM;
    s.snapped = ev.snapped;
    if (!ev.advance) {
      offRoute(s, step, fix, ev.offM, cfg);
      return;
    }
    // ---- step complete
    if (step.kind === 'walk_to_destination') {
      if (step.isFinal === false && s.stepIndex < s.steps.length - 1) {
        emit(s, 'arrived_waypoint', { dest: String(step.params.dest ?? '') });
        enterStep(s, s.stepIndex + 1, false);
        continue;
      }
      s.alongM = step.lengthM;
      arrive(s);
      return;
    }
    if (step.kind === 'walk_to_stop' || step.kind === 'walk_transfer') {
      emit(s, 'arrived_at_stop', { stop: String(step.params.stop ?? '') });
    }
    if (isBoard(step)) {
      enterStep(s, s.stepIndex + 1, false);
      emit(s, 'boarded', {});
      continue;
    }
    if (s.stepIndex >= s.steps.length - 1) {
      arrive(s);
      return;
    }
    enterStep(s, s.stepIndex + 1, false);
  }
}

function offRoute(s: GuidanceState, step: Step, fix: Fix, offM: number, cfg: GuidanceConfig): void {
  const good = fix.acc <= (isRide(step) ? cfg.goodAccTransitM : cfg.goodAccWalkM);
  if (!good) return;
  const T = offRouteThreshold(step, cfg);
  if (offM > T) {
    s.onCount = 0;
    s.offCount += 1;
    if (s.offCount >= cfg.offRouteFixes && s.status !== 'off_route') {
      s.status = 'off_route';
      s.offEpisode += 1;
      emit(s, 'off_route', { offM: Math.round(offM) }, `off_route:${s.offEpisode}`);
    }
  } else if (offM < T * cfg.recoverFactor) {
    s.offCount = 0;
    if (s.status === 'off_route') {
      s.onCount += 1;
      if (s.onCount >= cfg.recoverFixes) {
        s.status = 'active';
        s.onCount = 0;
        emit(s, 'back_on_route', {}, `back_on_route:${s.offEpisode}`);
      }
    }
  } else if (s.status !== 'off_route') {
    s.offCount = 0; // hysteresis band: breaks the "consecutive" streak
  }
}

/** Recompute remaining time, progress, ETA and distance to the next action. */
function derive(s: GuidanceState): GuidanceState {
  const total = totalDurationS(s.steps);
  if (s.status === 'arrived') {
    s.remainingS = 0;
    s.progress = 1;
    s.distanceToNextActionM = 0;
    if (s.t !== undefined) s.etaISO = new Date(s.t).toISOString();
    return s;
  }
  const step = s.steps[s.stepIndex];
  if (!step) return s;
  let frac: number;
  if (isBoard(step)) frac = s.onBoard ? 0 : 1;
  else frac = step.lengthM > 0 ? Math.max(0, 1 - s.alongM / step.lengthM) : 1;
  let rem = step.durationS * frac;
  for (let i = s.stepIndex + 1; i < s.steps.length; i++) rem += s.steps[i]!.durationS;
  s.remainingS = Math.round(rem);
  s.progress = total > 0 ? Math.min(1, Math.max(0, 1 - rem / total)) : 0;
  if (s.t !== undefined) s.etaISO = new Date(s.t + s.remainingS * 1000).toISOString();

  if (isWalk(step)) {
    const nextTurn = step.turns?.find((tn) => tn.alongM > s.alongM);
    s.distanceToNextActionM = Math.round((nextTurn ? nextTurn.alongM : step.lengthM) - s.alongM);
  } else if (isBoard(step)) {
    s.distanceToNextActionM = s.fix ? Math.round(haversine(s.fix, step.end)) : 0;
  } else {
    s.distanceToNextActionM = Math.round(Math.max(0, step.lengthM - s.alongM));
  }
  return s;
}

export function guidanceReducer(
  state: GuidanceState,
  event: GuidanceEvent,
  config: Partial<GuidanceConfig> = {},
): GuidanceState {
  const cfg = { ...DEFAULT_GUIDANCE_CONFIG, ...config };
  const s: GuidanceState = { ...state, cues: [] };
  if ('t' in event && typeof event.t === 'number') s.t = event.t;

  switch (event.type) {
    case 'fix':
      if (s.steps.length > 0) onFix(s, event.fix, cfg);
      break;
    case 'next': {
      if (s.status === 'arrived') break;
      if (s.stepIndex < s.steps.length - 1) enterStep(s, s.stepIndex + 1, true);
      else arrive(s);
      break;
    }
    case 'previous': {
      if (s.stepIndex > 0) {
        if (s.status === 'arrived') s.status = 'active';
        enterStep(s, s.stepIndex - 1, true);
      }
      break;
    }
    case 'on_board': {
      if (s.status === 'arrived') break;
      const cur = s.steps[s.stepIndex];
      if (!cur || isRide(cur)) break;
      let target = -1;
      for (let i = s.stepIndex; i < s.steps.length; i++) {
        if (isRide(s.steps[i]!)) {
          target = i;
          break;
        }
        if (i > s.stepIndex && !isBoard(s.steps[i]!)) break; // only the very next boarding
      }
      if (target >= 0) {
        enterStep(s, target, true);
        emit(s, 'boarded', {});
      }
      break;
    }
    case 'got_off': {
      const cur = s.steps[s.stepIndex];
      if (cur && isRide(cur) && s.status !== 'arrived') {
        if (s.stepIndex < s.steps.length - 1) enterStep(s, s.stepIndex + 1, true);
        else arrive(s);
      }
      break;
    }
    case 'reroute_done': {
      const fresh = createGuidance(event.steps, s.t);
      fresh.offEpisode = s.offEpisode;
      fresh.weakEpisode = s.weakEpisode;
      fresh.gpsWeak = s.gpsWeak;
      if (s.fix) fresh.fix = s.fix;
      return derive(fresh);
    }
    case 'tick':
      break;
  }
  return derive(s);
}

/** Current step (undefined for an empty trip). */
export function currentStep(state: GuidanceState): Step | undefined {
  return state.steps[state.stepIndex];
}
