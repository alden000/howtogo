/** AC 6 deep link: `/#/route?from=lat,lng&to=lat,lng` (from optional = my location). */
import type { Place } from '@howtogo/shared';
import type { Api } from '../api/types';

/** Parses `#/route?from=…&to=…`; names come from reverse geocoding (fallback: the coordinates). */
export async function parseRouteLink(hash: string, api: Api): Promise<{ from: Place | null; to: Place } | null> {
  const m = /^#\/route\?(.*)$/.exec(hash);
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  const pt = (v: string | null) => {
    const [lat, lng] = (v ?? '').split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) && v ? { lat: lat!, lng: lng! } : null;
  };
  const to = pt(q.get('to'));
  if (!to) return null;
  const from = pt(q.get('from'));
  const name = async (p: { lat: number; lng: number }): Promise<Place> => {
    const label = await api.revgeocode(p).then((r) => r.name || null, () => null);
    return { name: label ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`, lat: p.lat, lng: p.lng };
  };
  const [f, t] = await Promise.all([from ? name(from) : Promise.resolve(null), name(to)]);
  return { from: f, to: t };
}
