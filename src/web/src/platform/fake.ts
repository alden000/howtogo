/**
 * Fake platform for tests and demo mode (`?demo=1`). Location is driven by a
 * scripted fix stream (normally the shared engine's `simulateFixes`), played
 * back on a timer or stepped manually. Everything else records what it was asked.
 */
import type { BatteryReading, CuePriority, Lang } from '@howtogo/shared';
import type { LocationFix, NotifyCue, NotifyPermission, PermissionState, Platform, PlatformCapabilities, PlatformError, ShareOutcome, Unsubscribe, VibratePattern, VoiceSupport } from './types';

export interface FakeControls {
  /** Load a fix script; playback resumes from `startIndex`. */
  load(fixes: LocationFix[], startIndex?: number): void;
  /** Emit one scripted fix now. Returns false at the end of the script. */
  step(): boolean;
  play(intervalMs: number): void;
  pause(): void;
  /** Emit an arbitrary fix (also becomes the current position). */
  emit(fix: LocationFix): void;
  setPosition(fix: LocationFix): void;
  readonly index: number;
  readonly length: number;
  onProgress?: (index: number) => void;
  readonly spoken: { text: string; lang: Lang; priority: CuePriority; forced?: boolean }[];
  readonly vibrations: VibratePattern[];
  readonly notifications: NotifyCue[];
  readonly shares: { url: string; text: string }[];
  readonly wakeLockHeld: boolean;
  readonly muted: boolean;
  emitHeading(deg: number): void;
  /** Simulate the page going to the background / coming back (fires visibility listeners). */
  setVisible(visible: boolean): void;
  /** Make the next wake-lock requests succeed or fail. */
  setWakeLockOk(ok: boolean): void;
  /** Notification permission (and what a request answers). */
  setNotifyPermission(p: NotifyPermission, answer?: NotifyPermission): void;
  readonly notifyRequests: number;
  /** Location permission reported by `location.permission()`. */
  setPermission(p: PermissionState): void;
  /** Deliver a watch error to every watcher (e.g. denied). */
  emitError(e: PlatformError): void;
  /** `intervalMs` of every `location.watch` call, in order (AC 38 location profile). */
  readonly watchIntervals: (number | undefined)[];
  /** M5 AC 7: the full options of every `location.watch` call, in order (interval + accuracy per leg). */
  readonly watchOptions: { intervalMs?: number | undefined; highAccuracy?: boolean | undefined }[];
  /** M5 AC 8: the battery the fake reports (`battery.watch`); e.g. `{ supported: true, level: 0.15, charging: false }`. */
  setBattery(r: BatteryReading): void;
  readonly wakeLockRequests: number;
}

export type FakePlatform = Platform & { fake: FakeControls };

export interface FakeTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

const defaultTimers: FakeTimers = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof setInterval>),
};

export interface FakePlatformOptions {
  start?: LocationFix;
  timers?: FakeTimers;
  shareOutcome?: ShareOutcome;
  /** M5 AC 8: initial battery (default 80 %, not charging). */
  battery?: BatteryReading;
  capabilities?: Partial<PlatformCapabilities>;
  voices?: VoiceSupport;
  wakeLockOk?: boolean;
  permission?: PermissionState;
  notifyPermission?: NotifyPermission;
}

