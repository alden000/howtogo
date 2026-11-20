/**
 * OneMap public-transport routing (`/api/public/routingsvc/route?routeType=pt`)
 * → engine types.
 *
 * OneMap wraps OpenTripPlanner. Shape verified against a published live
 * response (Nov 2025, see docs/process/dev-log.md): `plan.itineraries[].legs[]`,
 * epoch-ms times, seconds durations, `fare` as a string ("1.77"),
 * stop ids like "FERRY:NE8", station codes in `stopCode` ("NE8"), bus stop
 * codes ("14161"), `mode` WALK | BUS | SUBWAY, `route` "NE" / "963",
 * `routeLongName` "NORTH EAST LINE", walk `steps` often a single DEPART on
 * a bogus "path" street, transit legs with `steps: []`.
 *
 * Everything is parsed defensively: unknown fields are ignored, missing
 * fields are derived, bad legs are dropped with a warning.
 */
import { decodePolyline, dedupePoints, haversine } from './geo';
import { inferLine, transitModeForLine } from './lines';
import { BRAND_CASE } from './names';
import type { Itinerary, LatLng, Leg, Mode, PlanResult, Place, Stop, Turn } from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/[^0-9.eE+\-]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() === '' ? undefined : v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

/** Epoch ms from ms / seconds / ISO string. */
function time(v: unknown): number | undefined {
  if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}T/.test(v)) {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : undefined;
  }
  const n = num(v);
  if (n === undefined) return undefined;
  return n < 1e11 ? n * 1000 : n;
}

// ------------------------------------------------------------ names

const KEEP_UPPER = new Set(['MRT', 'LRT', 'SBS', 'SMRT', 'NTUC', 'HDB', 'CPF', 'ITE', 'NUS', 'NTU', 'SGH', 'TTSH', 'KKH', 'NUH', 'CDC', 'HQ']);

/** "FARRER PARK MRT STATION" → "Farrer Park"; "OPP BLK 61" → "Opp Blk 61". */
export function prettyStopName(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  s = s.replace(/\s+(MRT|LRT)(\s+STATION|\s+STN)?$/i, '').replace(/\s+STATION$/i, '');
  if (s !== s.toUpperCase()) return s; // already mixed case: trust it
  return s
    .split(' ')
    .map((w) => {
      if (BRAND_CASE[w]) return BRAND_CASE[w]; // QA-75: "7-ELEVEN" → "7-Eleven" before the digit rule
      if (KEEP_UPPER.has(w) || /\d/.test(w)) return w;
      return w
        .split(/([/-])/)
        .map((p) => BRAND_CASE[p] ?? (p.length > 0 && /[A-Z]/.test(p) ? p[0] + p.slice(1).toLowerCase() : p))
        .join('');
    })
    .join(' ');
}

/** "FARRER PK STN EXIT A" → "A"; "Exit 3" → "3". */
export function parseExit(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const m = /\bEXIT\s+([A-Z]?\d{0,2}[A-Z]?)\b/i.exec(s);
  return m && m[1] ? m[1].toUpperCase() : undefined;
}

function toStop(v: unknown, warnings: string[], ctx: string): Stop | undefined {
  if (!isObj(v)) return undefined;
  const lat = num(v.lat);
  const lng = num(v.lon ?? v.lng);
  if (lat === undefined || lng === undefined) {
    warnings.push(`${ctx}: stop without coordinates`);
    return undefined;
  }
  const name = str(v.name) ?? '';
  const stop: Stop = { name, displayName: prettyStopName(name), lat, lng };
  const code = str(v.stopCode);
  if (code) stop.code = code;
  const id = str(v.stopId);
  if (id) stop.id = id;
  if (!code && id && /:/.test(id)) stop.code = id.split(':').pop();
  const exit = parseExit(name);
  if (exit) stop.exit = exit;
  const arr = time(v.arrival);
  if (arr !== undefined) stop.arrival = arr;
  const dep = time(v.departure);
  if (dep !== undefined) stop.departure = dep;
  return stop;
}

function toMode(rawMode: string | undefined, routeType: number | undefined): Mode | 'unknown' {
  const m = (rawMode ?? '').toUpperCase();
  if (m === 'WALK' || m === 'FOOT') return 'walk';
  if (m === 'BUS' || routeType === 3) return 'bus';
  if (m === 'TRAM' || m === 'LRT' || m === 'MONORAIL' || routeType === 0) return 'lrt';
  if (['SUBWAY', 'RAIL', 'METRO', 'TRAIN', 'MRT'].includes(m) || routeType === 1 || routeType === 2) return 'mrt';
  return 'unknown';
}

