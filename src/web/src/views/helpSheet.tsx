/**
 * Help, full (STYLE-GUIDE 6e.3, M4 AC 32–38): call the first family contact (tel:, the dialer is the
 * confirmation), show the driver, where am I, find my way again / take me home, 995 with a confirm.
 * While sharing, calling family or confirming 995 also sets the share's `help` status (D-7).
 * Plus the taxi hand-off (6e.6) shown under the H10 address card.
 */
import { useEffect, useState } from 'preact/hooks';
import { tf, type UiKey } from '../i18n/ui';
import { useServices, useT } from '../context';
import { log } from '../log';
import { online } from '../api/offline';
import { isApiError } from '../api/errors';
import { family, type Contact } from '../state/family';
import { helpShare } from '../state/helpShare';
import { here } from '../state/location';
import { Icon, Sheet, showToast } from '../ui/kit';
import { afterSend, openExternal, senderFor, setSharedWith, waUrl } from './share';
import { DemoControls } from './tripSheets';

export function HelpSheet() {
  const { router, store, runtime, platform } = useServices();
  const t = useT();
  const trip = store.trip.value;
  const guiding = !!trip && runtime.ui.value.phase === 'guiding';
  const sharing = !!trip?.share;
  const contacts = family.contacts.value;
  const first = contacts[0];
  const offline = !online.value;
  // QA-37: the share entry point (6e.1) shows only while nothing is shared (trip share or help-only share).
  const canShare = !sharing && !(helpShare.current.value && !trip);
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
              {/* QA-39 (AC 38): rows that need the network say so instead of failing silently. */}
              <span>{offline ? t('hp_needs_net') : t('find_again_s')}</span>
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
        {canShare && <HelpShareRow first={first ?? null} offline={offline} />}
        <button type="button" class="btn btn-danger-outline" data-testid="help-995" onClick={() => router.openSheet('confirm-995')}>
          <Icon name="phone" />
          {t('hp_995')}
        </button>
      </div>
      {guiding && <DemoControls />}
    </Sheet>
  );
}

/**
 * QA-37 (M4 AC 35, Director ruling 2026-11-18): "让家人看到我在哪里" — Help's share entry point while not
 * sharing (6e.1). On a trip: start the trip's share with status `help`. Not on a trip: a help-only share
 * ("我在这里", the position now). Then WhatsApp to the first contact with "我需要帮忙，我在这里：<link>".
 * Offline, rate-limited or failed create (AC 47): WhatsApp still opens, with a plain "我需要帮忙" + the
 * Where-am-I address (or coordinates) and a maps link.
 */
function HelpShareRow({ first, offline }: { first: Contact | null; offline: boolean }) {
  const { store, router, runtime, platform, api } = useServices();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    const lang = first?.lang ?? store.settings.peek().lang;
    const sender = senderFor(first, store.settings.peek().name);
    try {
      if (!online.peek()) throw new Error('offline');
      const trip = store.trip.peek();
      let viewPath: string;
      if (trip) {
        const s = await runtime.startShare({ ...sender, help: true });
        if (!s) throw new Error('no share');
        viewPath = s.viewPath;
      } else {
        const fix = await platform.location.current().catch(() => null);
        const pos = fix ?? here.peek();
        const s = await helpShare.start(api, { destName: tf(lang, 'hp_here_dest'), lang, ...sender }, first?.name ?? null, pos);
        viewPath = s.viewPath;
      }
      setSharedWith(first?.name ?? null);
      const url = new URL(viewPath, location.origin).toString();
      openExternal(waUrl(tf(lang, 'hp_share_msg', { url }), first));
      afterSend(first ? t('sh_sent', { fam: first.name }) : t('sh_sent_any'));
    } catch (e) {
      log(`state:help-share-${isApiError(e) && e.status === 429 ? 'limited' : 'failed'}`);
      openExternal(waUrl(await plainHelp(lang), first));
    } finally {
      setBusy(false);
      void platform.vibrate('confirm');
      router.closeSheet();
    }
  };
  /** AC 47 fallback text: the Where-am-I address when known, else coordinates, else just "I need help". */
  const plainHelp = async (lang: 'zh' | 'en') => {
    const h = here.peek() ?? (await platform.location.current().then((f) => ({ ...f, label: null as string | null, address: undefined as string | undefined })).catch(() => null));
    if (!h) return tf(lang, 'hp_need_help');
    const a = h.address?.replace(/\s*Singapore\s*\d{6}$/i, '') || h.label || `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`;
    return tf(lang, 'hp_share_plain', { a, u: `https://maps.google.com/?q=${h.lat.toFixed(5)},${h.lng.toFixed(5)}` });
  };
  return (
    <button type="button" class="opt" data-testid="help-share-loc" aria-busy={busy} disabled={busy} onClick={() => void go()}>
      <span class="ic" style={{ background: 'var(--c-jade-soft)', color: 'var(--c-on-jade-soft)' }} aria-hidden="true">
        {busy ? <span class="spin" /> : <Icon name="share" />}
      </span>
      <span class="tx">
        <b>{t('hp_share')}</b>
        <span>{offline ? t('hp_needs_net') : first ? t('hp_share_s', { fam: first.name }) : t('hp_share_s_any')}</span>
      </span>
      <Icon name="chev" />
    </button>
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

/**
 * Note while help is showing on family's page (6e.3): "I'm okay now". Trip share → back to travelling.
 * Help-only share (QA-37, not on a trip; shown on Home) → the share ends (AC 35).
 */
export function HelpNote() {
  const { store, runtime, api, platform } = useServices();
  const t = useT();
  const trip = store.trip.value;
  const s = trip?.share;
  const hs = !trip ? helpShare.current.value : null;
  if (s?.status !== 'help' && !hs) return null;
  const fam = (hs ? hs.fam : null) ?? family.contacts.value[0]?.name ?? t('sh_family_fb');
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
          void platform.vibrate('confirm');
          if (hs) {
            void helpShare.end(api);
            showToast('help-ok', t('sh_stopped', { fam }));
          } else {
            runtime.clearHelp();
            showToast('help-ok', t('hp_ok_toast', { fam }));
          }
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
