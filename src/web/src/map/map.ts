/**
 * MapLibre map with OneMap raster tiles. Lazy-loaded (dynamic import) so first
 * paint never waits for MapLibre. All colours come from CSS custom properties
 * defined by Creative (TODO-creative); the fallbacks below are neutral greys.
 */
import { signal } from '@preact/signals';
import { destination, type LatLng, type Step } from '@howtogo/shared';
import type { Map as MlMap, GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import { log } from '../log';
import { boundsOf, followCamera, followReducer, type FollowEvent, type FollowMode } from './follow';
import { ONEMAP_ATTRIBUTION, ONEMAP_BOUNDS, ONEMAP_MAXZOOM, ONEMAP_MINZOOM, ONEMAP_TILE_URL, SG_CENTER, styleForTheme } from './onemap';

type MapLibre = typeof import('maplibre-gl');
let loading: Promise<MapLibre> | null = null;

export function loadMapLibre(): Promise<MapLibre> {
  loading ??= Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]).then(([m]) => (m.default ?? m) as MapLibre);
  return loading;
}

/** TODO-creative: every token below must be defined in the style guide's CSS. */
const FALLBACK = '#888888';
export function cssColor(el: Element, token: string): string {
  const v = getComputedStyle(el).getPropertyValue(`--${token}`).trim();
  return v || FALLBACK;
}

export interface MapOptions {
  dark: boolean;
  reducedMotion: boolean;
  /** Interactive gestures (false for small previews). */
  interactive?: boolean;
}

export interface PuckInput {
  pos: LatLng;
  acc?: number;
  heading?: number | null;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function circle(c: LatLng, r: number, n = 32): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const p = destination(c, (i * 360) / n, r);
    ring.push([p.lng, p.lat]);
  }
  return ring;
}

function cone(c: LatLng, heading: number, len = 40, spread = 30): [number, number][] {
  const ring: [number, number][] = [[c.lng, c.lat]];
  for (let a = -spread; a <= spread; a += 10) {
    const p = destination(c, heading + a, len);
    ring.push([p.lng, p.lat]);
  }
  ring.push([c.lng, c.lat]);
  return ring;
}

export function stepsToFeatures(steps: Step[], el: Element): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: steps
      .filter((s) => !s.kind.startsWith('board') && s.geometry.length >= 2)
      .map((s) => {
        const token = s.mode === 'walk' ? 'route-walk' : s.mode === 'bus' ? 'route-bus' : (s.line?.colorToken ?? 'route-train');
        return {
          type: 'Feature',
          properties: { mode: s.mode, stepId: s.id, color: cssColor(el, token) },
          geometry: { type: 'LineString', coordinates: s.geometry.map((p) => [p.lng, p.lat]) },
        };
      }),
  };
}

function baseStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {
      onemap: {
        type: 'raster',
        tiles: [ONEMAP_TILE_URL(styleForTheme(dark))],
        tileSize: 256,
        minzoom: ONEMAP_MINZOOM,
        maxzoom: ONEMAP_MAXZOOM,
        bounds: ONEMAP_BOUNDS,
      },
    },
    layers: [{ id: 'onemap', type: 'raster', source: 'onemap' }],
  };
}

