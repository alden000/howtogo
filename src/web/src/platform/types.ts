/**
 * Platform adapter (director ruling D-4). Everything device-specific goes
 * through this interface: the web implementation now, a Capacitor one in M6.
 * Native-friendly rules: every call is async (or fire-and-forget), payloads are
 * plain JSON-able objects, and no DOM types appear in signatures.
 */
import type { CuePriority, Lang } from '@howtogo/shared';

export interface LocationFix {
  lat: number;
  lng: number;
  /** Horizontal accuracy, metres. */
  acc: number;
  /** Degrees clockwise from north, if the device reports a course. */
  heading?: number;
  /** m/s */
  speed?: number;
  /** epoch ms */
  t: number;
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';
export type Unsubscribe = () => void;

export interface PlatformError {
  code: 'denied' | 'unavailable' | 'timeout' | 'unsupported';
  message: string;
}

export interface WatchOptions {
  highAccuracy?: boolean;
  /** Hint for native: desired interval (ms). The web ignores it. */
  intervalMs?: number;
}

export interface LocationApi {
  permission(): Promise<PermissionState>;
  current(opts?: WatchOptions): Promise<LocationFix>;
  /** Starts watching. Resolves to a stop function (call it, or `stop(id)`-style via the returned fn). */
  watch(onFix: (f: LocationFix) => void, onError?: (e: PlatformError) => void, opts?: WatchOptions): Promise<Unsubscribe>;
}

export interface HeadingApi {
  /** iOS needs a user gesture + DeviceOrientationEvent.requestPermission(). Resolves true when usable. */
  requestPermission(): Promise<boolean>;
  /** Compass heading in degrees (0 = north). */
  watch(onHeading: (deg: number) => void): Promise<Unsubscribe>;
}

export interface VoiceSupport {
  zh: boolean;
  en: boolean;
}

export interface SpeechApi {
  voices(): Promise<VoiceSupport>;
  /** `high` interrupts whatever is speaking; others queue. No-op while muted. */
  speak(text: string, lang: Lang, priority: CuePriority): Promise<void>;
  cancel(): Promise<void>;
  setMuted(muted: boolean): void;
}

export interface WakeLockApi {
  /** Keeps the screen on; re-acquired automatically when the page becomes visible again. */
  acquire(): Promise<boolean>;
  release(): Promise<void>;
}

export type VibratePattern = 'tap' | 'notice' | 'get_off' | 'alert' | 'arrived';

export interface NotifyCue {
  /** Stable tag: a newer notification with the same tag replaces the older one. */
  tag: string;
  title: string;
  body: string;
  priority: CuePriority;
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface BatteryApi {
  /** 0..1, or null when unknown. */
  level(): Promise<number | null>;
  /** Fires when level drops below `threshold` (default 0.2) and not charging. */
  onLow(cb: (level: number) => void, threshold?: number): Promise<Unsubscribe>;
}

/** Speech-to-text for the search mic (H2). Absent when the platform cannot do it (the mic is hidden). */
export interface RecognitionApi {
  /** Resolves with the best transcript ('' when nothing was heard); rejects on denial/error. */
  listen(lang: 'zh-CN' | 'en-SG'): Promise<string>;
  stop(): void;
}

export interface Platform {
  readonly kind: 'web' | 'fake' | 'demo' | 'native';
  location: LocationApi;
  heading: HeadingApi;
  speech: SpeechApi;
  wakeLock: WakeLockApi;
  vibrate(pattern: VibratePattern): Promise<void>;
  /** Shown only when the app is not visible (web) / always as lock-screen alert (native). */
  notify(cue: NotifyCue): Promise<void>;
  share(url: string, text: string): Promise<ShareOutcome>;
  battery?: BatteryApi;
  recognition?: RecognitionApi;
}

/** Vibration patterns (ms on/off). Kept here so web and native agree. */
export const VIBRATE_PATTERNS: Record<VibratePattern, number[]> = {
  tap: [30],
  notice: [120],
  get_off: [400, 150, 400, 150, 400],
  alert: [600, 200, 600],
  arrived: [200, 100, 200],
};
