import { beforeEach, describe, expect, it, vi } from 'vitest';
import { injectDeviation, simulateFixes, type Fix, type Itinerary, type Place } from '@howtogo/shared';
import { FIXTURES } from '@howtogo/shared/fixtures';
import { logLines, resetLog } from '../src/log';
import { createFakePlatform, type FakePlatformOptions } from '../src/platform/fake';
import { createStore } from '../src/state/store';
import { memoryKV, type KV } from '../src/state/storage';
import { createTripRuntime } from '../src/trip/runtime';
import { flush, itinerary, manualTimers, placesFor, stubApi } from './helpers';

beforeEach(() => resetLog());

function setup(o: { api?: Parameters<typeof stubApi>[0]; kv?: KV; platform?: FakePlatformOptions; online?: () => boolean; t0?: number } = {}) {
  const timers = manualTimers();
  timers.set(o.t0 ?? 0);
  const platform = createFakePlatform(o.platform);
  const kv = o.kv ?? memoryKV();
  const store = createStore(kv, memoryKV(), { tripWriteMs: 0 });
  const api = stubApi(o.api);
  const runtime = createTripRuntime({ store, platform, api, now: timers.now, timers, idFactory: () => 'trip1', isOnline: o.online ?? (() => true) });
  return { timers, platform, store, api, runtime, kv };
}

type Env = ReturnType<typeof setup>;

/** Feed fixes in clock order, stopping after `until` returns true. */
async function feed(env: Env, fixes: Fix[], until?: () => boolean) {
  for (const f of fixes) {
    if (f.t > env.timers.now()) env.timers.advance(f.t - env.timers.now());
    env.platform.fake.emit(f);
    await flush();
    if (until?.()) return;
  }
}

const has = (line: string) => logLines().includes(line);
const count = (line: string) => logLines().filter((l) => l === line).length;
const vib = (env: Env, name: string) => env.platform.fake.vibrations.filter((v) => v === name).length;

async function busToAlert(env: Env, kind: 'next' | 'now' = 'next') {
  const it0 = itinerary();
  const fixes = simulateFixes(it0, { seed: 3 });
  env.timers.set(fixes[0]!.t);
  await env.runtime.start(it0, placesFor(it0));
  await feed(env, fixes, () => env.runtime.ui.value.alert?.kind === kind);
  expect(env.runtime.ui.value.alert?.kind).toBe(kind);
  return { it0, fixes };
}

describe('haptic names (6c.13)', () => {
  it('only the six canonical names are used on a whole trip', async () => {
    const env = setup();
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 3 });
    env.timers.set(fixes[0]!.t);
    await env.runtime.start(it0, placesFor(it0));
    await feed(env, fixes);
    env.timers.advance(60_000);
    const allowed = new Set(['tick', 'confirm', 'attention', 'getoff', 'arrive', 'gentle']);
    expect(env.platform.fake.vibrations.every((v) => allowed.has(v))).toBe(true);
    expect(env.platform.fake.vibrations).toContain('attention'); // arrived_at_stop
    expect(env.platform.fake.vibrations.at(-1)).toBe('arrive');
  });
  it('Settings haptics off silences them all', async () => {
    const env = setup();
    env.store.updateSettings({ haptics: false });
    await busToAlert(env);
    expect(env.platform.fake.vibrations).toEqual([]);
  });
});

