/**
 * QA-37 (M4 AC 35, Director ruling 2026-11-18): Help → "让家人看到我在哪里" when NOT on a trip creates a
 * help-only share (destName "我在这里 / Where I am", status `help`) and the senior clears it with
 * "我没事了", which ends the share. On a trip the trip's own share is used instead (runtime.startShare
 * with `help`). The owner token stays on this phone only (localStorage, AC 50).
 *
 * Creative m34-fix-b H1 (Director ruling 2026-11-18): while it is live, the help-only share keeps sending
 * positions at the trip share's cadence (OQ7: 15 s when moved >= 20 m, 60 s when still, >= 3 s apart,
 * latest fix only, 429 Retry-After / 5-30 s backoff) until "我没事了" or `expiresAt` (`track`).
 */
import { effect, signal } from '@preact/signals';
import { haversine } from '@howtogo/shared';
import type { Api, ShareCreateBody, SharePut } from '../api/types';
import { isApiError } from '../api/errors';
import { log } from '../log';
import type { LocationFix, Platform, Unsubscribe } from '../platform/types';
import { SHARE_BACKOFF_MS, SHARE_MIN_INTERVAL_MS, SHARE_MOVE_M, SHARE_MOVING_MS, SHARE_STILL_MS, type Timers } from '../trip/runtime';
import { local, readJSON, writeJSON, type KV } from './storage';

export interface HelpShare {
  id: string;
  ownerToken: string;
  viewPath: string;
  expiresAt: string;
  /** Who the link was sent to (pill / note copy); null = someone else. */
  fam: string | null;
}

const KEY = 'helpshare.v1';
const valid = (v: unknown): v is HelpShare | null =>
  v === null || (typeof v === 'object' && !!v && typeof (v as HelpShare).id === 'string' && typeof (v as HelpShare).ownerToken === 'string' && typeof (v as HelpShare).viewPath === 'string');

const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as number),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id as number),
};

type Pos = { lat: number; lng: number; acc?: number };
const posBody = (p: Pos) => ({ lat: p.lat, lng: p.lng, acc: Math.max(1, Math.round(p.acc ?? 50)) });

