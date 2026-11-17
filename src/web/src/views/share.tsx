/**
 * M4 share flow on the senior's phone (STYLE-GUIDE 6e.1): who → how (WhatsApp / SMS / Web Share /
 * copy), sharing pill states, sharing sheet (preview, send again, also someone else, stop).
 * Honest copy: we open the app with the message ready; we never claim family saw it.
 */
import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { useServices, useT, type TFn } from '../context';
import { log } from '../log';
import { family, waDigits, type Contact } from '../state/family';
import { Icon, Sheet, showToast } from '../ui/kit';
import { clock } from './present';
import { tf } from '../i18n/ui';
import { failKind, type FailKind } from '../api/errors';

/** Opens another app (wa.me, sms:, tel:, maps). One place so tests can stub `window.open`. */
export function openExternal(url: string) {
  const scheme = url.split(':')[0];
  log(`ext:${scheme === 'https' ? new URL(url).host : scheme}`);
  if (/^(tel|sms):/.test(url)) location.href = url;
  else window.open(url, '_blank', 'noopener');
}

export const waUrl = (msg: string, c: Contact | null) => (c ? `https://wa.me/${waDigits(c.phone)}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`);
export const smsUrl = (msg: string, c: Contact | null) => {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
  return `sms:${c?.phone ?? ''}${ios ? '&' : '?&'}body=${encodeURIComponent(msg)}`;
};

/** Sender fields for POST /api/share: what this contact calls the senior; phone only if allowed (OQ3). */
export function senderFor(c: Contact | null, greetingName: string): { senderName?: string; senderPhone?: string } {
  const p = family.prefs.peek();
  const name = (c?.callMe || greetingName).trim().slice(0, 40);
  return { ...(name ? { senderName: name } : {}), ...(p.sendPhone && p.myPhone ? { senderPhone: p.myPhone } : {}) };
}

/**
 * QA-46 (Director ruling 2026-11-18, M4 AC 5): no times in the message — a forwarded message must not leak a
 * schedule. Destination name + link only; the viewer page shows the live ETA instead.
 * Message language = the contact's (6e.4), which may differ from the UI language.
 */
function useShareMsg() {
  const { store } = useServices();
  return (url: string, lang: 'zh' | 'en', _t?: TFn) => {
    const trip = store.trip.peek();
    const dest = trip?.places[trip.places.length - 1]?.name ?? '';
    return tf(lang, 'sh_msg_not', { dest, url });
  };
}

/** Who the current share was sent to (for pill copy); session memory only. */
let sharedWith: string | null = null;
const famName = (t: TFn) => sharedWith ?? t('sh_family_fb');

type Channel = 'wa' | 'sms' | 'more' | 'copy';

