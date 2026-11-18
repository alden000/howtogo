/**
 * M5 UI-1 global copy (STYLE-GUIDE v1.4.1 §6f: 6f.11 smaller text size, L8 privacy link), zh / en verbatim.
 * Lazy-screen copy lives in m5lazy.ts (Settings/About/H5) and privacy.ts (L1), outside the Home entry.
 */
import type { TextSize } from '../state/store';

// M5 UI-1
export const M5UI1_ZH = {
  // 6f.11 text size 较小 85%
  size_85: '较小',
  sz_sr_85: '较小，85%',
  sz_sr_100: '标准，100%',
  sz_sr_125: '大，125%',
  sz_sr_150: '特大，150%',
  sz_sr_200: '最大，200%',
  size_85_note: '字会变小。看不清楚，可以在设置里改回来。',
  pv_link: '隐私说明',
};

type Shape = Record<keyof typeof M5UI1_ZH, string>;

// M5 UI-1
export const M5UI1_EN: Shape = {
  size_85: 'Smaller',
  sz_sr_85: 'Smaller, 85%',
  sz_sr_100: 'Standard, 100%',
  sz_sr_125: 'Large, 125%',
  sz_sr_150: 'Extra large, 150%',
  sz_sr_200: 'Largest, 200%',
  size_85_note: "Text gets smaller. If it's hard to read, change it back in Settings.",
  pv_link: 'Privacy',
};

/** 6f.11 screen-reader names for the text-size options ("较小，85%" …); the % alone is not enough. */
export const SIZE_SR: Record<TextSize, 'sz_sr_85' | 'sz_sr_100' | 'sz_sr_125' | 'sz_sr_150' | 'sz_sr_200'> = {
  small: 'sz_sr_85',
  standard: 'sz_sr_100',
  large: 'sz_sr_125',
  xlarge: 'sz_sr_150',
  xxlarge: 'sz_sr_200',
};
