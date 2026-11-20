/**
 * 1.2 fixes (QA-72/73): "哪一座？/ Which block?", the Home confirm with the full address, and the one-time
 * Home nudge. Developer proposals — Creative to confirm (dev-log 2026-11-20 "Visible changes").
 * Used only by the lazy picker chunk (views/blockPick.tsx), so it stays out of the Home entry (AC 3 budget);
 * "不对？换一个 / Not right? Pick another" (home_pick_other) is on the eager Home confirm card, in ui.ts.
 */
import { useServices } from '../context';

export const V12_ZH = {
  blk_title: '哪一座？',
  blk_why: '“{p}”有好几座楼。选你的那一座，司机更容易找到。',
  blk_loading: '正在找附近的楼…',
  blk_none: '附近没有找到楼。可以输入邮区编号。',
  blk_postal: '或者输入邮区编号（6 位数）',
  blk_postal_only: '邮区编号（6 位数）',
  blk_postal_go: '用这个邮区编号',
  blk_postal_bad: '请输入 6 位数的邮区编号。',
  blk_postal_none: '没有找到这个邮区编号。请再看一看。',
  blk_keep: '先不用，就用“{p}”',
  home_nudge: '加上门牌号，司机更容易找到你家',
  home_nudge_close: '不用了',
};
type Shape = Record<keyof typeof V12_ZH, string>;
export const V12_EN: Shape = {
  blk_title: 'Which block?',
  blk_why: '“{p}” has several blocks. Pick yours so drivers find it easily.',
  blk_loading: 'Finding blocks nearby…',
  blk_none: 'No blocks found nearby. You can type the postal code.',
  blk_postal: 'Or type the postal code (6 digits)',
  blk_postal_only: 'Postal code (6 digits)',
  blk_postal_go: 'Use this postal code',
  blk_postal_bad: 'Please type a 6-digit postal code.',
  blk_postal_none: "We couldn't find that postal code. Please check it and try again.",
  blk_keep: 'Not now, keep “{p}”',
  home_nudge: 'Add your block number so drivers can find your home',
  home_nudge_close: 'No thanks',
};

export type V12Key = keyof typeof V12_ZH;
export function useT12(): (k: V12Key, p?: Record<string, string | number>) => string {
  const lang = useServices().store.settings.value.lang;
  const table = lang === 'en' ? V12_EN : V12_ZH;
  return (k, p = {}) => table[k].replace(/\{(\w+)\}/g, (m, x: string) => (x in p ? String(p[x]) : m));
}
