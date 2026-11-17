import { useEffect, useState } from 'preact/hooks';
import { formatSummary, normalizeOneMapPlan, rankItineraries, labelText, type Place } from '@howtogo/shared';
import { isApiError } from '../api/errors';
import { Header } from '../app';
import { useServices, useT } from '../context';
import { log } from '../log';
import { toLang } from '../state/store';

/** OQ6: least-walk asks OneMap for ≤ 500 m walks first, widening to 1000 m if nothing is found. */
const WALK_STEPS = [500, 1000];
const FRESH_MS = 60_000;

export function Routes() {
  const { store, router, api, platform } = useServices();
  const t = useT();
  const plan = store.plan.value;
  const settings = store.settings.value;
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'offline' | 'no_route'>('idle');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!plan.to) return;
    if (plan.options.length && plan.fetchedAt && Date.now() - plan.fetchedAt < FRESH_MS && attempt === 0) return;
    let cancelled = false;
    (async () => {
      setState('loading');
      try {
        let start: Place;
        if (plan.from) start = plan.from;
        else {
          const f = await platform.location.current();
          start = { name: t('my_location'), lat: f.lat, lng: f.lng };
        }
        const pref = settings.preference;
        for (const walk of pref === 'least_walk' ? WALK_STEPS : [undefined]) {
          const body = await api.route({ start, end: plan.to!, departAt: Date.now(), numItineraries: 3, ...(walk ? { maxWalkDistance: walk } : {}) });
          const res = normalizeOneMapPlan(body);
          if (res.ok && res.itineraries.length) {
            const options = rankItineraries(res.itineraries, pref).slice(0, 3);
            if (cancelled) return;
            log(`route:n=${options.length} pref=${pref}`);
            store.setPlan({ options, selected: 0, start, fetchedAt: Date.now() });
            setState('idle');
            return;
          }
        }
        if (!cancelled) setState('no_route');
      } catch (e) {
        if (!cancelled) setState(isApiError(e) && e.kind === 'offline' ? 'offline' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan.to?.lat, plan.to?.lng, plan.from?.lat, plan.from?.lng, settings.preference, attempt]);

  const lang = toLang(settings.lang);
  return (
    <main>
      <Header title={t('options')} />
      <p>
        {t('to')}: {plan.to?.name}
      </p>
      {state === 'loading' && <p role="status">{t('loading')}</p>}
      {(state === 'error' || state === 'offline' || state === 'no_route') && (
        <p role="alert">
          {t(state === 'offline' ? 'error_offline' : state === 'no_route' ? 'no_route' : 'error_generic')}{' '}
          <button type="button" data-testid="routes-retry" onClick={() => setAttempt((a) => a + 1)}>
            {t('try_again')}
          </button>
        </p>
      )}
      {state !== 'loading' && plan.options.length > 0 && (
        <ol>
          {plan.options.map((o, i) => (
            <li key={o.itinerary.id}>
              <button
                type="button"
                data-testid={`route-option-${i}`}
                onClick={() => {
                  store.setPlan({ selected: i });
                  router.navigate('/trip');
                }}
              >
                {o.labels.map((l) => labelText(l, lang)).join(' · ')}
                <br />
                {formatSummary(o.summary, lang)}
                <br />
                {o.summary.services.map((s) => `${s.mode}:${s.route ?? ''}`).join(' → ')}
              </button>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
