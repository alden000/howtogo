/**
 * Payload posted to the Worker's live-share relay (Durable Object), exactly the
 * PUT /api/share/:id contract in src/worker/API.md:
 * {lat,lng,acc,heading?,speed?,etaISO?,stepText? (≤ 280),status,updatedAt}.
 */
import type { GuidanceState, SharePayload, ShareStatus, ShareStep, Step } from './types';

export interface SharePayloadOptions {
  /** The user's share state when it overrides guidance (`help`, `paused`). */
  status?: ShareStatus;
  /** Epoch ms; defaults to the guidance clock (last event / fix time). */
  updatedAt?: number;
  /** Ride steps: stops still to go (the runtime's countdown); defaults to the step's stop count. */
  stopsLeft?: number | null;
}

/** Body of a status-only or position update (API.md: position optional since M4). */
export type ShareUpdate = Omit<SharePayload, 'lat' | 'lng' | 'acc'> & { lat?: number; lng?: number; acc?: number };

const clip = (s: string | undefined, n = 80) => (s ? s.slice(0, n) : undefined);

/**
 * Structured step for the family page (§6e.2 templates). Rail stations go as codes so the
 * viewer can name them in its own language; bus stops and places go as shown.
 */
export function shareStepOf(step: Step | undefined, stopsLeft?: number | null): ShareStep | undefined {
  if (!step) return undefined;
  const out = (s: ShareStep): ShareStep => {
    for (const k of Object.keys(s) as (keyof ShareStep)[]) if (s[k] === undefined || s[k] === '') delete s[k];
    return s;
  };
  const rail = step.mode === 'mrt' || step.mode === 'lrt';
  const n = typeof stopsLeft === 'number' && stopsLeft >= 0 ? stopsLeft : step.stopCount;
  switch (step.kind) {
    case 'walk_to_stop':
    case 'walk_transfer':
    case 'walk_to_destination': {
      const p = step.params;
      const place = step.kind === 'walk_to_destination' ? String(p.dest ?? '') : String(p.stop ?? '');
      return out({ k: 'walk', place: clip(place) });
    }
    case 'board_bus':
      return out({ k: 'wait', svc: clip(step.route, 8), stop: clip(String(step.params.stop ?? '')) });
    case 'board_train':
      return out({ k: 'wait', station: clip(step.fromCode ?? String(step.params.stop ?? '')), line: step.line?.code });
    case 'ride_bus':
      return out({ k: 'bus', svc: clip(step.route, 8), stops: Math.min(200, Math.max(0, Math.round(n))) });
    case 'ride_train':
      return out({ k: 'train', line: step.line?.code, towards: clip(step.towardsCode), stops: Math.min(200, Math.max(0, Math.round(n))) });
  }
  return rail ? out({ k: 'train' }) : undefined;
}

/** Like `toSharePayload`, but a missing fix gives a status-only update (start before the first fix, help with no fix). */
export function toShareUpdate(state: GuidanceState, opts: SharePayloadOptions = {}): ShareUpdate {
  const p = toSharePayload(state, opts);
  if (p) return p;
  const u: ShareUpdate = { status: opts.status ?? shareStatusOf(state), updatedAt: opts.updatedAt ?? state.t ?? Date.now() };
  if (state.etaISO) u.etaISO = state.etaISO;
  const step = state.steps[state.stepIndex];
  if (step) u.stepText = step.text.slice(0, 280);
  const st = shareStepOf(step, opts.stopsLeft);
  if (st) u.step = st;
  return u;
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
  const st = shareStepOf(step, opts.stopsLeft);
  if (st) p.step = st;
  return p;
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
