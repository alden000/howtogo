/**
 * H5 live guidance and its states (STYLE-GUIDE §6 H5/H6/H11/H12, §6c): solid top band,
 * follow-me map window, step card with trip notes and G5 actions, H6/H6b get-off alerts,
 * G1 pocket view, G3 waypoint arrival and H12 arrival. Everything is rendered from
 * `runtime.ui` + `store.trip`; every decision lives in the runtime (no logic duplicated here).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createSaverState } from '../state/battery';
import type { AlertState, Lang, Step } from '@howtogo/shared';
import { online } from '../api/offline';
import { useT5 } from '../i18n/m5lazy';
import { useServices, useT, type TFn } from '../context';
import { log } from '../log';
import { GuideMap } from '../map/GuideMap';
import { toLang, type ActiveTrip } from '../state/store';
import { announce, Icon, showToast, useStateHook, type IconName } from '../ui/kit';
import { clock } from './present';
import { ArrivedFamily, SharePill, useShareOnStart } from './share';
import { ArrivalChip, rerouteAvoid, StepExtras, TripDisruption } from './transit';
import { lineName } from '../transit/m3';
import { HelpNote } from './helpNote';
import {
  alertCopy,
  cardMaxHeight,
  followZoom,
  mapHeading,
  mapPadding,
  metresLeft,
  minutesLeft,
  nextStopName,
  pickNote,
  pocketText,
  STALE_PUCK_MS,
  stepActions,
  stepGroup,
  stepIcon,
  stopDots,
  walkMinutes,
  type NoteId,
  isTrainChange,
} from './guideModel';

/** `tick` haptic for UI-only moments (the runtime gives every other haptic). */
export { useTick, dwellLabel } from './viewUtil';
import { useTick, dwellLabel } from './viewUtil';
import { m6t, type M6Key } from '../i18n/m6';
import { enVoice, killed as m6killed } from '../m6/core';

const placeOf = (s: Step | undefined): string => String(s?.params.dest ?? s?.params.stop ?? '');
const focusHeadline = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="current-step"]')?.focus());

export function Guide() {
  const { store, router, runtime } = useServices();
  const t = useT();
  const trip = store.trip.value;
  const ui = runtime.ui.value;
  useStateHook(trip ? null : 'guide-none');
  if (!trip) {
    return (
      <main class="scroll">
        <p class="t-headline">{t('no_route')}</p>
        <button type="button" class="btn btn-primary" data-testid="go-home" onClick={() => router.reset('/')}>
          {t('app_name')}
        </button>
      </main>
    );
  }
  const phase = trip.phase ?? (trip.guidance.status === 'arrived' ? 'arrived' : 'guiding');
  if (phase === 'arrived' || ui.phase === 'arrived') return <Arrival trip={trip} />;
  if (phase === 'waypoint' || ui.phase === 'waypoint') return <Waypoint trip={trip} />;
  return <Live trip={trip} t={t} />;
}

// ------------------------------------------------------------------ H5

