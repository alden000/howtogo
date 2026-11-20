/**
 * M6: the Android app's platform adapter (D-4 `Platform` on Capacitor). Loaded as a lazy chunk only
 * when `window.Capacitor.isNativePlatform()` (AC 5), so the web build carries none of it.
 *
 * It talks to the native side through the global Capacitor bridge that the app's WebView injects
 * (`nativePromise` / `addListener`), so no `@capacitor/*` package enters the web bundle. Native half:
 * src/android/android/app/src/main/java/com/wwweeeiii/howtogo/TripPlugin.java (+ @capacitor/app for Back).
 */
import type {
  DeviceApi,
  DeviceInfo,
  LocationApi,
  LocationFix,
  NotifyPermission,
  PermissionState,
  Platform,
  PlatformError,
  SpeechApi,
  TripAlertEvent,
  TripServiceApi,
  Unsubscribe,
  WakeLockApi,
} from './types';

type Handle = { remove(): Promise<void> | void };

/** The part of `window.Capacitor` (native-bridge.js) this adapter uses. */
export interface CapacitorBridge {
  isNativePlatform(): boolean;
  nativePromise<T = unknown>(plugin: string, method: string, options?: object): Promise<T>;
  addListener(plugin: string, event: string, cb: (data: never) => void): Handle | Promise<Handle>;
}

export function capacitorBridge(): CapacitorBridge | null {
  const c = (globalThis as { Capacitor?: Partial<CapacitorBridge> }).Capacitor;
  return c && typeof c.isNativePlatform === 'function' && typeof c.nativePromise === 'function' && typeof c.addListener === 'function'
    ? (c as CapacitorBridge)
    : null;
}

export function isNativeApp(): boolean {
  try {
    return !!capacitorBridge()?.isNativePlatform();
  } catch {
    return false;
  }
}

const TRIP = 'Trip';
const APP = 'App';

type PermStates = { location: string; notifications: string };

