/**
 * All user-facing engine copy (step instructions, option summaries, voice cues)
 * in one table so Creative can rewrite it without touching logic.
 *
 * Template syntax:
 *   {name}               → params.name
 *   {name:one|many}      → "one" when params.name === 1, else "many" (plural helper)
 *   [[ ... ]]            → optional section, dropped if any {param} inside it is missing/empty
 *
 * Keep sentences short and concrete; they are read aloud to 60–90 year olds.
 */
import type { Lang, LangInput, MessageParams } from '../types';

export type StringTable = Record<string, string>;

export const STRINGS: Record<Lang, StringTable> = {
  'en-SG': {
    // ---- steps
    'step.walk_to_stop.bus': 'Walk to the bus stop {stop}[[ ({code})]]',
    'step.walk_to_stop.train': 'Walk to {stop} station',
    'step.walk_transfer.bus': 'Walk to the bus stop {stop}[[ ({code})]] for bus {route}',
    'step.walk_transfer.train': 'Walk to {stop} station for the {line}',
    'step.walk_to_destination': '[[Leave by Exit {exit}. ]]Walk to {dest}',
    'step.walk_to_waypoint': '[[Leave by Exit {exit}. ]]Walk to {dest}',
    'step.board_bus': 'Wait for bus {route} at {stop}',
    'step.board_bus.transfer': 'Change to bus {route}. Wait at {stop}',
    'step.board_train': 'Take the {line}[[ towards {towards}]]',
    'step.board_train.transfer': 'Change to the {line}[[ towards {towards}]]',
    'step.ride_bus': 'Ride {n} {n:stop|stops}. Get off at {stop}',
    'step.ride_train': 'Ride {n} {n:stop|stops}. Get off at {stop}',
    'detail.walk': 'About {min} min · {m} m',
    'detail.wait': 'Wait about {min} min',
    'detail.ride': 'About {min} min',
    // ---- option summaries
    'summary.minutes': '{n} min',
    'summary.walk': 'walk {m} m',
    'summary.changes.0': 'no change',
    'summary.changes': '{n} {n:change|changes}',
    'summary.fare': '${fare}',
    'summary.sep': ' · ',
    'label.fastest': 'Fastest',
    'label.least_walk': 'Least walking',
    'label.fewest_transfers': 'Fewest changes',
    'label.recommended': 'Recommended',
    // ---- voice cues
    'cue.approaching_stop': 'The stop is just ahead.',
    'cue.approaching_stop.train': 'The station is just ahead.',
    'cue.arrived_at_stop': 'You have reached {stop}.',
    'cue.boarded': 'Good, you are on board. I will tell you when to get off.',
    'cue.get_off_next_stop': 'Get off at the next stop.',
    'cue.get_off_next_stop.bus': 'Get off at the next stop. Press the bell now.',
    'cue.get_off_now': 'Get off now.',
    'cue.turn.left': 'Turn left[[ onto {street}]].',
    'cue.turn.right': 'Turn right[[ onto {street}]].',
    'cue.turn.slight_left': 'Keep left[[ onto {street}]].',
    'cue.turn.slight_right': 'Keep right[[ onto {street}]].',
    'cue.turn.uturn': 'Turn around.',
    'cue.turn.straight': 'Go straight on[[ along {street}]].',
    'cue.transfer.bus': 'Change here. Next, take bus {route}.',
    'cue.transfer.train': 'Change here to the {line}.',
    'cue.arrived_waypoint': 'You have reached {dest}.',
    'cue.arrived_destination': 'You have arrived. Well done!',
    'cue.off_route': 'You seem to be off the route. Finding a new way.',
    'cue.back_on_route': 'You are back on the route.',
    'cue.gps_weak': 'Location signal is weak. Follow the steps on screen.',
    'cue.step_changed': '{text}',
  },
  'zh-CN': {
    'step.walk_to_stop.bus': '步行到巴士站 {stop}[[（{code}）]]',
    'step.walk_to_stop.train': '步行到 {stop} 地铁站',
    'step.walk_transfer.bus': '步行到巴士站 {stop}[[（{code}）]]，换乘 {route} 号巴士',
    'step.walk_transfer.train': '步行到 {stop} 地铁站，换乘{line}',
    'step.walk_to_destination': '[[从 {exit} 号出口出站，]]步行到 {dest}',
    'step.walk_to_waypoint': '[[从 {exit} 号出口出站，]]步行到 {dest}',
    'step.board_bus': '在 {stop} 等候 {route} 号巴士',
    'step.board_bus.transfer': '换乘 {route} 号巴士，在 {stop} 等候',
    'step.board_train': '搭乘{line}[[，往{towards}方向]]',
    'step.board_train.transfer': '换乘{line}[[，往{towards}方向]]',
    'step.ride_bus': '坐 {n} 站，在 {stop} 下车',
    'step.ride_train': '坐 {n} 站，在 {stop} 下车',
    'detail.walk': '约 {min} 分钟 · {m} 米',
    'detail.wait': '约等 {min} 分钟',
    'detail.ride': '约 {min} 分钟',
    'summary.minutes': '{n} 分钟',
    'summary.walk': '步行 {m} 米',
    'summary.changes.0': '不用换乘',
    'summary.changes': '换乘 {n} 次',
    'summary.fare': '{fare} 元',
    'summary.sep': ' · ',
    'label.fastest': '最快',
    'label.least_walk': '走路最少',
    'label.fewest_transfers': '换乘最少',
    'label.recommended': '推荐',
    'cue.approaching_stop': '车站就在前面。',
    'cue.approaching_stop.train': '地铁站就在前面。',
    'cue.arrived_at_stop': '您已到达 {stop}。',
    'cue.boarded': '好，您已上车。到站前我会提醒您。',
    'cue.get_off_next_stop': '下一站下车。',
    'cue.get_off_next_stop.bus': '下一站下车，请按铃。',
    'cue.get_off_now': '现在下车。',
    'cue.turn.left': '请左转[[，走{street}]]。',
    'cue.turn.right': '请右转[[，走{street}]]。',
    'cue.turn.slight_left': '请靠左走[[，走{street}]]。',
    'cue.turn.slight_right': '请靠右走[[，走{street}]]。',
    'cue.turn.uturn': '请掉头。',
    'cue.turn.straight': '请继续直走[[，沿{street}]]。',
    'cue.transfer.bus': '请在这里换乘 {route} 号巴士。',
    'cue.transfer.train': '请在这里换乘{line}。',
    'cue.arrived_waypoint': '您已到达 {dest}。',
    'cue.arrived_destination': '您已到达目的地，辛苦了！',
    'cue.off_route': '您好像走错路了，正在重新找路。',
    'cue.back_on_route': '您已回到路线上。',
    'cue.gps_weak': '定位信号弱，请看屏幕上的步骤。',
    'cue.step_changed': '{text}',
  },
};

