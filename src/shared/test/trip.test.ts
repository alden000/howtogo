import { describe, expect, it } from 'vitest';
import {
  ALERT_ESCALATE_MS,
  alertDueAt,
  alertReducer,
  alertSecondLine,
  buildSteps,
  createGuidance,
  enqueueSpeech,
  guidanceReducer,
  hapticForCues,
  HAPTIC_PATTERNS,
  isManualMode,
  journeyEtaMs,
  journeyProgress,
  locationProfile,
  manualDueAt,
  mrtEstimate,
  normalizeDwell,
  pocketDueAt,
  pocketReducer,
  resumeDecision,
  simulateFixes,
  stopsLeft,
  takeSpeech,
  validateJourney,
  voiceLine,
  type AlertState,
  type Cue,
  type PocketContext,
  type Step,
} from '../src';
import { itinerary } from './helpers';

const cue = (type: Cue['type'], stepId = 's3', stop = 'Tan Tock Seng Hosp'): Cue => ({ id: `${stepId}:${type}`, type, priority: 'normal', stepId, stepIndex: 3, params: { stop }, t: 0 });

describe('haptics (6c.13)', () => {
  it('has exactly the six canonical names with the guide patterns', () => {
    expect(Object.keys(HAPTIC_PATTERNS).sort()).toEqual(['arrive', 'attention', 'confirm', 'gentle', 'getoff', 'tick']);
    expect(HAPTIC_PATTERNS.getoff).toEqual([300, 150, 300, 150, 600]);
    expect(HAPTIC_PATTERNS.tick).toEqual([12]);
  });
  it('one event → the strongest haptic only; silent cues stay silent', () => {
    expect(hapticForCues([{ type: 'step_changed' }, { type: 'boarded' }])).toBe('confirm');
    expect(hapticForCues([{ type: 'arrived_at_stop' }, { type: 'step_changed' }])).toBe('attention');
    expect(hapticForCues([{ type: 'get_off_now' }, { type: 'step_changed' }])).toBe('getoff');
    expect(hapticForCues([{ type: 'off_route' }])).toBe('gentle');
    expect(hapticForCues([{ type: 'arrived_destination' }])).toBe('arrive');
    expect(hapticForCues([{ type: 'gps_weak' }, { type: 'approaching_stop' }])).toBeNull();
  });
});

describe('get-off alert escalation (OQ9)', () => {
  const show = (t: number, kind: 'next' | 'now' = 'next', a: AlertState | null = null) =>
    alertReducer(a, { type: 'cue', cue: cue(kind === 'now' ? 'get_off_now' : 'get_off_next_stop'), mode: 'bus', t });

  it('repeats exactly once, 20 s after it was shown, if not acknowledged', () => {
    const { alert, effect } = show(1000);
    expect(effect).toBe('show');
    expect(alertDueAt(alert)).toBe(1000 + ALERT_ESCALATE_MS);
    expect(alertReducer(alert, { type: 'tick', t: 1000 + ALERT_ESCALATE_MS - 1 }).effect).toBeNull();
    const esc = alertReducer(alert, { type: 'tick', t: 1000 + ALERT_ESCALATE_MS });
    expect(esc.effect).toBe('escalate');
    expect(alertDueAt(esc.alert)).toBeNull();
    expect(alertReducer(esc.alert, { type: 'tick', t: 1000 + 10 * ALERT_ESCALATE_MS }).effect).toBeNull();
  });
  it('ack removes it; no repeat afterwards', () => {
    const { alert } = show(0);
    const r = alertReducer(alert, { type: 'ack', t: 5000 });
    expect(r).toEqual({ alert: null, effect: 'ack' });
    expect(alertReducer(r.alert, { type: 'tick', t: 60_000 }).effect).toBeNull();
  });
  it('ends with the ride step: no repeat after the step changed', () => {
    const { alert } = show(0);
    expect(alertReducer(alert, { type: 'step', stepId: 's3', t: 1 }).alert).toBe(alert);
    const r = alertReducer(alert, { type: 'step', stepId: 's4', t: 10_000 });
    expect(r).toEqual({ alert: null, effect: 'clear' });
    expect(alertReducer(r.alert, { type: 'tick', t: 30_000 }).effect).toBeNull();
  });
  it('H6 grows into H6b with its own single repeat; H6 never follows H6b', () => {
    const a = show(0).alert;
    const g = show(15_000, 'now', a);
    expect(g.effect).toBe('grow');
    expect(g.alert?.kind).toBe('now');
    expect(alertDueAt(g.alert)).toBe(15_000 + ALERT_ESCALATE_MS); // H6's repeat at 20 s is cancelled
    expect(alertReducer(g.alert, { type: 'tick', t: 20_000 }).effect).toBeNull();
    expect(show(16_000, 'next', g.alert)).toEqual({ alert: g.alert, effect: null });
  });
  it('second voice lines', () => {
    expect(alertSecondLine('next', 'bus', 'zh-CN')).toBe('请现在按铃。');
    expect(alertSecondLine('now', 'train', 'en-SG')).toBe('Get off when the doors open. Mind the gap.');
    expect(voiceLine('mrt_prealert', 'zh-CN', { station: 'Novena' })).toBe('大约下一站下车。车停时看站名：Novena。');
  });
});

