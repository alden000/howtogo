import { describe, expect, it } from 'vitest';
import { createGuidance, guidanceReducer } from '../src/guidance';
import { buildSteps } from '../src/steps';
import { injectDeviation, simulateFixes, type SimulateOptions } from '../src/simulate';
import { toSharePayload } from '../src/share';
import { cueToSpeech } from '../src/speech';
import { FIXTURES, type FixtureName } from './fixtures';
import { itineraries, itinerary } from './helpers';
import type { Cue, Fix, GuidanceEvent, GuidanceState, Itinerary } from '../src/types';

interface Run {
  state: GuidanceState;
  cues: Cue[];
  states: GuidanceState[];
}

function run(it: Itinerary, fixes: Fix[], extra: (i: number) => GuidanceEvent[] = () => []): Run {
  let state = createGuidance(buildSteps(it, 'en'), it.startTime);
  const cues: Cue[] = [...state.cues];
  const states: GuidanceState[] = [];
  fixes.forEach((fix, i) => {
    for (const ev of [{ type: 'fix', fix } as GuidanceEvent, ...extra(i)]) {
      state = guidanceReducer(state, ev);
      cues.push(...state.cues);
    }
    states.push(state);
  });
  return { state, cues, states };
}

const types = (cues: Cue[]) => cues.filter((c) => c.type !== 'step_changed').map((c) => c.type);

describe('guidance over simulated trips (all fixtures, several seeds)', () => {
  const cases: [FixtureName, number][] = [];
  for (const name of Object.keys(FIXTURES) as FixtureName[]) {
    itineraries(name).forEach((_, i) => cases.push([name, i]));
  }

  for (const [name, idx] of cases) {
    for (const opts of [{ seed: 1, jitterM: 3 }, { seed: 42, jitterM: 8 }, { seed: 7, jitterM: 0, intervalS: 5 }] as SimulateOptions[]) {
      it(`${name}#${idx} seed=${opts.seed} jitter=${opts.jitterM}`, () => {
        const it = itinerary(name, idx);
        const { state, cues } = run(it, simulateFixes(it, opts));
        expect(state.status).toBe('arrived');
        expect(state.progress).toBe(1);
        expect(state.remainingS).toBe(0);

        const t = types(cues);
        expect(t.filter((x) => x === 'arrived_destination')).toHaveLength(1);
        expect(t.at(-1)).toBe('arrived_destination');
        expect(t).not.toContain('off_route');
        expect(t).not.toContain('gps_weak');
        // dedupe: no cue id twice (step_changed aside)
        const ids = cues.filter((c) => c.type !== 'step_changed').map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);

        const steps = state.steps;
        for (const ride of steps.filter((s) => s.kind.startsWith('ride'))) {
          const mine = cues.filter((c) => c.stepId === ride.id).map((c) => c.type);
          expect(mine).toContain('boarded');
          const next = mine.indexOf('get_off_next_stop');
          const now = mine.indexOf('get_off_now');
          expect(next).toBeGreaterThanOrEqual(0);
          expect(now).toBeGreaterThan(next);
        }
        expect(t.filter((x) => x === 'transfer')).toHaveLength(it.transfers);
        // every step was visited in order
        const visited = cues.filter((c) => c.type === 'step_changed').map((c) => c.stepIndex);
        expect(visited).toEqual(steps.map((_, i) => i));
      });
    }
  }

  it('exact cue script: Toa Payoh → TTSH by bus 139', () => {
    const it = itinerary('toaPayohToTTSH');
    const { cues } = run(it, simulateFixes(it, { seed: 3 }));
    expect(cues.map((c) => `${c.stepIndex}:${c.type}`)).toEqual([
      '0:step_changed',
      '0:turn',
      '0:approaching_stop',
      '0:arrived_at_stop',
      '1:step_changed',
      '2:step_changed',
      '2:boarded',
      '2:get_off_next_stop',
      '2:get_off_now',
      '3:step_changed',
      '3:arrived_destination',
    ]);
    const nextStop = cues.find((c) => c.type === 'get_off_next_stop')!;
    expect(cueToSpeech(nextStop, 'zh-CN')).toBe('下一站下车。');
    expect(cueToSpeech(nextStop, 'en')).toBe('Get off at the next stop.');
    expect(cues.find((c) => c.type === 'get_off_now')!.priority).toBe('high');
  });

  it('get_off_next_stop fires only after passing the second-to-last stop', () => {
    const it = itinerary('toaPayohToTTSH');
    const r = run(it, simulateFixes(it, { seed: 5, jitterM: 0 }));
    const ride = r.state.steps[2]!;
    const lastIntermediate = ride.stops!.at(-2)!;
    const firstIdx = r.states.findIndex((s) => s.cues.some((c) => c.type === 'get_off_next_stop'));
    const atCue = r.states[firstIdx]!;
    expect(atCue.alongM).toBeGreaterThan(lastIntermediate.alongM);
    expect(r.states[firstIdx - 1]!.stepIndex === 2 ? r.states[firstIdx - 1]!.alongM : 0).toBeLessThan(
      lastIntermediate.alongM + 25 + 1,
    );
  });

  it('remaining time falls and ETA is reported as ISO', () => {
    const it = itinerary('bishanToRafflesPlace');
    const { states } = run(it, simulateFixes(it, { seed: 2 }));
    const a = states[10]!;
    const b = states[Math.floor(states.length / 2)]!;
    expect(a.remainingS).toBeGreaterThan(b.remainingS);
    expect(b.progress).toBeGreaterThan(a.progress);
    expect(b.progress).toBeLessThan(1);
    expect(b.etaISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(a.distanceToNextActionM).toBeGreaterThan(0);
  });
});