export function createFakePlatform(opts: FakePlatformOptions = {}): FakePlatform {
  const timers = opts.timers ?? defaultTimers;
  let script: LocationFix[] = [];
  let idx = 0;
  let timer: unknown = null;
  let position: LocationFix | undefined = opts.start;
  const watchers = new Set<(f: LocationFix) => void>();
  const headingWatchers = new Set<(d: number) => void>();
  const spoken: FakeControls['spoken'] = [];
  const vibrations: VibratePattern[] = [];
  const notifications: NotifyCue[] = [];
  const shares: { url: string; text: string }[] = [];
  let wakeLockHeld = false;
  let wakeLockOk = opts.wakeLockOk ?? true;
  let wakeLockRequests = 0;
  let muted = false;
  let visible = true;
  let permission: PermissionState = opts.permission ?? 'granted';
  let notifyPerm: NotifyPermission = opts.notifyPermission ?? 'granted';
  let notifyAnswer: NotifyPermission = 'granted';
  let notifyRequests = 0;
  const visWatchers = new Set<(v: boolean) => void>();
  const errWatchers = new Set<(e: PlatformError) => void>();
  const watchIntervals: (number | undefined)[] = [];
  const watchOptions: { intervalMs?: number | undefined; highAccuracy?: boolean | undefined }[] = [];
  let batteryReading: BatteryReading = opts.battery ?? { supported: true, level: 0.8, charging: false };
  const batteryWatchers = new Set<(r: BatteryReading) => void>();

  const deliver = (f: LocationFix) => {
    position = f;
    for (const w of [...watchers]) w(f);
  };

  const controls: FakeControls = {
    load(fixes, startIndex = 0) {
      script = fixes;
      idx = Math.max(0, Math.min(startIndex, fixes.length));
      if (idx > 0) position = fixes[idx - 1];
      else if (fixes[0]) position = fixes[0];
    },
    step() {
      const f = script[idx];
      if (!f) {
        controls.pause();
        return false;
      }
      idx++;
      deliver(f);
      controls.onProgress?.(idx);
      return true;
    },
    play(intervalMs) {
      controls.pause();
      timer = timers.setInterval(() => {
        if (watchers.size > 0) controls.step();
      }, intervalMs);
    },
    pause() {
      if (timer !== null) timers.clearInterval(timer);
      timer = null;
    },
    emit(fix) {
      deliver(fix);
    },
    setPosition(fix) {
      position = fix;
    },
    get index() {
      return idx;
    },
    get length() {
      return script.length;
    },
    spoken,
    vibrations,
    notifications,
    shares,
    get wakeLockHeld() {
      return wakeLockHeld;
    },
    get muted() {
      return muted;
    },
    emitHeading(deg) {
      for (const w of [...headingWatchers]) w(deg);
    },
    setVisible(v) {
      visible = v;
      if (!v) wakeLockHeld = false; // the browser drops the lock when hidden
      for (const w of [...visWatchers]) w(v);
    },
    setNotifyPermission(p, answer) {
      notifyPerm = p;
      if (answer) notifyAnswer = answer;
    },
    get notifyRequests() {
      return notifyRequests;
    },
    setWakeLockOk(ok) {
      wakeLockOk = ok;
    },
    setPermission(p) {
      permission = p;
    },
    emitError(e) {
      for (const w of [...errWatchers]) w(e);
    },
    watchIntervals,
    watchOptions,
    setBattery(r: BatteryReading) {
      batteryReading = r;
      for (const cb of [...batteryWatchers]) cb(r);
    },
    get wakeLockRequests() {
      return wakeLockRequests;
    },
  };

  return {
    kind: 'fake',
    fake: controls,
    capabilities: { backgroundGuidance: false, speechNeedsGesture: false, os: 'other', ...opts.capabilities },
    visibility: {
      isVisible: () => visible,
      onChange(cb) {
        visWatchers.add(cb);
        return () => visWatchers.delete(cb);
      },
    },
    location: {
      async permission() {
        return permission;
      },
      async current() {
        if (!position) throw { code: 'unavailable', message: 'fake: no position' };
        return position;
      },
      async watch(onFix, onError, o = {}): Promise<Unsubscribe> {
        watchIntervals.push(o.intervalMs);
        watchOptions.push({ intervalMs: o.intervalMs, highAccuracy: o.highAccuracy });
        watchers.add(onFix);
        if (onError) errWatchers.add(onError);
        if (permission === 'denied') queueMicrotask(() => onError?.({ code: 'denied', message: 'fake: denied' }));
        return () => {
          watchers.delete(onFix);
          if (onError) errWatchers.delete(onError);
        };
      },
    },
    heading: {
      async requestPermission() {
        return true;
      },
      async watch(cb) {
        headingWatchers.add(cb);
        return () => headingWatchers.delete(cb);
      },
    },
    speech: {
      async voices() {
        return opts.voices ?? { zh: true, en: true };
      },
      async speak(text, lang, priority, o = {}) {
        if (!muted || o.force) spoken.push({ text, lang, priority, ...(o.force ? { forced: true } : {}) });
      },
      async cancel() {},
      setMuted(m) {
        muted = m;
      },
    },
    wakeLock: {
      async acquire() {
        wakeLockRequests++;
        if (!wakeLockOk || !visible) return false;
        wakeLockHeld = true;
        return true;
      },
      async release() {
        wakeLockHeld = false;
      },
    },
    async vibrate(p) {
      vibrations.push(p);
    },
    async notify(cue) {
      notifications.push(cue);
    },
    notifications: {
      permission: () => notifyPerm,
      async request() {
        notifyRequests++;
        notifyPerm = notifyAnswer;
        return notifyPerm;
      },
    },
    async share(url, text) {
      shares.push({ url, text });
      return opts.shareOutcome ?? 'copied';
    },
    battery: {
      async level() {
        return batteryReading.level;
      },
      async onLow() {
        return () => {};
      },
      async watch(cb) {
        batteryWatchers.add(cb);
        cb(batteryReading);
        return () => batteryWatchers.delete(cb);
      },
    },
  };
}

/**
 * Demo platform: fake location/heading (scripted trip) with the real web
 * speech, vibration, wake lock, notifications and share, so a demo sounds real.
 */
export function createDemoPlatform(web: Platform, fake: FakePlatform): FakePlatform {
  return { ...web, kind: 'demo', location: fake.location, heading: fake.heading, fake: fake.fake, battery: fake.battery! };
}
