/**
 * M6 frames drawn in the WebView (STYLE-GUIDE 6h): native permission explainers A2–A6, the battery guide B1–B3,
 * the no-Chinese-voice sheet C1, the update notice D1, the web Get-the-app card D2 and the native Settings rows
 * (6h.10). Lazy chunk: the web build only ever loads `GetAppCard` from here (Android browsers).
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { useServices } from '../context';
import type { Services } from '../context';
import { m6t, type M6Key } from '../i18n/m6';
import { BATTERY_GUIDE, GUIDE_BRANDS, guideBrand, type GuideBrand } from '../platform/batteryGuide';
import type { DeviceInfo, Platform } from '../platform/types';
import { local } from '../state/storage';
import { log } from '../log';
import { APP_VERSION } from '../version';
import { announce, Bar, Icon, Sheet, showToast, type IconName } from '../ui/kit';
import { locate } from '../state/location';
import { BATTERY_SEEN_KEY, apiOrigin, device, flags, killed, newer, refreshDevice, setFlags, sgDay, updVisible } from '../m6/core';
import '../styles/m6.css';

type L = (k: M6Key, p?: Record<string, string | number>) => string;
function useL(): L {
  const { store } = useServices();
  const lang = store.settings.value.lang;
  return (k, p) => m6t(lang, k, p);
}

// ------------------------------------------------------------------ pictures (6h shared rules, 6f.4)

const PICS = import.meta.glob('../assets/m6/*.svg', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const picCache = new Map<string, string>();

/** Drawn step picture, inline so it follows dark mode; `aria-hidden` (the text carries the meaning). */
export function Pic({ name }: { name: string }) {
  const { store } = useServices();
  const key = `../assets/m6/${name}-${store.settings.value.lang === 'en' ? 'en' : 'zh'}.svg`;
  const [svg, setSvg] = useState(picCache.get(key) ?? '');
  useEffect(() => {
    if (picCache.has(key)) return setSvg(picCache.get(key)!);
    let live = true;
    void PICS[key]?.().then((s) => {
      picCache.set(key, s);
      if (live) setSvg(s);
    });
    return () => void (live = false);
  }, [key]);
  return <div class="igpic" aria-hidden="true" data-pic={name} dangerouslySetInnerHTML={{ __html: svg }} />;
}

const Tile = ({ icon }: { icon: IconName }) => (
  <span class="bigtile" aria-hidden="true">
    <Icon name={icon} />
  </span>
);

// ------------------------------------------------------------------ sheet choices (first-Start flow)

let lastChoice: string | null = null;
/** A button in a flow sheet: remember what she chose, then close (Back / ✕ / scrim leave `lastChoice` null). */
function choose(s: Services, c: string) {
  lastChoice = c;
  s.router.closeSheet();
}

/**
 * Open a sheet and resolve with her choice once none of `ids` is open any more ('back' = closed without a button).
 * `ids` lets one moment swap sheets in place (A2 → A3/A4 via replaceSheet).
 */
export function askSheet(s: Services, id: string, ids: string[] = [id]): Promise<string> {
  return new Promise((resolve) => {
    lastChoice = null;
    let seen = false;
    let stop: (() => void) | null = null;
    let done = false;
    s.router.openSheet(id);
    stop = effect(() => {
      const cur = s.router.sheet.value;
      if (cur && ids.includes(cur)) {
        seen = true;
        return;
      }
      if (!seen || done) return;
      done = true;
      queueMicrotask(() => stop?.());
      resolve(lastChoice ?? 'back');
    });
  });
}

/** Wait for the router to leave a route (B1 in the first-Start flow). */
function leaveRoute(s: Services, name: string): Promise<void> {
  return new Promise((resolve) => {
    let stop: (() => void) | null = null;
    let done = false;
    stop = effect(() => {
      if (s.router.route.value.name === name || done) return;
      done = true;
      queueMicrotask(() => stop?.());
      resolve();
    });
  });
}

