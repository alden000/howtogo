/**
 * M5 launch pieces (lazy chunk; STYLE-GUIDE 6f.3 L3 and 6f.4 L4):
 *   UpdateBar (H1 + Settings), WhatsNewSheet, InstallCard (L4a/b/c), InstallGuideSheet (L4b pictures),
 *   IabBar + IabHelpSheet (L4d in-app browsers).
 * State and decisions live in pwa/launch.ts (eager, unit-tested). Never rendered during a trip or a share:
 * Home only mounts them when `updateBusy` is false, and the sheets open only from H1.
 */
import { useEffect, useState } from 'preact/hooks';
import { useServices, useT } from '../context';
import { LAUNCH, type LaunchKey } from '../i18n/m5launch';
import { log } from '../log';
import { canInstall, promptInstall } from '../pwa/install';
import {
  chromeIntentUrl,
  detectInAppBrowser,
  dismissInstall,
  hideIab,
  iabHidden,
  installCardDue,
  installState,
  installVariant,
  isStandalone,
  markInstalled,
  showUpdBar,
  siteRoot,
  startUpdate,
  uaOs,
  updHidden,
  updPhase,
  type InstallVariant,
  type UaOs,
} from '../pwa/launch';
import { updateBusy } from '../pwa/register';
import { whatsNew, whatsNewShown } from '../pwa/whatsnew';
import { announce, Icon, NumSteps, Sheet, showToast, type IconName } from '../ui/kit';
import step1Safari from '../assets/install/ios-step1-safari.svg?raw';
import step1Chrome from '../assets/install/ios-step1-chrome.svg?raw';
import step2Zh from '../assets/install/ios-step2-zh.svg?raw';
import step2En from '../assets/install/ios-step2-en.svg?raw';
import step3Zh from '../assets/install/ios-step3-zh.svg?raw';
import step3En from '../assets/install/ios-step3-en.svg?raw';

/**
 * The two 6f.10 icons this chunk uses (creative/m5/icons.svg: 24 grid, 2.2 stroke), drawn inline so the eager
 * sprite (Home budget) stays as it was. Same markup and `.i` styling as kit's <Icon>.
 */
const M5_PATHS = {
  leaf: '<path d="M19.5 4.5C10.5 4.5 5 9 5 15.2c0 1.5.3 2.8.9 3.9 1.1.6 2.4.9 3.9.9C16 20 19.5 14.5 19.5 4.5z"/><path d="M4 20l8.5-8.5"/>',
  'open-browser': '<path d="M11 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-5"/><path d="M14 4.5h5.5V10M19.5 4.5L11 13"/>',
};
type M5IconName = keyof typeof M5_PATHS;
const M5Icon = ({ name }: { name: M5IconName }) => <svg class="i" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: M5_PATHS[name] }} />;

function useLT() {
  const { store } = useServices();
  const lang = store.settings.value.lang;
  return (k: LaunchKey) => LAUNCH[lang][k];
}

async function copyRoot(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(siteRoot());
    return true;
  } catch {
    return false;
  }
}

/* ---------- H1 slots ---------- */

const touchMac = () => (navigator.maxTouchPoints ?? 0) > 1;

/**
 * Top of H1: the in-app-browser band (L4d), then the update bar (L3); opens What's new once. Nothing while a
 * trip or a share is active (`updateBusy`), inside the Android app, or when installed (band only).
 */
export function LaunchTop() {
  const { platform, router } = useServices();
  const busy = updateBusy.value;
  const native = !!platform.capabilities.native;
  const ua = navigator.userAgent;
  const iab = !busy && !native && !iabHidden.value && !isStandalone() ? detectInAppBrowser(ua) : null;
  const wn = whatsNew.value;
  useEffect(() => {
    if (wn && !busy && !router.sheet.value) router.openSheet('whatsnew');
  }, [wn, busy]);
  return (
    <>
      {iab && <IabBar os={uaOs(ua, touchMac())} />}
      {showUpdBar.value && <UpdateBar />}
    </>
  );
}

/** Under H1's place tiles: the install card when it is due (AC 26–29). */
export function LaunchCard() {
  const { platform } = useServices();
  const standalone = isStandalone();
  // Opened from the home screen → never again (iOS has no appinstalled event).
  useEffect(() => void (standalone && markInstalled()), [standalone]);
  const variant = installVariant(navigator.userAgent, canInstall.value, touchMac());
  const due = installCardDue(installState.value, {
    now: Date.now(),
    variant,
    standalone,
    native: !!platform.capabilities.native,
    tripActive: updateBusy.value,
  });
  return due && variant ? <InstallCard variant={variant} /> : null;
}

