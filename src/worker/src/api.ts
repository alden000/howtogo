import type { Env } from "./env";
import { cached } from "./cache";
import { inSingapore, parseLatLng, round } from "./geo";
import { HttpError, UpstreamError, json, rawJson } from "./http";
import {
  ALERT_SCENARIOS,
  BUS_SCENARIOS,
  LIFT_SCENARIOS,
  fixtureAlerts,
  fixtureBusArrival,
  fixtureLifts,
  fixtureMode,
  fixtureRevGeocode,
  fixtureRoute,
  fixtureScenario,
  fixtureSearch,
} from "./fixtures";
import { ltaBusArrival, ltaGet, ltaSource } from "./lta";
import { normaliseBusArrival, normaliseLifts, normaliseRevGeocode, normaliseSearch, normaliseTrainAlerts } from "./normalise";
import { oneMapGet } from "./onemap";

type Ctx = Pick<ExecutionContext, "waitUntil">;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError();
  }
}

function bad(code: string, message: string): never {
  throw new HttpError(400, code, message);
}

const notConfigured = () => new HttpError(503, "not_configured", "This feature is not set up yet.");

/** AC 17 cache lifetimes (seconds). */
export const TTL = { search: 86_400, route: 120, revgeocode: 3_600, bus: 20, alerts: 60, lifts: 300 } as const;

const cacheHeaders = (maxAge: number, hit: boolean) => ({
  "Cache-Control": `private, max-age=${maxAge}`,
  "X-Cache": hit ? "HIT" : "MISS",
});

// ---------- /api/search ----------
export async function handleSearch(url: URL, env: Env, ctx?: Ctx): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (q.length < 1) bad("missing_query", "Please type a place name or postal code.");
  if (q.length > 100) bad("query_too_long", "The search text is too long.");
  if (fixtureMode(env)) return fixtureSearch(q);
  const key = `search:v1:${q.toLowerCase()}`;
  const { body, hit } = await cached(
    key,
    TTL.search,
    async () => {
      const res = await oneMapGet(
        env,
        `/api/common/elastic/search?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`,
        { requireToken: false },
      );
      return JSON.stringify(normaliseSearch(parseJson(await res.text())));
    },
    ctx,
  );
  return rawJson(body, 200, cacheHeaders(TTL.search, hit));
}

// ---------- /api/route ----------
export interface RouteParams {
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  date: string; // MM-DD-YYYY
  time: string; // HH:MM:SS
  mode: "TRANSIT" | "BUS" | "RAIL";
  maxWalkDistance?: number;
  numItineraries: number;
}

/** Current Singapore date/time (UTC+8, no DST) in OneMap's formats. */
export function sgNow(now = Date.now()): { date: string; time: string } {
  const d = new Date(now + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${d.getUTCFullYear()}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
  };
}

export function parseRouteParams(sp: URLSearchParams, now = Date.now()): RouteParams {
  const start = parseLatLng(sp.get("start"));
  const end = parseLatLng(sp.get("end"));
  if (!start || !end) bad("invalid_coordinates", "Start and end must be given as lat,lng.");
  if (!inSingapore(start.lat, start.lng) || !inSingapore(end.lat, end.lng)) {
    bad("out_of_bounds", "Start and end must both be in Singapore.");
  }
  const def = sgNow(now);
  const date = sp.get("date") ?? def.date;
  const time = sp.get("time") ?? def.time;
  const dm = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date);
  if (!dm || +dm[1]! < 1 || +dm[1]! > 12 || +dm[2]! < 1 || +dm[2]! > 31) bad("invalid_date", "Date must be MM-DD-YYYY.");
  const tm = /^(\d{2}):(\d{2}):(\d{2})$/.exec(time);
  if (!tm || +tm[1]! > 23 || +tm[2]! > 59 || +tm[3]! > 59) bad("invalid_time", "Time must be HH:MM:SS.");
  const mode = (sp.get("mode") ?? "TRANSIT").toUpperCase();
  if (mode !== "TRANSIT" && mode !== "BUS" && mode !== "RAIL") bad("invalid_mode", "Mode must be TRANSIT, BUS or RAIL.");
  let maxWalkDistance: number | undefined;
  const mw = sp.get("maxWalkDistance");
  if (mw !== null && mw !== "") {
    maxWalkDistance = Number(mw);
    if (!Number.isInteger(maxWalkDistance) || maxWalkDistance < 0 || maxWalkDistance > 5000) {
      bad("invalid_max_walk", "maxWalkDistance must be a whole number of metres from 0 to 5000.");
    }
  }
  const ni = sp.get("numItineraries");
  const numItineraries = ni === null || ni === "" ? 3 : Number(ni);
  if (!Number.isInteger(numItineraries) || numItineraries < 1 || numItineraries > 5) {
    bad("invalid_num_itineraries", "numItineraries must be 1 to 5.");
  }
  return { start, end, date, time, mode, maxWalkDistance, numItineraries };
}

/** Cache key: coords rounded to 4 dp (~11 m) and time truncated to the minute. */
export function routeCacheKey(p: RouteParams): string {
  return [
    "route:v1",
    `${round(p.start.lat, 4)},${round(p.start.lng, 4)}`,
    `${round(p.end.lat, 4)},${round(p.end.lng, 4)}`,
    p.date,
    p.time.slice(0, 5),
    p.mode,
    p.maxWalkDistance ?? "",
    p.numItineraries,
  ].join("|");
}

