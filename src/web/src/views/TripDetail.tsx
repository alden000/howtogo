/**
 * H4 Trip overview (STYLE-GUIDE §6 H4) and H4 journey (§6c.4): fitted map + timeline.
 * "开始出发 / Start" (flag `guide`) is the ONLY way a trip starts (AC 1/2): every entry point
 * (Home tile, Take me home, search, recent, H12 Route home, multi-stop, deep link) reaches
 * this screen and `useStartTrip()`, which runs the same runtime start call.
 */
import { useEffect, useMemo } from 'preact/hooks';
import { buildSteps, type Itinerary, type Journey, type Place } from '@howtogo/shared';
import { useServices, useT, type TFn } from '../context';
import { MapPanel } from '../map/MapPanel';
import { toLang } from '../state/store';
import { here } from '../state/location';
import { log } from '../log';
import { Bar, HelpButton, Icon, useStateHook } from '../ui/kit';
import { Chips } from './Routes';
import { dwellLabel } from './viewUtil';
import { clock, minutes, timeline } from './present';
import { ArrivalChip, DisruptionBanner, ExitForTrip, LiftFacts } from './transit';
import { refreshAlerts, refreshLifts } from '../transit/live';
import { fareText } from '../transit/m3';
import { family } from '../state/family';
import { shareOnStart } from './share';
import { EndFirstSheet } from './tripSheets';

const ICON = { walk: 'walk', bus: 'bus', train: 'train', dest: 'check' } as const;

type StartArgs = { it: Itinerary; places: Place[] } | { journey: Journey };
let pending: (() => Promise<void>) | null = null;

/**
 * The single Start flow (AC 4/5): the tap is the user gesture that asks for compass permission
 * (iOS), unlocks audio and takes the wake lock (runtime.start). Location denied → the runtime
 * starts in manual mode. An active trip first asks "End your current trip?" (G6).
 */
export function useStartTrip() {
  const { store, router, runtime, platform } = useServices();
  const go = async (s: StartArgs) => {
    // Inside the tap: iOS needs DeviceOrientationEvent.requestPermission() from a gesture.
    void platform.heading.requestPermission().catch(() => false);
    log('ui:start');
    if ('journey' in s) await runtime.startJourney(s.journey);
    else await runtime.start(s.it, s.places);
    router.enterGuide();
  };
  return (s: StartArgs) => {
    const cur = store.trip.peek();
    if (cur && (cur.phase ?? 'guiding') !== 'arrived') {
      pending = () => go(s);
      return router.openSheet('end-first');
    }
    return go(s);
  };
}

export function TripDetail() {
  const { store, router, flags } = useServices();
  const t = useT();
  const plan = store.plan.value;
  const isJourney = router.route.value.query.get('j') === '1' && !!plan.journey?.ok;
  return isJourney ? <JourneyOverview journey={plan.journey!} t={t} /> : <SingleOverview guide={flags.has('guide')} t={t} />;
}

function EndFirst() {
  const { router } = useServices();
  if (router.sheet.value !== 'end-first') return null;
  return (
    <EndFirstSheet
      onGo={async () => {
        const run = pending;
        pending = null;
        if (run) await run();
      }}
    />
  );
}

function SingleOverview({ guide, t }: { guide: boolean; t: TFn }) {
  const { store } = useServices();
  const start = useStartTrip();
  const plan = store.plan.value;
  const me = here.value;
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
  const onStart = () => {
    const from = plan.start ?? plan.from ?? { name: t('my_location'), lat: it.legs[0]!.from.lat, lng: it.legs[0]!.from.lng };
    return start({ it, places: [from, plan.to!] });
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
        <MapPanel steps={steps} me={me ? { pos: me, ...(me.acc !== undefined ? { acc: me.acc } : {}) } : null} toggle />
        <div style={{ padding: '0 var(--s-5) var(--s-6)' }}>
          <H4Extras it={it} />
          <ol class="timeline" data-testid="step-list">
            {timeline(it, plan.to, t, lang).map((row) => (
              <li class={row.kind === 'bus' || row.kind === 'train' ? 'ride' : ''}>
                <span class={`ic${row.kind === 'walk' ? '' : ` ${row.kind}`}`} aria-hidden="true">
                  <Icon name={ICON[row.kind]} />
                </span>
                <div>
                  {row.line ? (
                    <b>
                      {row.line.before}
                      <span class="linetag inline">
                        <span class="sw" style={{ background: `var(--${row.line.token})` }} />
                        <span class="cd">{row.line.code}</span>
                      </span>
                      {row.line.after}
                    </b>
                  ) : (
                    <b>{row.title}</b>
                  )}
                  {row.sub && <span>{row.sub}</span>}
                </div>
              </li>
            ))}
          </ol>
          <ExitForTrip itinerary={it} />
          {guide && (
          <button
              type="button"
              class="btn btn-quiet"
              data-testid="share-before"
              onClick={() => {
                // AC 8 (deviation): sharing needs a running trip on this phone, so Start opens the share sheet on H5.
                shareOnStart.value = true;
                void onStart();
              }}
            >
              <Icon name="share" />
              {t('sh_before')}
            </button>
          )}
        </div>
      </main>
      {guide && (
        <div class="dock">
          <button type="button" class="btn btn-primary" data-testid="start-guide" onClick={onStart}>
            <Icon name="nav" />
            {t('start')}
          </button>

        </div>
      )}
      <EndFirst />
    </>
  );
}


