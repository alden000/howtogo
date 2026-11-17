/**
 * Geo utilities. Pure, dependency-free. Coordinates are WGS84 degrees.
 * Distances are metres. For point-to-segment work we use a local
 * equirectangular projection, which is accurate to well under 0.1% at
 * Singapore's scale (trips of tens of km).
 */
import type { LatLng } from './types';

export const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from a to b, degrees clockwise from north, [0, 360). */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const Δλ = (b.lng - a.lng) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Point reached from `p` after `distM` metres on `bearingDeg`. */
export function destination(p: LatLng, bearingDeg: number, distM: number): LatLng {
  const δ = distM / EARTH_RADIUS_M;
  const θ = bearingDeg * RAD;
  const φ1 = p.lat * RAD;
  const λ1 = p.lng * RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / RAD, lng: λ2 / RAD };
}

// ---------------------------------------------------------------- polyline

/** Decode a Google encoded polyline (precision 5 by default). */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = encoded.length;
  while (index < len) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= len) return out; // truncated input: return what we have
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      if (index >= len) return out;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}

function encodeSigned(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let s = '';
  while (v >= 0x20) {
    s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return s + String.fromCharCode(v + 63);
}

/** Encode points as a Google encoded polyline (precision 5 by default). */
export function encodePolyline(points: readonly LatLng[], precision = 5): string {
  const factor = 10 ** precision;
  let prevLat = 0;
  let prevLng = 0;
  let s = '';
  for (const p of points) {
    const lat = Math.round(p.lat * factor);
    const lng = Math.round(p.lng * factor);
    s += encodeSigned(lat - prevLat) + encodeSigned(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return s;
}

// ---------------------------------------------------------------- polylines

/** Cumulative distance (m) at each vertex; cum[0] = 0. */
export function cumulativeDistances(line: readonly LatLng[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i++) {
    cum.push(cum[i - 1]! + haversine(line[i - 1]!, line[i]!));
  }
  return cum;
}

export function polylineLength(line: readonly LatLng[]): number {
  const cum = cumulativeDistances(line);
  return cum[cum.length - 1] ?? 0;
}

export interface Snap {
  /** Closest point on the polyline. */
  point: LatLng;
  /** Distance from the query point to `point`, metres. */
  distanceM: number;
  /** Distance along the polyline from its start to `point`, metres. */
  alongM: number;
  /** Index of the segment start vertex. */
  segmentIndex: number;
}

/**
 * Snap a point to the nearest location on a polyline.
 * `cum` may be passed to avoid recomputing cumulative distances.
 * Returns null for an empty line.
 */
export function snapToPolyline(p: LatLng, line: readonly LatLng[], cum?: readonly number[]): Snap | null {
  if (line.length === 0) return null;
  if (line.length === 1) {
    const only = line[0]!;
    return { point: only, distanceM: haversine(p, only), alongM: 0, segmentIndex: 0 };
  }
  const c = cum ?? cumulativeDistances(line);
  const kx = Math.cos(p.lat * RAD) * RAD * EARTH_RADIUS_M; // metres per degree lng
  const ky = RAD * EARTH_RADIUS_M; // metres per degree lat
  let best: Snap | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const ax = (a.lng - p.lng) * kx;
    const ay = (a.lat - p.lat) * ky;
    const bx = (b.lng - p.lng) * kx;
    const by = (b.lat - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const d2 = qx * qx + qy * qy;
    if (d2 < bestD2) {
      bestD2 = d2;
      const segLen = c[i + 1]! - c[i]!;
      best = {
        point: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) },
        distanceM: Math.sqrt(d2),
        alongM: c[i]! + t * segLen,
        segmentIndex: i,
      };
    }
  }
  return best;
}

/** Distance (m) from a point to the nearest point of a polyline. */
export function pointToPolylineDistance(p: LatLng, line: readonly LatLng[]): number {
  return snapToPolyline(p, line)?.distanceM ?? Infinity;
}

/** Point at `alongM` metres from the start of the polyline (clamped). */
export function pointAlong(line: readonly LatLng[], alongM: number, cum?: readonly number[]): LatLng | null {
  if (line.length === 0) return null;
  const c = cum ?? cumulativeDistances(line);
  const total = c[c.length - 1]!;
  if (alongM <= 0 || line.length === 1) return line[0]!;
  if (alongM >= total) return line[line.length - 1]!;
  let i = 0;
  while (i < c.length - 2 && c[i + 1]! < alongM) i++;
  const seg = c[i + 1]! - c[i]!;
  const t = seg > 0 ? (alongM - c[i]!) / seg : 0;
  const a = line[i]!;
  const b = line[i + 1]!;
  return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
}

/** Sub-polyline between two along-distances (clamped, inclusive endpoints). */
export function slicePolyline(line: readonly LatLng[], fromM: number, toM: number): LatLng[] {
  if (line.length === 0) return [];
  const c = cumulativeDistances(line);
  const lo = Math.max(0, Math.min(fromM, toM));
  const hi = Math.min(c[c.length - 1]!, Math.max(fromM, toM));
  const out: LatLng[] = [pointAlong(line, lo, c)!];
  for (let i = 0; i < line.length; i++) {
    if (c[i]! > lo && c[i]! < hi) out.push(line[i]!);
  }
  out.push(pointAlong(line, hi, c)!);
  return out;
}

/** Remove consecutive duplicate vertices (OneMap geometries contain many "??" zero deltas). */
export function dedupePoints(line: readonly LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const p of line) {
    const last = out[out.length - 1];
    if (!last || last.lat !== p.lat || last.lng !== p.lng) out.push(p);
  }
  return out;
}
