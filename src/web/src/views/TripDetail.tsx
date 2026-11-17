import { useMemo, useState } from 'preact/hooks';
import { buildSteps, formatSummary } from '@howtogo/shared';
import { Header } from '../app';
import { useServices, useT } from '../context';
import { MapPanel } from '../map/MapPanel';
import { toLang } from '../state/store';

export function TripDetail() {
  const { store, router, runtime } = useServices();
  const t = useT();
  const plan = store.plan.value;
  const lang = toLang(store.settings.value.lang);
  const option = plan.options[plan.selected];
  const [showMap, setShowMap] = useState(false);
  const steps = useMemo(
    () => (option ? buildSteps(option.itinerary, lang, plan.to?.name ? { destinationName: plan.to.name } : {}) : []),
    [option?.itinerary.id, lang],
  );
  if (!option || !plan.to) {
    return (
      <main>
        <Header title={t('steps')} />
        <p>{t('no_route')}</p>
      </main>
    );
  }
  const start = async () => {
    const from = plan.start ?? plan.from ?? { name: t('my_location'), lat: option.itinerary.legs[0]!.from.lat, lng: option.itinerary.legs[0]!.from.lng };
    await runtime.start(option.itinerary, [from, plan.to!]);
    router.navigate('/guide');
  };
  return (
    <main>
      <Header title={t('steps')} />
      <p>{formatSummary(option.summary, lang)}</p>
      <ol data-testid="step-list">
        {steps.map((s) => (
          <li key={s.id}>
            {s.text}
            {s.detail && (
              <>
                <br />
                <small>{s.detail}</small>
              </>
            )}
          </li>
        ))}
      </ol>
      <button type="button" data-testid="toggle-map" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>
        {t('show_map')}
      </button>
      {showMap && <MapPanel steps={steps} />}
      <p>
        <button type="button" data-testid="start-guide" onClick={start}>
          {t('start_guide')}
        </button>
      </p>
    </main>
  );
}