/** H4 (6d): disruption banner, first-bus chip (compact), fare line, lift facts. */
function H4Extras({ it }: { it: Itinerary }) {
  const { api } = useServices();
  const t = useT();
  useEffect(() => {
    void refreshAlerts(api);
    refreshLifts(api);
  }, []);
  const bus = it.legs.find((l) => l.mode === 'bus' && l.route);
  const fare = typeof it.fare === 'number' && it.fare > 0 ? fareText(it.fare) : null;
  return (
    <div data-testid="h4-extras">
      <DisruptionBanner where="h4" itinerary={it} />
      {bus && <ArrivalChip stop={bus.from.code} svc={bus.route!} active compact />}
      {fare && (
        <p class="xline" data-testid="fare-h4">
          <Icon name="card" /> {t(family.prefs.value.concession ? 'fare_h4_conc' : 'fare_h4', { f: fare })}
        </p>
      )}
      <p class="xline">
        <LiftFacts itinerary={it} detail />
      </p>
    </div>
  );
}

/** H4 journey (6c.4): one block per segment, dwell rows between, final arrival estimate. */
function JourneyOverview({ journey, t }: { journey: Journey; t: TFn }) {
  const { store, router } = useServices();
  const start = useStartTrip();
  const lang = store.settings.value.lang;
  const n = journey.places.length - 1;
  useStateHook(`trip-journey-${n}`);
  const steps = useMemo(
    () => journey.segments.flatMap((s) => (s.itinerary ? buildSteps(s.itinerary, toLang(lang), { destinationName: s.to.name }) : [])),
    [journey.startTime, lang],
  );
  return (
    <>
      <Bar>
        <HelpButton />
      </Bar>
      <main class="scroll" style={{ padding: 0 }}>
        <div style={{ padding: '0 var(--s-5) var(--s-3)' }}>
          <h1 class="t-title" style={{ margin: 0 }}>
            {t('hj_title')}
          </h1>
          <p class="t-label num" style={{ margin: '6px 0 0', color: 'var(--c-ink-2)' }} data-testid="trip-summary">
            {t('hj_line', { n, t: journey.endTime ? clock(journey.endTime, lang) : '—' })}
          </p>
        </div>
        <MapPanel steps={steps} toggle />
        <div style={{ padding: '0 var(--s-5) var(--s-6)' }} data-testid="journey-timeline">
          {journey.segments.map((s, k) => (
            <>
              {k > 0 && s.dwellS > 0 && (
                <div class="dwellrow">
                  <Icon name="clock" />
                  {t('hj_stay', { p: s.from.name, d: dwellLabel(Math.round(s.dwellS / 60), t) })}
                </div>
              )}
              <div class="seghead" data-testid={`segment-${k}`}>
                <b>{t('hj_part', { k: k + 1, p: s.to.name })}</b>
                {s.arriveAt && <span class="num">{t('hj_about', { t: clock(s.arriveAt, lang) })}</span>}
              </div>
              {s.itinerary && <Chips it={s.itinerary} />}
            </>
          ))}
          <p class="t-caption" style={{ color: 'var(--c-ink-2)', marginTop: 'var(--s-4)' }}>
            {t('hj_note')}
          </p>
        </div>
      </main>
      <div class="dock">
        <button type="button" class="btn btn-primary" data-testid="start-guide" onClick={() => start({ journey })}>
          <Icon name="nav" />
          {t('start')}
        </button>
        <button type="button" class="btn btn-quiet" data-testid="journey-change" onClick={() => router.back()}>
          {t('hj_change')}
        </button>
      </div>
      <EndFirst />
    </>
  );
}
