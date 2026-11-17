/**
 * M3 UI pieces (STYLE-GUIDE §6d): T1 arrival chip + T2 tags, T3 disruption banner / notice / offer,
 * T5 exit hint, T6 transfer + CCL lines, T8 fare, F lift facts, T9 recent trips. Logic is in
 * transit/m3.ts; data in transit/live.ts.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { Itinerary, Lang, Step } from '@howtogo/shared';
import { lineByCode } from '@howtogo/shared';
import { useServices, useT, type TFn } from '../context';
import { log } from '../log';
import { family } from '../state/family';
import { toLang } from '../state/store';
import { affectedBy, alertKey, alertLineCode, busChip, exitHint, fareText, isDelay, liftDetail, liftIssues, liftsOk, lineName, relDay, stationText, type Chip, type ExitHint } from '../transit/m3';
import { ALERTS_TRIP_MS, alerts, lifts, refreshAlerts, useBusArrival, useNow } from '../transit/live';
import { announce, Icon, Sheet, showToast, type IconName } from '../ui/kit';

const useLang = (): Lang => toLang(useServices().store.settings.value.lang);

export function LineTag({ code }: { code: string }) {
  const l = lineByCode(code);
  return (
    <span class="linetag" aria-hidden="true">
      <span class="sw" style={{ background: `var(--${l?.colorToken ?? 'line-lrt'})` }} />
      <span class="cd">{code}</span>
    </span>
  );
}

// ---------------------------------------------------------------- T1 + T2
function tags(c: Chip, t: TFn): { icon: IconName; text: string }[] {
  const f = c.first;
  if (!f) return [];
  const out: { icon: IconName; text: string }[] = [];
  if (f.load === 'SDA') out.push({ icon: 'stand', text: t('load_sda') });
  else if (f.load === 'LSD') out.push({ icon: 'full', text: t('load_lsd') });
  else if (f.load === 'SEA') out.push({ icon: 'seat', text: t('load_sea') });
  if (f.wheelchair) out.push({ icon: 'wheelchair', text: t('tag_wab') });
  else if (family.prefs.value.wheelchair) out.push({ icon: 'wheelchair-no', text: t('tag_nowab') });
  if (f.deck === 'double') out.push({ icon: 'deck2', text: t('tag_dd') });
  else if (f.deck === 'bendy') out.push({ icon: 'bus', text: t('tag_bendy') });
  return out;
}

/** H5 wait step chip: polls while shown (not in pocket view), voice "arriving" once (monitored only). */
export function ArrivalChip({ stop, svc, active, compact = false }: { stop: string | undefined; svc: string; active: boolean; compact?: boolean }) {
  const { api, store, runtime } = useServices();
  const t = useT();
  const data = useBusArrival(api, stop, active);
  const now = useNow(5000);
  const prev = useRef<{ min: number | null; state: string | null; spoke: boolean; missedNext: number | null }>({ min: null, state: null, spoke: false, missedNext: null });
  const c = busChip(data === 'error' ? null : data, svc, now, prev.current.min);
  if (c.missed) prev.current.missedNext = c.min;
  else if (c.min !== prev.current.missedNext) prev.current.missedNext = null;
  const missed = prev.current.missedNext !== null;
  useEffect(() => {
    if (data === null) return;
    prev.current.min = c.min;
    if (prev.current.state !== c.state) {
      prev.current.state = c.state;
      log(`bus:chip ${c.state}`);
      if (!compact) announce(c.state === 'here' ? t('arr_here') : c.state === 'nodata' ? t('arr_nodata') : '');
      // 6d.1: "here" = attention + voice once, monitored data only (AC 9)
      if (!compact && c.state === 'here' && c.first?.monitored && !prev.current.spoke) {
        prev.current.spoke = true;
        log('bus:arriving-cue');
        runtime.speakText?.(t('arr_voice_here', { svc }), 'attention');
      }
    }
  }, [data, c.state, c.min]);
  if (data === null) return null;
  const tg = tags(c, t);
  const sr =
    c.state === 'live'
      ? t('arr_sr_live', { svc, n: c.min!, tags: tg.map((x) => x.text + '，').join(''), m: c.nextMin ?? '-' })
      : c.state === 'estimated'
        ? t('arr_sr_est', { svc, n: c.min! })
        : c.state === 'here'
          ? `${t('arr_here')}。${t('arr_here_s')}`
          : `${t('arr_nodata')}。${t('arr_nodata_s')}`;
  const big = c.state === 'here' ? t('arr_here') : c.state === 'live' ? t('arr_min', { n: c.min! }) : c.state === 'estimated' ? t('arr_about_min', { n: c.min! }) : t('arr_nodata');
  const second =
    c.state === 'here' ? t('arr_here_s')
    : c.state === 'nodata' ? t('arr_nodata_s')
    : missed && c.nextMin !== null ? t('arr_missed', { n: c.min! })
    : c.state === 'estimated' ? t('arr_est_s')
    : c.nextMin === null ? ''
    : c.first?.load === 'LSD' && c.nextLoad === 'SEA' ? t('arr_next_seats', { n: c.nextMin })
    : t('arr_next', { n: c.nextMin });
  void store;
  return (
    <div class={`arrchip s-${c.state}${compact ? ' compact' : ''}`} role="group" aria-label={sr} data-testid="arrchip" data-state={c.state}>
      <div class="arow" aria-hidden="true">
        <span class="busbadge">
          <Icon name="bus" />
          {svc}
        </span>
        {c.state === 'nodata' && <Icon name="clock" />}
        <b class={`num ${c.state === 'nodata' ? 'small' : 'big'}`}>{big}</b>
        {c.state === 'live' && (
          <span class="src">
            <i class="dot" />
            {t('arr_live')}
          </span>
        )}
        {c.state === 'estimated' && (
          <span class="src">
            <i class="dot hollow" />
            {t('arr_tt')}
          </span>
        )}
      </div>
      {!compact && second && (
        <p class="second" aria-hidden="true" data-testid="arr-second">
          {second}
        </p>
      )}
      {!compact && c.lessCrowded && (
        <p class="second" aria-hidden="true" data-testid="arr-less">
          {t('arr_less')}
        </p>
      )}
      {tg.length > 0 && c.state !== 'nodata' && (
        <div class="loadtags" aria-hidden="true">
          {tg.map((x) => (
            <span class="loadtag" data-testid="loadtag">
              <Icon name={x.icon} />
              {x.text}
            </span>
          ))}
        </div>
      )}
      {!compact && c.ageS !== null && c.state !== 'nodata' && (
        <p class="fresh" aria-hidden="true">
          {c.ageS <= 30 ? t('arr_upd_now') : t('arr_upd_s', { n: c.ageS })}
        </p>
      )}
    </div>
  );
}

