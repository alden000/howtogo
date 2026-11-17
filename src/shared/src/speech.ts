/**
 * Voice script: a cue → one short sentence via the i18n table.
 * The web app feeds it to speechSynthesis with SPEECH_LANG_TAG[lang].
 */
import { hasKey, normalizeLang, t } from './i18n/steps';
import type { Cue, LangInput } from './types';

export function cueToSpeech(cue: Cue, langIn: LangInput): string {
  const lang = normalizeLang(langIn);
  const p = cue.params;
  switch (cue.type) {
    case 'turn':
      return t(lang, `cue.turn.${String(p.direction ?? 'straight')}`, p);
    case 'transfer':
      return t(lang, p.mode === 'bus' ? 'cue.transfer.bus' : 'cue.transfer.train', p);
    case 'approaching_stop':
      return t(lang, p.mode === 'train' ? 'cue.approaching_stop.train' : 'cue.approaching_stop', p);
    case 'get_off_next_stop': {
      const key = p.mode === 'bus' && hasKey(lang, 'cue.get_off_next_stop.bus') ? 'cue.get_off_next_stop.bus' : 'cue.get_off_next_stop';
      return t(lang, key, p);
    }
    default:
      return t(lang, `cue.${cue.type}`, p);
  }
}
