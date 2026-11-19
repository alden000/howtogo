/**
 * MapLibre map with OneMap raster tiles. Lazy-loaded (dynamic import) so first
 * paint never waits for MapLibre. All colours come from CSS custom properties
 * defined by Creative (TODO-creative); the fallbacks below are neutral greys.
 */
import { signal } from '@preact/signals';
import { destination, type LatLng, type Step } from '@howtogo/shared';
import type { Map as MlMap, GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import { log } from '../log';
import { followCamera, followReducer, type FollowEvent, type FollowMode } from './follow';
import { createOneMapCredit, ONEMAP_BOUNDS, ONEMAP_MAXZOOM, ONEMAP_MINZOOM, ONEMAP_TILE_URL, SG_CENTER, styleForTheme } from './onemap';
import { MAP_MIN_ZOOM, OVERVIEW_MAX_ZOOM, overlayInsets, overviewFit, overviewPoints } from './overview';

type MapLibre = typeof import('maplibre-gl');
let loading: Promise<MapLibre> | null = null;

export function loadMapLibre(): Promise<MapLibre> {
  loading ??= Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]).then(([m]) => (m.default ?? m) as MapLibre);
  return loading;
}

/** Every token read here is defined in styles/tokens.css. */
const FALLBACK = '#888888';
export function cssColor(el: Element, token: string): string {
  const v = getComputedStyle(el).getPropertyValue(`--${token}`).trim();
  return v || FALLBACK;
}

export interface MapOptions {
  dark: boolean;
  reducedMotion: boolean;
  /** M5 AC 8: camera easing allowed now (battery saver turns it off; read on every camera move). */
  animations?: () => boolean;
  /** Interactive gestures (false for small previews). */
  interactive?: boolean;
  /**
   * Where the OneMap attribution goes. It is kept outside the aria-hidden map node (QA-7: no focusable
   * content inside aria-hidden) and 1.1 C1-A: map cards bottom-left, H5 top-left (QA-12).
   */
  attributionHost?: HTMLElement;
  /** H5: a user drag/pinch/rotate (the runtime owns the follow mode, AC 15). */
  onGesture?: () => void;
  /** Hotfix 1.0.1: elements drawn over the map (attribution, buttons) that the route overview keeps clear of. */
  overlays?: () => (Element | null | undefined)[];
}

