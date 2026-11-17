/**
 * Offline-aware wrapper: while the device reports offline, calls fail fast with
 * `ApiError('offline')` instead of hanging until a timeout (the service worker
 * still answers cached GETs when the browser is merely flaky). The live socket
 * is passed through — it reconnects on its own.
 */
import { signal } from '@preact/signals';
import { log } from '../log';
import { ApiError } from './errors';
import type { Api } from './types';

export const online = signal(typeof navigator === 'undefined' ? true : navigator.onLine !== false);

export function watchOnline(win: Window = window): () => void {
  const set = (v: boolean) => {
    online.value = v;
    log(`online:${v ? 1 : 0}`);
  };
  const on = () => set(true);
  const off = () => set(false);
  win.addEventListener('online', on);
  win.addEventListener('offline', off);
  return () => {
    win.removeEventListener('online', on);
    win.removeEventListener('offline', off);
  };
}

export function offlineAware(api: Api, isOnline: () => boolean = () => online.value): Api {
  const guard =
    <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
    (...a: A): Promise<R> =>
      isOnline() ? fn(...a) : Promise.reject(new ApiError('offline'));
  return {
    search: guard(api.search),
    route: guard(api.route),
    revgeocode: guard(api.revgeocode),
    busArrival: guard(api.busArrival),
    alerts: guard(api.alerts),
    lifts: guard(api.lifts),
    setupCreate: guard(api.setupCreate),
    setupGet: guard(api.setupGet),
    shareCreate: guard(api.shareCreate),
    sharePut: guard(api.sharePut),
    shareGet: guard(api.shareGet),
    shareDelete: guard(api.shareDelete),
    shareLive: api.shareLive,
  };
}