describe('get-off alert escalation (OQ9, AC 29)', () => {
  it('H6: getoff + two voice lines (2.2 s apart); one repeat after 20 s if not acknowledged; never again', async () => {
    const env = setup();
    await busToAlert(env);
    expect(has('alert:next')).toBe(true);
    expect(vib(env, 'getoff')).toBe(1);
    const spoken = () => env.platform.fake.spoken.map((s) => s.text);
    expect(spoken()).toContain('下一站下车。');
    expect(spoken()).not.toContain('请现在按铃。');
    env.timers.advance(2200);
    await flush();
    expect(spoken().at(-1)).toBe('请现在按铃。');
    env.timers.advance(20_000 - 2200 - 1);
    await flush();
    expect(has('alert:escalate')).toBe(false);
    env.timers.advance(1);
    await flush();
    expect(count('alert:escalate')).toBe(1);
    expect(vib(env, 'getoff')).toBe(2);
    expect(env.store.trip.value?.alert?.escalated).toBe(true);
    env.timers.advance(10 * 60_000);
    await flush();
    expect(count('alert:escalate')).toBe(1);
    expect(env.runtime.ui.value.alert).not.toBeNull(); // stays until OK or the ride ends
  });

  it('acknowledged → no repeat; confirm haptic', async () => {
    const env = setup();
    await busToAlert(env);
    env.timers.advance(5000);
    env.runtime.ackAlert();
    expect(has('alert:ack')).toBe(true);
    expect(env.runtime.ui.value.alert).toBeNull();
    expect(env.platform.fake.vibrations.at(-1)).toBe('confirm');
    env.timers.advance(60_000);
    expect(has('alert:escalate')).toBe(false);
  });

  it('no repeat after the ride step ends (I got off)', async () => {
    const env = setup();
    await busToAlert(env);
    env.timers.advance(10_000);
    env.runtime.gotOff();
    await flush();
    expect(has('alert:clear')).toBe(true);
    expect(env.runtime.ui.value.alert).toBeNull();
    env.timers.advance(60_000);
    expect(has('alert:escalate')).toBe(false);
  });

  it('H6b: getoff twice 800 ms apart, high-priority voice, notify tag getoff; say again repeats the alert lines', async () => {
    const env = setup();
    await busToAlert(env, 'now');
    const before = vib(env, 'getoff');
    env.timers.advance(800);
    expect(vib(env, 'getoff')).toBe(before + 1);
    const now = env.platform.fake.spoken.find((s) => s.text === '到站了，请下车。');
    expect(now?.priority).toBe('high');
    expect(env.platform.fake.notifications.filter((n) => n.tag === 'getoff').at(-1)?.title).toBe('到站了，请下车');
    env.store.updateSettings({ muted: true });
    env.runtime.repeat();
    await flush();
    expect(env.platform.fake.spoken.at(-1)).toMatchObject({ text: '到站了，请下车。', forced: true });
  });
});

