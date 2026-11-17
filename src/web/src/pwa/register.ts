/**
 * Service-worker registration + update flow exposed to the UI:
 *   updateReady (signal) → show "已更新 / Update ready" → applyUpdate() activates and reloads.
 *   justUpdated (signal) → true for one launch after an update (calm "Updated" toast, M1 AC 4).
 * Also: cache/clear the active trip's corridor tiles for offline use.
 */
import { signal } from '@preact/signals';
import { log } from '../log';
import { session } from '../state/storage';

export const updateReady = signal(false);
export const justUpdated = signal(false);
let waiting: ServiceWorker | null = null;

export async function registerServiceWorker(url = '/sw.js'): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (session.get('sw.updated') === '1') {
    session.remove('sw.updated');
    justUpdated.value = true;
    log('sw:updated');
  }
  try {
    const reg = await navigator.serviceWorker.register(url);
    const hadController = !!navigator.serviceWorker.controller;
    const track = (w: ServiceWorker | null) => {
      if (!w) return;
      const check = () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          waiting = w;
          updateReady.value = true;
          log('sw:update-ready');
        }
      };
      w.addEventListener('statechange', check);
      check();
    };
    track(reg.waiting);
    reg.addEventListener('updatefound', () => track(reg.installing));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return; // first install claiming the page: no reload
      session.set('sw.updated', '1');
      location.reload();
    });
    // Check for a new deploy on each launch and when returning to the app.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update().catch(() => {}));
    log('sw:registered');
  } catch {
    log('sw:failed');
  }
}

/** Activate the waiting service worker; the page reloads on controllerchange. */
export function applyUpdate(): void {
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export function cacheTripTiles(urls: string[]): void {
  navigator.serviceWorker?.controller?.postMessage({ type: 'TRIP_TILES', urls });
}

export function clearTripTiles(): void {
  navigator.serviceWorker?.controller?.postMessage({ type: 'TRIP_TILES_CLEAR' });
}