/** Run `cb` on the next return to the app (after an `openSettings`). */
function onReturn(p: Platform, cb: () => void): () => void {
  let away = false;
  const off = p.visibility.onChange((v) => {
    if (!v) away = true;
    else if (away) {
      away = false;
      cb();
    }
  });
  return off;
}

// ------------------------------------------------------------------ A2 / A3 / A4 location (6h.2)

/** Location detail from the device report: granted precise, approximate only, blocked ("don't ask again"), or not yet. */
export function locDetail(d: DeviceInfo | null): 'precise' | 'coarse' | 'blocked' | 'prompt' {
  if (!d) return 'prompt';
  if (d.fineLocation) return 'precise';
  if (d.coarseLocation) return 'coarse';
  return d.locationState === 'denied' ? 'blocked' : 'prompt';
}

/** A2 OK → the system dialog → A3 (approximate only) / A4 (blocked) / close (granted, or first "Don't allow"). */
async function requestLocation(s: Services) {
  await locate(s.platform, s.api).catch(() => null);
  const d = await refreshDevice(s.platform);
  const r = locDetail(d);
  log(`m6:loc-${r}`);
  if (r === 'coarse') s.router.replaceSheet('loc-approx');
  else if (r === 'blocked') s.router.replaceSheet('loc-denied');
  else choose(s, r === 'precise' ? 'ok' : 'denied');
}

export function LocExplainNative() {
  const s = useServices();
  const L = useL();
  return (
    <Sheet id="loc-explain" title={L('a2_t')} close={false} top={<Tile icon="loc" />}>
      <p class="lead">{L('a2_b')}</p>
      <Pic name="perm-location" />
      <p class="lockline">
        <Icon name="lock" />
        <span>{L('a2_lock')}</span>
      </p>
      <div class="opts">
        <button type="button" class="btn btn-primary" data-testid="loc-ok" onClick={() => void requestLocation(s)}>
          {L('a2_ok')}
        </button>
        <button type="button" class="btn btn-secondary" data-testid="loc-type" onClick={() => typePlace(s)}>
          {L('a2_type')}
        </button>
      </div>
    </Sheet>
  );
}

function typePlace(s: Services) {
  lastChoice = 'type';
  s.router.navigate('/search?field=from');
}

export function LocApproxSheet() {
  const s = useServices();
  const L = useL();
  return (
    <Sheet id="loc-approx" title={L('a3a_t')} close={false}>
      <p class="lead">{L('a3a_b')}</p>
      <Pic name="perm-settings-location" />
      <div class="opts">
        <button type="button" class="btn btn-primary" data-testid="loc-settings" onClick={() => void s.platform.device?.openSettings('app')}>
          <Icon name="sliders" />
          {L('open_settings')}
        </button>
        <button type="button" class="btn btn-secondary" data-testid="loc-keep" onClick={() => choose(s, 'coarse')}>
          {L('keep_it')}
        </button>
      </div>
    </Sheet>
  );
}

