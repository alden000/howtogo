/**
 * Fake platform for tests and demo mode (`?demo=1`). Location is driven by a
 * scripted fix stream (normally the shared engine's `simulateFixes`), played
 * back on a timer or stepped manually. Everything else records what it was asked.
 */
import type { CuePriority, Lang } from '@howtogo/shared';
import type { LocationFix, NotifyCue, Platform, ShareOutcome, Unsubscribe, VibratePattern } from './types';

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
  readonly spoken: { text: string; lang: Lang; priority: CuePriority }[];
  readonly vibrations: VibratePattern[];
  readonly notifications: NotifyCue[];
  readonly shares: { url: string; text: string }[];
  readonly wakeLockHeld: boolean;
  readonly muted: boolean;
  emitHeading(deg: number): void;
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

export function createFakePlatform(opts: { start?: LocationFix; timers?: FakeTimers; shareOutcome?: ShareOutcome } = {}): FakePlatform {
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
  let muted = false;

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
  };

  return {
    kind: 'fake',
    fake: controls,
    location: {
      async permission() {
        return 'granted';
      },
      async current() {
        if (!position) throw { code: 'unavailable', message: 'fake: no position' };
        return position;
      },
      async watch(onFix): Promise<Unsubscribe> {
        watchers.add(onFix);
        return () => watchers.delete(onFix);
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
        return { zh: true, en: true };
      },
      async speak(text, lang, priority) {
        if (!muted) spoken.push({ text, lang, priority });
      },
      async cancel() {},
      setMuted(m) {
        muted = m;
      },
    },
    wakeLock: {
      async acquire() {
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
    async share(url, text) {
      shares.push({ url, text });
      return opts.shareOutcome ?? 'copied';
    },
    battery: {
      async level() {
        return 0.8;
      },
      async onLow() {
        return () => {};
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
