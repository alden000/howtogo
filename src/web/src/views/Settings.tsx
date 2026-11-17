/**
 * F6 Settings (H13 extended to a full screen for M1) + its sheets (name, home, clear, install, report)
 * and the About & privacy screen. Voice/vibration rows stay hidden while flag `guide` is off.
 */
import { family, normalizePhone } from '../state/family';
import { useEffect, useState } from 'preact/hooks';
import { useServices, useT } from '../context';
import { canInstall, promptInstall } from '../pwa/install';
import { buildReport } from '../report';
import { TEXT_SCALE, TEXT_SIZES, type Settings } from '../state/store';
import { DATA_AS_OF } from '@howtogo/shared';
import { APP_VERSION } from '../version';
import { Bar, Icon, NumSteps, Sheet, showToast, Wordmark, type IconName } from '../ui/kit';
import { HomeConfirm } from './HomeConfirm';

const NAME_MAX = 20;
export const isStandalone = () => typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

function Seg<K extends keyof Settings>(props: { name: K; label: string; opts: [Settings[K], string][] }) {
  const { store } = useServices();
  const cur = store.settings.value[props.name];
  const id = `set-${String(props.name)}`;
  return (
    <div class="setrow">
      <h3 id={id}>{props.label}</h3>
      <div class="seg" role="group" aria-labelledby={id}>
        {props.opts.map(([v, l]) => (
          <button
            type="button"
            aria-pressed={cur === v}
            lang={props.name === 'lang' ? (v === 'en' ? 'en' : 'zh-CN') : undefined}
            data-testid={`setting-${String(props.name)}-${String(v)}`}
            onClick={() => store.updateSettings({ [props.name]: v } as Partial<Settings>)}
          >
            {l}
            {cur === v && <Icon name="check" />}
          </button>
        ))}
      </div>
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
  const t = useT();
  return (
    <>
      <Seg name="lang" label={t('set_lang')} opts={[['zh', '中文'], ['en', 'English']]} />
      <Seg name="textSize" label={t('set_text')} opts={TEXT_SIZES.map((v) => [v, `${Math.round(TEXT_SCALE[v] * 100)}%`])} />
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
  const s = store.settings.value;
  const home = store.places.value.home;
  const nothing = store.recents.value.length === 0;
  return (
    <>
      <Bar />
      <main class="scroll">
        <h1 class="t-title" style={{ margin: '0 0 var(--s-2)' }}>
          {t('settings')}
        </h1>
        <HomeConfirm />
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
        </div>
        <M4Rows />
        <h2 class="grp">{t('grp_display')}</h2>
        <DisplayRows />
        <TravelRows />
        {flags.has('guide') && <VoiceRows />}
        <h2 class="grp">{t('grp_history')}</h2>
        <div class="opts">
          <Row icon="trash" label={t('clear_recent_row')} value={nothing ? t('nothing_clear') : undefined} testid="row-clear" disabled={nothing} onClick={() => router.openSheet('clear')} />
          <Row icon="trash" label={t('set_delete_all')} testid="row-delete-all" onClick={() => router.openSheet('delete-all')} />
        </div>
        <h2 class="grp">{t('grp_app')}</h2>
        <div class="opts">
          {!isStandalone() && <Row icon="install" label={t('install')} testid="row-install" onClick={() => router.openSheet('install')} />}
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
      <Wordmark name={t('app_name')} />
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

export function About() {
  const t = useT();
  return (
    <>
      <Bar />
      {/* QA-12: the long About text scrolls; keyboard users can focus and scroll it (axe scrollable-region-focusable). */}
      <main class="scroll" tabIndex={0} aria-label={t('about_row')} data-testid="about-scroll">
        <h1 class="t-title" style={{ margin: '0 0 var(--s-3)' }}>
          {t('about_row')}
        </h1>
        <Wordmark name={t('app_name')} />
        <p class="t-caption">{t('version', { v: APP_VERSION })}</p>
        <h2 class="grp">{t('ab_maps_h')}</h2>
        <p>{t('ab_maps')}</p>
        <p class="t-caption" style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          <img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="OneMap" width={28} height={28} />
          <span>{t('ab_mapdata')}</span>
        </p>
        <p class="t-caption" data-testid="about-lta">
          <LtaLine text={t('ab_lta')} />
        </p>
        <p class="t-caption" data-testid="about-data">
          {t('ab_data', { d: DATA_AS_OF })}
        </p>
        <h2 class="grp">{t('ab_priv_h')}</h2>
        <ul class="bullets" data-testid="privacy">
          {/* QA-41 (M4 AC 50): on-device data, what a share sends, who sees it, how long, the setup box, delete all. */}
          {(['priv_1', 'priv_2', 'priv_m4_device', 'priv_3', 'priv_m4_share', 'priv_m4_who', 'priv_m4_time', 'priv_m4_setup', 'priv_4', 'priv_5', 'priv_6', 'priv_7', 'priv_m4_delete'] as const).map((k) => (
            <li>{t(k)}</li>
          ))}
        </ul>
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
      <a class="inlink" href={ODL_URL} target="_blank" rel="noopener noreferrer" lang="en">
        {ODL_TEXT}
      </a>
      {b}
    </>
  );
}

/** M3 AC 33 / QA-30: route preference (least walking default, fewest changes, fastest); persisted in settings. */
function PrefRow() {
  const t = useT();
  return (
    <Seg
      name="preference"
      label={t('pref_h')}
      opts={[
        ['least_walk', t('label_least_walk')],
        ['fewest_transfers', t('label_fewest')],
        ['fastest', t('label_fastest')],
      ]}
    />
  );
}

/** H3 Route options sheet (AC 33): the preference + the Lift-friendly toggle (its ranking is M5). */
export function RoutePrefsSheet() {
  const t = useT();
  const p = family.prefs.value;
  return (
    <Sheet id="route-prefs" title={t('pref_sheet_t')}>
      <PrefRow />
      <div class="opts">
        <Switch label={t('set_liftfriendly')} on={p.liftFriendly} testid="pref-liftfriendly" onChange={(v) => family.setPrefs({ liftFriendly: v })} />
      </div>
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
        <Switch label={t('set_liftfriendly')} on={p.liftFriendly} testid="set-liftfriendly" onChange={(v) => family.setPrefs({ liftFriendly: v })} />
      </div>
    </>
  );
}

/** M4 Settings: Family (P3), Let family set it up (P5), my phone + OQ3 switch. */
function M4Rows() {
  const { router } = useServices();
  const t = useT();
  const p = family.prefs.value;
  const n = family.contacts.value.length;
  const [phone, setPhone] = useState(p.myPhone.replace(/^\+65/, ''));
  const [bad, setBad] = useState(false);
  return (
    <>
    <h2 class="grp">{t('fam_row')}</h2>
    <div class="opts">
      <Row icon="family" label={t('fam_row')} value={n ? String(n) : t('not_set')} testid="row-family" onClick={() => router.navigate('/family')} />
      <Row icon="qr" label={t('fam_setup')} testid="row-setup" onClick={() => router.navigate('/setup/start')} />
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
    </div>
    </>
  );
}
