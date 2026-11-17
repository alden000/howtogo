import { useState } from 'preact/hooks';
import { Header } from '../app';
import { useServices, useT } from '../context';
import { MapPanel } from '../map/MapPanel';

export function Guide() {
  const { store, router, runtime } = useServices();
  const t = useT();
  const trip = store.trip.value;
  const muted = store.settings.value.muted;
  const [showMap, setShowMap] = useState(false);

  if (!trip) {
    return (
      <main>
        <Header title={t('start_guide')} />
        <p>{t('share_none')}</p>
      </main>
    );
  }
  const g = trip.guidance;
  const step = g.steps[g.stepIndex];
  const arrived = g.status === 'arrived';
  const canBoard = !!step && step.kind.startsWith('board');
  const riding = !!step && step.kind.startsWith('ride');
  const puck = g.snapped ?? g.fix;

  return (
    <main>
      <Header title={arrived ? t('arrived') : `${g.stepIndex + 1} / ${g.steps.length}`} />
      {runtime.rerouting.value && <p role="status">{t('rerouting')}</p>}
      {runtime.locationError.value && <p role="alert">{t('location_denied')}</p>}
      {arrived ? (
        <section>
          <p data-testid="arrived" role="status" aria-live="assertive">
            {t('arrived')}
          </p>
          <button
            type="button"
            data-testid="finish-trip"
            onClick={async () => {
              await runtime.end();
              router.navigate('/', { replace: true });
            }}
          >
            {t('done')}
          </button>
        </section>
      ) : (
        <section aria-live="polite">
          <p data-testid="current-step">
            <strong>{step?.text}</strong>
          </p>
          {step?.detail && <p>{step.detail}</p>}
          {g.status === 'off_route' && <p role="alert">{t('rerouting')}</p>}
          <p data-testid="guide-progress" data-step={g.stepIndex} data-status={g.status}>
            {Math.round(g.distanceToNextActionM)} m · {Math.ceil(g.remainingS / 60)} min
          </p>
        </section>
      )}
      <nav>
        <button type="button" data-testid="guide-repeat" onClick={() => runtime.repeat()}>
          {t('repeat')}
        </button>{' '}
        <button type="button" data-testid="guide-prev" onClick={() => runtime.previous()} disabled={g.stepIndex === 0}>
          {t('previous')}
        </button>{' '}
        <button type="button" data-testid="guide-next" onClick={() => runtime.next()} disabled={arrived}>
          {t('next')}
        </button>{' '}
        {canBoard && (
          <button type="button" data-testid="guide-onboard" onClick={() => runtime.onBoard()}>
            {t('on_board')}
          </button>
        )}
        {riding && (
          <button type="button" data-testid="guide-gotoff" onClick={() => runtime.gotOff()}>
            {t('got_off')}
          </button>
        )}
      </nav>
      <nav>
        <button
          type="button"
          data-testid="guide-mute"
          aria-pressed={muted}
          onClick={() => store.updateSettings({ muted: !muted })}
        >
          {muted ? t('unmute') : t('mute')}
        </button>{' '}
        <button type="button" data-testid="toggle-map" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>
          {t('show_map')}
        </button>{' '}
        <button type="button" data-testid="guide-share" onClick={() => router.navigate('/share/start')}>
          {t('share_trip')}
        </button>{' '}
        <button type="button" data-testid="guide-help" onClick={() => router.navigate('/help')}>
          {t('help')}
        </button>{' '}
        {!arrived && (
          <button type="button" data-testid="guide-end" onClick={() => router.openSheet('end-trip')}>
            {t('end_trip')}
          </button>
        )}
      </nav>
      {showMap && (
        <MapPanel steps={g.steps} puck={puck ? { pos: puck, acc: g.fix?.acc ?? 0, heading: runtime.heading.value ?? g.fix?.heading ?? null } : null} stepIndex={g.stepIndex} />
      )}
    </main>
  );
}
