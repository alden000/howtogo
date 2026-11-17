import { describe, expect, it } from 'vitest';
import { FIXTURES } from './fixtures';
import { normalizeOneMapPlan, parseExit, prettyStopName } from '../src/onemap';
import { inferLine, inferTerminus, lineByCode } from '../src/lines';
import { encodePolyline } from '../src/geo';

describe('normalizeOneMapPlan — fixtures', () => {
  for (const [name, raw] of Object.entries(FIXTURES)) {
    it(`${name}: parses every itinerary with consistent legs`, () => {
      const plan = normalizeOneMapPlan(raw);
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.warnings).toEqual([]);
      expect(plan.itineraries.length).toBeGreaterThan(0);
      expect(plan.from?.lat).toBeTypeOf('number');
      for (const it of plan.itineraries) {
        expect(it.legs.length).toBeGreaterThan(0);
        expect(it.endTime).toBeGreaterThan(it.startTime);
        expect(it.fare).toBeGreaterThan(0);
        for (const leg of it.legs) {
          expect(leg.geometry.length).toBeGreaterThanOrEqual(2);
          expect(['walk', 'bus', 'mrt', 'lrt']).toContain(leg.mode);
          expect(leg.endTime).toBeGreaterThanOrEqual(leg.startTime);
          if (leg.mode === 'bus') expect(leg.route).toMatch(/^\d+$/);
          if (leg.mode === 'mrt') expect(leg.line?.colorToken).toMatch(/^line-/);
        }
        const transit = it.legs.filter((l) => l.mode !== 'walk').length;
        expect(it.transfers).toBe(Math.max(0, transit - 1));
      }
    });
  }

  it('Toa Payoh → TTSH: bus leg details', () => {
    const plan = normalizeOneMapPlan(FIXTURES.toaPayohToTTSH);
    if (!plan.ok) throw new Error();
    const bus = plan.itineraries[0]!.legs[1]!;
    expect(bus.mode).toBe('bus');
    expect(bus.route).toBe('139');
    expect(bus.agency).toBe('SBS Transit');
    expect(bus.from).toMatchObject({ code: '52009', id: 'FERRY:52009', displayName: 'Toa Payoh Int' });
    expect(bus.intermediateStops.map((s) => s.code)).toEqual(['52071', '52079', '50031']);
    expect(bus.to.displayName).toBe('Tan Tock Seng Hosp');
    expect(plan.itineraries[0]!.fare).toBe(1.19);
    const walk = plan.itineraries[0]!.legs[0]!;
    expect(walk.turns.map((t) => t.direction)).toEqual(['DEPART', 'RIGHT']);
    expect(walk.turns[1]!.streetName).toBe('Lorong 4 Toa Payoh');
    expect(walk.turns[0]!.streetName).toBeUndefined(); // bogus "path" name dropped
  });

  it('Ang Mo Kio → Novena: mode "RAIL" + numeric fare are accepted, line inferred', () => {
    const plan = normalizeOneMapPlan(FIXTURES.angMoKioToNovena);
    if (!plan.ok) throw new Error();
    const it = plan.itineraries[0]!;
    expect(it.fare).toBe(1.59);
    const rail = it.legs.find((l) => l.route === 'NS')!;
    expect(rail.mode).toBe('mrt');
    expect(rail.line?.name['en-SG']).toBe('North-South Line');
    expect(rail.from.displayName).toBe('Ang Mo Kio');
    expect(it.transfers).toBe(1);
  });

  it('accepts a JSON string body', () => {
    const plan = normalizeOneMapPlan(JSON.stringify(FIXTURES.bishanToRafflesPlace));
    expect(plan.ok && plan.itineraries.length).toBe(2);
  });
});