export function createHelpShare(kv: KV = local, now: () => number = Date.now) {
  const stored = readJSON<HelpShare | null>(kv, KEY, null, valid);
  // An expired share is gone on the Worker too: forget it.
  const current = signal<HelpShare | null>(stored && Date.parse(stored.expiresAt) > now() ? stored : null);
  effect(() => writeJSON(kv, KEY, current.value));
  /** Last position sent (start() or the tracker), for the cadence. */
  let lastSent: { at: number; lat?: number; lng?: number } | null = null;

  /** Creative m34-fix-b M4: forget the share once `expiresAt` has passed (the Worker has ended it). */
  const dropIfExpired = () => {
    const s = current.peek();
    if (s && !(Date.parse(s.expiresAt) > now())) {
      log('share:help-only-expired');
      current.value = null;
    }
  };

  return {
    current,
    dropIfExpired,
    /** POST the help-only share, then PUT `help` (with the position when known). Throws if create fails. */
    async start(api: Api, body: ShareCreateBody, fam: string | null, pos?: Pos | null): Promise<HelpShare> {
      const c = await api.shareCreate(body);
      const s: HelpShare = { id: c.id, ownerToken: c.ownerToken, viewPath: c.viewPath, expiresAt: c.expiresAt, fam };
      lastSent = null;
      current.value = s;
      log('share:help-only');
      const t = now();
      await api
        .sharePut(c.id, c.ownerToken, { status: 'help', updatedAt: t, ...(pos ? posBody(pos) : {}) })
        .then(() => (lastSent = { at: t, ...(pos ? { lat: pos.lat, lng: pos.lng } : {}) }))
        .catch(() => {});
      return s;
    },
    /**
     * "我没事了" (Creative m34-fix-b M2): PUT `travelling` first (best effort) so family's page reads
     * "说自己没事了", then DELETE (offline → the Worker ends it at expiry).
     */
    async end(api: Api): Promise<void> {
      const s = current.peek();
      if (!s) return;
      current.value = null;
      log('share:help-only-ended');
      await api.sharePut(s.id, s.ownerToken, { status: 'travelling', updatedAt: now() }).catch(() => {});
      await api.shareDelete(s.id, s.ownerToken).catch(() => {});
    },
    /**
     * H1: keep a live help-only share updated while the app runs. Watches location only while a
     * help-only share exists; stops on end, expiry or share gone. Returns a dispose function.
     */
    track(api: Api, platform: Platform, timers: Timers = realTimers): () => void {
      let watching: string | null = null;
      let stopWatch: Unsubscribe | null = null;
      let latest: LocationFix | null = null;
      let lastAt = -Infinity;
      let timer: unknown = null;
      let tick: unknown = null;
      let expiry: unknown = null;
      let inflight = false;
      let failures = 0;
      let gen = 0;

      const due = (): boolean => {
        if (!latest) return false;
        if (!lastSent) return true;
        const age = now() - lastSent.at;
        if (age >= SHARE_STILL_MS) return true;
        if (lastSent.lat === undefined) return age >= SHARE_MOVING_MS;
        return age >= SHARE_MOVING_MS && haversine(latest, { lat: lastSent.lat, lng: lastSent.lng! }) >= SHARE_MOVE_M;
      };
      const clearTimer = () => {
        if (timer !== null) timers.clearTimeout(timer);
        timer = null;
      };
      const schedule = (ms?: number) => {
        if (inflight || timer !== null) return;
        const wait = ms ?? Math.max(0, lastAt + SHARE_MIN_INTERVAL_MS - now());
        timer = timers.setTimeout(() => {
          timer = null;
          void send();
        }, wait);
      };
      async function send() {
        const s = current.peek();
        const f = latest;
        if (!s || !f) return;
        const my = gen;
        const t = now();
        const body: SharePut = { status: 'help', updatedAt: t, ...posBody(f), heading: f.heading ?? null, speed: f.speed ?? null };
        inflight = true;
        lastAt = t;
        try {
          await api.sharePut(s.id, s.ownerToken, body);
          if (my !== gen) return;
          lastSent = { at: t, lat: f.lat, lng: f.lng };
          failures = 0;
        } catch (e) {
          if (my !== gen) return;
          inflight = false;
          if (isApiError(e) && e.shareGone) {
            log('share:help-only-gone');
            current.value = null;
            return;
          }
          // Latest fix only: the retry sends whatever `latest` is by then.
          const ms = isApiError(e) && e.status === 429 ? (e.retryAfterS ?? 3) * 1000 : SHARE_BACKOFF_MS[Math.min(failures++, SHARE_BACKOFF_MS.length - 1)]!;
          clearTimer();
          schedule(ms);
          return;
        } finally {
          if (my === gen) inflight = false;
        }
      }
      const stop = () => {
        gen++;
        watching = null;
        inflight = false;
        latest = null;
        clearTimer();
        if (tick !== null) timers.clearInterval(tick);
        if (expiry !== null) timers.clearTimeout(expiry);
        tick = expiry = null;
        const w = stopWatch;
        stopWatch = null;
        w?.();
      };
      const start = (s: HelpShare) => {
        stop();
        watching = s.id;
        failures = 0;
        const my = gen;
        log('share:help-only-tracking');
        platform.location
          .watch(
            (f) => {
              if (my !== gen) return;
              latest = f;
              if (due()) schedule();
            },
            () => {},
            { highAccuracy: true, intervalMs: SHARE_MOVING_MS },
          )
          .then((u) => (my === gen ? (stopWatch = u) : u()))
          .catch(() => {});
        // "60 s still": the browser may not report a fix while nothing moves.
        tick = timers.setInterval(() => {
          dropIfExpired();
          if (due()) schedule();
        }, SHARE_STILL_MS / 4);
        expiry = timers.setTimeout(dropIfExpired, Math.max(0, Date.parse(s.expiresAt) - now()) + 1000);
      };
      const dispose = effect(() => {
        const s = current.value;
        if (s && watching !== s.id) start(s);
        else if (!s && watching) stop();
      });
      return () => {
        dispose();
        stop();
      };
    },
  };
}

export type HelpShareStore = ReturnType<typeof createHelpShare>;
/** App-wide instance (tests create their own with a memory KV). */
export const helpShare = createHelpShare();