export function LocDeniedNative() {
  const s = useServices();
  const L = useL();
  // On return from Settings: granted → close + toast and the action continues; still denied → unchanged.
  useEffect(
    () =>
      onReturn(s.platform, async () => {
        const r = locDetail(await refreshDevice(s.platform));
        if (r === 'precise' || r === 'coarse') {
          showToast('loc-ok', L('a4_ok_toast'));
          choose(s, 'ok');
        }
      }),
    [],
  );
  return (
    <Sheet id="loc-denied" title={L('a4_t')}>
      <p class="lead">{L('a4_b')}</p>
      <ol class="numsteps">
        <li>{L('a4_1')}</li>
        <li>{L('a4_2')}</li>
        <li>
          <div>
            {L('a4_3')}
            <Pic name="perm-settings-location" />
          </div>
        </li>
        <li>{L('a4_4')}</li>
      </ol>
      <div class="opts">
        <button type="button" class="btn btn-primary" data-testid="loc-settings" onClick={() => void s.platform.device?.openSettings('app')}>
          <Icon name="sliders" />
          {L('open_settings')}
        </button>
        <button type="button" class="btn btn-secondary" data-testid="loc-type" onClick={() => typePlace(s)}>
          {L('a4_type')}
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ A3 notifications / A6 DND (6h.3)

export function NotifySheet() {
  const s = useServices();
  const L = useL();
  return (
    <Sheet id="m6-notify" title={L('a3_t')} close={false} top={<Tile icon="bell" />}>
      <p class="lead">{L('a3_b')}</p>
      <Pic name="perm-notify" />
      <div class="opts">
        <button type="button" class="btn btn-primary" data-testid="notify-ok" onClick={() => choose(s, 'ok')}>
          {L('a3_ok')}
        </button>
        <button type="button" class="btn btn-quiet" data-testid="notify-no" onClick={() => choose(s, 'no')}>
          {L('a3_no')}
        </button>
      </div>
    </Sheet>
  );
}

export function DndSheet() {
  const s = useServices();
  const L = useL();
  return (
    <Sheet id="m6-dnd" title={L('a6_t')} close={false} top={<Tile icon="moon" />}>
      <p class="lead">{L('a6_b')}</p>
      <Pic name="perm-dnd" />
      <div class="opts">
        <button
          type="button"
          class="btn btn-primary"
          data-testid="dnd-ok"
          onClick={() => {
            void s.platform.device?.openSettings('alerts-channel');
            choose(s, 'ok');
          }}
        >
          {L('a6_ok')}
        </button>
        <button type="button" class="btn btn-quiet" data-testid="dnd-no" onClick={() => choose(s, 'no')}>
          {L('a6_no')}
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ C1 no Chinese voice (6h.5)

export function NoVoiceSheet() {
  const s = useServices();
  const L = useL();
  return (
    <Sheet id="m6-novoice" title={L('c1_t')} close={false} top={<Tile icon="mute" />}>
      <p class="lead">{L('c1_b')}</p>
      <div class="opts">
        <button
          type="button"
          class="btn btn-primary"
          data-testid="novoice-add"
          onClick={() => {
            const off = onReturn(s.platform, async () => {
              off();
              const v = await s.platform.speech.voices().catch(() => ({ zh: false, en: false }));
              if (v.zh) {
                showToast('zh-voice', L('c1_ready'));
                void s.platform.speech.speak(L('c1_hello'), 'zh-CN', 'normal');
              }
              choose(s, v.zh ? 'ready' : 'missing');
            });
            void s.platform.device?.openSettings('tts-install');
          }}
        >
          <Icon name="speaker" />
          {L('c1_add')}
        </button>
      </div>
      <p class="t-caption">{L('c1_caption')}</p>
      <Pic name="perm-tts" />
      <div class="opts">
        <button type="button" class="btn btn-secondary" data-testid="novoice-later" onClick={() => choose(s, 'later')}>
          {L('c1_later')}
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ B1 / B2 battery guide (6h.4)

function brandOf(d: DeviceInfo | null): GuideBrand {
  const picked = flags.value.brand as GuideBrand | undefined;
  if (picked && GUIDE_BRANDS.includes(picked)) return picked;
  return guideBrand(d?.manufacturer ?? '');
}

/** The guide body (screen B1, or the in-trip sheet). `onDone` = 以后再说 / 好了. */
function GuideBody({ onDone }: { onDone: (c: 'later' | 'done') => void }) {
  const s = useServices();
  const L = useL();
  const lang = s.store.settings.value.lang;
  const brand = brandOf(device.value);
  const g = BATTERY_GUIDE[brand];
  const [status, setStatus] = useState<'idle' | 'ok' | 'notyet'>('idle');
  // B2: listen for the return from Settings as soon as she taps (registered in the tap, not after a re-render).
  const off = useRef<(() => void) | null>(null);
  useEffect(() => () => off.current?.(), []);
  const watchReturn = () => {
    off.current ??= onReturn(s.platform, async () => {
      const d = await refreshDevice(s.platform);
      const ok = !!d?.batteryUnrestricted;
      setStatus(ok ? 'ok' : 'notyet');
      log(`m6:battery-${ok ? 'ok' : 'notyet'}`);
    });
  };
  return (
    <>
      <p class="lead">{L('b1_intro')}</p>
      <div class="brandrow" data-testid="bg-brand" data-brand={brand}>
        <b>{L('b1_phone', { brand: g.name[lang] })}</b>
        <button type="button" class="inlink btnlink" data-testid="bg-not-this" onClick={() => s.router.openSheet('m6-brand')}>
          <span class="u">{L('b1_not_this')}</span>
        </button>
      </div>
      <ol class="numsteps" data-testid="bg-steps">
        {g.steps.map((st, i) => (
          <li>
            <div>
              {st[lang]}
              {g.pictures[i] && <Pic name={g.pictures[i]!} />}
            </div>
          </li>
        ))}
      </ol>
      <p class="t-caption">{L('b1_words')}</p>
      {status === 'ok' && (
        <div class="m6ok" role="status" aria-live="polite" data-testid="bg-ok">
          <Icon name="check" />
          <div>
            <b>{L('b2_ok')}</b>
            {g.unchecked && <p class="t-caption">{L(g.unchecked === 'switches' ? 'b2_switches' : 'b2_autostart')}</p>}
          </div>
        </div>
      )}
      {status === 'notyet' && (
        <p class="t-caption" role="status" data-testid="bg-notyet">
          {L('b2_notyet')}
        </p>
      )}
      <div class="opts">
        {status === 'ok' ? (
          <button type="button" class="btn btn-primary" data-testid="bg-done" onClick={() => onDone('done')}>
            {L('b2_done')}
          </button>
        ) : (
          <>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="bg-open"
              onClick={() => {
                watchReturn();
                void s.platform.device?.openSettings(g.open);
              }}
            >
              <Icon name="sliders" />
              {L('open_settings')}
            </button>
            <button type="button" class="btn btn-quiet" data-testid="bg-later" onClick={() => onDone('later')}>
              {L('b1_later')}
            </button>
          </>
        )}
      </div>
    </>
  );
}

let guideChoice: 'later' | 'done' | null = null;

/** B1 screen (route /battery, a history entry). Back → where it came from (first-trip flow: H4, trip not started). */
export function BatteryGuideScreen() {
  const s = useServices();
  const L = useL();
  useEffect(() => {
    log('m6:battery-guide');
    if (!device.peek()) void refreshDevice(s.platform);
  }, []);
  return (
    <>
      <Bar />
      <main class="scroll m6col" data-testid="battery-guide">
        <Tile icon="battery" />
        <h1 class="t-title">{L('b1_t')}</h1>
        <GuideBody
          onDone={(c) => {
            local.set(BATTERY_SEEN_KEY, '1');
            guideChoice = c;
            s.router.back();
          }}
        />
      </main>
    </>
  );
}

/** B3 during a trip: B1 as a sheet with the same content; Back → H5. */
export function BatteryGuideSheet() {
  const s = useServices();
  const L = useL();
  return (
    <Sheet id="battery-guide" title={L('b1_t')} top={<Tile icon="battery" />}>
      <GuideBody
        onDone={() => {
          local.set(BATTERY_SEEN_KEY, '1');
          s.router.closeSheet();
        }}
      />
    </Sheet>
  );
}

/** "你的手机是哪个牌子？": a stacked radiogroup; choosing swaps the steps in place. */
export function BrandSheet() {
  const s = useServices();
  const L = useL();
  const lang = s.store.settings.value.lang;
  const cur = brandOf(device.value);
  return (
    <Sheet id="m6-brand" title={L('b1_pick_t')}>
      <div class="seg stack" role="radiogroup" aria-labelledby="m6-brand-title">
        {GUIDE_BRANDS.map((b) => (
          <button
            type="button"
            role="radio"
            aria-checked={b === cur}
            data-testid={`brand-${b}`}
            onClick={() => {
              setFlags({ brand: b });
              s.router.closeSheet();
            }}
          >
            {b === cur && <Icon name="check" />}
            {BATTERY_GUIDE[b].name[lang]}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ B3 after a kill (6h.4)

/** H1 info bar (no trip): `.updbar` style with a jade rule. */
export function KilledBar() {
  const s = useServices();
  const L = useL();
  if (!killed.value) return null;
  return (
    <div class="banner updbar m6kill" role="status" data-testid="b3-home">
      <p class="updtx">
        <Icon name="battery" />
        <span>
          <b>{L('b3_t')}</b> {L('b3_s')}
        </span>
      </p>
      <button
        type="button"
        class="btn btn-secondary small"
        data-testid="b3-setup"
        onClick={() => {
          killed.value = false;
          s.router.navigate('/battery');
        }}
      >
        {L('b3_btn')}
      </button>
      <button type="button" class="iconbtn sq" data-testid="b3-close" aria-label={L('ok_sr')} onClick={() => (killed.value = false)}>
        <Icon name="close" />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ D1 update notice (6h.8)

export function openAndroidPage(p: Platform) {
  const d = device.peek();
  const from = d?.versionName && /^\d+\.\d+\.\d+$/.test(d.versionName) ? `?from=${d.versionName}` : '';
  const url = `${apiOrigin}/android${from}`;
  log('m6:update-open');
  if (p.device?.openUrl) void p.device.openUrl(url);
  else window.open(url, '_blank', 'noopener');
}

export function UpdateNotice() {
  const s = useServices();
  const L = useL();
  const n = newer.value;
  if (!n || !updVisible() || s.store.trip.value) return null;
  return (
    <div class="banner updbar" data-testid="d1-update">
      <button type="button" data-testid="d1-get" aria-label={L('d1_sr', { v: n.versionName })} onClick={() => openAndroidPage(s.platform)}>
        <Icon name="install" />
        <span>
          {L('d1_bar', { v: n.versionName })}
          <span class="nw">{L('d1_go')}</span>
        </span>
      </button>
      <button type="button" class="iconbtn sq" data-testid="d1-later" aria-label={L('d1_later')} onClick={() => setFlags({ updHiddenDay: sgDay() })}>
        <Icon name="close" />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ D2 Get-the-app card (web, 6h.8)

export function GetAppCard() {
  const s = useServices();
  const L = useL();
  if (flags.value.getAppDismissed || s.store.trip.value) return null;
  return (
    <section class="card m6card" data-testid="d2-card" aria-labelledby="d2-t">
      <Tile icon="smartphone" />
      <h2 id="d2-t">{L('d2_t')}</h2>
      <p class="lead">{L('d2_b')}</p>
      <div class="opts">
        <a class="btn btn-primary" href="/android" data-testid="d2-go">
          {L('d2_go')}
        </a>
        <button type="button" class="btn btn-quiet" data-testid="d2-no" onClick={() => setFlags({ getAppDismissed: true })}>
          {L('d2_no')}
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Settings → 这个应用 (6h.10)

function Row(p: { icon: IconName; label: string; value?: string; testid: string; onClick: () => void; children?: ComponentChildren }) {
  return (
    <button type="button" class="row" data-testid={p.testid} onClick={p.onClick}>
      <Icon name={p.icon} />
      <span class="tx">{p.label}</span>
      {p.value && <span class={[...p.value].length <= 4 ? 'val nw' : 'val'}>{p.value}</span>}
      <Icon name="chev" />
    </button>
  );
}

/** The native rows at the top of 这个应用: battery guide · notifications (+ DND caption) · location permission. */
export function NativeAppRows() {
  const s = useServices();
  const L = useL();
  const d = device.value;
  useEffect(() => {
    void refreshDevice(s.platform);
  }, []);
  const notifyOn = d?.notificationsEnabled !== false;
  const loc = locDetail(d);
  return (
    <>
      <Row
        icon="battery"
        label={L('s_battery')}
        value={d?.batteryUnrestricted ? L('b_all_set') : L('b_not_set')}
        testid="row-battery-guide"
        onClick={() => s.router.navigate('/battery')}
      />
      <div>
        <Row icon={notifyOn ? 'bell' : 'bell-off'} label={L('s_notify')} value={notifyOn ? L('on') : L('off')} testid="row-notify" onClick={() => void s.platform.device?.openSettings('notifications')} />
        {d?.dndBlocks && (
          <p class="t-caption swsub" data-testid="dnd-caption">
            {L('a6_caption')}{' '}
            <button type="button" class="inlink btnlink" data-testid="dnd-open" onClick={() => void s.platform.device?.openSettings('alerts-channel')}>
              <span class="u">{L('a6_link')}</span>
            </button>
          </p>
        )}
      </div>
      <Row
        icon="loc"
        label={L('s_loc')}
        value={loc === 'precise' ? L('s_loc_ok') : loc === 'coarse' ? L('s_loc_coarse') : L('s_loc_no')}
        testid="row-loc-perm"
        onClick={() => void s.platform.device?.openSettings('app')}
      />
    </>
  );
}

/** The version caption becomes a row when a newer APK exists (D1). */
export function VersionRow() {
  const s = useServices();
  const L = useL();
  const n = newer.value;
  if (!n) return null;
  return (
    <div class="opts">
      <Row icon="install" label={L('d1_row', { v: APP_VERSION })} testid="row-version-new" onClick={() => openAndroidPage(s.platform)} />
    </div>
  );
}

// ------------------------------------------------------------------ first Start (6h.10 entry-point parity)

/**
 * The native first-Start flow, before the runtime starts: A2 → A3 → A6 → C1 → B1, each only when due, one sheet at a
 * time. Resolves false when she leaves (A2/A4 "type a place", or Back on B1 → H4, trip not started).
 */
export async function preflight(s: Services): Promise<boolean> {
  const p = s.platform;
  if (!p.capabilities.native || !p.device) return true;
  let d = await refreshDevice(p);
  // A2 (location): only while the system has not answered for good.
  if (locDetail(d) === 'prompt') {
    const c = await askSheet(s, 'loc-explain', ['loc-explain', 'loc-approx', 'loc-denied']);
    if (c === 'type') return false;
    d = await refreshDevice(p);
  }
  // A3 notifications: Android 13+, once ever.
  const np = p.notifications?.permission() ?? 'unsupported';
  if ((d?.sdk ?? 0) >= 33 && np === 'default' && !flags.peek().notifyAsked) {
    setFlags({ notifyAsked: true });
    local.set('notify.asked', '1'); // the runtime's QA-21 prompt never asks a second time
    const c = await askSheet(s, 'm6-notify');
    if (c === 'ok') await p.notifications!.request().catch(() => 'denied');
    d = await refreshDevice(p);
  }
  // A6 Do Not Disturb: once ever.
  if (d?.dndBlocks && !flags.peek().dndAsked) {
    setFlags({ dndAsked: true });
    await askSheet(s, 'm6-dnd');
  }
  // C1 no Chinese voice: app language zh, once ever.
  if (s.store.settings.peek().lang === 'zh' && !flags.peek().noZhVoiceShown) {
    const v = await p.speech.voices().catch(() => ({ zh: true, en: true }));
    if (!v.zh) {
      setFlags({ noZhVoiceShown: true });
      await askSheet(s, 'm6-novoice');
    }
  }
  // B1 battery guide: once before the first trip, skippable; Back = H4, trip not started.
  d = device.peek();
  if (d && !d.batteryUnrestricted && local.get(BATTERY_SEEN_KEY) !== '1') {
    guideChoice = null;
    s.router.navigate('/battery?flow=start');
    await leaveRoute(s, 'battery');
    if (!guideChoice) return false;
  }
  return true;
}

/** A5: on return with notifications on, the note goes and a polite line says so. */
export function watchNotifyReturn(s: Services, onOn: () => void): () => void {
  return onReturn(s.platform, async () => {
    const d = await refreshDevice(s.platform);
    if (d?.notificationsEnabled) {
      announce(m6t(s.store.settings.peek().lang, 'a5_done'));
      onOn();
    }
  });
}
