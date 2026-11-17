/** H3 Route options (STYLE-GUIDE §6 H3, §5.2 cards). Ranking: shared engine, least walking by default. */
import { useEffect, useState } from 'preact/hooks';
import { haversine, normalizeOneMapPlan, rankItineraries, summarize, type Itinerary, type Leg, type Place, type RankedItinerary } from '@howtogo/shared';
import { online } from '../api/offline';
import { here, inSingapore, locate } from '../state/location';
import { isApiError } from '../api/errors';
import { useServices, useT, type TFn } from '../context';
import { log } from '../log';
import { Bar, HelpButton, Icon, Seal, StatePanel, useStateHook } from '../ui/kit';
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

type Phase = 'idle' | 'loading' | 'need_loc' | 'loc_unavailable' | 'none' | 'close' | 'out_dest' | 'out_me' | 'error' | 'busy' | 'offline';

/** F3 `close`: closer than this, offer walking (AC 34). */
export const TOO_CLOSE_M = 200;
/** Assumed walking pace for the too-close estimate (straight line, unhurried ~1 m/s). */
const WALK_MPS = 1;
const SLOW_MS = 6000;

/** A one-leg walking itinerary for "Show the walking way" (F3 close). */
export function walkOnly(start: Place, end: Place, now = Date.now()): RankedItinerary {
  const distanceM = Math.round(haversine(start, end));
  const durationS = Math.max(60, Math.round(distanceM / WALK_MPS));
  const stop = (p: Place) => ({ name: p.name, displayName: p.name, lat: p.lat, lng: p.lng });
  const leg: Leg = { mode: 'walk', from: stop(start), to: stop(end), startTime: now, endTime: now + durationS * 1000, durationS, distanceM, geometry: [start, end], intermediateStops: [], turns: [] };
  const itinerary: Itinerary = { id: 'walk-only', startTime: now, endTime: leg.endTime, durationS, walkTimeS: durationS, transitTimeS: 0, waitingTimeS: 0, walkDistanceM: distanceM, transfers: 0, legs: [leg] };
  return { itinerary, score: 0, labels: [], summary: summarize(itinerary) };
}