describe('resume window (OQ5)', () => {
  async function stored(t0: number) {
    const kv = memoryKV();
    const a = setup({ kv, t0 });
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 5 }).map((f) => ({ ...f, t: f.t - it0.startTime + t0 }));
    await a.runtime.start(it0, placesFor(it0));
    await feed(a, fixes.slice(0, Math.floor(fixes.length / 2)));
    a.store.flushTrip();
    const step = a.store.trip.value!.guidance.stepIndex;
    const eta = a.runtime.eta()!;
    a.runtime.dispose();
    return { kv, step, eta, fixes };
  }

  it('auto-resumes within ETA + 2 h at the stored step, with the toast flag', async () => {
    const { kv, step, eta } = await stored(1_000_000);
    const b = setup({ kv, t0: eta + 2 * 3600_000 });
    expect(await b.runtime.resume()).toBe(true);
    expect(has('state:resume')).toBe(true);
    expect(b.runtime.ui.value.resumed).toBe(true);
    expect(b.runtime.ui.value.phase).toBe('guiding');
    expect(b.store.trip.value?.guidance.stepIndex).toBe(step);
    expect(b.runtime.ui.value.voiceUnlockNeeded).toBe(false);
  });

  it('asks Continue/End after ETA + 2 h; Continue resumes, End deletes', async () => {
    const { kv, eta } = await stored(1_000_000);
    const b = setup({ kv, t0: eta + 2 * 3600_000 + 1 });
    expect(await b.runtime.resume()).toBe(false);
    expect(has('state:resume-ask')).toBe(true);
    expect(b.runtime.ui.value.stale).toEqual({ dest: 'Tan Tock Seng Hospital' });
    expect(b.runtime.attached).toBe(false);
    expect(await b.runtime.continueStale()).toBe(true);
    expect(b.runtime.attached).toBe(true);
    await b.runtime.endStale();
    expect(b.store.trip.value).toBeNull();
  });

  it('drops silently after 24 h', async () => {
    const { kv } = await stored(1_000_000);
    const b = setup({ kv, t0: 1_000_000 + 24 * 3600_000 });
    expect(await b.runtime.resume()).toBe(false);
    expect(has('state:resume-drop')).toBe(true);
    expect(b.store.trip.value).toBeNull();
    expect(b.runtime.ui.value.stale).toBeNull();
  });

  it('iOS-like: resume shows the voice bar; the tap unlocks wake lock and speaks the headline', async () => {
    const { kv, eta } = await stored(1_000_000);
    const b = setup({ kv, t0: eta, platform: { capabilities: { speechNeedsGesture: true, os: 'ios' } } });
    expect(await b.runtime.resume()).toBe(true);
    expect(b.runtime.ui.value.voiceUnlockNeeded).toBe(true);
    expect(has('state:voice-unlock')).toBe(true);
    expect(b.platform.fake.wakeLockHeld).toBe(false);
    await b.runtime.unlockVoice();
    await flush();
    expect(b.runtime.ui.value.voiceUnlockNeeded).toBe(false);
    expect(b.platform.fake.wakeLockHeld).toBe(true);
    expect(has('resume:voice')).toBe(true);
    expect(b.platform.fake.spoken.at(-1)?.text).toBe(b.store.trip.value!.guidance.steps[b.store.trip.value!.guidance.stepIndex]!.say);
  });

  it('a refused wake lock on resume also needs the tap', async () => {
    const { kv, eta } = await stored(1_000_000);
    const b = setup({ kv, t0: eta, platform: { wakeLockOk: false } });
    await b.runtime.resume();
    expect(b.runtime.ui.value.voiceUnlockNeeded).toBe(true);
    expect(b.runtime.ui.value.wakeLockFailed).toBe(true);
  });
});

