import { beforeEach, describe, expect, it, vi } from 'vitest';
import { injectDeviation, simulateFixes, type Fix } from '@howtogo/shared';
import { FIXTURES } from '@howtogo/shared/fixtures';
import { ApiError } from '../src/api/errors';
import { logLines, resetLog } from '../src/log';
import { createFakePlatform } from '../src/platform/fake';
import { createStore } from '../src/state/store';
import { memoryKV } from '../src/state/storage';
import { createTripRuntime } from '../src/trip/runtime';
import { flush, itinerary, manualTimers, placesFor, stubApi } from './helpers';

const cuesLogged = () => logLines().filter((l) => l.startsWith('cue:')).map((l) => l.slice(4));

function setup(apiOver = {}, kv = memoryKV()) {
  const timers = manualTimers();
  const platform = createFakePlatform();
  const store = createStore(kv, memoryKV(), { tripWriteMs: 0 });
  const api = stubApi(apiOver);
  const runtime = createTripRuntime({ store, platform, api, now: timers.now, timers, idFactory: () => 'trip1' });
  return { timers, platform, store, api, runtime, kv };
}

const feed = async (platform: ReturnType<typeof createFakePlatform>, fixes: Fix[], timers?: ReturnType<typeof manualTimers>) => {
  for (const f of fixes) {
    timers?.set(f.t);
    platform.fake.emit(f);
    await flush();
  }
};

beforeEach(() => resetLog());

