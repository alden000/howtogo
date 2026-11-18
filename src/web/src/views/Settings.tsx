/**
 * F6 Settings (H13 extended to a full screen for M1) + its sheets (name, home, clear, install, report)
 * and the About & privacy screen. Voice/vibration rows stay hidden while flag `guide` is off.
 */
import { family, normalizePhone } from '../state/family';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { BatterySaverPref, BatterySaverState } from '@howtogo/shared';
import { createSaverState } from '../state/battery';
import { SIZE_SR } from '../i18n/m5ui1';
import { useT5 } from '../i18n/m5lazy';
import { useServices, useT } from '../context';
import { canInstall, promptInstall } from '../pwa/install';
import { buildReport } from '../report';
import { TEXT_SCALE, TEXT_SIZES, type Settings } from '../state/store';
import { DATA_AS_OF } from '@howtogo/shared';
import { APP_VERSION, BUILD_DATE } from '../version';
import { sampleMode } from '../state/sample';
import { announce, Bar, Icon, NumSteps, Sheet, showToast, Wordmark, type IconName } from '../ui/kit';
import { dataDate } from '../transit/m3';
import { HomeConfirm } from './HomeConfirm';
import { lazyView } from '../ui/lazy';
import omLogo from '../assets/onemap/onemap-logo.png';
import omLogo2x from '../assets/onemap/onemap-logo@2x.png';
import { showUpdBar } from '../pwa/launch';

// 6f.3 L3: the update bar also sits at the top of the Settings list (lazy launch chunk, shared with H1).
const UpdateBar = lazyView(() => import('./launch').then((m) => m.UpdateBar));

const NAME_MAX = 20;
export const isStandalone = () => typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

function Seg<K extends keyof Settings>(props: { name: K; label: string; opts: [Settings[K], string, string?][]; stack?: boolean; cls?: string; children?: ComponentChildren; onPick?: (v: Settings[K], label: string) => void }) {
  const { store } = useServices();
  const cur = store.settings.value[props.name];
  const id = `set-${String(props.name)}`;
  return (
    <div class="setrow">
      <h3 id={id}>{props.label}</h3>
      <div class={`${props.stack ? 'seg stack' : 'seg'}${props.cls ? ` ${props.cls}` : ''}`} role="group" aria-labelledby={id}>
        {props.opts.map(([v, l, sr]) => (
          <button
            type="button"
            aria-pressed={cur === v}
            aria-label={sr}
            lang={props.name === 'lang' ? (v === 'en' ? 'en' : 'zh-CN') : undefined}
            data-testid={`setting-${String(props.name)}-${String(v)}`}
            onClick={() => {
              store.updateSettings({ [props.name]: v } as Partial<Settings>);
              props.onPick?.(v, l);
            }}
          >
            {l}
            {cur === v && <Icon name="check" />}
          </button>
        ))}
      </div>
      {props.children}
    </div>
  );
}

function Row(props: { icon: IconName; label: string; value?: string; testid: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      class="row"
      data-testid={props.testid}
      aria-disabled={props.disabled ? 'true' : undefined}
      onClick={() => !props.disabled && props.onClick?.()}
    >
      <Icon name={props.icon} />
      <span class="tx">{props.label}</span>
      {props.value && <span class="val">{props.value}</span>}
      {!props.disabled && <Icon name="chev" />}
    </button>
  );
}

/** H13 display rows (language, text size, colours, reduce motion). */
export function DisplayRows() {
  const { store } = useServices();
  const t = useT();
  return (
    <>
      <Seg name="lang" label={t('set_lang')} opts={[['zh', '中文'], ['en', 'English']]} />
      {/* 6f.11: five sizes as a 3 + 2 grid; SR names "较小，85%"…; the caption only while 85 % is selected. */}
      <Seg name="textSize" label={t('set_text')} cls="sizes" opts={TEXT_SIZES.map((v) => [v, `${Math.round(TEXT_SCALE[v] * 100)}%`, t(SIZE_SR[v])])}>
        {store.settings.value.textSize === 'small' && (
          <p class="t-caption" style={{ color: 'var(--c-ink-2)', margin: 'var(--s-2) 0 0' }} data-testid="size-85-note">
            {t('size_85_note')}
          </p>
        )}
      </Seg>
      <Seg name="theme" label={t('set_theme')} opts={[['auto', t('theme_auto')], ['light', t('theme_light')], ['dark', t('theme_dark')]]} />
      <Seg name="motion" label={t('set_motion')} opts={[['auto', t('theme_auto')], ['on', t('on')], ['off', t('off')]]} />
    </>
  );
}

