/**
 * M5 launch helpers (STYLE-GUIDE 6f.3 L3, 6f.4 L4): state and pure decisions for the lazy chunk
 * `views/launch.tsx` (not imported by the Home entry: M5 AC 3 budget). What's new's flag is in pwa/whatsnew.ts.
 *   - Update bar phases (waiting → updating → slow) on top of `updateBar` / `applyUpdate()` (pwa/register.ts).
 *   - Install helper: which card variant this browser gets, when it is due (2nd completed route view, 14-day
 *     snooze, two dismissals = never), and in-app-browser detection (WhatsApp, Facebook, Instagram, Telegram,
 *     WeChat, Line) by UA token. Pure functions are exported for unit tests. Hook lines `install:*` carry no UA.
 */
import { computed, signal } from '@preact/signals';
import { log } from '../log';
import { local, readJSON, session, writeJSON } from '../state/storage';
import { applyUpdate, updateBar, updateBusy } from './register';

/* ---------- L3 update bar ---------- */

export type UpdPhase = 'waiting' | 'updating' | 'slow';
/** No control after this long → "It didn't update this time…" (no retry loop). */
export const UPD_SLOW_MS = 10_000;
export const updPhase = signal<UpdPhase>('waiting');
/** ✕ hides the bar until the next launch (module state: not stored). */
export const updHidden = signal(false);
/** Home and Settings render the bar when this is true (never during a trip: `updateBar` already checks that). */
export const showUpdBar = computed(() => updateBar.value && !updHidden.value);

export function startUpdate(setTimer: typeof setTimeout = setTimeout): void {
  if (updateBusy.peek() || updPhase.peek() !== 'waiting') return;
  updPhase.value = 'updating';
  log('upd:tap');
  applyUpdate();
  setTimer(() => {
    if (updPhase.peek() !== 'updating') return;
    updPhase.value = 'slow';
    log('upd:slow');
  }, UPD_SLOW_MS);
}

/* ---------- L4 browser detection (pure) ---------- */

