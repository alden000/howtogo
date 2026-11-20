/** M6 UI round (STYLE-GUIDE 6h): notification copy, update check, Get-the-app gating, note priority, location detail. */
import { describe, expect, it } from 'vitest';
import type { Step } from '@howtogo/shared';
import { alertText, alertTitle, infoCopy, roundWalkM, stepShortText } from '../src/platform/notifyCopy';
import { checkUpdate, flags, isAndroidBrowser, newer, setFlags, sgDay, updVisible, device, initNative } from '../src/m6/core';
import { pickNote } from '../src/views/guideModel';
import { m6t, M6 } from '../src/i18n/m6';
import type { Platform } from '../src/platform/types';

const step = (p: Partial<Step>): Step =>
  ({ id: 's', kind: 'walk_to_stop', mode: 'walk', legIndex: 0, key: '', params: {}, text: '', detail: '', geometry: [], start: { lat: 0, lng: 0 }, end: { lat: 0, lng: 0 }, lengthM: 0, durationS: 0, stopCount: 0, ...p }) as Step;
const zh = { lang: 'zh-CN' as const, stopsLeft: null, remainingM: null, rerouting: false };
const en = { ...zh, lang: 'en-SG' as const };

describe('6h.7 notification copy', () => {
  it('step short text, verb first, numbers early', () => {
    const walk = step({ kind: 'walk_to_stop', params: { stop: 'Blk 123' }, lengthM: 240 });
    expect(stepShortText(walk, zh)).toBe('走到 Blk 123 · 250 米');
    expect(stepShortText(walk, { ...en, remainingM: 84 })).toBe('Walk to Blk 123 · 80 m');
    const wait = step({ kind: 'board_bus', route: '139', params: { stop: 'Blk 123' } });
    expect(stepShortText(wait, zh)).toBe('等 139 号巴士 · Blk 123');
    expect(stepShortText(wait, en)).toBe('Wait for bus 139 · Blk 123');
    const bus = step({ kind: 'ride_bus', route: '139', stopCount: 6 });
    expect(stepShortText(bus, { ...zh, stopsLeft: 3 })).toBe('坐 139 号 · 还有 3 站');
    expect(stepShortText(bus, { ...en, stopsLeft: 3 })).toBe('On bus 139 · 3 stops to go');
    const train = step({ kind: 'ride_train', line: { code: 'NS', kind: 'mrt', name: { 'zh-CN': '', 'en-SG': '' }, colorToken: '' }, stopCount: 4 });
    expect(stepShortText(train, zh)).toBe('坐地铁 NS · 还有 4 站');
    expect(stepShortText(train, en)).toBe('On the NS train · 4 stops to go');
    const xfer = step({ kind: 'board_train', isTransfer: true, line: { code: 'CC', kind: 'mrt', name: { 'zh-CN': '', 'en-SG': '' }, colorToken: '' } });
    expect(stepShortText(xfer, zh)).toBe('换车 · 去 CC 月台');
    expect(stepShortText(xfer, en)).toBe('Change trains · to the CC platform');
    const last = step({ kind: 'walk_to_destination', params: { dest: 'Home address 9' }, lengthM: 120 });
    expect(stepShortText(last, zh)).toBe('快到了 · 还有 100 米');
    expect(stepShortText(last, en)).not.toContain('Home address'); // lock-screen rule: never the destination
    expect(stepShortText(bus, { ...zh, rerouting: true })).toBe('我在帮你找新的路…');
    expect(stepShortText(bus, { ...en, rerouting: true })).toBe('Finding a new way for you…');
  });
  it('first 6 zh / 12 en characters carry the instruction', () => {
    expect(alertTitle('next', 'zh-CN').slice(0, 6)).toBe('下一站下车');
    expect(alertTitle('next', 'en-SG').slice(0, 12)).toBe('Get off at t');
    expect(alertTitle('now', 'zh-CN')).toBe('到站了，请下车');
    expect(alertTitle('now', 'en-SG')).toBe('This is your stop. Get off now');
  });
  it('alert text: sign first, advice after " · "', () => {
    expect(alertText('next', 'bus', 'Opp Blk 5', 'zh-CN')).toBe('Opp Blk 5 · 请现在按铃');
    expect(alertText('now', 'bus', 'Opp Blk 5', 'en-SG')).toBe('Opp Blk 5 · Wait until the bus stops');
    expect(alertText('next', 'train', '碧山 Bishan (NS17)', 'zh-CN')).toBe('碧山 Bishan (NS17) · 车门开了就下车');
    expect(alertText('now', 'train', 'Bishan (NS17)', 'en-SG')).toBe('Bishan (NS17) · Mind the gap');
  });
  it('info notifications carry no place or contact names', () => {
    expect(infoCopy('offroute', 'zh-CN')).toEqual({ title: '没关系，你走了另一条路', body: '打开怎么去，看新的路。' });
    expect(infoCopy('arrival', 'en-SG')).toEqual({ title: "You're here!", body: 'Well done. Your trip has ended.' });
    expect(infoCopy('share-ended', 'zh-CN')).toEqual({ title: '已经停止分享', body: '家人现在看不到你的行程了。' });
    expect(roundWalkM(3)).toBe(10);
    expect(roundWalkM(1234)).toBe(1250);
  });
});

