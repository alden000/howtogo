/** M3/M4 fix round B (QA-37…46): pure logic behind the visible fixes. Fake SG test numbers only. */
import { describe, expect, it, vi } from 'vitest';
import { ApiError, failKind } from '../src/api/errors';
import type { Api } from '../src/api/types';
import { tf } from '../src/i18n/ui';
import { createHelpShare } from '../src/state/helpShare';
import { here, locate } from '../src/state/location';
import { addPlace, canAdd, MAX_OTHERS, movePlace, placeKind, removePlace, renamePlace } from '../src/state/places';
import { memoryKV } from '../src/state/storage';
import { createStore, type SavedPlaces } from '../src/state/store';
import { radioStep } from '../src/views/family';
import { whereAmILines } from '../src/views/tripSheets';

const P = (name: string, lat = 1.33, lng = 103.85) => ({ name, lat, lng });

describe('QA-38 where am I (AC 36): address + postal + 附近', () => {
  it('locate() keeps the reverse-geocoded address and postal code', async () => {
    const platform = { location: { current: async () => ({ lat: 1.3521, lng: 103.8198, acc: 10 }) } };
    const api = { revgeocode: async () => ({ name: 'Bishan Community Club', address: '51 Bishan Street 13 Bishan Community Club Singapore 579799', postal: '579799' }) };
    expect(await locate(platform as never, api as never)).toBe('ok');
    expect(here.value).toMatchObject({ label: 'Bishan Community Club', address: '51 Bishan Street 13 Bishan Community Club Singapore 579799', postal: '579799' });
  });
  it('splits the building name off the street address as the "near" line', () => {
    expect(whereAmILines({ name: 'Bishan Community Club', address: '51 Bishan Street 13 Bishan Community Club Singapore 579799' })).toEqual({ lines: ['51 Bishan Street 13'], near: 'Bishan Community Club' });
    expect(whereAmILines({ name: 'Toa Payoh Central', address: 'Toa Payoh Central Singapore 310177' })).toEqual({ lines: ['Toa Payoh Central'], near: null });
    expect(whereAmILines({ name: 'Blk 79', address: '79 Toa Payoh Central Singapore 310079' })).toEqual({ lines: ['79 Toa Payoh Central'], near: 'Blk 79' });
    expect(whereAmILines({ name: 'Somewhere' })).toEqual({ lines: ['Somewhere'], near: null });
    expect(whereAmILines({ name: '' })).toEqual({ lines: [], near: null });
  });
});

describe('QA-40 My places (AC 39): ≤ 6 incl. Home, add / rename / ↑↓ / remove', () => {
  const base: SavedPlaces = { home: P('Home'), others: [] };
  it('adds up to 5 others (6 tiles with Home), no duplicates of the same spot', () => {
    let p = base;
    for (let i = 0; i < 7; i++) p = addPlace(p, P(`Place ${i}`, 1.3 + i / 100));
    expect(p.others).toHaveLength(MAX_OTHERS);
    expect(canAdd(p)).toBe(false);
    expect(addPlace(addPlace(base, P('A')), P('A again')).others).toHaveLength(1);
  });
  it('renames (trimmed, ≤ 20, never empty), moves within bounds, removes', () => {
    let p = addPlace(addPlace(base, P('Tan Tock Seng Hospital', 1.32)), P('Lor 8 Market', 1.34));
    p = renamePlace(p, 0, '  诊所  ');
    expect(p.others[0]!.label).toBe('诊所');
    expect(renamePlace(p, 0, '   ').others[0]!.label).toBe('诊所');
    expect(renamePlace(p, 1, 'x'.repeat(30)).others[1]!.label).toHaveLength(20);
    expect(movePlace(p, 0, -1)).toBe(p);
    p = movePlace(p, 0, 1);
    expect(p.others.map((o) => o.name)).toEqual(['Lor 8 Market', 'Tan Tock Seng Hospital']);
    expect(p.home?.name).toBe('Home');
    expect(removePlace(p, 0).others.map((o) => o.name)).toEqual(['Tan Tock Seng Hospital']);
  });
  it('tile kind from the label (5.1 tints)', () => {
    expect(placeKind('诊所')).toBe('clinic');
    expect(placeKind('Lor 8 Market')).toBe('market');
    expect(placeKind('女儿家')).toBe('daughter');
    expect(placeKind('其他')).toBe('other');
    // Creative m34-fix-b L1: word boundaries for Latin terms.
    expect(placeKind('Robinsons The Heeren')).toBe('other');
    expect(placeKind('Grand Hyatt')).toBe('other');
    expect(placeKind("Daughter's home")).toBe('daughter');
    expect(placeKind('Tekka Food Center')).toBe('market');
  });
  it('old stored places without `others` still load', () => {
    const kv = memoryKV({ 'places': JSON.stringify({ home: P('Home') }) });
    const s = createStore(kv, memoryKV());
    expect(s.places.value.others).toEqual([]);
  });
});

