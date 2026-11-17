import { describe, expect, it } from 'vitest';
import { cueToSpeech } from '../src/speech';
import { STRINGS, t } from '../src/i18n/steps';
import { chooseSegmentItinerary, planJourney } from '../src/journey';
import { buildJourneySteps } from '../src/steps';
import { createGuidance, guidanceReducer } from '../src/guidance';
import { simulateFixes } from '../src/simulate';
import { FIXTURES, FIXTURE_T0 } from './fixtures';
import type { Cue, CueType, Place } from '../src/types';

const cue = (type: CueType, params: Cue['params'] = {}): Cue => ({
  id: type,
  type,
  priority: 'normal',
  stepId: 's',
  stepIndex: 0,
  params,
  t: 0,
});

describe('cueToSpeech', () => {
  it('core phrases', () => {
    expect(cueToSpeech(cue('get_off_next_stop', { mode: 'train' }), 'zh-CN')).toBe('下一站下车。');
    expect(cueToSpeech(cue('get_off_next_stop', { mode: 'train' }), 'en-SG')).toBe('Get off at the next stop.');
    expect(cueToSpeech(cue('get_off_now'), 'zh')).toBe('现在下车。');
    expect(cueToSpeech(cue('turn', { direction: 'left', street: 'Lorong 1' }), 'en')).toBe('Turn left onto Lorong 1.');
    expect(cueToSpeech(cue('turn', { direction: 'right' }), 'en')).toBe('Turn right.');
    expect(cueToSpeech(cue('transfer', { mode: 'bus', route: '97' }), 'zh-CN')).toBe('请在这里换乘 97 号巴士。');
    expect(cueToSpeech(cue('arrived_at_stop', { stop: 'Toa Payoh Int' }), 'en')).toBe('You have reached Toa Payoh Int.');
  });

  it('every cue type speaks a clean sentence in both languages', () => {
    const all: CueType[] = [
      'approaching_stop', 'arrived_at_stop', 'boarded', 'get_off_next_stop', 'get_off_now', 'turn', 'transfer',
      'arrived_waypoint', 'arrived_destination', 'off_route', 'back_on_route', 'gps_weak', 'step_changed',
    ];
    const params = { stop: 'X', dest: 'Y', line: 'Z', route: '1', text: 'Go', direction: 'uturn', mode: 'bus' };
    for (const lang of ['zh-CN', 'en-SG'] as const) {
      for (const type of all) {
        const s = cueToSpeech(cue(type, params), lang);
        expect(s.length, `${lang} ${type}`).toBeGreaterThan(1);
        expect(s).not.toMatch(/[{}[\]]|cue\./);
      }
    }
  });

  it('zh and en tables have the same keys; templates handle plurals and optional parts', () => {
    expect(Object.keys(STRINGS['zh-CN']).sort()).toEqual(Object.keys(STRINGS['en-SG']).sort());
    expect(t('en', 'step.ride_bus', { n: 1, stop: 'A' })).toBe('Ride 1 stop. Get off at A');
    expect(t('en', 'step.board_train', { line: 'Circle Line' })).toBe('Take the Circle Line');
    expect(t('en', 'no.such.key')).toBe('no.such.key');
  });
});

describe('planJourney (multi-stop)', () => {
  const A: Place = { name: 'Home', lat: 1.3672, lng: 103.8438 };
  const B: Place = { name: 'Tan Tock Seng Hospital', lat: 1.32135, lng: 103.8465, dwellMin: 45 };
  const C: Place = { name: 'Raffles Place', lat: 1.2812, lng: 103.8514 };

  const fetchPlan = async (from: Place, to: Place) => {
    if (from === A && to === B) return FIXTURES.angMoKioToNovena;
    if (from === B && to === C) return FIXTURES.bishanToRafflesPlace; // stand-in body for the 2nd leg
    throw new Error('unexpected segment');
  };

  it('chains segments with dwell time and totals the ETA', async () => {
    const j = await planJourney([A, B, C], fetchPlan, { departAt: FIXTURE_T0, preference: 'fastest' });
    expect(j.ok).toBe(true);
    expect(j.segments).toHaveLength(2);
    const [s1, s2] = j.segments;
    expect(s1!.dwellS).toBe(0);
    expect(s2!.dwellS).toBe(45 * 60);
    expect(s2!.departAt).toBe(s1!.arriveAt! + 45 * 60_000);
    expect(s2!.itinerary!.startTime).toBe(s2!.departAt); // stale plan re-timed
    expect(j.endTime).toBe(s2!.arriveAt);
    const expected = s1!.itinerary!.durationS + 45 * 60 + s2!.itinerary!.durationS;
    expect(j.totalDurationS).toBe(expected);
    expect(j.etaISO).toBe(new Date(j.endTime!).toISOString());
    expect(s2!.alternatives.length).toBe(2);

    const alt = s2!.alternatives[1]!.itinerary.id;
    const j2 = chooseSegmentItinerary(j, 1, alt);
    expect(j2.segments[1]!.itinerary!.id).toBe(alt);
    expect(j2.endTime).toBeGreaterThan(j.endTime!);
  });

  it('a failed segment marks the journey not ok and skips later segments', async () => {
    const D: Place = { name: 'Nowhere', lat: 0, lng: 0 };
    const calls: string[] = [];
    const j = await planJourney(
      [A, B, D, C],
      async (f, to) => {
        calls.push(`${f.name}>${to.name}`);
        if (to === D) return { error: { msg: 'PATH_NOT_FOUND', noPath: true } };
        return fetchPlan(f, to);
      },
      { departAt: FIXTURE_T0 },
    );
    expect(j.ok).toBe(false);
    expect(j.segments.map((s) => s.error)).toEqual([undefined, 'no_route', 'previous_segment_failed']);
    expect(calls).toHaveLength(2);
    expect(j.etaISO).toBeUndefined();
  });

  it('journey steps: one waypoint arrival, then one final arrival under guidance', async () => {
    const j = await planJourney([A, B, C], fetchPlan, { departAt: FIXTURE_T0, defaultDwellMin: 10 });
    const steps = buildJourneySteps(j, 'en');
    const waypoint = steps.filter((s) => s.kind === 'walk_to_destination');
    expect(waypoint.map((s) => s.isFinal)).toEqual([false, true]);
    expect(waypoint[0]!.text).toBe('Walk to Tan Tock Seng Hospital');
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);

    const fixes = [
      ...simulateFixes(j.segments[0]!.itinerary!, { seed: 1 }),
      ...simulateFixes(j.segments[1]!.itinerary!, { seed: 2 }),
    ];
    let s = createGuidance(steps, FIXTURE_T0);
    const seen: string[] = [];
    for (const fix of fixes) {
      s = guidanceReducer(s, { type: 'fix', fix });
      seen.push(...s.cues.map((c) => c.type));
    }
    expect(seen.filter((x) => x === 'arrived_waypoint')).toHaveLength(1);
    expect(seen.filter((x) => x === 'arrived_destination')).toHaveLength(1);
    expect(seen.indexOf('arrived_waypoint')).toBeLessThan(seen.indexOf('arrived_destination'));
    expect(s.status).toBe('arrived');
  });
});
