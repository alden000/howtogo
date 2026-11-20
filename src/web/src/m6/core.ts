/**
 * M6 UI state shared by the native-only frames (STYLE-GUIDE 6h) and the web Get-the-app card: the last device
 * report, one-time flags, the update check. Tiny on purpose: the frames themselves are the lazy views/m6.tsx chunk.
 */
import { signal } from '@preact/signals';
import type { DeviceInfo, Platform } from '../platform/types';
import { local, readJSON, writeJSON } from '../state/storage';
import { log } from '../log';

export interface M6Flags {
  /** A3 notifications explainer shown (once ever). */
  notifyAsked?: boolean;
  /** A6 Do Not Disturb sheet shown (once ever). */
  dndAsked?: boolean;
  /** C1 no-Chinese-voice sheet shown (once ever). */
  noZhVoiceShown?: boolean;
  /** B1 brand picked by hand ("不是这个？"). */
  brand?: string;
  /** D1 ✕: hidden until the next day (Singapore date). */
  updHiddenDay?: string;
  /** D1: last day latest.json was read. */
  updCheckedDay?: string;
  /** D2 不用了: hidden for good. */
  getAppDismissed?: boolean;
}

const FLAGS_KEY = 'm6.flags';
export const BATTERY_SEEN_KEY = 'm6.batteryGuideSeen';

export const flags = signal<M6Flags>(readJSON<M6Flags>(local, FLAGS_KEY, {}));
export function setFlags(p: Partial<M6Flags>) {
  flags.value = { ...flags.peek(), ...p };
  writeJSON(local, FLAGS_KEY, flags.peek());
}

/** The last `device.info()` (native only). */
export const device = signal<DeviceInfo | null>(null);
/** B3: the trip service died with the process during the last trip; cleared once she has seen / closed the note. */
export const killed = signal(false);

export interface LatestApk {
  versionName: string;
  versionCode: number;
  sha256: string;
  size: number;
  date: string;
}
/** D1: a newer APK than the installed one (null = none, unknown, offline or failed: nothing shows). */
export const newer = signal<LatestApk | null>(null);
/** Origin of the production Worker (the /android page and latest.json live there). */
export let apiOrigin = '';

/** Singapore calendar day, YYYY-MM-DD. */
export const sgDay = (t = Date.now()) => new Date(t + 8 * 3600_000).toISOString().slice(0, 10);

export async function refreshDevice(platform: Platform): Promise<DeviceInfo | null> {
  if (!platform.device) return null;
  try {
    const d = await platform.device.info();
    if (d.lastTripKilled) killed.value = true;
    device.value = d;
    return d;
  } catch {
    return device.peek();
  }
}

/**
 * D1 (AC 40): once a day on launch read `/android/latest.json`; newer versionCode → the update bar. Never during a
 * trip (the bar is not rendered there); offline or a failure → nothing.
 */
export async function checkUpdate(platform: Platform, fetcher: typeof fetch = fetch, force = false): Promise<void> {
  const d = device.peek() ?? (await refreshDevice(platform));
  if (!d?.versionCode || !apiOrigin) return;
  const today = sgDay();
  if (!force && flags.peek().updCheckedDay === today && !newer.peek()) return;
  try {
    const r = await fetcher(`${apiOrigin}/android/latest.json`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = (await r.json()) as Partial<LatestApk>;
    setFlags({ updCheckedDay: today });
    if (typeof j.versionCode === 'number' && typeof j.versionName === 'string' && j.versionCode > d.versionCode) {
      newer.value = j as LatestApk;
      log('m6:update-available');
    } else newer.value = null;
  } catch {
    /* offline: nothing shows */
  }
}

export const updVisible = () => !!newer.value && flags.value.updHiddenDay !== sgDay();

/** Native start-up (main.tsx): device report, the daily update check, a fresh report on every resume. */
export function initNative(platform: Platform, origin: string) {
  apiOrigin = origin.replace(/\/$/, '');
  void refreshDevice(platform).then(() => checkUpdate(platform));
  platform.visibility.onChange?.((visible) => {
    if (visible) void refreshDevice(platform);
  });
}

/** D2: the web app in Chrome / Samsung Internet on Android (not in the native app, not iOS or desktop). */
export function isAndroidBrowser(ua = globalThis.navigator?.userAgent ?? '', native = false): boolean {
  if (native) return false;
  if (!/Android/i.test(ua)) return false;
  if (/; wv\)|FBAN|FBAV|Instagram|Line\/|MicroMessenger/i.test(ua)) return false;
  return /Chrome\/|SamsungBrowser\//.test(ua);
}

/** 6h.5: whether an English voice exists (the zh-trip "speaking English" note needs one). */
export const enVoice = signal(false);
