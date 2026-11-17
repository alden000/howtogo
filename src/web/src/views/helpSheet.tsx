/**
 * Help, full (STYLE-GUIDE 6e.3, M4 AC 32–38): call the first family contact (tel:, the dialer is the
 * confirmation), show the driver, where am I, find my way again / take me home, 995 with a confirm.
 * While sharing, calling family or confirming 995 also sets the share's `help` status (D-7).
 * Plus the taxi hand-off (6e.6) shown under the H10 address card.
 */
import { useEffect, useState } from 'preact/hooks';
import type { UiKey } from '../i18n/ui';
import { useServices, useT } from '../context';
import { log } from '../log';
import { family } from '../state/family';
import { Icon, Sheet, showToast } from '../ui/kit';
import { openExternal } from './share';
import { DemoControls } from './tripSheets';

export function HelpSheet() {
  const { router, store, runtime, platform } = useServices();
  const t = useT();
  const trip = store.trip.value;
  const guiding = !!trip && runtime.ui.value.phase === 'guiding';
  const sharing = !!trip?.share;
  const contacts = family.contacts.value;
  const first = contacts[0];
  useEffect(() => void platform.vibrate('tick'), []);
  const setHelp = () => {
    if (sharing && trip?.share?.status !== 'help') runtime.help();
  };
  return (
    <Sheet id="help" title={t('help_t')}>
      <div class="opts">
        {first ? (
          <button
            type="button"
            class="opt"
            data-testid="help-call"
            onClick={() => {
              setHelp();
              void platform.vibrate('confirm');
              router.closeSheet();
              openExternal(`tel:${first.phone}`);
            }}
          >
            <span class="ic" style={{ background: 'var(--c-jade)', color: 'var(--c-on-jade)' }} aria-hidden="true">
              <Icon name="phone" />
            </span>
            <span class="tx">
              <b>{t('hp_call', { fam: first.name })}</b>
              <span>{sharing ? t('hp_call_s_sharing', { fam: first.name }) : t('hp_call_s', { rel: t(`rel_${first.relation}` as UiKey) })}</span>
            </span>
          </button>
        ) : (
          <button type="button" class="opt" data-testid="help-add" onClick={() => router.navigate('/family/edit')}>
            <span class="ic" style={{ background: 'var(--c-jade)', color: 'var(--c-on-jade)' }} aria-hidden="true">
              <Icon name="plus" />
            </span>
            <span class="tx">
              <b>{t('hp_add')}</b>
            </span>
            <Icon name="chev" />
          </button>
        )}
        {contacts.length > 1 && (
          <button type="button" class="opt" data-testid="help-call-other" onClick={() => router.navigate('/family')}>
            <span class="ic" style={{ background: 'var(--c-surface-2)' }} aria-hidden="true">
              <Icon name="family" />
            </span>
            <span class="tx">
              <b>{t('hp_call_other')}</b>
            </span>
            <Icon name="chev" />
          </button>
        )}
        <button type="button" class="opt" data-testid="help-driver" onClick={() => router.openSheet('driver', { tab: trip ? 'dest' : 'home' })}>
          <span class="ic" style={{ background: 'var(--c-saffron)', color: 'var(--c-on-saffron)' }} aria-hidden="true">
            <Icon name="car" />
          </span>
          <span class="tx">
            <b>{t('show_addr')}</b>
            <span>{t('hp_driver_s')}</span>
          </span>
          <Icon name="chev" />
        </button>
        <button type="button" class="opt" data-testid="help-where" onClick={() => router.openSheet('driver', { tab: 'here' })}>
          <span class="ic" style={{ background: 'var(--c-primary-soft)', color: 'var(--c-on-primary-soft)' }} aria-hidden="true">
            <Icon name="loc" />
          </span>
          <span class="tx">
            <b>{t('where_am_i')}</b>
            <span>{t('where_am_i_s')}</span>
          </span>
          <Icon name="chev" />
        </button>
        {guiding ? (
          <button
            type="button"
            class="opt"
            data-testid="help-reroute"
            onClick={() => {
              router.closeSheet();
              void runtime.reroute();
            }}
          >
            <span class="ic" style={{ background: 'var(--c-surface-2)' }} aria-hidden="true">
              <Icon name="route" />
            </span>
            <span class="tx">
              <b>{t('find_again')}</b>
              <span>{t('find_again_s')}</span>
            </span>
            <Icon name="chev" />
          </button>
        ) : (
          !trip &&
          store.places.value.home && (
            <button
              type="button"
              class="opt"
              data-testid="help-home"
              onClick={() => {
                const home = store.places.peek().home!;
                store.setPlan({ from: null, to: home, options: [], selected: 0 });
                router.closeSheet();
                router.navigate('/routes');
              }}
            >
              <span class="ic" style={{ background: 'var(--c-surface-2)' }} aria-hidden="true">
                <Icon name="home" />
              </span>
              <span class="tx">
                <b>{t('hp_home')}</b>
              </span>
              <Icon name="chev" />
            </button>
          )
        )}
        <button type="button" class="btn btn-danger-outline" data-testid="help-995" onClick={() => router.openSheet('confirm-995')}>
          <Icon name="phone" />
          {t('hp_995')}
        </button>
      </div>
      {guiding && <DemoControls />}
    </Sheet>
  );
}

