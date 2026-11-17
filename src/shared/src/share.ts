/**
 * Payload posted to the Worker's live-share relay (Durable Object), exactly the
 * PUT /api/share/:id contract in src/worker/API.md:
 * {lat,lng,acc,heading?,speed?,etaISO?,stepText? (≤ 280),status,updatedAt}.
 */
import type { GuidanceState, SharePayload, ShareStatus } from './types';

export interface SharePayloadOptions {
  /** The user's share state when it overrides guidance (`help`, `paused`). */
  status?: ShareStatus;
  /** Epoch ms; defaults to the guidance clock (last event / fix time). */
  updatedAt?: number;
}

/** Maps guidance onto the Worker's statuses: arrived → `arrived`, anything else (incl. off route, weak GPS) → `travelling`. */
export function shareStatusOf(state: GuidanceState): ShareStatus {
  return state.status === 'arrived' ? 'arrived' : 'travelling';
}

/** Returns null until the first good fix. */
export function toSharePayload(state: GuidanceState, opts: SharePayloadOptions = {}): SharePayload | null {
  const fix = state.fix;
  if (!fix) return null;
  const p: SharePayload = {
    lat: round(fix.lat, 6),
    lng: round(fix.lng, 6),
    acc: Math.round(fix.acc),
    status: opts.status ?? shareStatusOf(state),
    updatedAt: opts.updatedAt ?? state.t ?? fix.t,
  };
  if (typeof fix.heading === 'number' && Number.isFinite(fix.heading)) p.heading = ((Math.round(fix.heading) % 360) + 360) % 360;
  if (typeof fix.speed === 'number' && Number.isFinite(fix.speed) && fix.speed >= 0) p.speed = Math.min(99.9, round(fix.speed, 1));
  if (state.etaISO) p.etaISO = state.etaISO;
  const step = state.steps[state.stepIndex];
  if (step) p.stepText = step.text.slice(0, 280);
  return p;
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
