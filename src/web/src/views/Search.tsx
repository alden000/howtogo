/**
 * H2 Search (STYLE-GUIDE §6 H2, 1.1 §6g.2–6g.4): live search (debounced), recent list, results, empty, loading,
 * error; mic when supported. 1.1: two-step smart search (Layer 1 at once; the extra help as a second request,
 * with the "Trying other names…" line only while it runs), alias / one-guess lines, "Did you mean:", the
 * voice "You said" row and the listening states. Never says "AI" or names the helper (6g rule).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Place } from '@howtogo/shared';
import type { SearchResults } from '../api/types';
import { useTSearch, type SearchKey } from '../i18n/search';
// QA-63: the speech engine wrapper ships with H2 (web.ts loads it lazily; importing it here preloads it).
import '../platform/speechRec';
import { addStop } from './viewUtil';
import { announce } from '../ui/kit';
import { useServices } from '../context';
import { log } from '../log';
import { isApiError } from '../api/errors';
import { online } from '../api/offline';
import { here } from '../state/location';
import { Bar, HelpButton, Icon, showToast, StatePanel, useStateHook } from '../ui/kit';
import { addPlace } from '../state/places';

export { pendingHome } from '../state/pendingHome';
import { pendingHome } from '../state/pendingHome';
import { hasPostal, pendingPlace } from '../state/address';

export const DEBOUNCE_MS = 300;
const MAX_RESULTS = 8;
/** 6g.2 (b): the "Trying other names…" line appears only if the extra help is still running after this. */
export const ASSIST_LINE_MS = 400;
/** 6g.2 (e): after this the client stops waiting for the extra help and shows what it has. */
export const ASSIST_TIMEOUT_MS = 4000;

type Phase = 'recent' | 'loading' | 'results' | 'empty' | 'error' | 'offline' | 'busy';
/** 6g.4 listening states ('idle' = no panel). */
type Voice = 'idle' | 'listening' | 'nohear' | 'nomatch' | 'nomic' | 'offline';

/** Loose form for "differs from what was typed": case, spaces and punctuation ignored. */
const loose = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s.,'’"“”()\-]+/g, '');

/** What H2 shows for one answer: the first section (+ its quiet line) and the "Did you mean:" section. */
export function searchView(r: SearchResults, q: string, lang: 'zh' | 'en') {
  const dym = r.didYouMean ? r.filter((x) => x.via === 'ai').slice(0, MAX_RESULTS) : [];
  const found = (r.didYouMean ? r.filter((x) => x.via !== 'ai') : r).slice(0, MAX_RESULTS);
  let line: { key: 'alias_line'; q: string; full: string } | { key: 'guess_line'; term: string } | null = null;
  if (!r.didYouMean && r.guess && found.some((x) => x.via === 'ai')) line = { key: 'guess_line', term: r.guess };
  else if (r.alias && found.length) {
    const full = lang === 'zh' ? (r.alias.zh ?? r.alias.en) : r.alias.en;
    if (loose(full) !== loose(q)) line = { key: 'alias_line', q, full };
  }
  return { found, dym, line };
}

/** Joins SR sentences the way each language punctuates them. */
export const sentences = (lang: 'zh' | 'en', parts: string[]) =>
  lang === 'zh' ? parts.map((p) => (/[。？！]$/.test(p) ? p : `${p}。`)).join('') : parts.map((p) => (/[.?!]$/.test(p) ? p : `${p}.`)).join(' ');

/** Recognition error → listening state (6g.4). 'no-speech' resolves with no text (→ nohear). */
export const voiceError = (e: unknown): Voice => {
  const code = e instanceof Error ? e.message : String(e);
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return 'nomic';
  if (code === 'network') return 'offline';
  return 'nomatch';
};
/** QA-61: the history entry that stands for the listening state (no sheet UI is drawn for it). */
const LISTEN_SHEET = 'listening';
const vkey = (v: Voice, part: 't' | 'b') => `v_${v === 'offline' ? 'off' : v}_${part}` as SearchKey;

