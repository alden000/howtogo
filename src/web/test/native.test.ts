/**
 * M6: the native platform adapter (Capacitor bridge mocked) and the runtime's native paths:
 * per-leg hints, backup-alert arming, JS/native alert dedupe, fix-driven cues with frozen timers.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { simulateFixes, type Fix } from '@howtogo/shared';
import { logLines, resetLog } from '../src/log';
import { createFakePlatform, type FakePlatform } from '../src/platform/fake';
import { createNativePlatform, isNativeApp, type CapacitorBridge } from '../src/platform/native';
import type { LegHint, NativeAlert, TripAlertEvent, TripServiceApi } from '../src/platform/types';
import { createStore } from '../src/state/store';
import { memoryKV } from '../src/state/storage';
import { createTripRuntime } from '../src/trip/runtime';
import { flush, itinerary, manualTimers, placesFor, stubApi } from './helpers';

beforeEach(() => resetLog());

// ------------------------------------------------------------------ mocked Capacitor bridge
function mockBridge(perms = { location: 'granted', notifications: 'prompt' }) {
  const calls: { plugin: string; method: string; opts?: Record<string, unknown> }[] = [];
  const listeners = new Map<string, Set<(d: unknown) => void>>();
  const replies: Record<string, (o?: Record<string, unknown>) => unknown> = {
    'Trip.checkTripPermissions': () => perms,
    'Trip.requestTripPermissions': (o) => {
      for (const w of (o?.which as string[]) ?? []) (perms as Record<string, string>)[w] = 'granted';
      return perms;
    },
    'Trip.current': () => ({ lat: 1.33, lng: 103.84, acc: 8, t: 1 }),
    'Trip.voices': () => ({ zh: true, en: true }),
    'Trip.deviceInfo': () => ({ manufacturer: 'samsung', brand: 'samsung', sdk: 35, batteryUnrestricted: false, playServices: true, lastTripKilled: false }),
  };
  const bridge: CapacitorBridge = {
    isNativePlatform: () => true,
    nativePromise<T>(plugin: string, method: string, opts?: object) {
      calls.push({ plugin, method, opts: opts as Record<string, unknown> });
      const r = replies[`${plugin}.${method}`];
      return Promise.resolve((r ? r(opts as Record<string, unknown>) : undefined) as T);
    },
    addListener(plugin, event, cb) {
      const k = `${plugin}.${event}`;
      if (!listeners.has(k)) listeners.set(k, new Set());
      listeners.get(k)!.add(cb as (d: unknown) => void);
      return { remove: () => void listeners.get(k)!.delete(cb as (d: unknown) => void) };
    },
  };
  const emit = (k: string, d: unknown = {}) => listeners.get(k)?.forEach((cb) => cb(d));
  const named = (m: string) => calls.filter((c) => c.method === m);
  return { bridge, calls, named, emit, listeners, perms };
}

const visibleWeb = (visible = true) => {
  const web = createFakePlatform();
  web.fake.setVisible(visible);
  return web;
};

describe('native adapter (Capacitor mocked)', () => {
  it('is not chosen on the web', () => {
    expect(isNativeApp()).toBe(false);
  });

  it('capabilities: native, background guidance, no gesture needed; wake lock is a no-op', async () => {
    const m = mockBridge();
    const p = await createNativePlatform(visibleWeb(), m.bridge);
    expect(p.kind).toBe('native');
    expect(p.capabilities).toMatchObject({ native: true, backgroundGuidance: true, speechNeedsGesture: false, os: 'android' });
    expect(await p.wakeLock.acquire()).toBe(true);
  });

  it('location.current = one-shot request, no service (AC 7)', async () => {
    const m = mockBridge();
    const p = await createNativePlatform(visibleWeb(), m.bridge);
    const f = await p.location.current({ highAccuracy: true });
    expect(f.lat).toBe(1.33);
    expect(m.named('current')).toHaveLength(1);
    expect(m.named('start')).toHaveLength(0);
  });

  it('location.current asks for permission when undecided; denied → PlatformError denied', async () => {
    const m = mockBridge({ location: 'prompt', notifications: 'prompt' });
    const p = await createNativePlatform(visibleWeb(), m.bridge);
    await p.location.current();
    expect(m.named('requestTripPermissions')[0]!.opts).toEqual({ which: ['location'] });

    const d = mockBridge({ location: 'denied', notifications: 'denied' });
    const pd = await createNativePlatform(visibleWeb(), d.bridge);
    await expect(pd.location.current()).rejects.toMatchObject({ code: 'denied' });
    expect(d.named('current')).toHaveLength(0);
  });

  it('location.watch starts the TripService; fixes arrive as events; stop ends the service (AC 7, 11)', async () => {
    const m = mockBridge();
    const p = await createNativePlatform(visibleWeb(), m.bridge);
    const got: number[] = [];
    const stop = await p.location.watch((f) => got.push(f.t));
    expect(m.named('start')).toHaveLength(1);
    expect(m.named('start')[0]!.opts).toMatchObject({ leg: 'walk', title: '行程进行中', stopLabel: '结束行程' });
    m.emit('Trip.fix', { lat: 1, lng: 2, acc: 5, t: 10 });
    m.emit('Trip.fix', { lat: 1, lng: 2, acc: 5, t: 11 });
    expect(got).toEqual([10, 11]);
    stop();
    stop();
    await flush();
    expect(m.named('stop')).toHaveLength(1);
    m.emit('Trip.fix', { lat: 1, lng: 2, acc: 5, t: 12 });
    expect(got).toHaveLength(2);
  });

  it('speech: native TTS, high = flush, muted unless forced; voices from the engine (AC 8)', async () => {
    const m = mockBridge();
    const p = await createNativePlatform(visibleWeb(), m.bridge);
    await p.speech.speak('下一站下车', 'zh-CN', 'high');
    expect(m.named('speak')[0]!.opts).toEqual({ text: '下一站下车', lang: 'zh-CN', flush: true });
    p.speech.setMuted(true);
    await p.speech.speak('x', 'zh-CN', 'normal');
    expect(m.named('speak')).toHaveLength(1);
    await p.speech.speak('again', 'zh-CN', 'normal', { force: true });
    expect(m.named('speak')).toHaveLength(2);
    expect(await p.speech.voices()).toEqual({ zh: true, en: true });
  });

  it('vibrate passes the canonical 6c.13 name; notify: get-off always, other cues only when hidden (AC 9, 21)', async () => {
    const m = mockBridge();
    const web = visibleWeb(true);
    const p = await createNativePlatform(web, m.bridge);
    await p.vibrate('getoff');
    expect(m.named('vibrate')[0]!.opts).toEqual({ name: 'getoff' });
    await p.notify({ tag: 'howtogo-cue', title: 't', body: 'b', priority: 'normal' });
    expect(m.named('notify')).toHaveLength(0);
    await p.notify({ tag: 'getoff', title: '下一站下车', body: 'Toa Payoh Int', priority: 'high', alertId: 'a:b:next' });
    expect(m.named('notify')[0]!.opts).toMatchObject({ priority: 'high', alertId: 'a:b:next' });
    web.fake.setVisible(false);
    await p.notify({ tag: 'howtogo-cue', title: 't', body: 'b', priority: 'normal' });
    expect(m.named('notify')).toHaveLength(2);
  });

  it('notification permission: synchronous read, request asks only for notifications (AC 27)', async () => {
    const m = mockBridge();
    const p = await createNativePlatform(visibleWeb(), m.bridge);
    expect(p.notifications.permission()).toBe('default');
    expect(await p.notifications.request()).toBe('granted');
    expect(m.named('requestTripPermissions')[0]!.opts).toEqual({ which: ['notifications'] });
    expect(p.notifications.permission()).toBe('granted');
  });

  it('trip service: native-fired ids are known synchronously; stop request before subscribe is kept', async () => {
    const m = mockBridge();
    const p = await createNativePlatform(visibleWeb(), m.bridge);
    m.emit('Trip.stopRequested');
    const seen: TripAlertEvent[] = [];
    p.trip!.onAlert((e) => seen.push(e));
    m.emit('Trip.alert', { id: 't:s:next', kind: 'next', type: 'fired' });
    expect(p.trip!.firedNatively('t:s:next')).toBe(true);
    expect(p.trip!.firedNatively('t:s:now')).toBe(false);
    expect(seen).toHaveLength(1);
    p.trip!.markFired('t:s:now');
    expect(m.named('markFired')[0]!.opts).toEqual({ id: 't:s:now' });
    let stops = 0;
    p.trip!.onStopRequested(() => stops++);
    await flush();
    expect(stops).toBe(1);
  });

  it('Back: toggleBackButtonHandler(depth > 0) only on change; backButton → callback (AC 24)', async () => {
    const m = mockBridge();
    const p = await createNativePlatform(visibleWeb(), m.bridge);
    let backs = 0;
    p.device!.onBack(() => backs++);
    p.device!.setBackDepth(0);
    p.device!.setBackDepth(2);
    p.device!.setBackDepth(1);
    p.device!.setBackDepth(0);
    const t = m.calls.filter((c) => c.plugin === 'App' && c.method === 'toggleBackButtonHandler').map((c) => c.opts!.enabled);
    expect(t).toEqual([false, true, false]);
    m.emit('App.backButton');
    expect(backs).toBe(1);
  });

  it('device info + settings shortcuts (battery guide, AC 29)', async () => {
    const m = mockBridge();
    const p = await createNativePlatform(visibleWeb(), m.bridge);
    expect((await p.device!.info()).manufacturer).toBe('samsung');
    await p.device!.openSettings('battery');
    expect(m.named('openSettings')[0]!.opts).toEqual({ target: 'battery' });
  });
});

// ------------------------------------------------------------------ runtime on a native-like platform
function fakeTripService() {
  const legs: LegHint[] = [];
  const armed: NativeAlert[][] = [];
  const marked: string[] = [];
  const acks: string[] = [];
  let disarms = 0;
  const fired = new Set<string>();
  const subs = new Set<(e: TripAlertEvent) => void>();
  const svc: TripServiceApi = {
    setLeg: async (h) => void legs.push(h),
    arm: async (a) => void armed.push(a),
    disarm: async () => void disarms++,
    firedNatively: (id) => fired.has(id),
    markFired: (id) => void marked.push(id),
    ack: (id) => void acks.push(id),
    onAlert: (cb) => (subs.add(cb), () => subs.delete(cb)),
    onStopRequested: () => () => {},
  };
  /** The service alerts first (as on a fix inside the radius). */
  const nativeFire = (id: string, kind: 'next' | 'now') => {
    fired.add(id);
    subs.forEach((cb) => cb({ id, kind, type: 'fired' }));
  };
  const nativeAck = (id: string, kind: 'next' | 'now') => subs.forEach((cb) => cb({ id, kind, type: 'ack' }));
  return { svc, legs, armed, marked, acks, nativeFire, nativeAck, disarms: () => disarms };
}

