/**
 * 1.1 Web Speech recognition (6g.3 alternatives, 6g.4 partial words). A lazy chunk (QA-63): web.ts keeps only
 * the feature check in the Home entry and loads this on first use; H2 Search imports it so it is ready.
 */
import type { Heard, ListenOptions, RecognitionApi, SpeechAlternative } from './types';

export type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export const MAX_SPEECH_ALTERNATIVES = 3;

/** Alternatives of one recognition result: trimmed, non-empty, distinct, best first (engine order), ≤ 3. */
export function readAlternatives(result: ArrayLike<{ transcript: string; confidence?: number }> | undefined): Heard {
  const alternatives: SpeechAlternative[] = [];
  for (let i = 0; result && i < result.length; i++) {
    const a = result[i];
    const transcript = (a?.transcript ?? '').trim();
    if (!transcript || alternatives.some((x) => x.transcript === transcript)) continue;
    const c = Number(a?.confidence);
    alternatives.push({ transcript, confidence: Number.isFinite(c) && c >= 0 && c <= 1 ? c : 0 });
    if (alternatives.length >= MAX_SPEECH_ALTERNATIVES) break;
  }
  return { text: alternatives[0]?.transcript ?? '', alternatives };
}

/** The Web Speech engine wrapper behind `platform.recognition` (web.ts loads it on first use). */
export function makeRecognition(Ctor: new () => SR): RecognitionApi {
  let cur: SR | null = null;
  const listenAll = (lang: 'zh-CN' | 'en-SG', opts?: ListenOptions): Promise<Heard> => {
    cur?.stop();
    return new Promise((resolve, reject) => {
      const r = new Ctor();
      cur = r;
      r.lang = lang;
      // 1.1 H2-listening-partial: interim words only when the screen asks for them.
      r.interimResults = !!opts?.onPartial;
      // 1.1 voice search: up to 3 candidates; the Worker tries the others when the best finds too little.
      r.maxAlternatives = MAX_SPEECH_ALTERNATIVES;
      let heard: Heard = { text: '', alternatives: [] };
      let partial = '';
      r.onresult = (e) => {
        const res = e.results[e.results.length - 1] ?? e.results[0];
        if (opts?.onPartial && res && res.isFinal === false) {
          partial = (res[0]?.transcript ?? '').trim();
          if (partial) opts.onPartial(partial);
          return;
        }
        heard = readAlternatives(res);
      };
      r.onerror = (e) => (e.error === 'no-speech' || e.error === 'aborted' ? undefined : reject(new Error(e.error)));
      r.onend = () => {
        if (cur === r) cur = null;
        // Stopped mid-sentence: keep the words already heard (6g.4).
        resolve(heard.text || !partial ? heard : { text: partial, alternatives: [{ transcript: partial, confidence: 0 }] });
      };
      r.start();
    });
  };
  return {
    listen: (lang) => listenAll(lang).then((h) => h.text),
    listenAll,
    stop() {
      cur?.stop();
    },
  };
}

