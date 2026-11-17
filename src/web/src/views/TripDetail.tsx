/** H4 Trip overview (STYLE-GUIDE §6 H4): fitted map + timeline. Start is behind feature flag `guide` (OQ5); "Tell family" is M4. */
import { useMemo } from 'preact/hooks';
import { buildSteps } from '@howtogo/shared';
import { useServices, useT } from '../context';
import { MapPanel } from '../map/MapPanel';
import { toLang } from '../state/store';
import { Bar, HelpButton, Icon, useStateHook } from '../ui/kit';
import { clock, minutes, timeline } from './present';

const ICON = { walk: 'walk', bus: 'bus', train: 'train', dest: 'check' } as const;

export function TripDetail() {
  const { store, router, runtime, flags } = useServices();
  const t = useT();
  const plan = store.plan.value;
  const lang = store.settings.value.lang;
  const option = plan.options[plan.selected];
  const steps = useMemo(
    () => (option ? buildSteps(option.itinerary, toLang(lang), plan.to?.name ? { destinationName: plan.to.name } : {}) : []),
    [option?.itinerary.id, lang],
  );
  const legs = option?.itinerary.legs ?? [];
  const kind = legs.some((l) => l.mode === 'bus') ? 'bus' : legs.some((l) => l.mode !== 'walk') ? 'mrt' : 'walk';
  useStateHook(option ? `trip-${kind}` : 'trip-none');
  if (!option || !plan.to) {
    return (
      <>
        <Bar />
        <main class="scroll">
          <p class="t-headline">{t('no_route')}</p>
        </main>
      </>
    );
  }
  const it = option.itinerary;
  const start = async () => {
    const from = plan.start ?? plan.from ?? { name: t('my_location'), lat: it.legs[0]!.from.lat, lng: it.legs[0]!.from.lng };
    await runtime.start(it, [from, plan.to!]);
    router.navigate('/guide');
  };
  return (
    <>
      <Bar>
        <HelpButton />
      </Bar>
      <main class="scroll" style={{ padding: 0 }}>
        <div style={{ padding: '0 var(--s-5) var(--s-3)' }}>
          <h1 class="t-title" style={{ margin: 0 }}>
            {t('go_to', { p: plan.to.name })}
          </h1>
          <p class="t-headline num" style={{ margin: '6px 0 0', color: 'var(--c-ink-2)' }} data-testid="trip-summary">
            {minutes(it.durationS)} {t('min')} · {t('arrive_at', { t: clock(it.endTime, lang) })}
          </p>
        </div>
        <MapPanel steps={steps} />
        <div style={{ padding: '0 var(--s-5) var(--s-6)' }}>
          <ol class="timeline" data-testid="step-list">
            {timeline(it, plan.to, t).map((row) => (
              <li class={row.kind === 'bus' || row.kind === 'train' ? 'ride' : ''}>
                <span class={`ic${row.kind === 'bus' ? ' bus' : row.kind === 'dest' ? ' dest' : ''}`} aria-hidden="true">
                  <Icon name={ICON[row.kind]} />
                </span>
                <div>
                  <b>{row.title}</b>
                  {row.sub && <span>{row.sub}</span>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </main>
      {flags.has('guide') && (
        <div class="dock">
          <button type="button" class="btn btn-primary" data-testid="start-guide" onClick={start}>
            <Icon name="nav" />
            {t('start')}
          </button>
        </div>
      )}
    </>
  );
}
