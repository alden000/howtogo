/**
 * M5 UI-1 copy used only by lazy screens (Settings, About, the battery sheet, the H5 leaf chip): kept out of
 * the global UI table so it ships in those chunks, not in the Home entry (AC 3 budget). zh / en verbatim
 * from STYLE-GUIDE §6f (L2, L5, L7).
 */
import { useServices } from '../context';

export const L5_ZH = {
  // L7 Settings
  grp_privacy: '隐私',
  set_errors: '发送匿名错误统计',
  set_errors_s: '只发“哪种问题、几次”，帮我们修好它。不含位置、地址或搜索内容。',
  set_errors_more: '详细',
  // L5 battery saver
  bs_row: '省电模式',
  bs_auto: '自动',
  bs_auto_now: '自动（现在开着）',
  bs_auto_na: '自动（这部手机不支持）',
  bs_on: '开',
  bs_off: '关',
  bs_auto_s: '电量剩 20% 或更少、又没在充电时，自动打开。',
  bs_auto_s_na: '这部手机不能告诉我电量，所以“自动”不会打开省电。需要时请选“开”。',
  bs_on_s: '一直省电。',
  bs_off_s: '不省电。',
  bs_note: '省电时，地图动得少一些，家人看到你位置的次数也少一些。下车提醒、帮忙和到达消息不会受影响。',
  bs_announce: '电量低了，已经打开省电模式。下车提醒照样会响。',
  // L2 About
  ab_version: '版本 {v}（{d}）',
  ab_sample: '现在是示范路线，不是真的巴士和地铁资料。',
  ab_lta_on: 'Contains information from LTA DataMall accessed on {d} which is made available under the terms of the Singapore Open Data Licence version 1.0.',
  ab_priv_line: '你的资料多数只留在这部手机里。',
  // Creative M5 review fix 9: delete-all busy label
  set_delete_all_busy: '正在清除…',
  // 6f.6 L6: Show the driver, 我在哪里 tab offline
  drv_here_at: '这是 {time} 的位置。',
  drv_here_none: '现在找不到地址。可以给司机看你家的地址。',
  // QA-59: sample (fixture) mode never names the position; proposed copy, Creative to confirm
  drv_here_sample: '示范模式，暂时不显示地址。',
};

export type M5Key = keyof typeof L5_ZH;

export const L5_EN: Record<M5Key, string> = {
  grp_privacy: 'Privacy',
  set_errors: 'Send anonymous error counts',
  set_errors_s: 'Only sends which kind of problem and how often, so we can fix it. No location, addresses or searches.',
  set_errors_more: 'Details',
  bs_row: 'Battery saver',
  bs_auto: 'Auto',
  bs_auto_now: 'Auto (on now)',
  bs_auto_na: 'Auto (not on this phone)',
  bs_on: 'On',
  bs_off: 'Off',
  bs_auto_s: "Turns on when the battery is at 20% or less and isn't charging.",
  bs_auto_s_na: "This phone can't tell me its battery level, so Auto won't turn it on. Choose On if you need it.",
  bs_on_s: 'Always save battery.',
  bs_off_s: "Don't save battery.",
  bs_note: 'While saving battery, the map moves less and family see your position less often. Get-off alerts, Help and arrival messages are never affected.',
  bs_announce: 'Battery is low, so battery saver is on. Get-off alerts will still sound.',
  ab_version: 'Version {v} ({d})',
  ab_sample: 'These are sample routes, not real bus and train information.',
  ab_lta_on: 'Contains information from LTA DataMall accessed on {d} which is made available under the terms of the Singapore Open Data Licence version 1.0.',
  ab_priv_line: 'Most of your information stays on this phone.',
  set_delete_all_busy: 'Deleting…',
  drv_here_at: 'This was where you were at {time}.',
  drv_here_none: 'No address right now. You can show the driver your home address.',
  drv_here_sample: 'Sample mode: address not shown yet.',
};

const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));

/** `t()` for the M5 UI-1 lazy copy, in the current UI language. */
export function useT5(): (k: M5Key, p?: Record<string, string | number>) => string {
  const lang = useServices().store.settings.value.lang;
  const table = lang === 'en' ? L5_EN : L5_ZH;
  return (k, p = {}) => fill(table[k], p);
}
