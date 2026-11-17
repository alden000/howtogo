/**
 * SYNTHETIC OneMap pt routing responses (hand-built, not recorded).
 * Field set mirrors a real OneMap response; trips, timings and some stop
 * codes are invented. Replace/extend with recorded responses once the
 * Worker has a OneMap token (see docs/process/dev-log.md).
 *
 * Exported for tests and for the prototype / QA demo mode:
 *   import { FIXTURES } from '@howtogo/shared/fixtures';
 */
import { buildPlan, type StopSpec, type TransitSpec } from './builder';

/** 2026-11-18 09:30 SGT */
export const FIXTURE_T0 = Date.UTC(2026, 10, 18, 1, 30, 0);

const S = (name: string, lat: number, lng: number, code?: string): StopSpec =>
  code ? { name, lat, lng, code } : { name, lat, lng };

// ---------------------------------------------------------------- stations
const NS = {
  16: S('ANG MO KIO MRT STATION', 1.36994, 103.84954, 'NS16'),
  17: S('BISHAN MRT STATION', 1.35092, 103.84825, 'NS17'),
  18: S('BRADDELL MRT STATION', 1.3404, 103.8468, 'NS18'),
  19: S('TOA PAYOH MRT STATION', 1.33262, 103.84733, 'NS19'),
  20: S('NOVENA MRT STATION', 1.3204, 103.8436, 'NS20'),
  21: S('NEWTON MRT STATION', 1.3124, 103.838, 'NS21'),
  22: S('ORCHARD MRT STATION', 1.304, 103.832, 'NS22'),
  23: S('SOMERSET MRT STATION', 1.3005, 103.8388, 'NS23'),
  24: S('DHOBY GHAUT MRT STATION', 1.299, 103.8456, 'NS24'),
  25: S('CITY HALL MRT STATION', 1.2931, 103.852, 'NS25'),
  26: S('RAFFLES PLACE MRT STATION', 1.28393, 103.85146, 'NS26'),
};
const NE6 = S('DHOBY GHAUT MRT STATION', 1.2993, 103.8454, 'NE6');
const NE5 = S('CLARKE QUAY MRT STATION', 1.2888, 103.8465, 'NE5');

const nsLeg = (stops: StopSpec[], waitS: number, mode: TransitSpec['mode'] = 'SUBWAY'): TransitSpec => ({
  mode,
  route: 'NS',
  routeLongName: 'NORTH SOUTH LINE',
  agencyName: 'SMRT Corporation',
  agencyId: '1:SMRT',
  stops,
  waitS,
});

// ------------------------------------------------- A: Toa Payoh → TTSH (bus)
const tpOrigin = S('Origin', 1.33465, 103.8491);
const ttsh = S('Destination', 1.32135, 103.8465);

export const toaPayohToTTSH = buildPlan(tpOrigin, ttsh, FIXTURE_T0, [
  {
    fare: '1.19',
    legs: [
      {
        mode: 'WALK',
        from: tpOrigin,
        to: S('TOA PAYOH INT', 1.3327, 103.8475, '52009'),
        via: [
          [1.334, 103.8488],
          [1.3333, 103.848],
        ],
        turns: [{ at: [1.334, 103.8488], dir: 'RIGHT', street: 'Lorong 4 Toa Payoh' }],
      },
      {
        mode: 'BUS',
        route: '139',
        routeLongName: 'SBST BUS 139',
        agencyName: 'SBS Transit',
        agencyId: '1:SBST',
        waitS: 240,
        stops: [
          S('TOA PAYOH INT', 1.3327, 103.8475, '52009'),
          S('BLK 190', 1.3305, 103.8454, '52071'),
          S('OPP BLK 61', 1.3282, 103.8439, '52079'),
          S('BEF JLN TAN TOCK SENG', 1.3248, 103.8453, '50031'),
          S('TAN TOCK SENG HOSP', 1.3217, 103.8459, '50111'),
        ],
      },
      {
        mode: 'WALK',
        from: S('TAN TOCK SENG HOSP', 1.3217, 103.8459, '50111'),
        to: ttsh,
        via: [[1.3215, 103.8462]],
      },
    ],
  },
  {
    fare: '1.09',
    legs: [
      {
        mode: 'WALK',
        from: tpOrigin,
        to: NS[19],
        via: [
          [1.334, 103.8488],
          [1.3331, 103.8478],
        ],
      },
      nsLeg([NS[19], NS[20]], 180),
      {
        mode: 'WALK',
        from: NS[20],
        to: ttsh,
        via: [[1.3208, 103.845]],
        turns: [{ at: [1.3208, 103.845], dir: 'LEFT', street: 'Jalan Tan Tock Seng' }],
      },
    ],
  },
]);