describe('multi-stop journeys (§I)', () => {
  const shift = (fixes: Fix[], d: number) => fixes.map((f) => ({ ...f, t: f.t + d }));

  function journeyPlaces(it0: Itinerary): Place[] {
    const [a, b] = placesFor(it0, 'Clinic');
    return [a!, { ...b!, dwellMin: 60 }, { ...b!, name: 'Market' }];
  }

  it('plans with planJourney (dwell + total ETA), validates ≤ 5 stops', async () => {
    const route = vi.fn(async () => FIXTURES.toaPayohToTTSH as unknown);
    const env = setup({ api: { route } });
    const it0 = itinerary();
    const j = await env.runtime.planTrip(journeyPlaces(it0), it0.startTime);
    expect(j.ok).toBe(true);
    expect(j.segments).toHaveLength(2);
    expect(j.segments[1]!.dwellS).toBe(3600);
    expect(route).toHaveBeenCalledTimes(2);
    const P = journeyPlaces(it0)[0]!;
    await expect(env.runtime.planTrip([P, P, P, P, P, P, P])).rejects.toThrow('too_many');
  });

  it('waypoint arrival pauses GPS, waits for "continue", re-plans from here, then finishes', async () => {
    const route = vi.fn(async (_p: { start: { lat: number }; end: { lat: number } }) => FIXTURES.toaPayohToTTSH as unknown);
    const env = setup({ api: { route } });
    const it0 = itinerary();
    const places = journeyPlaces(it0);
    env.timers.set(it0.startTime);
    const j = await env.runtime.planTrip(places, it0.startTime);
    route.mockClear();
    await env.runtime.startJourney(j);
    expect(env.runtime.ui.value.progress).toMatchObject({ place: 1, places: 2, isLast: false });
    const eta0 = env.runtime.ui.value.etaMs!;
    expect(eta0).toBeGreaterThanOrEqual(it0.endTime + 3600_000); // includes the 60 min dwell + segment 2

    const fixes = simulateFixes(it0, { seed: 6 });
    await feed(env, fixes);
    expect(has('cue:arrived_waypoint')).toBe(true);
    expect(has('cue:arrived_destination')).toBe(false);
    expect(has('state:waypoint')).toBe(true);
    expect(env.runtime.ui.value.phase).toBe('waypoint');
    expect(env.store.trip.value?.phase).toBe('waypoint');
    expect(env.platform.fake.vibrations).toContain('attention');
    expect(env.platform.fake.spoken.some((s) => s.text.startsWith('到了Clinic。'))).toBe(true);
    // GPS paused: fixes are ignored; never auto-starts on a timer.
    env.timers.advance(3 * 3600_000);
    expect(env.runtime.ui.value.phase).toBe('waypoint');
    expect(env.platform.fake.wakeLockHeld).toBe(false); // released 60 s after the waypoint
    expect(route).not.toHaveBeenCalled();

    const here = { ...fixes.at(-1)!, lat: fixes.at(-1)!.lat + 0.0001, t: env.timers.now() };
    env.platform.fake.setPosition(here);
    expect(await env.runtime.continueJourney()).toBe(true);
    expect(route).toHaveBeenCalledTimes(1);
    expect(route.mock.calls[0]![0].start.lat).toBeCloseTo(here.lat, 6);
    expect(env.store.trip.value?.journey?.segment).toBe(1);
    expect(env.runtime.ui.value).toMatchObject({ phase: 'guiding', continuing: false });
    expect(env.runtime.ui.value.progress).toMatchObject({ place: 2, places: 2, isLast: true });
    expect(env.platform.fake.wakeLockHeld).toBe(true);

    const it1 = env.store.trip.value!.itinerary;
    const t1 = env.timers.now() + 1000;
    await feed(env, shift(simulateFixes(it1, { seed: 7 }), t1 - it1.startTime));
    expect(has('cue:arrived_destination')).toBe(true);
    expect(env.runtime.ui.value.phase).toBe('arrived');
    expect(env.runtime.ui.value.progress?.overall).toBe(1);
  });

  it('a failed next segment keeps the waypoint screen with segmentError', async () => {
    let calls = 0;
    const route = vi.fn(async () => {
      calls++;
      if (calls > 2) throw new Error('boom');
      return FIXTURES.toaPayohToTTSH as unknown;
    });
    const env = setup({ api: { route } });
    const it0 = itinerary();
    env.timers.set(it0.startTime);
    await env.runtime.startJourney(await env.runtime.planTrip(journeyPlaces(it0), it0.startTime));
    await feed(env, simulateFixes(it0, { seed: 6 }));
    expect(await env.runtime.continueJourney()).toBe(false);
    expect(env.runtime.ui.value).toMatchObject({ phase: 'waypoint', continuing: false, segmentError: 'api_error' });
    expect(has('state:segment-failed')).toBe(true);
  });

  it('persists the journey; a reload at the waypoint reopens the waypoint screen', async () => {
    const kv = memoryKV();
    const route = async () => FIXTURES.toaPayohToTTSH as unknown;
    const a = setup({ kv, api: { route } });
    const it0 = itinerary();
    a.timers.set(it0.startTime);
    await a.runtime.startJourney(await a.runtime.planTrip(journeyPlaces(it0), it0.startTime));
    await feed(a, simulateFixes(it0, { seed: 6 }));
    a.store.flushTrip();
    a.runtime.dispose();
    const b = setup({ kv, api: { route }, t0: a.timers.now() + 600_000 });
    expect(await b.runtime.resume()).toBe(true);
    expect(b.runtime.ui.value.phase).toBe('waypoint');
    expect(b.runtime.attached).toBe(false);
    expect(await b.runtime.continueJourney()).toBe(true);
  });
});