describe('normalizeOneMapPlan — malformed and variant input', () => {
  it.each([
    [null, 'malformed'],
    [42, 'malformed'],
    ['not json', 'malformed'],
    [[], 'malformed'],
    [{}, 'no_route'],
    [{ plan: 'x' }, 'malformed'],
    [{ plan: { itineraries: {} } }, 'malformed'],
    [{ plan: { itineraries: [] } }, 'no_route'],
    [{ error: 'Invalid token' }, 'api_error'],
    [{ error: { id: 404, msg: 'PATH_NOT_FOUND', noPath: true } }, 'no_route'],
    [{ plan: { itineraries: [{ legs: [] }, { nolegs: true }, 'junk'] } }, 'malformed'],
  ])('%j → %s', (raw, error) => {
    const r = normalizeOneMapPlan(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(error);
  });

  it('drops unusable legs with warnings, keeps the rest; derives missing fields', () => {
    const raw = {
      plan: {
        itineraries: [
          {
            fare: '$2.10',
            legs: [
              { mode: 'WALK', from: { name: 'Origin' }, to: { name: 'X' } }, // no coords, no geometry → dropped
              {
                mode: 'TRAM',
                route: 'BP',
                startTime: 1_700_000_000, // seconds, not ms
                endTime: 1_700_000_300,
                from: { name: 'CHOA CHU KANG LRT STATION', lat: 1.3853, lon: 103.7443, stopCode: 'BP1' },
                to: { name: 'PHOENIX LRT STATION', lat: 1.3786, lon: 103.758, stopCode: 'BP5' },
              },
              {
                mode: 'FERRY_OR_SOMETHING',
                routeShortName: 'DT1',
                from: { name: 'BUKIT PANJANG MRT STATION', lat: 1.3784, lon: 103.7618 },
                to: { name: 'CASHEW MRT STATION', lat: 1.3693, lon: 103.7646 },
                legGeometry: { points: encodePolyline([{ lat: 1.3784, lng: 103.7618 }, { lat: 1.3693, lng: 103.7646 }]) },
              },
            ],
          },
        ],
      },
    };
    const r = normalizeOneMapPlan(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const it = r.itineraries[0]!;
    expect(it.legs).toHaveLength(2);
    expect(r.warnings.join('\n')).toMatch(/dropped/);
    const [lrt, dt] = it.legs;
    expect(lrt!.mode).toBe('lrt');
    expect(lrt!.line?.code).toBe('BP');
    expect(lrt!.line?.colorToken).toBe('line-lrt');
    expect(lrt!.startTime).toBe(1_700_000_000_000);
    expect(lrt!.durationS).toBe(300);
    expect(lrt!.geometry).toHaveLength(2); // straight line from endpoints
    expect(lrt!.distanceM).toBeGreaterThan(1000);
    expect(dt!.mode).toBe('mrt');
    expect(dt!.line?.code).toBe('DT');
    expect(it.fare).toBe(2.1);
    expect(it.transfers).toBe(1);
  });

  it('merges consecutive walk legs and ignores an absurd geometry', () => {
    const a = { lat: 1.3, lon: 103.8, name: 'Origin' };
    const b = { lat: 1.301, lon: 103.8, name: 'Mid' };
    const c = { lat: 1.302, lon: 103.8, name: 'Destination' };
    const r = normalizeOneMapPlan({
      plan: {
        itineraries: [
          {
            legs: [
              { mode: 'WALK', from: a, to: b, distance: 111, duration: 90, legGeometry: { points: encodePolyline([{ lat: 40, lng: -70 }]) } },
              { mode: 'WALK', from: b, to: c, distance: 111, duration: 90 },
            ],
          },
        ],
      },
    });
    if (!r.ok) throw new Error(r.message);
    expect(r.itineraries[0]!.legs).toHaveLength(1);
    expect(r.itineraries[0]!.legs[0]!.distanceM).toBe(222);
    expect(r.itineraries[0]!.transfers).toBe(0);
    expect(r.warnings.join()).toMatch(/far from leg start/);
  });
});

describe('names and lines', () => {
  it('prettifies stop names and parses exits', () => {
    expect(prettyStopName('FARRER PARK MRT STATION')).toBe('Farrer Park');
    expect(prettyStopName('OPP BLK 61')).toBe('Opp Blk 61');
    expect(prettyStopName('HARBOURFRONT STN/VIVOCITY')).toBe('Harbourfront Stn/Vivocity');
    expect(prettyStopName('Tan Tock Seng Hospital')).toBe('Tan Tock Seng Hospital');
    expect(parseExit('FARRER PK STN EXIT A')).toBe('A');
    expect(parseExit('Exit 3')).toBe('3');
    expect(parseExit('BLK 61')).toBeUndefined();
  });

  it('infers lines from route ids, station codes and long names', () => {
    expect(inferLine({ route: 'NS' })?.code).toBe('NS');
    expect(inferLine({ routeId: 'SMRT:EWL' })?.code).toBe('EW');
    expect(inferLine({ fromStopCode: 'CC29' })?.code).toBe('CC');
    expect(inferLine({ routeLongName: 'THOMSON-EAST COAST LINE' })?.code).toBe('TE');
    expect(inferLine({ route: 'SW' })?.kind).toBe('lrt');
    expect(inferLine({ route: '162' })).toBeUndefined();
    for (const c of ['NS', 'EW', 'NE', 'CC', 'DT', 'TE', 'BP', 'SW', 'SE', 'PE', 'PW']) {
      expect(lineByCode(c)?.colorToken).toMatch(/^line-[a-z]+$/);
    }
  });

  it('infers "towards" from station numbering', () => {
    expect(inferTerminus('NS', 'NS17', 'NS26')?.['en-SG']).toBe('Marina South Pier');
    expect(inferTerminus('NS', 'NS26', 'NS17')?.['zh-CN']).toBe('裕廊东');
    expect(inferTerminus('NE', 'NE6', 'NE5')?.['en-SG']).toBe('HarbourFront');
    expect(inferTerminus('BP', 'BP1', 'BP5')).toBeUndefined();
  });
});
