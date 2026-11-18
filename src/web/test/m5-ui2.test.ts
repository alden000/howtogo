/** M5 UI round part 2: L3 update bar / What's new decisions, L4 install helper + in-app-browser detection (pure). */
import { describe, expect, it } from 'vitest';
import {
  afterDismiss,
  afterRouteView,
  chromeIntentUrl,
  detectInAppBrowser,
  INSTALL_SNOOZE_MS,
  installCardDue,
  installVariant,
  iosBrowser,
  iosVersion,
  startUpdate,
  uaOs,
  UPD_SLOW_MS,
  updPhase,
  type InstallContext,
  type InstallState,
} from '../src/pwa/launch';
import { initWhatsNew, WHATSNEW_KEY, whatsNew, whatsNewDue, whatsNewShown } from '../src/pwa/whatsnew';
import { setUpdateGuard, updateReady } from '../src/pwa/register';
import { memoryKV } from '../src/state/storage';

const UA = {
  // In-app browsers
  waAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36 WhatsApp/2.23.24.76',
  waIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/23.24.73',
  fbIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.0;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
  fbAndroid:
    'Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SQ3A.220705.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/103.0.5060.71 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/375.0.0.24.112;]',
  igIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.114 (iPhone13,2; iOS 16_6; en_US; en; scale=3.00; 1170x2532; 521960129)',
  igAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-G991B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.5993.111 Mobile Safari/537.36 Instagram 307.0.0.34.111 Android (33/13; 480dpi; 1080x2176; samsung; SM-G991B; o1s; exynos2100; en_US; 532277258)',
  wcIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x1800282a) NetType/WIFI Language/zh_CN',
  wcAndroid:
    'Mozilla/5.0 (Linux; Android 12; V2134A Build/SP1A.210812.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.5304.141 Mobile Safari/537.36 XWEB/5015 MMWEBSDK/20230504 MicroMessenger/8.0.37.2380(0x2800253D) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64',
  lineIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.1.0',
  lineAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S901B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.5845.163 Mobile Safari/537.36 Line/13.15.1/IAB',
  tgAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/121.0.6167.143 Mobile Safari/537.36 Telegram-Android/10.8.1 (Google Pixel 7; Android 14; SDK 34; HIGH)',
  // Real browsers
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0',
  safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
  chromeIosOld: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/112.0.5615.46 Mobile/15E148 Safari/604.1',
  edgeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/120.0.2210.84 Mobile/15E148 Safari/605.1.15',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  desktopLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

describe('L4d in-app-browser detection (UA tokens)', () => {
  it.each([
    ['waAndroid', 'whatsapp'],
    ['waIos', 'whatsapp'],
    ['fbIos', 'facebook'],
    ['fbAndroid', 'facebook'],
    ['igIos', 'instagram'],
    ['igAndroid', 'instagram'],
    ['wcIos', 'wechat'],
    ['wcAndroid', 'wechat'],
    ['lineIos', 'line'],
    ['lineAndroid', 'line'],
    ['tgAndroid', 'telegram'],
  ] as const)('%s → %s', (k, app) => {
    expect(detectInAppBrowser(UA[k])).toBe(app);
  });
  it.each(['chromeAndroid', 'samsung', 'firefoxAndroid', 'safariIos', 'chromeIos', 'edgeIos', 'firefoxIos', 'ipadOs', 'desktopLinux'] as const)(
    '%s is a real browser',
    (k) => expect(detectInAppBrowser(UA[k])).toBeNull(),
  );
  it('OS of in-app browsers picks the bar variant (Android: Open in Chrome, iOS: How?)', () => {
    expect(uaOs(UA.waAndroid)).toBe('android');
    expect(uaOs(UA.lineIos)).toBe('ios');
    expect(uaOs(UA.ipadOs)).toBe('other');
    expect(uaOs(UA.ipadOs, true)).toBe('ios');
    expect(uaOs(UA.desktopLinux)).toBe('other');
  });
  it('Open in Chrome: intent to the site root with an encoded fallback (never the current query)', () => {
    expect(chromeIntentUrl('https://example.test')).toBe(
      'intent://example.test/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fexample.test%2F;end',
    );
  });
});

