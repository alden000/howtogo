/** Viewer copy, zh / en — verbatim from STYLE-GUIDE §6e.2. `me` = senderName (or the default). */
import { stationByCode } from '@howtogo/shared/data';
import type { StepWire } from './state';
export type Lang = 'zh' | 'en';
export type Pronoun = 'f' | 'm' | null | undefined;

export interface CopyCtx {
  lang: Lang;
  me: string;
  dest: string;
  pronoun: Pronoun;
}

/** §6e "Default {me} when unknown". */
export const defaultMe = (lang: Lang) => (lang === 'zh' ? '你的家人' : 'your family member');

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export function timeText(lang: Lang, t: number): string {
  const d = new Date(t);
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (lang === 'zh') return `${h < 12 ? '上午' : '下午'} ${h12}:${mm}`;
  return `${h12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

/** A rail station code ("NS17") in the viewer's language; anything else as sent. */
export function placeName(v: string | undefined, lang: Lang): string {
  if (!v) return '';
  const st = /^[A-Z]{2}\d{1,2}[A-Z]?$/.test(v) ? stationByCode(v) : undefined;
  return st ? (lang === 'zh' ? st.zh : st.en) : v;
}

/**
 * Step pill from the structured `step` (§6e.2 templates, review ruling), in the viewer's language.
 * Returns null when a template's fields are missing (the caller then shows `stepText` as sent).
 */
export function stepLine(step: StepWire | null | undefined, lang: Lang): string | null {
  if (!step) return null;
  const zh = lang === 'zh';
  const n = step.stops;
  const name = (v?: string) => placeName(v, lang);
  switch (step.k) {
    case 'walk':
      return step.place ? (zh ? `正在走路去 ${name(step.place)}` : `Walking to ${name(step.place)}`) : null;
    case 'wait':
      if (step.svc && step.stop) return zh ? `在 ${step.stop} 等 ${step.svc} 号巴士` : `Waiting at ${step.stop} for bus ${step.svc}`;
      if (step.station) return zh ? `在 ${name(step.station)} 等地铁` : `Waiting for the train at ${name(step.station)}`;
      return null;
    case 'bus':
      return step.svc && typeof n === 'number' ? (zh ? `在 ${step.svc} 号巴士上，还有 ${n} 站` : `On bus ${step.svc}, ${n} ${n === 1 ? 'stop' : 'stops'} to go`) : null;
    case 'train':
      return step.towards && typeof n === 'number'
        ? zh ? `在地铁上，往 ${name(step.towards)} 方向，还有 ${n} 站` : `On the train towards ${name(step.towards)}, ${n} ${n === 1 ? 'stop' : 'stops'} to go`
        : null;
  }
  return null;
}

export function copy(c: CopyCtx) {
  const zh = c.lang === 'zh';
  const me = c.me;
  const Me = zh ? me : cap(me);
  const dest = c.dest;
  // zh: 她/他 only when known; otherwise repeat {me} (§6e.2 pronouns). en: "they" unless set.
  const zhP = c.pronoun === 'f' ? '她' : c.pronoun === 'm' ? '他' : me;
  const en = c.pronoun === 'f' ? { s: 'she', o: 'her', is: 'she is', are: 'she’s' } : c.pronoun === 'm' ? { s: 'he', o: 'him', is: 'he is', are: 'he’s' } : { s: 'they', o: 'them', is: 'they are', are: 'they’re' };
  const T = (z: string, e: string) => (zh ? z : e);
  return {
    brand: '怎么去?',
    langBtn: T('English', '中文'),
    langBtnLang: T('en', 'zh-Hans'),
    langBtnSr: T('Switch to English', '切换到中文'),
    opening: T('正在打开…', 'Opening…'),
    onWay: T(`${me}正在去 ${dest}`, `${Me} is on the way to ${dest}`),
    notYet: T(`${me}还没出发`, `${Me} hasn’t set off yet`),
    notYetLine: T(`${zhP}出发后，这里会显示${zhP}在哪里。`, c.pronoun ? `Once ${en.s} sets off, you’ll see where ${en.is} here.` : 'Once they set off, you’ll see where they are here.'),
    goingTo: T(`要去：${dest}`, `Going to: ${dest}`),
    etaAbout: (t: number) => T(`约 ${timeText('zh', t)} 到达`, `Arriving about ${timeText('en', t)}`),
    minLeft: (n: number) => T(`还有 ${n} 分钟`, `${n} min to go`),
    mayChange: T('（可能有变化）', '(may change)'),
    helpTitle: T(`${me}按了“帮忙”`, `${Me} tapped Help`),
    helpLine: T(`${zhP}可能需要你。请打电话给${zhP}。`, c.pronoun ? `${cap(en.s)} may need you. Please give ${en.o} a call.` : 'They may need you. Please give them a call.'),
    near: (place: string) => T(`${zhP}现在在 ${place} 附近`, `${cap(en.are)} near ${place} now`),
    helpAssertive: T(`${me}按了帮忙。${zhP}可能需要你。`, `${Me} tapped Help. ${c.pronoun ? cap(en.s) : 'They'} may need you.`),
    helpCleared: T(`${me}说${c.pronoun ? zhP : '自己'}没事了。`, `${Me} says ${en.are} okay now.`),
    arrivedTitle: T(`${me}已经到了 ${dest}`, `${Me} has arrived at ${dest}`),
    arrivedAt: (t: number) => T(`${timeText('zh', t)} 到的`, `Arrived at ${timeText('en', t)}`),
    stopsAt: (t: number) => T(`分享会在 ${timeText('zh', t)} 停止`, `Sharing stops at ${timeText('en', t)}`),
    noSignal: T(`${me}的手机暂时没有信号`, `${Me}’s phone has no signal right now`),
    lastSeen: (n: number | null, place: string | null) =>
      n === null
        ? T('最后位置：不知道', 'Last position unknown')
        : place
          ? T(`最后位置：${place} 附近，${n} 分钟前`, `Last seen near ${place}, ${n} min ago`)
          : T(`最后位置：${n} 分钟前`, `Last seen ${n} min ago`),
    noSignalLine: T('在地铁里或大楼里常常这样，信号回来后会自己更新。', 'This often happens in the MRT or inside buildings. It will update by itself when the signal returns.'),
    ended: T(`${me}停止了分享`, `${Me} stopped sharing`),
    endedLine: T(`想知道${zhP}在哪里，可以打电话给${zhP}。`, c.pronoun ? `To find out where ${en.is}, you can call ${en.o}.` : 'To find out where they are, you can call them.'),
    endedArrived: T(`${me}已经到了 ${dest}。分享结束了。`, `${Me} arrived at ${dest}. Sharing has ended.`),
    expired: T('这个链接已经过期了', 'This link has expired'),
    expiredLine: T(`分享最长 4 小时。可以请${me}再发一个。`, `Sharing lasts 4 hours at most. You can ask ${me} for a new one.`),
    invalid: T('找不到这个链接', 'We can’t find this link'),
    invalidLine: T('请检查链接是否完整，或请家人再发一次。', 'Check the whole link was copied, or ask your family member to send it again.'),
    offline: T('你的网络断了，正在重新连接…', 'Your internet dropped. Reconnecting…'),
    updatedNow: T('刚刚更新', 'Updated just now'),
    updatedAgo: (n: number) => T(`${n} 分钟前更新`, `Updated ${n} min ago`),
    call: T(`打电话给${me}`, `Call ${me}`),
    mapLabel: T(`${me}现在的位置的地图`, `Map of where ${me} is`),
    locate: T(`回到${zhP}的位置`, `Back to ${c.pronoun === 'f' ? 'her' : c.pronoun === 'm' ? 'his' : 'their'} position`),
    foot1: T(`${me}到了 30 分钟后，这个链接会停止（最长 4 小时）。`, `This link stops 30 minutes after ${me} arrives (4 hours at most).`),
    foot2: T('怎么去? 不会保存任何人的位置。', '怎么去? doesn’t keep anyone’s location.'),
    whatIs: T('这是什么？', 'What is this?'),
    whatIsBody: T(
      `怎么去? 是一个帮长辈坐巴士和地铁的应用。${me}用它一步一步地走，也用它让家人看到${zhP}在哪里。`,
      `怎么去? helps older people take the bus and train, one step at a time. ${Me} uses it to get around, and to let family see where ${en.is}.`,
    ),
    // Tab titles (§6e.2 "Page title").
    titleDefault: T('家人的行程', 'A family member’s trip'),
    titleHelp: T(`${me}按了帮忙`, `${Me} tapped Help`),
    titleArrived: T(`${me}到了`, `${Me} has arrived`),
    titleExpired: T('链接过期了', 'Link expired'),
    titleInvalid: T('找不到链接', 'Link not found'),
  };
}
export type Copy = ReturnType<typeof copy>;