describe('manual mode (G5)', () => {
  it('location denied → manual at once with the spoken note; manual actions speak + confirm', async () => {
    const env = setup({ platform: { permission: 'denied' } });
    const it0 = itinerary();
    await env.runtime.start(it0, placesFor(it0));
    await flush();
    expect(env.runtime.ui.value.manual).toBe(true);
    expect(has('state:manual')).toBe(true);
    expect(env.platform.fake.spoken.map((s) => s.text)).toContain('没有位置信息，请自己按“下一步”。');
    const n = env.platform.fake.spoken.length;
    env.runtime.next();
    await flush();
    expect(env.store.trip.value?.guidance.stepIndex).toBe(1);
    expect(env.platform.fake.vibrations.at(-1)).toBe('confirm');
    expect(env.platform.fake.spoken.length).toBeGreaterThan(n);
    env.runtime.onBoard();
    expect(env.store.trip.value?.guidance.steps[env.store.trip.value!.guidance.stepIndex]!.kind).toBe('ride_bus');
    env.runtime.previous();
    expect(env.store.trip.value?.guidance.stepIndex).toBe(1);
    env.runtime.onBoard();
    env.runtime.gotOff();
    expect(env.store.trip.value?.guidance.steps[env.store.trip.value!.guidance.stepIndex]!.kind).toBe('walk_to_destination');
    // never pocket view in manual mode
    env.timers.advance(120_000);
    expect(env.runtime.ui.value.pocket).toBe(false);
  });

  it('no usable fix for 60 s → manual; a good fix → back to auto', async () => {
    const env = setup();
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 3 });
    env.timers.set(fixes[0]!.t);
    await env.runtime.start(it0, placesFor(it0));
    env.timers.advance(59_999);
    expect(env.runtime.ui.value.manual).toBe(false);
    env.timers.advance(1);
    expect(env.runtime.ui.value.manual).toBe(true);
    env.platform.fake.emit({ ...fixes[1]!, t: env.timers.now() });
    await flush();
    expect(env.runtime.ui.value.manual).toBe(false);
    expect(has('state:auto')).toBe(true);
  });

  it('a watch error "denied" mid-trip → manual', async () => {
    const env = setup();
    const it0 = itinerary();
    await env.runtime.start(it0, placesFor(it0));
    env.platform.fake.emitError({ code: 'denied', message: 'x' });
    expect(env.runtime.ui.value.manual).toBe(true);
  });
});

describe('pocket view (OQ7)', () => {
  it('45 s idle on a walk step dims; touch wakes; never during an alert; alerts break through', async () => {
    const env = setup();
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 3 });
    env.timers.set(fixes[0]!.t);
    await env.runtime.start(it0, placesFor(it0));
    env.platform.fake.emit(fixes[0]!);
    await flush();
    env.timers.advance(44_000);
    expect(env.runtime.ui.value.pocket).toBe(false);
    env.runtime.touch();
    env.timers.advance(30_000);
    env.platform.fake.emit({ ...fixes[0]!, t: env.timers.now() }); // keep fixes coming (else manual mode after 60 s)
    await flush();
    env.timers.advance(14_000);
    expect(env.runtime.ui.value.pocket).toBe(false);
    env.timers.advance(1_000);
    expect(env.runtime.ui.value.pocket).toBe(true);
    expect(has('state:pocket')).toBe(true);
    expect(has('pocket:on')).toBe(true);
    env.runtime.touch();
    expect(env.runtime.ui.value.pocket).toBe(false);
    expect(has('pocket:off')).toBe(true);
    env.runtime.pocket();
    expect(env.runtime.ui.value.pocket).toBe(true);
    // the alert breaks through pocket view and blocks it while showing
    await feed(env, fixes.filter((f) => f.t > env.timers.now()), () => !!env.runtime.ui.value.alert);
    expect(env.runtime.ui.value.alert).not.toBeNull();
    expect(env.runtime.ui.value.pocket).toBe(false);
    env.runtime.pocket();
    expect(env.runtime.ui.value.pocket).toBe(false);
  });

  it('never while a sheet is open', async () => {
    const env = setup();
    const it0 = itinerary();
    await env.runtime.start(it0, placesFor(it0));
    env.platform.fake.emit({ ...simulateFixes(it0, { seed: 3 })[0]!, t: 1 });
    env.runtime.setSheetOpen(true);
    env.timers.advance(50_000);
    expect(env.runtime.ui.value.pocket).toBe(false);
    env.platform.fake.emit({ ...simulateFixes(it0, { seed: 3 })[0]!, t: env.timers.now() });
    env.runtime.setSheetOpen(false);
    env.timers.advance(45_000);
    expect(env.runtime.ui.value.pocket).toBe(true);
  });
});