describe('QA-37 help-only share (AC 35)', () => {
  const fakeApi = () => {
    const calls: string[] = [];
    const api = {
      shareCreate: vi.fn(async (b: { destName: string }) => (calls.push(`create ${b.destName}`), { id: 'aB3dE5fG7hJ9', ownerToken: 'tok', viewPath: '/t/aB3dE5fG7hJ9', expiresAt: new Date(Date.now() + 3600_000).toISOString() })),
      sharePut: vi.fn(async (_id: string, _t: string, b: { status: string; lat?: number }) => void calls.push(`put ${b.status} ${b.lat ?? '-'}`)),
      shareDelete: vi.fn(async () => void calls.push('delete')),
    };
    return { api: api as unknown as Api, calls };
  };
  it('creates "我在这里" with status help + the position, keeps the token on the phone, ends on "I\'m OK"', async () => {
    const kv = memoryKV();
    const hs = createHelpShare(kv);
    const { api, calls } = fakeApi();
    const s = await hs.start(api, { destName: tf('zh', 'hp_here_dest'), lang: 'zh' }, '美玲', { lat: 1.3346, lng: 103.8491, acc: 12 });
    expect(s.viewPath).toBe('/t/aB3dE5fG7hJ9');
    expect(calls).toEqual(['create 我在这里', 'put help 1.3346']);
    expect(JSON.parse(kv.data['helpshare.v1']!)).toMatchObject({ id: 'aB3dE5fG7hJ9', fam: '美玲' });
    expect(createHelpShare(kv).current.value?.id).toBe('aB3dE5fG7hJ9');
    await hs.end(api);
    // Creative m34-fix-b M2: back to travelling first, so family's page reads "okay", then DELETE.
    expect(calls.slice(-2)).toEqual(['put travelling -', 'delete']);
    expect(kv.data['helpshare.v1']).toBeUndefined();
  });
  it('a status-only help write when there is no fix; an expired stored share is forgotten', async () => {
    const { api, calls } = fakeApi();
    await createHelpShare(memoryKV()).start(api, { destName: 'Where I am', lang: 'en' }, null, null);
    expect(calls[1]).toBe('put help -');
    const old = memoryKV({ 'helpshare.v1': JSON.stringify({ id: 'x1234567', ownerToken: 't', viewPath: '/t/x1234567', expiresAt: '2020-01-01T00:00:00Z', fam: null }) });
    expect(createHelpShare(old).current.value).toBeNull();
  });
  it('Creative m34-fix-b H1: keeps sending positions at the share cadence until 我没事了 or expiry', async () => {
    let t = Date.parse('2026-11-18T02:00:00Z');
    const now = () => t;
    const pending: { at: number; fn: () => void }[] = [];
    const intervals: { every: number; next: number; fn: () => void }[] = [];
    const timers = {
      setTimeout: (fn: () => void, ms: number) => (pending.push({ at: t + ms, fn }), pending.at(-1)),
      clearTimeout: (h: unknown) => void pending.splice(pending.indexOf(h as never) >>> 0, pending.includes(h as never) ? 1 : 0),
      setInterval: (fn: () => void, ms: number) => (intervals.push({ every: ms, next: t + ms, fn }), intervals.at(-1)),
      clearInterval: (h: unknown) => void intervals.splice(intervals.indexOf(h as never) >>> 0, intervals.includes(h as never) ? 1 : 0),
    };
    const advance = async (ms: number) => {
      const end = t + ms;
      for (;;) {
        const next = [...pending.map((p) => p.at), ...intervals.map((i) => i.next)].filter((x) => x <= end).sort((a, b) => a - b)[0];
        if (next === undefined) break;
        t = next;
        const p = pending.find((x) => x.at === next);
        if (p) {
          pending.splice(pending.indexOf(p), 1);
          p.fn();
        } else {
          const i = intervals.find((x) => x.next === next)!;
          i.next += i.every;
          i.fn();
        }
        await Promise.resolve();
        await Promise.resolve();
      }
      t = end;
    };
    let onFix: (f: { lat: number; lng: number; acc: number }) => void = () => {};
    const stopWatch = vi.fn();
    const platform = { location: { watch: vi.fn(async (cb: typeof onFix) => ((onFix = cb), stopWatch)) } };
    const puts: { status: string; lat?: number; at: number }[] = [];
    const api = {
      shareCreate: async () => ({ id: 'aB3dE5fG7hJ9', ownerToken: 'tok', viewPath: '/t/aB3dE5fG7hJ9', expiresAt: new Date(t + 4 * 3600_000).toISOString() }),
      sharePut: vi.fn(async (_i: string, _k: string, b: { status: string; lat?: number }) => void puts.push({ status: b.status, lat: b.lat, at: t })),
      shareDelete: vi.fn(async () => {}),
    } as unknown as Api;
    const hs = createHelpShare(memoryKV(), now);
    const dispose = hs.track(api, platform as never, timers);
    expect(platform.location.watch).not.toHaveBeenCalled();
    await hs.start(api, { destName: 'Where I am', lang: 'en' }, null, { lat: 1.33, lng: 103.85, acc: 10 });
    await Promise.resolve();
    expect(platform.location.watch).toHaveBeenCalledTimes(1);
    expect(puts).toHaveLength(1);
    // Still, 10 s later: nothing new. Moved 100 m after 15 s: sent.
    onFix({ lat: 1.33, lng: 103.85, acc: 10 });
    await advance(10_000);
    expect(puts).toHaveLength(1);
    onFix({ lat: 1.3309, lng: 103.85, acc: 10 });
    await advance(6_000);
    expect(puts).toHaveLength(2);
    expect(puts[1]).toMatchObject({ status: 'help', lat: 1.3309 });
    // Standing still: one update a minute, even without new fixes.
    await advance(61_000);
    expect(puts).toHaveLength(3);
    // 我没事了 stops the watch and the updates.
    await hs.end(api);
    expect(stopWatch).toHaveBeenCalled();
    const n = puts.length;
    await advance(5 * 60_000);
    expect(puts).toHaveLength(n);
    // A share that expires while the app is open is dropped (Creative M4).
    await hs.start(api, { destName: 'Where I am', lang: 'en' }, null, null);
    await Promise.resolve();
    expect(hs.current.value).not.toBeNull();
    await advance(4 * 3600_000 + 2000);
    expect(hs.current.value).toBeNull();
    dispose();
  });
  it('message copy: link, help, no time; AC 47 plain fallback', () => {
    expect(tf('zh', 'hp_share_msg', { url: 'https://howtogo.local/t/aB3dE5fG7hJ9' })).toBe('我需要帮忙，我在这里：https://howtogo.local/t/aB3dE5fG7hJ9');
    expect(tf('zh', 'hp_share_plain', { a: '51 Bishan Street 13', u: 'https://maps.google.com/?q=1.35,103.85' })).toMatch(/^我需要帮忙。我在这里：51 Bishan Street 13 /);
  });
});

