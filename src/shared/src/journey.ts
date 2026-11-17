/**
 * Multi-stop journeys (A → B → … → n). OneMap pt routing has no via-points,
 * so we route each segment separately and chain departure times:
 * segment k departs at arrival of segment k−1 plus the dwell at that place.
 */
import { normalizeOneMapPlan } from './onemap';
import { rankItineraries } from './rank';
import type { Itinerary, Journey, JourneySegment, Place, PlanResult, RoutePreference } from './types';

/**
 * Fetches a plan for one segment. May return the raw OneMap body or an
 * already-normalised PlanResult. `departAt` is epoch ms (pass it to OneMap's
 * date/time parameters in SGT).
 */
export type FetchPlan = (from: Place, to: Place, departAt: number) => Promise<unknown>;

export interface PlanJourneyOptions {
  departAt: number;
  preference?: RoutePreference;
  /** Default dwell at each waypoint in minutes when the place has no dwellMin. */
  defaultDwellMin?: number;
  /**
   * Itineraries may start later than requested (waiting for the first bus is
   * inside OneMap's plan). We trust the itinerary's own times.
   */
}

function isPlanResult(v: unknown): v is PlanResult {
  return typeof v === 'object' && v !== null && 'ok' in v && typeof (v as { ok: unknown }).ok === 'boolean';
}

/** Re-time an itinerary so it starts at `departAt` (used when OneMap returns a plan for a different clock time). */
export function shiftItinerary(it: Itinerary, departAt: number): Itinerary {
  const d = departAt - it.startTime;
  if (d === 0) return it;
  const sh = (x: number) => x + d;
  return {
    ...it,
    startTime: sh(it.startTime),
    endTime: sh(it.endTime),
    legs: it.legs.map((l) => ({
      ...l,
      startTime: sh(l.startTime),
      endTime: sh(l.endTime),
    })),
  };
}

export async function planJourney(places: readonly Place[], fetchPlan: FetchPlan, opts: PlanJourneyOptions): Promise<Journey> {
  const preference = opts.preference ?? 'fastest';
  const segments: JourneySegment[] = [];
  let clock = opts.departAt;
  let ok = places.length >= 2;

  for (let i = 0; i + 1 < places.length; i++) {
    const from = places[i]!;
    const to = places[i + 1]!;
    const dwellS = i === 0 ? 0 : Math.round((from.dwellMin ?? opts.defaultDwellMin ?? 0) * 60);
    const departAt = clock + dwellS * 1000;
    const seg: JourneySegment = { from, to, alternatives: [], dwellS, departAt };
    segments.push(seg);
    if (!ok) {
      seg.error = 'previous_segment_failed';
      continue;
    }
    let plan: PlanResult;
    try {
      const raw = await fetchPlan(from, to, departAt);
      plan = isPlanResult(raw) ? raw : normalizeOneMapPlan(raw);
    } catch (e) {
      plan = { ok: false, error: 'api_error', message: e instanceof Error ? e.message : String(e), warnings: [] };
    }
    if (!plan.ok) {
      seg.error = plan.error;
      ok = false;
      continue;
    }
    // Drop itineraries that would leave before we are ready (stale plans).
    const usable = plan.itineraries.filter((it) => it.startTime >= departAt - 60_000);
    const pool = usable.length > 0 ? usable : plan.itineraries.map((it) => shiftItinerary(it, departAt));
    seg.alternatives = rankItineraries(pool, preference);
    const chosen = seg.alternatives[0]!.itinerary;
    seg.itinerary = chosen;
    seg.arriveAt = chosen.endTime;
    clock = chosen.endTime;
  }

  const journey: Journey = { places: [...places], segments, preference, startTime: opts.departAt, ok };
  if (ok) {
    journey.endTime = clock;
    journey.totalDurationS = Math.round((clock - opts.departAt) / 1000);
    journey.etaISO = new Date(clock).toISOString();
  }
  return journey;
}

/** Swap the chosen itinerary of one segment and re-chain later segments' times. */
export function chooseSegmentItinerary(journey: Journey, segmentIndex: number, itineraryId: string): Journey {
  const segments = journey.segments.map((s) => ({ ...s }));
  const seg = segments[segmentIndex];
  const pick = seg?.alternatives.find((a) => a.itinerary.id === itineraryId)?.itinerary;
  if (!seg || !pick) return journey;
  seg.itinerary = pick;
  seg.arriveAt = pick.endTime;
  let clock = pick.endTime;
  for (let i = segmentIndex + 1; i < segments.length; i++) {
    const s = segments[i]!;
    s.departAt = clock + s.dwellS * 1000;
    if (s.itinerary) {
      s.itinerary = shiftItinerary(s.itinerary, Math.max(s.departAt, s.itinerary.startTime));
      s.arriveAt = s.itinerary.endTime;
      clock = s.itinerary.endTime;
    }
  }
  const out: Journey = { ...journey, segments };
  if (journey.ok) {
    out.endTime = clock;
    out.totalDurationS = Math.round((clock - journey.startTime) / 1000);
    out.etaISO = new Date(clock).toISOString();
  }
  return out;
}
