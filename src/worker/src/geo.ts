/** Singapore bounding box (generous, includes offshore islands served by transit). */
export const SG_BBOX = { minLat: 1.13, maxLat: 1.48, minLng: 103.59, maxLng: 104.1 } as const;

export function inSingapore(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= SG_BBOX.minLat &&
    lat <= SG_BBOX.maxLat &&
    lng >= SG_BBOX.minLng &&
    lng <= SG_BBOX.maxLng
  );
}

/** Parses "lat,lng". Returns null if malformed (does not check the bbox). */
export function parseLatLng(value: string | null): { lat: number; lng: number } | null {
  if (!value) return null;
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(value);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function round(n: number, dp: number): string {
  return n.toFixed(dp);
}
