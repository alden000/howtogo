import { describe, expect, it } from 'vitest';
import type { Place, Step } from '@howtogo/shared';
import {
  isTrainChange,
  alertCopy,
  cardMaxHeight,
  followZoom,
  mapHeading,
  mapPadding,
  metresLeft,
  nextStopName,
  pickNote,
  pocketText,
  stepActions,
  stepGroup,
  stopDots,
} from '../src/views/guideModel';
import { addStop, moveStop, removeStop } from '../src/views/Journey';

const step = (kind: Step['kind'], extra: Partial<Step> = {}): Step =>
  ({ id: 's', kind, mode: kind.endsWith('bus') ? 'bus' : kind.endsWith('train') ? 'rail' : 'walk', legIndex: 0, key: '', params: { stop: 'Blk 79', dest: 'TTSH' }, text: 'x', detail: '', geometry: [], start: { lat: 0, lng: 0 }, end: { lat: 0, lng: 0 }, lengthM: 0, durationS: 0, stopCount: 0, ...extra }) as Step;
const ui = { reroute: 'idle' as const, gpsWeak: false, manual: false, wakeLockFailed: false, noVoice: false };
const o = { online: true, foundYou: false, noVoiceDismissed: false };

describe('trip note priority (6c.10)', () => {
  it('re-route failed/offline > offline > weak > manual > found-you > wake lock > no voice', () => {
    expect(pickNote({ ...ui, reroute: 'failed', gpsWeak: true, noVoice: true }, { ...o, online: false })).toBe('reroute-failed');
    expect(pickNote({ ...ui, reroute: 'offline' }, o)).toBe('reroute-offline');
    expect(pickNote({ ...ui, gpsWeak: true }, { ...o, online: false })).toBe('offline');
    expect(pickNote({ ...ui, gpsWeak: true, wakeLockFailed: true }, o)).toBe('weak');
    expect(pickNote({ ...ui, manual: true, wakeLockFailed: true }, o)).toBe('manual');
    expect(pickNote({ ...ui, wakeLockFailed: true }, { ...o, foundYou: true })).toBe('found-you');
    expect(pickNote({ ...ui, wakeLockFailed: true, noVoice: true }, o)).toBe('wakelock');
    expect(pickNote({ ...ui, noVoice: true }, o)).toBe('novoice');
    expect(pickNote({ ...ui, noVoice: true }, { ...o, noVoiceDismissed: true })).toBeNull();
    expect(pickNote({ ...ui, reroute: 'searching' }, o)).toBeNull(); // banners live in the band
  });
});

describe('G5 action rows (6c.7)', () => {
  it('auto mode: wait → I am on (secondary), ride → I got off + Pocket, walk → Pocket, Next quiet', () => {
    expect(stepActions('wait', { manual: false, gpsWeak: false })).toEqual({ a: 'im_on', aPrimary: false, pocket: false, quietNext: true });
    expect(stepActions('ride', { manual: false, gpsWeak: false })).toEqual({ a: 'got_off', aPrimary: false, pocket: true, quietNext: true });
    expect(stepActions('walk', { manual: false, gpsWeak: false })).toEqual({ a: null, aPrimary: false, pocket: true, quietNext: true });
  });
  it('manual mode: Next moves up as primary on walks; row A primary; no Pocket', () => {
    expect(stepActions('walk', { manual: true, gpsWeak: false })).toEqual({ a: 'next', aPrimary: true, pocket: false, quietNext: false });
    expect(stepActions('ride', { manual: true, gpsWeak: false })).toMatchObject({ a: 'got_off', aPrimary: true, pocket: false, quietNext: true });
  });
  it('weak GPS emphasises I am on / I got off only', () => {
    expect(stepActions('wait', { manual: false, gpsWeak: true }).aPrimary).toBe(true);
    expect(stepActions('walk', { manual: false, gpsWeak: true }).aPrimary).toBe(false);
  });
});

describe('step helpers', () => {
  it('groups steps', () => {
    expect(stepGroup(step('walk_to_stop'))).toBe('walk');
    expect(stepGroup(step('board_bus'))).toBe('wait');
    expect(stepGroup(step('ride_train'))).toBe('ride');
    expect(stepGroup(undefined)).toBe('walk');
  });
  it('rounds metres to 10, never negative', () => {
    expect(metresLeft({ distanceToNextActionM: 124 })).toBe(120);
    expect(metresLeft({ distanceToNextActionM: -3 })).toBe(0);
  });
  it('stop dots follow the runtime floor and end on the goal', () => {
    const s = step('ride_bus', { stopCount: 4 });
    expect(stopDots(s, 4)).toEqual(['next', 'todo', 'todo', 'goal']);
    expect(stopDots(s, 2)).toEqual(['done', 'done', 'next', 'goal']);
    expect(stopDots(s, null)).toEqual(['next', 'todo', 'todo', 'goal']);
    expect(stopDots(s, 9)).toEqual(['next', 'todo', 'todo', 'goal']);
  });
  it('names the next stop', () => {
    const s = step('ride_bus', { stopCount: 3, stops: ['A', 'B', 'C'].map((name, i) => ({ name, lat: 0, lng: 0, alongM: i })) as Step['stops'] });
    expect(nextStopName(s, 3)).toBe('A');
    expect(nextStopName(s, 1)).toBe('C');
    expect(nextStopName(step('walk_to_stop'), 1)).toBeNull();
  });
  it('alert copy: H6 bus/train and H6b', () => {
    const base = { stepId: 's', stop: 'X', shownAt: 0, escalated: false };
    expect(alertCopy({ ...base, kind: 'next', mode: 'bus' })).toMatchObject({ title: 'getoff_t', line: 'getoff_bell', icon: 'bell' });
    expect(alertCopy({ ...base, kind: 'next', mode: 'train' })).toMatchObject({ line: 'getoff_train', sign: 'sign_train' });
    expect(alertCopy({ ...base, kind: 'now', mode: 'bus' })).toMatchObject({ title: 'now_t', line: 'now_bus', icon: 'exit' });
  });
});

