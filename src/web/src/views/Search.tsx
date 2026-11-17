/** H2 Search (STYLE-GUIDE §6 H2): live search (debounced), recent list, results, empty, loading, error; mic when supported. */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Place } from '@howtogo/shared';
import type { SearchResult } from '../api/types';
import { useServices, useT } from '../context';
import { log } from '../log';
import { Bar, Icon, useStateHook } from '../ui/kit';

export const DEBOUNCE_MS = 300;
const MAX_RESULTS = 8;

type Phase = 'recent' | 'loading' | 'results' | 'empty' | 'error';

export function Search() {
  const { store, router, api, platform } = useServices();
  const t = useT();
  const lang = store.settings.value.lang;
  const field = router.route.value.query.get('field') === 'from' ? 'from' : 'to';
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [phase, setPhase] = useState<Phase>('recent');
  const [attempt, setAttempt] = useState(0);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mic = platform.recognition;

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const text = q.trim();
    if (!text) return setPhase('recent');
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setPhase('loading');
      api
        .search(text.slice(0, 100), ctrl.signal)
        .then((r) => {
          if (ctrl.signal.aborted) return;
          setResults(r.slice(0, MAX_RESULTS));
          setPhase(r.length ? 'results' : 'empty');
        })
        .catch(() => !ctrl.signal.aborted && setPhase('error'));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, attempt]);
  useStateHook(`search-${phase}`);
  useEffect(() => () => mic?.stop(), []);

  const pick = (p: Place) => {
    store.setPlan({ [field]: p, options: [] });
    // Destination picked → straight to route options (replacing Search, so Back from H3 returns to H1).
    if (field === 'to') {
      store.addRecent(p);
      router.navigate('/routes', { replace: true });
    }
    else router.back();
  };
  const listen = async () => {
    if (!mic) return;
    if (listening) return mic.stop();
    setListening(true);
    log('state:search-listening');
    try {
      const text = await mic.listen(lang === 'en' ? 'en-SG' : 'zh-CN');
      if (text) setQ(text);
    } catch {
      /* denied or failed: typing still works */
    } finally {
      setListening(false);
    }
  };

  const recents = store.recents.value;
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
      <Bar />
      <main class="scroll">
        <h1 class="t-title" style={{ margin: '0 0 4px' }}>
          {t('search_title')}
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

        {phase === 'recent' && recents.length > 0 && (
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
                    {field === 'to' && (
                      <button type="button" class="iconbtn" data-testid={`set-home-${i}`} aria-label={`${t('set_as_home')}${t('sr_sep')}${r.name}`} onClick={() => store.setHome(place)}>
                        <Icon name={store.places.value.home?.name === r.name ? 'check' : 'home'} />
                        {t('set_as_home')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {phase === 'empty' && (
          <div class="empty" data-testid="search-empty">
            <div class="bubble" aria-hidden="true">
              <Icon name="search" />
            </div>
            <b class="t-headline">{t('none_t', { q: q.trim() })}</b>
            <p class="t-caption">{t('none_s')}</p>
          </div>
        )}

        {phase === 'error' && (
          <div class="state" role="alert" data-testid="search-error">
            <p class="t-headline">{t('search_error')}</p>
            <button type="button" class="btn btn-secondary small" data-testid="search-retry" onClick={() => setAttempt((a) => a + 1)}>
              {t('try_again')}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
