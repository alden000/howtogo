/**
 * M6 STYLE-GUIDE 6h.4: OEM battery-optimisation guide — data + decision hook for B1 "让手机别关掉怎么去".
 * Brand by `Build.MANUFACTURER` (DeviceApi.info). We only read the status (isIgnoringBatteryOptimizations) and open
 * the app's settings page; never request the exemption (AC 29).
 */
import type { DeviceInfo, SettingsTarget } from './types';

export type GuideBrand = 'google' | 'samsung' | 'xiaomi' | 'oppo' | 'vivo' | 'huawei' | 'generic';
type Copy = { zh: string; en: string };

/** The 7 options of the brand picker, in order. */
export const GUIDE_BRANDS: readonly GuideBrand[] = ['google', 'samsung', 'xiaomi', 'oppo', 'vivo', 'huawei', 'generic'];

export const BATTERY_GUIDE_TITLE: Copy = { zh: '让手机别关掉怎么去', en: 'Keep 怎么去 running' };
/** 6h.4 B2: the ✔ glyph became the `check` icon; this is its text (SR + Settings value). */
export const BATTERY_GUIDE_OK: Copy = { zh: '已设置好', en: 'All set' };
export const BATTERY_GUIDE_KILLED_NOTE: Copy = {
  zh: '上次行程中，手机把怎么去关掉了。设置一下，锁屏时也能提醒你下车。',
  en: 'Last trip, your phone closed 怎么去. Change one setting so it can remind you with the screen locked.',
};

export function guideBrand(manufacturer: string): GuideBrand {
  const m = manufacturer.toLowerCase();
  if (m.includes('google')) return 'google';
  if (m.includes('samsung')) return 'samsung';
  if (/xiaomi|redmi|poco/.test(m)) return 'xiaomi';
  // OnePlus runs the same ColorOS menus as OPPO / realme.
  if (/oppo|realme|oneplus/.test(m)) return 'oppo';
  if (m.includes('vivo')) return 'vivo';
  if (/huawei|honor/.test(m)) return 'huawei';
  return 'generic';
}

const s = (zh: string, en: string): Copy => ({ zh, en });
const OPEN = s('按下面的"打开设置"。', 'Tap "Open settings" below.');
const BACK = s('按返回，回到怎么去。', 'Go back to 怎么去.');

export interface GuideData {
  name: Copy;
  steps: Copy[];
  /** Picture per step index (creative/m6/pictures/<name>-{zh,en}.svg). */
  pictures: Record<number, string>;
  open: SettingsTarget;
  /** B2: the phone doesn't report this part; she checks it herself. */
  unchecked?: 'autostart' | 'switches';
}

const GOOGLE_STEPS = [
  OPEN,
  s('按"应用的电池用量"（有的手机叫"电池"）。', 'Tap "App battery usage" (on some phones, "Battery").'),
  s('打开"允许后台使用"，选"不受限制"。', 'Turn on "Allow background usage" and choose "Unrestricted".'),
  BACK,
];

/** Steps per brand (6h.4 table). `open` is 'app' for every brand: App info is one tap from each battery page. */
export const BATTERY_GUIDE: Record<GuideBrand, GuideData> = {
  google: { name: s('Google Pixel', 'Google Pixel'), open: 'app', steps: GOOGLE_STEPS, pictures: { 1: 'bg-google-1', 2: 'bg-google-2' } },
  samsung: {
    name: s('三星 Samsung', 'Samsung'),
    open: 'app',
    steps: [OPEN, s('按"电池"。', 'Tap "Battery".'), s('选"不受限制"。', 'Choose "Unrestricted".'), BACK],
    pictures: { 1: 'bg-samsung-1', 2: 'bg-samsung-2' },
  },
  xiaomi: {
    name: s('小米 / 红米 / POCO', 'Xiaomi / Redmi / POCO'),
    open: 'app',
    steps: [OPEN, s('按"省电策略"。', 'Tap "Battery saver".'), s('选"无限制"，再按返回。', 'Choose "No restrictions", then go back.'), s('打开"自启动"。', 'Turn on "Autostart".'), BACK],
    pictures: { 1: 'bg-xiaomi-1', 2: 'bg-xiaomi-2', 3: 'bg-xiaomi-3' },
    unchecked: 'autostart',
  },
  oppo: {
    name: s('OPPO / realme / 一加 OnePlus', 'OPPO / realme / OnePlus'),
    open: 'app',
    steps: [
      OPEN,
      s('按"耗电管理"（有的手机叫"电池"）。', 'Tap "Battery usage" (on some phones, "Battery").'),
      s('打开"允许后台行为"和"允许自启动"。', 'Turn on "Allow background activity" and "Allow auto launch".'),
      BACK,
    ],
    pictures: { 1: 'bg-oppo-1', 2: 'bg-oppo-2' },
    unchecked: 'autostart',
  },
  vivo: {
    name: s('vivo', 'vivo'),
    open: 'app',
    steps: [
      OPEN,
      s('按"电池"。', 'Tap "Battery".'),
      s('按"后台耗电管理"。', 'Tap "Background power consumption management".'),
      s('选"允许后台高耗电"。', 'Choose "Allow high background power consumption".'),
      BACK,
    ],
    pictures: { 1: 'bg-vivo-1', 2: 'bg-vivo-2', 3: 'bg-vivo-3' },
    unchecked: 'autostart',
  },
  huawei: {
    name: s('华为 / 荣耀', 'Huawei / Honor'),
    open: 'app',
    steps: [
      OPEN,
      s('按"电池"→"应用启动管理"（或"耗电详情"→"启动管理"）。', 'Tap "Battery" → "App launch" (or "Power usage details" → "App launch").'),
      s('找到怎么去，关掉"自动管理"。', 'Find 怎么去 and turn off "Manage automatically".'),
      s('在弹出的窗口里，三个开关都打开，按"确定"。', 'In the pop-up, turn on all three switches and tap "OK".'),
      BACK,
    ],
    pictures: { 1: 'bg-huawei-1', 2: 'bg-huawei-2', 3: 'bg-huawei-3' },
    unchecked: 'switches',
  },
  generic: { name: s('其他手机', 'Other phones'), open: 'app', steps: GOOGLE_STEPS, pictures: { 1: 'bg-google-1', 2: 'bg-google-2' } },
};

const SEEN_KEY = 'm6.batteryGuideSeen';

/**
 * AC 30: shown once before the first trip (after permissions), skippable; again as a one-time note when the
 * service was killed during the last trip. Never when the status is already fine.
 */
export function batteryGuideDue(info: Pick<DeviceInfo, 'batteryUnrestricted' | 'lastTripKilled'>, seen: boolean): 'guide' | 'killed-note' | null {
  if (info.batteryUnrestricted) return null;
  if (info.lastTripKilled) return 'killed-note';
  return seen ? null : 'guide';
}

export const BATTERY_GUIDE_SEEN_KEY = SEEN_KEY;
