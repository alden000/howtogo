/** H3 Route options (STYLE-GUIDE §6 H3, §5.2 cards). Ranking: shared engine, least walking by default. */
import { useEffect, useState } from 'preact/hooks';
import { normalizeOneMapPlan, rankItineraries, type Place } from '@howtogo/shared';
import { isApiError } from '../api/errors';
import { useServices, useT, type TFn } from '../context';
import { log } from '../log';
import { Bar, HelpButton, Icon, useStateHook } from '../ui/kit';
import { cardLabel, chips, clock, facts, hasBus, minutes, tagText } from './present';

/** OQ6: least-walk asks OneMap for ≤ 500 m walks first, widening to 1000 m if nothing is found. */
const WALK_STEPS = [500, 1000];
const FRESH_MS = 60_000;

/** "Text with {p} highlighted" → [before, after]. */
export function splitAround(t: TFn, key: 'how_to', p: string) {
  const [a = '', b = ''] = t(key, { p: '\u0000' }).split('\u0000');
  return (
    <>
      {a}
      <span class="hl">{p}</span>
      {b}
    </>
  );
}

export function Chips({ it }: { it: Parameters<typeof chips>[0] }) {
  return (
    <span class="chain" aria-hidden="true">
      {chips(it).map((c, i) => (
        <>
          {i > 0 && (
            <span class="sep">
              <Icon name="chev" />
            </span>
          )}
          {c.kind === 'walk' && (
            <span class="walkchip">
              <Icon name="walk" />
              <span class="num">{c.min}</span>
            </span>
          )}
          {c.kind === 'bus' && (
            <span class="busbadge">
              <Icon name="bus" />
              <span class="num">{c.route}</span>
            </span>
          )}
          {c.kind === 'line' && (
            <span class="linetag">
              <span class="sw" style={{ background: `var(--${c.token})` }} />
              <span class="cd">
                <Icon name="train" />
                {c.code}
              </span>
            </span>
          )}
        </>
      ))}
    </span>
  );
}

type Phase = 'idle' | 'loading' | 'error' | 'offline' | 'no_route';

export function Routes() {
  const { store, router, api, platform } = useServices();
  const t = useT();
  const plan = store.plan.value;
  const settings = store.settings.value;
  const lang = settings.lang;
  const [phase, setPhase] = useState<Phase>(plan.options.length ? 'idle' : 'loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!plan.to) return;
    if (plan.options.length && plan.fetchedAt && Date.now() - plan.fetchedAt < FRESH_MS && attempt === 0) return;
    let cancelled = false;
    (async () => {
      setPhase('loading');
      try {
        let start: Place;
        if (plan.from) start = plan.from;
        else {
          const f = await platform.location.current();
          const label = await api
            .revgeocode(f)
            .then((r) => r.name)
            .catch(() => t('my_location'));
          start = { name: label, lat: f.lat, lng: f.lng };
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
            setPhase('idle');
            return;
          }
        }
        if (!cancelled) setPhase('no_route');
      } catch (e) {
        if (!cancelled) setPhase(isApiError(e) && e.kind === 'offline' ? 'offline' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan.to?.lat, plan.to?.lng, plan.from?.lat, plan.from?.lng, settings.preference, attempt]);

  const options = phase === 'idle' ? plan.options : [];
  useStateHook(phase === 'idle' ? `routes-${options.length === 1 ? 'one' : options.length ? 'some' : 'none'}` : `routes-${phase}`);
  const from = plan.start ?? plan.from;

  return (
    <>
      <Bar>
        <HelpButton />
      </Bar>
      <main class="scroll">
        <div class="q">
          <h1 class="t-title" style={{ margin: 0 }} data-testid="routes-title">
            {splitAround(t, 'how_to', plan.to?.name ?? '')}
          </h1>
          {from && (
            <div class="from" data-testid="routes-from">
              <Icon name="loc" />
              {t('from_here', { p: from.name })}
            </div>
          )}
        </div>

        {phase === 'loading' && (
          <div class="state" role="status" data-testid="routes-loading">
            <span class="spinner" aria-hidden="true" />
            <p class="t-headline">{t('routes_loading')}</p>
          </div>
        )}
        {(phase === 'error' || phase === 'offline' || phase === 'no_route') && (
          <div class="state" role="alert" data-testid={`routes-${phase}`}>
            <p class="t-headline">{t(phase === 'offline' ? 'error_offline' : phase === 'no_route' ? 'no_route' : 'error_generic')}</p>
            <button type="button" class="btn btn-secondary small" data-testid="routes-retry" onClick={() => setAttempt((a) => a + 1)}>
              {t('try_again')}
            </button>
          </div>
        )}

        {options.length > 0 && (
          <div class="cards">
            {options.map((o, i) => {
              const tag = tagText(o, i, options.length, t);
              return (
                <button
                  type="button"
                  key={o.itinerary.id}
                  class={`card${i === 0 ? ' best' : ''}`}
                  data-testid={`route-option-${i}`}
                  aria-label={cardLabel(o, i, options.length, lang, t)}
                  onClick={() => {
                    store.setPlan({ selected: i });
                    router.navigate('/trip');
                  }}
                >
                  {tag && (
                    <span class="tag">
                      {i === 0 && <Icon name="check" />}
                      {tag}
                    </span>
                  )}
                  <span class="dur">
                    <b class="num">
                      {minutes(o.itinerary.durationS)}
                      <small>{t('min')}</small>
                    </b>
                    <span class="num">{t('arrive_at', { t: clock(o.itinerary.endTime, lang) })}</span>
                  </span>
                  <Chips it={o.itinerary} />
                  <span class="facts">
                    {facts(o.itinerary, t).map((f) => (
                      <span>
                        <Icon name={f.icon} />
                        {f.text}
                      </span>
                    ))}
                  </span>
                  <span class="choose">
                    {t('choose')}
                    <Icon name="chev" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {options.length === 1 && (
          <div class="honest" data-testid="note-only-one">
            <Icon name="check" />
            <span>{t('only_one')}</span>
          </div>
        )}
        {options.some((o) => hasBus(o.itinerary)) && (
          <div class="honest" data-testid="note-honest">
            <Icon name="clock" />
            <span>{t('honest')}</span>
          </div>
        )}
      </main>
    </>
  );
}