describe('resume window (OQ5)', () => {
  const H = 3600_000;
  const trip = { startedAt: 0, etaMs: H };
  it('auto-resumes up to ETA + 2 h', () => {
    expect(resumeDecision(trip, H)).toBe('resume');
    expect(resumeDecision(trip, 3 * H)).toBe('resume');
  });
  it('asks after ETA + 2 h', () => {
    expect(resumeDecision(trip, 3 * H + 1)).toBe('ask');
    expect(resumeDecision(trip, 23.9 * H)).toBe('ask');
  });
  it('drops after 24 h, or when already arrived', () => {
    expect(resumeDecision(trip, 24 * H)).toBe('drop');
    expect(resumeDecision({ ...trip, arrived: true }, 1)).toBe('drop');
  });
});

describe('pocket view (OQ7)', () => {
  const walk: PocketContext = { stepKind: 'walk_to_stop', blocked: false, manual: false };
  const s0 = { on: false, since: 0 };
  it('dims after 45 s without a touch on walk/ride steps only', () => {
    expect(pocketDueAt(s0, walk)).toBe(45_000);
    expect(pocketReducer(s0, { type: 'tick', t: 44_999 }, walk).on).toBe(false);
    expect(pocketReducer(s0, { type: 'tick', t: 45_000 }, walk).on).toBe(true);
    const wait = { ...walk, stepKind: 'board_bus' as const };
    expect(pocketReducer(s0, { type: 'tick', t: 90_000 }, wait).on).toBe(false);
    expect(pocketDueAt(s0, wait)).toBeNull();
    expect(pocketReducer(s0, { type: 'tick', t: 90_000 }, { ...walk, stepKind: 'ride_bus' }).on).toBe(true);
  });
  it('a touch or step change restarts the clock; step change keeps it on', () => {
    const touched = pocketReducer(s0, { type: 'touch', t: 30_000 }, walk);
    expect(pocketReducer(touched, { type: 'tick', t: 50_000 }, walk).on).toBe(false);
    expect(pocketDueAt(touched, walk)).toBe(75_000);
    const on = { on: true, since: 0 };
    expect(pocketReducer(on, { type: 'step', t: 60_000 }, walk)).toEqual({ on: true, since: 60_000 });
    expect(pocketReducer(on, { type: 'touch', t: 61_000 }, walk).on).toBe(false);
  });
  it('never during an alert; alerts break through; manual button', () => {
    const blocked = { ...walk, blocked: true };
    expect(pocketReducer(s0, { type: 'tick', t: 100_000 }, blocked).on).toBe(false);
    expect(pocketReducer(s0, { type: 'manual', t: 1 }, blocked).on).toBe(false);
    expect(pocketReducer(s0, { type: 'manual', t: 1 }, walk).on).toBe(true);
    expect(pocketReducer({ on: true, since: 0 }, { type: 'alert', t: 5 }, walk).on).toBe(false);
    expect(pocketReducer({ on: true, since: 0 }, { type: 'tick', t: 5 }, blocked).on).toBe(false);
    expect(pocketReducer(s0, { type: 'manual', t: 1 }, { ...walk, manual: true }).on).toBe(false);
  });
});

describe('manual mode', () => {
  it('denied → manual at once; otherwise after 60 s without a good fix', () => {
    expect(isManualMode({ denied: true, watchingSince: 0 }, 0)).toBe(true);
    expect(manualDueAt({ denied: true, watchingSince: 0 })).toBeNull();
    expect(isManualMode({ denied: false, watchingSince: 0 }, 59_999)).toBe(false);
    expect(isManualMode({ denied: false, watchingSince: 0 }, 60_000)).toBe(true);
    expect(isManualMode({ denied: false, watchingSince: 0, lastGoodFixAt: 50_000 }, 100_000)).toBe(false);
    expect(manualDueAt({ denied: false, watchingSince: 0, lastGoodFixAt: 50_000 })).toBe(110_000);
  });
});

