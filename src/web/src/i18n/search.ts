/**
 * H2 Search copy (1.0 + the 1.1 §6g.2–6g.4 extras: alias / guess lines, "Did you mean:", the extra-help line,
 * "You said" and the listening panels). Only H2 uses it, so it ships in the lazy Search chunk, not in the
 * Home entry (M5 AC 3 budget, QA-63). zh / en verbatim from STYLE-GUIDE §6 H2 and §6g.
 */
import { useServices } from '../context';
import { tf, type UiKey } from './ui';

export const SEARCH_ZH = {
  search_title: "去哪里？",
  search_field: "地方名字",
  mic_label: "用说的",
  results_found: "找到这些地方",
  none_t: "没找到“{q}”",
  none_s: "换个说法试试，比如“医院”“巴刹”、地址或邮区编号。",
  alias_line: "“{q}”就是“{full}”",
  assist_line: "换个说法再找找…",
  didyoumean: "你是不是要找：",
  guess_line: "按“{term}”找到这些地方",
  sr_found: "找到 {n} 个地方",
  sr_found1: "找到 1 个地方",
  sr_guess: "找到 {n} 个地方，按“{term}”找。",
  sr_guess1: "找到 1 个地方，按“{term}”找。",
  sr_didyoumean: "你是不是要找：{n} 个地方",
  sr_didyoumean1: "你是不是要找：1 个地方",
  sr_none: "没找到“{q}”。换个说法试试。",
  heard_line: "你说的是：“{text}”",
  heard_edit: "改一改",
  sr_heard: "你说的是：{text}。按一下可以改。",
  heard_said: "你说的是：{text}。",
  listen_sub: "说完了我会自己找。",
  listen_stop: "停止",
  sr_listening: "我在听，请说地方名字",
  v_nohear_t: "没听到声音",
  v_nohear_b: "再按一下“再说一次”，或者打字。",
  v_nomatch_t: "没听清楚",
  v_nomatch_b: "再说一次，或者打字。",
  v_nomic_t: "没法用麦克风",
  v_nomic_b: "可以在手机设置里允许，或者打字。",
  v_off_t: "说话找地方需要网络",
  v_off_b: "可以先打字。",
  try_say_again: "再说一次",
  search_loading: "我在找…",
  search_error: "现在找不到，请再试一次",
  find_home: "找你的家",
  s_off_t: "没有网络，暂时找不到新的地方。",
  s_off_b: "连上网络后会自动再找。",
  from_title: "从哪里出发？",
  jb_added: "加上了 {p}，第 {n} 个地方",
};
export type SearchKey = keyof typeof SEARCH_ZH;
export const SEARCH_EN: Record<SearchKey, string> = {
  search_title: "Where to?",
  search_field: "Place name",
  mic_label: "Speak",
  results_found: "Places found",
  none_t: "Couldn’t find “{q}”",
  none_s: "Try other words, like “hospital”, “market”, an address or a postal code.",
  alias_line: "“{q}” means “{full}”",
  assist_line: "Trying other names for it…",
  didyoumean: "Did you mean:",
  guess_line: "Showing places for “{term}”",
  sr_found: "{n} places found",
  sr_found1: "1 place found",
  sr_guess: "{n} places found for “{term}”.",
  sr_guess1: "1 place found for “{term}”.",
  sr_didyoumean: "Did you mean: {n} places",
  sr_didyoumean1: "Did you mean: 1 place",
  sr_none: "Couldn't find “{q}”. Try other words.",
  heard_line: "You said: “{text}”",
  heard_edit: "Change",
  sr_heard: "You said: {text}. Tap to change it.",
  heard_said: "You said: {text}.",
  listen_sub: "I'll search when you stop talking.",
  listen_stop: "Stop",
  sr_listening: "I'm listening, say the place",
  v_nohear_t: "I didn't hear anything",
  v_nohear_b: "Tap “Try again”, or type instead.",
  v_nomatch_t: "I didn't catch that",
  v_nomatch_b: "Try again, or type it.",
  v_nomic_t: "I can't use the microphone",
  v_nomic_b: "You can allow it in your phone's settings, or type instead.",
  v_off_t: "Speaking needs internet",
  v_off_b: "You can type instead.",
  try_say_again: "Try again",
  search_loading: "Looking…",
  search_error: "Can't search right now. Please try again.",
  find_home: "Find your home",
  s_off_t: "No internet, so I can't look up new places right now.",
  s_off_b: "I'll look again once you're back online.",
  from_title: "Where are you starting from?",
  jb_added: "Added {p} as place {n}",
};
export const SEARCH_UI = { zh: SEARCH_ZH as Record<SearchKey, string>, en: SEARCH_EN };

const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));

/** `t()` for H2: its own copy first, then the global table. */
export function useTSearch(): (k: SearchKey | UiKey, p?: Record<string, string | number>) => string {
  const lang = useServices().store.settings.value.lang;
  const table = SEARCH_UI[lang === 'en' ? 'en' : 'zh'];
  return (k, p = {}) => (k in table ? fill(table[k as SearchKey], p) : tf(lang, k as UiKey, p));
}
