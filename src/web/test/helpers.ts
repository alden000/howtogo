import { normalizeOneMapPlan, type Itinerary, type Place } from '@howtogo/shared';
import { FIXTURES, type FixtureName } from '@howtogo/shared/fixtures';
import type { Api } from '../src/api/types';

export function itinerary(name: FixtureName = 'toaPayohToTTSH', i = 0): Itinerary {
  const p = normalizeOneMapPlan(FIXTURES[name]);
  if (!p.ok) throw new Error('fixture failed');
  return p.itineraries[i]!;
}

export function placesFor(it: Itinerary, destName = 'Tan Tock Seng Hospital'): Place[] {
  const a = it.legs[0]!.from;
  const b = it.legs[it.legs.length - 1]!.to;
  return [
    { name: 'Start', lat: a.lat, lng: a.lng },
    { name: destName, lat: b.lat, lng: b.lng },
  ];
}

/** Manual timers for deterministic runtime tests. */
export function manualTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void; every?: number }>();
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      const id = ++seq;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id: unknown) => void pending.delete(id as number),
    setInterval: (fn: () => void, ms: number) => {
      const id = ++seq;
      pending.set(id, { at: now + ms, fn, every: ms });
      return id;
    },
    clearInterval: (id: unknown) => void pending.delete(id as number),
    /** Advance the clock, running due timers in order. */
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, t] = due;
        now = t.at;
        if (t.every) t.at += t.every;
        else pending.delete(id);
        t.fn();
      }
      now = end;
    },
    set(ms: number) {
      now = ms;
    },
    pendingCount: () => pending.size,
  };
}

export const flush = () => new Promise((r) => setTimeout(r, 0));

export function stubApi(over: Partial<Api> = {}): Api {
  const no = () => Promise.reject(new Error('not stubbed'));
  return {
    search: no,
    route: no,
    revgeocode: no,
    busArrival: no,
    alerts: no,
    lifts: no,
    setupCreate: no,
    setupGet: no,
    shareCreate: no,
    sharePut: no,
    shareGet: no,
    shareDelete: () => Promise.resolve(),
    shareLive: () => ({ close() {} }),
    ...over,
  };
}