describe('6h.8 D1 update check / D2 gating', () => {
  const plat = (versionCode: number) =>
    ({
      device: { info: async () => ({ manufacturer: 'x', brand: 'x', sdk: 34, batteryUnrestricted: false, playServices: true, lastTripKilled: false, versionCode, versionName: '1.1.0' }) },
      visibility: { isVisible: () => true, onChange: () => () => {} },
    }) as unknown as Platform;
  it('newer versionCode → the bar; same → nothing; offline → nothing; ✕ hides until tomorrow', async () => {
    const latest = { versionName: '1.2.0', versionCode: 1020000, sha256: 'a'.repeat(64), size: 1, date: '2026-12-01' };
    const ok = (async () => new Response(JSON.stringify(latest))) as unknown as typeof fetch;
    initNative({ ...plat(1010000), device: undefined } as unknown as Platform, 'https://w.example/');
    device.value = null;
    await checkUpdate(plat(1010000), ok, true);
    expect(newer.value?.versionName).toBe('1.2.0');
    expect(updVisible()).toBe(true);
    setFlags({ updHiddenDay: sgDay() });
    expect(updVisible()).toBe(false);
    setFlags({ updHiddenDay: undefined });
    device.value = null;
    await checkUpdate(plat(1020000), ok, true);
    expect(newer.value).toBeNull();
    const off = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    await checkUpdate(plat(1010000), off, true);
    expect(newer.value).toBeNull();
    expect(flags.value.updCheckedDay).toBe(sgDay());
  });
  it('Get-the-app card: Android Chrome / Samsung Internet only, never in the app, iOS, desktop or in-app browsers', () => {
    const chrome = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
    expect(isAndroidBrowser(chrome)).toBe(true);
    expect(isAndroidBrowser(chrome, true)).toBe(false);
    expect(isAndroidBrowser('Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36')).toBe(true);
    expect(isAndroidBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/131.0 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isAndroidBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36')).toBe(false);
    expect(isAndroidBrowser('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 [FBAN/FB4A]')).toBe(false);
  });
});

describe('6h.3 / 6h.4 trip notes in the app', () => {
  const ui = { reroute: 'idle', gpsWeak: false, manual: false, wakeLockFailed: false, noVoice: false } as const;
  const o = { online: true, foundYou: false, noVoiceDismissed: false };
  it('A5 after weak GPS, before manual; no wake-lock note; B3 once', () => {
    expect(pickNote({ ...ui, manual: true, notify: 'denied' }, { ...o, native: true })).toBe('notify-denied');
    expect(pickNote({ ...ui, manual: true, notify: 'denied' }, o)).toBe('manual'); // web keeps the 6c.10 order
    expect(pickNote({ ...ui, gpsWeak: true, notify: 'denied' }, { ...o, native: true })).toBe('weak');
    expect(pickNote({ ...ui, wakeLockFailed: true }, { ...o, native: true })).toBeNull();
    expect(pickNote({ ...ui }, { ...o, native: true, killed: true })).toBe('killed');
  });
  it('every M6 key has zh and en copy', () => {
    for (const k of Object.keys(M6.zh) as (keyof typeof M6.zh)[]) {
      expect(M6.zh[k].length).toBeGreaterThan(0);
      expect(M6.en[k].length).toBeGreaterThan(0);
    }
    expect(m6t('zh', 'd1_bar', { v: '1.2.0' })).toBe('有新版本 1.2.0 · 去下载');
    expect(m6t('en', 'b1_phone', { brand: 'Samsung' })).toBe('Your phone: Samsung');
  });
});
