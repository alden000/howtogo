/** M3 Worker ACs 4, 19–24 (alerts shape), 30 (/api/lifts), 39 (fixture scenarios). */
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evictCached, resetMemoryCache } from "../src/cache";
import { normaliseBusArrival, normaliseLifts, normaliseTrainAlerts, stationCodes } from "../src/normalise";
import worker from "../src/index";
import fxDisrupted from "../fixtures/lta-train-alerts-disrupted.json";
import fxMinor from "../fixtures/lta-train-alerts-minor.json";
import lifts from "./fixtures/lta-facilities-maintenance-v2.json";
import { call, jsonRes, stubFetch } from "./helpers";

beforeEach(async () => {
  resetMemoryCache();
  await evictCached("lifts:v1");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function get(path: string, e: typeof env): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://api.test" + path), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const fxEnv: typeof env = { ...env, FIXTURE_MODE: "1", LTA_ACCOUNT_KEY: undefined, ONEMAP_EMAIL: undefined, ONEMAP_PASSWORD: undefined };

describe("AC 4: BusArrival `monitored`", () => {
  const now = Date.parse("2026-11-17T14:00:00+08:00");
  const nb = (Monitored: unknown) => ({
    Services: [{ ServiceNo: "88", Operator: "SBST", NextBus: { EstimatedArrival: "2026-11-17T14:05:00+08:00", Monitored } }],
  });
  it("1 or '1' → true; 0, missing or junk → false (never claim Live without GPS)", () => {
    const m = (v: unknown) => normaliseBusArrival(nb(v), { stop: "53009", now, fetchedAt: now }).services[0]!.next[0]!.monitored;
    expect(m(1)).toBe(true);
    expect(m("1")).toBe(true);
    expect(m(0)).toBe(false);
    expect(m(undefined)).toBe(false);
    expect(m("x")).toBe(false);
  });
});

describe("TrainServiceAlerts normalisation", () => {
  it("flattens shuttle lists with | and ; delimiters, keeps direction, flags island-wide free bus", () => {
    const a = normaliseTrainAlerts({
      value: {
        Status: 2,
        AffectedSegments: [
          {
            Line: "ewl",
            Direction: "Both",
            Stations: "EW8, EW9,EW10",
            FreePublicBus: "Free bus service island wide",
            FreeMRTShuttle: "EW21|CC22,EW23,EW24|NS1,EW27;NS9,NS13,BP1*",
            MRTShuttleDirection: "Both",
          },
        ],
        Message: [{ Content: "Major delay", CreatedDate: "2026-11-17 08:00:00" }],
      },
    });
    expect(a.lines[0]).toEqual({
      line: "EWL",
      direction: "Both",
      stations: ["EW8", "EW9", "EW10"],
      freePublicBus: [],
      freeBusIslandWide: true,
      freeShuttle: ["EW21", "CC22", "EW23", "EW24", "NS1", "EW27", "NS9", "NS13", "BP1"],
      shuttleDirection: "Both",
    });
    expect(a).toMatchObject({ status: "disrupted", minor: false });
  });

  it("AC 24: Status 1 with a message → normal + minor", () => {
    const a = normaliseTrainAlerts(fxMinor);
    expect(a).toMatchObject({ status: "normal", minor: true, lines: [] });
    expect(a.messages[0]!.createdAt).toBe("2026-11-17T07:30:00+08:00");
  });

  it("accepts revised shapes: value as array, single objects instead of arrays", () => {
    const a = normaliseTrainAlerts({
      value: [{ Status: "2", AffectedSegments: { Line: "NEL", Direction: "Punggol", Stations: "NE1" }, Message: { Content: "x", CreatedDate: "bad" } }],
    });
    expect(a.status).toBe("disrupted");
    expect(a.lines[0]!.stations).toEqual(["NE1"]);
    expect(a.messages).toEqual([{ text: "x", createdAt: null }]);
  });

  it("stationCodes ignores junk and dedupes", () => {
    expect(stationCodes("NE1,ne1, NIL")).toEqual(["NE1"]);
    expect(stationCodes(undefined)).toEqual([]);
  });

  it("fixture-mode disrupted reply has free bus + shuttle", () => {
    const a = normaliseTrainAlerts(fxDisrupted);
    expect(a.lines[0]!.freePublicBus.length).toBeGreaterThan(0);
    expect(a.lines[0]!.freeShuttle).toContain("CC15");
  });
});

describe("normaliseLifts (v2/FacilitiesMaintenance)", () => {
  it("maps to station code + lift id + description, sorted, optional lift id → null", () => {
    expect(normaliseLifts(lifts)).toEqual({
      lifts: [
        { line: "CCL", station: "CC22", stationName: "Buona Vista", liftId: "B2L02", desc: "Concourse - Platform B" },
        { line: "NEL", station: "NE12", stationName: "Serangoon", liftId: null, desc: "Exit B Street level - Concourse" },
        { line: "NSL", station: "NS17", stationName: "Bishan", liftId: "B1L01", desc: "Exit A Street level - Concourse" },
      ],
    });
  });
  it("drops rows without a valid station code and duplicates; tolerates junk", () => {
    const row = { Line: "NSL", StationCode: "NS9", StationName: "Woodlands", LiftID: "L1", LiftDesc: "Exit 1" };
    expect(normaliseLifts({ value: [row, row, { StationCode: "" }, { StationCode: "Bishan" }, null] }).lifts).toHaveLength(1);
    expect(normaliseLifts(null)).toEqual({ lifts: [] });
    expect(normaliseLifts({ value: "x" })).toEqual({ lifts: [] });
  });
});

describe("GET /api/lifts", () => {
  it("calls v2/FacilitiesMaintenance with the AccountKey, caches 5 min, reports fetchedAt", async () => {
    const { calls } = stubFetch(() => jsonRes(lifts));
    const r1 = await call("/api/lifts");
    expect(r1.status).toBe(200);
    expect(r1.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(r1.headers.get("X-Cache")).toBe("MISS");
    const b1 = (await r1.json()) as { fetchedAt: string; lifts: { station: string }[] };
    expect(b1.lifts.map((l) => l.station)).toEqual(["CC22", "NE12", "NS17"]);
    expect(Date.parse(b1.fetchedAt)).toBeGreaterThan(Date.now() - 5000);
    expect(calls[0]!.url.pathname).toBe("/ltaodataservice/v2/FacilitiesMaintenance");
    expect(calls[0]!.headers.get("AccountKey")).toBe("lta-test-key");
    const r2 = await call("/api/lifts");
    expect(r2.headers.get("X-Cache")).toBe("HIT");
    expect(((await r2.json()) as { fetchedAt: string }).fetchedAt).toBe(b1.fetchedAt);
    expect(calls).toHaveLength(1);
  });

  it("upstream failure → 502 without the upstream body; no key → 503", async () => {
    stubFetch(() => new Response("SECRET upstream detail", { status: 500 }));
    const r = await call("/api/lifts");
    expect(r.status).toBe(502);
    expect(await r.text()).not.toMatch(/SECRET/);
    const r2 = await get("/api/lifts", { ...env, LTA_ACCOUNT_KEY: undefined });
    expect(r2.status).toBe(503);
    expect(((await r2.json()) as { error: { code: string } }).error.code).toBe("not_configured");
  });

  it("POST → 405", async () => {
    expect((await call("/api/lifts", { method: "POST" })).status).toBe(405);
  });
});

describe("AC 39: fixture-mode scenarios (?fixture=, only in FIXTURE_MODE)", () => {
  it("lifts: outage (default), none, not_configured; no upstream call", async () => {
    const { calls } = stubFetch(() => new Response("no", { status: 500 }));
    const d = (await (await get("/api/lifts", fxEnv)).json()) as { lifts: { station: string }[] };
    expect(d.lifts.map((l) => l.station)).toContain("NS17");
    expect(((await (await get("/api/lifts?fixture=none", fxEnv)).json()) as { lifts: unknown[] }).lifts).toEqual([]);
    const nc = await get("/api/lifts?fixture=not_configured", fxEnv);
    expect(nc.status).toBe(503);
    expect(nc.headers.get("X-Fixture")).toBe("1");
    expect((await get("/api/lifts?fixture=bogus", fxEnv)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("alerts: normal (default), minor, disrupted", async () => {
    const s = async (q: string) => (await (await get(`/api/alerts${q}`, fxEnv)).json()) as { status: string; minor: boolean };
    expect(await s("")).toMatchObject({ status: "normal", minor: false });
    expect(await s("?fixture=minor")).toMatchObject({ status: "normal", minor: true });
    expect(await s("?fixture=disrupted")).toMatchObject({ status: "disrupted" });
  });

  it("bus-arrival: live has monitored true and false and an LSD bus; empty has no times", async () => {
    const live = (await (await get("/api/bus-arrival?stop=53009", fxEnv)).json()) as {
      services: { next: { monitored: boolean; load: string }[] }[];
    };
    const all = live.services.flatMap((s) => s.next);
    expect(all.some((n) => n.monitored)).toBe(true);
    expect(all.some((n) => !n.monitored)).toBe(true);
    expect(all.some((n) => n.load === "LSD")).toBe(true);
    const empty = (await (await get("/api/bus-arrival?stop=53009&fixture=empty", fxEnv)).json()) as { services: { next: unknown[] }[] };
    expect(empty.services.length).toBeGreaterThan(0);
    for (const s of empty.services) expect(s.next).toEqual([]);
    expect((await get("/api/bus-arrival?stop=53009&fixture=not_configured", fxEnv)).status).toBe(503);
  });

  it("?fixture= is ignored outside fixture mode (real upstream is used)", async () => {
    const { calls } = stubFetch(() => jsonRes(lifts));
    const r = await call("/api/lifts?fixture=none");
    expect(((await r.json()) as { lifts: unknown[] }).lifts).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });
});
