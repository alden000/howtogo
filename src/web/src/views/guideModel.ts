/**
 * Pure view-model for the guided-trip screens (H5/H6/H6b/H11/G1/G5, STYLE-GUIDE §6c).
 * No state or decisions of its own: it maps `runtime.ui` + the current step to what the
 * frames show (which note, which action rows, pocket text, map viewport). Unit-tested.
 */
import type { AlertState, GuidanceState, Leg, Step } from '@howtogo/shared';
import type { IconName } from '../ui/kit';
import type { UiKey } from '../i18n/ui';
import type { TripUi } from '../trip/runtime';

export type StepGroup = 'walk' | 'wait' | 'ride';

export function stepGroup(step: Step | undefined): StepGroup {
  if (!step) return 'walk';
  if (step.kind.startsWith('board')) return 'wait';
  if (step.kind.startsWith('ride')) return 'ride';
  return 'walk';
}

export const vehicleIcon = (s: Step): IconName => (s.mode === 'bus' ? 'bus' : 'train');

/** §5.3 icon tile: walk = primary-soft · waiting = ink · arrive = saffron. */
export function stepIcon(step: Step | undefined, isLast: boolean): { icon: IconName; cls: '' | 'wait' | 'arrive' } {
  const g = stepGroup(step);
  if (!step || g === 'walk') return { icon: 'walk', cls: isLast ? 'arrive' : '' };
  if (g === 'wait') return { icon: vehicleIcon(step), cls: 'wait' };
  return { icon: vehicleIcon(step), cls: '' };
}

/** Metres left on a walk step, rounded to 10 m (never negative). */
export function metresLeft(g: Pick<GuidanceState, 'distanceToNextActionM'>): number {
  return Math.max(0, Math.round(g.distanceToNextActionM / 10) * 10);
}

/** F2: minutes for this walk alone, from the metres left at ≈ 4 km/h (67 m/min, the planner's walk speed). */
export function walkMinutes(metres: number): number {
  return Math.max(1, Math.ceil(metres / 67));
}

/** Whole minutes left (at least 1 while not arrived). */
export function minutesLeft(remainingS: number): number {
  return Math.max(1, Math.ceil(remainingS / 60));
}

// ------------------------------------------------------------------ trip notes (6c.10)

export type NoteId = 'reroute-failed' | 'reroute-offline' | 'notify-ask' | 'offline' | 'weak' | 'manual' | 'found-you' | 'wakelock' | 'notify-denied' | 'novoice' | 'killed';

/**
 * One note at a time, by priority: re-route failed/offline > notification explainer (only while the
 * prompt is up) > offline > weak GPS > manual mode (or its 4.2 s "found you" follow-up) > wake lock >
 * notifications denied > no voice.
 */
export function pickNote(
  ui: Pick<TripUi, 'reroute' | 'gpsWeak' | 'manual' | 'wakeLockFailed' | 'noVoice'> & Partial<Pick<TripUi, 'notify'>>,
  o: { online: boolean; foundYou: boolean; noVoiceDismissed: boolean; native?: boolean; killed?: boolean },
): NoteId | null {
  if (ui.reroute === 'failed') return 'reroute-failed';
  if (ui.reroute === 'offline') return 'reroute-offline';
  if (ui.notify === 'asking') return 'notify-ask';
  if (!o.online) return 'offline';
  if (ui.gpsWeak && !ui.manual) return 'weak';
  // M6 6h.3 A5: in the app the notifications-off note comes after weak GPS, before manual mode; the app never
  // shows the wake-lock note (6h.10). 6h.4 B3: the "phone closed 怎么去" note once on the resumed trip.
  if (o.native) {
    if (ui.notify === 'denied') return 'notify-denied';
    if (o.killed) return 'killed';
  }
  if (ui.manual) return 'manual';
  if (o.foundYou) return 'found-you';
  if (ui.wakeLockFailed && !o.native) return 'wakelock';
  if (ui.notify === 'denied') return 'notify-denied';
  if (ui.noVoice && !o.noVoiceDismissed) return 'novoice';
  return null;
}

// ------------------------------------------------------------------ step actions (6c.7)

export interface StepActions {
  /** Row A: the step action, or Next (manual mode on walk steps). */
  a: 'im_on' | 'got_off' | 'next' | null;
  /** Row A is primary 72 px (manual mode, or weak GPS on wait/ride). */
  aPrimary: boolean;
  /** Row B: Pocket next to Say it again. */
  pocket: boolean;
  /** Row C: Next stays in the quiet row (not when it moved up to row A). */
  quietNext: boolean;
}

export function stepActions(group: StepGroup, o: { manual: boolean; gpsWeak: boolean }): StepActions {
  const a = group === 'wait' ? 'im_on' : group === 'ride' ? 'got_off' : o.manual ? 'next' : null;
  return {
    a,
    aPrimary: o.manual || (o.gpsWeak && a !== null && a !== 'next'),
    pocket: !o.manual && (group === 'walk' || group === 'ride'),
    quietNext: !(o.manual && group === 'walk'),
  };
}

// ------------------------------------------------------------------ get-off alert (H6 / H6b)