export async function createMapController(container: HTMLElement, opts: MapOptions) {
  const ml = await loadMapLibre();
  const map: MlMap = new ml.Map({
    container,
    style: baseStyle(opts.dark),
    center: SG_CENTER,
    zoom: 12,
    minZoom: ONEMAP_MINZOOM,
    maxZoom: ONEMAP_MAXZOOM,
    maxBounds: [
      [ONEMAP_BOUNDS[0], ONEMAP_BOUNDS[1]],
      [ONEMAP_BOUNDS[2], ONEMAP_BOUNDS[3]],
    ],
    attributionControl: false,
    interactive: opts.interactive ?? true,
    pitchWithRotate: false,
  });
  map.addControl(new ml.AttributionControl({ compact: false, customAttribution: ONEMAP_ATTRIBUTION }), 'bottom-left');
  container.setAttribute('aria-hidden', 'true'); // the step list is the accessible source of truth (M1 AC 40)

  const follow = signal<FollowMode>('follow');
  let lastPuck: PuckInput | null = null;
  let routeSteps: Step[] = [];
  let dark = opts.dark;
  const duration = opts.reducedMotion ? 0 : 600;

  const ready = new Promise<void>((r) => (map.loaded() ? r() : map.once('load', () => r())));

  function addOverlays() {
    if (map.getSource('route')) return;
    map.addSource('route', { type: 'geojson', data: EMPTY });
    map.addSource('puck', { type: 'geojson', data: EMPTY });
    const w = Number(getComputedStyle(container).getPropertyValue('--route-line-width')) || 6; // TODO-creative
    map.addLayer({ id: 'route-walk', type: 'line', source: 'route', filter: ['==', ['get', 'mode'], 'walk'], layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': w, 'line-dasharray': [1, 1.5] } });
    map.addLayer({ id: 'route-transit', type: 'line', source: 'route', filter: ['!=', ['get', 'mode'], 'walk'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': w } });
    map.addLayer({ id: 'puck-acc', type: 'fill', source: 'puck', filter: ['==', ['get', 'kind'], 'acc'], paint: { 'fill-color': cssColor(container, 'puck-accuracy'), 'fill-opacity': 0.2 } });
    map.addLayer({ id: 'puck-cone', type: 'fill', source: 'puck', filter: ['==', ['get', 'kind'], 'cone'], paint: { 'fill-color': cssColor(container, 'puck'), 'fill-opacity': 0.35 } });
    map.addLayer({ id: 'puck-dot', type: 'circle', source: 'puck', filter: ['==', ['get', 'kind'], 'dot'], paint: { 'circle-radius': 9, 'circle-color': cssColor(container, 'puck'), 'circle-stroke-width': 3, 'circle-stroke-color': cssColor(container, 'puck-ring') } });
  }

  const dispatchFollow = (ev: FollowEvent) => {
    const next = followReducer(follow.value, ev);
    if (next !== follow.value) {
      follow.value = next;
      log(`follow:${next}`);
    }
  };

  // Any user gesture pauses follow-me (events from code carry no originalEvent).
  for (const ev of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) {
    map.on(ev, (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) dispatchFollow({ type: 'user_gesture' });
    });
  }

  await ready;
  addOverlays();

  function renderPuck() {
    const src = map.getSource('puck') as GeoJSONSource | undefined;
    if (!src || !lastPuck) return;
    const { pos, acc, heading } = lastPuck;
    const feats: GeoJSON.Feature[] = [];
    if (acc && acc > 5) feats.push({ type: 'Feature', properties: { kind: 'acc' }, geometry: { type: 'Polygon', coordinates: [circle(pos, acc)] } });
    if (typeof heading === 'number') feats.push({ type: 'Feature', properties: { kind: 'cone' }, geometry: { type: 'Polygon', coordinates: [cone(pos, heading)] } });
    feats.push({ type: 'Feature', properties: { kind: 'dot' }, geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] } });
    src.setData({ type: 'FeatureCollection', features: feats });
  }

  function applyFollow() {
    if (follow.value !== 'follow' || !lastPuck) return;
    const cam = followCamera(lastPuck.pos, lastPuck.heading);
    map.easeTo({ ...cam, duration });
  }

  const ctl = {
    map,
    follow,
    setRoute(steps: Step[]) {
      routeSteps = steps;
      (map.getSource('route') as GeoJSONSource | undefined)?.setData(stepsToFeatures(steps, container));
    },
    /** Snapped position + heading. Moves the camera only while following. */
    setPuck(p: PuckInput) {
      lastPuck = p;
      renderPuck();
      applyFollow();
    },
    recentre() {
      dispatchFollow({ type: 'recentre' });
      applyFollow();
    },
    stepChanged() {
      dispatchFollow({ type: 'step_changed' });
      applyFollow();
    },
    fitRoute(padding = 48) {
      const b = boundsOf(routeSteps.flatMap((s) => s.geometry));
      if (!b) return;
      dispatchFollow({ type: 'overview' });
      map.fitBounds(b, { padding, duration, bearing: 0, pitch: 0 });
    },
    setTheme(isDark: boolean) {
      if (isDark === dark) return;
      dark = isDark;
      const src = map.getSource('onemap') as unknown as { setTiles?: (t: string[]) => void } | undefined;
      src?.setTiles?.([ONEMAP_TILE_URL(styleForTheme(isDark))]);
      ctl.setRoute(routeSteps); // re-read colour tokens for the theme
    },
    destroy() {
      map.remove();
    },
  };
  return ctl;
}

export type MapController = Awaited<ReturnType<typeof createMapController>>;
