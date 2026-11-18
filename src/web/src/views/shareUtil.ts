/**
 * Share helpers used by the eager Help sheet and by the lazy share screens (M5 AC 3: Help must not pull the
 * share sheets into the entry chunk). share.tsx re-exports them.
 */
import { log } from '../log';
import { family, waDigits, type Contact } from '../state/family';
import { showToast } from '../ui/kit';

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

/** Who the current share was sent to (for pill copy); session memory only. */
let sharedWith: string | null = null;
export const sharedWithName = () => sharedWith;
/** Help's "let family see me" row (QA-37) sends the trip share to the first contact. */
export const setSharedWith = (name: string | null) => void (sharedWith = name);
