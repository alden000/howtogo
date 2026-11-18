/** M5 AC 17d: storage migrations keep (or repair) every stored key; AC 25: the documented key inventory. */
import { describe, expect, it } from 'vitest';
import { buildSteps, createGuidance } from '@howtogo/shared';
import { CURRENT_SCHEMA, MIGRATIONS, SCHEMA_KEY, STORAGE_KEYS, runMigrations, storedSchema, type Migration } from '../src/state/migrations';
import { memoryKV } from '../src/state/storage';
import { createStore, type ActiveTrip } from '../src/state/store';
import { itinerary, placesFor } from './helpers';

/** What a 0.3/0.4 install has on the phone: places, recents (legacy + v2), settings, contacts, an active trip with a live share. */
function previousRelease() {
  const it0 = itinerary();
  const trip: ActiveTrip = {
    id: 'trip-a',
    places: placesFor(it0),
    itinerary: it0,
    lang: 'zh-CN',
    guidance: { ...createGuidance(buildSteps(it0, 'zh-CN'), 0), stepIndex: 2 },
    startedAt: 1_000,
    reroutes: 0,
    share: { id: 'ShareId12345', ownerToken: 'owner-token', viewPath: '/t/ShareId12345', expiresAt: '2026-11-18T12:00:00.000Z', status: 'travelling' },
  };
  return {
    trip,
    kv: memoryKV({
      settings: JSON.stringify({ lang: 'en', textSize: 'xlarge', theme: 'dark', muted: false, preference: 'least_walk', motion: 'auto', name: '阿姨', onboarded: true, haptics: true }),
      places: JSON.stringify({ home: { name: 'Home', lat: 1.35, lng: 103.85 }, others: [{ name: 'Clinic', label: '诊所', lat: 1.32, lng: 103.84 }] }),
      'recents.v2': JSON.stringify([{ to: { name: 'TTSH', lat: 1.3215, lng: 103.8459 }, date: '2026-11-17', done: true }]),
      recents: JSON.stringify([{ to: { name: 'Old place', lat: 1.3, lng: 103.8 }, at: Date.UTC(2026, 9, 1) }]),
      'family.v1': JSON.stringify([{ id: 'c1', name: '女儿', phone: '+6591234567' }]),
      'prefs.m34': JSON.stringify({ liftFriendly: true }),
      'trip.v1': JSON.stringify(trip),
      'notify.asked': '1',
    }),
  };
}

