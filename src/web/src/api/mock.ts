/**
 * Mock API for dev/demo (`?demo=1` or `?mock=1`, or VITE_API_MOCK=1): the whole app
 * runs without credentials on the shared engine's SYNTHETIC OneMap fixtures.
 * Route answers are re-timed to depart at the requested time (default now).
 * Share state lives in localStorage so a viewer tab (/t/:id?demo=1) can follow.
 */
import { haversine, type LatLng } from '@howtogo/shared';
import { FIXTURES, FIXTURE_T0, type FixtureName } from '@howtogo/shared/fixtures';
import { log } from '../log';
import { ApiError } from './errors';
import type { Api, LiveEvent, SearchResult, ShareState } from './types';

interface RawPlan {
  plan: { from: { lat: number; lon: number }; to: { lat: number; lon: number } };
}
const raw = (n: FixtureName) => FIXTURES[n] as unknown as RawPlan;
const endOf = (n: FixtureName): LatLng => ({ lat: raw(n).plan.to.lat, lng: raw(n).plan.to.lon });
const startOf = (n: FixtureName): LatLng => ({ lat: raw(n).plan.from.lat, lng: raw(n).plan.from.lon });

/** Searchable places (synthetic). `aliases` lets zh input match. */
export const MOCK_PLACES: (SearchResult & { aliases: string[]; fixture: FixtureName; role: 'start' | 'end' })[] = [
  { name: 'Tan Tock Seng Hospital', address: '11 Jalan Tan Tock Seng Singapore 308433', postal: '308433', ...endOf('toaPayohToTTSH'), aliases: ['陈笃生医院', 'ttsh'], fixture: 'toaPayohToTTSH', role: 'end' },
  { name: 'Raffles Place MRT Station (NS26)', address: '5 Raffles Place Singapore 048618', postal: '048618', ...endOf('bishanToRafflesPlace'), aliases: ['莱佛士坊'], fixture: 'bishanToRafflesPlace', role: 'end' },
  { name: 'Toa Payoh Central', address: 'Toa Payoh Central Singapore 310177', postal: '310177', ...startOf('toaPayohToTTSH'), aliases: ['大巴窑'], fixture: 'toaPayohToTTSH', role: 'start' },
  { name: 'Bishan Street 13', address: 'Bishan Street 13 Singapore 570513', postal: '570513', ...startOf('bishanToRafflesPlace'), aliases: ['碧山'], fixture: 'bishanToRafflesPlace', role: 'start' },
  { name: 'Ang Mo Kio Avenue 3', address: 'Ang Mo Kio Avenue 3 Singapore 560215', postal: '560215', ...startOf('angMoKioToNovena'), aliases: ['宏茂桥'], fixture: 'angMoKioToNovena', role: 'start' },
];

/** Where the demo "me" starts: the origin of the bus fixture (Toa Payoh). */
export const DEMO_START: LatLng = startOf('toaPayohToTTSH');

/** Pick the fixture whose destination is nearest `end`, ties broken by nearest start. */
export function pickFixture(start: LatLng, end: LatLng): FixtureName {
  const names = Object.keys(FIXTURES) as FixtureName[];
  return names
    .map((n) => ({ n, e: haversine(end, endOf(n)), s: haversine(start, startOf(n)) }))
    .sort((a, b) => a.e - b.e || a.s - b.s)[0]!.n;
}

const TIME_KEYS = new Set(['startTime', 'endTime', 'arrival', 'departure', 'date']);
/** Deep-copy a OneMap body, shifting every epoch-ms time field by `delta`. */
export function shiftTimes<T>(body: T, delta: number): T {
  const walk = (v: unknown, k?: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [kk, vv] of Object.entries(v)) o[kk] = walk(vv, kk);
      return o;
    }
    if (typeof v === 'number' && k && TIME_KEYS.has(k) && v > 1e12) return v + delta;
    return v;
  };
  return walk(body) as T;
}

