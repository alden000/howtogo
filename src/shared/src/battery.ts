/**
 * M5 §B battery logic — pure functions only (no timers, no platform), shared by the trip runtime and tests.
 *
 *  - `batterySaver(pref, reading)`: is low-battery mode on? Auto = battery ≤ 20 % AND not charging (OQ6),
 *    where the Battery Status API exists; where it doesn't (iOS, Firefox) Auto behaves like Off (AC 8).
 *  - `powerPolicy(active)`: what low-battery mode changes — pocket view after 20 s instead of 45 s, no map
 *    animations (render on camera change only), share cadence 30 s moving / 120 s still (AC 8).
 *  - `gpsProfile(step, stopsLeft, active)`: the M2 location profile per leg (walk 2 s, wait 5 s, ride 5 s bus /
 *    10 s train, last 2 stops 2 s) plus the web rules of AC 7: `highAccuracy: false` only in the MIDDLE of a
 *    ride (more than 3 stops before the alighting stop), and battery saver widens only that middle-of-ride
 *    interval to 10 s.
 *  - `FixGate`: drops fixes that arrive faster than the profile interval before they reach the runtime, the
 *    map or the share (the web cannot set a watch interval).
 *
 * SAFETY (D-7, AC 9): nothing here may delay or drop a get-off alert, Help or the arrival message. That is
 * why battery saver never touches walk legs (off-route detection), boarding, or the last stops of a ride
 * (≤ 3 stops left: full accuracy, 2–5 s fixes), and why alert/Help/arrival paths never consult this module.
 * `test/battery.test.ts` replays the bus-only trip in both modes and asserts the same alert sequence and
 * timing (± one fix).
 */
import type { Step } from './types';

export type BatterySaverPref = 'auto' | 'on' | 'off';

/** What `Platform.battery` reports. `supported: false` when the Battery Status API is missing. */
export interface BatteryReading {
  supported: boolean;
  /** 0..1, or null when unknown. */
  level: number | null;
  /** null when unknown. */
  charging: boolean | null;
}

/** OQ6 (Director): low battery = ≤ 20 % and not charging. */
export const LOW_BATTERY_LEVEL = 0.2;

export type BatterySaverReason = 'setting' | 'battery' | null;

export interface BatterySaverState {
  /** Low-battery mode is on (drives `powerPolicy` and the H5 leaf chip). */
  active: boolean;
  /** Why: switched on in Settings, or Auto on a low battery. */
  reason: BatterySaverReason;
  /** False where Auto can never trigger (no Battery API): Settings says so (AC 8). */
  autoAvailable: boolean;
}

export function isLowBattery(r: BatteryReading): boolean {
  return r.supported && r.level !== null && r.level <= LOW_BATTERY_LEVEL && r.charging === false;
}

export function batterySaver(pref: BatterySaverPref, reading: BatteryReading): BatterySaverState {
  const autoAvailable = reading.supported;
  if (pref === 'on') return { active: true, reason: 'setting', autoAvailable };
  if (pref === 'off') return { active: false, reason: null, autoAvailable };
  const low = isLowBattery(reading);
  return { active: low, reason: low ? 'battery' : null, autoAvailable };
}

export interface PowerPolicy {
  /** Pocket view after this long without a touch (normal 45 s, saver 20 s). */
  pocketIdleMs: number;
  /** Map camera easing/pulse animations allowed. */
  mapAnimations: boolean;
  /** Repaint the map only when the camera changes (not on every fix). */
  mapRenderOnCameraChangeOnly: boolean;
  /** Live-share cadence while moving / standing still. */
  shareMovingMs: number;
  shareStillMs: number;
}

export const NORMAL_POLICY: PowerPolicy = Object.freeze({
  pocketIdleMs: 45_000,
  mapAnimations: true,
  mapRenderOnCameraChangeOnly: false,
  shareMovingMs: 15_000,
  shareStillMs: 60_000,
});

export const SAVER_POLICY: PowerPolicy = Object.freeze({
  pocketIdleMs: 20_000,
  mapAnimations: false,
  mapRenderOnCameraChangeOnly: true,
  shareMovingMs: 30_000,
  shareStillMs: 120_000,
});

