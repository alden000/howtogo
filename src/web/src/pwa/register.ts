/**
 * Service-worker registration + update flow exposed to the UI:
 *   updateReady (signal) → a new build is installed and waiting.
 *   updateBar (signal, M5 AC 17) → show the bar "有新版本 · 点这里更新 / New version · tap to update" now:
 *     updateReady AND the app is not busy (no active trip / active share — `setUpdateGuard`). It is never true
 *     during a trip, so the bar can never appear there, and nothing reloads by itself.
 *   applyUpdate() → activates the waiting SW; the page reloads ONCE on controllerchange (state is in storage).
 *     If the controller changes while busy (e.g. another tab applied the update), the reload is deferred
 *     until the guard says idle (`pendingReload`, then `releaseDeferredReload()`).
 *   justUpdated (signal) → true for one launch after an update (calm "Updated" toast, M1 AC 4).
 * Log hooks: `sw:update-ready`, `sw:update-deferred`, `sw:reload`, `sw:updated`, `sw:failed`.
 * Also: cache/clear the active trip's corridor tiles for offline use.
 */
import { computed, signal } from '@preact/signals';
import { log } from '../log';
import { session } from '../state/storage';

export const updateReady = signal(false);
export const justUpdated = signal(false);
/** True while the app must not reload or offer an update (active trip or share). Set by `setUpdateGuard`. */
export const updateBusy = signal(false);
/** M5 AC 17c: show the update bar (UI round renders it on Home and Settings only). */
export const updateBar = computed(() => updateReady.value && !updateBusy.value);
/** A new SW took control while busy: reload as soon as the app is idle. */
export const pendingReload = signal(false);
let waiting: ServiceWorker | null = null;
let reloading = false;

/** Feeds `updateBusy` (main.tsx: effect on the store's trip + help share). Releases a deferred reload when idle. */
export function setUpdateGuard(busy: boolean): void {
  updateBusy.value = busy;
  if (!busy && pendingReload.peek()) releaseDeferredReload();
}

function reloadOnce(): void {
  if (reloading) return;
  reloading = true;
  session.set('sw.updated', '1');
  log('sw:reload');
  location.reload();
}

/** Reload now if a controller change was deferred during a trip/share. */
export function releaseDeferredReload(): void {
  if (!pendingReload.peek() || updateBusy.peek()) return;
  pendingReload.value = false;
  reloadOnce();
}

/** Pure decision for a controller change (exported for tests). */
export function onControllerChange(hadController: boolean, busy: boolean): 'ignore' | 'defer' | 'reload' {
  if (!hadController) return 'ignore'; // first install claiming the page: no reload
  return busy ? 'defer' : 'reload';
}

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
      const d = onControllerChange(hadController, updateBusy.peek());
      if (d === 'defer') {
        pendingReload.value = true;
        log('sw:update-deferred');
      } else if (d === 'reload') reloadOnce();
    });
    // Check for a new deploy on each launch and when returning to the app.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update().catch(() => {}));
    log('sw:registered');
  } catch {
    log('sw:failed');
  }
}

/** Activate the waiting service worker; the page reloads on controllerchange. Ignored while busy (AC 17b). */
export function applyUpdate(): void {
  if (updateBusy.peek()) return;
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export function cacheTripTiles(urls: string[]): void {
  navigator.serviceWorker?.controller?.postMessage({ type: 'TRIP_TILES', urls });
}

export function clearTripTiles(): void {
  navigator.serviceWorker?.controller?.postMessage({ type: 'TRIP_TILES_CLEAR' });
}
