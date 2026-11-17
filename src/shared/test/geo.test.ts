import { describe, expect, it } from 'vitest';
import {
  bearing,
  decodePolyline,
  destination,
  encodePolyline,
  haversine,
  pointAlong,
  pointToPolylineDistance,
  polylineLength,
  slicePolyline,
  snapToPolyline,
} from '../src/geo';

describe('geo', () => {
  it('haversine: Bishan MRT → Raffles Place MRT ≈ 7.5 km', () => {
    const d = haversine({ lat: 1.35092, lng: 103.84825 }, { lat: 1.28393, lng: 103.85146 });
    expect(d).toBeGreaterThan(7400);
    expect(d).toBeLessThan(7500);
  });

  it('bearing: due north / east', () => {
    expect(bearing({ lat: 1.3, lng: 103.8 }, { lat: 1.31, lng: 103.8 })).toBeCloseTo(0, 3);
    expect(bearing({ lat: 1.3, lng: 103.8 }, { lat: 1.3, lng: 103.81 })).toBeCloseTo(90, 1);
  });

  it('destination is the inverse of haversine + bearing', () => {
    const a = { lat: 1.33, lng: 103.85 };
    const b = destination(a, 37, 250);
    expect(haversine(a, b)).toBeCloseTo(250, 3);
    expect(bearing(a, b)).toBeCloseTo(37, 3);
  });

  it('decodes the canonical Google example', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ lat: 38.5, lng: -120.2 });
    expect(pts[1]).toEqual({ lat: 40.7, lng: -120.95 });
    expect(pts[2]).toEqual({ lat: 43.252, lng: -126.453 });
    expect(encodePolyline(pts)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('decodes a real OneMap walk geometry with zero deltas ("??")', () => {
    const pts = decodePolyline('{dwF_jrxR?@SAB]@KBS?C??');
    expect(pts.length).toBe(8);
    expect(pts[0]!.lat).toBeCloseTo(1.27070, 4);
    expect(pts[0]!.lng).toBeCloseTo(103.80976, 4);
  });

  it('round-trips SG coordinates at 1e-5 precision; tolerates truncated input', () => {
    const pts = [
      { lat: 1.35092, lng: 103.84825 },
      { lat: 1.3404, lng: 103.8468 },
      { lat: 1.28393, lng: 103.85146 },
    ];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
    const enc = encodePolyline(pts);
    expect(decodePolyline(enc.slice(0, enc.length - 2)).length).toBeLessThan(3);
    expect(decodePolyline('')).toEqual([]);
  });

  it('snaps to a polyline: distance, along, clamps to ends', () => {
    const line = [
      { lat: 1.3, lng: 103.8 },
      { lat: 1.3, lng: 103.81 },
      { lat: 1.31, lng: 103.81 },
    ];
    const len = polylineLength(line);
    const p = destination(pointAlong(line, 500)!, 0, 30); // 30 m north of the first segment
    const s = snapToPolyline(p, line)!;
    expect(s.distanceM).toBeCloseTo(30, 0);
    expect(s.alongM).toBeCloseTo(500, -1);
    expect(s.segmentIndex).toBe(0);
    const before = snapToPolyline({ lat: 1.3, lng: 103.79 }, line)!;
    expect(before.alongM).toBe(0);
    const after = snapToPolyline({ lat: 1.32, lng: 103.81 }, line)!;
    expect(after.alongM).toBeCloseTo(len, 3);
    expect(pointToPolylineDistance(p, line)).toBeCloseTo(30, 0);
    expect(snapToPolyline(p, [])).toBeNull();
  });

  it('slices a polyline by distance', () => {
    const line = [
      { lat: 1.3, lng: 103.8 },
      { lat: 1.3, lng: 103.81 },
      { lat: 1.31, lng: 103.81 },
    ];
    const total = polylineLength(line);
    const part = slicePolyline(line, 200, total - 200);
    expect(polylineLength(part)).toBeCloseTo(total - 400, 0);
    expect(part).toContainEqual(line[1]);
  });
});