describe('wake lock (AC 39)', () => {
  it('failure → flag + state:wakelock-failed once; re-acquired on visibilitychange', async () => {
    const env = setup({ platform: { wakeLockOk: false } });
    const it0 = itinerary();
    await env.runtime.start(it0, placesFor(it0));
    expect(env.runtime.ui.value.wakeLockFailed).toBe(true);
    expect(count('state:wakelock-failed')).toBe(1);
    env.platform.fake.setWakeLockOk(true);
    env.platform.fake.setVisible(false);
    expect(env.platform.fake.wakeLockHeld).toBe(false);
    const req = env.platform.fake.wakeLockRequests;
    env.platform.fake.setVisible(true);
    await flush();
    expect(env.platform.fake.wakeLockRequests).toBe(req + 1);
    expect(env.platform.fake.wakeLockHeld).toBe(true);
    await env.runtime.end();
    expect(env.platform.fake.wakeLockHeld).toBe(false);
  });
});

describe('location profile (AC 38), follow-me (OQ2), language (OQ10), dedupe (AC 21)', () => {
  it('watch interval per leg: walk 2 s → wait 5 s → ride → last stops 2 s', async () => {
    const env = setup();
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 3 });
    env.timers.set(fixes[0]!.t);
    await env.runtime.start(it0, placesFor(it0));
    await feed(env, fixes);
    const iv = env.platform.fake.watchIntervals;
    expect(iv[0]).toBe(2000);
    expect(iv).toContain(5000);
    expect(iv.indexOf(5000)).toBeGreaterThan(0);
    expect(iv.lastIndexOf(2000)).toBeGreaterThan(iv.indexOf(5000));
  });

  it('drag pauses follow; 10 min later still free; a step change re-engages', async () => {
    const env = setup();
    const it0 = itinerary();
    await env.runtime.start(it0, placesFor(it0));
    env.runtime.mapGesture();
    expect(env.runtime.ui.value.follow).toBe('free');
    env.timers.advance(10 * 60_000);
    expect(env.runtime.ui.value.follow).toBe('free');
    env.runtime.next();
    expect(env.runtime.ui.value.follow).toBe('follow');
    expect(logLines()).toEqual(expect.arrayContaining(['follow:free', 'follow:on']));
  });

  it('trip language is fixed at start', async () => {
    const env = setup();
    const it0 = itinerary();
    await env.runtime.start(it0, placesFor(it0));
    env.store.updateSettings({ lang: 'en' });
    env.runtime.next();
    await flush();
    expect(env.platform.fake.spoken.every((s) => s.lang === 'zh-CN')).toBe(true);
    expect(env.store.trip.value?.guidance.steps[1]!.text).toMatch(/[一-鿿]/);
  });

  it('drops duplicate and out-of-order fixes', async () => {
    const env = setup();
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 3 });
    await env.runtime.start(it0, placesFor(it0));
    env.platform.fake.emit(fixes[5]!);
    const g = env.store.trip.value!.guidance;
    env.platform.fake.emit(fixes[5]!);
    env.platform.fake.emit(fixes[2]!);
    expect(env.store.trip.value!.guidance).toBe(g);
  });

  it('say again while muted speaks (a tap is consent); cues stay silent', async () => {
    const env = setup();
    env.store.updateSettings({ muted: true });
    const it0 = itinerary();
    await env.runtime.start(it0, placesFor(it0));
    await flush();
    expect(env.platform.fake.spoken).toHaveLength(0);
    env.runtime.repeat();
    await flush();
    expect(env.platform.fake.spoken).toHaveLength(1);
    expect(env.platform.fake.spoken[0]!.forced).toBe(true);
  });
});

