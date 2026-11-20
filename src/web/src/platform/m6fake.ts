/**
 * Mock-only QA hook (`?m6=<spec>`, kept per tab): the web platform dressed as the Android app so the M6 frames
 * (STYLE-GUIDE 6h) render in Playwright. Never loaded in live mode or inside the real app.
 *
 * spec = comma list: `brand:<manufacturer>` · `sdk:<n>` · `loc:prompt|precise|coarse|blocked` (now) ·
 * `grant:precise|coarse|blocked|denied` (after the system dialog) · `notify:default|granted|denied` · `dnd` · `nozh` ·
 * `battery` (already unrestricted) · `killed` · `upd` (a newer APK) · `v:<versionName>`.
 * `window.__m6` lets a test change the device and simulate leaving / returning to the app.
 */
import type { DeviceInfo, NotifyPermission, Platform, SettingsTarget } from './types';
import { newer } from '../m6/core';

export interface M6FakeControl {
  device: DeviceInfo;
  notify: NotifyPermission;
  zh: boolean;
  opened: SettingsTarget[];
  urls: string[];
  away(): void;
  back(): void;
}

export function createM6Fake(web: Platform, spec: string): Platform {
  const has = (k: string) => spec.split(',').includes(k);
  const val = (k: string) => spec.split(',').find((x) => x.startsWith(`${k}:`))?.slice(k.length + 1);
  const loc = val('loc') ?? 'precise';
  const grant = val('grant') ?? 'precise';
  const v = val('v') ?? '1.1.0';
  const setLoc = (d: DeviceInfo, s: string) => {
    d.fineLocation = s === 'precise';
    d.coarseLocation = s === 'precise' || s === 'coarse';
    d.locationState = s === 'precise' || s === 'coarse' ? 'granted' : s === 'blocked' ? 'denied' : 'prompt';
  };
  const device: DeviceInfo = {
    manufacturer: val('brand') ?? 'samsung',
    brand: val('brand') ?? 'samsung',
    sdk: Number(val('sdk') ?? 34),
    batteryUnrestricted: has('battery'),
    playServices: true,
    lastTripKilled: has('killed'),
    notificationsEnabled: val('notify') !== 'denied',
    dndBlocks: has('dnd'),
    versionName: v,
    versionCode: 1010000,
  };
  setLoc(device, loc);
  const subs = new Set<(v: boolean) => void>();
  let visible = true;
  const ctl: M6FakeControl = {
    device,
    notify: (val('notify') as NotifyPermission | undefined) ?? 'default',
    zh: !has('nozh'),
    opened: [],
    urls: [],
    away() {
      visible = false;
      subs.forEach((cb) => cb(false));
    },
    back() {
      visible = true;
      subs.forEach((cb) => cb(true));
    },
  };
  (globalThis as { __m6?: M6FakeControl }).__m6 = ctl;
  if (has('upd')) newer.value = { versionName: '1.3.0', versionCode: 1030000, sha256: '0'.repeat(64), size: 1_900_000, date: '2026-12-01' };
  let reported = false;
  return {
    ...web,
    kind: 'native',
    capabilities: { ...web.capabilities, backgroundGuidance: true, speechNeedsGesture: false, os: 'android', native: true },
    visibility: {
      isVisible: () => visible && web.visibility.isVisible(),
      onChange(cb) {
        subs.add(cb);
        const off = web.visibility.onChange(cb);
        return () => {
          subs.delete(cb);
          off();
        };
      },
    },
    location: {
      ...web.location,
      async current(o) {
        if (ctl.device.locationState === 'prompt') setLoc(ctl.device, grant);
        if (!ctl.device.coarseLocation) throw { code: 'denied', message: 'location permission' };
        return web.location.current(o);
      },
      async permission() {
        return ctl.device.coarseLocation ? 'granted' : ctl.device.locationState === 'denied' ? 'denied' : 'prompt';
      },
    },
    speech: { ...web.speech, voices: async () => ({ zh: ctl.zh, en: true }) },
    notifications: {
      permission: () => ctl.notify,
      async request() {
        ctl.notify = 'granted';
        ctl.device.notificationsEnabled = true;
        return 'granted';
      },
    },
    wakeLock: { ...web.wakeLock, acquire: async () => true },
    device: {
      async info() {
        const d = { ...ctl.device, lastTripKilled: !reported && ctl.device.lastTripKilled };
        reported = true;
        return d;
      },
      async openSettings(target) {
        ctl.opened.push(target);
      },
      setBackDepth() {},
      onBack: () => () => {},
      async openUrl(url) {
        ctl.urls.push(url);
        return true;
      },
    },
  };
}
