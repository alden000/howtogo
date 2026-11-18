/**
 * M5 §B: battery saver decision, power policy, per-leg GPS profile (AC 7), fix gate (AC 7b) and the safety
 * rule (AC 9, D-7): low-battery mode never delays or drops a get-off alert or the arrival message.
 */
import { describe, expect, it } from 'vitest';
import {
  NORMAL_POLICY,
  SAVER_POLICY,
  batterySaver,
  dropRate,
  gateFix,
  gpsProfile,
  initialFixGate,
  isLowBattery,
  powerPolicy,
  shareCadence,
  type FixGateState,
} from '../src/battery';
import { createGuidance, currentStep, guidanceReducer } from '../src/guidance';
import { buildSteps } from '../src/steps';
import { simulateFixes } from '../src/simulate';
import { stopsLeft } from '../src/trip';
import type { Cue, Fix, GuidanceState, Step } from '../src/types';
import { itinerary } from './helpers';

const R = (level: number | null, charging: boolean | null, supported = true) => ({ supported, level, charging });

describe('batterySaver (AC 8, OQ6: ≤ 20 % and not charging)', () => {
  it('Auto: on at ≤ 20 % while not charging, off otherwise', () => {
    expect(batterySaver('auto', R(0.15, false))).toEqual({ active: true, reason: 'battery', autoAvailable: true });
    expect(batterySaver('auto', R(0.2, false)).active).toBe(true);
    expect(batterySaver('auto', R(0.21, false)).active).toBe(false);
    expect(batterySaver('auto', R(0.15, true)).active).toBe(false); // charging
    expect(batterySaver('auto', R(0.15, null)).active).toBe(false); // charging unknown → not "not charging"
    expect(batterySaver('auto', R(null, false)).active).toBe(false);
  });

  it('no Battery API (iOS, Firefox): Auto behaves like Off and says so', () => {
    expect(batterySaver('auto', R(0.05, false, false))).toEqual({ active: false, reason: null, autoAvailable: false });
    expect(isLowBattery(R(0.05, false, false))).toBe(false);
  });

  it('On / Off override the battery', () => {
    expect(batterySaver('on', R(0.9, true))).toEqual({ active: true, reason: 'setting', autoAvailable: true });
    expect(batterySaver('off', R(0.05, false)).active).toBe(false);
    expect(batterySaver('on', R(null, null, false))).toMatchObject({ active: true, autoAvailable: false });
  });
});

describe('powerPolicy (AC 8)', () => {
  it('saver: pocket 20 s, no map animations, render on camera change, share 30 s / 120 s', () => {
    expect(powerPolicy(true)).toEqual({ pocketIdleMs: 20_000, mapAnimations: false, mapRenderOnCameraChangeOnly: true, shareMovingMs: 30_000, shareStillMs: 120_000 });
    expect(powerPolicy(false)).toEqual({ pocketIdleMs: 45_000, mapAnimations: true, mapRenderOnCameraChangeOnly: false, shareMovingMs: 15_000, shareStillMs: 60_000 });
    expect(powerPolicy(true)).toBe(SAVER_POLICY);
    expect(powerPolicy(false)).toBe(NORMAL_POLICY);
  });

  it('Help keeps the normal share cadence in saver mode (D-7)', () => {
    expect(shareCadence(true, 'help')).toEqual({ movingMs: 15_000, stillMs: 60_000 });
    expect(shareCadence(true, 'travelling')).toEqual({ movingMs: 30_000, stillMs: 120_000 });
    expect(shareCadence(false, 'travelling')).toEqual({ movingMs: 15_000, stillMs: 60_000 });
  });
});

const step = (kind: string, mode?: string) => ({ kind, mode }) as unknown as Step;

describe('gpsProfile per leg (AC 7, AC 8)', () => {
  it('walk 2 s / wait 5 s, high accuracy, in both modes', () => {
    for (const saver of [false, true]) {
      expect(gpsProfile(step('walk'), null, saver)).toEqual({ intervalMs: 2000, highAccuracy: true, leg: 'walk' });
      expect(gpsProfile(step('board_bus', 'bus'), null, saver)).toEqual({ intervalMs: 5000, highAccuracy: true, leg: 'wait' });
      expect(gpsProfile(undefined, null, saver).intervalMs).toBe(2000);
    }
  });

  it('ride: low accuracy only with more than 3 stops before the alighting stop', () => {
    // stopsLeft counts the alighting stop: 5 left = 4 before it → middle.
    expect(gpsProfile(step('ride_bus', 'bus'), 5)).toEqual({ intervalMs: 5000, highAccuracy: false, leg: 'ride-middle' });
    expect(gpsProfile(step('ride_bus', 'bus'), 4)).toEqual({ intervalMs: 5000, highAccuracy: true, leg: 'ride' });
    expect(gpsProfile(step('ride_bus', 'bus'), 3)).toEqual({ intervalMs: 5000, highAccuracy: true, leg: 'ride' });
    expect(gpsProfile(step('ride_bus', 'bus'), 2)).toEqual({ intervalMs: 2000, highAccuracy: true, leg: 'ride-end' });
    expect(gpsProfile(step('ride_train', 'train'), 9)).toEqual({ intervalMs: 10_000, highAccuracy: false, leg: 'ride-middle' });
    expect(gpsProfile(step('ride_train', 'train'), 1)).toEqual({ intervalMs: 2000, highAccuracy: true, leg: 'ride-end' });
  });

  it('saver widens only the middle-of-ride interval to 10 s', () => {
    expect(gpsProfile(step('ride_bus', 'bus'), 8, true)).toEqual({ intervalMs: 10_000, highAccuracy: false, leg: 'ride-middle' });
    expect(gpsProfile(step('ride_bus', 'bus'), 4, true)).toEqual(gpsProfile(step('ride_bus', 'bus'), 4, false));
    expect(gpsProfile(step('ride_bus', 'bus'), 2, true)).toEqual(gpsProfile(step('ride_bus', 'bus'), 2, false));
  });
});