export function oneMapRoutePath(p: RouteParams): string {
  const qs = new URLSearchParams({
    start: `${p.start.lat},${p.start.lng}`,
    end: `${p.end.lat},${p.end.lng}`,
    routeType: "pt",
    date: p.date,
    time: p.time,
    mode: p.mode,
    numItineraries: String(p.numItineraries),
  });
  if (p.maxWalkDistance !== undefined) qs.set("maxWalkDistance", String(p.maxWalkDistance));
  return `/api/public/routingsvc/route?${qs.toString()}`;
}

export async function handleRoute(url: URL, env: Env, ctx?: Ctx): Promise<Response> {
  const p = parseRouteParams(url.searchParams);
  if (fixtureMode(env)) return fixtureRoute(p);
  const { body, hit } = await cached(
    routeCacheKey(p),
    TTL.route,
    async () => {
      const res = await oneMapGet(env, oneMapRoutePath(p), { requireToken: true });
      return res.text(); // raw OneMap JSON, passed through unchanged
    },
    ctx,
  );
  return rawJson(body, 200, cacheHeaders(TTL.route, hit));
}

// ---------- /api/revgeocode ----------
export async function handleRevGeocode(url: URL, env: Env, ctx?: Ctx): Promise<Response> {
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!url.searchParams.get("lat") || !url.searchParams.get("lng") || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    bad("invalid_coordinates", "lat and lng are required.");
  }
  if (!inSingapore(lat, lng)) bad("out_of_bounds", "The location must be in Singapore.");
  if (fixtureMode(env)) return fixtureRevGeocode(lat, lng);
  // AC 17: keyed on coordinates rounded to 5 dp (~1 m).
  const loc = `${round(lat, 5)},${round(lng, 5)}`;
  const { body, hit } = await cached(
    `revgeo:v1:${loc}`,
    TTL.revgeocode,
    async () => {
      const res = await oneMapGet(env, `/api/public/revgeocode?location=${loc}&buffer=50&addressType=All`, {
        requireToken: true,
      });
      return JSON.stringify(normaliseRevGeocode(parseJson(await res.text())));
    },
    ctx,
  );
  const value = JSON.parse(body) as ReturnType<typeof normaliseRevGeocode>;
  if (!value) throw new HttpError(404, "not_found", "No address was found near this spot.");
  return json(value, 200, cacheHeaders(TTL.revgeocode, hit));
}

// ---------- /api/bus-arrival ----------
export async function handleBusArrival(url: URL, env: Env, ctx?: Ctx): Promise<Response> {
  const stop = url.searchParams.get("stop") ?? "";
  if (!/^\d{5}$/.test(stop)) bad("invalid_stop", "The bus stop number must have 5 digits.");
  const service = url.searchParams.get("service") ?? undefined;
  if (service !== undefined && !/^[0-9A-Za-z]{1,5}$/.test(service)) bad("invalid_service", "The bus number is not valid.");
  if (fixtureMode(env)) return fixtureBusArrival(stop, service, Date.now(), fixtureScenario(url, BUS_SCENARIOS, "live"));
  const { body, storedAt, hit } = await cached(
    `bus:v1:${stop}`,
    TTL.bus,
    () => ltaBusArrival(env, stop),
    ctx,
  );
  const data = parseJson(body);
  // Via the proxy Worker the data may be up to ~20 s older than our fetch (its edge cache): report
  // its PolledAt as fetchedAt so the PWA's age/stale rules (e.g. > 60 s old) see the true age.
  const polledAt = Date.parse(String((data as { PolledAt?: unknown } | null)?.PolledAt ?? ""));
  const fetchedAt = Number.isFinite(polledAt) ? Math.min(polledAt, storedAt) : storedAt;
  const value = normaliseBusArrival(data, { stop, now: Date.now(), fetchedAt, service });
  return json(value, 200, cacheHeaders(TTL.bus, hit));
}

// ---------- /api/alerts ----------
export async function handleAlerts(url: URL, env: Env, ctx?: Ctx): Promise<Response> {
  if (fixtureMode(env)) return fixtureAlerts(fixtureScenario(url, ALERT_SCENARIOS, "normal"));
  // The proxy Worker does not serve TrainServiceAlerts: without our own key this stays "not configured".
  if (ltaSource(env) !== "key") throw notConfigured();
  const { body, hit } = await cached(
    "alerts:v2",
    TTL.alerts,
    async () => JSON.stringify(normaliseTrainAlerts(parseJson(await ltaGet(env, "/TrainServiceAlerts")))),
    ctx,
  );
  return rawJson(body, 200, cacheHeaders(TTL.alerts, hit));
}

// ---------- /api/lifts (M3 AC 30) ----------
export async function handleLifts(url: URL, env: Env, ctx?: Ctx): Promise<Response> {
  if (fixtureMode(env)) return fixtureLifts(fixtureScenario(url, LIFT_SCENARIOS, "outage"));
  // Nor FacilitiesMaintenance: same "not configured" state, never faked.
  if (ltaSource(env) !== "key") throw notConfigured();
  const { body, storedAt, hit } = await cached(
    "lifts:v1",
    TTL.lifts,
    async () => JSON.stringify(normaliseLifts(parseJson(await ltaGet(env, "/v2/FacilitiesMaintenance")))),
    ctx,
  );
  const value = JSON.parse(body) as ReturnType<typeof normaliseLifts>;
  return json({ fetchedAt: new Date(storedAt).toISOString(), ...value }, 200, cacheHeaders(TTL.lifts, hit));
}