describe('off route (AC 32–33)', () => {
  it('failed re-route → note state + spoken line, no retry within the episode window', async () => {
    const route = vi.fn(async () => {
      throw new Error('no');
    });
    const env = setup({ api: { route } });
    const it0 = itinerary();
    const fixes = injectDeviation(simulateFixes(it0, { seed: 4 }), 5, 6, 150);
    env.timers.set(fixes[0]!.t);
    await env.runtime.start(it0, placesFor(it0));
    await feed(env, fixes.slice(0, 12));
    await flush();
    expect(route).toHaveBeenCalledTimes(1);
    expect(env.runtime.ui.value.reroute).toBe('failed');
    expect(has('state:reroute-failed')).toBe(true);
    expect(env.platform.fake.spoken.map((s) => s.text)).toContain('暂时找不到新的路。先跟着地图上的线走。');
    expect(env.platform.fake.vibrations).toContain('gentle');
  });

  it('offline → offline note, no API call', async () => {
    const route = vi.fn(async () => FIXTURES.toaPayohToTTSH as unknown);
    const env = setup({ api: { route }, online: () => false });
    const it0 = itinerary();
    env.timers.set(it0.startTime);
    await env.runtime.start(it0, placesFor(it0));
    await feed(env, injectDeviation(simulateFixes(it0, { seed: 4 }), 5, 6, 150).slice(0, 12));
    expect(route).not.toHaveBeenCalled();
    expect(env.runtime.ui.value.reroute).toBe('offline');
    expect(has('state:reroute-offline')).toBe(true);
  });

  it('found → banner state, confirm, auto-dismiss after 4.2 s', async () => {
    const route = vi.fn(async () => FIXTURES.toaPayohToTTSH as unknown);
    const env = setup({ api: { route } });
    const it0 = itinerary();
    env.timers.set(it0.startTime);
    await env.runtime.start(it0, placesFor(it0));
    await feed(env, injectDeviation(simulateFixes(it0, { seed: 4 }), 5, 6, 150), () => env.runtime.ui.value.reroute === 'found');
    await flush();
    expect(env.runtime.ui.value.reroute).toBe('found');
    env.timers.advance(4200);
    expect(env.runtime.ui.value.reroute).toBe('idle');
  });
});

describe('MRT soft estimate (OQ3)', () => {
  it('no GPS on a train ride → "约 还有 N 站" from the schedule, never up, pre-alert once at the second-last station', async () => {
    const env = setup();
    const it0 = itinerary('bishanToRafflesPlace');
    env.timers.set(it0.startTime);
    await env.runtime.start(it0, placesFor(it0, 'Raffles Place'));
    // Underground: no fixes. Board by button.
    env.runtime.onBoard();
    const step = env.store.trip.value!.guidance.steps[env.store.trip.value!.guidance.stepIndex]!;
    expect(step.kind).toBe('ride_train');
    env.timers.advance(30_000);
    const first = env.runtime.ui.value.mrt;
    expect(first).not.toBeNull();
    expect(has('state:mrt-estimate')).toBe(true);
    let prev = first!.stopsLeft;
    for (let i = 0; i < Math.ceil(step.durationS / 30) + 4; i++) {
      env.timers.advance(30_000);
      const n = env.runtime.ui.value.mrt?.stopsLeft ?? prev;
      expect(n).toBeLessThanOrEqual(prev);
      expect(n).toBeGreaterThanOrEqual(1);
      prev = n;
    }
    expect(prev).toBe(1);
    if ((step.stops?.length ?? 0) >= 2) {
      expect(count('cue:mrt_prealert')).toBe(1);
      expect(env.platform.fake.vibrations).toContain('attention');
    }
    // the strong alert never comes from time alone
    expect(has('alert:now')).toBe(false);
    expect(has('alert:next')).toBe(false);
  });
});