const toPerm = (s: string | undefined): PermissionState => (s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt');
const toNotify = (s: string | undefined): NotifyPermission => (s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'default');

function toError(e: unknown): PlatformError {
  const code = (e as { code?: string })?.code;
  const c: PlatformError['code'] = code === 'denied' || code === 'timeout' || code === 'unsupported' ? code : 'unavailable';
  return { code: c, message: String((e as Error)?.message ?? c) };
}

const docLangEn = () => (globalThis as { document?: Document }).document?.documentElement?.lang?.startsWith('en') ?? false;

/**
 * Builds the native platform on top of the web one (heading, visibility, battery and recognition stay
 * web: they work inside the WebView). Awaits the first permission read so `notifications.permission()`
 * can stay synchronous (QA-21).
 */
export async function createNativePlatform(web: Platform, cap: CapacitorBridge | null = capacitorBridge()): Promise<Platform> {
  if (!cap) throw new Error('not native');
  const call = <T = unknown>(method: string, options?: object, plugin = TRIP) => cap.nativePromise<T>(plugin, method, options);
  const listen = <T>(event: string, cb: (d: T) => void, plugin = TRIP): Unsubscribe => {
    const h = cap.addListener(plugin, event, cb as (d: never) => void);
    return () => void Promise.resolve(h).then((x) => x.remove());
  };

  let perms: PermStates = { location: 'prompt', notifications: 'prompt' };
  const refresh = async () => {
    try {
      perms = await call<PermStates>('checkTripPermissions');
    } catch {
      /* keep the last known */
    }
    return perms;
  };
  const ask = async (which: 'location' | 'notifications') => {
    try {
      perms = await call<PermStates>('requestTripPermissions', { which: [which] });
    } catch {
      /* denied or cancelled */
    }
    return perms;
  };
  await refresh();

  // ------------------------------------------------------------ location (AC 7)
  const ensureLocation = async (): Promise<PlatformError | null> => {
    let s = toPerm((await refresh()).location);
    if (s === 'prompt') s = toPerm((await ask('location')).location);
    return s === 'granted' ? null : { code: 'denied', message: 'location permission' };
  };

  const location: LocationApi = {
    async permission() {
      return toPerm((await refresh()).location);
    },
    /** One-shot fused (or LocationManager) fix: no service, no notification. */
    async current(opts = {}) {
      const err = await ensureLocation();
      if (err) throw err;
      try {
        return await call<LocationFix>('current', { highAccuracy: opts.highAccuracy ?? true, timeoutMs: 15000 });
      } catch (e) {
        throw toError(e);
      }
    },
    /** One watcher = one guided trip: the TripService FGS (and its ongoing notification) lives exactly as long. */
    async watch(onFix, onError, _opts = {}) {
      const err = await ensureLocation();
      if (err) {
        onError?.(err);
        return () => {};
      }
      const off = listen<LocationFix>('fix', onFix);
      const en = docLangEn();
      try {
        await call('start', {
          leg: 'walk',
          title: en ? 'Trip in progress' : '行程进行中',
          body: '',
          stopLabel: en ? 'End trip' : '结束行程',
          lang: en ? 'en-SG' : 'zh-CN',
        });
      } catch (e) {
        off();
        onError?.(toError(e));
        return () => {};
      }
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        off();
        void call('stop').catch(() => {});
      };
    },
  };

  // ------------------------------------------------------------ speech (AC 8)
  let muted = false;
  const speech: SpeechApi = {
    async voices() {
      try {
        return await call<{ zh: boolean; en: boolean }>('voices');
      } catch {
        return { zh: false, en: false };
      }
    },
    async speak(text, lang, priority, opts = {}) {
      if ((muted && !opts.force) || !text) return;
      try {
        await call('speak', { text, lang, flush: priority === 'high' });
      } catch {
        /* resolve anyway: the runtime's queue moves on */
      }
    },
    async cancel() {
      await call('stopSpeaking').catch(() => {});
    },
    setMuted(m) {
      muted = m;
      if (m) void call('stopSpeaking').catch(() => {});
    },
  };

  // The trip FGS keeps guidance going with the screen off: no screen wake lock needed (no note either).
  const wakeLock: WakeLockApi = {
    acquire: async () => true,
    release: async () => {},
  };

  // ------------------------------------------------------------ trip service (§C, §D)
  const firedNative = new Set<string>();
  const alertSubs = new Set<(e: TripAlertEvent) => void>();
  const stopSubs = new Set<() => void>();
  let stopPending = false;
  listen<TripAlertEvent>('alert', (e) => {
    if (e.type === 'fired') firedNative.add(e.id);
    for (const cb of alertSubs) cb(e);
  });
  listen<unknown>('stopRequested', () => {
    if (stopSubs.size === 0) stopPending = true; // cold start from the notification: deliver on subscribe
    for (const cb of stopSubs) cb();
  });

  const trip: TripServiceApi = {
    setLeg: (h) => call('setLeg', h).then(() => undefined, () => undefined),
    arm: (alerts) => call('arm', { alerts }).then(() => undefined, () => undefined),
    disarm: () => call('disarm').then(() => undefined, () => undefined),
    firedNatively: (id) => firedNative.has(id),
    markFired(id) {
      void call('markFired', { id }).catch(() => {});
    },
    ack(id) {
      void call('ack', { id }).catch(() => {});
    },
    onAlert(cb) {
      alertSubs.add(cb);
      return () => alertSubs.delete(cb);
    },
    onStopRequested(cb) {
      stopSubs.add(cb);
      if (stopPending) {
        stopPending = false;
        queueMicrotask(cb);
      }
      return () => stopSubs.delete(cb);
    },
  };

  // ------------------------------------------------------------ device: battery guide, settings, Back
  let backEnabled: boolean | null = null;
  const device: DeviceApi = {
    info: () => call<DeviceInfo>('deviceInfo'),
    openSettings: (target) => call('openSettings', { target }).then(() => undefined, () => undefined),
    setBackDepth(depth) {
      const enabled = depth > 0;
      if (enabled === backEnabled) return;
      backEnabled = enabled;
      void call('toggleBackButtonHandler', { enabled }, APP).catch(() => {});
    },
    onBack: (cb) => listen<unknown>('backButton', () => cb(), APP),
    openUrl: (url) => call('openUrl', { url }).then(() => true, () => false),
  };

  const p: Platform = {
    ...web,
    kind: 'native',
    capabilities: { backgroundGuidance: true, speechNeedsGesture: false, os: 'android', native: true },
    location,
    speech,
    wakeLock,
    async vibrate(name) {
      await call('vibrate', { name }).catch(() => {});
    },
    async notify(cue) {
      // Get-off alerts always post (lock screen, AC 21); other cues only while the app is not visible.
      if (cue.priority !== 'high' && web.visibility.isVisible()) return;
      await call('notify', { ...cue, lang: docLangEn() ? 'en-SG' : 'zh-CN' }).catch(() => {});
    },
    notifications: {
      permission: () => toNotify(perms.notifications),
      async request() {
        return toNotify((await ask('notifications')).notifications);
      },
    },
    async share(url, text) {
      try {
        await call('share', { url, text });
        return 'shared';
      } catch {
        return web.share(url, text);
      }
    },
    trip,
    device,
  };
  return p;
}