export function Routes() {
  const { store, router, api, platform } = useServices();
  const t = useT();
  const plan = store.plan.value;
  const settings = store.settings.value;
  const lang = settings.lang;
  const me = here.value;
  const [phase, setPhase] = useState<Phase>(plan.options.length ? 'idle' : 'loading');
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);
  const [closeM, setCloseM] = useState(0);

  useEffect(() => {
    if (!plan.to) return;
    if (plan.options.length && plan.fetchedAt && Date.now() - plan.fetchedAt < FRESH_MS && attempt === 0) return;
    let cancelled = false;
    (async () => {
      setPhase('loading');
      if (!inSingapore(plan.to!)) return setPhase('out_dest');
      let start: Place;
      if (plan.from) start = plan.from;
      else {
        // F2: never trigger the browser prompt without the explainer (AC 25).
        if (!me) {
          const perm = await platform.location.permission().catch(() => 'prompt' as PermissionState);
          if (cancelled) return;
          if (perm !== 'granted') {
            setPhase('need_loc');
            if (!router.sheet.value) router.openSheet(perm === 'denied' ? 'loc-denied' : 'loc-explain');
            return;
          }
          const r = await locate(platform, api);
          if (cancelled) return;
          if (r !== 'ok') return setPhase(r === 'denied' ? 'need_loc' : 'loc_unavailable');
          return; // `here` changed → this effect runs again with the fix
        }
        start = { name: me.label ?? t('my_location'), lat: me.lat, lng: me.lng };
      }
      if (!inSingapore(start)) return setPhase('out_me');
      const d = haversine(start, plan.to!);
      if (d < TOO_CLOSE_M) {
        store.setPlan({ start });
        setCloseM(Math.round(d));
        return setPhase('close');
      }
      try {
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
        if (!cancelled) setPhase('none');
      } catch (e) {
        if (cancelled) return;
        if (isApiError(e) && e.kind === 'offline') setPhase('offline');
        else if (isApiError(e) && e.status === 429) setPhase('busy');
        else setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan.to?.lat, plan.to?.lng, plan.from?.lat, plan.from?.lng, me?.lat, me?.lng, settings.preference, attempt]);

  // Loading: after 6 s add "still looking" (F3).
  useEffect(() => {
    setSlow(false);
    if (phase !== 'loading') return;
    const id = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(id);
  }, [phase]);
  // Offline: look again by itself when the connection comes back (F3).
  useEffect(() => {
    if (phase === 'offline' && online.value) setAttempt((a) => a + 1);
  }, [online.value]);

  const options = phase === 'idle' ? plan.options : [];
  // State panels log their own `state:` line; here only the list and loading states.
  useStateHook(phase === 'idle' ? `routes-${options.length === 1 ? 'one' : 'some'}` : phase === 'loading' || phase === 'need_loc' ? `routes-${phase}` : null);
  const from = plan.from ?? (me ? { name: me.label ?? t('my_location') } : plan.start);
  const retry = () => setAttempt((a) => a + 1);
  const retryBtn = (
    <button type="button" class="btn btn-primary" data-testid="routes-retry" onClick={retry}>
      {t('try_again')}
    </button>
  );
  const otherBtn = (
    <button type="button" class="btn btn-secondary" data-testid="routes-other" onClick={() => router.navigate('/search')}>
      {t('choose_other')}
    </button>
  );
  const typeStartBtn = (key: 'type_start' | 'type_place') => (
    <button type="button" class="btn btn-secondary" data-testid="routes-type-start" onClick={() => router.navigate('/search?field=from')}>
      {t(key)}
    </button>
  );

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

        {(phase === 'loading' || phase === 'need_loc') && (
          <div aria-busy="true" aria-label={t('r_finding_sr')} data-testid="routes-loading">
            <div class="loadline">
              <Seal pulse />
              <p class="t-headline" role="status" style={{ margin: 0 }}>
                {t('routes_loading')}
                {slow && (
                  <>
                    <br />
                    <span class="t-caption">{t('r_loading_more')}</span>
                  </>
                )}
              </p>
            </div>
            <div class="cards" aria-hidden="true">
              <div class="skel cardsk" />
              <div class="skel cardsk" />
            </div>
          </div>
        )}
        {phase === 'loc_unavailable' && (
          <StatePanel id="routes-loc-unavailable" icon="loc" title={t('loc_unavail')}>
            {retryBtn}
            {typeStartBtn('type_place')}
          </StatePanel>
        )}
        {phase === 'none' && (
          <StatePanel id="routes-none" icon="route" title={t('r_none_t')} body={t('r_none_b')}>
            {retryBtn}
            {otherBtn}
          </StatePanel>
        )}
        {phase === 'close' && (
          <StatePanel id="routes-close" icon="walk" title={t('r_close_t')} body={t('r_close_b', { m: closeM, min: Math.max(1, Math.round(closeM / WALK_MPS / 60)) })}>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="routes-show-walk"
              onClick={() => {
                const start = store.plan.peek().start;
                if (!start || !plan.to) return;
                store.setPlan({ options: [walkOnly(start, plan.to)], selected: 0, fetchedAt: Date.now() });
                router.navigate('/trip');
              }}
            >
              {t('show_walk')}
            </button>
            {otherBtn}
          </StatePanel>
        )}
        {phase === 'out_dest' && (
          <StatePanel id="routes-outside" icon="loc" title={t('r_out_dest_t')} body={t('r_out_dest_b')}>
            {otherBtn}
          </StatePanel>
        )}
        {phase === 'out_me' && (
          <StatePanel id="routes-outside-me" icon="loc" title={t('r_out_me_t')} body={t('r_out_me_b')}>
            {typeStartBtn('type_start')}
          </StatePanel>
        )}
        {phase === 'error' && (
          <StatePanel id="routes-error" icon="refresh" title={t('r_err_t')} body={t('r_err_b')}>
            {retryBtn}
            {otherBtn}
          </StatePanel>
        )}
        {phase === 'busy' && (
          <StatePanel id="routes-busy" icon="clock" title={t('busy_t')} body={t('busy_b')}>
            {retryBtn}
          </StatePanel>
        )}
        {phase === 'offline' && (
          <StatePanel id="routes-offline" icon="wifi-off" title={t('off_t')} body={t('r_off_b')}>
            {retryBtn}
          </StatePanel>
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
