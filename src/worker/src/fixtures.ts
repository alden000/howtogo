/**
 * AC 21 fixture mode: with FIXTURE_MODE=1 the read endpoints answer from bundled SYNTHETIC
 * fixtures instead of OneMap / LTA, so dev and QA can run before credentials exist.
 * Off unless the variable is exactly "1"; never set it in the production wrangler.toml.
 *
 * The fixture data is loaded with a dynamic import, so it is not evaluated when the mode is off.
 */
import type { Env } from "./env";
import { HttpError, json, rawJson } from "./http";
import { normaliseBusArrival, normaliseLifts, normaliseTrainAlerts, type Place } from "./normalise";
import type { RouteParams } from "./api";

export function fixtureMode(env: Env): boolean {
  return env.FIXTURE_MODE === "1";
}

const HEADERS = { "Cache-Control": "no-store", "X-Fixture": "1" };

interface LL {
  lat: number;
  lng: number;
}
interface RawPlan {
  plan: { date: number; from: { lat: number; lon: number }; to: { lat: number; lon: number } };
}

async function load() {
  const [shared, extra, bus, alerts, alertsDisrupted, alertsMinor, lifts] = await Promise.all([
    import("@howtogo/shared/fixtures"),
    import("../fixtures/trips"),
    import("../fixtures/lta-bus-arrival-v3.json"),
    import("../fixtures/lta-train-alerts-normal.json"),
    import("../fixtures/lta-train-alerts-disrupted.json"),
    import("../fixtures/lta-train-alerts-minor.json"),
    import("../fixtures/lta-facilities-maintenance-v2.json"),
  ]);
  const trips: Record<string, unknown> = {
    ...shared.FIXTURES,
    jurongEastToNUH: extra.jurongEastToNUH,
    bedokToCGH: extra.bedokToCGH,
  };
  return {
    t0: shared.FIXTURE_T0,
    trips,
    bus: bus.default as unknown,
    alerts: { normal: alerts.default, disrupted: alertsDisrupted.default, minor: alertsMinor.default } as Record<string, unknown>,
    lifts: lifts.default as unknown,
  };
}

/** Real Singapore places at the fixture trips' ends (addresses are public; coords from the fixtures). */
export const FIXTURE_PLACES: (Place & { aliases: string[] })[] = [
  { name: "Tan Tock Seng Hospital", address: "11 Jalan Tan Tock Seng Singapore 308433", postal: "308433", lat: 1.32135, lng: 103.8465, aliases: ["陈笃生医院", "ttsh"] },
  { name: "Raffles Place MRT Station (NS26)", address: "5 Raffles Place Singapore 048618", postal: "048618", lat: 1.2812, lng: 103.8514, aliases: ["莱佛士坊"] },
  { name: "Toa Payoh Central", address: "Toa Payoh Central Singapore 310177", postal: "310177", lat: 1.33465, lng: 103.8491, aliases: ["大巴窑"] },
  { name: "Bishan Street 13", address: "Bishan Street 13 Singapore 570513", postal: "570513", lat: 1.3529, lng: 103.8501, aliases: ["碧山"] },
  { name: "Ang Mo Kio Avenue 3", address: "Ang Mo Kio Avenue 3 Singapore 560215", postal: "560215", lat: 1.3672, lng: 103.8438, aliases: ["宏茂桥"] },
  { name: "Jurong East MRT Station (EW24)", address: "10 Jurong East Street 12 Singapore 609690", postal: "609690", lat: 1.3335, lng: 103.7436, aliases: ["裕廊东"] },
  { name: "National University Hospital", address: "5 Lower Kent Ridge Road Singapore 119074", postal: "119074", lat: 1.2941, lng: 103.7831, aliases: ["国大医院", "nuh"] },
  { name: "Bedok Interchange", address: "207 New Upper Changi Road Singapore 460207", postal: "460207", lat: 1.3248, lng: 103.9282, aliases: ["勿洛"] },
  { name: "Changi General Hospital", address: "2 Simei Street 3 Singapore 529889", postal: "529889", lat: 1.3405, lng: 103.9493, aliases: ["樟宜综合医院", "cgh"] },
];

