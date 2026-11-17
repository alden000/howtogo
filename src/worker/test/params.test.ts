import { describe, expect, it } from "vitest";
import { oneMapRoutePath, parseRouteParams, routeCacheKey, sgNow } from "../src/api";
import { inSingapore, parseLatLng } from "../src/geo";

const sp = (o: Record<string, string>) => new URLSearchParams(o);
const base = { start: "1.351019,103.850057", end: "1.300080,103.845520", date: "11-17-2026", time: "14:05:33" };

describe("bbox", () => {
  it("accepts Singapore and rejects elsewhere", () => {
    expect(inSingapore(1.3521, 103.8198)).toBe(true);
    expect(inSingapore(1.13, 103.59)).toBe(true);
    expect(inSingapore(1.48, 104.1)).toBe(true);
    expect(inSingapore(1.49, 103.8)).toBe(false); // Johor Bahru
    expect(inSingapore(1.3, 104.2)).toBe(false);
    expect(inSingapore(NaN, 103.8)).toBe(false);
  });
  it("parses lat,lng", () => {
    expect(parseLatLng(" 1.3,103.8 ")).toEqual({ lat: 1.3, lng: 103.8 });
    expect(parseLatLng("1.3;103.8")).toBeNull();
    expect(parseLatLng("abc")).toBeNull();
  });
});

describe("parseRouteParams", () => {
  it("parses a full query with defaults", () => {
    const p = parseRouteParams(sp(base));
    expect(p).toMatchObject({ mode: "TRANSIT", numItineraries: 3, maxWalkDistance: undefined, date: "11-17-2026" });
  });
  it("rejects points outside Singapore", () => {
    expect(() => parseRouteParams(sp({ ...base, end: "1.4927,103.7414" }))).toThrow(/Singapore/);
  });
  it.each([
    ["start", "x"],
    ["date", "2026-11-17"],
    ["time", "25:00:00"],
    ["mode", "CAR"],
    ["maxWalkDistance", "-5"],
    ["numItineraries", "9"],
  ])("rejects bad %s", (k, v) => {
    expect(() => parseRouteParams(sp({ ...base, [k]: v }))).toThrow();
  });
  it("defaults date/time to Singapore time", () => {
    const now = Date.parse("2026-11-17T23:30:05Z"); // 07:30:05 next day in SG
    expect(sgNow(now)).toEqual({ date: "11-18-2026", time: "07:30:05" });
    const p = parseRouteParams(sp({ start: base.start, end: base.end }), now);
    expect(p.date).toBe("11-18-2026");
  });
});

describe("route cache key", () => {
  it("rounds coords to 4 dp and time to the minute", () => {
    const a = routeCacheKey(parseRouteParams(sp(base)));
    const b = routeCacheKey(parseRouteParams(sp({ ...base, start: "1.351031,103.850061", time: "14:05:59" })));
    expect(a).toBe(b);
    expect(a).toBe("route:v1|1.3510,103.8501|1.3001,103.8455|11-17-2026|14:05|TRANSIT||3");
  });
  it("differs for a different minute, mode or walk distance", () => {
    const a = routeCacheKey(parseRouteParams(sp(base)));
    expect(routeCacheKey(parseRouteParams(sp({ ...base, time: "14:06:00" })))).not.toBe(a);
    expect(routeCacheKey(parseRouteParams(sp({ ...base, mode: "BUS" })))).not.toBe(a);
    expect(routeCacheKey(parseRouteParams(sp({ ...base, maxWalkDistance: "500" })))).not.toBe(a);
  });
  it("builds the OneMap path with routeType=pt", () => {
    const path = oneMapRoutePath(parseRouteParams(sp({ ...base, maxWalkDistance: "800" })));
    const u = new URL("https://x" + path);
    expect(u.pathname).toBe("/api/public/routingsvc/route");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      start: "1.351019,103.850057",
      end: "1.30008,103.84552",
      routeType: "pt",
      date: "11-17-2026",
      time: "14:05:33",
      mode: "TRANSIT",
      numItineraries: "3",
      maxWalkDistance: "800",
    });
  });
});
