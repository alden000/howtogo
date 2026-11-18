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
  /** QA-38 (M4 AC 36): the reverse-geocoded street address and 6-digit postal code, when known. */
  address?: string;
  postal?: string;
  /** Horizontal accuracy in metres (AC 39 accuracy circle). */
  acc?: number;
  /** QA-59: the Worker is in sample (fixture) mode and did not name this position (label stays null). */
  sample?: boolean;
}

export const here = signal<Here | null>(null);
/**
 * 6f.6 L6: the last fix that got an address, with its time (epoch ms). Memory only, like `here`: offline,
 * Show the driver's 我在哪里 tab shows it with "这是 {time} 的位置。"; a cold offline start has none.
 */
export const lastAddress = signal<(Here & { at: number }) | null>(null);
/** Last failure of a user-initiated locate. */
export const locFailure = signal<'denied' | 'unavailable' | null>(null);

/** Singapore bounding box used by the Worker's input validation (AC 16). */
export const SG_BOX = { south: 1.13, north: 1.48, west: 103.59, east: 104.1 };
export const inSingapore = (p: LatLng) => p.lat >= SG_BOX.south && p.lat <= SG_BOX.north && p.lng >= SG_BOX.west && p.lng <= SG_BOX.east;

export async function locate(platform: Platform, api: Api): Promise<'ok' | 'denied' | 'unavailable'> {
  try {
    const f = await platform.location.current();
    log('loc:ok');
    const r = await api.revgeocode(f).catch(() => null);
    const label = r?.name || null;
    here.value = { lat: f.lat, lng: f.lng, label, acc: f.acc, ...(r?.address ? { address: r.address } : {}), ...(r?.postal ? { postal: r.postal } : {}), ...(r?.sample ? { sample: true } : {}) };
    if (label || r?.address) lastAddress.value = { ...here.value, at: Date.now() };
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
