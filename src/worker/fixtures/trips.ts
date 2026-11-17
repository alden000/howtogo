/**
 * Two extra SYNTHETIC OneMap pt plans for Worker fixture mode (AC 21 asks for >= 5 trips;
 * the shared engine ships 3). Real Singapore places and station codes; timings are derived
 * by the shared builder. Not recorded responses: replace once a OneMap token exists.
 *
 * The builder is not in @howtogo/shared's export map, so it is imported by path.
 */
import { buildPlan, type StopSpec } from "../../shared/test/fixtures/builder";
import { FIXTURE_T0 } from "@howtogo/shared/fixtures";

const S = (name: string, lat: number, lng: number, code?: string): StopSpec =>
  code ? { name, lat, lng, code } : { name, lat, lng };

// ------------------------- D: Jurong East → National University Hospital (EW → CC)
const jeOrigin = S("Origin", 1.3335, 103.7436);
const nuh = S("Destination", 1.2941, 103.7831);
const EW24 = S("JURONG EAST MRT STATION", 1.33315, 103.74228, "EW24");
const EW23 = S("CLEMENTI MRT STATION", 1.31516, 103.76525, "EW23");
const EW22 = S("DOVER MRT STATION", 1.31139, 103.77866, "EW22");
const EW21 = S("BUONA VISTA MRT STATION", 1.30728, 103.79035, "EW21");
const CC22 = S("BUONA VISTA MRT STATION", 1.3069, 103.7902, "CC22");
const CC23 = S("ONE-NORTH MRT STATION", 1.29966, 103.78716, "CC23");
const CC24 = S("KENT RIDGE MRT STATION", 1.29351, 103.78452, "CC24");

export const jurongEastToNUH = buildPlan(jeOrigin, nuh, FIXTURE_T0, [
  {
    fare: "1.59",
    legs: [
      { mode: "WALK", from: jeOrigin, to: EW24, via: [[1.3334, 103.7428]] },
      {
        mode: "SUBWAY",
        route: "EW",
        routeLongName: "EAST WEST LINE",
        agencyName: "SMRT Corporation",
        agencyId: "1:SMRT",
        waitS: 180,
        stops: [EW24, EW23, EW22, EW21],
      },
      {
        mode: "SUBWAY",
        route: "CC",
        routeLongName: "CIRCLE LINE",
        agencyName: "SMRT Corporation",
        agencyId: "1:SMRT",
        waitS: 240,
        stops: [CC22, CC23, CC24],
      },
      {
        mode: "WALK",
        from: CC24,
        to: nuh,
        via: [[1.2938, 103.7838]],
        turns: [{ at: [1.2938, 103.7838], dir: "RIGHT", street: "Lower Kent Ridge Road" }],
      },
    ],
  },
]);

// ------------------------- E: Bedok → Changi General Hospital (EW line + walk)
const bedokOrigin = S("Origin", 1.3248, 103.9282);
const cgh = S("Destination", 1.3405, 103.9493);
const EW5 = S("BEDOK MRT STATION", 1.324, 103.93, "EW5");
const EW4 = S("TANAH MERAH MRT STATION", 1.3272, 103.9465, "EW4");
const EW3 = S("SIMEI MRT STATION", 1.3432, 103.9533, "EW3");

export const bedokToCGH = buildPlan(bedokOrigin, cgh, FIXTURE_T0, [
  {
    fare: "1.19",
    legs: [
      { mode: "WALK", from: bedokOrigin, to: EW5 },
      {
        mode: "SUBWAY",
        route: "EW",
        routeLongName: "EAST WEST LINE",
        agencyName: "SMRT Corporation",
        agencyId: "1:SMRT",
        waitS: 150,
        stops: [EW5, EW4, EW3],
      },
      {
        mode: "WALK",
        from: EW3,
        to: cgh,
        via: [[1.3421, 103.9515]],
        turns: [{ at: [1.3421, 103.9515], dir: "LEFT", street: "Simei Street 3" }],
      },
    ],
  },
]);