function parseFare(v: unknown): number | undefined {
  if (isObj(v)) {
    // OTP style: { fare: { regular: { cents: 177 } } } or { regular: { cents } }
    const inner = isObj(v.fare) ? v.fare : v;
    const regular = isObj(inner.regular) ? inner.regular : undefined;
    const cents = num(regular?.cents);
    if (cents !== undefined) return Math.round(cents) / 100;
    return undefined;
  }
  const n = num(v);
  return n !== undefined && n >= 0 && n < 100 ? Math.round(n * 100) / 100 : undefined;
}

function toLeg(v: unknown, warnings: string[], ctx: string): Leg | undefined {
  if (!isObj(v)) {
    warnings.push(`${ctx}: not an object`);
    return undefined;
  }
  const routeType = num(v.routeType);
  const rawMode = str(v.mode);
  let mode = toMode(rawMode, routeType);
  const from = toStop(v.from, warnings, `${ctx}.from`);
  const to = toStop(v.to, warnings, `${ctx}.to`);

  let geometry: LatLng[] = [];
  const lg = v.legGeometry;
  const pts = isObj(lg) ? str(lg.points) : str(lg);
  if (pts) {
    try {
      geometry = dedupePoints(decodePolyline(pts));
    } catch {
      warnings.push(`${ctx}: bad polyline`);
    }
  }
  // sanity: drop geometry that is clearly not in the region of the endpoints
  if (geometry.length > 0 && from && haversine(geometry[0]!, from) > 5000) {
    warnings.push(`${ctx}: geometry far from leg start, ignored`);
    geometry = [];
  }
  if (!from || !to) {
    if (geometry.length < 2) {
      warnings.push(`${ctx}: dropped (no endpoints)`);
      return undefined;
    }
  }
  const start: Stop = from ?? { name: '', displayName: '', ...geometry[0]! };
  const end: Stop = to ?? { name: '', displayName: '', ...geometry[geometry.length - 1]! };
  if (geometry.length === 0) geometry = dedupePoints([start, end].map(({ lat, lng }) => ({ lat, lng })));

  const route = str(v.routeShortName) ?? str(v.route) ?? str(v.routeId);
  const routeLongName = str(v.routeLongName);
  let line = undefined as Leg['line'];
  if (mode === 'mrt' || mode === 'lrt' || mode === 'unknown') {
    line = inferLine({
      route: str(v.route),
      routeShortName: str(v.routeShortName),
      routeId: str(v.routeId),
      routeLongName,
      fromStopCode: start.code,
      toStopCode: end.code,
    });
    if (mode === 'unknown') {
      if (line) mode = transitModeForLine(line);
      else if (route) mode = 'bus';
      else {
        warnings.push(`${ctx}: unknown mode "${rawMode ?? ''}" treated as walk`);
        mode = 'walk';
      }
    } else if (line) {
      mode = transitModeForLine(line);
    }
  }

  const startTime = time(v.startTime) ?? start.departure ?? 0;
  const endTime = time(v.endTime) ?? end.arrival ?? startTime;
  const durationS = num(v.duration) ?? Math.max(0, (endTime - startTime) / 1000);
  let distanceM = num(v.distance);
  if (distanceM === undefined) {
    distanceM = 0;
    for (let i = 1; i < geometry.length; i++) distanceM += haversine(geometry[i - 1]!, geometry[i]!);
  }

  const intermediateStops: Stop[] = [];
  if (Array.isArray(v.intermediateStops)) {
    v.intermediateStops.forEach((s, i) => {
      const st = toStop(s, warnings, `${ctx}.intermediateStops[${i}]`);
      if (st) intermediateStops.push(st);
    });
  }

  const turns: Turn[] = [];
  if (Array.isArray(v.steps)) {
    for (const s of v.steps) {
      if (!isObj(s)) continue;
      const lat = num(s.lat);
      const lng = num(s.lon ?? s.lng);
      const direction = (str(s.relativeDirection) ?? '').toUpperCase();
      if (lat === undefined || lng === undefined || !direction) continue;
      const turn: Turn = { lat, lng, direction, distanceM: num(s.distance) ?? 0 };
      const street = str(s.streetName);
      if (street && s.bogusName !== true && !/^(path|road|service road|footway|steps)$/i.test(street)) {
        turn.streetName = street;
      }
      turns.push(turn);
    }
  }

  const leg: Leg = {
    mode: mode as Mode,
    from: start,
    to: end,
    startTime,
    endTime,
    durationS,
    distanceM,
    geometry,
    intermediateStops,
    turns,
  };
  if (mode !== 'walk' && route) leg.route = route;
  if (mode !== 'walk' && routeLongName) leg.routeLongName = routeLongName;
  const agency = str(v.agencyName);
  if (agency && mode !== 'walk') leg.agency = agency;
  if (line && mode !== 'walk' && mode !== 'bus') leg.line = line;
  const headsign = str(v.headsign) ?? str(v.tripHeadsign);
  if (headsign && mode !== 'walk') leg.headsign = headsign;
  return leg;
}

