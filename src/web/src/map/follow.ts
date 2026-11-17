/**
 * Follow-me camera mode (pure). Rules:
 *  - any user gesture on the map (drag, pinch, rotate) pauses follow-me and exposes "recentre";
 *  - follow-me resumes ONLY via the recentre control or a guidance step change — never on a timer.
 */
import type { LatLng } from '@howtogo/shared';

export type FollowMode = 'follow' | 'free';
export type FollowEvent = { type: 'user_gesture' } | { type: 'recentre' } | { type: 'step_changed' } | { type: 'overview' };

export function followReducer(mode: FollowMode, ev: FollowEvent): FollowMode {
  switch (ev.type) {
    case 'user_gesture':
    case 'overview':
      return 'free';
    case 'recentre':
    case 'step_changed':
      return 'follow';
  }
}

export interface Camera {
  center: [number, number];
  bearing: number;
  pitch: number;
  zoom: number;
}

export const FOLLOW_ZOOM = 17;
export const FOLLOW_PITCH = 30;

/** Camera for follow-me: centred on the snapped position, heading-up, modest pitch. */
export function followCamera(pos: LatLng, heading: number | null | undefined, zoom = FOLLOW_ZOOM, pitch = FOLLOW_PITCH): Camera {
  const bearing = typeof heading === 'number' && Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0;
  return { center: [pos.lng, pos.lat], bearing, pitch, zoom };
}

/** Bounds [[w,s],[e,n]] of a set of points, or null. */
export function boundsOf(points: LatLng[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [
    [w, s],
    [e, n],
  ];
}
