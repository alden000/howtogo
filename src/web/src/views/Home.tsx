import { useState } from 'preact/hooks';
import { useServices, useT } from '../context';
import { log } from '../log';

export function Home() {
  const { store, router, platform, api } = useServices();
  const t = useT();
  const plan = store.plan.value;
  const home = store.places.value.home;
  const trip = store.trip.value;
  const [locMsg, setLocMsg] = useState<string | null>(null);

  const useMyLocation = async () => {
    try {
      const f = await platform.location.current();
      log('loc:ok');
      const label = await api.revgeocode(f).then((r) => r.name).catch(() => t('my_location'));
      store.setPlan({ from: { name: label, lat: f.lat, lng: f.lng } });
      setLocMsg(null);
    } catch {
      log('loc:fail');
      setLocMsg(t('location_denied'));
    }
  };

  return (
    <main>
      <h1>{t('app_name')}</h1>
      {trip && trip.guidance.status !== 'arrived' && (
        <p>
          <button type="button" data-testid="continue-trip" onClick={() => router.navigate('/guide')}>
            {t('continue_trip')}
          </button>
        </p>
      )}
      <section>
        <p>
          {t('from')}:{' '}
          <button type="button" data-testid="from-field" onClick={() => router.navigate('/search?field=from')}>
            {plan.from?.name ?? t('my_location')}
          </button>{' '}
          <button type="button" data-testid="use-my-location" onClick={useMyLocation}>
            {t('use_my_location')}
          </button>
        </p>
        {locMsg && <p role="alert">{locMsg}</p>}
        <p>
          {t('to')}:{' '}
          <button type="button" data-testid="to-field" onClick={() => router.navigate('/search?field=to')}>
            {plan.to?.name ?? t('choose_destination')}
          </button>
        </p>
        <button type="button" data-testid="find-route" disabled={!plan.to} onClick={() => router.navigate('/routes')}>
          {t('find_route')}
        </button>
      </section>
      {home && (
        <p>
          <button
            type="button"
            data-testid="take-me-home"
            onClick={() => {
              store.setPlan({ from: null, to: home, options: [] });
              router.navigate('/routes');
            }}
          >
            {t('take_me_home')}
          </button>
        </p>
      )}
      {store.recents.value.length > 0 && (
        <section>
          <h2>{t('recent')}</h2>
          <ul>
            {store.recents.value.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  data-testid={`recent-${i}`}
                  onClick={() => {
                    store.setPlan({ to: r.to, options: [] });
                    router.navigate('/routes');
                  }}
                >
                  {r.to.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <nav>
        <button type="button" data-testid="nav-settings" onClick={() => router.navigate('/settings')}>
          {t('settings')}
        </button>{' '}
        <button type="button" data-testid="nav-help" onClick={() => router.navigate('/help')}>
          {t('help')}
        </button>
      </nav>
    </main>
  );
}
