/**
 * Voice script: a cue → one short sentence via the i18n table.
 * The web app feeds it to speechSynthesis with SPEECH_LANG_TAG[lang].
 * Get-off alerts have a second line, spoken 2.2 s after the first (STYLE-GUIDE 6c.1): `alertSecondLine`.
 */
import { t } from './i18n/steps';
import type { Cue, LangInput, MessageParams } from './types';

export function cueToSpeech(cue: Cue, langIn: LangInput): string {
  const p = cue.params;
  switch (cue.type) {
    case 'turn':
      return t(langIn, `cue.turn.${String(p.direction ?? 'straight')}`, p);
    case 'transfer':
      return t(langIn, p.mode === 'bus' ? 'cue.transfer.bus' : 'cue.transfer.train', p);
    case 'approaching_stop':
      return t(langIn, p.mode === 'train' ? 'cue.approaching_stop.train' : 'cue.approaching_stop', p);
    default:
      return t(langIn, `cue.${cue.type}`, p);
  }
}

/** Second line of the H6 / H6b alert ("Press the bell now." / "Mind the gap."). */
export function alertSecondLine(kind: 'next' | 'now', mode: 'bus' | 'train', lang: LangInput): string {
  return t(lang, `voice.${kind === 'now' ? 'get_off_now' : 'get_off_next_stop'}.line2.${mode}`);
}

/** Runtime-only voice lines (no engine cue): re-route found/failed/offline, MRT pre-alert, manual mode, test voice. */
export type VoiceLine = 'reroute_found' | 'reroute_failed' | 'reroute_offline' | 'mrt_prealert' | 'manual' | 'test';

export function voiceLine(line: VoiceLine, lang: LangInput, params: MessageParams = {}): string {
  return t(lang, `voice.${line}`, params);
}