export type InAppBrowser = 'whatsapp' | 'facebook' | 'instagram' | 'telegram' | 'wechat' | 'line';
/** Order matters: Instagram's UA can carry Facebook tokens. */
const IAB: [InAppBrowser, RegExp][] = [
  ['instagram', /\bInstagram\b/i],
  ['facebook', /FBAN\/|FBAV\/|FB_IAB|FBIOS|\[FB[_;]/],
  ['whatsapp', /\bWhatsApp\b/i],
  ['wechat', /MicroMessenger\//i],
  ['line', /\bLine\/\d/],
  ['telegram', /\bTelegram\b/i],
];

export function detectInAppBrowser(ua: string): InAppBrowser | null {
  for (const [name, re] of IAB) if (re.test(ua)) return name;
  return null;
}

export type UaOs = 'ios' | 'android' | 'other';
/** iPadOS 13+ reports a Mac UA: pass `touchMac` (maxTouchPoints > 1) to count it as iOS. */
export function uaOs(ua: string, touchMac = false): UaOs {
  if (/iPhone|iPad|iPod/.test(ua) || (touchMac && /Macintosh/.test(ua))) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** iOS version as a number (16.4), or null. */
export function iosVersion(ua: string): number | null {
  const m = /OS (\d+)[_.](\d+)/.exec(ua) ?? /Version\/(\d+)\.(\d+)/.exec(ua);
  return m ? Number(`${m[1]}.${m[2]}`) : null;
}

export type IosBrowser = 'safari' | 'chrome' | 'edge' | 'other';
export function iosBrowser(ua: string): IosBrowser {
  if (/CriOS\//.test(ua)) return 'chrome';
  if (/EdgiOS\//.test(ua)) return 'edge';
  if (/FxiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\//.test(ua) || detectInAppBrowser(ua)) return 'other';
  return /Safari\//.test(ua) && /Version\//.test(ua) ? 'safari' : 'other';
}

/** L4a android-prompt / android-steps, L4b ios-guide(-chrome|-edge), L4c ios-safari; null = no card. */
export type InstallVariant = 'android-prompt' | 'android-steps' | 'ios-guide' | 'ios-guide-chrome' | 'ios-guide-edge' | 'ios-safari';

export function installVariant(ua: string, hasPrompt: boolean, touchMac = false): InstallVariant | null {
  if (detectInAppBrowser(ua)) return null; // the in-app-browser bar speaks instead
  const os = uaOs(ua, touchMac);
  if (os === 'ios') {
    const b = iosBrowser(ua);
    if (b === 'safari') return 'ios-guide';
    const v = iosVersion(ua) ?? 0;
    if ((b === 'chrome' || b === 'edge') && v >= 16.4) return b === 'chrome' ? 'ios-guide-chrome' : 'ios-guide-edge';
    return 'ios-safari';
  }
  if (hasPrompt) return 'android-prompt';
  return os === 'android' ? 'android-steps' : null;
}

/** L4d Android: open the site root in Chrome; Chrome missing → the browser opens the fallback URL. */
export function chromeIntentUrl(origin: string): string {
  const u = new URL(origin);
  return `intent://${u.host}/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(`${u.origin}/`)};end`;
}

/* ---------- L4 install card state ---------- */

export const INSTALL_KEY = 'install.v1';
export const INSTALL_SNOOZE_MS = 14 * 24 * 3600_000;
export interface InstallState {
  /** Completed route views (H3 with options), counted once per fetch. */
  views: number;
  lastView?: number;
  dismissals: number;
  hiddenUntil: number;
  /** Installed (accepted prompt, or opened standalone): never again. */
  installed?: boolean;
}
const EMPTY: InstallState = { views: 0, dismissals: 0, hiddenUntil: 0 };
const isState = (v: unknown): v is InstallState => !!v && typeof v === 'object' && typeof (v as InstallState).views === 'number';

export interface InstallContext {
  now: number;
  variant: InstallVariant | null;
  standalone: boolean;
  native: boolean;
  tripActive: boolean;
}

export function installCardDue(s: InstallState, c: InstallContext): boolean {
  return !!c.variant && !c.standalone && !c.native && !c.tripActive && !s.installed && s.views >= 2 && s.dismissals < 2 && c.now >= s.hiddenUntil;
}

export function afterDismiss(s: InstallState, now: number): InstallState {
  return { ...s, dismissals: s.dismissals + 1, hiddenUntil: now + INSTALL_SNOOZE_MS };
}

/** Count a completed route view once per fetch (`key` = the plan's fetchedAt). */
export function afterRouteView(s: InstallState, key: number): InstallState {
  return key && s.lastView === key ? s : { ...s, views: s.views + 1, lastView: key };
}

export const installState = signal<InstallState>(readJSON(local, INSTALL_KEY, EMPTY, isState));
const save = (s: InstallState) => {
  installState.value = s;
  writeJSON(local, INSTALL_KEY, s);
};
export const noteRouteView = (key: number) => {
  const next = afterRouteView(installState.peek(), key);
  if (next !== installState.peek()) save(next);
};
export function dismissInstall(now = Date.now()): void {
  save(afterDismiss(installState.peek(), now));
  log('install:dismissed');
}
export function markInstalled(): void {
  if (installState.peek().installed) return;
  save({ ...installState.peek(), installed: true });
}

export function isStandalone(win: Window = window): boolean {
  return !!win.matchMedia?.('(display-mode: standalone)').matches || (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/* ---------- L4d in-app-browser bar ---------- */

const IAB_OFF = 'iab.off';
/** ✕ hides the bar for this session. */
export const iabHidden = signal(session.get(IAB_OFF) === '1');
export function hideIab(): void {
  session.set(IAB_OFF, '1');
  iabHidden.value = true;
  log('install:dismissed');
}

/** The site root (never the current URL with its query): what "Copy link" copies. */
export const siteRoot = (origin: string = location.origin) => `${origin}/`;