export interface PuckInput {
  pos: LatLng;
  acc?: number;
  heading?: number | null;
  /** 6c.12: no good fix for 30 s → grey puck, no cone. */
  stale?: boolean;
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

/** Stops where the user boards or gets off, plus the destination. Colours from map tokens (tokens.css). */
export function stepsToMarks(steps: Step[], el: Element): GeoJSON.FeatureCollection {
  const pt = (p: LatLng, kind: 'stop' | 'dest') => ({
    type: 'Feature' as const,
    properties: { kind, fill: cssColor(el, kind === 'dest' ? 'dest-fill' : 'stop-fill'), ring: cssColor(el, kind === 'dest' ? 'dest-ring' : 'stop-ring') },
    geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
  });
  const rides = steps.filter((s) => s.kind.startsWith('ride') && s.geometry.length >= 1);
  const features = rides.flatMap((s) => [pt(s.start, 'stop'), pt(s.end, 'stop')]);
  const last = steps[steps.length - 1];
  if (last) features.push(pt(last.end, 'dest'));
  return { type: 'FeatureCollection', features };
}

/** "walk=2 transit=1 stops=2 dest=1": the counts of drawn lines and markers (AC 38 log hook). */
export function routeSummary(lines: GeoJSON.FeatureCollection, marks: GeoJSON.FeatureCollection): string {
  const n = (fc: GeoJSON.FeatureCollection, k: string, v: (p: Record<string, unknown>) => boolean) => `${k}=${fc.features.filter((f) => v(f.properties ?? {})).length}`;
  return [
    n(lines, 'walk', (p) => p.mode === 'walk'),
    n(lines, 'transit', (p) => p.mode !== 'walk'),
    n(marks, 'stops', (p) => p.kind === 'stop'),
    n(marks, 'dest', (p) => p.kind === 'dest'),
  ].join(' ');
}

/** Line widths in CSS px (map-only; the prototype's SVG map draws bus/MRT 16 and casing 26 at its own scale). */
const ROUTE_W = 6;
const CASE_EXTRA = 4;

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
    minZoom: MAP_MIN_ZOOM, // hotfix 1.0.1: OneMap z11 tiles already show at map zoom 9.5 (overview.ts)
    maxZoom: ONEMAP_MAXZOOM,
    maxBounds: [
      [ONEMAP_BOUNDS[0], ONEMAP_BOUNDS[1]],
      [ONEMAP_BOUNDS[2], ONEMAP_BOUNDS[3]],
    ],
    attributionControl: false,
    interactive: opts.interactive ?? true,
    pitchWithRotate: false,
  });
  // 1.1 C1-A: plain-text compact credit (logo + two lines, no links), outside the aria-hidden map node.
  opts.attributionHost?.replaceChildren(createOneMapCredit(container.ownerDocument));
  // e2e hook (hotfix 1.0.1): the overview test projects every route point with the live map. No coordinates are logged.
  (container as unknown as { __howtogoMap?: unknown }).__howtogoMap = { map, points: () => overviewPoints(routeSteps).map((p) => [p.lng, p.lat]) };
  container.setAttribute('aria-hidden', 'true'); // the step list is the accessible source of truth (M1 AC 40)
  map.getCanvas().setAttribute('tabindex', '-1'); // QA-7: nothing focusable inside the aria-hidden map

  const follow = signal<FollowMode>('follow');
  let lastPuck: PuckInput | null = null;
  let routeSteps: Step[] = [];
  let dark = opts.dark;
  let followZoom: number | undefined;
  const dur = () => (opts.reducedMotion || opts.animations?.() === false ? 0 : 600);
  /** Overview wanted: refit on every size change until the user moves the map or follow-me takes over. */
  let autoFit = false;

  const ready = new Promise<void>((r) => (map.loaded() ? r() : map.once('load', () => r())));

  function addOverlays() {
    if (map.getSource('route')) return;
    map.addSource('route', { type: 'geojson', data: EMPTY });
    map.addSource('puck', { type: 'geojson', data: EMPTY });
    map.addSource('marks', { type: 'geojson', data: EMPTY });
    const w = ROUTE_W;
    // Casing under transit lines (prototype .m-route-case: surface colour).
    map.addLayer({ id: 'route-case', type: 'line', source: 'route', filter: ['!=', ['get', 'mode'], 'walk'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': cssColor(container, 'route-case'), 'line-width': w + CASE_EXTRA } });
    map.addLayer({ id: 'route-walk', type: 'line', source: 'route', filter: ['==', ['get', 'mode'], 'walk'], layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': w, 'line-dasharray': [1, 1.5] } });
    map.addLayer({ id: 'route-transit', type: 'line', source: 'route', filter: ['!=', ['get', 'mode'], 'walk'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': w } });
    // Boarding/alighting stops (.m-stop) and the saffron destination dot (.m-dest; never a teardrop pin, §1.4).
    map.addLayer({ id: 'mark-stop', type: 'circle', source: 'marks', filter: ['==', ['get', 'kind'], 'stop'], paint: { 'circle-radius': 6, 'circle-color': ['get', 'fill'], 'circle-stroke-width': 3, 'circle-stroke-color': ['get', 'ring'] } });
    map.addLayer({ id: 'mark-dest', type: 'circle', source: 'marks', filter: ['==', ['get', 'kind'], 'dest'], paint: { 'circle-radius': 10, 'circle-color': ['get', 'fill'], 'circle-stroke-width': 3, 'circle-stroke-color': ['get', 'ring'] } });
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
      if (e.originalEvent) {
        autoFit = false;
        dispatchFollow({ type: 'user_gesture' });
        opts.onGesture?.();
      }
    });
  }

  await ready;
  addOverlays();
  log('map:ready');

  function renderPuck() {
    const src = map.getSource('puck') as GeoJSONSource | undefined;
    if (!src || !lastPuck) return;
    const { pos, acc, heading, stale } = lastPuck;
    const feats: GeoJSON.Feature[] = [];
    if (acc && acc > 5) feats.push({ type: 'Feature', properties: { kind: 'acc' }, geometry: { type: 'Polygon', coordinates: [circle(pos, acc)] } });
    if (map.getLayer('puck-dot')) {
      map.setPaintProperty('puck-dot', 'circle-color', cssColor(container, stale ? 'c-ink-2' : 'puck'));
      map.setPaintProperty('puck-dot', 'circle-stroke-color', cssColor(container, stale ? 'c-surface' : 'puck-ring'));
    }
    if (typeof heading === 'number' && !stale) feats.push({ type: 'Feature', properties: { kind: 'cone' }, geometry: { type: 'Polygon', coordinates: [cone(pos, heading)] } });
    feats.push({ type: 'Feature', properties: { kind: 'dot' }, geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] } });
    src.setData({ type: 'FeatureCollection', features: feats });
  }

  /**
   * Hotfix 1.0.1: fit the whole itinerary (every leg + origin + destination) clear of the overlays, using the
   * container's size now. A container without size yet (lazy mount, hidden) is fitted by the ResizeObserver.
   */
  function fitOverview(animate: boolean, margin?: number) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const c = container.getBoundingClientRect();
    const over = overlayInsets(c, (opts.overlays?.() ?? []).filter((e): e is Element => !!e).map((e) => e.getBoundingClientRect()));
    const fit = overviewFit({ points: overviewPoints(routeSteps), width: w, height: h, overlays: over, ...(margin !== undefined ? { margin } : {}) });
    if (!fit) return;
    map.resize();
    map.fitBounds(fit.bounds, { padding: fit.padding, maxZoom: OVERVIEW_MAX_ZOOM, duration: animate ? dur() : 0, bearing: 0, pitch: 0 });
    log(`map:fit ${fit.fits ? 'all' : 'clamped'}`);
  }

  // Refit when the card gets its final size (lazy mount, Bigger map, text size) or an overlay changes size.
  let lastSize = '';
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        const size = `${container.clientWidth}x${container.clientHeight}`;
        if (size !== lastSize) {
          lastSize = size;
          map.resize();
        }
        if (autoFit) fitOverview(false);
      })
    : null;
  ro?.observe(container);
  for (const el of opts.overlays?.() ?? []) if (el) ro?.observe(el);

  function applyFollow() {
    if (follow.value !== 'follow' || !lastPuck) return;
    autoFit = false;
    const cam = followCamera(lastPuck.pos, lastPuck.heading, followZoom);
    map.easeTo({ ...cam, duration: dur() });
  }

  const ctl = {
    map,
    follow,
    setRoute(steps: Step[]) {
      routeSteps = steps;
      const lines = stepsToFeatures(steps, container);
      const marks = stepsToMarks(steps, container);
      (map.getSource('route') as GeoJSONSource | undefined)?.setData(lines);
      (map.getSource('marks') as GeoJSONSource | undefined)?.setData(marks);
      // AC 38 test hook: what was drawn (walk = dashed layer, transit = solid layer over a casing). No coordinates.
      log(`map:route ${routeSummary(lines, marks)}`);
      if (map.getLayer('route-case')) map.setPaintProperty('route-case', 'line-color', cssColor(container, 'route-case'));
    },
    /** Static "you are here" dot + accuracy circle for the route overview (AC 39). Never moves the camera. */
    showMe(p: PuckInput) {
      lastPuck = p;
      renderPuck();
      log(`map:me acc=${p.acc && p.acc > 5 ? 'circle' : 'none'}`);
    },
    /** Overview recentre button: centre on the dot (AC 39). */
    centerOnMe() {
      if (!lastPuck) return;
      autoFit = false;
      map.easeTo({ center: [lastPuck.pos.lng, lastPuck.pos.lat], zoom: Math.max(map.getZoom(), 16), duration: dur() });
      log('map:centre-me');
    },
    resize() {
      map.resize();
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
    /** H5: the runtime's follow mode (follow-me, or free after a gesture / See whole trip). */
    setFollow(mode: FollowMode) {
      if (follow.value === mode) return;
      follow.value = mode;
      applyFollow();
    },
    /** 6c.0: keep the puck and labels inside the window between the top band and the step card. */
    setPadding(p: { top: number; bottom: number }) {
      map.setPadding({ top: p.top, bottom: p.bottom, left: 0, right: 0 });
      applyFollow();
    },
    /** AC 18: zoom out on rides, in on walks. */
    setFollowZoom(z: number) {
      if (followZoom === z) return;
      followZoom = z;
      applyFollow();
    },
    stepChanged() {
      dispatchFollow({ type: 'step_changed' });
      applyFollow();
    },
    /** Show the whole trip (H4 card, Bigger map, H5 See whole trip). `animate: false` on load: no camera move to watch. */
    fitRoute(o: { animate?: boolean; margin?: number } = {}) {
      if (routeSteps.length === 0) return;
      dispatchFollow({ type: 'overview' });
      autoFit = true;
      fitOverview(o.animate ?? true, o.margin);
    },
    /** An overlay appeared or went (e.g. the locate button once a fix arrives): keep the overview clear of it. */
    overlaysChanged() {
      if (autoFit) fitOverview(false);
    },
    setTheme(isDark: boolean) {
      if (isDark === dark) return;
      dark = isDark;
      const src = map.getSource('onemap') as unknown as { setTiles?: (t: string[]) => void } | undefined;
      src?.setTiles?.([ONEMAP_TILE_URL(styleForTheme(isDark))]);
      ctl.setRoute(routeSteps); // re-read colour tokens for the theme
    },
    destroy() {
      ro?.disconnect();
      map.remove();
    },
  };
  return ctl;
}

export type MapController = Awaited<ReturnType<typeof createMapController>>;
