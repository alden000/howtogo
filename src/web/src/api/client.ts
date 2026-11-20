/**
 * HTTP client for the Worker contract (src/worker/API.md). Timeouts via
 * AbortController, typed `ApiError`s, `api:<endpoint> <status>` log lines
 * (endpoint only — never query text or coordinates).
 */
import type { LatLng } from '@howtogo/shared';
import { log } from '../log';
import { ApiError } from './errors';
import type { Api, LiveConnection, LiveEvent, RouteParams, SearchResult, SearchResults, ShareState } from './types';

/** 1.2 search cache-key version (`&v=`): bump when the Worker's search answer changes shape, casing or order. */
export const SEARCH_CACHE_V = 2;
/** 1.1: the results array with the response-level flags attached (only when present). */
type SearchBody = { results?: SearchResult[]; didYouMean?: boolean; usedAlternative?: string; alias?: { zh?: string; en: string }; guess?: string; assist?: boolean };
export function searchResults(r: SearchBody): SearchResults {
  const out: SearchResults = [...(r.results ?? [])];
  if (r.didYouMean) out.didYouMean = true;
  if (r.usedAlternative) out.usedAlternative = r.usedAlternative;
  if (r.alias && typeof r.alias.en === 'string') out.alias = r.alias.zh ? { zh: r.alias.zh, en: r.alias.en } : { en: r.alias.en };
  if (typeof r.guess === 'string' && r.guess) out.guess = r.guess;
  if (r.assist) out.assist = true;
  return out;
}

export interface HttpApiOptions {
  /** Base URL, e.g. "https://howtogo.example" or "" for same origin. From VITE_API_BASE. */
  base: string;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  timeoutMs?: number;
  routeTimeoutMs?: number;
  /** For WebSocket URLs when base is "" (same origin). */
  origin?: string;
  random?: () => number;
}

/** SGT (UTC+8, no DST) date/time strings for OneMap: MM-DD-YYYY, HH:MM:SS. */
export function sgtDateTime(ms: number): { date: string; time: string } {
  const d = new Date(ms + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${d.getUTCFullYear()}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
  };
}

const ll = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return Math.round(base * (0.5 + random() * 0.5));
}

