/** H2 Search (STYLE-GUIDE §6 H2): live search (debounced), recent list, results, empty, loading, error; mic when supported. */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Place } from '@howtogo/shared';
import type { SearchResult } from '../api/types';
import { addStop } from './viewUtil';
import { announce } from '../ui/kit';
import { useServices, useT } from '../context';
import { log } from '../log';
import { isApiError } from '../api/errors';
import { online } from '../api/offline';
import { here } from '../state/location';
import { Bar, HelpButton, Icon, showToast, StatePanel, useStateHook } from '../ui/kit';
import { addPlace } from '../state/places';

export { pendingHome } from '../state/pendingHome';
import { pendingHome } from '../state/pendingHome';

export const DEBOUNCE_MS = 300;
const MAX_RESULTS = 8;

type Phase = 'recent' | 'loading' | 'results' | 'empty' | 'error' | 'offline' | 'busy';

export function Search() {
  const { store, router, api, platform } = useServices();
  const t = useT();
  const lang = store.settings.value.lang;
  const query = router.route.value.query;
  /** to (default) · from (F8 From pill) · home (F1/F6 set-home mode) · add (G2 stop) · place (QA-40 My places). */
  const qm = query.get('mode');
  const mode = qm === 'home' ? 'home' : qm === 'add' ? 'add' : qm === 'place' ? 'place' : query.get('field') === 'from' ? 'from' : 'to';
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [phase, setPhase] = useState<Phase>('recent');
  const [attempt, setAttempt] = useState(0);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mic = platform.recognition;
  // 1.1 voice: the other speech alternatives for the text the mic put in the box (cleared once the user edits it).
  const heardAlts = useRef<{ text: string; alternatives: string[] } | null>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const text = q.trim();
    if (!text) return setPhase('recent');
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setPhase('loading');
      const alts = heardAlts.current?.text === text ? heardAlts.current.alternatives : [];
      api
        .search(text.slice(0, 100), ctrl.signal, alts.length ? { alternatives: alts } : undefined)
        .then((r) => {
          if (ctrl.signal.aborted) return;
          setResults(r.slice(0, MAX_RESULTS));
          setPhase(r.length ? 'results' : 'empty');
        })
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          setPhase(isApiError(e) && e.kind === 'offline' ? 'offline' : isApiError(e) && e.status === 429 ? 'busy' : 'error');
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, attempt]);
  useStateHook(phase === 'error' || phase === 'offline' || phase === 'busy' ? null : `search-${phase}`);
  // F4 offline: look again by itself once back online.
  useEffect(() => {
    if (phase === 'offline' && online.value) setAttempt((a) => a + 1);
  }, [online.value]);
  useEffect(() => () => mic?.stop(), []);

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
  const listen = async () => {
    if (!mic) return;
    if (listening) return mic.stop();
    setListening(true);
    log('state:search-listening');
    try {
      const speechLang = lang === 'en' ? 'en-SG' : 'zh-CN';
      const heard = mic.listenAll ? await mic.listenAll(speechLang) : { text: await mic.listen(speechLang), alternatives: [] };
      const text = heard.text;
      heardAlts.current = text ? { text, alternatives: heard.alternatives.map((a) => a.transcript).filter((t) => t !== text) } : null;
      if (text) setQ(text);
    } catch {
      /* denied or failed: typing still works */
    } finally {
      setListening(false);
    }
  };

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
      <Bar>
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
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
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
        {listening && (
          <div class="listenhint" aria-live="polite" data-testid="search-listening">
            <Icon name="mic" />
            {t('listening')}
          </div>
        )}

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

        {phase === 'results' && (
          <>
            <div class="sect" style={{ marginTop: '6px' }}>
              <h2>{t('results_found')}</h2>
            </div>
            <ul class="rlist" data-testid="search-results">
              {results.map((r, i) => {
                const place: Place = { name: r.name, address: r.address, postal: r.postal, lat: r.lat, lng: r.lng };
                return (
                  <li key={`${r.name}-${r.postal}`}>
                    {row(r, 'loc', () => pick(place), `search-result-${i}`)}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {phase === 'empty' && (
          <div data-testid="search-empty">
            <StatePanel id="search-empty" icon="search" title={t('none_t', { q: q.trim() })} body={t('none_s')} />
          </div>
        )}

      </main>
    </>
  );
}
