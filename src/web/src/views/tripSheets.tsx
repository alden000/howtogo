/**
 * M2 sheets (STYLE-GUIDE §6 H9/H10, §6c.3/6c.6/6c.9/6c.11): H9 Help (M2 subset, OQ4),
 * H10 Show the driver, G7 voice help, G6 "End your current trip?", G4 stale trip, G2 dwell picker.
 * Each is a history entry (router sheet), so Back closes the topmost one first.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Place } from '@howtogo/shared';
import { DWELL_CHOICES_MIN } from '@howtogo/shared';
import { useServices, useT } from '../context';
import { here, locate } from '../state/location';
import { announce, Bar, Icon, NumSteps, Sheet } from '../ui/kit';
import { log } from '../log';
import { dwellLabel } from './Guide';
import { HereFallback, SendMyLocation, TaxiButtons } from './helpSheet';
import { stepGroup, vehicleIcon } from './guideModel';
import type { FakePlatform } from '../platform';

/** H9 Help is the full M4 sheet in helpSheet.tsx (it renders DemoControls below on a trip). */
/**
 * AC 50: demo mode (`?demo=1`) controls that play every new state without walking. Shown only in demo
 * mode, at the bottom of H9 on a trip, so H5 itself looks exactly like the real app.
 */
export function DemoControls() {
  const { mode, platform, store, router, runtime } = useServices();
  const t = useT();
  const fake = (platform as Partial<FakePlatform>).fake;
  if (!mode.demo || !fake) return null;
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  /** Play the scripted trip forward, fix by fix, until `done()` (or the script ends). */
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 5000 && !done(); i++) {
      if (!fake.step()) break;
      if (i % 4 === 3) await yieldNow();
    }
  };
  /** Fixes next to the last one: `dLat` off the line (wrong way) or with poor accuracy (weak location). */
  const burst = async (dLat: number, acc: number) => {
    for (let i = 1; i <= 4; i++) {
      const g = store.trip.peek()?.guidance;
      const p = g?.fix ?? g?.steps[0]?.start;
      if (!p) return;
      fake.emit({ lat: p.lat + dLat, lng: p.lng + (dLat ? i * 2e-5 : 0), acc, t: (g?.fix?.t ?? Date.now()) + 1000, speed: 1 });
      await yieldNow();
    }
  };
  const run = (name: string, f: () => Promise<void> | void) => () => {
    log(`demo:${name}`);
    router.closeSheet();
    setTimeout(() => void f(), 0);
  };
  const busy = () => store.trip.peek()?.alert != null;
  const items: [string, Parameters<typeof t>[0], IconNameLike, () => Promise<void> | void][] = [
    ['getoff', 'demo_getoff', 'bell', () => until(busy)],
    ['offroute', 'demo_offroute', 'route', () => burst(0.004, 8)],
    ['weak', 'demo_weak', 'loc', () => burst(0, 180)],
    ['skip', 'demo_skip', 'chev', () => void runtime.next()],
    ['arrive', 'demo_arrive', 'check', () => until(() => runtime.ui.peek().phase !== 'guiding' || !store.trip.peek())],
  ];
  return (
    <div class="democtl" data-testid="demo-controls" role="group" aria-labelledby="demo-t">
      <h3 class="t-label" id="demo-t" style={{ margin: 'var(--s-5) 0 var(--s-1)' }}>
        {t('demo_t')}
      </h3>
      <p class="lead">{t('demo_s')}</p>
      <div class="opts">
        {items.map(([id, label, icon, f]) => (
          <button type="button" class="btn btn-secondary" data-testid={`demo-${id}`} onClick={run(id, f)}>
            <Icon name={icon} />
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  );
}

type IconNameLike = Parameters<typeof Icon>[0]['name'];

/** AC 12: "全部步骤 / All steps" — the remaining steps in the H4 timeline style, the current one marked. A history entry. */
export function AllStepsSheet() {
  const { store } = useServices();
  const t = useT();
  const trip = store.trip.value;
  if (!trip) return null;
  const g = trip.guidance;
  const rest = g.steps.slice(g.stepIndex);
  const dest = trip.places[trip.places.length - 1]?.name ?? '';
  return (
    <Sheet id="all-steps" title={t('all_steps')}>
      <ol class="timeline allsteps" data-testid="all-steps" lang={trip.lang}>
        {rest.map((st, i) => {
          const grp = stepGroup(st);
          const veh = grp !== 'walk';
          const cls = st.mode === 'bus' ? 'bus' : 'train';
          return (
            <li class={`${grp === 'ride' ? 'ride' : ''}${i === 0 ? ' cur' : ''}`} aria-current={i === 0 ? 'step' : undefined} data-testid={`all-step-${g.stepIndex + i}`}>
              <span class={`ic${veh ? ` ${cls}` : ''}`} aria-hidden="true">
                <Icon name={veh ? vehicleIcon(st) : 'walk'} />
              </span>
              <div>
                <b>
                  {st.say ?? st.text}
                  {i === 0 && <span class="nowtag">{t('all_steps_now')}</span>}
                </b>
                <span>{st.detail}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {dest && <p class="lead">{t('all_steps_done', { p: dest })}</p>}
    </Sheet>
  );
}

type DriverTab = 'dest' | 'home' | 'here';

/** H10 Show the driver: always-light card, tabs dest (trip only) / home / here. Back → H9 (the sheet underneath). */
export function DriverSheet() {
  const { router, store, platform, api } = useServices();
  const t = useT();
  const trip = store.trip.value;
  const home = store.places.value.home;
  const data = (router.sheetData.value ?? {}) as { tab?: DriverTab };
  const [tab, setTab] = useState<DriverTab>(data.tab === 'dest' && !trip ? 'home' : (data.tab ?? 'home'));
  const tabs = (['dest', 'home', 'here'] as DriverTab[]).filter((x) => x !== 'dest' || trip);
  useEffect(() => {
    log(`state:driver-${tab}`);
    // QA-38 (AC 36): always a fresh fix + address — a cached one may be from somewhere else (or a trip fix with
    // no address). Offline, the address lookup fails and the coordinates fallback shows instead.
    if (tab === 'here') void locate(platform, api);
  }, [tab]);
  useEffect(() => {
    void platform.wakeLock.acquire();
    return () => {
      if (!store.trip.peek()) void platform.wakeLock.release();
    };
  }, []);
  let p: Place | null = null;
  if (tab === 'dest') p = trip?.places[trip.places.length - 1] ?? null;
  else if (tab === 'home') p = home ?? null;
  else p = here.value ? { name: here.value.label ?? '', lat: here.value.lat, lng: here.value.lng, ...(here.value.address ? { address: here.value.address } : {}), ...(here.value.postal ? { postal: here.value.postal } : {}) } : null;
  const hereLines = tab === 'here' && p ? whereAmILines(p) : null;
  const lines = hereLines ? hereLines.lines : p ? [p.name, p.address && p.address !== p.name ? p.address.replace(/\s*Singapore\s*\d{6}$/i, '') : ''].filter(Boolean) : [];
  const postal = p?.postal ?? /\b(\d{6})\b/.exec(p?.address ?? '')?.[1];
  const head = tab === 'here' ? ['I am here', '我现在在这里'] : ['Please take me to', '请送我去'];
  return (
    <div class="fullsheet" role="dialog" aria-modal="true" aria-labelledby="drv-t" data-testid="sheet-driver">
      <Bar>
        <h1 class="t-label" id="drv-t" style={{ margin: 0 }}>
          {t('drv_title')}
        </h1>
      </Bar>
      <div class="addr">
        <div class="seg" role="group" style={{ marginBottom: '14px' }}>
          {tabs.map((x) => (
            <button type="button" aria-pressed={tab === x} data-testid={`driver-tab-${x}`} onClick={() => setTab(x)}>
              {t(x === 'dest' ? 'drv_dest' : x === 'home' ? 'drv_home' : 'drv_here')}
            </button>
          ))}
        </div>
        <div class="card2" lang="en" data-testid="driver-card">
          <div class="please">
            {head[0]}
            <small lang="zh">{head[1]}</small>
          </div>
          <div class="lines">
            {lines.length ? lines.map((l, i) => (i ? [<br />, l] : l)) : t(tab === 'home' ? 'set_your_home' : 'loading')}
          </div>
          {postal && (
            <div>
              <span class="postal num">Singapore {postal}</span>
            </div>
          )}
          {hereLines?.near && (
            <div class="zh" data-testid="here-near">
              Near · <span lang="zh">附近：</span>
              {hereLines.near}
            </div>
          )}
        </div>
        {tab === 'here' && here.value && !here.value.label && <HereFallback lat={here.value.lat} lng={here.value.lng} />}
        {tab === 'here' && p && <SendMyLocation place={p} />}
        <TaxiButtons />
      </div>
    </div>
  );
}

/**
 * QA-38 (M4 AC 36) "Where I am": the reverse-geocoded street address in huge type (without the trailing
 * "Singapore 123456", which the postal chip shows), then "附近：<building>" when the building name is not
 * already the address. No address → the place name alone.
 */
export function whereAmILines(p: { name: string; address?: string }): { lines: string[]; near: string | null } {
  const name = p.name.trim();
  const street = (p.address ?? '').replace(/\s*Singapore\s*\d{6}$/i, '').trim();
  if (!street) return { lines: name ? [name] : [], near: null };
  // OneMap addresses end with the building name ("51 Bishan Street 13 Bishan Community Club"): show it once, as "near".
  const bare = name && street.toLowerCase().endsWith(` ${name.toLowerCase()}`) ? street.slice(0, -name.length - 1).trim() : street;
  return { lines: [bare], near: name && name.toLowerCase() !== bare.toLowerCase() ? name : null };
}

/** G7 voice help (6c.11): how to add a Chinese voice; the device's platform first. */
export function VoiceHelpSheet() {
  const { platform } = useServices();
  const t = useT();
  const ios = platform.capabilities.os === 'ios';
  const android = [t('vh_a1'), t('vh_a2'), t('vh_a3'), t('vh_a4'), t('vh_a5')];
  const iphone = [t('vh_i1'), t('vh_i2'), t('vh_i3')];
  const first = ios ? { h: 'vh_iphone' as const, s: iphone } : { h: 'vh_android' as const, s: android };
  const other = ios ? { h: 'vh_android' as const, s: android } : { h: 'vh_iphone' as const, s: iphone };
  return (
    <Sheet id="voice-help" title={t('voicehelp_t')}>
      <h3 class="t-headline">{t(first.h)}</h3>
      <NumSteps items={first.s} />
      <h3 class="t-label" style={{ marginTop: 'var(--s-5)', color: 'var(--c-ink-2)' }}>
        {t('vh_other')} · {t(other.h)}
      </h3>
      <NumSteps items={other.s} />
    </Sheet>
  );
}

/** G6 "End your current trip?" (AC 5): from H4 Start while a trip is active. */
export function EndFirstSheet({ onGo }: { onGo: () => void }) {
  const { router, store } = useServices();
  const t = useT();
  const dest = store.trip.value?.places.at(-1)?.name ?? '';
  return (
    <Sheet id="end-first" title={t('endfirst_t')} close={false}>
      <p class="lead">{t('endfirst_b', { p: dest })}</p>
      <div class="opts" data-testid="end-first">
        <button type="button" class="btn btn-primary" data-testid="end-first-back" onClick={() => router.enterGuide()}>
          <Icon name="nav" />
          {t('endfirst_back')}
        </button>
        <button type="button" class="btn btn-secondary" data-testid="end-first-go" onClick={onGo}>
          {t('endfirst_go')}
        </button>
      </div>
    </Sheet>
  );
}

/** G4 stale trip (older than ETA + 2 h): Continue → H5 at the stored step · End → deleted, H1 stays. */
export function StaleSheet() {
  const { router, runtime } = useServices();
  const t = useT();
  const dest = runtime.ui.value.stale?.dest ?? '';
  return (
    <Sheet id="stale-trip" title={t('stale_t')} close={false}>
      <p class="lead">{t('stale_b', { p: dest })}</p>
      <div class="opts" data-testid="stale-trip">
        <button
          type="button"
          class="btn btn-primary"
          data-testid="stale-continue"
          onClick={async () => {
            await runtime.continueStale();
            router.enterGuide();
          }}
        >
          <Icon name="nav" />
          {t('stale_continue')}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          data-testid="stale-end"
          onClick={async () => {
            await runtime.endStale();
            router.closeSheet();
          }}
        >
          {t('stale_end')}
        </button>
      </div>
    </Sheet>
  );
}

/** G2 dwell picker: 15 / 30 / 60 / 90 min radio cards. */
export function DwellSheet({ onPick }: { onPick: (i: number, min: number) => void }) {
  const { router, store } = useServices();
  const t = useT();
  const { i } = (router.sheetData.value ?? { i: 0 }) as { i: number };
  const stop = store.plan.value.stops?.[i];
  const cur = stop?.dwellMin ?? 30;
  return (
    <Sheet id="dwell" title={t('dwell_t', { p: stop?.name ?? '' })}>
      <div class="radiogrid" role="radiogroup" aria-label={t('dwell_t', { p: stop?.name ?? '' })}>
        {DWELL_CHOICES_MIN.map((m) => (
          <button
            type="button"
            class="radiocard"
            role="radio"
            aria-checked={cur === m}
            data-testid={`dwell-${m}`}
            onClick={() => {
              onPick(i, m);
              router.closeSheet();
              announce(t('jb_dwell_set', { p: stop?.name ?? '', d: dwellLabel(m, t) }));
            }}
          >
            <Icon name={cur === m ? 'check' : 'clock'} />
            {dwellLabel(m, t)}
          </button>
        ))}
      </div>
      <p class="t-caption" style={{ color: 'var(--c-ink-2)', marginTop: 'var(--s-4)' }}>
        {t('dwell_note')}
      </p>
    </Sheet>
  );
}