/** 995 confirm (6e.3): the only c-danger fill in the app. Back = No. */
export function Confirm995Sheet() {
  const { router, store, runtime } = useServices();
  const t = useT();
  return (
    <Sheet id="confirm-995" title={t('hp_995_t')}>
      <p class="t-body">{t('hp_995_b')}</p>
      <div class="stack">
        <a
          class="btn btn-danger btn-hero"
          href="tel:995"
          data-testid="call-995"
          onClick={() => {
            const tr = store.trip.peek();
            if (tr?.share && tr.share.status !== 'help') runtime.help();
            log('help:995');
          }}
        >
          <Icon name="phone" />
          {t('hp_995_go')}
        </a>
        <button type="button" class="btn btn-secondary" data-testid="no-995" onClick={() => router.closeSheet()}>
          {t('hp_995_no')}
        </button>
      </div>
    </Sheet>
  );
}

/** Trip note while help is showing on family's page (6e.3): "I'm okay now" → travelling. */
export function HelpNote() {
  const { store, runtime } = useServices();
  const t = useT();
  const s = store.trip.value?.share;
  if (s?.status !== 'help') return null;
  const fam = family.contacts.value[0]?.name ?? t('sh_family_fb');
  return (
    <div class="tripnote helpnote" role="status" data-testid="help-note">
      <Icon name="help" />
      <div class="tx">
        <b>{t('hp_note', { fam })}</b>
      </div>
      <button
        type="button"
        class="btn btn-secondary"
        data-testid="help-ok"
        onClick={() => {
          runtime.clearHelp();
          showToast('help-ok', t('hp_ok_toast', { fam }));
        }}
      >
        {t('hp_ok')}
      </button>
    </div>
  );
}

const GRAB_ANDROID = 'intent://open#Intent;scheme=grab;package=com.grabtaxi.passenger;S.browser_fallback_url=https%3A%2F%2Fwww.grab.com%2Fsg%2Ftransport%2F;end';
const CDG_ZIG = 'https://www.cdgtaxi.com.sg/';

/** 6e.6 taxi hand-off under the address card: Grab (app if installed), CDG Zig, call (number unverified → hidden, OQ10). */
export function TaxiButtons() {
  const t = useT();
  const [noGrab, setNoGrab] = useState(false);
  const grab = () => {
    log('taxi:grab');
    const android = /Android/i.test(navigator.userAgent);
    if (android) return void (location.href = GRAB_ANDROID);
    const t0 = Date.now();
    location.href = 'grab://';
    setTimeout(() => {
      if (document.visibilityState === 'visible' && Date.now() - t0 < 3000) setNoGrab(true);
    }, 1500);
  };
  return (
    <div class="stack" data-testid="taxi" style={{ marginTop: '16px' }}>
      <button type="button" class="btn btn-secondary" data-testid="taxi-grab" onClick={grab}>
        <Icon name="car" />
        {t('tx_grab')}
      </button>
      {noGrab && (
        <p class="t-caption" role="status" data-testid="taxi-nograb">
          {t('tx_nograb')}
        </p>
      )}
      <button type="button" class="btn btn-secondary" data-testid="taxi-cdg" onClick={() => openExternal(CDG_ZIG)}>
        <Icon name="car" />
        {t('tx_cdg')}
      </button>
      <p class="t-caption" style={{ display: 'flex', gap: '8px' }}>
        <Icon name="info" />
        {t('tx_note')}
      </p>
    </div>
  );
}

/** M4 AC 36: no address (offline / no result) → plain coordinates to show someone. */
export function HereFallback({ lat, lng }: { lat: number; lng: number }) {
  const t = useT();
  return (
    <p class="t-headline num" data-testid="here-coords">
      {lat.toFixed(4)}, {lng.toFixed(4)}
      <span class="t-caption" style={{ display: 'block' }}>
        {t('hp_coords')}
      </span>
    </p>
  );
}

/** 6e.3: H10 "here" tab → WhatsApp to the first contact with the address and a maps link. */
export function SendMyLocation({ place }: { place: { name: string; lat: number; lng: number; address?: string } }) {
  const t = useT();
  const fam = family.contacts.value[0];
  if (!fam) return null;
  const maps = `https://maps.google.com/?q=${place.lat.toFixed(5)},${place.lng.toFixed(5)}`;
  const msg = t('hp_loc_msg', { a: place.address ?? place.name, u: maps });
  return (
    <button type="button" class="btn btn-secondary" style={{ marginTop: '12px' }} data-testid="send-my-location" onClick={() => openExternal(`https://wa.me/${fam.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`)}>
      <Icon name="msg" />
      {t('hp_sendloc', { fam: fam.name })}
    </button>
  );
}
