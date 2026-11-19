/**
 * Platform adapter (director ruling D-4). Everything device-specific goes
 * through this interface: the web implementation now, a Capacitor one in M6.
 * Native-friendly rules: every call is async (or fire-and-forget), payloads are
 * plain JSON-able objects, and no DOM types appear in signatures.
 */
import { HAPTIC_PATTERNS, type BatteryReading, type CuePriority, type HapticName, type Lang } from '@howtogo/shared';

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
  /** M6: get-off alerts carry their id so the lock-screen "知道了" acknowledges the right one. */
  alertId?: string;
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface BatteryApi {
  /** 0..1, or null when unknown. */
  level(): Promise<number | null>;
  /** Fires when level drops below `threshold` (default 0.2) and not charging. */
  onLow(cb: (level: number) => void, threshold?: number): Promise<Unsubscribe>;
  /**
   * M5 AC 8: level + charging now and on every change (low-battery mode). Optional: a platform without it is
   * treated as "Battery API unsupported" (Auto behaves like Off).
   */
  watch?(cb: (r: BatteryReading) => void): Promise<Unsubscribe>;
}

/** 1.1 voice search: one speech-to-text candidate. `confidence` 0..1 (0 when the engine gives none). */
export interface SpeechAlternative {
  transcript: string;
  confidence: number;
}

/** 1.1: what was heard — the best transcript plus every alternative (best first, ≤ 3, includes the best). */
export interface Heard {
  text: string;
  alternatives: SpeechAlternative[];
}

/** Speech-to-text for the search mic (H2). Absent when the platform cannot do it (the mic is hidden). */
export interface RecognitionApi {
  /** Resolves with the best transcript ('' when nothing was heard); rejects on denial/error. */
  listen(lang: 'zh-CN' | 'en-SG'): Promise<string>;
  /**
   * 1.1: same as listen() but with up to 3 alternatives (maxAlternatives = 3). Optional so older
   * implementations stay valid; callers fall back to listen().
   */
  listenAll?(lang: 'zh-CN' | 'en-SG'): Promise<Heard>;
  stop(): void;
}

/** What this platform can do, so the UI can adapt (AC 38). */
export interface PlatformCapabilities {
  /** Guidance keeps running with the screen off (native M6). Web: false. */
  backgroundGuidance: boolean;
  /** Speech and wake lock need a fresh user gesture after a reload (iOS-like): resume shows "Tap to turn voice back on". */
  speechNeedsGesture: boolean;
  os: 'ios' | 'android' | 'other';
  /** M6: running inside the Android app (Capacitor). The UI hides keep-screen-on advice, the wake-lock note and the install helper. */
  native?: boolean;
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

/** M6 AC 12: what the native trip service needs to pick its interval/priority (the table lives in Java). */
export type LegKind = 'walk' | 'wait' | 'ride' | 'last_walk';
export interface LegHint {
  kind: LegKind;
  /** Ride legs: stops still ahead (incl. the alighting stop), or null when unknown. */
  stopsLeft: number | null;
  lowBattery: boolean;
  /** Ongoing-notification line ("current step short text"), no coordinates. */
  body: string;
}

/** A native backup get-off alert (M6 AC 17). id = `trip:step:kind`. */
export interface NativeAlert {
  id: string;
  kind: 'next' | 'now';
  lat: number;
  lng: number;
  radiusM: number;
  title: string;
  body: string;
  speak: string;
  lang: Lang;
}

export interface TripAlertEvent {
  id: string;
  kind: 'next' | 'now';
  /** fired = the native service alerted first; ack = "知道了" on the lock screen. */
  type: 'fired' | 'ack';
}

/**
 * The native trip service (M6 §C/§D), present only in the Android app. The runtime drives it from
 * fix events: leg changes, arming the backup alerts, and the JS/native alert dedupe.
 */
export interface TripServiceApi {
  setLeg(hint: LegHint): Promise<void>;
  /** Replaces the armed alerts (start of a ride leg, re-route). */
  arm(alerts: NativeAlert[]): Promise<void>;
  /** End, off-route on a ride leg, arrival, leaving a ride leg. */
  disarm(): Promise<void>;
  /** Synchronous: the native side already alerted this id (the JS side then skips its haptic/voice/notification). */
  firedNatively(id: string): boolean;
  /** JS alerted first: the native side skips this id. */
  markFired(id: string): void;
  ack(id: string): void;
  onAlert(cb: (e: TripAlertEvent) => void): Unsubscribe;
  /** The ongoing notification's Stop: the app opens and shows the End-trip confirm (OQ7). */
  onStopRequested(cb: () => void): Unsubscribe;
}

export interface DeviceInfo {
  manufacturer: string;
  brand: string;
  sdk: number;
  /** PowerManager.isIgnoringBatteryOptimizations: status only (AC 29). */
  batteryUnrestricted: boolean;
  playServices: boolean;
  /** The trip service died with the process during the last trip (AC 30). Reported once per launch. */
  lastTripKilled: boolean;
}

export type SettingsTarget = 'app' | 'battery' | 'notifications' | 'alerts-channel' | 'tts-install';

/** Native-only device helpers: OEM battery guide, settings shortcuts, System Back. */
export interface DeviceApi {
  info(): Promise<DeviceInfo>;
  openSettings(target: SettingsTarget): Promise<void>;
  /** AC 24: the router's depth after every navigation; at 0 the system owns Back (predictive back-to-home). */
  setBackDepth(depth: number): void;
  onBack(cb: () => void): Unsubscribe;
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
  /** M6: Android app only. */
  trip?: TripServiceApi;
  device?: DeviceApi;
}

/** Vibration patterns (ms on/off), the 6c.13 table. Kept here so web and native agree. */
export const VIBRATE_PATTERNS: Record<VibratePattern, number[]> = HAPTIC_PATTERNS;