describe('off-route detection', () => {
  const it0 = itinerary('bishanToRafflesPlace');
  const base = simulateFixes(it0, { seed: 11, jitterM: 2 });
  const lastWalkStart = base.length - 130; // inside the final ~320 m walk (≈160 fixes)

  it('needs 3 consecutive good fixes > 50 m from the path, then recovers with hysteresis', () => {
    const fixes = injectDeviation(base, lastWalkStart, 10, 120, 90);
    const r = run(it0, fixes);
    const t = types(r.cues);
    expect(t.filter((x) => x === 'off_route')).toHaveLength(1);
    expect(t.filter((x) => x === 'back_on_route')).toHaveLength(1);
    expect(t.indexOf('off_route')).toBeLessThan(t.indexOf('back_on_route'));
    expect(r.state.status).toBe('arrived');
    // declared on the 3rd far fix, not before
    expect(r.states[lastWalkStart + 1]!.status).toBe('active');
    expect(r.states[lastWalkStart + 2]!.status).toBe('off_route');
    expect(toSharePayload(r.states[lastWalkStart + 5]!)!.status).toBe('travelling'); // Worker contract: off route is still travelling
  });

  it('two far fixes are not enough; poor-accuracy far fixes do not count', () => {
    const two = injectDeviation(base, lastWalkStart, 2, 120, 90);
    expect(types(run(it0, two).cues)).not.toContain('off_route');
    const blurry = injectDeviation(base, lastWalkStart, 10, 120, 90).map((f, i) =>
      i >= lastWalkStart && i < lastWalkStart + 10 ? { ...f, acc: 80 } : f,
    );
    expect(types(run(it0, blurry).cues)).not.toContain('off_route');
  });

  it('transit tolerance is 150 m: 100 m drift on the train is fine, 400 m is off-route', () => {
    const rideFixIdx = Math.floor(base.length / 2); // mid-ride
    const small = injectDeviation(base, rideFixIdx, 10, 100, 90);
    expect(types(run(it0, small).cues)).not.toContain('off_route');
    const big = injectDeviation(base, rideFixIdx, 10, 400, 90);
    const r = run(it0, big);
    expect(types(r.cues)).toContain('off_route');
    expect(r.state.status).toBe('arrived');
  });

  it('a second deviation is a new episode with a new cue', () => {
    let fixes = injectDeviation(base, lastWalkStart, 8, 120, 90);
    fixes = injectDeviation(fixes, lastWalkStart + 60, 8, 120, 270);
    const t = types(run(it0, fixes).cues);
    expect(t.filter((x) => x === 'off_route')).toHaveLength(2);
    expect(t.filter((x) => x === 'back_on_route')).toHaveLength(2);
  });

  it('reroute_done swaps in new steps and restarts guidance', () => {
    const fixes = injectDeviation(base, lastWalkStart, 10, 120, 90);
    let s = run(it0, fixes.slice(0, lastWalkStart + 5)).state;
    expect(s.status).toBe('off_route');
    const fresh = buildSteps(itinerary('toaPayohToTTSH'), 'en');
    s = guidanceReducer(s, { type: 'reroute_done', steps: fresh, t: 1 });
    expect(s.status).toBe('active');
    expect(s.stepIndex).toBe(0);
    expect(s.steps).toBe(fresh);
    expect(s.cues.map((c) => c.type)).toEqual(['step_changed']);
    expect(s.offEpisode).toBe(1);
  });
});