/** P1 share sheet: step 1 (who) + step 2 (how); while sharing, the sharing sheet. */
export function ShareSheet() {
  const { store, router, runtime, platform } = useServices();
  const t = useT();
  const trip = store.trip.value;
  const share = trip?.share;
  const contacts = family.contacts.value;
  const data = (router.sheetData.value ?? {}) as { also?: boolean };
  const [pick, setPick] = useState<number>(contacts.length ? 0 : -1);
  const [busy, setBusy] = useState<Channel | null>(null);
  const [failed, setFailed] = useState<FailKind | null>(null);
  const msgOf = useShareMsg();
  const lang = store.settings.value.lang;
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  if (share && !data.also) return <SharingSheet />;

  const send = async (ch: Channel) => {
    const c = pick >= 0 ? (contacts[pick] ?? null) : null;
    setBusy(ch);
    setFailed(null);
    try {
      const s = store.trip.peek()?.share ?? (await runtime.startShare(senderFor(c, store.settings.peek().name)));
      if (!s) throw new Error('no trip');
      const url = new URL(s.viewPath, location.origin).toString();
      const msg = msgOf(url, c?.lang ?? lang, t);
      sharedWith = c?.name ?? null;
      log(`share:channel ${ch}`);
      if (ch === 'wa') openExternal(waUrl(msg, c));
      else if (ch === 'sms') openExternal(smsUrl(msg, c));
      else if (ch === 'more') await platform.share(url, msg);
      else {
        await navigator.clipboard?.writeText(url).catch(() => {});
        showToast('copied', t('sh_copied'));
      }
      router.closeSheet();
      void platform.vibrate('confirm');
      if (ch !== 'copy') afterSend(c ? t('sh_sent', { fam: c.name }) : t('sh_sent_any'));
    } catch (e) {
      setFailed(failKind(e));
      log('state:share-failed');
    } finally {
      setBusy(null);
    }
  };

  const btn = (ch: Channel, cls: string, icon: 'msg' | 'share' | 'copy' | null, label: string) => (
    <button type="button" class={cls} data-testid={`share-${ch}`} aria-busy={busy === ch} disabled={!!busy} onClick={() => void send(ch)}>
      {busy === ch ? <span class="spin" aria-hidden="true" /> : icon ? <Icon name={icon} /> : <WaIcon />}
      {busy === ch ? t('sh_preparing') : label}
    </button>
  );

  return (
    <Sheet id="share" title={t('sh_title')}>
      <p class="t-body">{t('sh_lead')}</p>
      <div role="radiogroup" aria-label={t('sh_title')} data-testid="share-who">
        {contacts.map((c, i) => (
          <button type="button" role="radio" class="radio" aria-checked={pick === i} data-testid={`share-contact-${i}`} onClick={() => setPick(i)}>
            <span class="av contact-av" aria-hidden="true">
              {[...c.name][0]}
            </span>
            <span class="tx">
              <b>{c.name}</b> <span>{t(`rel_${c.relation}`)}</span>
            </span>
            <RadioMark on={pick === i} />
          </button>
        ))}
        {!contacts.length && (
          <button type="button" class="radio dashed" data-testid="share-add" onClick={() => router.navigate('/family/edit')}>
            <Icon name="plus" />
            {t('sh_add')}
          </button>
        )}
        <button type="button" role="radio" class="radio" aria-checked={pick === -1} data-testid="share-someone" onClick={() => setPick(-1)}>
          <Icon name="person" />
          <span class="tx">{t('sh_someone')}</span>
          <RadioMark on={pick === -1} />
        </button>
      </div>
      {failed ? (
        <div class="statepanel" role="alert" data-testid="share-failed">
          <b>{t('sh_fail_t')}</b>
          {/* QA-45 (AC 47): a rate-limited create says "try again in a minute", not "check your internet". */}
          <p>{failed === 'rate' ? t('err_rate') : t('sh_fail_b')}</p>
          <button type="button" class="btn btn-primary" data-testid="share-retry" onClick={() => setFailed(null)}>
            {t('try_again')}
          </button>
          {pick >= 0 && contacts[pick] && (
            <button type="button" class="btn btn-secondary" data-testid="share-fail-call" onClick={() => openExternal(`tel:${contacts[pick]!.phone}`)}>
              <Icon name="phone" />
              {t('sh_call', { fam: contacts[pick]!.name })}
            </button>
          )}
        </div>
      ) : (
        <div class="stack" style={{ marginTop: '12px' }}>
          {btn('wa', 'btn btn-jade btn-hero', null, t('sh_wa'))}
          {btn('sms', 'btn btn-secondary', 'msg', t('sh_sms'))}
          {canShare && btn('more', 'btn btn-secondary', 'share', t('sh_more'))}
          {btn('copy', 'btn btn-quiet', 'copy', t('sh_copy'))}
        </div>
      )}
      <p class="t-caption" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Icon name="lock" />
        {t('sh_lock')}
      </p>
    </Sheet>
  );
}

/** Toast once we're back in the app (page visible again), or after a moment if it never left. */
export function afterSend(text: string) {
  let done = false;
  const show = () => {
    if (done) return;
    done = true;
    document.removeEventListener('visibilitychange', onVis);
    showToast('share-sent', text);
  };
  const onVis = () => document.visibilityState === 'visible' && show();
  document.addEventListener('visibilitychange', onVis);
  setTimeout(() => document.visibilityState === 'visible' && show(), 1200);
}

function WaIcon() {
  return <Icon name="msg" />;
}