export function alertCopy(a: AlertState): { title: UiKey; t1: UiKey; t2: UiKey; line: UiKey; sign: UiKey; icon: IconName } {
  const bus = a.mode === 'bus';
  if (a.kind === 'now') return { title: 'now_t', t1: 'now_t1', t2: 'now_t2', line: bus ? 'now_bus' : 'now_train', sign: bus ? 'sign_bus' : 'sign_train', icon: 'exit' };
  return { title: 'getoff_t', t1: 'getoff_t1', t2: 'getoff_t2', line: bus ? 'getoff_bell' : 'getoff_train', sign: bus ? 'sign_bus' : 'sign_train', icon: bus ? 'bell' : 'train' };
}

// ------------------------------------------------------------------ pocket view (G1)

export interface PocketText {
  glyph: IconName;
  line: { key: UiKey; p: Record<string, string | number> };
  count: { key: UiKey; p: Record<string, string | number> } | null;
}

export function pocketText(step: Step | undefined, g: Pick<GuidanceState, 'distanceToNextActionM'>, ui: Pick<TripUi, 'stopsLeft' | 'mrt'>, place: string): PocketText {
  const grp = stepGroup(step);
  if (step && grp === 'ride') {
    const train = step.mode !== 'bus';
    const line: PocketText['line'] = train ? { key: 'pk_train', p: {} } : { key: 'pk_bus', p: { s: step.route ?? '' } };
    if (train && ui.mrt) return { glyph: 'train', line, count: { key: 'pk_n_est', p: { n: ui.mrt.stopsLeft } } };
    const n = ui.stopsLeft ?? step.stopCount;
    return { glyph: train ? 'train' : 'bus', line, count: { key: n === 1 ? 'g_stop_left1' : 'g_stops_left', p: { n } } };
  }
  if (step && grp === 'wait') return { glyph: vehicleIcon(step), line: { key: 'pk_walk', p: { p: place } }, count: null };
  return { glyph: 'walk', line: { key: 'pk_walk', p: { p: place } }, count: { key: 'pk_m', p: { m: metresLeft(g) } } };
}

// ------------------------------------------------------------------ ride stop dots (§5.3)

/** One dot per stop on the ride: done / current (next) / goal. Never counts up (uses the runtime floor). */
export function stopDots(step: Step | undefined, stopsLeft: number | null): ('done' | 'next' | 'todo' | 'goal')[] {
  const n = step?.stopCount ?? 0;
  if (n <= 0) return [];
  const left = Math.min(n, Math.max(0, stopsLeft ?? n));
  const passed = n - left;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? 'goal' : i < passed ? 'done' : i === passed ? 'next' : 'todo'));
}

/** Name of the next stop on a ride ("下一站：…"). */
export function nextStopName(step: Step | undefined, stopsLeft: number | null): string | null {
  const stops = step?.stops;
  if (!stops?.length) return null;
  const n = stops.length;
  const left = Math.min(n, Math.max(1, stopsLeft ?? n));
  return stops[n - left]?.name ?? null;
}

// ------------------------------------------------------------------ map viewport (6c.0)

export const MAP_MIN_H = 160;

/** Step card max height: min(62 % of the screen, screen − band − 160), never below 160. */
export function cardMaxHeight(screenH: number, bandH: number): number {
  return Math.max(MAP_MIN_H, Math.min(screenH * 0.62, screenH - bandH - MAP_MIN_H));
}

/**
 * The map canvas is sized to the window between the band and the card (so labels are clipped
 * to it). Padding inside that window puts the puck horizontally centred and 66 % down it;
 * centred when the window is shorter than 144 px.
 */
export function mapPadding(screenH: number, bandH: number, cardH: number): { top: number; bottom: number } {
  const v = Math.max(0, screenH - bandH - cardH);
  return { top: v >= 144 ? Math.round(0.32 * v) : 0, bottom: 0 };
}

// ------------------------------------------------------------------ heading (AC 14)

/** Slow enough to trust the compass (walking pace). */
export const COMPASS_MAX_SPEED = 2;
/** Fast enough to trust the course over ground. */
export const COURSE_MIN_SPEED = 1;

/**
 * Heading for heading-up: compass when known and moving slowly, else course over ground
 * when speed > 1 m/s, else null (north-up, no cone).
 */
export function mapHeading(compass: number | null | undefined, fix: { heading?: number; speed?: number } | undefined): number | null {
  const speed = fix?.speed ?? 0;
  if (typeof compass === 'number' && Number.isFinite(compass) && speed <= COMPASS_MAX_SPEED) return compass;
  if (typeof fix?.heading === 'number' && Number.isFinite(fix.heading) && speed > COURSE_MIN_SPEED) return fix.heading;
  if (typeof compass === 'number' && Number.isFinite(compass)) return compass;
  return null;
}

/** Follow-mode zoom (AC 18): out on rides so stop dots show, in on walks. */
export function followZoom(group: StepGroup): number {
  return group === 'ride' ? 15 : 17;
}

/** Puck greys after 30 s without a good fix (6c.12). */
export const STALE_PUCK_MS = 30_000;

/** T6: the step is a train-to-train change (walk between two rail legs, or boarding a train straight after one). */
export function isTrainChange(step: Pick<Step, 'kind' | 'legIndex'> | undefined, legs: readonly Pick<Leg, 'mode'>[]): boolean {
  if (!step) return false;
  const rail = (i: number) => legs[i]?.mode === 'mrt' || legs[i]?.mode === 'lrt';
  if (step.kind === 'walk_transfer') return rail(step.legIndex - 1) && rail(step.legIndex + 1);
  if (step.kind === 'board_train') return rail(step.legIndex - 1) || (legs[step.legIndex - 1]?.mode === 'walk' && rail(step.legIndex - 2));
  return false;
}