describe('ride helpers', () => {
  const bus = buildSteps(itinerary('toaPayohToTTSH'), 'zh-CN');
  const ride = bus.find((s) => s.kind === 'ride_bus')!;
  it('stops-left counts down as stops are passed, never up, never negative', () => {
    const total = ride.stops!.length;
    expect(stopsLeft(ride, 0)).toBe(total);
    const firstPassed = stopsLeft(ride, ride.stops![0]!.alongM + 30);
    expect(firstPassed).toBe(total - 1);
    expect(stopsLeft(ride, 0, firstPassed)).toBe(firstPassed); // a GPS jump back never counts up
    expect(stopsLeft(ride, ride.lengthM + 999)).toBeGreaterThanOrEqual(1);
    expect(stopsLeft({ ...ride, stops: [] }, 0, 0)).toBe(0);
  });
  it('location profile per leg', () => {
    expect(locationProfile(bus[0], null).intervalMs).toBe(2000);
    expect(locationProfile(bus.find((s) => s.kind === 'board_bus'), null).intervalMs).toBe(5000);
    expect(locationProfile(ride, 5).intervalMs).toBe(5000);
    expect(locationProfile(ride, 2).intervalMs).toBe(2000);
    expect(locationProfile({ ...ride, mode: 'mrt', kind: 'ride_train' } as Step, 6).intervalMs).toBe(10_000);
  });
  it('MRT soft estimate: from the schedule, never below 1, never up; pre-alert at the second-last station', () => {
    const mrt = buildSteps(itinerary('bishanToRafflesPlace'), 'en').find((s) => s.kind === 'ride_train')!;
    expect(mrtEstimate(ride, 0, 0)).toBeNull();
    const n = mrt.stops!.length;
    const e0 = mrtEstimate(mrt, 0, 0)!;
    expect(e0.stopsLeft).toBe(n);
    const late = mrtEstimate(mrt, 0, mrt.durationS * 1000 + 600_000)!;
    expect(late.stopsLeft).toBe(1);
    expect(mrtEstimate(mrt, 0, 0, 2)!.stopsLeft).toBe(2);
    if (n >= 2) {
      expect(e0.preAlertAt).toBeGreaterThan(0);
      expect(e0.preAlertAt!).toBeLessThan(mrt.durationS * 1000);
      expect(mrtEstimate(mrt, 0, e0.preAlertAt!)!.stopsLeft).toBeLessThanOrEqual(2);
    }
  });
});

describe('multi-stop', () => {
  const P = (name: string) => ({ name, lat: 1.3, lng: 103.8 });
  it('validates 1..5 stops and dwell choices', () => {
    expect(validateJourney([P('a')])).toBe('too_few');
    expect(validateJourney([P('a'), P('b')])).toBeNull();
    expect(validateJourney([P('a'), P('b'), P('c'), P('d'), P('e'), P('f')])).toBeNull();
    expect(validateJourney([P('a'), P('b'), P('c'), P('d'), P('e'), P('f'), P('g')])).toBe('too_many');
    expect(normalizeDwell(undefined)).toBe(30);
    expect(normalizeDwell(60)).toBe(60);
    expect(normalizeDwell(45)).toBe(30);
  });
  it('progress across segments and total ETA', () => {
    const places = [P('home'), P('clinic'), P('market'), P('home2')];
    const plans = [
      { durationS: 600, dwellS: 0 },
      { durationS: 600, dwellS: 1800 },
      { durationS: 600, dwellS: 1800 },
    ];
    const p0 = journeyProgress(places, 0, plans, 0.5);
    expect(p0).toMatchObject({ place: 1, places: 3, isLast: false });
    expect(p0.to?.name).toBe('clinic');
    expect(p0.next?.name).toBe('market');
    expect(p0.overall).toBeCloseTo(300 / 5400);
    const w = journeyProgress(places, 1, plans, 0, true);
    expect(w.overall).toBeCloseTo(3000 / 5400);
    const last = journeyProgress(places, 2, plans, 1);
    expect(last.isLast).toBe(true);
    expect(last.overall).toBe(1);
    expect(journeyEtaMs(1000, 0, plans)).toBe(1000 + 4800_000);
    expect(journeyEtaMs(1000, 2, plans)).toBe(1000);
  });
  it('a segment guided on its own ends with arrived_waypoint, not arrived_destination', () => {
    const it0 = itinerary('toaPayohToTTSH');
    const steps = buildSteps(it0, 'zh-CN', { isWaypoint: true, destinationName: 'Clinic' });
    let g = createGuidance(steps, it0.startTime);
    const seen: string[] = [];
    for (const fix of simulateFixes(it0, { seed: 4 })) {
      g = guidanceReducer(g, { type: 'fix', fix });
      seen.push(...g.cues.map((c) => c.type));
    }
    expect(g.status).toBe('arrived');
    expect(seen.at(-1)).toBe('arrived_waypoint');
    expect(seen).not.toContain('arrived_destination');
  });
});

describe('speech queue (AC 23)', () => {
  it('high interrupts and clears; others queue', () => {
    let q = enqueueSpeech([], { text: 'a', priority: 'normal', at: 0 }).queue;
    q = enqueueSpeech(q, { text: 'b', priority: 'low', at: 0 }).queue;
    expect(q.map((x) => x.text)).toEqual(['a', 'b']);
    const h = enqueueSpeech(q, { text: 'now', priority: 'high', at: 0 });
    expect(h).toEqual({ queue: [{ text: 'now', priority: 'high', at: 0 }], interrupt: true });
  });
  it('drops lines older than 10 s that belong to another step', () => {
    const q = [
      { text: 'old other', priority: 'normal' as const, stepId: 's1', at: 0 },
      { text: 'old same', priority: 'normal' as const, stepId: 's2', at: 0 },
    ];
    expect(takeSpeech(q, 9_000, 's2').item?.text).toBe('old other');
    const r = takeSpeech(q, 10_001, 's2');
    expect(r.item?.text).toBe('old same');
    expect(r.dropped).toBe(1);
    expect(takeSpeech([{ text: 'free', priority: 'low', at: 0 }], 99_999, 's9').item?.text).toBe('free');
  });
});