export function createHttpApi(opts: HttpApiOptions): Api {
  const base = opts.base.replace(/\/+$/, '');
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const routeTimeoutMs = opts.routeTimeoutMs ?? 15_000;
  const random = opts.random ?? Math.random;

  async function request<T>(
    endpoint: string,
    path: string,
    init: RequestInit & { timeout?: number; signal?: AbortSignal | null } = {},
  ): Promise<T> {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, init.timeout ?? timeoutMs);
    const outer = init.signal;
    const onOuter = () => ctrl.abort();
    outer?.addEventListener('abort', onOuter);
    let res: Response;
    try {
      res = await f(base + path, { ...init, signal: ctrl.signal });
    } catch (e) {
      const kind = timedOut ? 'timeout' : outer?.aborted ? 'aborted' : 'network';
      log(`api:${endpoint} ${kind}`);
      throw new ApiError(kind, { message: (e as Error)?.message });
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
    }
    log(`api:${endpoint} ${res.status}`);
    if (res.status === 204) return undefined as T;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (res.ok) throw new ApiError('parse', { status: res.status });
    }
    if (!res.ok) {
      const err = (body as { error?: { code?: string; message?: string } } | undefined)?.error;
      const ra = Number(res.headers.get('Retry-After'));
      throw new ApiError('http', {
        status: res.status,
        code: err?.code ?? `http_${res.status}`,
        message: err?.message ?? res.statusText,
        ...(Number.isFinite(ra) && ra > 0 ? { retryAfterS: ra } : {}),
      });
    }
    return body as T;
  }

  const json = (method: string, body: unknown, token?: string): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

  const api: Api = {
    async search(q, signal, opts) {
      let path = `/api/search?q=${encodeURIComponent(q)}`;
      const alts = (opts?.alternatives ?? []).map((a) => a.trim().slice(0, 100)).filter((a) => a && a !== q.trim());
      for (const a of alts.slice(0, 2)) path += `&alt=${encodeURIComponent(a)}`;
      if (opts?.step === 1) path += '&step=1';
      // 1.2: new cache key so HTTP/SW caches never serve a 1.1 answer (old casing, QA-68/69; old order, QA-71).
      path += `&v=${SEARCH_CACHE_V}`;
      const r = await request<SearchBody>('search', path, { signal: signal ?? null });
      return searchResults(r);
    },
    route(p: RouteParams, signal) {
      const qs = new URLSearchParams({ start: ll(p.start), end: ll(p.end) });
      if (p.departAt !== undefined) {
        const { date, time } = sgtDateTime(p.departAt);
        qs.set('date', date);
        qs.set('time', time);
      }
      if (p.mode) qs.set('mode', p.mode);
      if (p.maxWalkDistance !== undefined) qs.set('maxWalkDistance', String(Math.round(p.maxWalkDistance)));
      if (p.numItineraries !== undefined) qs.set('numItineraries', String(p.numItineraries));
      return request<unknown>('route', `/api/route?${qs}`, { timeout: routeTimeoutMs, signal: signal ?? null });
    },
    revgeocode(p) {
      return request('revgeocode', `/api/revgeocode?lat=${p.lat.toFixed(6)}&lng=${p.lng.toFixed(6)}`);
    },
    async nearbyBlocks(p) {
      const r = await request<{ blocks?: SearchResult[] }>('revgeocode', `/api/revgeocode?lat=${p.lat.toFixed(6)}&lng=${p.lng.toFixed(6)}&blocks=1`);
      return Array.isArray(r.blocks) ? r.blocks : [];
    },
    busArrival(stop, service) {
      const qs = new URLSearchParams({ stop });
      if (service) qs.set('service', service);
      return request('bus-arrival', `/api/bus-arrival?${qs}`);
    },
    alerts() {
      return request('alerts', '/api/alerts');
    },
    lifts() {
      return request('lifts', '/api/lifts');
    },
    shareCreate(body) {
      return request('share-create', '/api/share', json('POST', body));
    },
    setupCreate(ct) {
      return request('setup-create', '/api/setup', json('POST', { ct }));
    },
    setupGet(code) {
      return request('setup-get', `/api/setup/${encodeURIComponent(code)}`);
    },
    async sharePut(id, token, body) {
      await request<void>('share-put', `/api/share/${encodeURIComponent(id)}`, json('PUT', body, token));
    },
    shareGet(id) {
      return request<ShareState>('share-get', `/api/share/${encodeURIComponent(id)}`);
    },
    async shareDelete(id, token) {
      await request<void>('share-delete', `/api/share/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    shareLive(id, onEvent) {
      return connectLive(id, onEvent);
    },
  };

  function wsUrl(id: string): string {
    const httpBase = base || opts.origin || globalThis.location?.origin || '';
    return httpBase.replace(/^http/, 'ws') + `/api/share/${encodeURIComponent(id)}/live`;
  }

  /** Live viewer socket with reconnect + exponential backoff; stops on ended/expired/404/410. */
  function connectLive(id: string, onEvent: (e: LiveEvent) => void): LiveConnection {
    const WS = opts.WebSocket ?? globalThis.WebSocket;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;

    const finish = (reason: 'ended' | 'expired' | 'not_found') => {
      if (stopped) return;
      stopped = true;
      onEvent({ type: 'ended', reason });
      cleanup();
    };
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (ping) clearInterval(ping);
      timer = ping = null;
      const s = ws;
      ws = null;
      if (s && s.readyState <= 1) s.close(1000);
    };

    const open = () => {
      if (stopped) return;
      onEvent({ type: 'connection', status: attempt === 0 ? 'connecting' : 'reconnecting' });
      const s = new WS(wsUrl(id));
      ws = s;
      s.onopen = () => {
        attempt = 0;
        onEvent({ type: 'connection', status: 'open' });
        ping = setInterval(() => s.readyState === 1 && s.send('ping'), 25_000);
      };
      s.onmessage = (m) => {
        if (m.data === 'pong') return;
        try {
          const msg = JSON.parse(String(m.data)) as { type: string; state?: ShareState };
          if (msg.type === 'expired') return finish('expired');
          if (msg.type === 'state' && msg.state) {
            onEvent({ type: 'state', state: msg.state });
            if (msg.state.status === 'ended') finish('ended');
          }
        } catch {
          /* ignore malformed */
        }
      };
      s.onclose = () => {
        if (ping) clearInterval(ping);
        ping = null;
        if (stopped || ws !== s) return;
        ws = null;
        const delay = backoffMs(attempt++, random);
        onEvent({ type: 'connection', status: 'reconnecting' });
        timer = setTimeout(async () => {
          // A failed upgrade hides the HTTP status: ask the REST endpoint whether the share still exists.
          try {
            const st = await api.shareGet(id);
            if (st.status === 'ended') return finish('ended');
          } catch (e) {
            const err = e as ApiError;
            if (err.status === 404) return finish('not_found');
            if (err.status === 410) return finish(err.code === 'share_expired' ? 'expired' : 'ended');
          }
          open();
        }, delay);
      };
    };
    open();
    return {
      close() {
        stopped = true;
        cleanup();
        onEvent({ type: 'connection', status: 'closed' });
      },
    };
  }

  return api;
}