/** H13 语音提示 / 震动提示 + 6c.11 "试听 / Test voice" (AC 24, 26). */
function VoiceRows() {
  const { runtime, platform, store, router } = useServices();
  const t = useT();
  const [voices, setVoices] = useState<{ zh: boolean; en: boolean } | null>(null);
  useEffect(() => {
    void platform.speech.voices().then(setVoices).catch(() => {});
  }, []);
  const lang = store.settings.value.lang;
  const missing = voices && !(lang === 'en' ? voices.en : voices.zh);
  return (
    <>
      <Seg name="muted" label={t('set_voice')} opts={[[false, t('on')], [true, t('off')]]} />
      <div class="setrow">
        <button type="button" class="btn btn-secondary small" data-testid="test-voice" onClick={() => runtime.testVoice()}>
          <Icon name="speaker" />
          {t('test_voice')}
        </button>
        {missing && (
          <p class="t-caption" style={{ color: 'var(--c-ink-2)', margin: 'var(--s-2) 0 0' }} data-testid="no-zh-voice">
            {t('no_zh_voice')}{' '}
            <button type="button" class="btn-quiet" data-testid="voice-help" onClick={() => router.openSheet('voice-help')}>
              {t('novoice_how')}
            </button>
          </p>
        )}
      </div>
      <Seg name="haptics" label={t('set_vib')} opts={[[true, t('on')], [false, t('off')]]} />
    </>
  );
}

export function SettingsScreen() {
  const { store, router, flags } = useServices();
  const t = useT();
  const t5 = useT5();
  const s = store.settings.value;
  const home = store.places.value.home;
  const nothing = store.recents.value.length === 0;
  const fam = family.contacts.value.length;
  return (
    <>
      <Bar />
      <main class="scroll">
        <h1 class="t-title" style={{ margin: '0 0 var(--s-2)' }}>
          {t('settings')}
        </h1>
        {showUpdBar.value && <UpdateBar />}
        <HomeConfirm />
        {/* 6f.7 L7: the final 1.0 order — Me · Display · Travel · Privacy · This app. */}
        <h2 class="grp">{t('grp_me')}</h2>
        <div class="opts">
          <Row icon="person" label={t('name_label')} value={s.name || t('not_set')} testid="row-name" onClick={() => router.openSheet('name')} />
          <Row
            icon="home"
            label={t('home_tile')}
            value={home?.name ?? t('not_set')}
            testid="row-home"
            onClick={() => (home ? router.openSheet('home') : router.navigate('/search?mode=home'))}
          />
          {/* QA-40 (AC 39): the My places editor (≤ 6 incl. Home). */}
          <Row icon="loc" label={t('my_places')} value={String((home ? 1 : 0) + store.places.value.others.length)} testid="row-places" onClick={() => router.navigate('/places')} />
          <Row icon="family" label={t('fam_row')} value={fam ? String(fam) : t('not_set')} testid="row-family" onClick={() => router.navigate('/family')} />
        </div>
        <h2 class="grp">{t('grp_display')}</h2>
        <DisplayRows />
        {flags.has('guide') && <VoiceRows />}
        <TravelRows />
        <h2 class="grp">{t5('grp_privacy')}</h2>
        <div class="opts">
          <PhoneRows />
          <ErrorCountsRow />
          <Row icon="lock" label={t('pv_link')} testid="row-privacy" onClick={() => router.navigate('/privacy')} />
          <Row icon="trash" label={t('set_delete_all')} testid="row-delete-all" onClick={() => router.openSheet('delete-all')} />
          <Row icon="trash" label={t('clear_recent_row')} value={nothing ? t('nothing_clear') : undefined} testid="row-clear" disabled={nothing} onClick={() => router.openSheet('clear')} />
        </div>
        <h2 class="grp">{t('grp_app')}</h2>
        <div class="opts">
          {!isStandalone() && <Row icon="install" label={t('install')} testid="row-install" onClick={() => router.openSheet('install')} />}
          <Row icon="qr" label={t('fam_setup')} testid="row-setup" onClick={() => router.navigate('/setup/start')} />
          <Row icon="report" label={t('report')} testid="report" onClick={() => router.openSheet('report')} />
          <Row icon="info" label={t('about_row')} testid="row-about" onClick={() => router.navigate('/about')} />
        </div>
        <p class="t-caption" data-testid="version">
          {t('version', { v: APP_VERSION })}
        </p>
      </main>
    </>
  );
}