describe('pocket view text (6c.2)', () => {
  const g = { distanceToNextActionM: 248 };
  it('walk: place + metres', () => {
    expect(pocketText(step('walk_to_stop'), g, { stopsLeft: null, mrt: null }, 'Blk 79')).toEqual({ glyph: 'walk', line: { key: 'pk_walk', p: { p: 'Blk 79' } }, count: { key: 'pk_m', p: { m: 250 } } });
  });
  it('bus ride: service + stops left; one stop uses the singular line', () => {
    const s = step('ride_bus', { route: '139', stopCount: 4 });
    expect(pocketText(s, g, { stopsLeft: 3, mrt: null }, '')).toMatchObject({ glyph: 'bus', line: { key: 'pk_bus', p: { s: '139' } }, count: { key: 'g_stops_left', p: { n: 3 } } });
    expect(pocketText(s, g, { stopsLeft: 1, mrt: null }, '').count?.key).toBe('g_stop_left1');
  });
  it('MRT estimate uses "约"', () => {
    const s = step('ride_train', { stopCount: 5 });
    expect(pocketText(s, g, { stopsLeft: 4, mrt: { stopsLeft: 2, preAlertAt: null, station: 'X' } }, '').count).toEqual({ key: 'pk_n_est', p: { n: 2 } });
  });
});

describe('map window (6c.0) and heading (AC 14)', () => {
  it('card max height keeps a 160 px map window', () => {
    expect(cardMaxHeight(844, 84)).toBeCloseTo(844 * 0.62);
    expect(cardMaxHeight(844, 600)).toBe(160);
  });
  it('puck at 66 % down the window, centred when the window is short', () => {
    expect(mapPadding(844, 84, 360)).toEqual({ top: Math.round(0.32 * 400), bottom: 0 });
    expect(mapPadding(844, 300, 430)).toEqual({ top: 0, bottom: 0 });
  });
  it('compass when slow, course when fast, else compass, else north-up', () => {
    expect(mapHeading(90, { speed: 1 })).toBe(90);
    expect(mapHeading(90, { speed: 8, heading: 180 })).toBe(180);
    expect(mapHeading(null, { speed: 3, heading: 45 })).toBe(45);
    expect(mapHeading(null, { speed: 0.5, heading: 45 })).toBeNull();
    expect(mapHeading(undefined, undefined)).toBeNull();
  });
  it('zooms out on rides', () => {
    expect(followZoom('ride')).toBeLessThan(followZoom('walk'));
  });
});

describe('G2 list edits', () => {
  const P = (name: string): Place => ({ name, lat: 1, lng: 103 });
  it('moves, removes (never the last one) and caps at 5', () => {
    const l = [P('a'), P('b'), P('c')];
    expect(moveStop(l, 0, 1).map((p) => p.name)).toEqual(['b', 'a', 'c']);
    expect(moveStop(l, 0, -1)).toBe(l);
    expect(removeStop(l, 1).map((p) => p.name)).toEqual(['a', 'c']);
    expect(removeStop([P('a')], 0)).toHaveLength(1);
    const five = [1, 2, 3, 4, 5].map((i) => P(String(i)));
    expect(addStop(five, P('6'))).toHaveLength(5);
    expect(addStop(l, P('d'))).toHaveLength(4);
  });
});

describe('M2 fix round', () => {
  it('F2: walk minutes come from this walk\'s metres (≈ 67 m/min), at least 1', async () => {
    const { walkMinutes } = await import('../src/views/guideModel');
    expect(walkMinutes(80)).toBe(2);
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(670)).toBe(10);
  });
  it('QA-21: explainer note while asking (above offline); denied note below wake lock, above no voice', () => {
    expect(pickNote({ ...ui, notify: 'asking', gpsWeak: true }, { ...o, online: false })).toBe('notify-ask');
    expect(pickNote({ ...ui, notify: 'denied', wakeLockFailed: true }, o)).toBe('wakelock');
    expect(pickNote({ ...ui, notify: 'denied', noVoice: true }, o)).toBe('notify-denied');
  });
  it('F3: alert titles come as two phrases', () => {
    const a = { kind: 'now', stepId: 's', stop: 'X', mode: 'bus', shownAt: 0, escalated: false } as const;
    expect(alertCopy(a)).toMatchObject({ t1: 'now_t1', t2: 'now_t2' });
  });
});

describe('T6 train change meta', () => {
  const legs = [{ mode: 'walk' }, { mode: 'mrt' }, { mode: 'mrt' }, { mode: 'walk' }, { mode: 'lrt' }, { mode: 'bus' }] as const;
  it('board_train straight after a train, or after a walk from a train; walk between trains', () => {
    expect(isTrainChange({ kind: 'board_train', legIndex: 1 }, legs)).toBe(false);
    expect(isTrainChange({ kind: 'board_train', legIndex: 2 }, legs)).toBe(true);
    expect(isTrainChange({ kind: 'walk_transfer', legIndex: 3 }, legs)).toBe(true);
    expect(isTrainChange({ kind: 'board_train', legIndex: 4 }, legs)).toBe(true);
    expect(isTrainChange({ kind: 'board_bus', legIndex: 5 }, legs)).toBe(false);
    expect(isTrainChange(undefined, legs)).toBe(false);
  });
});