describe('QA-46 share message (AC 5): no times', () => {
  it.each(['zh', 'en'] as const)('%s: destination + link only', (l) => {
    const msg = tf(l, 'sh_msg_not', { dest: 'Tan Tock Seng Hospital', url: 'https://howtogo.local/t/aB3dE5fG7hJ9' });
    expect(msg).toContain('Tan Tock Seng Hospital');
    expect(msg).not.toMatch(/\d{1,2}:\d{2}|\{t\}/);
  });
});

describe('QA-42 radiogroup keys', () => {
  const L = ['a', 'b', 'c'] as const;
  it('arrows move and wrap; other keys do nothing', () => {
    expect(radioStep(L, 'a', 'ArrowRight')).toBe('b');
    expect(radioStep(L, 'c', 'ArrowDown')).toBe('a');
    expect(radioStep(L, 'a', 'ArrowLeft')).toBe('c');
    expect(radioStep(L, null, 'ArrowUp')).toBe('c');
    expect(radioStep(L, 'a', 'Enter')).toBeNull();
  });
});

describe('QA-45 create errors (AC 44/47)', () => {
  it('429 → rate, offline → offline, else other', () => {
    expect(failKind(new ApiError('http', { status: 429, code: 'rate_limited' }))).toBe('rate');
    expect(failKind(new ApiError('offline'))).toBe('offline');
    expect(failKind(new ApiError('http', { status: 502, code: 'upstream_unavailable' }))).toBe('other');
    expect(failKind(new Error('x'))).toBe('other');
    expect(tf('zh', 'err_rate')).toContain('请稍后再试');
  });
});