function dist(a: LL, b: LL): number {
  const R = 6_371_000;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fixtureSearch(q: string): Response {
  const needle = q.toLowerCase();
  const results = FIXTURE_PLACES.filter((p) =>
    [p.name, p.address, p.postal, ...p.aliases].some((s) => s.toLowerCase().includes(needle)),
  ).map(({ aliases: _a, ...p }) => p);
  return json({ results }, 200, HEADERS);
}

export function fixtureRevGeocode(lat: number, lng: number): Response {
  const p = FIXTURE_PLACES.map((x) => ({ x, d: dist({ lat, lng }, x) })).sort((a, b) => a.d - b.d)[0]!.x;
  return json({ name: p.name, address: p.address, postal: p.postal }, 200, HEADERS);
}

const TIME_KEYS = new Set(["startTime", "endTime", "arrival", "departure", "date"]);
function shiftTimes(v: unknown, delta: number, k?: string): unknown {
  if (Array.isArray(v)) return v.map((x) => shiftTimes(x, delta));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [kk, vv] of Object.entries(v)) o[kk] = shiftTimes(vv, delta, kk);
    return o;
  }
  if (typeof v === "number" && k && TIME_KEYS.has(k) && v > 1e12) return v + delta;
  return v;
}

/** Epoch ms of the requested Singapore (UTC+8) date and time. */
function sgEpoch(date: string, time: string): number {
  const [mm, dd, yyyy] = date.split("-").map(Number) as [number, number, number];
  const [h, mi, s] = time.split(":").map(Number) as [number, number, number];
  return Date.UTC(yyyy, mm - 1, dd, h, mi, s) - 8 * 3600_000;
}

/** Picks the trip whose destination is nearest `end` (ties: nearest start), re-timed to the request. */
export async function fixtureRoute(p: RouteParams): Promise<Response> {
  const { t0, trips } = await load();
  const best = Object.entries(trips)
    .map(([name, body]) => {
      const plan = (body as RawPlan).plan;
      return {
        name,
        body,
        e: dist(p.end, { lat: plan.to.lat, lng: plan.to.lon }),
        s: dist(p.start, { lat: plan.from.lat, lng: plan.from.lon }),
      };
    })
    .sort((a, b) => a.e - b.e || a.s - b.s)[0]!;
  const body = shiftTimes(best.body, sgEpoch(p.date, p.time) - t0);
  return rawJson(JSON.stringify(body), 200, { ...HEADERS, "X-Fixture-Trip": best.name });
}

/**
 * M3 AC 39: `?fixture=<scenario>` picks a recorded variant, honoured ONLY in fixture mode (ignored otherwise).
 * Unknown scenario → 400 invalid_fixture. "not_configured" replays the no-key 503.
 */
export function fixtureScenario(url: URL, allowed: readonly string[], fallback: string): string {
  const v = url.searchParams.get("fixture");
  if (v === null || v === "") return fallback;
  if (!allowed.includes(v)) throw new HttpError(400, "invalid_fixture", `fixture must be one of: ${allowed.join(", ")}.`);
  if (v === "not_configured") throw new HttpError(503, "not_configured", "This feature is not set up yet.", HEADERS);
  return v;
}

export const BUS_SCENARIOS = ["live", "empty", "not_configured"] as const;
export const ALERT_SCENARIOS = ["normal", "minor", "disrupted", "not_configured"] as const;
export const LIFT_SCENARIOS = ["outage", "none", "not_configured"] as const;

/** Recorded-format LTA BusArrival; arrival times are moved so the first bus is ~1 min away now. */
export async function fixtureBusArrival(
  stop: string,
  service: string | undefined,
  now = Date.now(),
  scenario = "live",
): Promise<Response> {
  const { bus } = await load();
  const data = structuredClone(bus) as { BusStopCode: string; Services: Record<string, Record<string, string>>[] };
  if (scenario === "empty") {
    // Every service listed but no bus times: the chip must show the no-data state (M3 AC 6).
    for (const svc of data.Services) for (const k of ["NextBus", "NextBus2", "NextBus3"]) svc[k] = { EstimatedArrival: "" };
  }
  const ref = Date.parse("2026-11-17T13:58:40+08:00");
  data.BusStopCode = stop;
  for (const svc of data.Services) {
    for (const k of ["NextBus", "NextBus2", "NextBus3"]) {
      const nb = svc[k];
      if (nb && nb.EstimatedArrival) nb.EstimatedArrival = new Date(Date.parse(nb.EstimatedArrival) - ref + now).toISOString();
    }
  }
  return json(normaliseBusArrival(data, { stop, now, fetchedAt: now, service }), 200, HEADERS);
}

export async function fixtureAlerts(scenario = "normal"): Promise<Response> {
  const { alerts } = await load();
  return json(normaliseTrainAlerts(alerts[scenario] ?? alerts.normal), 200, HEADERS);
}

/** SYNTHETIC lift outages at Bishan (NS17), Buona Vista (CC22) and Serangoon (NE12); "none" = empty list. */
export async function fixtureLifts(scenario = "outage", now = Date.now()): Promise<Response> {
  const { lifts } = await load();
  const value = scenario === "none" ? { lifts: [] } : normaliseLifts(lifts);
  return json({ fetchedAt: new Date(now).toISOString(), ...value }, 200, HEADERS);
}

