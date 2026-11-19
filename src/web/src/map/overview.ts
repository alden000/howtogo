/**
 * Route-overview camera (pure, hotfix 1.0.1). The H4 / Bigger map card must show the WHOLE itinerary on load:
 * the bounds of every leg's geometry plus origin and destination, kept clear of the card's overlays
 * (OneMap attribution bottom-left, the 56 px locate button bottom-right) by per-side padding.
 *
 * Zoom here is MapLibre zoom (512 px world tiles). OneMap serves 256 px raster tiles, so map zoom Z draws
 * OneMap tiles of level round(Z + 1): OneMap's minzoom 11 is reached already at map zoom 9.5. 1.0.0 set the
 * map's minZoom to 11, a whole level too deep, so a long N-S trip (Seletar -> Novena, ~10 km) could not be
 * fitted in a ~290 px card: fitBounds clamped at zoom 11, centred mid-route, and the line ran off both ends.
 */
import type { LatLng } from '@howtogo/shared';
import { boundsOf } from './follow';
import { ONEMAP_MINZOOM } from './onemap';

/** Lowest map zoom that still draws OneMap tiles (raster sources round the tile zoom: round(9.5 + 1) = 11). */
export const MAP_MIN_ZOOM = ONEMAP_MINZOOM - 1.5;
/** A short walk is shown at street level, never zoomed in absurdly. */
export const OVERVIEW_MAX_ZOOM = 16.5;
/** Clear space around the route: half the cased line plus the 13 px destination dot, with air. */
export const OVERVIEW_MARGIN = 20;
/** Overlays never take more than this share of a dimension; the route keeps the rest. */
const MAX_PAD_SHARE = 0.6;
const TILE = 512;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OverviewInput {
  points: LatLng[];
  width: number;
  height: number;
  /** Space taken by overlays on each side (see overlayInsets). */
  overlays?: Partial<Insets>;
  margin?: number;
  minZoom?: number;
  maxZoom?: number;
}

export interface OverviewFit {
  /** [[west, south], [east, north]] for map.fitBounds. */
  bounds: [[number, number], [number, number]];
  padding: Insets;
  /** The zoom fitBounds lands on (clamped to [minZoom, maxZoom]). */
  zoom: number;
  /** The map centre that puts the bounds in the middle of the padded box. */
  center: [number, number];
  /** False when even minZoom cannot hold the whole route (it then overflows evenly). */
  fits: boolean;
}

const mx = (lng: number) => (lng + 180) / 360;
const my = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const lngOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/** Screen position of `p` for a north-up camera (`center`, `zoom`) in a `width` x `height` box. */
export function projectPoint(p: LatLng, center: [number, number], zoom: number, width: number, height: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  return { x: width / 2 + (mx(p.lng) - mx(center[0])) * scale, y: height / 2 + (my(p.lat) - my(center[1])) * scale };
}

/**
 * Per-side space taken by overlays inside the container. Overlays sit in the card's corners, so each one
 * claims the top or bottom band it lives in (a wide card spends height more cheaply than width is gained).
 */
export function overlayInsets(container: Rect, overlays: Rect[], gap = 8): Insets {
  const out: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const midY = (container.top + container.bottom) / 2;
  for (const r of overlays) {
    if (r.right <= r.left || r.bottom <= r.top) continue; // hidden
    if (r.right <= container.left || r.left >= container.right || r.bottom <= container.top || r.top >= container.bottom) continue;
    if ((r.top + r.bottom) / 2 >= midY) out.bottom = Math.max(out.bottom, container.bottom - r.top + gap);
    else out.top = Math.max(out.top, r.bottom - container.top + gap);
  }
  return out;
}

/** Shrink a pair of paddings so together they leave the route at least (1 - share) of `size`. */
function squeeze(a: number, b: number, size: number): [number, number] {
  const max = size * MAX_PAD_SHARE;
  if (a + b <= max || a + b === 0) return [a, b];
  const k = max / (a + b);
  return [a * k, b * k];
}

/** Bounds, padding and resulting camera that show every point clear of the overlays. Null without points or size. */
export function overviewFit(input: OverviewInput): OverviewFit | null {
  const { points, width, height } = input;
  const b = boundsOf(points);
  if (!b || !(width > 0) || !(height > 0)) return null;
  const m = input.margin ?? OVERVIEW_MARGIN;
  const o = input.overlays ?? {};
  const minZoom = input.minZoom ?? MAP_MIN_ZOOM;
  const maxZoom = input.maxZoom ?? OVERVIEW_MAX_ZOOM;
  const [top, bottom] = squeeze(m + (o.top ?? 0), m + (o.bottom ?? 0), height);
  const [left, right] = squeeze(m + (o.left ?? 0), m + (o.right ?? 0), width);
  const padding = { top, right, bottom, left };
  const [[w, s], [e, n]] = b;
  const dx = mx(e) - mx(w);
  const dy = my(s) - my(n);
  const zx = dx > 0 ? Math.log2((width - left - right) / (dx * TILE)) : Infinity;
  const zy = dy > 0 ? Math.log2((height - top - bottom) / (dy * TILE)) : Infinity;
  const ideal = Math.min(zx, zy);
  const zoom = Math.max(minZoom, Math.min(maxZoom, ideal));
  const scale = TILE * 2 ** zoom;
  // The bounds' centre sits in the middle of the padded box, not of the card.
  const cx = (mx(w) + mx(e)) / 2 + (width / 2 - (left + (width - left - right) / 2)) / scale;
  const cy = (my(n) + my(s)) / 2 + (height / 2 - (top + (height - top - bottom) / 2)) / scale;
  return { bounds: b, padding, zoom, center: [lngOf(cx), latOf(cy)], fits: ideal >= minZoom };
}

/** Every point an overview has to show: each step's geometry plus its start and end (origin, stops, destination). */
export function overviewPoints(steps: { start: LatLng; end: LatLng; geometry: LatLng[] }[]): LatLng[] {
  return steps.flatMap((s) => [s.start, ...s.geometry, s.end]);
}