describe('GPS weak handling', () => {
  const it0 = itinerary('toaPayohToTTSH');
  const base = simulateFixes(it0, { seed: 4 });

  it('ignores fixes with acc > 100 m and emits gps_weak once per weak spell', () => {
    const fixes = base.map((f, i) =>
      (i >= 20 && i < 40) || (i >= 200 && i < 205) ? { ...f, acc: 150, lat: f.lat + 0.01 } : f,
    );
    const r = run(it0, fixes);
    const weak = r.cues.filter((c) => c.type === 'gps_weak');
    expect(weak).toHaveLength(2);
    expect(new Set(weak.map((c) => c.id)).size).toBe(2);
    expect(types(r.cues)).not.toContain('off_route');
    // position frozen at the last good fix during the spell
    expect(r.states[30]!.fix).toEqual(fixes[19]);
    expect(r.states[30]!.gpsWeak).toBe(true);
    expect(toSharePayload(r.states[30]!)!.status).toBe('travelling'); // Worker contract: weak GPS is still travelling
    expect(r.states[45]!.gpsWeak).toBe(false);
    expect(r.state.status).toBe('arrived');
    expect(cueToSpeech(weak[0]!, 'zh-CN')).toBe('位置不太准，跟着站牌走。');
  });

  it('NaN coordinates are treated as weak, not as a position', () => {
    let s = createGuidance(buildSteps(it0, 'en'));
    s = guidanceReducer(s, { type: 'fix', fix: { lat: NaN, lng: NaN, acc: 5, t: 1 } });
    expect(s.cues.map((c) => c.type)).toEqual(['gps_weak']);
    expect(s.fix).toBeUndefined();
  });
});

describe('manual events and dedupe', () => {
  const it0 = itinerary('toaPayohToTTSH');

  it('repeating the same fix never repeats a cue', () => {
    const fixes = simulateFixes(it0, { seed: 9 });
    const stuck = fixes.flatMap((f, i) => (i % 25 === 0 ? [f, f, f, f] : [f]));
    const a = types(run(it0, fixes).cues);
    const b = types(run(it0, stuck).cues);
    expect(b).toEqual(a);
  });

  it('"I\'m on the bus" skips waiting; "next"/"previous" re-read the step but do not repeat cues', () => {
    let s = createGuidance(buildSteps(it0, 'en'), 0);
    s = guidanceReducer(s, { type: 'on_board', t: 1 });
    expect(s.stepIndex).toBe(2);
    expect(s.onBoard).toBe(true);
    expect(s.cues.map((c) => c.type)).toEqual(['step_changed', 'boarded']);
    s = guidanceReducer(s, { type: 'previous', t: 2 });
    expect(s.stepIndex).toBe(1);
    expect(s.cues.map((c) => c.type)).toEqual(['step_changed']);
    s = guidanceReducer(s, { type: 'on_board', t: 3 });
    expect(s.cues.map((c) => c.type)).toEqual(['step_changed']); // boarded already said for this step
    s = guidanceReducer(s, { type: 'got_off', t: 4 });
    expect(s.stepIndex).toBe(3);
    s = guidanceReducer(s, { type: 'next', t: 5 });
    expect(s.status).toBe('arrived');
    expect(s.cues.map((c) => c.type)).toEqual(['arrived_destination']);
    s = guidanceReducer(s, { type: 'next', t: 6 });
    expect(s.cues).toEqual([]);
    s = guidanceReducer(s, { type: 'tick', t: 7 });
    expect(s.etaISO).toBe(new Date(7).toISOString());
  });

  it('empty trip is immediately arrived; reducer is pure (input state untouched)', () => {
    const empty = createGuidance([]);
    expect(empty.status).toBe('arrived');
    const s0 = createGuidance(buildSteps(it0, 'en'), 0);
    const snapshot = JSON.stringify(s0);
    guidanceReducer(s0, { type: 'fix', fix: simulateFixes(it0)[0]! });
    guidanceReducer(s0, { type: 'next' });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});

describe('share payload', () => {
  it('is null before a fix, then carries position, ETA, step text and status', () => {
    const it0 = itinerary('angMoKioToNovena');
    let s = createGuidance(buildSteps(it0, 'zh-CN'), it0.startTime);
    expect(toSharePayload(s)).toBeNull();
    s = guidanceReducer(s, { type: 'fix', fix: { lat: 1.36721, lng: 103.84381, acc: 7.4, heading: 135.6, speed: 1.04, t: it0.startTime } });
    const p = toSharePayload(s)!;
    expect(p).toMatchObject({ lat: 1.36721, lng: 103.84381, acc: 7, heading: 136, speed: 1, status: 'travelling', updatedAt: it0.startTime });
    expect(p.etaISO).toMatch(/Z$/);
    expect(p.stepText).toBe('步行到巴士站 Blk 215（54261）');
    expect(Object.keys(p).sort()).toEqual(['acc', 'etaISO', 'heading', 'lat', 'lng', 'speed', 'status', 'stepText', 'updatedAt']);
  });
});

describe('simulator', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const it0 = itinerary('toaPayohToTTSH');
    expect(simulateFixes(it0, { seed: 1 })).toEqual(simulateFixes(it0, { seed: 1 }));
    expect(simulateFixes(it0, { seed: 1 })).not.toEqual(simulateFixes(it0, { seed: 2 }));
    const f = simulateFixes(it0, { seed: 1, intervalS: 3 });
    expect(f[1]!.t - f[0]!.t).toBe(3000);
    expect(f.every((x) => x.acc === 8)).toBe(true);
  });
});