function Live({ trip, t }: { trip: ActiveTrip; t: TFn }) {
  useShareOnStart();
  const { store, router, runtime } = useServices();
  const tick = useTick();
  const ui = runtime.ui.value;
  const g = trip.guidance;
  const step = g.steps[g.stepIndex];
  const group = stepGroup(step);
  const isLast = g.stepIndex === g.steps.length - 1;
  const lang = store.settings.value.lang;
  const muted = store.settings.value.muted;
  const sheet = router.sheet.value;

  // ---- layout (6c.0): band and card are measured; the map window sits between them.
  const root = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const [box, setBox] = useState({ h: 844, band: 84, card: 380 });
  useLayoutEffect(() => {
    const measure = () => {
      const h = root.current?.getBoundingClientRect().height ?? 0;
      const b = Math.ceil(band.current?.getBoundingClientRect().height ?? 0);
      const c = Math.ceil(card.current?.getBoundingClientRect().height ?? 0);
      root.current?.style.setProperty('--band', `${b}px`);
      setBox((o) => (o.h === h && o.band === b && o.card === c ? o : { h, band: b, card: c }));
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    [root, band, card].forEach((r) => r.current && ro?.observe(r.current));
    return () => ro?.disconnect();
  }, []);

  // ---- sheets over H5 stop pocket view (runtime rule); resume toast.
  useEffect(() => runtime.setSheetOpen(!!sheet), [sheet]);
  useEffect(() => {
    if (!ui.resumed) return;
    showToast('resume', t('resume_toast'));
    runtime.dismissResumed();
  }, [ui.resumed]);

  // ---- manual → auto: "Found you" note for 4.2 s (6c.7).
  const [foundYou, setFoundYou] = useState(false);
  const wasManual = useRef(ui.manual);
  useEffect(() => {
    const was = wasManual.current;
    wasManual.current = ui.manual;
    if (!was || ui.manual) return;
    setFoundYou(true);
    const id = setTimeout(() => setFoundYou(false), 4200);
    return () => clearTimeout(id);
  }, [ui.manual]);
  const [noVoiceOff, setNoVoiceOff] = useState(false);
  useEffect(() => {
    if (ui.reroute !== 'searching' && ui.reroute !== 'found') rerouteAvoid.value = null;
  }, [ui.reroute]);
  const { platform: plat } = useServices();
  const native = !!plat.capabilities.native;
  useEffect(() => {
    if (native) void plat.speech.voices().then((v) => (enVoice.value = v.en)).catch(() => {});
  }, []);
  const note = pickNote(ui, { online: online.value, foundYou, noVoiceDismissed: noVoiceOff, native, killed: m6killed.value });
  useStateHook(note ? `note-${note}` : null);

  // ---- follow-me
  const [overviewN, setOverviewN] = useState(0);
  const following = ui.follow === 'follow';
  const fix = g.fix;
  const puckPos = g.snapped ?? fix;
  const stale = !!fix && ui.gpsWeak && Date.now() - fix.t > STALE_PUCK_MS;
  const puck = puckPos ? { pos: puckPos, acc: fix?.acc ?? 0, heading: stale ? null : mapHeading(runtime.heading.value, fix), stale } : null;
  const windowH = Math.max(0, box.h - box.band - box.card);

  // ---- step card text
  const icon = stepIcon(step, isLast);
  const mrt = group === 'ride' && step?.mode !== 'bus' ? ui.mrt : null;
  // F1: the H5 headline is the spoken guidance line (`say`); H3/H4 keep the planner sentence (`text`).
  const headline = mrt ? t('g_mrt_head', { n: mrt.stopsLeft }) : (step?.say ?? step?.text ?? '');
  const etaMs = Date.now() + g.remainingS * 1000;
  const minLeft = minutesLeft(g.remainingS);
  const acts = stepActions(group, { manual: ui.manual, gpsWeak: ui.gpsWeak });
  const prog = ui.progress && ui.progress.places > 1 ? ui.progress : null;
  const first = g.stepIndex === 0;
  const left = ui.stopsLeft ?? step?.stopCount ?? 0;

  // ---- pointer/key anywhere restarts the pocket clock (not from inside the pocket view itself).
  const onTouch = (e: Event) => {
    if ((e.target as Element | null)?.closest?.('.pocket')) return;
    runtime.touch();
  };
  const sayAgain = () => {
    runtime.repeat();
    if (ui.noVoice) showToast('cant-speak', t('cant_speak'));
  };

  const act = (name: 'im_on' | 'got_off' | 'next', cls: string) =>
    name === 'im_on' ? (
      <button type="button" class={cls} data-testid="im-on" onClick={() => runtime.onBoard()}>
        <Icon name={step?.mode === 'bus' ? 'bus' : 'train'} />
        {t('im_on')}
      </button>
    ) : name === 'got_off' ? (
      <button type="button" class={cls} data-testid="got-off" onClick={() => runtime.gotOff()}>
        <Icon name="exit" />
        {t('got_off2')}
      </button>
    ) : (
      <button type="button" class={cls} data-testid="step-next" onClick={() => runtime.next()}>
        {t('step_next')}
        <Icon name="chev" />
      </button>
    );

  // T6: a train-to-train change says so in the step meta ("换车 · 第 3 步，共 5 步").
  const change = isTrainChange(step, trip.itinerary.legs);
  const stepOf = `${change ? `${t('tr_meta')} · ` : ''}${t('g_step_of', { a: g.stepIndex + 1, b: g.steps.length })}`;
  // H5 bus wait: the chip leaves the text column (review #1a); the sign line and extras follow it.
  const chipStep = step?.kind === 'board_bus' && step.route ? step : null;
  const stepBody = (
    <>
      <StepSub step={step} group={group} t={t} stopsLeft={ui.stopsLeft} mrt={!!mrt} metres={metresLeft(g)} minutes={minLeft} />
      <StepExtras step={step} itinerary={trip.itinerary} pocket={ui.pocket} />
    </>
  );

  return (
    <div class="guide" ref={root} data-testid="guide" data-step={g.stepIndex} onPointerDownCapture={onTouch} onKeyDownCapture={onTouch}>
      <div class="mapwin" style={{ top: `${box.band}px`, bottom: `${box.card}px` }} aria-hidden="true">
        <GuideMap
          steps={g.steps}
          puck={puck}
          stepIndex={g.stepIndex}
          mode={ui.follow}
          overview={overviewN}
          padding={mapPadding(box.h, box.band, box.card)}
          zoom={followZoom(group)}
          paused={ui.pocket}
          onGesture={() => runtime.mapGesture()}
        />
      </div>

      <div class="top" ref={band} data-testid="guide-band">
        <button type="button" class="iconbtn" data-testid="guide-end" aria-label={t('g_end_sr')} onClick={() => router.openSheet('end-trip')}>
          <Icon name="close" />
          {t('g_end')}
        </button>
        <span class="grow" />
        <button
          type="button"
          class="iconbtn sq"
          data-testid="guide-mute"
          aria-pressed={muted}
          aria-label={muted ? t('g_unmute_sr') : t('g_mute_sr')}
          onClick={() => {
            tick();
            store.updateSettings({ muted: !muted });
          }}
        >
          <Icon name={muted ? 'mute' : 'speaker'} />
        </button>
        <button type="button" class="helppill" data-testid="guide-help" onClick={() => router.openSheet('help')}>
          <Icon name="help" />
          {t('help')}
        </button>
        <div class="bandrow">
          <SharePill onOpen={() => router.openSheet('share')} />
          <TripDisruption itinerary={trip.itinerary} legIndex={step?.legIndex ?? 0} />
          {(ui.reroute === 'searching' || ui.reroute === 'found') && <RerouteBanner found={ui.reroute === 'found'} t={t} trip={trip} lang={toLang(lang)} />}
          {ui.mrtPreAlert && mrt && (
            <div class="banner gbanner" role="status" data-testid="mrt-prealert">
              <Icon name="train" />
              <div class="tx">
                <b>{t('g_mrt_pre_t')}</b>
                <span>{t('g_mrt_pre_s', { p: mrt.station })}</span>
              </div>
            </div>
          )}
          {ui.voiceUnlockNeeded && (
            <button type="button" class="btn btn-primary voicebar" data-testid="voice-unlock" onClick={() => void runtime.unlockVoice()}>
              <Icon name={muted ? 'eye' : 'speaker'} />
              {t(muted ? 'voice_bar_muted' : 'voice_bar')}
            </button>
          )}
        </div>
      </div>

      <div class="mapctl" style={{ bottom: `${box.card + 14}px`, display: windowH < 136 ? 'none' : undefined }}>
        <button
          type="button"
          class={`iconbtn${following ? ' on' : ''}`}
          data-testid="map-follow"
          aria-label={following ? t('g_overview') : t('g_follow')}
          onClick={() => {
            tick();
            if (following) {
              runtime.overview();
              setOverviewN((n) => n + 1);
            } else runtime.recentre();
          }}
        >
          <Icon name={following ? 'route' : 'nav'} />
        </button>
        <button type="button" class="iconbtn" data-testid="guide-share" aria-label={t('g_share_sr')} onClick={() => router.openSheet('share')}>
          <Icon name="share" />
        </button>
      </div>

      <section class="stepcard" ref={card} style={{ maxHeight: `${cardMaxHeight(box.h, box.band)}px` }} aria-label={t('g_card_sr')} data-testid="stepcard">
        <div class="grab" aria-hidden="true" />
        {/* M34 review #1c: the screen-awake note sits below the step so the step leads the sheet. */}
        {note && note !== 'wakelock' && <TripNote id={note} trip={trip} t={t} onNoVoiceOff={() => setNoVoiceOff(true)} />}
        <HelpNote />
        {prog && (
          <div class="segline" data-testid="journey-progress">
            <span class="segdots" aria-hidden="true">
              {Array.from({ length: prog.places }, (_, i) => (
                <i class={i + 1 < prog.place ? 'done' : i + 1 === prog.place ? 'cur' : i === prog.places - 1 ? 'goal' : ''} />
              ))}
            </span>
            <span>{t('jp_to', { k: prog.place, n: prog.places, p: prog.to?.name ?? '' })}</span>
          </div>
        )}
        <div class="stepmeta">
          {/* AC 12: the step counter opens the All-steps sheet (a history entry; Back closes it). */}
          <button
            type="button"
            class="stepof"
            data-testid="all-steps-btn"
            aria-label={`${t('all_steps')}，${stepOf}`}
            onClick={() => router.openSheet('all-steps')}
          >
            {stepOf}
            <Icon name="chev" />
          </button>
          <span class="num" data-testid="guide-eta">
            {t('g_arrive_left', { t: clock(etaMs, lang), n: minLeft })}
          </span>
          <LeafChip />
        </div>
        <div class="steprow">
          <div class={`stepicon ${icon.cls}`} aria-hidden="true">
            <Icon name={icon.icon} />
          </div>
          <div class="steptx">
            {/* M5 integration (a11y): the step headline is the guidance screen's h1. */}
            <h1 aria-live="polite" tabIndex={-1} data-testid="current-step" lang={trip.lang}>
              {headline}
            </h1>
            {group === 'walk' && (step?.kind === 'walk_to_stop' || step?.kind === 'walk_transfer') && (
              <span class="sign" data-testid="walk-sign">
                {String(step.params.stop ?? '')}
                {step.params.code ? <span class="num">{` · ${step.params.code}`}</span> : null}
              </span>
            )}
            {!chipStep && stepBody}
          </div>
        </div>
        {/* M34 review #1a: the arrival chip runs full card width straight under the headline row, before the sign line. */}
        {chipStep && (
          <>
            <ArrivalChip stop={chipStep.fromCode} svc={chipStep.route!} active={!ui.pocket} />
            <div class="steptx stepbelow">{stepBody}</div>
          </>
        )}
        {group === 'ride' && (
          <div class="ridebox">
            <Badge step={step} />
            <span class="stopsleft num" data-testid="stops-left">
              {mrt ? t('pk_n_est', { n: mrt.stopsLeft }) : left === 1 ? t('g_stop_left1') : t('g_stops_left', { n: left })}
            </span>
            <div class={`stops${mrt ? ' est' : ''}`} aria-hidden="true">
              {stopDots(step, mrt ? mrt.stopsLeft : ui.stopsLeft).map((d) => (
                <i class={d} />
              ))}
            </div>
          </div>
        )}
        <div class="prog" aria-hidden="true" data-testid="guide-progress" data-step={g.stepIndex} data-status={g.status}>
          <i style={{ width: `${Math.round(Math.min(1, Math.max(0, g.progress)) * 100)}%` }} />
        </div>
        <div class="stepacts">
          {acts.a && <div class="row">{act(acts.a, acts.aPrimary ? 'btn btn-primary' : 'btn btn-secondary')}</div>}
          <div class="row">
            <button type="button" class="btn btn-secondary" data-testid="say-again" onClick={sayAgain}>
              <Icon name="speaker" />
              {t('say_again')}
            </button>
            {acts.pocket && (
              <button type="button" class="btn btn-secondary" data-testid="pocket-btn" onClick={() => runtime.pocket()}>
                <Icon name="moon" />
                {t('pocket_btn')}
              </button>
            )}
          </div>
          <div class="row quiet">
            <button
              type="button"
              class="btn btn-quiet"
              data-testid="step-prev"
              aria-disabled={first}
              onClick={() => {
                if (!first) runtime.previous();
              }}
            >
              <Icon name="back" />
              {t('step_prev')}
            </button>
            {acts.quietNext && act('next', 'btn btn-quiet')}
          </div>
        </div>
        {note === 'wakelock' && <TripNote id={note} trip={trip} t={t} onNoVoiceOff={() => setNoVoiceOff(true)} />}
      </section>

      {trip.alert && <GetOffAlert alert={trip.alert} t={t} />}
      {/* F12: a sheet over pocket view (Back → End) unmounts the pocket view first; the sheet fades in over H5. */}
      {ui.pocket && !trip.alert && !sheet && <Pocket trip={trip} t={t} />}
    </div>
  );
}

function StepSub(p: { step: Step | undefined; group: 'walk' | 'wait' | 'ride'; t: TFn; stopsLeft: number | null; mrt: boolean; metres: number; minutes: number }) {
  const { step, t } = p;
  if (!step) return null;
  // F2: this walk's own minutes, not the whole trip's (the ETA row keeps those).
  if (p.group === 'walk') return <p data-testid="step-sub">{t('g_walk_s', { m: p.metres, n: walkMinutes(p.metres) })}</p>;
  if (p.group === 'wait') {
    if (step.mode === 'bus')
      return (
        <p data-testid="step-sub">
          <Badge step={step} /> {t('g_wait_s')} <span class="sign">{String(step.params.stop ?? '')}</span>
        </p>
      );
    return (
      <p data-testid="step-sub">
        <Badge step={step} />{' '}
        {step.params.towards ? t('g_towards', { p: String(step.params.towards) }) : ''}
      </p>
    );
  }
  if (p.mrt) return <p data-testid="step-sub">{t('g_mrt_sub')}</p>;
  const next = nextStopName(step, p.stopsLeft);
  return (
    <p data-testid="step-sub">
      {next && t('g_ride_next', { p: next })}
      {next && <br />}
      {t('g_ride_tell')}
    </p>
  );
}

/** §5.4 transit badge: bus badge (ink block, bus icon + number) or line tag (colour stripe + code, never colour-only). */
function Badge({ step }: { step: Step | undefined }) {
  if (!step) return null;
  if (step.mode === 'bus')
    return step.route ? (
      <span class="busbadge" data-testid="bus-badge">
        <Icon name="bus" />
        {step.route}
      </span>
    ) : null;
  return step.line ? (
    <span class="linetag" data-testid="line-tag">
      <span class="sw" style={{ background: `var(--${step.line.colorToken})` }} />
      <span class="cd">{step.line.code}</span>
    </span>
  ) : null;
}

function RerouteBanner({ found, t, trip, lang }: { found: boolean; t: TFn; trip: ActiveTrip; lang: Lang }) {
  useStateHook(found ? 'reroute-found' : 'reroute-searching');
  // T4: after "find another way" round a disruption, the result says where it goes and which line it avoids.
  const avoid = rerouteAvoid.value;
  const dest = trip.places[(trip.journey?.segment ?? 0) + 1] ?? trip.places[trip.places.length - 1];
  return (
    <div class="banner gbanner" role="status" data-testid="reroute-banner" data-state={found ? 'found' : 'searching'}>
      {found ? <Icon name="check" /> : <span class="spinner" aria-hidden="true" />}
      <div class="tx">
        {avoid && found ? (
          <>
            <b data-testid="rr-title">{t('rr_title', { dest: dest?.name ?? '' })}</b>
            <span data-testid="rr-note">{t('rr_note', { line: lineName(avoid, lang) })}</span>
          </>
        ) : (
          <>
            <b>{t(found ? 'found_t' : 'offr_t')}</b>
            <span>{t(found ? 'found_s' : 'off_s')}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ trip note (6c.10)

const NOTE: Record<NoteId, { icon: IconName; title: Parameters<TFn>[0]; line?: Parameters<TFn>[0] }> = {
  'reroute-failed': { icon: 'route', title: 'rf_t', line: 'rf_s' },
  'reroute-offline': { icon: 'route', title: 'ro_t', line: 'ro_s' },
  offline: { icon: 'wifi-off', title: 'note_offline' },
  weak: { icon: 'loc', title: 'note_weak' },
  manual: { icon: 'loc', title: 'note_manual' },
  'found-you': { icon: 'loc', title: 'note_found_you' },
  wakelock: { icon: 'eye', title: 'note_wake_t', line: 'note_wake_s' },
  'notify-ask': { icon: 'bell', title: 'note_notify_ask' },
  'notify-denied': { icon: 'bell', title: 'note_notify_denied', line: 'note_notify_denied_s' },
  novoice: { icon: 'mute', title: 'note_novoice_zh' },
  killed: { icon: 'battery', title: 'note_novoice_zh' },
};

/** M6 notes inside the app (6h.3 A5, 6h.4 B3, 6h.5 C1 native copy). */
function NativeNote({ id, trip, onNoVoiceOff }: { id: NoteId; trip: ActiveTrip; onNoVoiceOff: () => void }) {
  const s = useServices();
  const { runtime, router, platform, store } = s;
  const L = (k: M6Key) => m6t(store.settings.value.lang, k);
  if (id === 'notify-denied')
    return (
      <div class="tripnote" role="status" data-testid="trip-note-notify" data-note={id}>
        <Icon name="bell-off" />
        <div class="tx">
          <b>{L('a5_t')}</b>
          <span>{L('a5_s')}</span>
        </div>
        <button type="button" class="iconbtn x" data-testid="trip-note-close" aria-label={L('ok_sr')} onClick={() => runtime.dismissNotifyNote()}>
          <Icon name="close" />
        </button>
        <div class="bacts">
          <button
            type="button"
            class="btn btn-secondary"
            data-testid="note-notify-on"
            onClick={() => {
              void import('./m6').then((m) => {
                const off = m.watchNotifyReturn(s, () => {
                  off();
                  runtime.dismissNotifyNote();
                });
              });
              void platform.device?.openSettings('notifications');
            }}
          >
            {L('a5_btn')}
          </button>
        </div>
      </div>
    );
  if (id === 'killed')
    return (
      <div class="tripnote" role="status" data-testid="trip-note-killed" data-note={id}>
        <Icon name="battery" />
        <div class="tx">
          <b>{L('b3_t')}</b>
          <span>{L('b3_s')}</span>
        </div>
        <button type="button" class="iconbtn x" data-testid="trip-note-close" aria-label={L('ok_sr')} onClick={() => (m6killed.value = false)}>
          <Icon name="close" />
        </button>
        <div class="bacts">
          <button
            type="button"
            class="btn btn-secondary"
            data-testid="note-killed-setup"
            onClick={() => {
              m6killed.value = false;
              router.openSheet('battery-guide');
            }}
          >
            {L('b3_btn')}
          </button>
        </div>
      </div>
    );
  // novoice, zh trip: speaking English (6h.5) with the installer link.
  return (
    <div class="tripnote" role="status" data-testid="trip-note" data-note={id}>
      <Icon name="mute" />
      <div class="tx">
        <b>{L('c1_note')}</b>
        <button type="button" class="btn-quiet linkish" data-testid="no-voice-add" onClick={() => void platform.device?.openSettings('tts-install')}>
          {L('c1_add')}
        </button>
      </div>
      <button type="button" class="iconbtn x" data-testid="trip-note-close" aria-label={L('ok_sr')} onClick={onNoVoiceOff}>
        <Icon name="close" />
      </button>
    </div>
  );
}

function TripNote({ id, trip, t, onNoVoiceOff }: { id: NoteId; trip: ActiveTrip; t: TFn; onNoVoiceOff: () => void }) {
  const { runtime, router, platform } = useServices();
  if (platform.capabilities.native && (id === 'notify-denied' || id === 'killed' || (id === 'novoice' && trip.lang === 'zh-CN' && enVoice.value)))
    return <NativeNote id={id} trip={trip} onNoVoiceOff={onNoVoiceOff} />;
  const n = NOTE[id];
  const title = id === 'novoice' && trip.lang === 'en-SG' ? t('note_novoice_en') : t(n.title);
  const reroute = id === 'reroute-failed' || id === 'reroute-offline';
  const close = reroute
    ? () => runtime.dismissRerouteNote()
    : id === 'wakelock'
      ? () => runtime.dismissWakeNote()
      : id === 'notify-denied'
        ? () => runtime.dismissNotifyNote()
        : id === 'novoice'
          ? onNoVoiceOff
          : null;
  return (
    <div class="tripnote" role="status" data-testid="trip-note" data-note={id}>
      <Icon name={n.icon} />
      <div class="tx">
        <b>{title}</b>
        {n.line && <span>{t(n.line)}</span>}
        {id === 'novoice' && (
          <button type="button" class="btn-quiet linkish" data-testid="no-voice" onClick={() => router.openSheet('voice-help')}>
            {t('novoice_how')}
          </button>
        )}
      </div>
      {close && (
        <button type="button" class="iconbtn x" data-testid="trip-note-close" aria-label={t('ok_sr')} onClick={close}>
          <Icon name="close" />
        </button>
      )}
      {reroute && (
        <div class="bacts">
          <button type="button" class="btn btn-secondary" data-testid="note-driver" onClick={() => router.openSheet('driver', { tab: 'dest' })}>
            <Icon name="car" />
            {t('show_driver')}
          </button>
          <a class="btn btn-danger-outline" href="tel:995" data-testid="note-995">
            <Icon name="phone" />
            {t('emergency')}
          </a>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ H6 / H6b

function GetOffAlert({ alert, t }: { alert: AlertState; t: TFn }) {
  const { runtime, store } = useServices();
  const c = alertCopy(alert);
  const now = alert.kind === 'now';
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), [alert.kind]);
  useStateHook(`alert-${alert.kind}`);
  const ack = () => {
    runtime.ackAlert();
    focusHeadline();
  };
  return (
    <>
      <div class={`edgeglow${now ? ' now' : ''}`} aria-hidden="true" data-testid="edge-glow" />
      <div
        class={`alert${now ? ' now' : ''}`}
        key={alert.kind}
        role="alertdialog"
        aria-labelledby="ga-t"
        aria-describedby="ga-d"
        data-testid={now ? 'getoff-now' : 'getoff-next'}
        data-escalated={alert.escalated ? '1' : '0'}
      >
        <div class="bellwrap" aria-hidden="true" key={alert.escalated ? 'e' : 'n'}>
          <Icon name={c.icon} />
        </div>
        {/* F3: two unbreakable phrases, so a title never orphans one character. */}
        <h2 id="ga-t" tabIndex={-1} ref={title} aria-label={t(c.title)}>
          <span class="ph">{t(c.t1)}</span>
          {store.settings.value.lang === 'en' ? ' ' : ''}
          <span class="ph">{t(c.t2)}</span>
        </h2>
        <div id="ga-d">
          <p>{t(c.line)}</p>
          {/* F4 / ruling 2: the chip shows the sign text (English), plus the code on train signs. */}
          <span class="sign" data-testid="getoff-sign">
            {alert.code && alert.mode === 'train' ? t('sign_train_code', { s: alert.sign ?? alert.stop, code: alert.code }) : t(c.sign, { s: alert.sign ?? alert.stop })}
          </span>
        </div>
        {now && <div class="grow" />}
        <button type="button" class="btn" data-testid={now ? 'getoff-now-ack' : 'getoff-ack'} onClick={ack}>
          <Icon name="check" />
          {t('ok_got_it')}
        </button>
        {now && <div class="pad" />}
      </div>
      <div class="sr" aria-live="assertive" id="live2">
        {`${t(c.title)}。${t(c.line)}`}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ L5 leaf chip

/**
 * 6f.5 L5: while battery saver is active on a trip, a plain-text chip at the right end of the step meta row
 * (not a button, not focusable). When Auto turns it on mid-trip it fades in and one polite line is announced;
 * turning off (charging) removes it silently. No voice, toast or haptic.
 */
function LeafChip() {
  const { runtime, store } = useServices();
  const t = useT();
  const t5 = useT5();
  const saverState = useMemo(() => createSaverState(store), [store]);
  const on = runtime.power.value.saver;
  const was = useRef(on);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (on && !was.current) {
      setFresh(true);
      if (saverState.peek().reason === 'battery') announce(t5('bs_announce'));
    }
    was.current = on;
  }, [on]);
  if (!on) return null;
  return (
    <span class={`leafchip${fresh ? ' fadein' : ''}`} data-testid="leaf-chip">
      <Icon name="leaf" />
      {t5('bs_row')}
    </span>
  );
}

// ------------------------------------------------------------------ G1 pocket view

function Pocket({ trip, t }: { trip: ActiveTrip; t: TFn }) {
  const t5 = useT5();
  const { runtime, store } = useServices();
  const tick = useTick();
  const ui = runtime.ui.value;
  const g = trip.guidance;
  const step = g.steps[g.stepIndex];
  const pt = pocketText(step, g, ui, placeOf(step));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  // The first touch only wakes the screen; it never activates what is under the finger.
  const exit = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    tick();
    runtime.touch();
    log('ui:pocket-exit');
    focusHeadline();
  };
  return (
    <div class="pocket" ref={ref} role="region" aria-label={t('pocket_l')} tabIndex={-1} data-testid="pocket" onClick={exit} onKeyDown={exit}>
      <div class="glyph" aria-hidden="true">
        <Icon name={pt.glyph} />
      </div>
      <p class="line" lang={trip.lang} data-testid="pocket-line">
        {t(pt.line.key, pt.line.p)}
      </p>
      {runtime.power.value.saver && (
        <p class="saver" data-testid="pocket-saver">
          {t5('bs_row')}
        </p>
      )}
      {pt.count && (
        <p class="count num" data-testid="pocket-count">
          {t(pt.count.key, pt.count.p)}
        </p>
      )}
      {store.settings.value.muted && (
        <p class="muted">
          <Icon name="mute" />
          {t('pocket_muted')}
        </p>
      )}
      <button type="button" class="btn" data-testid="pocket-show" aria-label={t('pocket_show_sr')} onClick={exit}>
        <Icon name="eye" />
        {t('pocket_show')}
      </button>
      <p class="hint">{t('pocket_hint')}</p>
      <p class="sr" aria-live="polite">
        {t('pocket_on')}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ G3 waypoint arrival


function Waypoint({ trip }: { trip: ActiveTrip }) {
  const { runtime } = useServices();
  const t = useT();
  const ui = runtime.ui.value;
  const seg = trip.journey?.segment ?? 0;
  const here = trip.places[seg + 1];
  const next = trip.places[seg + 2];
  const places = trip.places.length - 1;
  useStateHook(ui.segmentError ? 'waypoint-none' : 'waypoint');
  const cont = () => void runtime.continueJourney();
  if (ui.segmentError && next) {
    return (
      <main class="scroll" data-testid="waypoint">
        <h1 class="t-title" style={{ margin: 'var(--s-4) 0' }}>
          {t('how_to', { p: next.name })}
        </h1>
        <div class="state" data-testid="state-none">
          <span class="stile" aria-hidden="true">
            <Icon name="route" />
          </span>
          <p class="t-headline" role="status">
            {t('no_route')}
          </p>
          <div class="opts">
            <button type="button" class="btn btn-primary" data-testid="waypoint-continue" onClick={cont}>
              <Icon name="refresh" />
              {t('try_again')}
            </button>
            <button type="button" class="btn btn-secondary" data-testid="waypoint-end" onClick={() => runtime.endAtWaypoint()}>
              {t('wp_end')}
            </button>
          </div>
        </div>
      </main>
    );
  }
  return (
    <div class="wpscreen" data-testid="waypoint">
      <main class="arrive wp" tabIndex={0} aria-label={t('wp_t', { p: here?.name ?? '' })}>
        <p class="t-label eyebrow" data-testid="waypoint-count">
          {t('wp_eyebrow', { k: seg + 1, n: places })}
        </p>
        <svg class="wpmark" viewBox="0 0 200 120" aria-hidden="true">
          <path d="M20 100 C 60 100, 80 40, 144 52" fill="none" stroke="var(--c-primary)" stroke-width="10" stroke-linecap="round" />
          <circle class="ringout" cx="160" cy="54" r="16" fill="none" stroke="var(--c-saffron)" stroke-width="5" />
          <circle class="drop" cx="160" cy="54" r="16" fill="var(--c-saffron)" stroke="var(--c-on-saffron)" stroke-width="4" />
        </svg>
        <h1 class="t-display" aria-live="polite">
          {t('wp_t', { p: here?.name ?? '' })}
        </h1>
        <p class="sbody">{t('wp_b')}</p>
        {next && (
          <div class="nextcard">
            <b>{t('wp_next', { p: next.name })}</b>
            <span>{t('wp_stay', { d: dwellLabel(here?.dwellMin ?? 30, t) })}</span>
          </div>
        )}
      </main>
      <div class="dock">
        <button type="button" class="btn btn-primary" data-testid="waypoint-continue" aria-busy={ui.continuing} disabled={ui.continuing} onClick={cont}>
          {ui.continuing ? <span class="spinner" aria-hidden="true" /> : <Icon name="nav" />}
          {ui.continuing ? t('wp_finding') : t('wp_continue')}
        </button>
        <button type="button" class="btn btn-secondary small" data-testid="waypoint-end" onClick={() => runtime.endAtWaypoint()}>
          {t('wp_end')}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ H12 arrival

function Arrival({ trip }: { trip: ActiveTrip }) {
  const { runtime, router, store } = useServices();
  const t = useT();
  const seg = trip.journey?.segment ?? 0;
  // A journey ended at a waypoint ("End the trip here") arrives at that place.
  const dest = trip.journey ? trip.places[seg + 1] : trip.places[trip.places.length - 1];
  const mins = Math.max(1, Math.round((Date.now() - trip.startedAt) / 60000));
  const home = store.places.value.home;
  const isHome = !!home && !!dest && Math.abs(home.lat - dest.lat) < 1e-4 && Math.abs(home.lng - dest.lng) < 1e-4;
  useStateHook('arrived');
  const rm = document.documentElement.classList.contains('rm');
  const done = async () => {
    await runtime.end();
    router.reset('/');
  };
  const routeHome = async () => {
    await runtime.end();
    store.setPlan({ from: null, to: home!, options: [], selected: 0 });
    router.reset('/', '/routes');
  };
  return (
    <div class="wpscreen">
      <main class="arrive" role="region" aria-label={t('arr_t')} tabIndex={0}>
        {!rm &&
          Array.from({ length: 18 }, (_, i) => {
            const a = (i / 18) * Math.PI * 2;
            const r = 120 + ((i * 37) % 90);
            const col = ['var(--c-primary)', 'var(--c-saffron)', 'var(--c-jade)'][i % 3];
            return (
              <span
                class="petal"
                aria-hidden="true"
                style={`left:50%;top:30%;background:${col};--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r - 40}px;--rot:${(i * 67) % 360}deg;--dur:${1.6 + (i % 5) * 0.2}s;--del:${1.5 + (i % 6) * 0.05}s`}
              />
            );
          })}
        <svg class="mark seal" viewBox="0 0 512 512" aria-hidden="true">
          <rect class="inkring" x="0" y="0" width="512" height="512" rx="112" fill="none" stroke="var(--c-primary)" stroke-width="10" />
          <g class="stamp">
            <rect width="512" height="512" rx="112" fill="#9A3412" />
            <rect x="40" y="40" width="432" height="432" rx="80" fill="none" stroke="#FBF5EC" stroke-width="12" opacity=".9" />
            <g transform="translate(256 262) scale(.84) translate(-256 -256)" fill="none" stroke="#FBF5EC" stroke-linecap="round" stroke-linejoin="round">
              <path d="M256 96V204" stroke-width="56" />
              <path d="M196 128H316M100 216H412" stroke-width="50" />
              <path class="qpath" pathLength={1} d="M262 292L178 408L304 396" stroke-width="56" />
              <circle class="dotring" cx="388" cy="392" r="44" stroke="#FFD23F" stroke-width="12" />
              <circle class="drop" cx="388" cy="392" r="44" fill="#FFD23F" stroke="none" />
            </g>
          </g>
        </svg>
        <h1 class="rise" style={{ animationDelay: '1.3s' }} data-testid="arrived" aria-live="assertive">
          {t('arr_t')}
        </h1>
        <div class="dest rise" style={{ animationDelay: '1.45s' }}>
          {dest?.name ?? ''}
        </div>
        <div class="stats rise" style={{ animationDelay: '1.6s' }}>
          <span class="num" data-testid="took-min">
            {t('took_min', { n: mins })}
          </span>
          <span>{t('well_done')}</span>
        </div>
        <ArrivedFamily shared={!!trip.share} dest={dest?.name ?? ''} />
      </main>
      <div class="dock">
        <button type="button" class="btn btn-primary" data-testid="finish-trip" onClick={done}>
          <Icon name="check" />
          {t('done')}
        </button>
        {home && !isHome && (
          <button type="button" class="btn btn-quiet" data-testid="route-home" onClick={routeHome}>
            <Icon name="home" />
            {t('route_home')}
          </button>
        )}
      </div>
    </div>
  );
}
