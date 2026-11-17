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

/** Scenario for one endpoint: sessionStorage `howtogo.mock.scn.<kind>` (set from `?scn=bus:here,alerts:disrupted`). */
export function scenario(kind: string, dflt: string): string {
  try {
    return sessionStorage.getItem(`howtogo.mock.scn.${kind}`) || dflt;
  } catch {
    return dflt;
  }
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
    busArrival(stop, service) {
      // M3 AC 39 scenarios (same names as the Worker's FIXTURE_MODE `?fixture=`), switchable mid-test.
      const sc = scenario('bus', 'live');
      if (sc === 'not_configured') return fail('bus-arrival', 503, 'not_configured');
      const no = service || '139';
      const fetchedAt = new Date(now() - (sc === 'stale' ? 90_000 : sc === 'old' ? 200_000 : 0)).toISOString();
      const bus = (etaMin: number, load: 'SEA' | 'SDA' | 'LSD', monitored = true, deck: 'single' | 'double' | 'bendy' = 'double', wheelchair = true) => ({ etaMin, load, wheelchair, deck, monitored });
      const next =
        sc === 'empty' ? [] :
        sc === 'estimated' ? [bus(8, 'SEA', false), bus(20, 'SEA', false)] :
        sc === 'here' ? [bus(0, 'SDA'), bus(9, 'SEA')] :
        sc === 'missed' ? [bus(9, 'SEA'), bus(21, 'SEA')] :
        sc === 'lsd' ? [bus(3, 'LSD'), bus(9, 'SEA', true, 'single')] :
        sc === 'nowab' ? [bus(5, 'SDA', true, 'single', false), bus(14, 'SEA')] :
        [bus(4, 'SEA'), bus(12, 'SDA', true, 'single')];
      return wait({ stop, fetchedAt, services: [{ no, operator: 'SBST', next }] }, 'bus-arrival');
    },
    alerts() {
      const sc = scenario('alerts', 'normal');
      if (sc === 'not_configured') return fail('alerts', 503, 'not_configured');
      if (sc === 'minor')
        return wait({ status: 'normal' as const, minor: true, lines: [], messages: [{ text: 'SYNTHETIC: Minor delay on the CCL. Trains are running.', createdAt: new Date(now()).toISOString() }] }, 'alerts');
      if (sc === 'disrupted')
        return wait(
          {
            status: 'disrupted' as const,
            minor: false,
            lines: [{ line: 'NSL', direction: 'Marina South Pier', stations: ['NS16', 'NS17', 'NS18', 'NS19', 'NS20'], freePublicBus: ['NS16', 'NS17', 'NS18', 'NS19', 'NS20'], freeShuttle: ['NS17'], freeBusIslandWide: false, shuttleDirection: 'Both' }],
            messages: [{ text: 'SYNTHETIC: 0710hrs: NSL - No train service between Ang Mo Kio and Novena towards Marina South Pier. Free regular bus services are available.', createdAt: '2026-11-17T07:10:00+08:00' }],
          },
          'alerts',
        );
      return wait({ status: 'normal' as const, minor: false, lines: [], messages: [] }, 'alerts');
    },
    lifts() {
      const sc = scenario('lifts', 'outage');
      if (sc === 'not_configured') return fail('lifts', 503, 'not_configured');
      const lifts =
        sc === 'none'
          ? []
          : [
              { line: 'NSL', station: 'NS17', stationName: 'Bishan', liftId: 'B1L01', desc: 'Exit A Street level - Concourse' },
              { line: 'CCL', station: 'CC22', stationName: 'Buona Vista', liftId: null, desc: 'Exit C Street level - Concourse' },
              { line: 'NEL', station: 'NE12', stationName: 'Serangoon', liftId: 'B1L02', desc: 'Exit B Street level - Concourse' },
            ];
      return wait({ fetchedAt: new Date(now()).toISOString(), lifts }, 'lifts');
    },
    setupCreate(ct) {
      if (scenario('setup', 'ok') === 'rate_limited') return fail('setup-create', 429, 'rate_limited', 60);
      const code = Array.from({ length: 12 }, () => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 56)]).join('');
      const expiresAt = new Date(now() + 24 * 3600_000).toISOString();
      try {
        localStorage.setItem(`howtogo.mocksetup.${code}`, JSON.stringify({ ct, expiresAt, used: false }));
      } catch {
        /* ignore */
      }
      return wait({ code, expiresAt }, 'setup-create', 201);
    },
    setupGet(code) {
      let box: { ct: string; expiresAt: string; used: boolean } | null = null;
      try {
        box = JSON.parse(localStorage.getItem(`howtogo.mocksetup.${code}`) ?? 'null');
      } catch {
        box = null;
      }
      if (!box) return fail('setup-get', 404, 'setup_not_found');
      if (box.used) return fail('setup-get', 410, 'setup_used');
      if (Date.parse(box.expiresAt) < now()) return fail('setup-get', 410, 'setup_expired');
      localStorage.setItem(`howtogo.mocksetup.${code}`, JSON.stringify({ ...box, ct: '', used: true }));
      return wait({ ct: box.ct, expiresAt: box.expiresAt }, 'setup-get');
    },
    shareCreate({ destName, lang, senderName, senderPhone }) {
      if (scenario('share', 'ok') === 'fail') return fail('share-create', 502, 'upstream_unavailable');
      const id = Array.from({ length: 12 }, () => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 56)]).join('');
      const token = 'mock-' + id;
      const expiresAt = new Date(now() + 4 * 3600_000).toISOString();
      store.set(id, { token, destName, lang, senderName: senderName ?? null, senderPhone: senderPhone ?? null, status: 'waiting', lat: null, lng: null, acc: null, heading: null, etaISO: null, stepText: null, step: null, updatedAt: null, expiresAt } as never);
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
      const keepPos = body.lat === undefined ? { lat: s.lat, lng: s.lng, acc: s.acc } : {};
      const next = { ...s, ...body, ...keepPos, acc: body.acc ?? keepPos.acc ?? null, step: body.step ?? null, heading: body.heading ?? null, etaISO: body.etaISO ?? null, stepText: body.stepText ?? null, updatedAt: Math.min(body.updatedAt, t) };
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
