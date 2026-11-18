/** F5 app-level toasts: updated (after an SW update), offline / online (suppressed if the drop lasts < 3 s), installed. */
import { effect } from '@preact/signals';
import { online } from '../api/offline';
import type { TFn } from '../context';
import { justUpdated } from '../pwa/register';
import { whatsNew } from '../pwa/whatsnew';
import { showToast, toast } from './kit';

export const FLAP_MS = 3000;
let wired = false;
let tr: TFn = (k) => k;

export function connectivityToasts(t: TFn): void {
  tr = t;
  if (wired) return;
  wired = true;
  let offTimer: ReturnType<typeof setTimeout> | undefined;
  let shownOffline = false;
  let wasOffline = !online.peek();
  effect(() => {
    const on = online.value;
    if (!on && !wasOffline) {
      wasOffline = true;
      offTimer = setTimeout(() => {
        shownOffline = true;
        showToast('offline', tr('toast_offline'));
      }, FLAP_MS);
    } else if (on && wasOffline) {
      wasOffline = false;
      clearTimeout(offTimer);
      if (shownOffline) showToast('online', tr('toast_online'));
      else if (toast.peek()?.id === 'offline') toast.value = null;
      shownOffline = false;
    }
  });
  effect(() => {
    // M5 L3: the first launch on 1.0.0 shows What's new instead (no toast on top of a sheet).
    if (justUpdated.value && !whatsNew.peek()) showToast('updated', tr('toast_updated'));
  });
  addEventListener('appinstalled', () => showToast('installed', tr('toast_installed')));
}
