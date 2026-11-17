/**
 * Deterministic GPS fix stream along an itinerary's geometry, for tests and
 * the prototype / QA demo mode. Seeded RNG → same input, same fixes.
 */
import { bearing, cumulativeDistances, destination, pointAlong } from './geo';
import type { Fix, Itinerary, LatLng } from './types';

export interface SimulateOptions {
  /** m/s. Elderly walking pace ≈ 1.0. */
  speedWalk?: number;
  speedBus?: number;
  speedTrain?: number;
  /** Max random offset (m) applied to each fix, uniform in a disk. */
  jitterM?: number;
  seed?: number;
  /** Seconds between fixes. */
  intervalS?: number;
  /** Reported accuracy (m). Default jitterM + 5. */
  acc?: number;
  /** Cap on simulated waiting time per boarding (s), to keep streams short. */
  waitCapS?: number;
  startTime?: number;
}

/** Small, fast, seedable PRNG (mulberry32). Returns a function yielding [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateFixes(itinerary: Itinerary, opts: SimulateOptions = {}): Fix[] {
  const speedWalk = opts.speedWalk ?? 1.0;
  const speedBus = opts.speedBus ?? 7;
  const speedTrain = opts.speedTrain ?? 12;
  const jitterM = opts.jitterM ?? 3;
  const intervalS = opts.intervalS ?? 2;
  const acc = opts.acc ?? jitterM + 5;
  const waitCapS = opts.waitCapS ?? 60;
  const rnd = mulberry32(opts.seed ?? 1);
  let t = opts.startTime ?? itinerary.startTime;
  const out: Fix[] = [];

  const jitter = (p: LatLng): LatLng => {
    if (jitterM <= 0) return p;
    const r = jitterM * Math.sqrt(rnd());
    return destination(p, rnd() * 360, r);
  };
  const push = (p: LatLng, heading: number | undefined, speed: number) => {
    const j = jitter(p);
    const fix: Fix = { lat: j.lat, lng: j.lng, acc, speed, t };
    if (heading !== undefined) fix.heading = Math.round(heading);
    out.push(fix);
    t += intervalS * 1000;
  };

  itinerary.legs.forEach((leg, i) => {
    const prev = itinerary.legs[i - 1];
    if (leg.mode !== 'walk') {
      const waitS = Math.min(waitCapS, Math.max(intervalS, prev ? (leg.startTime - prev.endTime) / 1000 : intervalS));
      for (let w = 0; w < waitS; w += intervalS) push(leg.from, undefined, 0);
    }
    const v = leg.mode === 'walk' ? speedWalk : leg.mode === 'bus' ? speedBus : speedTrain;
    const line = leg.geometry;
    const cum = cumulativeDistances(line);
    const len = cum[cum.length - 1] ?? 0;
    const dm = v * intervalS;
    const n = Math.max(1, Math.ceil(len / dm));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const along = Math.min(len, k * dm);
      const p = pointAlong(line, along, cum)!;
      const ahead = pointAlong(line, Math.min(len, along + 5), cum)!;
      const hd = along < len ? bearing(p, ahead) : undefined;
      push(p, hd, v);
    }
  });
  return out;
}

/**
 * Push fixes [from, from+count) sideways by offsetM (bearing in degrees),
 * to test off-route detection. Returns a new array.
 */
export function injectDeviation(fixes: readonly Fix[], from: number, count: number, offsetM: number, bearingDeg = 90): Fix[] {
  return fixes.map((f, i) => {
    if (i < from || i >= from + count) return f;
    const p = destination(f, bearingDeg, offsetM);
    return { ...f, lat: p.lat, lng: p.lng };
  });
}
