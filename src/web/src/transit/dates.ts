/**
 * M3 T9 recent-trip dates and data dates (STYLE-GUIDE 6d.9, m34-fix-a F4), pure. Split from ./m3 in 1.2.0 so Home
 * (recents list) does not pull the rest of the transit helpers into the Home entry.
 */
import type { Lang } from '@howtogo/shared';

const WD_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sgDay = (ms: number) => Math.floor((ms + 8 * 3600_000) / 86_400_000);
const sgDate = (ms: number) => new Date(ms + 8 * 3600_000);

/** A stored recent-trip date (`YYYY-MM-DD`, Singapore) as relative text (AC 35 stores the date only). */
export const relDate = (date: string, now: number, lang: Lang) => relDay(Date.parse(`${date}T12:00:00+08:00`), now, lang);

/** Creative m34-fix-a F4: a YYYY-MM-DD data date in plain words: zh 2026年11月17日 · en 17 Nov 2026. */
export function dataDate(iso: string, lang: 'zh' | 'en'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return lang === 'zh' ? `${y}年${mo}月${d}日` : `${d} ${MON_EN[mo - 1]} ${y}`;
}

/** 6d.9 relative dates: 今天 · 昨天 · 星期X (≤ 6 days, this week) · 上星期X · 11月3日. */
export function relDay(at: number, now: number, lang: Lang): string {
  const zh = lang === 'zh-CN';
  const diff = sgDay(now) - sgDay(at);
  const d = sgDate(at);
  const wd = d.getUTCDay();
  if (diff <= 0) return zh ? '今天' : 'Today';
  if (diff === 1) return zh ? '昨天' : 'Yesterday';
  const nowWd = sgDate(now).getUTCDay();
  const thisWeek = diff <= 6 && diff <= ((nowWd + 6) % 7); // since Monday
  if (thisWeek) return zh ? `星期${WD_ZH[wd]}` : WD_EN[wd]!;
  if (diff <= 13) return zh ? `上星期${WD_ZH[wd]}` : `last ${WD_EN[wd]}`;
  return zh ? `${d.getUTCMonth() + 1}月${d.getUTCDate()}日` : `${d.getUTCDate()} ${MON_EN[d.getUTCMonth()]}`;
}
