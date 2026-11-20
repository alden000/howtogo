/**
 * 6h.8 D2 Get-the-app card copy (exact zh/en). Split from i18n/m6.ts (which spreads it back in) so the Settings
 * chunk can render the card in its first paint without the whole M6 chunk (QA-74: no layout shift).
 */
export const D2_ZH = {
  d2_t: '下载安卓版 怎么去',
  d2_b: '锁屏也能提醒你下车，放在口袋里也会说话和震动。',
  d2_go: '看看怎么下载',
  d2_no: '不用了',
};

export const D2_EN: Record<keyof typeof D2_ZH, string> = {
  d2_t: 'Get the Android app',
  d2_b: 'It can remind you to get off even with the screen locked, and talks and buzzes in your pocket.',
  d2_go: 'See how to get it',
  d2_no: 'No thanks',
};