/** H3 card line for the first bus (live/estimated only; nothing otherwise). */
export function ArrivalLine({ stop, svc }: { stop: string | undefined; svc: string }) {
  const { api } = useServices();
  const t = useT();
  const data = useBusArrival(api, stop, true);
  const c = busChip(data === 'error' ? null : data, svc, Date.now());
  if (c.state !== 'live' && c.state !== 'estimated') return null;
  return (
    <span data-testid="arr-h3">
      <Icon name="clock" />
      {t(c.state === 'live' ? 'arr_h3' : 'arr_h3_est', { svc, n: c.min! })}
    </span>
  );
}

// ---------------------------------------------------------------- T3 disruption
interface BannerProps {
  where: 'home' | 'h3' | 'h4' | 'h5';
  itinerary?: Itinerary;
  fromLeg?: number;
  onFind?: () => void;
}

/** Disruption banner: Home (any disrupted line, dismissable, AC 19 + OQ9), H3/H4/H5 (only when the route is affected). */
export function DisruptionBanner({ where, itinerary, fromLeg = 0, onFind }: BannerProps) {
  const { router } = useServices();
  const t = useT();
  const lang = useLang();
  const a = alerts.value;
  if (!a || a.status !== 'disrupted' || !a.lines.length) {
    if (where === 'home' && a?.minor)
      return (
        <p class="note" role="note" data-testid="disruption-minor">
          <Icon name="info" />
          <button type="button" class="btn-quiet linkish" onClick={() => router.openSheet('lta-notice')}>
            {t('dis_minor')}
          </button>
        </p>
      );
    return null;
  }
  let line = a.lines[0]!;
  let code = alertLineCode(line);
  if (where !== 'home') {
    const hit = itinerary ? affectedBy(a, itinerary, fromLeg) : null;
    if (!hit) return null;
    line = hit.alert;
    code = hit.line;
  } else if (family.prefs.value.dismissed.includes(alertKey(a))) return null;
  const name = lineName(code, lang);
  const title = t(isDelay(a) ? 'dis_title_delay' : 'dis_title', { line: name });
  const st = line.stations;
  const l1 = st.length >= 2 ? t('dis_l1', { from: stationText(st[0]!, lang), to: stationText(st[st.length - 1]!, lang), dir: line.direction || '—' }) : '';
  const l2 = line.freePublicBus.length ? t('dis_l2', { codes: line.freePublicBus.map((c) => stationText(c, lang)).join('、') }) : '';
  return (
    <section class="banner warn" role="region" aria-label={title} data-testid="disruption" data-where={where}>
      <span class="wic" aria-hidden="true">
        <Icon name="train-off" />
      </span>
      <div class="tx">
        <b>
          <LineTag code={code} /> {title}
        </b>
        {where !== 'h5' && l1 && <span>{l1}</span>}
        {where !== 'h5' && l2 && <span>{l2}</span>}
        <div class="bacts">
          {onFind && (
            <button type="button" class="btn btn-primary" data-testid="disruption-find" onClick={onFind}>
              <Icon name="route" />
              {t('dis_find')}
            </button>
          )}
          <button type="button" class="btn btn-quiet" data-testid="disruption-notice" onClick={() => router.openSheet('lta-notice')}>
            {t('dis_notice')}
          </button>
          {where === 'home' && (
            <button
              type="button"
              class="btn btn-quiet"
              data-testid="disruption-dismiss"
              onClick={() => family.setPrefs({ dismissed: [...family.prefs.value.dismissed.slice(-9), alertKey(a)] })}
            >
              {t('dis_dismiss')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** LTA notice sheet: messages verbatim in English (6d.3). */
export function LtaNoticeSheet() {
  const t = useT();
  const a = alerts.value;
  return (
    <Sheet id="lta-notice" title={t('dis_notice_t')}>
      {(a?.messages ?? []).map((m) => (
        <p class="t-body" lang="en" data-testid="lta-message">
          {m.text}
        </p>
      ))}
      <p class="t-caption">{t('dis_notice_en')}</p>
    </Sheet>
  );
}

/** H3 card fact (AC 20): "[NS] no trains at some stations". */
export function AffectedFact({ itinerary }: { itinerary: Itinerary }) {
  const t = useT();
  const hit = affectedBy(alerts.value, itinerary);
  if (!hit) return null;
  return (
    <span class="warnfact" data-testid="affected-fact">
      <LineTag code={hit.line} /> {t('dis_fact')}
    </span>
  );
}

// ---------------------------------------------------------------- F lifts + T8 fare
export function LiftFacts({ itinerary, detail = false }: { itinerary: Itinerary; detail?: boolean }) {
  const t = useT();
  const lang = useLang();
  const l = lifts.value;
  const issues = liftIssues(itinerary, l);
  if (issues.length)
    return (
      <>
        {issues.map((i) => (
          <span class="warnfact" data-testid="lift-fact">
            <Icon name="info" />
            {detail ? liftDetail(i, lang) : t('lift_fact', { st: lang === 'zh-CN' ? i.station.zh : i.station.en })}
          </span>
        ))}
      </>
    );
  if (liftsOk(itinerary, l, Date.now()))
    return (
      <span data-testid="lift-ok">
        <Icon name="check" />
        {t('lift_ok')}
      </span>
    );
  return null;
}

export function FareFact({ itinerary }: { itinerary: Itinerary }) {
  const t = useT();
  if (typeof itinerary.fare !== 'number' || !(itinerary.fare > 0) || family.prefs.value.concession) return null;
  return (
    <span data-testid="fare">
      <Icon name="card" />
      {t('fare_about', { f: fareText(itinerary.fare) })}
    </span>
  );
}

export function FareNote({ any }: { any: boolean }) {
  const t = useT();
  if (!any) return null;
  return (
    <p class="note" data-testid="fare-note">
      <Icon name="card" />
      <span>{t(family.prefs.value.concession ? 'fare_note_conc' : 'fare_note')}</span>
    </p>
  );
}

// ---------------------------------------------------------------- H5 step extras
/** Lines under the H5 step headline: chip (wait bus), CCL next stop, transfer, exit hint, lift detail. */
export function StepExtras({ step, itinerary, pocket }: { step: Step | undefined; itinerary: Itinerary; pocket: boolean }) {
  const t = useT();
  const lang = useLang();
  if (!step) return null;
  const out = [];
  if (step.kind === 'board_bus' && step.route) out.push(<ArrivalChip stop={step.fromCode} svc={step.route} active={!pocket} />);
  if (step.kind === 'board_train' && step.line?.code === 'CC' && step.nextStop)
    out.push(
      <p class="xline" data-testid="ccl-next">
        {t('ccl_next', { p: step.nextStop })}
      </p>,
    );
  if (step.kind === 'walk_transfer' && step.mode === 'walk') {
    const next = itinerary.legs[step.legIndex + 1];
    if (next?.line && (next.mode === 'mrt' || next.mode === 'lrt')) {
      const walk = itinerary.legs[step.legIndex]!;
      const out2 = walk.from.name && walk.to.name && walk.from.name !== walk.to.name && /MRT|LRT|STATION/i.test(walk.from.name);
      out.push(
        <p class="xline" data-testid="transfer-sub">
          <LineTag code={next.line.code} /> {out2 ? t('tr_sub_out') : t('tr_sub', { line: lineName(next.line.code, lang), n: Math.max(1, Math.round(step.durationS / 60)) })}
        </p>,
      );
    }
  }
  const lf = lifts.value;
  const issues = liftIssues(itinerary, lf);
  const hint = exitHint(itinerary, lang, issues);
  if (hint && step.kind === 'ride_train' && step.legIndex === hint.legIndex) out.push(<ExitLine hint={hint} kind="alight" />);
  if (hint && step.kind === 'walk_to_destination' && step.legIndex === hint.legIndex + 1) out.push(<ExitLine hint={hint} kind="walk" />);
  if (step.mode === 'mrt' || step.mode === 'lrt') {
    const leg = itinerary.legs[step.legIndex];
    for (const i of issues) {
      if (leg && (i.station.en === leg.from.name || i.station.en === leg.to.name || i.code === leg.from.code || i.code === leg.to.code))
        out.push(
          <p class="xline warnfact" data-testid="lift-step">
            <Icon name="info" />
            {liftDetail(i, lang)}
          </p>,
        );
    }
    if (family.prefs.value.liftFriendly && step.kind === 'ride_train') out.push(<p class="xline">{t('lift_follow')}</p>);
  }
  return <>{out}</>;
}

export function ExitLine({ hint, kind }: { hint: ExitHint; kind: 'alight' | 'walk' | 'h4' }) {
  const t = useT();
  const tag = <span class="exittag">{hint.code}</span>;
  useEffect(() => log('exit:shown'), [hint.code]);
  const why = hint.avoided ? t('exit_avoid', { a: hint.avoided, x: hint.code }) : '';
  const k = kind === 'alight' ? 'exit_alight' : kind === 'walk' ? 'exit_walk' : 'exit_h4';
  const [a, b] = t(k, { x: '\u0000' }).split('\u0000');
  return (
    <p class="xline exitline" data-testid="exit-hint" data-exit={hint.code}>
      {a}
      {tag}
      {b}
      {kind === 'walk' && <span class="sub">{hint.landmark ? t('exit_landmark', { p: hint.landmark }) : t('exit_sign', { x: hint.code })}</span>}
      {why && <span class="sub">{why}</span>}
    </p>
  );
}

/** H4 overview line: exit hint (AC 15 parity). */
export function ExitForTrip({ itinerary }: { itinerary: Itinerary }) {
  const lang = useLang();
  const hint = exitHint(itinerary, lang, liftIssues(itinerary, lifts.value));
  return hint ? <ExitLine hint={hint} kind="h4" /> : null;
}

// ---------------------------------------------------------------- T9 recents
export function RecentTrips({ onPick }: { onPick: (i: number) => void }) {
  const { store } = useServices();
  const t = useT();
  const lang = useLang();
  const saved = store.places.value;
  const list = store.recents.value
    .filter((r) => r.to.name !== saved.home?.name && !saved.others.some((o) => o.name === r.to.name && Math.abs(o.lat - r.to.lat) < 1e-4))
    .slice(0, 3);
  if (!list.length) return null;
  const now = Date.now();
  return (
    <section class="recenttrips" data-testid="recent-trips" aria-labelledby="rt-h">
      <h2 id="rt-h" class="t-label">
        {t('recent_trips')}
      </h2>
      {list.map((r) => {
        const i = store.recents.value.indexOf(r);
        const from = r.from?.name ?? t('my_location');
        const d = relDay(r.at, now, lang);
        return (
          <div class="rrow">
            <button type="button" class="ritem" data-testid={`recent-trip-${i}`} onClick={() => onPick(i)}>
              <span class="ic" aria-hidden="true">
                <Icon name="clock" />
              </span>
              <span class="tx">
                <b>{t('recent_to', { p: r.to.name })}</b>
                <span>{t('recent_from', { p: from, d })}</span>
              </span>
              <Icon name="chev" />
            </button>
            <button
              type="button"
              class="iconbtn sq"
              data-testid={`recent-remove-${i}`}
              aria-label={`${t('recent_remove')} ${r.to.name}`}
              onClick={() => (store.recents.value = store.recents.value.filter((_, k) => k !== i))}
            >
              <Icon name="trash" />
            </button>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- in-trip disruption (AC 21–23)
let offered = '';
let shownLine: string | null = null;

/** H5 band: banner when a future rail leg is affected; offer sheet once; "service is back" toast. Never auto re-route. */
export function TripDisruption({ itinerary, legIndex }: { itinerary: Itinerary; legIndex: number }) {
  const { api, router, runtime, store } = useServices();
  const t = useT();
  const lang = toLang(store.settings.value.lang);
  const hasRail = itinerary.legs.slice(legIndex).some((l) => l.mode === 'mrt' || l.mode === 'lrt');
  useEffect(() => {
    if (!hasRail) return;
    void refreshAlerts(api);
    const id = setInterval(() => void refreshAlerts(api, true), ALERTS_TRIP_MS);
    return () => clearInterval(id);
  }, [hasRail]);
  const a = alerts.value;
  const hit = affectedBy(a, itinerary, legIndex);
  useEffect(() => {
    if (hit && a) {
      const key = `${alertKey(a)}|${hit.line}`;
      shownLine = hit.line;
      if (offered !== key) {
        offered = key;
        log('alerts:offer shown');
        runtime.speakText(t('dis_voice', { line: lineName(hit.line, lang) }), 'gentle');
        router.openSheet('dis-offer');
      }
    } else if (!hit && shownLine) {
      showToast('dis-cleared', t('dis_cleared', { line: lineName(shownLine, lang) }));
      announce(t('dis_cleared', { line: lineName(shownLine, lang) }));
      shownLine = null;
      offered = '';
    }
  }, [hit?.line, a]);
  if (!hit) return null;
  return <DisruptionBanner where="h5" itinerary={itinerary} fromLeg={legIndex} onFind={() => router.openSheet('dis-offer')} />;
}

/** Re-route offer (AC 21/22): find another way avoiding the affected stations, or keep. Back = keep. */
export function DisruptionOfferSheet() {
  const { router, runtime, store } = useServices();
  const t = useT();
  const tr = store.trip.value;
  const a = alerts.value;
  return (
    <Sheet id="dis-offer" title={t('dis_offer_t')}>
      {tr && <DisruptionBanner where="h4" itinerary={tr.itinerary} />}
      <div class="stack">
        <button
          type="button"
          class="btn btn-primary btn-hero"
          data-testid="offer-find"
          onClick={() => {
            log('alerts:offer accepted');
            router.closeSheet();
            void runtime.reroute((it) => !!affectedBy(a, it));
          }}
        >
          <Icon name="route" />
          {t('dis_find')}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          data-testid="offer-keep"
          onClick={() => {
            log('alerts:offer kept');
            router.closeSheet();
          }}
        >
          {t('dis_keep')}
        </button>
      </div>
    </Sheet>
  );
}
