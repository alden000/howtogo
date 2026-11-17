/**
 * Live LTA data on the client (M3 AC 7, 18, 30): alerts (cached 60 s; app open, search, H4, every
 * 2 min in a trip with rail ahead), lifts (5 min), and bus arrivals polled every 20 s only while a
 * chip is on screen, the page is visible and online, and not in pocket view. One request per stop.
 * Live data is a hint, never a guard: nothing here touches guidance.
 */
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import type { Alerts, Api, BusArrival, Lifts } from '../api/types';
import { log } from '../log';
import { online } from '../api/offline';

export const alerts = signal<Alerts | null>(null);
export const lifts = signal<Lifts | null>(null);
let alertsAt = 0;
let alertsReq: Promise<void> | null = null;
let liftsAt = 0;
let lastAlertHook = '';

export const ALERTS_CACHE_MS = 60_000;
export const LIFTS_CACHE_MS = 5 * 60_000;
export const BUS_POLL_MS = 20_000;
export const ALERTS_TRIP_MS = 2 * 60_000;

export function refreshAlerts(api: Api, force = false): Promise<void> {
  if (!online.peek()) return Promise.resolve();
  if (!force && Date.now() - alertsAt < ALERTS_CACHE_MS) return Promise.resolve();
  alertsReq ??= api
    .alerts()
    .then((a) => {
      alerts.value = a;
      alertsAt = Date.now();
      const h = `alerts:${a.status}`;
      if (h !== lastAlertHook) log((lastAlertHook = h));
    })
    .catch(() => {
      // 503/502/offline: no banner (never stale or invented data)
      alertsAt = Date.now();
    })
    .finally(() => (alertsReq = null));
  return alertsReq;
}

export function refreshLifts(api: Api): void {
  if (!online.peek() || Date.now() - liftsAt < LIFTS_CACHE_MS) return;
  liftsAt = Date.now();
  api
    .lifts()
    .then((l) => {
      lifts.value = l;
      log(`lifts:${l.lifts.length} listed`);
    })
    .catch(() => (lifts.value = null));
}

/** Tests: forget caches. */
export function resetLive() {
  alerts.value = null;
  lifts.value = null;
  alertsAt = liftsAt = 0;
}

// ---------------------------------------------------------------- bus arrivals
const inflight = new Map<string, Promise<BusArrival>>();
function fetchStop(api: Api, stop: string): Promise<BusArrival> {
  let p = inflight.get(stop);
  if (!p) {
    p = api.busArrival(stop).finally(() => inflight.delete(stop));
    inflight.set(stop, p);
  }
  return p;
}

/**
 * Arrival data for one stop while `active` (chip on screen, not pocket). Polls every 20 s while the
 * page is visible and online. `null` until the first answer; `'error'` after a failure (no data).
 */
export function useBusArrival(api: Api, stop: string | undefined, active: boolean): BusArrival | null | 'error' {
  const [data, setData] = useState<BusArrival | null | 'error'>(null);
  useEffect(() => {
    if (!stop || !active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (stopped) return;
      if (document.visibilityState === 'visible' && online.peek())
        fetchStop(api, stop)
          .then((a) => !stopped && setData(a))
          .catch(() => !stopped && setData('error'));
      timer = setTimeout(tick, BUS_POLL_MS);
    };
    tick();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [stop, active]);
  return data;
}

/** Re-render every `ms` (freshness text). */
export function useNow(ms: number): number {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}
