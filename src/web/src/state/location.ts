/**
 * "Where am I" for this tab (F2/F8). The browser prompt is only ever triggered from a user tap
 * on the F2 explainer (AC 25); a fix is kept in memory only, never stored.
 */
import { signal } from '@preact/signals';
import type { LatLng } from '@howtogo/shared';
import type { Api } from '../api/types';
import { log } from '../log';
import type { Platform } from '../platform/types';

export interface Here extends LatLng {
  /** Reverse-geocoded label, or null when that failed (UI falls back to "我的位置", AC 26). */
  label: string | null;
  /** Horizontal accuracy in metres (AC 39 accuracy circle). */
  acc?: number;
}

export const here = signal<Here | null>(null);
/** Last failure of a user-initiated locate. */
export const locFailure = signal<'denied' | 'unavailable' | null>(null);

/** Singapore bounding box used by the Worker's input validation (AC 16). */
export const SG_BOX = { south: 1.13, north: 1.48, west: 103.59, east: 104.1 };
export const inSingapore = (p: LatLng) => p.lat >= SG_BOX.south && p.lat <= SG_BOX.north && p.lng >= SG_BOX.west && p.lng <= SG_BOX.east;

export async function locate(platform: Platform, api: Api): Promise<'ok' | 'denied' | 'unavailable'> {
  try {
    const f = await platform.location.current();
    log('loc:ok');
    const label = await api
      .revgeocode(f)
      .then((r) => r.name || null)
      .catch(() => null);
    here.value = { lat: f.lat, lng: f.lng, label, acc: f.acc };
    locFailure.value = null;
    return 'ok';
  } catch (e) {
    const code = (e as { code?: string | number })?.code;
    const denied = code === 'denied' || code === 1;
    log(`loc:${denied ? 'denied' : 'fail'}`);
    locFailure.value = denied ? 'denied' : 'unavailable';
    return locFailure.value;
  }
}
