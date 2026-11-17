/**
 * M6 §H: OEM battery-optimisation guide — data + decision hook for the "让手机别关掉怎么去" screen.
 * Brand by `Build.MANUFACTURER` (DeviceApi.info). Step copy is a first draft for Creative (pictures and final
 * wording are Creative's frames); the screen itself is built in the M6 UI round.
 * We only read the status (isIgnoringBatteryOptimizations) and open settings pages; never request the exemption.
 */
import type { DeviceInfo, SettingsTarget } from './types';

export type GuideBrand = 'samsung' | 'xiaomi' | 'oppo' | 'vivo' | 'huawei' | 'oneplus' | 'generic';
type Copy = { zh: string; en: string };

export const BATTERY_GUIDE_TITLE: Copy = { zh: '让手机别关掉怎么去', en: 'Keep 怎么去 running' };
export const BATTERY_GUIDE_OK: Copy = { zh: '已设置好 ✔', en: 'All set ✔' };
export const BATTERY_GUIDE_KILLED_NOTE: Copy = {
  zh: '上次行程中，手机把怎么去关掉了。设置一下，锁屏时也能提醒你下车。',
  en: 'Last trip, your phone closed 怎么去. Change one setting so it can still remind you with the screen locked.',
};

export function guideBrand(manufacturer: string): GuideBrand {
  const m = manufacturer.toLowerCase();
  if (m.includes('samsung')) return 'samsung';
  if (/xiaomi|redmi|poco/.test(m)) return 'xiaomi';
  if (/oppo|realme/.test(m)) return 'oppo';
  if (m.includes('vivo')) return 'vivo';
  if (/huawei|honor/.test(m)) return 'huawei';
  if (m.includes('oneplus')) return 'oneplus';
  return 'generic';
}

const s = (zh: string, en: string): Copy => ({ zh, en });

/** Steps per brand (draft copy) and which settings page the button opens. */
export const BATTERY_GUIDE: Record<GuideBrand, { steps: Copy[]; open: SettingsTarget }> = {
  samsung: {
    open: 'app',
    steps: [
      s('按下面的按钮，打开"应用信息"。', 'Tap the button below to open "App info".'),
      s('按"电池"。', 'Tap "Battery".'),
      s('选"不受限制"。', 'Choose "Unrestricted".'),
      s('回到怎么去。', 'Come back to 怎么去.'),
    ],
  },
  xiaomi: {
    open: 'app',
    steps: [
      s('按下面的按钮，打开"应用信息"。', 'Tap the button below to open "App info".'),
      s('按"省电策略"。', 'Tap "Battery saver".'),
      s('选"无限制"。', 'Choose "No restrictions".'),
      s('再打开"自启动"。', 'Also turn on "Autostart".'),
    ],
  },
  oppo: {
    open: 'app',
    steps: [
      s('按下面的按钮，打开"应用信息"。', 'Tap the button below to open "App info".'),
      s('按"耗电保护"或"电池"。', 'Tap "Battery usage" or "Battery".'),
      s('打开"允许后台运行"。', 'Turn on "Allow background activity".'),
    ],
  },
  vivo: {
    open: 'app',
    steps: [
      s('按下面的按钮，打开"应用信息"。', 'Tap the button below to open "App info".'),
      s('按"电池"→"后台耗电管理"。', 'Tap "Battery" → "Background power consumption".'),
      s('选"允许后台高耗电"。', 'Choose "Allow high background power use".'),
    ],
  },
  huawei: {
    open: 'app',
    steps: [
      s('按下面的按钮，打开"应用信息"。', 'Tap the button below to open "App info".'),
      s('按"耗电详情"→"启动管理"。', 'Tap "Power usage details" → "App launch".'),
      s('关掉"自动管理"，再打开"允许后台活动"。', 'Turn off "Manage automatically", then turn on "Run in background".'),
    ],
  },
  oneplus: {
    open: 'app',
    steps: [
      s('按下面的按钮，打开"应用信息"。', 'Tap the button below to open "App info".'),
      s('按"电池使用"。', 'Tap "Battery usage".'),
      s('选"不优化"或"允许后台活动"。', 'Choose "Don\'t optimise" or "Allow background activity".'),
    ],
  },
  generic: {
    open: 'battery',
    steps: [
      s('按下面的按钮，打开"电池优化"。', 'Tap the button below to open "Battery optimisation".'),
      s('选"所有应用"，找到怎么去。', 'Choose "All apps" and find 怎么去.'),
      s('选"不优化"。', 'Choose "Don\'t optimise".'),
    ],
  },
};

const SEEN_KEY = 'm6.batteryGuideSeen';

/**
 * AC 30: shown once before the first trip (after permissions), skippable; again as a one-time note when the
 * service was killed during the last trip. Never when the status is already fine.
 */
export function batteryGuideDue(info: DeviceInfo, seen: boolean): 'guide' | 'killed-note' | null {
  if (info.batteryUnrestricted) return null;
  if (info.lastTripKilled) return 'killed-note';
  return seen ? null : 'guide';
}

export const BATTERY_GUIDE_SEEN_KEY = SEEN_KEY;