describe('L4 install card variant', () => {
  it('iOS browsers', () => {
    expect(iosBrowser(UA.safariIos)).toBe('safari');
    expect(iosBrowser(UA.chromeIos)).toBe('chrome');
    expect(iosBrowser(UA.edgeIos)).toBe('edge');
    expect(iosBrowser(UA.firefoxIos)).toBe('other');
    expect(iosBrowser(UA.waIos)).toBe('other');
    expect(iosVersion(UA.chromeIosOld)).toBe(16.3);
    expect(iosVersion(UA.safariIos)).toBe(17.1);
  });
  it('picks L4a / L4b / L4c', () => {
    expect(installVariant(UA.chromeAndroid, true)).toBe('android-prompt');
    expect(installVariant(UA.samsung, true)).toBe('android-prompt');
    expect(installVariant(UA.firefoxAndroid, false)).toBe('android-steps');
    expect(installVariant(UA.safariIos, false)).toBe('ios-guide');
    expect(installVariant(UA.ipadOs, false, true)).toBe('ios-guide');
    expect(installVariant(UA.chromeIos, false)).toBe('ios-guide-chrome');
    expect(installVariant(UA.edgeIos, false)).toBe('ios-guide-edge');
    expect(installVariant(UA.chromeIosOld, false)).toBe('ios-safari'); // iOS < 16.4
    expect(installVariant(UA.firefoxIos, false)).toBe('ios-safari');
    expect(installVariant(UA.desktopLinux, false)).toBeNull();
    expect(installVariant(UA.desktopLinux, true)).toBe('android-prompt');
  });
  it('in-app browsers get the bar, not the card', () => {
    for (const k of ['waAndroid', 'fbIos', 'igAndroid', 'wcIos', 'lineAndroid'] as const) expect(installVariant(UA[k], true)).toBeNull();
  });
});

describe('L4 install card timing (AC 26, 29)', () => {
  const s0: InstallState = { views: 0, dismissals: 0, hiddenUntil: 0 };
  const ctx: InstallContext = { now: 1_000, variant: 'android-prompt', standalone: false, native: false, tripActive: false };
  it('after the second completed route view, counted once per fetch', () => {
    let s = afterRouteView(s0, 11);
    expect(installCardDue(s, ctx)).toBe(false);
    s = afterRouteView(s, 11); // same fetch shown again
    expect(s.views).toBe(1);
    s = afterRouteView(s, 12);
    expect(s.views).toBe(2);
    expect(installCardDue(s, ctx)).toBe(true);
  });
  it('never when standalone, in the app, during a trip, installed, or with no variant', () => {
    const s = { ...s0, views: 2 };
    expect(installCardDue(s, { ...ctx, standalone: true })).toBe(false);
    expect(installCardDue(s, { ...ctx, native: true })).toBe(false);
    expect(installCardDue(s, { ...ctx, tripActive: true })).toBe(false);
    expect(installCardDue(s, { ...ctx, variant: null })).toBe(false);
    expect(installCardDue({ ...s, installed: true }, ctx)).toBe(false);
  });
  it('dismiss = hidden 14 days; two dismissals = never again', () => {
    const s1 = afterDismiss({ ...s0, views: 3 }, 1_000);
    expect(s1).toMatchObject({ dismissals: 1, hiddenUntil: 1_000 + INSTALL_SNOOZE_MS });
    expect(installCardDue(s1, { ...ctx, now: 1_000 + INSTALL_SNOOZE_MS - 1 })).toBe(false);
    expect(installCardDue(s1, { ...ctx, now: 1_000 + INSTALL_SNOOZE_MS })).toBe(true);
    const s2 = afterDismiss(s1, 2e12);
    expect(installCardDue(s2, { ...ctx, now: 9e12 })).toBe(false);
  });
});

describe("L3 What's new (AC 21)", () => {
  it('once after updating to 1.0.0; never below 1.0 or on a fresh install', () => {
    expect(whatsNewDue('1.0.0', null, true)).toBe(true);
    expect(whatsNewDue('1.0.0', 'seen', true)).toBe(false);
    expect(whatsNewDue('0.4.0', null, true)).toBe(false);
    expect(whatsNewDue('1.0.0', null, false)).toBe(false);
  });
  it('a fresh 1.0 install stamps the flag on its first run, so it never shows later', () => {
    const kv = memoryKV();
    initWhatsNew({ version: '1.0.0', onboarded: false, kv });
    expect(kv.data[WHATSNEW_KEY]).toBe('fresh');
    expect(whatsNew.value).toBe(false);
    initWhatsNew({ version: '1.0.0', onboarded: true, kv });
    expect(whatsNew.value).toBe(false);
  });
  it('an updated device sees it once', () => {
    const kv = memoryKV({ settings: '{}' });
    initWhatsNew({ version: '1.0.0', onboarded: true, kv });
    expect(whatsNew.value).toBe(true);
    whatsNewShown(kv);
    expect(whatsNew.value).toBe(false);
    initWhatsNew({ version: '1.0.0', onboarded: true, kv });
    expect(whatsNew.value).toBe(false);
  });
});

describe('L3 update bar phases (AC 17)', () => {
  it('waiting → updating → slow after 10 s; ignored while busy', () => {
    const timers: [() => void, number][] = [];
    const fakeTimer = ((fn: () => void, ms: number) => (timers.push([fn, ms]), 0)) as unknown as typeof setTimeout;
    updateReady.value = true;
    setUpdateGuard(true);
    startUpdate(fakeTimer);
    expect(updPhase.value).toBe('waiting');
    setUpdateGuard(false);
    startUpdate(fakeTimer);
    expect(updPhase.value).toBe('updating');
    startUpdate(fakeTimer); // a second tap does nothing
    expect(timers).toHaveLength(1);
    expect(timers[0]![1]).toBe(UPD_SLOW_MS);
    timers[0]![0]();
    expect(updPhase.value).toBe('slow');
  });
});