function setupNative() {
  const timers = manualTimers();
  const fake: FakePlatform = createFakePlatform();
  const svc = fakeTripService();
  const platform = { ...fake, trip: svc.svc };
  const store = createStore(memoryKV(), memoryKV(), { tripWriteMs: 0 });
  const runtime = createTripRuntime({ store, platform, api: stubApi(), now: timers.now, timers, idFactory: () => 'trip1', isOnline: () => true });
  return { timers, fake, svc, store, runtime };
}
type NEnv = ReturnType<typeof setupNative>;

/** Timers frozen: the clock moves with the fixes but no setTimeout/setInterval ever runs (hidden WebView, AC 16). */
async function feedFrozen(env: NEnv, fixes: Fix[], until?: () => boolean) {
  for (const f of fixes) {
    env.timers.set(Math.max(env.timers.now(), f.t));
    env.fake.fake.emit(f);
    await flush();
    if (until?.()) return;
  }
}

const has = (l: string) => logLines().includes(l);
const count = (l: string) => logLines().filter((x) => x === l).length;

describe('runtime with the native trip service', () => {
  async function startBus(env: NEnv) {
    const it0 = itinerary();
    const fixes = simulateFixes(it0, { seed: 3 });
    env.timers.set(fixes[0]!.t);
    await env.runtime.start(it0, placesFor(it0));
    return fixes;
  }

  it('leg hints instead of watch restarts; ride leg arms next + now with trip:step:kind ids (AC 12, 17)', async () => {
    const env = setupNative();
    const fixes = await startBus(env);
    await feedFrozen(env, fixes, () => env.runtime.ui.value.alert?.kind === 'next');
    expect(env.fake.fake.watchIntervals).toHaveLength(1); // the FGS is never restarted per leg
    const kinds = env.svc.legs.map((l) => l.kind);
    expect(kinds[0]).toBe('walk');
    expect(kinds).toContain('wait');
    expect(kinds).toContain('ride');
    expect(env.svc.legs.every((l) => !/\d+\.\d{4,}/.test(l.body))).toBe(true); // no coordinates in the notification
    const set = env.svc.armed.find((a) => a.length > 0)!;
    expect(set.map((a) => a.kind)).toEqual(['next', 'now']);
    const stepId = env.store.trip.value!.alert!.stepId;
    expect(set.map((a) => a.id)).toEqual([`trip1:${stepId}:next`, `trip1:${stepId}:now`]);
    expect(set[0]!.title).toBe('下一站下车');
    expect(set[0]!.speak).toBeTruthy();
    // 6h.7: alert text = stop sign first, advice after " · "; ongoing title = step short text, app language passed.
    expect(set[0]!.body).toMatch(/ · 请现在按铃$/);
    expect(set[1]!.body).toMatch(/ · 车停稳了再站起来$/);
    const ride = env.svc.legs.find((l) => l.kind === 'ride')!;
    expect(ride.title).toMatch(/^坐 \S+ 号 · 还有 \d+ 站$/);
    expect(ride.lang).toBe('zh-CN');
    const wait = env.svc.legs.find((l) => l.kind === 'wait')!;
    expect(wait.title).toMatch(/^等 \S+ 号巴士 · /);
    // lock-screen rule: no destination name in any leg title
    const dest = env.store.trip.value!.places.at(-1)!.name;
    if (dest) expect(env.svc.legs.every((l) => !(l.title ?? '').includes(dest))).toBe(true);
  });

  it('JS first: alerts once and marks the id so the service skips it (AC 18)', async () => {
    const env = setupNative();
    const fixes = await startBus(env);
    await feedFrozen(env, fixes, () => env.runtime.ui.value.alert?.kind === 'next');
    const stepId = env.store.trip.value!.alert!.stepId;
    expect(env.svc.marked).toContain(`trip1:${stepId}:next`);
    expect(env.fake.fake.vibrations.filter((v) => v === 'getoff')).toHaveLength(1);
    expect(env.fake.fake.notifications.find((n) => n.tag === 'getoff')?.alertId).toBe(`trip1:${stepId}:next`);
    expect(env.fake.fake.notifications.find((n) => n.tag === 'getoff')).toMatchObject({ title: '下一站下车', kind: 'getoff-next' });
  });

  it('native first: the H6 sheet shows but nothing buzzes, speaks or notifies twice (AC 18)', async () => {
    const env = setupNative();
    const fixes = await startBus(env);
    // Fire natively as soon as the next-stop alert is armed, before the JS cue.
    let fired = false;
    await feedFrozen(env, fixes, () => {
      const a = env.svc.armed.find((x) => x.length > 0);
      if (a && !fired) {
        fired = true;
        env.svc.nativeFire(a[0]!.id, 'next');
      }
      return env.runtime.ui.value.alert?.kind === 'next';
    });
    expect(has('alert:native-next')).toBe(true);
    expect(has('alert:dedupe')).toBe(true);
    expect(env.runtime.ui.value.alert?.kind).toBe('next');
    expect(env.fake.fake.vibrations.filter((v) => v === 'getoff')).toHaveLength(0);
    expect(env.fake.fake.notifications.filter((n) => n.tag === 'getoff')).toHaveLength(0);
    expect(env.svc.marked).toHaveLength(0);
  });

  it('"知道了" on the lock screen acknowledges the in-app alert; in-app ack tells the service', async () => {
    const env = setupNative();
    const fixes = await startBus(env);
    await feedFrozen(env, fixes, () => env.runtime.ui.value.alert?.kind === 'next');
    const id = `trip1:${env.store.trip.value!.alert!.stepId}:next`;
    env.svc.nativeAck(id, 'next');
    expect(env.runtime.ui.value.alert).toBeNull();
    expect(has('alert:ack')).toBe(true);
    expect(env.svc.acks).toEqual([id]);
  });

  it('timers frozen: the whole bus replay still gives next → escalation on a fix → now → arrival (AC 16)', async () => {
    const env = setupNative();
    const fixes = await startBus(env);
    await feedFrozen(env, fixes);
    const i = (l: string) => logLines().indexOf(l);
    expect(i('alert:next')).toBeGreaterThan(-1);
    expect(i('alert:now')).toBeGreaterThan(i('alert:next'));
    expect(has('trip:arrived')).toBe(true);
    expect(count('alert:next')).toBe(1);
    expect(count('alert:now')).toBe(1);
    expect(env.svc.disarms()).toBeGreaterThan(0); // arrival disarms
  });

  it('escalation runs on the first fix after 20 s even when no timer fires', async () => {
    const env = setupNative();
    const fixes = await startBus(env);
    await feedFrozen(env, fixes, () => env.runtime.ui.value.alert?.kind === 'next');
    const a = env.store.trip.value!.alert!;
    const last = env.store.trip.value!.guidance.fix!;
    env.timers.set(a.shownAt + 20_000);
    env.fake.fake.emit({ ...last, t: last.t + 25_000 });
    await flush();
    expect(has('alert:escalate')).toBe(true);
  });

  it('end disarms and stops the service watch (AC 19)', async () => {
    const env = setupNative();
    const fixes = await startBus(env);
    await feedFrozen(env, fixes.slice(0, 5));
    const before = env.svc.disarms();
    await env.runtime.end();
    expect(env.svc.disarms()).toBeGreaterThan(before);
  });
});