/**
 * 6f.7 L7 error-counts row (AC 40): a switch row (whole row is the switch), sub-line as its description,
 * then "详细 / Details" → L1 h2 2 as its own 56 px target. Off = nothing is sent; queued counts are dropped
 * (main.tsx). Default on (Director ruling, OQ3).
 */
function ErrorCountsRow() {
  const { store, router } = useServices();
  const t = useT();
  const t5 = useT5();
  const on = store.settings.value.errorCounts !== false;
  return (
    <div class="swrow" data-testid="row-errors">
      <button type="button" class="row" role="switch" aria-checked={on} aria-describedby="set-errors-s" data-testid="set-errors" onClick={() => store.updateSettings({ errorCounts: !on })}>
        <span class="tx">{t5('set_errors')}</span>
        <span class="val">{on ? t('on') : t('off')}</span>
      </button>
      <p class="t-caption swsub" id="set-errors-s">
        {t5('set_errors_s')}
      </p>
      <button type="button" class="inlink" data-testid="set-errors-more" onClick={() => router.navigate('/privacy?s=sent')}>
        <span class="u">{t5('set_errors_more')}</span>
      </button>
    </div>
  );
}

/** 6f.5 L5 Settings row value: 自动 · 自动（现在开着）· 自动（这部手机不支持）· 开 · 关. */
export function batteryValue(pref: BatterySaverPref, st: BatterySaverState): 'bs_auto' | 'bs_auto_now' | 'bs_auto_na' | 'bs_on' | 'bs_off' {
  if (pref === 'on') return 'bs_on';
  if (pref === 'off') return 'bs_off';
  if (!st.autoAvailable) return 'bs_auto_na';
  return st.active ? 'bs_auto_now' : 'bs_auto';
}

function BatteryRow() {
  const { store, router } = useServices();
  const t = useT();
  const t5 = useT5();
  const st = useMemo(() => createSaverState(store), [store]).value;
  return <Row icon="leaf" label={t5('bs_row')} value={t5(batteryValue(store.settings.value.batterySaver ?? 'auto', st))} testid="row-battery" onClick={() => router.openSheet('battery')} />;
}

/** 6f.5 L5 Battery saver sheet: a stacked radiogroup (Auto / On / Off) with sub-lines; changes apply at once. */
export function BatterySheet() {
  const { store } = useServices();
  const t = useT();
  const t5 = useT5();
  const st = useMemo(() => createSaverState(store), [store]).value;
  const cur = store.settings.value.batterySaver ?? 'auto';
  const opts: [BatterySaverPref, string, string][] = [
    ['auto', t5('bs_auto'), t5(st.autoAvailable ? 'bs_auto_s' : 'bs_auto_s_na')],
    ['on', t5('bs_on'), t5('bs_on_s')],
    ['off', t5('bs_off'), t5('bs_off_s')],
  ];
  return (
    <Sheet id="battery" title={t5('bs_row')}>
      <div class="seg stack opts2" role="radiogroup" aria-labelledby="battery-title">
        {opts.map(([v, l, sub]) => (
          <button type="button" role="radio" aria-checked={cur === v} data-testid={`battery-${v}`} onClick={() => store.updateSettings({ batterySaver: v })}>
            <span class="tx">
              <strong>{l}</strong>
              <small data-testid={v === 'auto' ? 'battery-auto-sub' : undefined}>{sub}</small>
            </span>
            {cur === v && <Icon name="check" />}
          </button>
        ))}
      </div>
      <p class="t-caption helper" style={{ color: 'var(--c-ink-2)', marginTop: 'var(--s-4)' }}>
        <Icon name="leaf" />
        <span>{t5('bs_note')}</span>
      </p>
    </Sheet>
  );
}

