/** Web implementation of the platform adapter (browser APIs). */
import { SPEECH_LANG_TAG, type CuePriority, type Lang } from '@howtogo/shared';
import {
  VIBRATE_PATTERNS,
  type BatteryApi,
  type HeadingApi,
  type LocationApi,
  type LocationFix,
  type NotifyPermission,
  type Platform,
  type PlatformError,
  type Heard,
  type ListenOptions,
  type RecognitionApi,
  type SpeakOptions,
  type SpeechApi,
  type PlatformCapabilities,
  type VisibilityApi,
  type WakeLockApi,
} from './types';

const g = globalThis as unknown as Window & typeof globalThis;

function toFix(p: GeolocationPosition): LocationFix {
  const c = p.coords;
  const f: LocationFix = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, t: p.timestamp || Date.now() };
  if (c.heading != null && Number.isFinite(c.heading)) f.heading = c.heading;
  if (c.speed != null && Number.isFinite(c.speed)) f.speed = c.speed;
  return f;
}

function toErr(e: GeolocationPositionError | { code: number; message: string }): PlatformError {
  const code = e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable';
  return { code, message: e.message || code };
}

const location: LocationApi = {
  async permission() {
    if (!('geolocation' in g.navigator)) return 'unsupported';
    try {
      const r = await g.navigator.permissions?.query({ name: 'geolocation' as PermissionName });
      return (r?.state as 'granted' | 'denied' | 'prompt') ?? 'prompt';
    } catch {
      return 'prompt';
    }
  },
  current(opts = {}) {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in g.navigator)) return reject({ code: 'unsupported', message: 'no geolocation' } satisfies PlatformError);
      g.navigator.geolocation.getCurrentPosition(
        (p) => resolve(toFix(p)),
        (e) => reject(toErr(e)),
        { enableHighAccuracy: opts.highAccuracy ?? true, timeout: 15000, maximumAge: 10000 },
      );
    });
  },
  async watch(onFix, onError, opts = {}) {
    if (!('geolocation' in g.navigator)) {
      onError?.({ code: 'unsupported', message: 'no geolocation' });
      return () => {};
    }
    const id = g.navigator.geolocation.watchPosition(
      (p) => onFix(toFix(p)),
      (e) => onError?.(toErr(e)),
      { enableHighAccuracy: opts.highAccuracy ?? true, maximumAge: 0, timeout: 30000 },
    );
    return () => g.navigator.geolocation.clearWatch(id);
  },
};

type IOSOrientationEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

const heading: HeadingApi = {
  async requestPermission() {
    const DOE = g.DeviceOrientationEvent as IOSOrientationEvent | undefined;
    if (!DOE) return false;
    if (typeof DOE.requestPermission === 'function') {
      try {
        return (await DOE.requestPermission()) === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  },
  async watch(onHeading) {
    const handler = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      if (typeof e.webkitCompassHeading === 'number') onHeading(e.webkitCompassHeading);
      else if (e.absolute && typeof e.alpha === 'number') onHeading((360 - e.alpha) % 360);
    };
    const evt = 'ondeviceorientationabsolute' in g ? 'deviceorientationabsolute' : 'deviceorientation';
    g.addEventListener(evt, handler as EventListener);
    return () => g.removeEventListener(evt, handler as EventListener);
  },
};

function createSpeech(): SpeechApi {
  let muted = false;
  const synth = (): SpeechSynthesis | undefined => g.speechSynthesis;
  const pick = (lang: Lang): SpeechSynthesisVoice | undefined => {
    const voices = synth()?.getVoices() ?? [];
    const tag = SPEECH_LANG_TAG[lang].toLowerCase();
    const base = tag.split('-')[0]!;
    return (
      voices.find((v) => v.lang.toLowerCase() === tag) ??
      voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base + '-')) ??
      voices.find((v) => v.lang.toLowerCase().startsWith(base))
    );
  };
  const loaded = (): Promise<void> =>
    new Promise((resolve) => {
      const s = synth();
      if (!s || s.getVoices().length) return resolve();
      const done = () => resolve();
      s.addEventListener?.('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  return {
    async voices() {
      await loaded();
      return { zh: !!pick('zh-CN'), en: !!pick('en-SG') };
    },
    speak(text: string, lang: Lang, priority: CuePriority, opts: SpeakOptions = {}) {
      const s = synth();
      if ((muted && !opts.force) || !s || !text) return Promise.resolve();
      if (priority === 'high') s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG_TAG[lang];
      const v = pick(lang);
      if (v) u.voice = v;
      u.rate = lang === 'en-SG' ? 0.92 : 0.9; // STYLE-GUIDE §3: zh 0.9, en 0.92
      return new Promise<void>((resolve) => {
        // Some engines never fire `end`: fall back to a generous length-based timeout.
        const fallback = setTimeout(resolve, 3000 + text.length * 250);
        const done = () => {
          clearTimeout(fallback);
          resolve();
        };
        u.onend = done;
        u.onerror = done;
        s.speak(u);
      });
    },
    async cancel() {
      synth()?.cancel();
    },
    setMuted(m) {
      muted = m;
      if (m) synth()?.cancel();
    },
  };
}

function createWakeLock(): WakeLockApi {
  let wanted = false;
  let sentinel: WakeLockSentinel | null = null;
  let inflight: Promise<boolean> | null = null;
  const request = (): Promise<boolean> =>
    (inflight ??= (async () => {
      await Promise.resolve(); // let `inflight` be assigned before `finally` clears it
      try {
        if (!g.navigator.wakeLock) return false;
        if (g.document?.visibilityState === 'hidden') return false;
        const got = await g.navigator.wakeLock.request('screen');
        got.addEventListener('release', () => {
          if (sentinel === got) sentinel = null;
        });
        if (!wanted) {
          await got.release().catch(() => {});
          return false;
        }
        sentinel = got;
        return true;
      } catch {
        return false;
      } finally {
        inflight = null;
      }
    })());
  g.document?.addEventListener('visibilitychange', () => {
    if (wanted && !sentinel && g.document.visibilityState === 'visible') void request();
  });
  return {
    async acquire() {
      wanted = true;
      return sentinel ? true : request();
    },
    async release() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      await s?.release().catch(() => {});
    },
  };
}