// --------------------------------- B: Bishan → Raffles Place (NS line + walk)
const bsOrigin = S('Origin', 1.3529, 103.8501);
const rafflesDest = S('Destination', 1.2812, 103.8514);

export const bishanToRafflesPlace = buildPlan(bsOrigin, rafflesDest, FIXTURE_T0, [
  {
    fare: '1.77',
    legs: [
      {
        mode: 'WALK',
        from: bsOrigin,
        to: NS[17],
        via: [
          [1.352, 103.8496],
          [1.3512, 103.8486],
        ],
        turns: [{ at: [1.352, 103.8496], dir: 'RIGHT', street: 'Bishan Street 13' }],
      },
      nsLeg([NS[17], NS[18], NS[19], NS[20], NS[21], NS[22], NS[23], NS[24], NS[25], NS[26]], 150),
      {
        mode: 'WALK',
        from: NS[26],
        to: rafflesDest,
        via: [[1.283, 103.8518]],
        turns: [{ at: [1.283, 103.8518], dir: 'LEFT', street: 'Raffles Quay' }],
      },
    ],
  },
  {
    // direct MRT→MRT change at Dhoby Ghaut (NS → NE), more walking
    fare: '1.71',
    legs: [
      {
        mode: 'WALK',
        from: bsOrigin,
        to: NS[17],
        via: [
          [1.352, 103.8496],
          [1.3512, 103.8486],
        ],
      },
      nsLeg([NS[17], NS[18], NS[19], NS[20], NS[21], NS[22], NS[23], NS[24]], 150),
      {
        mode: 'SUBWAY',
        route: 'NE',
        routeLongName: 'NORTH EAST LINE',
        agencyName: 'SBS Transit',
        agencyId: '1:SBST',
        waitS: 200,
        stops: [NE6, NE5],
      },
      {
        mode: 'WALK',
        from: NE5,
        to: rafflesDest,
        via: [
          [1.2872, 103.8478],
          [1.2848, 103.8496],
        ],
      },
    ],
  },
]);

// ----------------------- C: Ang Mo Kio → Novena (bus → walk → MRT transfer)
const amkOrigin = S('Origin', 1.3672, 103.8438);

export const angMoKioToNovena = buildPlan(amkOrigin, ttsh, FIXTURE_T0, [
  {
    fare: 1.59, // number on purpose: tolerate both forms
    legs: [
      {
        mode: 'WALK',
        from: amkOrigin,
        to: S('BLK 215', 1.3666, 103.8442, '54261'),
      },
      {
        mode: 'BUS',
        route: '73',
        routeLongName: 'SBST BUS 73',
        agencyName: 'SBS Transit',
        agencyId: '1:SBST',
        waitS: 300,
        stops: [
          S('BLK 215', 1.3666, 103.8442, '54261'),
          S('BLK 230', 1.368, 103.8459, '54251'),
          S('OPP AMK HUB', 1.369, 103.8472, '54241'),
          S('ANG MO KIO INT', 1.3696, 103.8483, '54009'),
        ],
      },
      {
        mode: 'WALK',
        from: S('ANG MO KIO INT', 1.3696, 103.8483, '54009'),
        to: NS[16],
        via: [[1.37, 103.8488]],
      },
      nsLeg([NS[16], NS[17], NS[18], NS[19], NS[20]], 120, 'RAIL'),
      {
        mode: 'WALK',
        from: NS[20],
        to: ttsh,
        via: [[1.3208, 103.845]],
        turns: [{ at: [1.3208, 103.845], dir: 'LEFT', street: 'Jalan Tan Tock Seng' }],
      },
    ],
  },
]);

export const FIXTURES = {
  toaPayohToTTSH,
  bishanToRafflesPlace,
  angMoKioToNovena,
} as const;

export type FixtureName = keyof typeof FIXTURES;