export function NameSheet() {
  const { store, router } = useServices();
  const t = useT();
  const [v, setV] = useState(store.settings.value.name);
  return (
    <Sheet id="name" title={t('fr_name_t')}>
      <p class="lead">{t('fr_name_b')}</p>
      <label class="t-label" for="name-in">
        {t('name_label')}
      </label>
      <input
        id="name-in"
        class="textin"
        data-testid="name-input"
        maxLength={NAME_MAX}
        placeholder={t('name_ph')}
        value={v}
        onInput={(e) => setV((e.target as HTMLInputElement).value)}
      />
      <div class="opts" style={{ marginTop: 'var(--s-4)' }}>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="name-save"
          onClick={() => {
            store.updateSettings({ name: v.trim().slice(0, NAME_MAX) });
            router.closeSheet();
          }}
        >
          {t('save')}
        </button>
        {store.settings.value.name && (
          <button
            type="button"
            class="btn btn-secondary"
            data-testid="name-remove"
            onClick={() => {
              store.updateSettings({ name: '' });
              router.closeSheet();
            }}
          >
            {t('remove_name')}
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function HomeSheet() {
  const { store, router } = useServices();
  const t = useT();
  const home = store.places.value.home;
  return (
    <Sheet id="home" title={home ? t('home_label', { p: home.name }) : t('home_tile')}>
      <div class="opts">
        <button type="button" class="btn btn-primary" data-testid="home-change" onClick={() => router.navigate('/search?mode=home')}>
          {t('change_addr')}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          data-testid="clear-home"
          onClick={() => {
            store.setHome(undefined);
            router.closeSheet();
          }}
        >
          {t('remove')}
        </button>
      </div>
    </Sheet>
  );
}

export function ClearSheet() {
  const { store, router } = useServices();
  const t = useT();
  return (
    <Sheet id="clear" title={t('clear_q')}>
      <p class="lead">{t('clear_b')}</p>
      <div class="opts">
        <button
          type="button"
          class="btn btn-primary"
          data-testid="clear-recent"
          onClick={() => {
            store.clearRecents();
            router.closeSheet();
            showToast('cleared', t('toast_cleared'));
          }}
        >
          {t('clear')}
        </button>
        <button type="button" class="btn btn-secondary" data-testid="clear-cancel" onClick={() => router.closeSheet()}>
          {t('cancel')}
        </button>
      </div>
    </Sheet>
  );
}

export function InstallSheet() {
  const t = useT();
  return (
    <Sheet id="install" title={t('inst_t')}>
      <p class="lead">{t('inst_b')}</p>
      <Wordmark name={t('app_name')} tag="p" />
      {canInstall.value ? (
        <button type="button" class="btn btn-primary" style={{ marginTop: 'var(--s-4)' }} data-testid="install" onClick={() => void promptInstall()}>
          <Icon name="install" />
          {t('inst_btn')}
        </button>
      ) : isIOS() ? (
        <>
          <NumSteps items={[t('inst_ios_1'), t('inst_ios_2'), t('inst_ios_3')]} />
          <p class="t-caption">{t('inst_ios_more')}</p>
        </>
      ) : (
        <NumSteps items={[t('inst_and_1'), t('inst_and_2'), t('inst_and_3')]} />
      )}
    </Sheet>
  );
}

export function ReportSheet() {
  const { store, platform, router } = useServices();
  const t = useT();
  const [show, setShow] = useState(false);
  const text = buildReport(store.settings.value);
  return (
    <Sheet id="report" title={t('report')}>
      <p class="lead">{t('rep_b')}</p>
      <div class="opts">
        <button
          type="button"
          class="btn btn-primary"
          data-testid="report-send"
          onClick={async () => {
            const r = await platform.share('', text);
            if (r === 'shared' || r === 'copied') {
              router.closeSheet();
              showToast(r === 'shared' ? 'report' : 'copied', t(r === 'shared' ? 'toast_report' : 'toast_copied'));
            }
          }}
        >
          {t('rep_send')}
        </button>
        <button type="button" class="btn btn-quiet" aria-expanded={show} data-testid="report-see" onClick={() => setShow(!show)}>
          {t('rep_see')}
        </button>
      </div>
      {show && (
        <pre class="reportbox" data-testid="report-text">
          {text}
        </pre>
      )}
    </Sheet>
  );
}

const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "17 November 2026" (the LTA licence line spells the month out). */
export const longDateEn = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])} ${MONTH_EN[Number(m[2]) - 1]} ${m[1]}` : iso;
};
/** The official OneMap logo: 32 px at 1x, the 256 px asset on denser screens (Lighthouse image-size-responsive). */
// Creative M5 review fix 10: self-hosted (official OneMap assets), so About works offline (L6).
const OM_LOGO = omLogo;
const OM_LOGO_2X = omLogo2x;

/** 6f.2 L2 About: wordmark + version (build date), sample-mode line, Maps and data, Your privacy, Report. */
export function About() {
  const { store, router } = useServices();
  const t = useT();
  const t5 = useT5();
  const lang = store.settings.value.lang;
  return (
    <>
      <Bar />
      {/* QA-12: the long About text scrolls; keyboard users can focus and scroll it (axe scrollable-region-focusable). */}
      <main class="scroll" tabIndex={0} aria-label={t('about_row')} data-testid="about-scroll">
        <h1 class="t-title" style={{ margin: '0 0 var(--s-3)' }}>
          {t('about_row')}
        </h1>
        <Wordmark name={t('app_name')} tag="p" size={72} />
        <p data-testid="about-version">{t5('ab_version', { v: APP_VERSION, d: dataDate(BUILD_DATE, lang) })}</p>
        {sampleMode.value && (
          <p class="tripnote sample" data-testid="about-sample">
            <Icon name="info" />
            <span>{t5('ab_sample')}</span>
          </p>
        )}
        <h2 class="grp">{t('ab_maps_h')}</h2>
        <div class="abattrib" data-testid="about-attrib">
          <p class="omline">
            <img src={OM_LOGO} srcSet={`${OM_LOGO} 1x, ${OM_LOGO_2X} 2x`} alt="OneMap" width={28} height={28} decoding="async" />
            <span lang="en">{t('ab_mapdata')}</span>
          </p>
          <p>{t('ab_maps')}</p>
          <p class="t-caption" data-testid="about-lta" lang="en">
            <LtaLine text={t5('ab_lta_on', { d: longDateEn(DATA_AS_OF) })} />
          </p>
          {lang === 'zh' && (
            <p class="t-caption" data-testid="about-data">
              {/* Creative m34-fix-a F4: the data date in plain words; report.ts keeps `data: YYYY-MM-DD`. */}
              <span class="num">{t('ab_data', { d: dataDate(DATA_AS_OF, 'zh') })}</span>
            </p>
          )}
        </div>
        <section data-testid="privacy" aria-labelledby="ab-priv-h">
          <h2 class="grp" id="ab-priv-h">
            {t('ab_priv_h')}
          </h2>
          <p>{t5('ab_priv_line')}</p>
          <div class="opts">
            <Row icon="lock" label={t('pv_link')} testid="about-privacy" onClick={() => router.navigate('/privacy')} />
            <Row icon="report" label={t('report')} testid="about-report" onClick={() => router.openSheet('report')} />
          </div>
        </section>
      </main>
    </>
  );
}

/** On/off row (role=switch, 56 px). */
function Switch(props: { label: string; sub?: string; on: boolean; testid: string; onChange: (v: boolean) => void }) {
  const t = useT();
  return (
    <button type="button" class="row" role="switch" aria-checked={props.on} data-testid={props.testid} onClick={() => props.onChange(!props.on)}>
      <span class="tx">
        {props.label}
        {props.sub && <small style={{ display: 'block', fontWeight: 400 }}>{props.sub}</small>}
      </span>
      <span class="val">{props.on ? t('on') : t('off')}</span>
    </button>
  );
}

/** M3 AC 41: the licence sentence (English in both UIs) with the Singapore Open Data Licence linked. */
export const ODL_URL = 'https://data.gov.sg/open-data-licence';
const ODL_TEXT = 'Singapore Open Data Licence version 1.0';
function LtaLine({ text }: { text: string }) {
  const [a, b] = text.split(ODL_TEXT);
  if (b === undefined) return <>{text}</>;
  return (
    <>
      {a}
      {/* QA-50: one 56 px target; the trailing punctuation sits inside it so it never strands on its own line. */}
      <a class="inlink" href={ODL_URL} target="_blank" rel="noopener noreferrer" lang="en" data-testid="about-odl">
        <span>
          <span class="u">{ODL_TEXT}</span>
          {b}
        </span>
      </a>
    </>
  );
}

/** M3 AC 33 / QA-30: route preference (least walking default, fewest changes, fastest); persisted in settings. */
function PrefRow({ onPick }: { onPick?: (label: string) => void }) {
  const t = useT();
  return (
    <Seg
      name="preference"
      label={t('pref_h')}
      stack
      {...(onPick ? { onPick: (_v: unknown, l: string) => onPick(l) } : {})}
      opts={[
        ['least_walk', t('label_least_walk')],
        ['fewest_transfers', t('label_fewest')],
        ['fastest', t('label_fastest')],
      ]}
    />
  );
}

/**
 * H3 Route options sheet (AC 33): Show first only. Creative m34-fix-a F2: the Lift-friendly switch joins
 * the sheet when its ranking ships (M5). F7: a pick re-ranks, announces and closes the sheet (400 ms).
 */
export function RoutePrefsSheet() {
  const { router } = useServices();
  const t = useT();
  const onPick = (label: string) => {
    announce(t('pref_now', { label }));
    const reduced = document.documentElement.classList.contains('rm');
    setTimeout(() => {
      if (router.sheet.value === 'route-prefs') router.closeSheet();
    }, reduced ? 0 : 400);
  };
  return (
    <Sheet id="route-prefs" title={t('pref_sheet_t')}>
      <PrefRow onPick={onPick} />
    </Sheet>
  );
}

/** M3 Settings → 出行 / Travel (6d.2, 6d.8, AC 28, AC 33). */
function TravelRows() {
  const t = useT();
  const p = family.prefs.value;
  return (
    <>
      <h2 class="grp">{t('set_travel')}</h2>
      <PrefRow />
      <div class="opts">
        <Switch label={t('set_wheelchair')} on={p.wheelchair} testid="set-wheelchair" onChange={(v) => family.setPrefs({ wheelchair: v })} />
        <Switch label={t('set_concession')} on={p.concession} testid="set-concession" onChange={(v) => family.setPrefs({ concession: v })} />
        <Switch label={t('set_liftfriendly')} sub={t('set_liftfriendly_s')} on={p.liftFriendly} testid="set-liftfriendly" onChange={(v) => family.setPrefs({ liftFriendly: v })} />
        <BatteryRow />
      </div>
    </>
  );
}

/** M4 my phone + OQ3 switch; since 6f.7 L7 they open the 隐私 / Privacy group (Family moved to Me, setup to This app). */
function PhoneRows() {
  const t = useT();
  const p = family.prefs.value;
  const [phone, setPhone] = useState(p.myPhone.replace(/^\+65/, ''));
  const [bad, setBad] = useState(false);
  return (
    <>
      <div class={`field2${bad ? ' bad' : ''}`} style={{ margin: '8px 0' }}>
        <label for="my-phone">{t('set_myphone')}</label>
        <div class="telrow">
          <span class="pre" aria-hidden="true">
            +65
          </span>
          <input
            id="my-phone"
            type="tel"
            inputMode="tel"
            data-testid="my-phone"
            aria-describedby="my-phone-h"
            value={phone}
            onInput={(e) => setPhone(e.currentTarget.value)}
            onBlur={() => {
              if (!phone.trim()) return family.setPrefs({ myPhone: '' });
              const r = normalizePhone(phone);
              setBad(!r.e164);
              if (r.e164) family.setPrefs({ myPhone: r.e164 });
            }}
          />
        </div>
        {bad && <span class="fnote">{t('fam_err_fmt')}</span>}
        <p class="t-caption helper" id="my-phone-h" data-testid="my-phone-help">
          <Icon name="lock" />
          <span>{t('set_myphone_h')}</span>
        </p>
      </div>
      {p.myPhone && <Switch label={t('set_sendphone')} sub={t('set_sendphone_s')} on={p.sendPhone} testid="set-sendphone" onChange={(v) => family.setPrefs({ sendPhone: v })} />}
    </>
  );
}
