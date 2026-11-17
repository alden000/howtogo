import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeOneMapPlan } from '@howtogo/shared';
import { backoffMs, createHttpApi, sgtDateTime } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { createMockApi, pickFixture, MOCK_PLACES } from '../src/api/mock';
import { offlineAware } from '../src/api/offline';
import type { LiveEvent } from '../src/api/types';
import { logLines, resetLog } from '../src/log';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

afterEach(() => {
  vi.useRealTimers();
  resetLog();
});

describe('http api client', () => {
  it('builds URLs per API.md and parses results', async () => {
    const fetch = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => json({ results: [{ name: 'Bishan MRT Station', address: 'a', postal: '579842', lat: 1.35, lng: 103.85 }] }));
    const api = createHttpApi({ base: 'https://w.example/', fetch: fetch as typeof globalThis.fetch });
    const r = await api.search('bishan mrt');
    expect(r[0]!.postal).toBe('579842');
    expect(String(fetch.mock.calls[0]![0])).toBe('https://w.example/api/search?q=bishan%20mrt');
    expect(logLines()).toContain('api:search 200');
    expect(logLines().join()).not.toContain('bishan');

    fetch.mockResolvedValueOnce(json({ plan: {} }));
    await api.route({ start: { lat: 1.35, lng: 103.85 }, end: { lat: 1.28, lng: 103.85 }, departAt: Date.UTC(2026, 10, 18, 1, 30), maxWalkDistance: 500, numItineraries: 3 });
    const u = new URL(String(fetch.mock.calls[1]![0]));
    expect(u.pathname).toBe('/api/route');
    expect(u.searchParams.get('start')).toBe('1.350000,103.850000');
    expect(u.searchParams.get('date')).toBe('11-18-2026');
    expect(u.searchParams.get('time')).toBe('09:30:00');
    expect(u.searchParams.get('maxWalkDistance')).toBe('500');
  });

  it('sgtDateTime is UTC+8 across midnight', () => {
    expect(sgtDateTime(Date.UTC(2026, 11, 31, 17, 5, 9))).toEqual({ date: '01-01-2027', time: '01:05:09' });
  });

  it('maps Worker errors to typed ApiError (code, status, Retry-After)', async () => {
    const fetch = vi.fn(async () => json({ error: { code: 'rate_limited', message: 'slow down' } }, 429, { 'Retry-After': '2' }));
    const api = createHttpApi({ base: '', fetch: fetch as unknown as typeof globalThis.fetch });
    const e = await api.sharePut('abc', 'tok', { lat: 1.3, lng: 103.8, acc: 10, status: 'travelling', updatedAt: 1 }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(429);
    expect(e.code).toBe('rate_limited');
    expect(e.retryAfterS).toBe(2);
    expect(e.retryable).toBe(true);
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.method).toBe('PUT');

    fetch.mockResolvedValueOnce(json({ error: { code: 'share_ended' } }, 410));
    const g = await api.shareGet('abc').catch((x) => x);
    expect(g.shareGone).toBe(true);
  });

  it('204 → undefined; network failure → kind network', async () => {
    const fetch = vi.fn(async () => json(null, 204));
    const api = createHttpApi({ base: '', fetch: fetch as unknown as typeof globalThis.fetch });
    await expect(api.shareDelete('abc', 't')).resolves.toBeUndefined();
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.alerts()).rejects.toMatchObject({ kind: 'network' });
  });

  it('times out with kind timeout', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));
    const api = createHttpApi({ base: '', fetch: fetch as unknown as typeof globalThis.fetch, timeoutMs: 1000 });
    const p = api.alerts().catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toMatchObject({ kind: 'timeout' });
  });

  it('offline wrapper fails fast without calling fetch', async () => {
    const fetch = vi.fn();
    const api = offlineAware(createHttpApi({ base: '', fetch: fetch as unknown as typeof globalThis.fetch }), () => false);
    await expect(api.search('x')).rejects.toMatchObject({ kind: 'offline', retryable: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('backoff grows exponentially, capped at 30 s', () => {
    expect(backoffMs(0, () => 1)).toBe(1000);
    expect(backoffMs(3, () => 1)).toBe(8000);
    expect(backoffMs(10, () => 1)).toBe(30000);
    expect(backoffMs(2, () => 0)).toBe(2000);
  });
});

class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  msg(o: unknown) {
    this.onmessage?.({ data: JSON.stringify(o) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

describe('live share socket', () => {
  it('connects to ws URL, relays state, reconnects with backoff, ends on 410', async () => {
    vi.useFakeTimers();
    FakeWS.all = [];
    let gets = 0;
    const fetch = vi.fn(async () => (++gets === 1 ? json({ status: 'travelling' }) : json({ error: { code: 'share_ended' } }, 410)));
    const api = createHttpApi({ base: 'https://w.example', fetch: fetch as unknown as typeof globalThis.fetch, WebSocket: FakeWS as unknown as typeof WebSocket, random: () => 0 });
    const events: LiveEvent[] = [];
    api.shareLive('abc123', (e) => events.push(e));
    const ws = FakeWS.all[0]!;
    expect(ws.url).toBe('wss://w.example/api/share/abc123/live');
    ws.open();
    ws.msg({ type: 'state', state: { status: 'travelling', lat: 1.3 } });
    expect(events.some((e) => e.type === 'state')).toBe(true);
    ws.drop();
    await vi.advanceTimersByTimeAsync(600); // backoff(0)=500 → GET ok → reopen
    expect(FakeWS.all).toHaveLength(2);
    FakeWS.all[1]!.drop();
    await vi.advanceTimersByTimeAsync(1100); // backoff(1)=1000 → GET 410 → ended
    expect(events.at(-1)).toEqual({ type: 'ended', reason: 'ended' });
    expect(FakeWS.all).toHaveLength(2);
  });

  it('stops on server "expired" message', () => {
    FakeWS.all = [];
    const api = createHttpApi({ base: 'http://localhost:8787', WebSocket: FakeWS as unknown as typeof WebSocket });
    const events: LiveEvent[] = [];
    api.shareLive('abc', (e) => events.push(e));
    expect(FakeWS.all[0]!.url).toBe('ws://localhost:8787/api/share/abc/live');
    FakeWS.all[0]!.open();
    FakeWS.all[0]!.msg({ type: 'expired' });
    expect(events.at(-1)).toEqual({ type: 'ended', reason: 'expired' });
  });
});

describe('mock api', () => {
  it('search matches name, zh alias and postal; route answers a normalisable fixture re-timed to departAt', async () => {
    const api = createMockApi({ latencyMs: 0 });
    expect((await api.search('tan tock'))[0]!.name).toBe('Tan Tock Seng Hospital');
    expect((await api.search('陈笃生'))[0]!.postal).toBe('308433');
    expect(await api.search('048618')).toHaveLength(1);
    const dest = MOCK_PLACES[0]!;
    const departAt = Date.UTC(2027, 0, 5, 2, 0);
    const plan = normalizeOneMapPlan(await api.route({ start: { lat: 1.3346, lng: 103.849 }, end: dest, departAt }));
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.itineraries[0]!.startTime).toBe(departAt);
  });

  it('picks the fixture by destination, then start', () => {
    const ttsh = MOCK_PLACES[0]!;
    expect(pickFixture({ lat: 1.3346, lng: 103.849 }, ttsh)).toBe('toaPayohToTTSH');
    expect(pickFixture({ lat: 1.3696, lng: 103.8483 }, ttsh)).toBe('angMoKioToNovena');
  });

  it('share lifecycle with 3 s limit and help bypass', async () => {
    let t = 1_000_000;
    const api = createMockApi({ latencyMs: 0, now: () => t });
    const c = await api.shareCreate('TTSH', 'zh');
    const events: LiveEvent[] = [];
    const live = api.shareLive(c.id, (e) => events.push(e));
    await api.sharePut(c.id, c.ownerToken, { lat: 1.3, lng: 103.8, acc: 10, status: 'travelling', updatedAt: t });
    await expect(api.sharePut(c.id, c.ownerToken, { lat: 1.3, lng: 103.8, acc: 10, status: 'travelling', updatedAt: t })).rejects.toMatchObject({ status: 429 });
    await api.sharePut(c.id, c.ownerToken, { lat: 1.3, lng: 103.8, acc: 10, status: 'help', updatedAt: t });
    await expect(api.sharePut(c.id, 'wrong', { lat: 1.3, lng: 103.8, acc: 10, status: 'help', updatedAt: t })).rejects.toMatchObject({ status: 403 });
    expect((await api.shareGet(c.id)).status).toBe('help');
    t += 5000;
    await api.shareDelete(c.id, c.ownerToken);
    await expect(api.shareGet(c.id)).rejects.toMatchObject({ status: 410 });
    expect(events.some((e) => e.type === 'ended')).toBe(true);
    live.close();
  });
});