/** Merge consecutive walk legs into one. */
function mergeWalks(legs: Leg[]): Leg[] {
  const out: Leg[] = [];
  for (const leg of legs) {
    const prev = out[out.length - 1];
    if (prev && prev.mode === 'walk' && leg.mode === 'walk') {
      out[out.length - 1] = {
        ...prev,
        to: leg.to,
        endTime: leg.endTime,
        durationS: prev.durationS + leg.durationS,
        distanceM: prev.distanceM + leg.distanceM,
        geometry: dedupePoints([...prev.geometry, ...leg.geometry]),
        turns: [...prev.turns, ...leg.turns],
      };
    } else out.push(leg);
  }
  return out;
}

function toPlace(v: unknown): Place | undefined {
  if (!isObj(v)) return undefined;
  const lat = num(v.lat);
  const lng = num(v.lon ?? v.lng);
  if (lat === undefined || lng === undefined) return undefined;
  return { name: str(v.name) ?? '', lat, lng };
}

/**
 * Normalise a OneMap pt routing body (object or JSON string).
 * Never throws.
 */
export function normalizeOneMapPlan(raw: unknown): PlanResult {
  const warnings: string[] = [];
  let body: unknown = raw;
  if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'malformed', message: 'Body is not valid JSON', warnings };
    }
  }
  if (!isObj(body)) return { ok: false, error: 'malformed', message: 'Body is not an object', warnings };

  const plan = isObj(body.plan) ? body.plan : undefined;
  const errField = body.error;
  const itRaw = plan && Array.isArray(plan.itineraries) ? plan.itineraries : undefined;

  if (!itRaw || itRaw.length === 0) {
    if (errField !== undefined) {
      const msg = isObj(errField) ? str(errField.msg) ?? str(errField.message) ?? 'error' : str(errField) ?? 'error';
      const noPath = isObj(errField) && (errField.noPath === true || /PATH|NOT_FOUND|LOCATION/i.test(msg));
      return { ok: false, error: noPath ? 'no_route' : 'api_error', message: msg, warnings };
    }
    if (body.plan !== undefined && !plan) {
      return { ok: false, error: 'malformed', message: 'plan is not an object', warnings };
    }
    if (plan && plan.itineraries !== undefined && !Array.isArray(plan.itineraries)) {
      return { ok: false, error: 'malformed', message: 'plan.itineraries is not an array', warnings };
    }
    return { ok: false, error: 'no_route', message: 'No itineraries', warnings };
  }

  const itineraries: Itinerary[] = [];
  itRaw.forEach((it, i) => {
    const ctx = `itineraries[${i}]`;
    if (!isObj(it) || !Array.isArray(it.legs)) {
      warnings.push(`${ctx}: dropped (no legs)`);
      return;
    }
    const legs: Leg[] = [];
    it.legs.forEach((l, j) => {
      const leg = toLeg(l, warnings, `${ctx}.legs[${j}]`);
      if (leg) legs.push(leg);
    });
    if (legs.length === 0) {
      warnings.push(`${ctx}: dropped (no usable legs)`);
      return;
    }
    const merged = mergeWalks(legs);
    const first = merged[0]!;
    const last = merged[merged.length - 1]!;
    const startTime = time(it.startTime) ?? first.startTime;
    const endTime = time(it.endTime) ?? last.endTime;
    const durationS = num(it.duration) ?? Math.max(0, (endTime - startTime) / 1000);
    const walkLegs = merged.filter((l) => l.mode === 'walk');
    const transitLegs = merged.filter((l) => l.mode !== 'walk');
    const walkTimeS = num(it.walkTime) ?? walkLegs.reduce((a, l) => a + l.durationS, 0);
    const transitTimeS = num(it.transitTime) ?? transitLegs.reduce((a, l) => a + l.durationS, 0);
    const waitingTimeS = num(it.waitingTime) ?? Math.max(0, durationS - walkTimeS - transitTimeS);
    const walkDistanceM = num(it.walkDistance) ?? walkLegs.reduce((a, l) => a + l.distanceM, 0);
    const itinerary: Itinerary = {
      id: `${i}:${transitLegs.map((l) => l.route ?? l.mode).join('>') || 'walk'}@${startTime}`,
      startTime,
      endTime,
      durationS,
      walkTimeS,
      transitTimeS,
      waitingTimeS,
      walkDistanceM,
      transfers: Math.max(0, transitLegs.length - 1),
      legs: merged,
    };
    const fare = parseFare(it.fare);
    if (fare !== undefined) itinerary.fare = fare;
    itineraries.push(itinerary);
  });

  if (itineraries.length === 0) {
    return { ok: false, error: 'malformed', message: 'No usable itineraries', warnings };
  }
  const result: PlanResult = { ok: true, itineraries, warnings };
  const from = toPlace(plan?.from);
  const to = toPlace(plan?.to);
  if (from) result.from = from;
  if (to) result.to = to;
  return result;
}