describe('trip runtime', () => {
  it('drives a bus trip end to end: cues in order, spoken, vibrated, arrival', async () => {
    const { platform, store, runtime } = setup();
    const it0 = itinerary('toaPayohToTTSH');
    await runtime.start(it0, placesFor(it0));
    expect(platform.fake.wakeLockHeld).toBe(true);
    await feed(platform, simulateFixes(it0, { seed: 3 }));
    const cues = cuesLogged();
    expect(cues[0]).toBe('step_changed');
    const nextStop = cues.indexOf('get_off_next_stop');
    const now = cues.indexOf('get_off_now');
    expect(nextStop).toBeGreaterThan(-1);
    expect(now).toBeGreaterThan(nextStop);
    expect(cues[cues.length - 1]).toBe('arrived_destination');
    expect(store.trip.value?.guidance.status).toBe('arrived');
    expect(platform.fake.spoken.length).toBeGreaterThanOrEqual(cues.length - 1);
    expect(platform.fake.spoken.every((s) => s.lang === 'zh-CN')).toBe(true);
    expect(platform.fake.vibrations).toContain('get_off');
    expect(platform.fake.notifications.some((n) => n.priority === 'high')).toBe(true);
    expect(platform.fake.wakeLockHeld).toBe(false);
    expect(store.recents.value[0]?.to.name).toBe('Tan Tock Seng Hospital');
  });

  it('mute silences speech but cues still fire', async () => {
    const { platform, store, runtime } = setup();
    store.updateSettings({ muted: true });
    const it0 = itinerary();
    await runtime.start(it0, placesFor(it0));
    await feed(platform, simulateFixes(it0, { seed: 3 }).slice(0, 40));
    expect(platform.fake.spoken).toHaveLength(0);
    expect(cuesLogged().length).toBeGreaterThan(0);
  });

  it('resumes a persisted trip after a reload and finishes it', async () => {
    const kv = memoryKV();
    const a = setup({}, kv);
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 5 });
    await a.runtime.start(it0, placesFor(it0));
    const half = Math.floor(fixes.length / 2);
    await feed(a.platform, fixes.slice(0, half));
    const stepBefore = a.store.trip.value!.guidance.stepIndex;
    expect(stepBefore).toBeGreaterThan(0);
    a.store.flushTrip();
    a.runtime.dispose();

    // "reload": new store/runtime/platform on the same storage
    const b = setup({}, kv);
    expect(b.store.trip.value?.guidance.stepIndex).toBe(stepBefore);
    expect(await b.runtime.resume()).toBe(true);
    expect(logLines()).toContain('trip:resumed');
    await feed(b.platform, fixes.slice(half));
    expect(b.store.trip.value?.guidance.status).toBe('arrived');
    expect(await b.runtime.resume()).toBe(false);
  });

  it('share: PUTs at most every 3 s with the latest fix; help bypasses the limit', async () => {
    const puts: { t: number; status: string; lat: number }[] = [];
    const { platform, runtime, timers } = setup({
      shareCreate: async () => ({ id: 'abc123def456', ownerToken: 'tok', viewPath: '/t/abc123def456', expiresAt: '' }),
      sharePut: async (_id: string, _tok: string, body: { status: string; lat: number }) => {
        puts.push({ t: timers.now(), status: body.status, lat: body.lat });
      },
    });
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 2, intervalS: 1 }).slice(0, 20);
    const t0 = fixes[0]!.t;
    timers.set(t0);
    await runtime.start(it0, placesFor(it0));
    await runtime.startShare();
    for (const f of fixes) {
      timers.advance(f.t - timers.now());
      platform.fake.emit(f);
      await flush();
    }
    timers.advance(3000);
    await flush();
    const span = fixes[fixes.length - 1]!.t - t0;
    expect(puts.length).toBeGreaterThan(2);
    expect(puts.length).toBeLessThanOrEqual(Math.ceil(span / 3000) + 2);
    for (let i = 1; i < puts.length; i++) expect(puts[i]!.t - puts[i - 1]!.t).toBeGreaterThanOrEqual(3000);
    // the last PUT carries the latest fix
    expect(puts[puts.length - 1]!.lat).toBeCloseTo(fixes[fixes.length - 1]!.lat, 5);

    const before = puts.length;
    runtime.help();
    await flush();
    expect(puts.length).toBe(before + 1);
    expect(puts[puts.length - 1]!.status).toBe('help');
  });

  it('share: 429 retries after Retry-After; 410 drops the share', async () => {
    let calls = 0;
    const { platform, runtime, timers, store } = setup({
      shareCreate: async () => ({ id: 'abc123def456', ownerToken: 'tok', viewPath: '/t/x', expiresAt: '' }),
      sharePut: async () => {
        calls++;
        if (calls === 2) throw new ApiError('http', { status: 429, code: 'rate_limited', retryAfterS: 2 });
        if (calls === 4) throw new ApiError('http', { status: 410, code: 'share_ended' });
      },
    });
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 2 });
    timers.set(fixes[0]!.t);
    await runtime.start(it0, placesFor(it0));
    platform.fake.emit(fixes[0]!);
    await runtime.startShare();
    await flush();
    expect(calls).toBe(1);
    timers.advance(3000);
    platform.fake.emit(fixes[1]!);
    await flush();
    expect(calls).toBe(2); // 429
    timers.advance(2000);
    await flush();
    expect(calls).toBe(3); // retried after Retry-After
    timers.advance(3000);
    platform.fake.emit(fixes[2]!);
    await flush();
    expect(calls).toBe(4);
    expect(store.trip.value?.share).toBeUndefined();
    expect(logLines()).toContain('share:gone');
  });

  it('re-routes from the current position on off_route', async () => {
    const route = vi.fn(async (_p: { start: { lat: number }; end: { lat: number } }) => FIXTURES.toaPayohToTTSH as unknown);
    const { platform, runtime, store } = setup({ route });
    const it0 = itinerary();
    await runtime.start(it0, placesFor(it0));
    const fixes = injectDeviation(simulateFixes(it0, { seed: 4 }), 5, 6, 150);
    await feed(platform, fixes.slice(0, 12));
    await flush();
    expect(cuesLogged()).toContain('off_route');
    expect(route).toHaveBeenCalledTimes(1);
    const arg = route.mock.calls[0]![0];
    expect(arg.start.lat).toBeCloseTo(store.trip.value!.guidance.fix!.lat, 2);
    expect(arg.end.lat).toBeCloseTo(placesFor(it0)[1]!.lat, 5);
    expect(logLines()).toContain('reroute:done');
    expect(store.trip.value?.reroutes).toBe(1);
  });

  it('end() deletes the share and clears the trip', async () => {
    const del = vi.fn(async () => {});
    const { runtime, store } = setup({
      shareCreate: async () => ({ id: 'abc123def456', ownerToken: 'tok', viewPath: '/t/x', expiresAt: '' }),
      sharePut: async () => {},
      shareDelete: del,
    });
    const it0 = itinerary();
    await runtime.start(it0, placesFor(it0));
    await runtime.startShare();
    await runtime.end();
    expect(del).toHaveBeenCalledWith('abc123def456', 'tok');
    expect(store.trip.value).toBeNull();
  });
});
