/**
 * Builds SYNTHETIC OneMap pt routing bodies with the same field set as a
 * real OneMap response (OTP-style; see docs/process/dev-log.md for the
 * verified shape). Times are derived from distances so fixtures stay
 * self-consistent. Stop names/codes are realistic but the trips are invented.
 */
import { encodePolyline, haversine } from '../../src/geo';
import type { LatLng } from '../../src/types';

export type P = [number, number];

export interface StopSpec {
  name: string;
  lat: number;
  lng: number;
  /** Bus stop code ("52009") or station code ("NS17"); omit for Origin/Destination. */
  code?: string;
}

export interface WalkSpec {
  mode: 'WALK';
  from: StopSpec;
  to: StopSpec;
  /** Intermediate path vertices between from and to. */
  via?: P[];
  /** OTP walk steps: the first is always DEPART at `from`. */
  turns?: { at: P; dir: string; street?: string }[];
}

export interface TransitSpec {
  mode: 'BUS' | 'SUBWAY' | 'RAIL' | 'TRAM';
  route: string;
  routeLongName: string;
  agencyName: string;
  agencyId: string;
  /** board stop, intermediate stops…, alight stop */
  stops: StopSpec[];
  /** Seconds waiting at the boarding stop before departure. */
  waitS: number;
}

export type LegSpec = WalkSpec | TransitSpec;

export interface ItinSpec {
  legs: LegSpec[];
  fare?: string | number;
}

const WALK_MPS = 1.2;
const BUS_MPS = 6;
const TRAIN_MPS = 11;

const ll = (s: StopSpec | P): LatLng => (Array.isArray(s) ? { lat: s[0], lng: s[1] } : { lat: s.lat, lng: s.lng });

function pathLength(pts: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1]!, pts[i]!);
  return d;
}

function place(s: StopSpec, extra: Record<string, unknown>) {
  const o: Record<string, unknown> = { name: s.name };
  if (s.code) {
    o.stopId = `FERRY:${s.code}`;
    o.stopCode = s.code;
  }
  o.lon = s.lng;
  o.lat = s.lat;
  Object.assign(o, extra);
  o.vertexType = s.code ? 'TRANSIT' : 'NORMAL';
  return o;
}

export function buildPlan(from: StopSpec, to: StopSpec, startTime: number, itins: ItinSpec[]) {
  return {
    requestParameters: {
      mode: 'TRANSIT,WALK',
      arriveBy: 'false',
      showIntermediateStops: 'true',
      fromPlace: `${from.lat},${from.lng}`,
      toPlace: `${to.lat},${to.lng}`,
      maxWalkDistance: '1000',
      numItineraries: '3',
    },
    plan: {
      date: startTime,
      from: { name: 'Origin', lon: from.lng, lat: from.lat, vertexType: 'NORMAL' },
      to: { name: 'Destination', lon: to.lng, lat: to.lat, vertexType: 'NORMAL' },
      itineraries: itins.map((it) => buildItinerary(startTime, it)),
    },
  };
}

