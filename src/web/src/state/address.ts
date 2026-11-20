/**
 * 1.2 (QA-72/73): saved places a driver can find. A Home or My place picked at road/estate level
 * ("Admiralty Grove") has no block or postal code, so the driver card (H10) showed only the name.
 *  - `hasPostal`: the place already carries a 6-digit postal code (field or address);
 *  - `withBlock`: a chosen block merged into the picked place (keeps an estate name as the name);
 *  - `backfillAddress`: reverse geocode the saved point once for the full address + postal;
 *  - the one-time Home nudge flag (`homeNudge.v1`, cleared by Delete all like every other key).
 */
import { signal } from '@preact/signals';
import type { Place } from '@howtogo/shared';
import type { Api, SearchResult } from '../api/types';
import { local, type KV } from './storage';

export const POSTAL_RE = /^\d{6}$/;

export function postalOf(p: Pick<Place, 'postal' | 'address'> | null | undefined): string | undefined {
  if (!p) return undefined;
  if (p.postal && POSTAL_RE.test(p.postal)) return p.postal;
  return /\b(\d{6})\b/.exec(p.address ?? '')?.[1];
}
export const hasPostal = (p: Pick<Place, 'postal' | 'address'> | null | undefined) => !!postalOf(p);

/** Same saved spot (≈ 1 m). */
export const samePoint = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5;

/** "676A Woodlands Drive 71 Singapore 731676" → "676A Woodlands Drive 71". */
export const streetLine = (address: string | undefined) => (address ?? '').replace(/\s*Singapore\s*\d{6}$/i, '').trim();

/**
 * The block the user chose for a road/estate-level pick. The picked name stays when it says more than the
 * block's street ("Admiralty Grove" + "676A Woodlands Drive 71"); a road name already in the block's
 * address ("Woodlands Drive 71") gives way to the block's own name.
 */
export function withBlock(picked: Place, block: SearchResult): Place {
  const n = picked.name.trim().toLowerCase();
  const inBlock = !n || `${block.name} ${block.address}`.toLowerCase().includes(n);
  return {
    name: inBlock ? block.name : picked.name,
    address: block.address,
    postal: block.postal,
    lat: block.lat,
    lng: block.lng,
  };
}

/** The address + postal of a saved point without one (null when it has one, or the lookup finds none). */
export async function backfillAddress(api: Pick<Api, 'revgeocode'>, p: Place): Promise<{ address: string; postal: string } | null> {
  if (hasPostal(p)) return null;
  const r = await api.revgeocode({ lat: p.lat, lng: p.lng }).catch(() => null);
  if (!r || r.sample || !r.postal || !POSTAL_RE.test(r.postal)) return null;
  return { address: r.address || r.name, postal: r.postal };
}

/** A 6-digit postal code → the matching search hit (OneMap answers a postal code with that building). */
export async function findPostal(api: Pick<Api, 'search'>, code: string): Promise<SearchResult | null> {
  if (!POSTAL_RE.test(code)) return null;
  const res = await api.search(code).catch(() => null);
  return res?.find((r) => r.postal === code) ?? null;
}

// ---------------------------------------------------------------- one-time Home nudge
const NUDGE_KEY = 'homeNudge.v1';
export function createNudgeFlag(kv: KV = local) {
  const seen = signal(kv.get(NUDGE_KEY) === '1');
  return {
    seen,
    done() {
      seen.value = true;
      kv.set(NUDGE_KEY, '1');
    },
  };
}
export const homeNudge = createNudgeFlag();

/**
 * A My place picked at road/estate level, waiting for "哪一座？/ Which block?" on the My places page.
 * Kept out of the lazy Search chunk (like pendingHome).
 */
export const pendingPlace = signal<Place | null>(null);