/** BCP-47 tag to request a matching speech-synthesis voice. */
export const SPEECH_LANG_TAG: Record<Lang, string> = {
  'zh-CN': 'zh-CN',
  'en-SG': 'en-SG',
};

export function normalizeLang(lang: LangInput | string | undefined): Lang {
  if (!lang) return 'zh-CN';
  const l = lang.toLowerCase();
  if (l.startsWith('en')) return 'en-SG';
  return 'zh-CN';
}

function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '';
}

/** Fill a template. Missing keys fall back to English, then to the key itself. */
export function t(lang: LangInput | string, key: string, params: MessageParams = {}): string {
  const L = normalizeLang(lang);
  const tpl = STRINGS[L][key] ?? STRINGS['en-SG'][key] ?? key;
  return fill(tpl, params);
}

export function hasKey(lang: LangInput | string, key: string): boolean {
  return STRINGS[normalizeLang(lang)][key] !== undefined;
}

function fill(tpl: string, params: MessageParams): string {
  // optional sections first
  const withOptional = tpl.replace(/\[\[(.*?)\]\]/g, (_m, inner: string) => {
    const names = [...inner.matchAll(/\{(\w+)(?::[^}]*)?\}/g)].map((x) => x[1]!);
    return names.every((n) => present(params[n])) ? inner : '';
  });
  return withOptional.replace(/\{(\w+)(?::([^|}]*)\|([^}]*))?\}/g, (_m, name: string, one?: string, many?: string) => {
    const v = params[name];
    if (one !== undefined && many !== undefined) return Number(v) === 1 ? one : many;
    return present(v) ? String(v) : '';
  });
}