function buildItinerary(startTime: number, spec: ItinSpec) {
  let t = startTime;
  let walkTime = 0;
  let transitTime = 0;
  let waitingTime = 0;
  let walkDistance = 0;
  let transitLegs = 0;
  const legs = spec.legs.map((leg) => {
    if (leg.mode === 'WALK') {
      const pts = [ll(leg.from), ...(leg.via ?? []).map(ll), ll(leg.to)];
      const distance = Math.round(pathLength(pts) * 100) / 100;
      const duration = Math.round(distance / WALK_MPS);
      const start = t;
      const end = t + duration * 1000;
      t = end;
      walkTime += duration;
      walkDistance += distance;
      const steps = [
        {
          distance,
          relativeDirection: 'DEPART',
          streetName: 'path',
          absoluteDirection: 'NORTH',
          stayOn: false,
          area: false,
          bogusName: true,
          lon: leg.from.lng,
          lat: leg.from.lat,
          elevation: '',
          walkingBike: false,
        },
        ...(leg.turns ?? []).map((tn) => ({
          distance: 50,
          relativeDirection: tn.dir,
          streetName: tn.street ?? 'path',
          absoluteDirection: 'SOUTH',
          stayOn: false,
          area: false,
          bogusName: !tn.street,
          lon: tn.at[1],
          lat: tn.at[0],
          elevation: '',
          walkingBike: false,
        })),
      ];
      return {
        startTime: start,
        endTime: end,
        departureDelay: 0,
        arrivalDelay: 0,
        realTime: false,
        distance,
        pathway: false,
        mode: 'WALK',
        transitLeg: false,
        route: '',
        agencyTimeZoneOffset: 28800000,
        interlineWithPreviousLeg: false,
        from: place(leg.from, { departure: start }),
        to: place(leg.to, { arrival: end, departure: end }),
        legGeometry: { points: encodePolyline(pts), length: pts.length },
        steps,
        rentedBike: false,
        walkingBike: false,
        duration,
      };
    }
    // transit
    transitLegs++;
    waitingTime += leg.waitS;
    const arriveAtStop = t;
    t += leg.waitS * 1000;
    const pts = leg.stops.map(ll);
    const distance = Math.round(pathLength(pts) * 100) / 100;
    const mps = leg.mode === 'BUS' ? BUS_MPS : TRAIN_MPS;
    const start = t;
    // per-stop times proportional to distance
    const stopTimes: number[] = [start];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += haversine(pts[i - 1]!, pts[i]!);
      stopTimes.push(start + Math.round(acc / mps) * 1000);
    }
    const end = stopTimes[stopTimes.length - 1]!;
    const duration = Math.round((end - start) / 1000);
    transitTime += duration;
    t = end;
    const board = leg.stops[0]!;
    const alight = leg.stops[leg.stops.length - 1]!;
    const idx0 = 7;
    return {
      startTime: start,
      endTime: end,
      departureDelay: 0,
      arrivalDelay: 0,
      realTime: false,
      distance,
      pathway: false,
      mode: leg.mode,
      transitLeg: true,
      route: leg.route,
      agencyName: leg.agencyName,
      agencyTimeZoneOffset: 28800000,
      routeType: leg.mode === 'BUS' ? 3 : leg.mode === 'TRAM' ? 0 : 1,
      routeId: leg.route,
      interlineWithPreviousLeg: false,
      agencyId: leg.agencyId,
      tripId: `${leg.route}-2-3001`,
      serviceDate: new Date(start + 8 * 3600e3).toISOString().slice(0, 10),
      from: place(board, { arrival: arriveAtStop, departure: start, stopIndex: idx0, stopSequence: idx0 + 1 }),
      to: place(alight, {
        arrival: end,
        departure: end,
        stopIndex: idx0 + leg.stops.length - 1,
        stopSequence: idx0 + leg.stops.length,
      }),
      intermediateStops: leg.stops.slice(1, -1).map((s, i) =>
        place(s, {
          arrival: stopTimes[i + 1],
          departure: stopTimes[i + 1]! + 30000,
          stopIndex: idx0 + i + 1,
          stopSequence: idx0 + i + 2,
        }),
      ),
      legGeometry: { points: encodePolyline(pts), length: pts.length },
      steps: [],
      routeShortName: leg.route,
      routeLongName: leg.routeLongName,
      duration,
    };
  });
  const duration = Math.round((t - startTime) / 1000);
  return {
    duration,
    startTime,
    endTime: t,
    walkTime,
    transitTime,
    waitingTime,
    walkDistance: Math.round(walkDistance * 100) / 100,
    walkLimitExceeded: false,
    elevationLost: 0,
    elevationGained: 0,
    transfers: Math.max(0, transitLegs - 1),
    fare: spec.fare,
    tooSloped: false,
    legs,
  };
}