const store = {
  get(id: string): (ShareState & { token: string }) | null {
    try {
      const s = localStorage.getItem(`howtogo.mockshare.${id}`);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  },
  set(id: string, v: ShareState & { token: string }) {
    try {
      localStorage.setItem(`howtogo.mockshare.${id}`, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

export interface MockApiOptions {
  latencyMs?: number;
  now?: () => number;
}

export function createMockApi(opts: MockApiOptions = {}): Api {
  const latency = opts.latencyMs ?? 120;
  const now = opts.now ?? Date.now;
  const listeners = new Map<string, Set<(e: LiveEvent) => void>>();
  const lastPut = new Map<string, number>();
  const wait = <T>(v: T, endpoint: string, status = 200): Promise<T> =>
    new Promise((r) =>
      setTimeout(() => {
        log(`api:${endpoint} ${status}`);
        r(v);
      }, latency),
    );
  const fail = (endpoint: string, status: number, code: string, retryAfterS?: number): Promise<never> =>
    new Promise((_, rej) =>
      setTimeout(() => {
        log(`api:${endpoint} ${status}`);
        rej(new ApiError('http', { status, code, ...(retryAfterS ? { retryAfterS } : {}) }));
      }, latency),
    );
  const broadcast = (id: string, e: LiveEvent) => listeners.get(id)?.forEach((l) => l(e));
  const publicState = (s: ShareState & { token: string }): ShareState => {
    const { token: _t, ...rest } = s;
    return rest;
  };

  return {
    search(q) {
      const needle = q.trim().toLowerCase();
      if (!needle) return fail('search', 400, 'missing_query');
      const res = MOCK_PLACES.filter(
        (p) => p.name.toLowerCase().includes(needle) || p.postal.startsWith(needle) || p.aliases.some((a) => a.toLowerCase().includes(needle)),
      ).map(({ aliases: _a, fixture: _f, role: _r, ...r }) => r);
      return wait(res, 'search');
    },
    route(p) {
      const name = pickFixture(p.start, p.end);
      const body = shiftTimes(FIXTURES[name], (p.departAt ?? now()) - FIXTURE_T0);
      return wait(body as unknown, 'route');
    },
    revgeocode(p) {
      const near = MOCK_PLACES.map((m) => ({ m, d: haversine(p, m) })).sort((a, b) => a.d - b.d)[0];
      if (!near || near.d > 300) return fail('revgeocode', 404, 'not_found');
      return wait({ name: near.m.name, address: near.m.address, postal: near.m.postal }, 'revgeocode');
    },
    busArrival(stop) {
      return wait(
        {
          stop,
          fetchedAt: new Date(now()).toISOString(),
          services: [
            { no: '139', operator: 'SBST', next: [{ etaMin: 4, load: 'SEA' as const, wheelchair: true, deck: 'double' as const }, { etaMin: 15, load: 'SDA' as const, wheelchair: true, deck: 'single' as const }] },
          ],
        },
        'bus-arrival',
      );
    },
    alerts() {
      return wait({ status: 'normal' as const, lines: [], messages: [] }, 'alerts');
    },
    shareCreate(destName, lang) {
      const id = Array.from({ length: 12 }, () => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 56)]).join('');
      const token = 'mock-' + id;
      const expiresAt = new Date(now() + 4 * 3600_000).toISOString();
      store.set(id, { token, destName, lang, status: 'waiting', lat: null, lng: null, acc: null, heading: null, etaISO: null, stepText: null, updatedAt: null, expiresAt });
      return wait({ id, ownerToken: token, viewPath: `/t/${id}`, expiresAt }, 'share-create', 201);
    },
    sharePut(id, token, body) {
      const s = store.get(id);
      if (!s) return fail('share-put', 404, 'share_not_found');
      if (s.status === 'ended') return fail('share-put', 410, 'share_ended');
      if (s.token !== token) return fail('share-put', 403, 'forbidden');
      const t = now();
      const last = lastPut.get(id) ?? 0;
      if (body.status !== 'help' && t - last < 3000) return fail('share-put', 429, 'rate_limited', Math.ceil((3000 - (t - last)) / 1000));
      lastPut.set(id, t);
      const next = { ...s, ...body, acc: body.acc ?? null, heading: body.heading ?? null, etaISO: body.etaISO ?? null, stepText: body.stepText ?? null, updatedAt: Math.min(body.updatedAt, t) };
      store.set(id, next);
      broadcast(id, { type: 'state', state: publicState(next) });
      return wait(undefined, 'share-put', 204);
    },
    shareGet(id) {
      const s = store.get(id);
      if (!s) return fail('share-get', 404, 'share_not_found');
      if (s.status === 'ended') return fail('share-get', 410, 'share_ended');
      return wait(publicState(s), 'share-get');
    },
    shareDelete(id, token) {
      const s = store.get(id);
      if (!s) return fail('share-delete', 404, 'share_not_found');
      if (s.token !== token) return fail('share-delete', 403, 'forbidden');
      const ended = { ...s, status: 'ended' as const, lat: null, lng: null, acc: null, heading: null };
      store.set(id, ended);
      broadcast(id, { type: 'state', state: publicState(ended) });
      broadcast(id, { type: 'ended', reason: 'ended' });
      return wait(undefined, 'share-delete', 204);
    },
    shareLive(id, onEvent) {
      let set = listeners.get(id);
      if (!set) listeners.set(id, (set = new Set()));
      set.add(onEvent);
      onEvent({ type: 'connection', status: 'open' });
      const s = store.get(id);
      if (!s) onEvent({ type: 'ended', reason: 'not_found' });
      else onEvent({ type: 'state', state: publicState(s) });
      // Other tabs: follow localStorage writes.
      const onStorage = (e: StorageEvent) => {
        if (e.key !== `howtogo.mockshare.${id}` || !e.newValue) return;
        const st = JSON.parse(e.newValue) as ShareState & { token: string };
        onEvent({ type: 'state', state: publicState(st) });
        if (st.status === 'ended') onEvent({ type: 'ended', reason: 'ended' });
      };
      globalThis.addEventListener?.('storage', onStorage);
      return {
        close() {
          set!.delete(onEvent);
          globalThis.removeEventListener?.('storage', onStorage);
        },
      };
    },
  };
}