describe('fix gate (AC 7b)', () => {
  it('drops fixes faster than the interval; jitter within 10 % passes', () => {
    let s: FixGateState = initialFixGate();
    const passes: boolean[] = [];
    for (const t of [0, 1000, 1900, 2000, 3000, 3700, 5000]) {
      const r = gateFix(s, t, 2000);
      passes.push(r.pass);
      s = r.state;
    }
    expect(passes).toEqual([true, false, true, false, false, true, false]);
    expect(s).toMatchObject({ accepted: 3, dropped: 4 });
  });

  it('a 1 Hz stream on a 5 s profile keeps one fix in five (drop rate 0.8)', () => {
    let s = initialFixGate();
    for (let t = 0; t < 100_000; t += 1000) s = gateFix(s, t, 5000).state;
    expect(dropRate(s)).toBeCloseTo(0.8, 2);
  });

  it('a clock going backwards never blocks the stream', () => {
    const s = gateFix(gateFix(initialFixGate(), 10_000, 2000).state, 5000, 2000);
    expect(s.pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// AC 9 — "never degraded": the bus-only replay through the gated adapter, normal vs battery saver.
const ALERTS = new Set<Cue['type']>(['get_off_next_stop', 'get_off_now', 'arrived_destination', 'off_route']);

interface Replay {
  alerts: { type: string; stepIndex: number; t: number }[];
  profiles: Set<string>;
  gate: FixGateState;
  final: GuidanceState;
}

function replay(fixes: Fix[], steps: Step[], start: number, saver: boolean): Replay {
  let state = createGuidance(steps, start);
  let gate = initialFixGate();
  let left: number | null = null;
  let lastStep = -1;
  const alerts: Replay['alerts'] = [];
  const profiles = new Set<string>();
  for (const fix of fixes) {
    const cur = currentStep(state);
    if (state.stepIndex !== lastStep) {
      lastStep = state.stepIndex;
      left = null;
    }
    if (cur?.kind.startsWith('ride')) left = stopsLeft(cur, state.alongM, left);
    const p = gpsProfile(cur, cur?.kind.startsWith('ride') ? left : null, saver);
    profiles.add(`${p.leg}:${p.intervalMs}:${p.highAccuracy ? 'hi' : 'lo'}`);
    const g = gateFix(gate, fix.t, p.intervalMs);
    gate = g.state;
    if (!g.pass) continue;
    state = guidanceReducer(state, { type: 'fix', fix });
    for (const c of state.cues) if (ALERTS.has(c.type)) alerts.push({ type: c.type, stepIndex: c.stepIndex, t: fix.t });
  }
  return { alerts, profiles, gate, final: state };
}

for (const [name, label] of [
  ['toaPayohToTTSH', 'bus-only replay (AC 9)'],
  ['bishanToRafflesPlace', 'MRT replay, 9 stops (long ride: the middle-of-ride rule applies)'],
] as const) {
  describe(`AC 9: low-battery mode gives the same alerts at the same time (± one fix) — ${label}`, () => {
    const it0 = itinerary(name);
    const steps = buildSteps(it0, 'zh');
    // The device delivers 1 Hz fixes; the gate thins them per the leg profile.
    const fixes = simulateFixes(it0, { seed: 3, intervalS: 1, jitterM: 3 });
    const normal = replay(fixes, steps, it0.startTime, false);
    const saver = replay(fixes, steps, it0.startTime, true);

    it('both runs arrive', () => {
      expect(normal.final.status).toBe('arrived');
      expect(saver.final.status).toBe('arrived');
    });

    it('identical alert sequence: get-off next stop, get-off now, arrival (no off-route in either)', () => {
      const seq = (r: Replay) => r.alerts.map((a) => `${a.stepIndex}:${a.type}`);
      expect(seq(saver)).toEqual(seq(normal));
      expect(seq(normal)).toEqual(expect.arrayContaining([expect.stringMatching(/get_off_next_stop$/), expect.stringMatching(/get_off_now$/), expect.stringMatching(/arrived_destination$/)]));
      expect(seq(normal).some((s) => s.endsWith('off_route'))).toBe(false);
    });

    it('each alert fires within one fix interval of normal mode (the end-of-ride profile, 2 s)', () => {
      normal.alerts.forEach((a, i) => {
        expect(Math.abs(saver.alerts[i]!.t - a.t), `${a.type}`).toBeLessThanOrEqual(2000);
      });
    });

    it('walk legs are never thinned below 2 s and stay high-accuracy in both modes', () => {
      for (const r of [normal, saver]) expect([...r.profiles].filter((p) => p.startsWith('walk'))).toEqual(['walk:2000:hi']);
      expect(saver.gate.dropped).toBeGreaterThanOrEqual(normal.gate.dropped);
    });

    if (name === 'bishanToRafflesPlace') {
      it('the middle of the long ride runs at low accuracy, the last stops at 2 s high accuracy', () => {
        for (const r of [normal, saver]) {
          expect([...r.profiles]).toContain('ride-middle:10000:lo');
          expect([...r.profiles]).toContain('ride-end:2000:hi');
        }
      });
    }
  });
}
