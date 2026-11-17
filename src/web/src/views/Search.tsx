import { useEffect, useRef, useState } from 'preact/hooks';
import type { SearchResult } from '../api/types';
import { Header } from '../app';
import { useServices, useT } from '../context';

const DEBOUNCE_MS = 300;

export function Search() {
  const { store, router, api } = useServices();
  const t = useT();
  const field = router.route.value.query.get('field') === 'from' ? 'from' : 'to';
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api
        .search(text.slice(0, 100), ctrl.signal)
        .then((r) => {
          setError(false);
          setResults(r.slice(0, 8));
        })
        .catch(() => !ctrl.signal.aborted && setError(true));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const pick = (r: SearchResult) => {
    const place = { name: r.name, address: r.address, postal: r.postal, lat: r.lat, lng: r.lng };
    store.setPlan({ [field]: place, options: [] });
    // Destination picked → straight to route options (replacing Search, so Back returns Home).
    if (field === 'to') router.navigate('/routes', { replace: true });
    else router.back();
  };

  return (
    <main>
      <Header title={field === 'from' ? t('from') : t('to')} />
      <label>
        {t('search_placeholder')}
        <input
          ref={inputRef}
          type="search"
          data-testid="search-input"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          autoComplete="off"
        />
      </label>
      {error && (
        <p role="alert">
          {t('error_generic')}{' '}
          <button type="button" data-testid="search-retry" onClick={() => setQ(q + ' ')}>
            {t('try_again')}
          </button>
        </p>
      )}
      {results && results.length === 0 && <p>{t('no_results')}</p>}
      {results && results.length > 0 && (
        <ul>
          {results.map((r, i) => (
            <li key={`${r.name}-${r.postal}`}>
              <button type="button" data-testid={`search-result-${i}`} onClick={() => pick(r)}>
                <strong>{r.name}</strong>
                <br />
                <small>{r.address}</small>
              </button>{' '}
              <button
                type="button"
                data-testid={`set-home-${i}`}
                onClick={() => store.setHome({ name: r.name, address: r.address, postal: r.postal, lat: r.lat, lng: r.lng })}
              >
                {t('set_as_home')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