type BatteryManagerLike = EventTarget & { level: number; charging: boolean };

function createBattery(): BatteryApi | undefined {
  const nav = g.navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
  if (typeof nav.getBattery !== 'function') return undefined;
  const bm = () => nav.getBattery!();
  return {
    async level() {
      try {
        return (await bm()).level;
      } catch {
        return null;
      }
    },
    async onLow(cb, threshold = 0.2) {
      const b = await bm();
      let fired = false;
      const check = () => {
        if (!b.charging && b.level < threshold && !fired) {
          fired = true;
          cb(b.level);
        } else if (b.level >= threshold || b.charging) fired = false;
      };
      b.addEventListener('levelchange', check);
      b.addEventListener('chargingchange', check);
      check();
      return () => {
        b.removeEventListener('levelchange', check);
        b.removeEventListener('chargingchange', check);
      };
    },
  };
}

type SRCtor = new () => import('./speechRec').SR;

/**
 * Web Speech recognition (Chrome/Android: webkitSpeechRecognition). Undefined when unsupported.
 * QA-63: the engine wrapper (1.1 alternatives / partial words) is a lazy chunk; H2 Search imports it too, so
 * it is already loaded by the time the mic is tapped. Only the feature check stays in the Home entry.
 */
function createRecognition(): RecognitionApi | undefined {
  const w = g as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return undefined;
  let impl: RecognitionApi | undefined;
  let gen = 0;
  const get = () => (impl ? Promise.resolve(impl) : import('./speechRec').then((m) => (impl ??= m.makeRecognition(Ctor))));
  const listenAll = (lang: 'zh-CN' | 'en-SG', opts?: ListenOptions): Promise<Heard> => {
    const at = ++gen;
    // Already loaded (H2 imports it): start in this turn, still inside the tap.
    if (impl) return impl.listenAll!(lang, opts);
    // stop() before the chunk arrived: nothing was heard.
    return get().then((i) => (at === gen ? i.listenAll!(lang, opts) : { text: '', alternatives: [] }));
  };
  return {
    listen: (lang) => listenAll(lang).then((h) => h.text),
    listenAll,
    prepare() {
      void get().catch(() => undefined);
    },
    stop() {
      gen++;
      impl?.stop();
    },
  };
}

function detectCapabilities(): PlatformCapabilities {
  const nav = g.navigator as Navigator | undefined;
  const ua = nav?.userAgent ?? '';
  // iPadOS reports a Mac UA; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1);
  return { backgroundGuidance: false, speechNeedsGesture: ios, os: ios ? 'ios' : /Android/.test(ua) ? 'android' : 'other' };
}

const visibility: VisibilityApi = {
  isVisible: () => g.document?.visibilityState !== 'hidden',
  onChange(cb) {
    const h = () => cb(g.document.visibilityState !== 'hidden');
    g.document?.addEventListener('visibilitychange', h);
    return () => g.document?.removeEventListener('visibilitychange', h);
  },
};

export function createWebPlatform(): Platform {
  const battery = createBattery();
  const p: Platform = {
    kind: 'web',
    capabilities: detectCapabilities(),
    visibility,
    location,
    heading,
    speech: createSpeech(),
    wakeLock: createWakeLock(),
    async vibrate(pattern) {
      try {
        g.navigator.vibrate?.(VIBRATE_PATTERNS[pattern]);
      } catch {
        /* unsupported (iOS) */
      }
    },
    notifications: {
      permission() {
        try {
          return typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as NotifyPermission);
        } catch {
          return 'unsupported';
        }
      },
      async request() {
        try {
          if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') return 'unsupported';
          return (await Notification.requestPermission()) as NotifyPermission;
        } catch {
          return 'denied';
        }
      },
    },
    async notify(cue) {
      // Web: only when hidden; the visible UI shows cues itself.
      if (g.document?.visibilityState === 'visible') return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        const reg = await g.navigator.serviceWorker?.getRegistration();
        const opts: NotificationOptions = { body: cue.body, tag: cue.tag, requireInteraction: cue.priority === 'high' };
        if (reg) await reg.showNotification(cue.title, opts);
        else new Notification(cue.title, opts);
      } catch {
        /* ignore */
      }
    },
    async share(url, text) {
      try {
        if (g.navigator.share) {
          await g.navigator.share(url ? { url, text } : { text });
          return 'shared';
        }
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      }
      try {
        await g.navigator.clipboard.writeText(`${text} ${url}`.trim());
        return 'copied';
      } catch {
        return 'failed';
      }
    },
  };
  if (battery) p.battery = battery;
  const recognition = createRecognition();
  if (recognition) p.recognition = recognition;
  return p;
}
