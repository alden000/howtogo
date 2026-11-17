/**
 * Contract: every live-share PUT body the web runtime can send passes the
 * Worker's own validator (`validateUpdate` in src/worker/src/share.ts, the
 * PUT /api/share/:id contract in src/worker/API.md). The Worker module imports
 * `cloudflare:workers` for its Durable Object class; vite.config.ts aliases it to
 * test/stubs/cloudflare-workers.ts because only the pure validator is exercised.
 */
import { describe, expect, it } from 'vitest';
import { buildSteps, createGuidance, guidanceReducer, injectDeviation, SHARE_STATUSES, simulateFixes, toSharePayload, type GuidanceState } from '@howtogo/shared';
import type { SharePut } from '../src/api/types';
import { createFakePlatform } from '../src/platform/fake';
import { createStore } from '../src/state/store';
import { memoryKV } from '../src/state/storage';
import { createTripRuntime } from '../src/trip/runtime';
import { flush, itinerary, manualTimers, placesFor, stubApi } from './helpers';

// Loaded by a non-literal path so the web typecheck does not pull in the Worker's workerd types.
const WORKER_SHARE: string = new URL('../../worker/src/share.ts', import.meta.url).pathname;
const { STATUSES, validateUpdate } = (await import(/* @vite-ignore */ WORKER_SHARE)) as {
  STATUSES: readonly string[];
  validateUpdate(body: unknown): unknown;
};

describe('live-share payload ↔ Worker contract (API.md)', () => {
  it('the shared status enum is exactly the Worker STATUSES', () => {
    expect([...SHARE_STATUSES].sort()).toEqual([...STATUSES].sort());
    // the validator really rejects the old engine values
    const ok = { lat: 1.33, lng: 103.85, acc: 8, status: 'travelling', updatedAt: 1 };
    expect(() => validateUpdate(ok)).not.toThrow();
    for (const bad of ['active', 'off_route', 'gps_weak']) expect(() => validateUpdate({ ...ok, status: bad })).toThrow();
  });

  it('every PUT body over whole trips (incl. off route, weak GPS, arrival, help) validates', async () => {
    const bodies: SharePut[] = [];
    const timers = manualTimers();
    const platform = createFakePlatform();
    const store = createStore(memoryKV(), memoryKV(), { tripWriteMs: 0 });
    const api = stubApi({
      shareCreate: async () => ({ id: 'abc123def456', ownerToken: 'tok', viewPath: '/t/abc123def456', expiresAt: '' }),
      sharePut: async (_i, _t, b) => void bodies.push(b),
      route: async () => {
        throw new Error('offline');
      },
    });
    const runtime = createTripRuntime({ store, platform, api, now: timers.now, timers, isOnline: () => true });
    const it0 = itinerary();
    let fixes = injectDeviation(simulateFixes(it0, { seed: 4 }), 5, 6, 150);
    fixes = fixes.map((f, i) => (i > 20 && i < 26 ? { ...f, acc: 300 } : f)); // weak spell
    timers.set(fixes[0]!.t);
    await runtime.start(it0, placesFor(it0));
    await runtime.startShare();
    for (const [i, f] of fixes.entries()) {
      timers.advance(Math.max(0, f.t - timers.now()));
      platform.fake.emit(f);
      await flush();
      if (i === 30) runtime.help();
      if (i === 32) runtime.clearHelp();
    }
    timers.advance(10_000);
    await flush();
    expect(bodies.length).toBeGreaterThan(5);
    const statuses = new Set<string>();
    for (const b of bodies) {
      // JSON round-trip: what actually goes over the wire.
      const wire = JSON.parse(JSON.stringify(b)) as unknown;
      expect(() => validateUpdate(wire)).not.toThrow();
      statuses.add(b.status);
    }
    expect(statuses).toEqual(new Set(['travelling', 'help', 'arrived']));
  });

  it('shared toSharePayload output validates for every guidance state of a trip', () => {
    const it0 = itinerary('bishanToRafflesPlace');
    let g: GuidanceState = createGuidance(buildSteps(it0, 'en'), it0.startTime);
    for (const fix of simulateFixes(it0, { seed: 2 })) {
      g = guidanceReducer(g, { type: 'fix', fix });
      const p = toSharePayload(g);
      if (p) expect(() => validateUpdate(JSON.parse(JSON.stringify(p)))).not.toThrow();
    }
  });
});
