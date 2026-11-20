/**
 * M6 STYLE-GUIDE 6h.7: notification copy (pure). The native side lays the notifications out (channels, subtext,
 * actions); the words come from here so zh/en follow the app language.
 * Lock-screen rule: no destination name, home address, contact name or coordinates — only stop/station signs,
 * bus numbers, line codes and distances.
 */
import type { Step } from '@howtogo/shared';

type Lang = 'zh-CN' | 'en-SG';
const zh = (l: Lang) => l === 'zh-CN';

/** Walking distances in the ongoing title move in 50 m steps (fewer re-posts; the screen has the exact figure). */
export const roundWalkM = (m: number) => Math.max(10, m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50);

const sign = (s: Step) => String(s.params.stop ?? '');
const lineCode = (s: Step) => s.line?.code ?? String(s.route ?? '');
const changeTo = (z: boolean, s: Step) => (z ? `换车 · 去 ${lineCode(s)} 月台` : `Change trains · to the ${lineCode(s)} platform`);

/**
 * Title of the ongoing notification (6h.7 "Step short text"; verb first, numbers early).
 * `next` = the step after `step` (for a walk_transfer to a train), `remainingM` = metres left on a walk step.
 */
export function stepShortText(
  step: Step | undefined,
  o: { lang: Lang; stopsLeft: number | null; remainingM: number | null; rerouting: boolean; next?: Step | undefined },
): string {
  const z = zh(o.lang);
  if (o.rerouting) return z ? '我在帮你找新的路…' : 'Finding a new way for you…';
  const m = roundWalkM(o.remainingM ?? step?.lengthM ?? 0);
  const n = o.stopsLeft ?? step?.stopCount ?? 0;
  switch (step?.kind) {
    case 'walk_to_destination':
      return z ? `快到了 · 还有 ${m} 米` : `Almost there · ${m} m to go`;
    case 'walk_transfer':
      if (o.next?.kind === 'board_train') return changeTo(z, o.next);
      return z ? `走到 ${sign(step)} · ${m} 米` : `Walk to ${sign(step)} · ${m} m`;
    case 'walk_to_stop':
      return z ? `走到 ${sign(step)} · ${m} 米` : `Walk to ${sign(step)} · ${m} m`;
    case 'board_bus':
      return z ? `等 ${step.route ?? ''} 号巴士 · ${sign(step)}` : `Wait for bus ${step.route ?? ''} · ${sign(step)}`;
    case 'board_train':
      if (step.isTransfer) return changeTo(z, step);
      return z ? `等地铁 ${lineCode(step)} · ${sign(step)}` : `Wait for the ${lineCode(step)} train · ${sign(step)}`;
    case 'ride_bus':
      return z ? `坐 ${step.route ?? ''} 号 · 还有 ${n} 站` : `On bus ${step.route ?? ''} · ${n} stops to go`;
    case 'ride_train':
      return z ? `坐地铁 ${lineCode(step)} · 还有 ${n} 站` : `On the ${lineCode(step)} train · ${n} stops to go`;
  }
  return z ? '行程进行中' : 'Trip in progress';
}

export type AlertKind = 'next' | 'now';

export const alertTitle = (kind: AlertKind, lang: Lang): string =>
  kind === 'now' ? (zh(lang) ? '到站了，请下车' : 'This is your stop. Get off now') : zh(lang) ? '下一站下车' : 'Get off at the next stop';

/** `{stop sign} · advice` — the sign first so the system's end ellipsis only ever drops the advice. */
export function alertText(kind: AlertKind, mode: 'bus' | 'train', stopSign: string, lang: Lang, code = ''): string {
  const z = zh(lang);
  // 6h.7 train text `{station} {code} · …`: an en station name may carry no code (Creative M6 L7)
  if (!stopSign.includes(code)) stopSign += ` ${code}`;
  const advice =
    mode === 'bus'
      ? kind === 'next'
        ? z ? '请现在按铃' : 'Press the bell now'
        : z ? '车停稳了再站起来' : 'Wait until the bus stops'
      : kind === 'next'
        ? z ? '车门开了就下车' : 'Get off when the doors open'
        : z ? '小心空隙' : 'Mind the gap';
  return stopSign ? `${stopSign} · ${advice}` : advice;
}

export type InfoKind = 'offroute' | 'arrival' | 'share-ended';

export function infoCopy(kind: InfoKind, lang: Lang): { title: string; body: string } {
  const z = zh(lang);
  switch (kind) {
    case 'offroute':
      return z
        ? { title: '没关系，你走了另一条路', body: '打开怎么去，看新的路。' }
        : { title: "That's okay, you took another way", body: 'Open 怎么去 to see the new way.' };
    case 'arrival':
      return z ? { title: '到了！', body: '你做得很好。行程结束了。' } : { title: "You're here!", body: 'Well done. Your trip has ended.' };
    case 'share-ended':
      return z
        ? { title: '已经停止分享', body: '家人现在看不到你的行程了。' }
        : { title: 'Sharing has stopped', body: "Family can't see your trip now." };
  }
}
