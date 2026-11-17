import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryCache } from "../src/cache";
import { TOKEN_KV_KEY, resetTokenCache } from "../src/onemap";
import bishan from "./fixtures/onemap-search-bishan.json";
import route from "./fixtures/onemap-route.json";
import revgeo from "./fixtures/onemap-revgeocode.json";
import disrupted from "./fixtures/lta-train-alerts-disrupted.json";
import { ORIGIN, call, jsonRes, stubFetch, tokenResponse } from "./helpers";

beforeEach(async () => {
  resetTokenCache();
  resetMemoryCache();
  await env.TOKEN_KV.put(TOKEN_KV_KEY, JSON.stringify({ token: "tok-A", expiresAt: Date.now() + 48 * 3600_000 }));
});
afterEach(() => vi.restoreAllMocks());

const busFixture = (now: number) => ({
  BusStopCode: "53009",
  Services: [
    {
      ServiceNo: "162",
      Operator: "SBST",
      NextBus: { EstimatedArrival: new Date(now + 4.5 * 60_000).toISOString(), Latitude: "1.35", Longitude: "103.84", Load: "SEA", Feature: "WAB", Type: "DD" },
      NextBus2: { EstimatedArrival: "", Latitude: "0.0", Longitude: "0.0", Load: "", Feature: "", Type: "" },
    },
    { ServiceNo: "13", Operator: "SBST", NextBus: { EstimatedArrival: new Date(now - 30_000).toISOString(), Load: "LSD", Feature: "", Type: "BD" } },
  ],
});

describe("GET /api/search", () => {
  it("normalises OneMap search and sends the token", async () => {
    const { calls } = stubFetch(() => jsonRes(bishan));
    const res = await call("/api/search?q=bishan%20mrt");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { name: string }[] };
    expect(body.results[0]!.name).toBe("Bishan MRT Station");
    const u = calls[0]!.url;
    expect(u.pathname).toBe("/api/common/elastic/search");
    expect(Object.fromEntries(u.searchParams)).toEqual({ searchVal: "bishan mrt", returnGeom: "Y", getAddrDetails: "Y", pageNum: "1" });
    expect(calls[0]!.headers.get("Authorization")).toBe("tok-A");
  });

  it("caches by normalised query", async () => {
    const { calls } = stubFetch(() => jsonRes(bishan));
    await call("/api/search?q=Toa%20Payoh");
    const res = await call("/api/search?q=toa%20%20payoh%20");
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=86400");
    expect(calls).toHaveLength(1);
  });

  it("rejects an empty query", async () => {
    const res = await call("/api/search?q=%20");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("missing_query");
  });

  it("works without OneMap credentials (no token)", async () => {
    const { calls } = stubFetch(() => jsonRes(bishan));
    const worker = (await import("../src/index")).default;
    const { createExecutionContext } = await import("cloudflare:test");
    const res = await worker.fetch(
      new Request("https://api.test/api/search?q=no-creds-query"),
      { ...env, ONEMAP_EMAIL: undefined, ONEMAP_PASSWORD: undefined },
      createExecutionContext(),
    );
    expect(res.status).toBe(200);
    expect(calls[0]!.headers.get("Authorization")).toBeNull();
  });
});

describe("GET /api/route", () => {
  const q = "start=1.351019,103.850057&end=1.30008,103.84552&date=11-17-2026&time=10:15:00&mode=TRANSIT&numItineraries=3";
  it("passes the raw OneMap body through and caches for 2 min (AC 17)", async () => {
    const raw = JSON.stringify(route);
    const { calls } = stubFetch(() => jsonRes(raw));
    const r1 = await call(`/api/route?${q}`);
    expect(await r1.text()).toBe(raw);
    const r2 = await call(`/api/route?${q.replace("10:15:00", "10:15:42").replace("1.351019", "1.351022")}`);
    expect(r2.headers.get("X-Cache")).toBe("HIT");
    expect(await r2.text()).toBe(raw);
    expect(r1.headers.get("Cache-Control")).toBe("private, max-age=120");
    expect(calls).toHaveLength(1);
  });
  it("400 for out-of-bbox coordinates, without calling upstream", async () => {
    const { calls } = stubFetch(() => jsonRes(route));
    const res = await call("/api/route?start=1.4927,103.7414&end=1.30008,103.84552");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("out_of_bounds");
    expect(calls).toHaveLength(0);
  });
  it("502 when OneMap is down", async () => {
    stubFetch(() => jsonRes("<html>oops</html>", 503));
    const res = await call(`/api/route?${q.replace("10:15", "10:16")}`);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: { code: "upstream_unavailable", message: expect.any(String) } });
  });
  it("502 when fetch throws (network)", async () => {
    stubFetch(() => {
      throw new TypeError("network");
    });
    const res = await call(`/api/route?${q.replace("10:15", "10:17")}`);
    expect(res.status).toBe(502);
  });
});