export function powerPolicy(active: boolean): PowerPolicy {
  return active ? SAVER_POLICY : NORMAL_POLICY;
}

/**
 * Share cadence for a status. `help` is never throttled by battery saving (D-7): the Help share keeps the
 * normal cadence, and its first send / status change always goes out at once (the runtime's 3 s floor and
 * the help bypass stay untouched).
 */
export function shareCadence(active: boolean, status: 'travelling' | 'paused' | 'arrived' | 'help'): { movingMs: number; stillMs: number } {
  const p = status === 'help' ? NORMAL_POLICY : powerPolicy(active);
  return { movingMs: p.shareMovingMs, stillMs: p.shareStillMs };
}

export interface GpsProfile {
  intervalMs: number;
  highAccuracy: boolean;
  /** Which leg rule applied (logs/tests): walk | wait | ride | ride-middle | ride-end. */
  leg: 'walk' | 'wait' | 'ride' | 'ride-middle' | 'ride-end';
}

/** A ride counts as "middle" while MORE than this many stops are left before the alighting stop (AC 7). */
export const RIDE_MIDDLE_MIN_STOPS = 3;
/** Battery saver: the middle-of-ride interval (AC 8). */
export const SAVER_RIDE_INTERVAL_MS = 10_000;

const isRide = (s: Step | undefined) => !!s && s.kind.startsWith('ride');

/**
 * AC 7/8 location profile for one moment of the trip. `stopsLeftN` counts the alighting stop
 * (`trip.stopsLeft`); "more than 3 stops before the alighting stop" = stopsLeftN − 1 > 3.
 */
export function gpsProfile(step: Step | undefined, stopsLeftN: number | null, saver = false): GpsProfile {
  if (!step || step.kind.startsWith('walk')) return { intervalMs: 2000, highAccuracy: true, leg: 'walk' };
  if (step.kind.startsWith('board')) return { intervalMs: 5000, highAccuracy: true, leg: 'wait' };
  if (isRide(step)) {
    if (stopsLeftN !== null && stopsLeftN <= 2) return { intervalMs: 2000, highAccuracy: true, leg: 'ride-end' };
    const base = step.mode === 'bus' ? 5000 : 10_000;
    const middle = stopsLeftN !== null && stopsLeftN - 1 > RIDE_MIDDLE_MIN_STOPS;
    if (middle) return { intervalMs: saver ? Math.max(base, SAVER_RIDE_INTERVAL_MS) : base, highAccuracy: false, leg: 'ride-middle' };
    return { intervalMs: base, highAccuracy: true, leg: 'ride' };
  }
  // Transfers, arrival and anything else: full accuracy, walk cadence.
  return { intervalMs: 2000, highAccuracy: true, leg: 'walk' };
}

/**
 * Fixes closer together than the profile interval are dropped (AC 7b). A fix a little early (≤ 10 % of the
 * interval, GPS jitter) still passes, so a steady 2 s stream on a 2 s profile is never thinned.
 */
export const FIX_GATE_TOLERANCE = 0.1;

export interface FixGateState {
  /** Time (fix.t) of the last fix let through, or null. */
  lastT: number | null;
  accepted: number;
  dropped: number;
}

export const initialFixGate = (): FixGateState => ({ lastT: null, accepted: 0, dropped: 0 });

/** Pure gate step: returns whether this fix passes and the next state. A profile change never blocks the next fix forever. */
export function gateFix(s: FixGateState, fixT: number, intervalMs: number): { pass: boolean; state: FixGateState } {
  if (s.lastT === null || fixT - s.lastT >= intervalMs * (1 - FIX_GATE_TOLERANCE) || fixT < s.lastT) {
    return { pass: true, state: { lastT: fixT, accepted: s.accepted + 1, dropped: s.dropped } };
  }
  return { pass: false, state: { ...s, dropped: s.dropped + 1 } };
}

/** Drop rate of a gate (0..1), for logs and the AC 7 test. */
export function dropRate(s: FixGateState): number {
  const n = s.accepted + s.dropped;
  return n ? s.dropped / n : 0;
}
