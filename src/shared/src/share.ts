/**
 * Payload posted to the Worker's live-share relay (Durable Object).
 * Shape: {lat,lng,acc,heading?,speed?,etaISO?,stepText?,status}
 */
import type { GuidanceState, SharePayload } from './types';

/** Returns null until the first good fix. */
export function toSharePayload(state: GuidanceState): SharePayload | null {
  const fix = state.fix;
  if (!fix) return null;
  const status: SharePayload['status'] =
    state.status === 'arrived' ? 'arrived' : state.status === 'off_route' ? 'off_route' : state.gpsWeak ? 'gps_weak' : 'active';
  const p: SharePayload = {
    lat: round(fix.lat, 6),
    lng: round(fix.lng, 6),
    acc: Math.round(fix.acc),
    status,
  };
  if (typeof fix.heading === 'number' && Number.isFinite(fix.heading)) p.heading = Math.round(fix.heading);
  if (typeof fix.speed === 'number' && Number.isFinite(fix.speed)) p.speed = round(fix.speed, 1);
  if (state.etaISO) p.etaISO = state.etaISO;
  const step = state.steps[state.stepIndex];
  if (step) p.stepText = step.text;
  return p;
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