describe('M2 fix round (QA-21, QA-23, QA-25)', () => {
  it('QA-23: a dismissed wake-lock note stays closed after later failed re-acquires', async () => {
    const env = setup({ platform: { wakeLockOk: false } });
    const it0 = itinerary();
    await env.runtime.start(it0, placesFor(it0));
    expect(env.runtime.ui.value.wakeLockFailed).toBe(true);
    env.runtime.dismissWakeNote();
    env.platform.fake.setVisible(false);
    env.platform.fake.setVisible(true);
    await flush();
    expect(env.runtime.ui.value.wakeLockFailed).toBe(false);
    expect(count('state:wakelock-failed')).toBe(1);
  });

  it('QA-21: notification permission asked once ever at Start (explainer while asking); denied → note', async () => {
    localStorage.clear();
    const env = setup({ platform: { notifyPermission: 'default' } });
    env.platform.fake.setNotifyPermission('default', 'denied');
    const it0 = itinerary();
    const p = env.runtime.start(it0, placesFor(it0));
    expect(env.platform.fake.notifyRequests).toBe(1); // inside the tap (synchronous part of start)
    expect(env.runtime.ui.value.notify).toBe('asking');
    await p;
    await flush();
    expect(env.runtime.ui.value.notify).toBe('denied');
    env.runtime.dismissNotifyNote();
    expect(env.runtime.ui.value.notify).toBe('idle');
    await env.runtime.end();
    await env.runtime.start(it0, placesFor(it0)); // still denied → note again, no prompt
    expect(env.platform.fake.notifyRequests).toBe(1);
    expect(env.runtime.ui.value.notify).toBe('denied');
    await env.runtime.end();
    env.platform.fake.setNotifyPermission('default', 'granted'); // prompt dismissed earlier: never asked twice, no nag
    await env.runtime.start(it0, placesFor(it0));
    expect(env.platform.fake.notifyRequests).toBe(1);
    expect(env.runtime.ui.value.notify).toBe('idle');
    localStorage.clear();
  });

  it('QA-21: granted → no prompt, no note', async () => {
    localStorage.clear();
    const env = setup();
    const it0 = itinerary();
    await env.runtime.start(it0, placesFor(it0));
    expect(env.platform.fake.notifyRequests).toBe(0);
    expect(env.runtime.ui.value.notify).toBe('idle');
  });

  it('QA-25: End sets "here" to the trip\'s last fix, so Route home plans from where the senior is', async () => {
    const { here } = await import('../src/state/location');
    here.value = { lat: 1, lng: 103, label: 'old' };
    const env = setup();
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 3 });
    env.timers.set(fixes[0]!.t);
    await env.runtime.start(it0, placesFor(it0));
    await feed(env, fixes.slice(0, 20));
    const last = env.store.trip.value!.guidance.fix!;
    await env.runtime.end();
    expect(here.value).toMatchObject({ lat: last.lat, lng: last.lng, label: null });
  });

  it('QA-25: a stale trip ended without recent fixes clears "here" (the next plan locates afresh)', async () => {
    const { here } = await import('../src/state/location');
    here.value = { lat: 1, lng: 103, label: 'old' };
    const env = setup();
    const it0 = itinerary();
    await env.runtime.start(it0, placesFor(it0));
    env.timers.advance(60 * 60_000);
    await env.runtime.end();
    expect(here.value).toBeNull();
  });
});