describe('OEM battery guide hook (AC 29, 30)', async () => {
  const { guideBrand, batteryGuideDue, BATTERY_GUIDE } = await import('../src/platform/batteryGuide');
  const info = { manufacturer: 'Xiaomi', brand: 'Redmi', sdk: 34, batteryUnrestricted: false, playServices: true, lastTripKilled: false };
  it('brand by manufacturer, generic fallback; every brand has steps', () => {
    expect(['samsung', 'Xiaomi', 'POCO', 'realme', 'vivo', 'HONOR', 'OnePlus', 'Google', 'motorola'].map(guideBrand)).toEqual([
      'samsung', 'xiaomi', 'xiaomi', 'oppo', 'vivo', 'huawei', 'oppo', 'google', 'generic',
    ]);
    // 6h.4: open 'app' everywhere; first step Open settings, last Go back; pictures named for their brand.
    for (const [b, g] of Object.entries(BATTERY_GUIDE)) {
      expect(g.steps.length).toBeGreaterThanOrEqual(4);
      expect(g.open).toBe('app');
      expect(g.steps[0]!.en).toBe('Tap "Open settings" below.');
      expect(g.steps[g.steps.length - 1]!.en).toBe('Go back to 怎么去.');
      for (const pic of Object.values(g.pictures)) expect(pic.startsWith(b === 'generic' ? 'bg-google-' : `bg-${b}-`)).toBe(true);
    }
    expect(BATTERY_GUIDE.xiaomi.unchecked).toBe('autostart');
    expect(BATTERY_GUIDE.huawei.unchecked).toBe('switches');
    expect(BATTERY_GUIDE.samsung.unchecked).toBeUndefined();
  });
  it('once before the first trip; a note after a kill; never when already unrestricted', () => {
    expect(batteryGuideDue(info, false)).toBe('guide');
    expect(batteryGuideDue(info, true)).toBeNull();
    expect(batteryGuideDue({ ...info, lastTripKilled: true }, true)).toBe('killed-note');
    expect(batteryGuideDue({ ...info, batteryUnrestricted: true, lastTripKilled: true }, false)).toBeNull();
  });
});