/** Sharing sheet (tap pill / share control while sharing). Stop is one tap (6e.1). */
export function SharingSheet() {
  const { store, router, runtime, platform } = useServices();
  const t = useT();
  const share = store.trip.value?.share;
  if (!share) return null;
  const lang = store.settings.value.lang;
  const url = new URL(share.viewPath, location.origin).toString();
  const msgOf = useShareMsg();
  const first = family.contacts.value.find((c) => c.name === sharedWith) ?? null;
  return (
    <Sheet id="share" title={t('sh_sharing_t', { fam: famName(t) })}>
      <p class="t-body">{t('sh_sharing_lead', { t: share.expiresAt ? clock(Date.parse(share.expiresAt), lang) : '' })}</p>
      <div class="stack">
        <button type="button" class="btn btn-secondary" data-testid="share-preview" onClick={() => openExternal(url)}>
          <Icon name="eye" />
          {t('sh_preview')}
        </button>
        <button type="button" class="btn btn-secondary" data-testid="share-again" onClick={() => openExternal(waUrl(msgOf(url, first?.lang ?? lang, t), first))}>
          <Icon name="msg" />
          {t('sh_again')}
        </button>
        <button type="button" class="btn btn-secondary" data-testid="share-also" onClick={() => router.openSheet('share', { also: true })}>
          <Icon name="family" />
          {t('sh_also')}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          data-testid="share-stop"
          onClick={() => {
            const who = famName(t);
            void runtime.stopShare();
            router.closeSheet();
            void platform.vibrate('confirm');
            showToast('share-stopped', t('sh_stopped', { fam: who }));
          }}
        >
          <Icon name="close" />
          {t('sh_stop')}
        </button>
      </div>
    </Sheet>
  );
}

/** §6e.1 pill inside the H5 band (and pocket view). */
export function SharePill({ onOpen }: { onOpen: () => void }) {
  const { store, runtime } = useServices();
  const t = useT();
  const share = store.trip.value?.share;
  const ui = runtime.ui.value;
  useEffect(() => {
    if (ui.shareGone) showToast('share-gone', t('sh_gone'));
  }, [ui.shareGone]);
  if (!share) return null;
  const lang = store.settings.value.lang;
  const fam = famName(t);
  const state = share.status === 'help' ? 'help' : share.status === 'arrived' ? 'arrived' : ui.sharePaused ? 'paused' : 'sharing';
  const text =
    state === 'help' ? t('sh_pill_help', { fam })
    : state === 'arrived' ? t('sh_pill_arrived', { t: clock(Date.now() + 30 * 60_000, lang) })
    : state === 'paused' ? t('sh_pill_paused')
    : sharedWith ? t('sh_pill', { fam }) : t('sh_pill_any');
  return (
    <button type="button" class={`sharepill s-${state}`} data-testid="share-pill" data-state={state} aria-label={text + t('sh_pill_sr')} onClick={onOpen}>
      {state === 'sharing' && <span class="live" aria-hidden="true" />}
      {state === 'paused' && <Icon name="wifi-off" />}
      {state === 'help' && <Icon name="help" />}
      {state === 'arrived' && <Icon name="check" />}
      <span>{text}</span>
    </button>
  );
}

export const sharedWithName = () => sharedWith;
/** Help's "let family see me" row (QA-37) sends the trip share to the first contact. */
export const setSharedWith = (name: string | null) => void (sharedWith = name);

/** H12 (6e.1): honest lines — "{fam}'s page shows you've arrived" when shared; otherwise a one-off WhatsApp "I've arrived". */
export function ArrivedFamily({ shared, dest }: { shared: boolean; dest: string }) {
  const t = useT();
  const first = family.contacts.value[0] ?? null;
  const [told, setTold] = useState(false);
  const fam = sharedWith ?? first?.name ?? t('sh_family_fb');
  if (shared)
    return (
      <p class="t-body" data-testid="arrived-shared">
        <Icon name="check" /> {t('arr_shared', { fam })}
      </p>
    );
  if (told && first)
    return (
      <p class="t-body" data-testid="arrived-told">
        <Icon name="check" /> {t('arr_told', { fam: first.name })}
      </p>
    );
  return (
    <button
      type="button"
      class="btn btn-secondary"
      data-testid="arrived-tell"
      onClick={() => {
        openExternal(waUrl(t('arr_msg', { dest }), first));
        setTold(true);
      }}
    >
      <Icon name="msg" />
      {first ? t('arr_tell', { fam: first.name }) : t('arr_tell_any')}
    </button>
  );
}

/** H4 "Tell family before I go": Start, then the share sheet opens on H5 (see Guide). */
export const shareOnStart = signal(false);

/** Opens the share sheet once H5 is up after "Tell family before I go". */
export function useShareOnStart() {
  const { router } = useServices();
  useEffect(() => {
    if (!shareOnStart.peek()) return;
    shareOnStart.value = false;
    router.openSheet('share');
  }, []);
}

/** Review #6: the picked contact is not colour-only: a filled disc with a check; unpicked is an empty ring. */
function RadioMark({ on }: { on: boolean }) {
  return (
    <span class={`rmark${on ? ' on' : ''}`} aria-hidden="true">
      {on && <Icon name="check" />}
    </span>
  );
}
