import { describe, expect, it } from "vitest";
import {
  etaMinutes,
  normaliseBusArrival,
  normaliseRevGeocode,
  normaliseSearch,
  normaliseTrainAlerts,
  titleCase,
} from "../src/normalise";
import bishan from "./fixtures/onemap-search-bishan.json";
import postal from "./fixtures/onemap-search-postal.json";
import bus from "./fixtures/lta-bus-arrival-v3.json";
import disrupted from "./fixtures/lta-train-alerts-disrupted.json";
import normal from "./fixtures/lta-train-alerts-normal.json";
import revgeo from "./fixtures/onemap-revgeocode.json";

describe("titleCase", () => {
  it("keeps acronyms and station codes, lowercases small words", () => {
    expect(titleCase("BISHAN MRT STATION (NS17)")).toBe("Bishan MRT Station (NS17)");
    expect(titleCase("ANG MO KIO AVENUE 6")).toBe("Ang Mo Kio Avenue 6");
    expect(titleCase("THE CENTRAL OF SINGAPORE")).toBe("The Central of Singapore");
    expect(titleCase("ST. ANDREW'S CATHEDRAL")).toBe("St. Andrew's Cathedral");
    expect(titleCase("TOA PAYOH HDB HUB")).toBe("Toa Payoh HDB Hub");
  });
});

describe("normaliseSearch (real OneMap fixture)", () => {
  it("maps fields, title-cases and parses numbers", () => {
    const { results } = normaliseSearch(bishan);
    expect(results[0]).toEqual({
      name: "Bishan MRT Station",
      address: "17 Bishan Place Bishan MRT Station Singapore 579842",
      postal: "579842",
      lat: 1.35101889777846,
      lng: 103.8500572086081,
    });
    for (const r of results) {
      expect(typeof r.lat).toBe("number");
      expect(r.name).not.toMatch(/NIL/);
    }
  });

  it("falls back to block + road when BUILDING is NIL", () => {
    const { results } = normaliseSearch(postal);
    expect(results[0]!.name).toBe("123 Ang Mo Kio Avenue 6");
    expect(results[0]!.postal).toBe("560123");
  });

  it("dedupes by name + postal and drops rows without coordinates", () => {
    const row = { SEARCHVAL: "X", BUILDING: "FOO MALL", ADDRESS: "1 FOO ROAD", POSTAL: "123456", LATITUDE: "1.3", LONGITUDE: "103.8" };
    const { results } = normaliseSearch({
      results: [row, { ...row, LATITUDE: "1.30001" }, { ...row, LATITUDE: "" }, { ...row, POSTAL: "654321" }],
    });
    expect(results.map((r) => r.postal)).toEqual(["123456", "654321"]);
  });

  it("returns empty results for junk", () => {
    expect(normaliseSearch(null)).toEqual({ results: [] });
    expect(normaliseSearch({ results: "x" })).toEqual({ results: [] });
  });
});

describe("normaliseRevGeocode", () => {
  it("prefers an entry with a building name", () => {
    expect(normaliseRevGeocode(revgeo)).toEqual({
      name: "Bishan Community Club",
      address: "51 Bishan Street 13 Bishan Community Club Singapore 579799",
      postal: "579799",
    });
  });
  it("uses block + road when no building", () => {
    expect(normaliseRevGeocode({ GeocodeInfo: [revgeo.GeocodeInfo[0]] })).toEqual({
      name: "201 Bishan Street 23",
      address: "201 Bishan Street 23 Singapore 570201",
      postal: "570201",
    });
  });
  it("returns null when nothing found", () => {
    expect(normaliseRevGeocode({ GeocodeInfo: [] })).toBeNull();
    expect(normaliseRevGeocode({})).toBeNull();
  });
});

describe("normaliseBusArrival (synthetic LTA v3 fixture)", () => {
  const now = Date.parse("2026-11-17T14:00:00+08:00");
  const out = normaliseBusArrival(bus, { stop: "53009", now, fetchedAt: now });

  it("sorts services numerically and keeps operator", () => {
    expect(out.services.map((s) => s.no)).toEqual(["13", "162", "410W"]);
    expect(out.stop).toBe("53009");
    expect(out.fetchedAt).toBe(new Date(now).toISOString());
  });

  it("computes etaMin (floor, never negative; arrived = 0) and maps load/deck/wheelchair", () => {
    const s162 = out.services.find((s) => s.no === "162")!;
    expect(s162.operator).toBe("SBST");
    expect(s162.next).toEqual([
      { etaMin: 4, load: "SEA", wheelchair: true, deck: "double", monitored: true, lat: 1.3502, lng: 103.8487 },
      { etaMin: 15, load: "SDA", wheelchair: true, deck: "single", monitored: true, lat: 1.3601, lng: 103.8402 },
    ]);
    const s13 = out.services.find((s) => s.no === "13")!;
    expect(s13.next[0]).toEqual({ etaMin: 0, load: "LSD", wheelchair: false, deck: "bendy", monitored: false }); // past ETA → 0, no 0.0 coords
    expect(s13.next).toHaveLength(3);
    expect(out.services.find((s) => s.no === "410W")!.next).toHaveLength(1);
  });

  it("filters by service", () => {
    const f = normaliseBusArrival(bus, { stop: "53009", now, fetchedAt: now, service: "410w" });
    expect(f.services.map((s) => s.no)).toEqual(["410W"]);
  });

  it("etaMinutes handles junk", () => {
    expect(etaMinutes("nope", now)).toBeNull();
    expect(etaMinutes("2026-11-17T14:00:59+08:00", now)).toBe(0);
  });
});

describe("normaliseTrainAlerts", () => {
  it("disrupted", () => {
    const a = normaliseTrainAlerts(disrupted);
    expect(a.status).toBe("disrupted");
    expect(a.lines).toEqual([
      {
        line: "NEL",
        direction: "Punggol",
        stations: ["NE1", "NE3", "NE4", "NE5"],
        freePublicBus: ["NE1", "NE3", "NE4", "NE5"],
        freeBusIslandWide: false,
        freeShuttle: ["NE1", "NE3"],
        shuttleDirection: "Punggol",
      },
    ]);
    expect(a.messages[0]!.createdAt).toBe("2026-11-17T17:10:28+08:00");
    expect(a.messages[0]!.text).toMatch(/signalling fault/);
  });
  it("normal", () => {
    expect(normaliseTrainAlerts(normal)).toEqual({ status: "normal", minor: false, lines: [], messages: [] });
    expect(normaliseTrainAlerts({})).toEqual({ status: "normal", minor: false, lines: [], messages: [] });
  });
});