/* ---------- L3 ---------- */

let announcedUpd = false;

/** The update bar: waiting → updating (refresh turns, ✕ hidden) → slow (no control after 10 s). */
export function UpdateBar() {
  const L = useLT();
  const phase = updPhase.value;
  useEffect(() => {
    if (announcedUpd) return;
    announcedUpd = true;
    announce(L('upd_sr'));
  }, []);
  useEffect(() => {
    if (phase === 'slow') announce(L('upd_slow'));
  }, [phase]);
  return (
    <div class="banner updbar" data-testid="update-banner" data-phase={phase} aria-busy={phase === 'updating' ? 'true' : undefined}>
      {phase === 'slow' ? (
        <p class="updtx">
          <Icon name="refresh" />
          <span>{L('upd_slow')}</span>
        </p>
      ) : (
        <button
          type="button"
          data-testid="sw-update"
          aria-label={phase === 'waiting' ? L('upd_sr') : L('upd_updating')}
          aria-disabled={phase === 'updating' ? 'true' : undefined}
          onClick={() => startUpdate()}
        >
          <Icon name="refresh" cls={phase === 'updating' ? 'turn' : ''} />
          <span>{phase === 'updating' ? L('upd_updating') : L('upd_bar')}</span>
        </button>
      )}
      {phase !== 'updating' && (
        <button type="button" class="iconbtn sq" data-testid="update-later" aria-label={L('upd_later')} onClick={() => (updHidden.value = true)}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

const WN_ROWS: [IconName | M5IconName, LaunchKey][] = [
  ['bus', 'wn_1'],
  ['leaf', 'wn_2'],
  ['wifi-off', 'wn_3'],
];

/** What's new (once per device after updating to 1.0.0). One action; Back = Got it. */
export function WhatsNewSheet() {
  const { router } = useServices();
  const L = useLT();
  useEffect(() => {
    whatsNewShown();
    const id = setTimeout(() => {
      const h = document.getElementById('whatsnew-title');
      if (!h) return;
      h.setAttribute('tabindex', '-1');
      h.focus();
    });
    return () => {
      clearTimeout(id);
      // Back to H1's search button.
      setTimeout(() => document.querySelector<HTMLElement>('[data-testid="to-field"]')?.focus());
    };
  }, []);
  return (
    <Sheet id="whatsnew" title={L('wn_title')} close={false}>
      <ul class="wnlist">
        {WN_ROWS.map(([icon, k]) => (
          <li key={k}>
            <span class="wnic" aria-hidden="true">
              {icon in M5_PATHS ? <M5Icon name={icon as M5IconName} /> : <Icon name={icon as IconName} />}
            </span>
            <span>{L(k)}</span>
          </li>
        ))}
      </ul>
      <button type="button" class="btn btn-primary" data-testid="whatsnew-ok" onClick={() => router.closeSheet()}>
        {L('wn_ok')}
      </button>
    </Sheet>
  );
}

/* ---------- L4 ---------- */

function CopyLinkButton({ toast, testid }: { toast: LaunchKey; testid: string }) {
  const L = useLT();
  return (
    <button
      type="button"
      class="btn btn-primary"
      data-testid={testid}
      onClick={async () => {
        if (await copyRoot()) showToast('copied', L(toast));
      }}
    >
      <Icon name="copy" />
      {L('saf_copy')}
    </button>
  );
}

/** Home install card: L4a (Android prompt / steps), L4b (iOS picture guide), L4c (other iOS → Safari). */
export function InstallCard({ variant }: { variant: InstallVariant }) {
  const { router } = useServices();
  const t = useT();
  const L = useLT();
  const st = installState.value;
  useEffect(() => log('install:shown'), []);
  const safari = variant === 'ios-safari';
  const primary =
    variant === 'android-prompt' ? (
      <button
        type="button"
        class="btn btn-primary"
        data-testid="install-go"
        onClick={async () => {
          if (await promptInstall()) {
            markInstalled();
            log('install:accepted');
            showToast('installed', t('toast_installed'));
          } else dismissInstall();
        }}
      >
        <Icon name="install" />
        {L('inst_add')}
      </button>
    ) : safari ? (
      <CopyLinkButton toast="saf_toast" testid="install-go" />
    ) : (
      <button
        type="button"
        class="btn btn-primary"
        data-testid="install-go"
        onClick={() => (variant === 'android-steps' ? router.openSheet('install') : router.openSheet('install-guide', variant))}
      >
        {L('inst_how')}
      </button>
    );
  return (
    <section class="instcard" data-testid="install-card" data-variant={variant} aria-labelledby="instcard-t">
      <span class="tilei" aria-hidden="true">
        <Icon name="install" />
      </span>
      <h2 id="instcard-t" class="t-headline">
        {t('inst_t')}
      </h2>
      <p>{safari ? L('saf_b') : t('inst_b')}</p>
      {safari && <NumSteps items={[L('saf_1'), L('saf_2'), L('saf_3')]} />}
      {primary}
      <button type="button" class="btn btn-quiet" data-testid="install-later" onClick={() => dismissInstall()}>
        {L('inst_not_now')}
      </button>
      {st.dismissals === 1 && <p class="t-caption">{L('inst_later_settings')}</p>}
    </section>
  );
}

const Pic = ({ svg }: { svg: string }) => <div class="igpic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;

/** L4b three-step picture guide (iOS Safari; Chrome/Edge on iOS ≥ 16.4 get their own step-1 hint). */
export function InstallGuideSheet() {
  const { router, store } = useServices();
  const t = useT();
  const L = useLT();
  const variant = (router.sheetData.value as InstallVariant | undefined) ?? 'ios-guide';
  const zh = store.settings.value.lang === 'zh';
  const chrome = variant === 'ios-guide-chrome';
  const hint: LaunchKey = chrome ? 'ig_1_chrome' : variant === 'ios-guide-edge' ? 'ig_1_edge' : 'ig_1_safari';
  return (
    <Sheet id="install-guide" title={L('ig_title')}>
      <ol class="numsteps iguide">
        <li>
          <div>
            <p>{t('inst_ios_1')}</p>
            <Pic svg={chrome ? step1Chrome : step1Safari} />
            <p class="t-caption">{L(hint)}</p>
          </div>
        </li>
        <li>
          <div>
            <p>{t('inst_ios_2')}</p>
            <Pic svg={zh ? step2Zh : step2En} />
          </div>
        </li>
        <li>
          <div>
            <p>{t('inst_ios_3')}</p>
            <Pic svg={zh ? step3Zh : step3En} />
          </div>
        </li>
      </ol>
      <button type="button" class="btn btn-primary" data-testid="guide-ok" onClick={() => router.closeSheet()}>
        {L('ig_ok')}
      </button>
    </Sheet>
  );
}

/** L4d: "Works best in your browser" band at the very top of H1 (in-app browsers only). */
export function IabBar({ os }: { os: UaOs }) {
  const { router } = useServices();
  const L = useLT();
  const [copy, setCopy] = useState(false);
  useEffect(() => log('install:shown'), []);
  const openChrome = () => {
    log('install:accepted');
    location.href = chromeIntentUrl(location.origin);
    // Still here after 1.5 s (no Chrome, or the in-app browser blocked the intent) → offer Copy link instead.
    setTimeout(() => document.visibilityState === 'visible' && setCopy(true), 1500);
  };
  return (
    <div class="iab" role="region" aria-label={L('iab_region')} data-testid="iab-bar" data-os={os}>
      <M5Icon name="open-browser" />
      <span class="iabtx">{L('iab_text')}</span>
      {os === 'ios' ? (
        <button type="button" class="btn btn-secondary small" data-testid="iab-how" onClick={() => router.openSheet('iab-help')}>
          {L('iab_how')}
        </button>
      ) : copy ? (
        <button
          type="button"
          class="btn btn-secondary small"
          data-testid="iab-copy"
          onClick={async () => {
            if (await copyRoot()) showToast('copied', L('iab_copy_toast'));
          }}
        >
          <Icon name="copy" />
          {L('saf_copy')}
        </button>
      ) : (
        <button type="button" class="btn btn-secondary small" data-testid="iab-chrome" onClick={openChrome}>
          {L('iab_chrome')}
        </button>
      )}
      <button type="button" class="iconbtn sq" data-testid="iab-later" aria-label={L('iab_later')} onClick={hideIab}>
        <Icon name="close" />
      </button>
    </div>
  );
}

/** L4d iOS "How?" sheet: the ⋯ menu first, then the L4c copy-link steps. */
export function IabHelpSheet() {
  const L = useLT();
  return (
    <Sheet id="iab-help" title={L('iabs_title')}>
      <p class="lead">{L('iabs_1')}</p>
      <h3 class="t-headline iabhow">{L('iabs_2')}</h3>
      <NumSteps items={[L('saf_1'), L('saf_2'), L('saf_3')]} />
      <CopyLinkButton toast="saf_toast" testid="iab-sheet-copy" />
    </Sheet>
  );
}