describe("GET /api/revgeocode", () => {
  it("normalises and rounds the location sent upstream", async () => {
    const { calls } = stubFetch(() => jsonRes(revgeo));
    const res = await call("/api/revgeocode?lat=1.3498912&lng=103.8470634");
    expect(await res.json()).toEqual({
      name: "Bishan Community Club",
      address: "51 Bishan Street 13 Bishan Community Club Singapore 579799",
      postal: "579799",
    });
    expect(calls[0]!.url.searchParams.get("location")).toBe("1.34989,103.84706");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(calls[0]!.url.searchParams.get("buffer")).toBe("50");
    expect(calls[0]!.url.searchParams.get("addressType")).toBe("All");
  });
  it("404 when nothing nearby", async () => {
    stubFetch(() => jsonRes({ GeocodeInfo: [] }));
    expect((await call("/api/revgeocode?lat=1.2001&lng=103.7001")).status).toBe(404);
  });
  it("400 outside Singapore", async () => {
    expect((await call("/api/revgeocode?lat=1.6&lng=103.8")).status).toBe(400);
  });
});

describe("GET /api/bus-arrival", () => {
  it("calls LTA v3 with AccountKey and normalises", async () => {
    const now = Date.now();
    const { calls } = stubFetch(() => jsonRes(busFixture(now)));
    const res = await call("/api/bus-arrival?stop=53009");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stop: string; services: { no: string; next: { etaMin: number }[] }[] };
    expect(calls[0]!.url.href).toBe("https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=53009");
    expect(calls[0]!.headers.get("AccountKey")).toBe("lta-test-key");
    expect(body.stop).toBe("53009");
    expect(body.services.map((s) => s.no)).toEqual(["13", "162"]);
    expect(body.services[0]!.next[0]!.etaMin).toBe(0);
    expect([3, 4]).toContain(body.services[1]!.next[0]!.etaMin);
    expect(body.services[1]!.next).toHaveLength(1);
  });
  it("filters by service and shares the 20 s cache across services", async () => {
    const { calls } = stubFetch(() => jsonRes(busFixture(Date.now())));
    await call("/api/bus-arrival?stop=11111");
    const res = await call("/api/bus-arrival?stop=11111&service=162");
    const body = (await res.json()) as { services: { no: string }[] };
    expect(body.services.map((s) => s.no)).toEqual(["162"]);
    expect(calls).toHaveLength(1);
  });
  it("validates the stop code", async () => {
    expect((await call("/api/bus-arrival?stop=1234")).status).toBe(400);
    expect((await call("/api/bus-arrival?stop=12345&service=<x>")).status).toBe(400);
  });
  it("502 on LTA error without leaking the key", async () => {
    stubFetch(() => jsonRes({ fault: "invalid AccountKey lta-test-key" }, 401));
    const res = await call("/api/bus-arrival?stop=22222");
    expect(res.status).toBe(502);
    expect(await res.text()).not.toMatch(/lta-test-key/);
  });
});

describe("GET /api/alerts", () => {
  it("normalises TrainServiceAlerts", async () => {
    const { calls } = stubFetch(() => jsonRes(disrupted));
    const res = await call("/api/alerts");
    const body = (await res.json()) as { status: string; lines: { line: string }[] };
    expect(calls[0]!.url.pathname).toBe("/ltaodataservice/TrainServiceAlerts");
    expect(body.status).toBe("disrupted");
    expect(body.lines[0]!.line).toBe("NEL");
  });
});

describe("CORS, headers, errors", () => {
  it("allows listed origins and adds security headers", async () => {
    stubFetch(() => jsonRes(bishan));
    const res = await call("/api/search?q=cors-test", { headers: { Origin: ORIGIN } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Vary")).toMatch(/Origin/);
  });
  it("rejects other origins with 403", async () => {
    const res = await call("/api/search?q=x", { headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
  it("answers preflight for allowed origins", async () => {
    const res = await call("/api/share/abc", {
      method: "OPTIONS",
      headers: { Origin: ORIGIN, "Access-Control-Request-Method": "PUT" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toMatch(/PUT/);
    expect(res.headers.get("Access-Control-Allow-Headers")).toMatch(/Authorization/);
  });
  it("404 / 405 as JSON", async () => {
    const r404 = await call("/api/nope");
    expect(r404.status).toBe(404);
    expect(await r404.json()).toEqual({ error: { code: "not_found", message: "Not found." } });
    expect((await call("/api/search?q=x", { method: "POST" })).status).toBe(405);
  });
});