describe('runMigrations (AC 17d)', () => {
  it('0.x → current: every key intact, schema stamped, the trip resumes with the same share id', () => {
    const { kv, trip } = previousRelease();
    const before = { ...kv.data };
    const r = runMigrations(kv);
    expect(r).toEqual({ from: 0, to: CURRENT_SCHEMA, ran: MIGRATIONS.map((m) => m.name), newer: false });
    expect(kv.data[SCHEMA_KEY]).toBe(String(CURRENT_SCHEMA));
    for (const k of Object.keys(before)) expect(kv.data[k], k).toBeDefined();
    expect(JSON.parse(kv.data['settings']!)).toEqual(JSON.parse(before['settings']!));
    expect(JSON.parse(kv.data['family.v1']!)).toEqual(JSON.parse(before['family.v1']!));
    expect(JSON.parse(kv.data['trip.v1']!)).toEqual(JSON.parse(before['trip.v1']!));

    const store = createStore(kv, memoryKV());
    expect(store.trip.value?.id).toBe(trip.id);
    expect(store.trip.value?.share?.id).toBe('ShareId12345');
    expect(store.trip.value?.guidance.stepIndex).toBe(2);
    expect(store.places.value.home?.name).toBe('Home');
    expect(store.places.value.others).toHaveLength(1);
    expect(store.settings.value).toMatchObject({ lang: 'en', textSize: 'xlarge', name: '阿姨', batterySaver: 'auto', errorCounts: true });
    // The legacy recents list is folded into recents.v2 and removed.
    expect(store.recents.value.map((x) => x.to.name)).toEqual(['TTSH', 'Old place']);
    expect(kv.data['recents']).toBeUndefined();
    store.dispose();
  });

  it('is idempotent: a second run does nothing and changes nothing', () => {
    const { kv } = previousRelease();
    runMigrations(kv);
    const once = { ...kv.data };
    expect(runMigrations(kv)).toEqual({ from: CURRENT_SCHEMA, to: CURRENT_SCHEMA, ran: [], newer: false });
    expect(kv.data).toEqual(once);
  });

  it('a fresh install just gets the schema stamp', () => {
    const kv = memoryKV();
    runMigrations(kv);
    expect(kv.data).toEqual({ [SCHEMA_KEY]: String(CURRENT_SCHEMA) });
  });

  it('repairs broken shapes without losing the good parts', () => {
    const kv = memoryKV({
      settings: '{nope',
      places: JSON.stringify({ home: { name: 'Home' }, others: 'x' }),
      'family.v1': JSON.stringify([{ name: 'ok' }, 'junk', 3]),
      'trip.v1': JSON.stringify({ id: 'x' }),
    });
    runMigrations(kv);
    expect(kv.data['settings']).toBeUndefined(); // unparsable → removed; the store falls back to defaults
    expect(JSON.parse(kv.data['places']!)).toEqual({ others: [] });
    expect(JSON.parse(kv.data['family.v1']!)).toEqual([{ name: 'ok' }]);
    expect(kv.data['trip.v1']).toBeUndefined();
    expect(createStore(kv, memoryKV()).settings.value.lang).toBe('zh');
  });

  it('a newer schema (downgrade / old tab) is never rewritten', () => {
    const kv = memoryKV({ [SCHEMA_KEY]: String(CURRENT_SCHEMA + 5), places: '"future-format"' });
    expect(runMigrations(kv)).toMatchObject({ newer: true, ran: [] });
    expect(kv.data['places']).toBe('"future-format"');
    expect(storedSchema(kv)).toBe(CURRENT_SCHEMA + 5);
  });

  it('a failing step stops the chain, keeps the data and is retried next launch', () => {
    const kv = memoryKV({ places: '{"others":[]}' });
    const steps: Migration[] = [
      { to: 1, name: 'ok', run: (k) => k.set('a', '1') },
      { to: 2, name: 'boom', run: () => { throw new Error('x'); } },
      { to: 3, name: 'later', run: (k) => k.set('c', '1') },
    ];
    expect(runMigrations(kv, steps, 3)).toEqual({ from: 0, to: 1, ran: ['ok'], newer: false });
    expect(kv.data['c']).toBeUndefined();
    expect(kv.data['places']).toBe('{"others":[]}');
    expect(storedSchema(kv)).toBe(1);
  });
});

describe('storage key inventory (AC 25)', () => {
  // Every literal key the app reads/writes through the KV helpers must be documented in STORAGE_KEYS.
  const sources = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const documented = new Set<string>([...STORAGE_KEYS.local, ...STORAGE_KEYS.legacy]);
  const sessionPatterns = STORAGE_KEYS.session.map((k) => new RegExp('^' + k.replace('.', '\\.').replace('*', '.*') + '$'));

  it('every local key used in src is documented', () => {
    const used = new Set<string>();
    for (const [file, src] of Object.entries(sources)) {
      if (file.includes('/api/mock') || file.includes('/viewer/')) continue; // demo-only / family page (own key)
      for (const m of src.matchAll(/(?:readJSON|writeJSON)(?:<[^>]*>)?\((?:kv|local|this\.kv), *['"]([\w.-]+)['"]/g)) used.add(m[1]!);
      for (const m of src.matchAll(/(?:^|\s)local\.(?:get|set|remove)\(['"]([\w.-]+)['"]/gm)) used.add(m[1]!);
      for (const m of src.matchAll(/const [A-Z_]*KEY = ['"]([\w.-]+)['"]/g)) if (!file.includes('/state/storage')) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(5);
    expect([...used].filter((k) => !documented.has(k) && !sessionPatterns.some((re) => re.test(k)))).toEqual([]);
  });
});
