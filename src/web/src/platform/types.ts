/**
 * Platform adapter (director ruling D-4). Everything device-specific goes
 * through this interface: the web implementation now, a Capacitor one in M6.
 * Native-friendly rules: every call is async (or fire-and-forget), payloads are
 * plain JSON-able objects, and no DOM types appear in signatures.
 */
import { HAPTIC_PATTERNS, type CuePriority, type HapticName, type Lang } from '@howtogo/shared';

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

export interface SpeakOptions {
  force?: boolean;
}

export interface SpeechApi {
  voices(): Promise<VoiceSupport>;
  /**
   * `high` interrupts whatever is speaking; others queue. No-op while muted unless
   * `force` (a "say it again" tap is consent, AC 25). Resolves when the line has
   * been spoken (or could not be), so the runtime can run its own queue (AC 23).
   */
  speak(text: string, lang: Lang, priority: CuePriority, opts?: SpeakOptions): Promise<void>;
  cancel(): Promise<void>;
  setMuted(muted: boolean): void;
}

export interface WakeLockApi {
  /**
   * Keeps the screen on. Resolves false when the platform refuses (no API, no
   * user gesture, low battery). Idempotent: the runtime calls it again on every
   * `visibility` change to visible (the browser drops the lock when hidden).
   */
  acquire(): Promise<boolean>;
  release(): Promise<void>;
}

/** Canonical haptic names (STYLE-GUIDE 6c.13): tick, confirm, attention, getoff, arrive, gentle. */
export type VibratePattern = HapticName;

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

/** What this platform can do, so the UI can adapt (AC 38). */
export interface PlatformCapabilities {
  /** Guidance keeps running with the screen off (native M6). Web: false. */
  backgroundGuidance: boolean;
  /** Speech and wake lock need a fresh user gesture after a reload (iOS-like): resume shows "Tap to turn voice back on". */
  speechNeedsGesture: boolean;
  os: 'ios' | 'android' | 'other';
}

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export interface NotificationsApi {
  permission(): NotifyPermission;
  request(): Promise<NotifyPermission>;
}

/** Page / app foreground state (web: document.visibilityState). */
export interface VisibilityApi {
  isVisible(): boolean;
  onChange(cb: (visible: boolean) => void): Unsubscribe;
}

export interface Platform {
  readonly kind: 'web' | 'fake' | 'demo' | 'native';
  readonly capabilities: PlatformCapabilities;
  visibility: VisibilityApi;
  location: LocationApi;
  heading: HeadingApi;
  speech: SpeechApi;
  wakeLock: WakeLockApi;
  vibrate(pattern: VibratePattern): Promise<void>;
  /** Shown only when the app is not visible (web) / always as lock-screen alert (native). */
  notify(cue: NotifyCue): Promise<void>;
  /** Notification permission (QA-21): read synchronously, request only from a user gesture (Start). */
  notifications: NotificationsApi;
  share(url: string, text: string): Promise<ShareOutcome>;
  battery?: BatteryApi;
  recognition?: RecognitionApi;
}

/** Vibration patterns (ms on/off), the 6c.13 table. Kept here so web and native agree. */
export const VIBRATE_PATTERNS: Record<VibratePattern, number[]> = HAPTIC_PATTERNS;