export function Search() {
  const { store, router, api, platform } = useServices();
  const t = useTSearch();
  const lang = store.settings.value.lang;
  const query = router.route.value.query;
  /** to (default) · from (F8 From pill) · home (F1/F6 set-home mode) · add (G2 stop) · place (QA-40 My places). */
  const qm = query.get('mode');
  const mode = qm === 'home' ? 'home' : qm === 'add' ? 'add' : qm === 'place' ? 'place' : query.get('field') === 'from' ? 'from' : 'to';
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults>([]);
  /** QA-62: the query the shown results answered (their quiet line is only true for that text). */
  const [resultsQ, setResultsQ] = useState('');
  const [phase, setPhase] = useState<Phase>('recent');
  const [attempt, setAttempt] = useState(0);
  /** 6g.2 (b): the extra help is running and the 400 ms grace has passed. */
  const [assistLine, setAssistLine] = useState(false);
  const [voice, setVoice] = useState<Voice>('idle');
  const [partial, setPartial] = useState('');
  /** 6g.3: the words the mic put in the field (the row shows while the field still holds exactly them). */
  const [heard, setHeard] = useState<string | null>(null);
  const listening = voice === 'listening';
  const inputRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const userStopped = useRef(false);
  const mic = platform.recognition;
  // 1.1 voice: the other speech alternatives for the text the mic put in the box (cleared once the user edits it).
  const heardAlts = useRef<{ text: string; alternatives: string[] } | null>(null);
  const heardNow = heard !== null && heard === q ? heard : null;

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const text = q.trim();
    setAssistLine(false);
    if (!text) return setPhase('recent');
    const ctrl = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const said = heard !== null && heard === q ? heard : null;
    /** One polite announcement per outcome (6g.2 SR column; 6g.3 combines it with "You said"). */
    const outcome = (r: SearchResults) => {
      const v = searchView(r, text, lang);
      const parts: string[] = said ? [t('heard_said', { text: said })] : [];
      if (!v.found.length && !v.dym.length) parts.push(t('sr_none', { q: text }));
      if (v.found.length) {
        if (v.line?.key === 'guess_line') parts.push(t(v.found.length === 1 ? 'sr_guess1' : 'sr_guess', { n: v.found.length, term: v.line.term }));
        else parts.push(t(v.found.length === 1 ? 'sr_found1' : 'sr_found', { n: v.found.length }));
        if (v.line?.key === 'alias_line') parts.push(t('alias_line', { q: v.line.q, full: v.line.full }));
      }
      if (v.dym.length) parts.push(t(v.dym.length === 1 ? 'sr_didyoumean1' : 'sr_didyoumean', { n: v.dym.length }));
      announce(sentences(lang, parts));
    };
    const show = (r: SearchResults, final: boolean) => {
      setResults(r);
      setResultsQ(text);
      setPhase(r.length || !final ? 'results' : 'empty');
      if (final) outcome(r);
    };
    const timer = setTimeout(() => {
      setPhase('loading');
      const alts = heardAlts.current?.text === text ? heardAlts.current.alternatives : [];
      const base = alts.length ? { alternatives: alts } : {};
      api
        .search(text.slice(0, 100), ctrl.signal, { ...base, step: 1 })
        .then((first) => {
          if (ctrl.signal.aborted) return;
          if (!first.assist) return show(first, true);
          // Layer 2 (6g.2 b/e): a second request; the line shows only if it is still running after 400 ms.
          show(first, false);
          const help = new AbortController();
          const stop = () => help.abort();
          ctrl.signal.addEventListener('abort', stop);
          timers.push(
            setTimeout(() => {
              if (help.signal.aborted) return;
              setAssistLine(true);
              announce(t('assist_line'));
            }, ASSIST_LINE_MS),
            setTimeout(stop, ASSIST_TIMEOUT_MS),
          );
          log('search:assist');
          api
            .search(text.slice(0, 100), help.signal, base)
            .then((full) => (full.length >= first.length ? full : first))
            .catch(() => first) // timeout, 429, offline, any failure: silently the plain results (6g.2 e)
            .then((r) => {
              help.abort();
              if (ctrl.signal.aborted) return;
              setAssistLine(false);
              show(r, true);
            });
        })
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          setPhase(isApiError(e) && e.kind === 'offline' ? 'offline' : isApiError(e) && e.status === 429 ? 'busy' : 'error');
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      timers.forEach(clearTimeout);
      ctrl.abort();
    };
  }, [q, attempt]);
  useStateHook(voice !== 'idle' ? null : phase === 'error' || phase === 'offline' || phase === 'busy' ? null : `search-${assistLine ? 'assist' : phase}`);
  // F4 offline: look again by itself once back online.
  useEffect(() => {
    if (phase === 'offline' && online.value) setAttempt((a) => a + 1);
  }, [online.value]);
  useEffect(() => {
    mic?.prepare?.();
    return () => mic?.stop();
  }, []);

  const pick = (p: Place) => {
    if (mode === 'add') {
      // G2: append to the multi-stop list (≤ 5) and return to the builder.
      const cur = store.plan.peek();
      const stops = addStop(cur.stops ?? (cur.to ? [cur.to] : []), p);
      store.setPlan({ stops, journey: undefined });
      announce(t('jb_added', { p: p.name, n: stops.length }));
      return router.back();
    }
    if (mode === 'home') {
      pendingHome.value = p;
      return router.back();
    }
    if (mode === 'place') {
      // QA-72: a road/estate (no postal code) asks "Which block?" on the My places page before it is saved.
      if (!hasPostal(p)) {
        pendingPlace.value = p;
        return router.back();
      }
      // QA-40: save to My places (label = the name until renamed) and return to the editor.
      store.places.value = addPlace(store.places.peek(), p);
      showToast('place-saved', t('fam_saved'));
      return router.back();
    }
    store.setPlan(mode === 'to' ? { to: p, options: [], stops: undefined, journey: undefined } : { [mode]: p, options: [] });
    if (mode === 'to') {
      // Destination picked → straight to route options (replacing Search, so Back from H3 returns to H1).
      // Not recorded here: a recent trip is recorded when it starts (M3 AC 35).
      router.navigate('/routes', { replace: true });
    } else router.back();
  };
  const [wantHere, setWantHere] = useState(false);
  const useHere = () => {
    store.setPlan({ from: null, options: [] });
    if (here.value) return router.back();
    setWantHere(true);
    router.openSheet('loc-explain');
  };
  // Located from the explainer: the sheet has closed, now return to where From was asked.
  useEffect(() => {
    if (wantHere && here.value && !router.sheet.value) router.back();
  }, [wantHere, here.value, router.sheet.value]);
  /** 6g.4: Stop, the mic again or Back end listening; words already heard are kept. */
  const stopListening = () => {
    userStopped.current = true;
    mic?.stop();
  };
  // QA-61: listening is one history entry (an in-page "sheet" with no UI), so system/browser Back pops it:
  // that ends listening and the person stays on H2. When listening ends any other way, the entry is dropped.
  const listenEntry = useRef(false);
  const sheetNow = router.sheet.value;
  useEffect(() => {
    if (!listenEntry.current) return;
    if (voice === 'listening' && sheetNow !== LISTEN_SHEET) {
      listenEntry.current = false;
      stopListening();
    } else if (voice !== 'listening') {
      listenEntry.current = false;
      if (sheetNow === LISTEN_SHEET) router.closeSheet();
    }
  }, [voice, sheetNow]);
  const focusField = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange?.(end, end);
  };
  const voicePanel = (v: Voice) => {
    setVoice(v);
    announce(sentences(lang, [t(vkey(v, 't')), t(vkey(v, 'b'))]));
    if (v === 'nomic' || v === 'offline') focusField();
  };
  const listen = async () => {
    if (!mic) return;
    if (listening) return stopListening();
    setHeard(null);
    setPartial('');
    if (!online.value) return voicePanel('offline');
    userStopped.current = false;
    if (!router.sheet.value) {
      router.openSheet(LISTEN_SHEET);
      listenEntry.current = true;
    }
    setVoice('listening');
    log('state:search-listening');
    announce(t('sr_listening'));
    try {
      const speechLang = lang === 'en' ? 'en-SG' : 'zh-CN';
      const got = mic.listenAll ? await mic.listenAll(speechLang, { onPartial: setPartial }) : { text: await mic.listen(speechLang), alternatives: [] };
      const text = got.text.trim();
      heardAlts.current = text ? { text, alternatives: got.alternatives.map((a) => a.transcript).filter((x) => x !== text) } : null;
      if (text) {
        setVoice('idle');
        setHeard(text);
        setQ(text);
        return;
      }
      if (userStopped.current) return setVoice('idle');
      voicePanel('nohear');
    } catch (e) {
      if (userStopped.current) return setVoice('idle');
      voicePanel(voiceError(e));
    }
  };
  // Focus: Stop while listening; "Try again" on nohear / nomatch (6g.4).
  useEffect(() => {
    if (voice === 'listening') stopRef.current?.focus();
    else if (voice === 'nohear' || voice === 'nomatch') againRef.current?.focus();
    if (voice !== 'idle') log(`state:search-voice-${voice}`);
  }, [voice]);
  const editHeard = () => {
    setHeard(null);
    focusField();
  };

  const shown = searchView(results, q.trim(), lang);
  // QA-62: while the next search runs, the old line would pair the new text with the old place.
  const view = resultsQ === q.trim() ? shown : { ...shown, line: null };
  // A place picked from any section goes to H3 and into Recent under its real name (6g.2).
  const toPlace = (r: SearchResults[number]): Place => ({ name: r.name, address: r.address, postal: r.postal, lat: r.lat, lng: r.lng });
  // 6d.9 H2: the recent trips' destinations, newest first, each place once, max 5.
  const recents = store.recents.value.filter((r, i, all) => all.findIndex((o) => o.to.name === r.to.name && o.to.lat === r.to.lat && o.to.lng === r.to.lng) === i).slice(0, 5);
  const row = (p: { name: string; address?: string | undefined }, icon: 'clock' | 'loc', onClick: () => void, testid: string) => (
    <button type="button" class="ritem" data-testid={testid} onClick={onClick}>
      <span class="ic" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span class="tx">
        <b>{p.name}</b>
        {p.address && <span>{p.address}</span>}
      </span>
      <Icon name="chev" />
    </button>
  );

  return (
    <>
      <Bar onBack={listening ? stopListening : undefined}>
        <HelpButton />
      </Bar>
      <main class="scroll">
        <h1 class="t-title" style={{ margin: '0 0 4px' }}>
          {t(mode === 'home' ? 'find_home' : mode === 'add' || mode === 'place' ? 'add_place_title' : mode === 'from' ? 'from_title' : 'search_title')}
        </h1>
        <div class="field">
          <label for="q" class="sr">
            {t('search_field')}
          </label>
          <Icon name="search" />
          <input
            id="q"
            ref={inputRef}
            type="search"
            data-testid="search-input"
            autoComplete="off"
            enterKeyHint="search"
            placeholder={t('search_field')}
            maxLength={100}
            value={q}
            onInput={(e) => {
              setQ((e.target as HTMLInputElement).value);
              setHeard(null);
              if (voice !== 'idle' && voice !== 'listening') setVoice('idle');
            }}
          />
          {mic && (
            <button
              type="button"
              class={`mic${listening ? ' listening' : ''}`}
              data-testid="search-mic"
              aria-label={t('mic_label')}
              aria-pressed={listening}
              onClick={listen}
            >
              <Icon name="mic" />
            </button>
          )}
        </div>
        {voice === 'listening' && (
          <div class="listenpanel" data-testid="search-listening">
            <span class="micdisc" aria-hidden="true">
              <Icon name="mic" />
            </span>
            <p class="t-headline">{t('listening')}</p>
            {partial && (
              <p class="partial" data-testid="search-partial">
                “{partial}”
              </p>
            )}
            <p class="t-caption">{t('listen_sub')}</p>
            <button type="button" ref={stopRef} class="btn btn-secondary" data-testid="search-stop" onClick={stopListening}>
              {t('listen_stop')}
            </button>
          </div>
        )}
        {voice !== 'idle' && voice !== 'listening' && (
          <div data-testid={`search-voice-${voice}`}>
            <StatePanel id={`search-voice-${voice}`} quiet icon={voice === 'offline' ? 'wifi-off' : 'mic'} title={t(vkey(voice, 't'))} body={t(vkey(voice, 'b'))}>
              {(voice === 'nohear' || voice === 'nomatch') && (
                <button type="button" ref={againRef} class="btn btn-primary" data-testid="search-say-again" onClick={listen}>
                  {t('try_say_again')}
                </button>
              )}
            </StatePanel>
          </div>
        )}
        {voice === 'idle' && heardNow && (
          <button type="button" class="heard" data-testid="search-heard" aria-label={t('sr_heard', { text: heardNow })} onClick={editHeard}>
            <Icon name="mic" />
            <span class="hbody">
              <span class="htx">{t('heard_line', { text: heardNow })}</span>
              <span class="hedit">{t('heard_edit')}</span>
            </span>
          </button>
        )}

        {voice === 'idle' && (
          <>
        {mode === 'from' && phase === 'recent' && (
          <ul class="rlist" style={{ marginBottom: 'var(--s-3)' }}>
            <li>{row({ name: t('use_here') }, 'loc', useHere, 'search-use-here')}</li>
          </ul>
        )}
        {phase === 'error' && (
          <StatePanel id="search-error" icon="refresh" title={t('search_error')}>
            <button type="button" class="btn btn-primary" data-testid="search-retry" onClick={() => setAttempt((a) => a + 1)}>
              {t('try_again')}
            </button>
          </StatePanel>
        )}
        {phase === 'offline' && <StatePanel id="search-offline" icon="wifi-off" title={t('s_off_t')} body={t('s_off_b')} />}
        {phase === 'busy' && (
          <StatePanel id="search-busy" icon="clock" title={t('busy_t')} body={t('busy_b')}>
            <button type="button" class="btn btn-primary" data-testid="search-retry" onClick={() => setAttempt((a) => a + 1)}>
              {t('try_again')}
            </button>
          </StatePanel>
        )}
        {(phase === 'recent' || phase === 'offline') && mode === 'to' && recents.length > 0 && (
          <>
            <div class="sect" style={{ marginTop: '6px' }}>
              <h2>{t('recent')}</h2>
            </div>
            <ul class="rlist" data-testid="search-recent">
              {recents.map((r, i) => (
                <li key={`${r.to.name}-${i}`}>{row(r.to, 'clock', () => pick(r.to), `recent-${i}`)}</li>
              ))}
            </ul>
          </>
        )}

        {phase === 'loading' && (
          <div aria-busy="true" data-testid="search-loading">
            <p class="t-label" role="status">
              {t('search_loading')}
            </p>
            <ul class="rlist" aria-hidden="true">
              <li class="skel" />
              <li class="skel" />
              <li class="skel" />
            </ul>
          </div>
        )}

        {phase === 'results' && view.found.length > 0 && (
          <>
            <div class="sect" style={{ marginTop: '6px' }}>
              <h2>{t('results_found')}</h2>
            </div>
            {view.line && (
              <p class="quietline" data-testid={view.line.key === 'alias_line' ? 'search-alias-line' : 'search-guess-line'}>
                {view.line.key === 'alias_line' ? t('alias_line', { q: view.line.q, full: view.line.full }) : t('guess_line', { term: view.line.term })}
              </p>
            )}
            <ul class="rlist" data-testid="search-results">
              {view.found.map((r, i) => (
                <li key={`${r.name}-${r.postal}`}>{row(r, 'loc', () => pick(toPlace(r)), `search-result-${i}`)}</li>
              ))}
            </ul>
          </>
        )}
        {phase === 'results' && assistLine && (
          <p class="assistline" data-testid="search-assist">
            <Icon name="search" />
            <span>{t('assist_line')}</span>
          </p>
        )}
        {phase === 'results' && view.dym.length > 0 && (
          <>
            <div class="sect" style={{ marginTop: view.found.length ? undefined : '6px' }}>
              <h2>{t('didyoumean')}</h2>
            </div>
            <ul class="rlist" data-testid="search-didyoumean">
              {view.dym.map((r, i) => (
                <li key={`${r.name}-${r.postal}`}>{row(r, 'loc', () => pick(toPlace(r)), `search-dym-${i}`)}</li>
              ))}
            </ul>
          </>
        )}

        {phase === 'empty' && (
          <div data-testid="search-empty">
            <StatePanel id="search-empty" quiet icon="search" title={t('none_t', { q: q.trim() })} body={t('none_s')} />
          </div>
        )}
          </>
        )}

      </main>
    </>
  );
}
