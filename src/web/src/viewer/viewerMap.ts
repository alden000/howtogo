/**
 * Viewer map (§6e.2 item 2, M4 AC 19): OneMap raster tiles in MapLibre, loaded lazily after the text
 * card. Draws only the sharer's puck (+ accuracy circle when acc > 30 m, heading cone when known).
 * No destination marker: the share contract carries the destination NAME only (M4 OQ4).
 * North-up; follows the puck until the viewer pans, then a locate button brings it back.
 */
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { createOneMapCredit, ONEMAP_BOUNDS, ONEMAP_MAXZOOM, ONEMAP_MINZOOM, ONEMAP_TILE_URL, styleForTheme } from '../map/onemap';

export interface Puck {
  lat: number;
  lng: number;
  acc: number | null;
  heading: number | null;
  grey: boolean;
}

const R = 6_371_000;
function offset(lat: number, lng: number, bearingDeg: number, m: number): [number, number] {
  const b = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lng * Math.PI) / 180;
  const d = m / R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [(l2 * 180) / Math.PI, (p2 * 180) / Math.PI];
}

/** GeoJSON for the puck. Exported for tests. */
export function puckFeatures(p: Puck): GeoJSON.FeatureCollection {
  const f: GeoJSON.Feature[] = [];
  if (p.acc !== null && p.acc > 30) {
    const ring = Array.from({ length: 33 }, (_, i) => offset(p.lat, p.lng, (i * 360) / 32, p.acc!));
    f.push({ type: 'Feature', properties: { kind: 'acc' }, geometry: { type: 'Polygon', coordinates: [ring] } });
  }
  if (typeof p.heading === 'number' && !p.grey) {
    const ring: [number, number][] = [[p.lng, p.lat]];
    for (let a = -30; a <= 30; a += 10) ring.push(offset(p.lat, p.lng, p.heading + a, 40));
    ring.push([p.lng, p.lat]);
    f.push({ type: 'Feature', properties: { kind: 'cone' }, geometry: { type: 'Polygon', coordinates: [ring] } });
  }
  f.push({ type: 'Feature', properties: { kind: 'dot' }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } });
  return { type: 'FeatureCollection', features: f };
}

const tok = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(`--${name}`).trim() || '#888888';

export interface ViewerMap {
  setPuck(p: Puck): void;
  /** Viewer panned away → show the locate button. */
  onFollowChange(cb: (following: boolean) => void): void;
  recentre(): void;
  resize(): void;
}

export async function createViewerMap(container: HTMLElement, attributionHost: HTMLElement, opts: { dark: boolean; reducedMotion: boolean }): Promise<ViewerMap> {
  const [mod] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
  const ml = ((mod as { default?: unknown }).default ?? mod) as typeof import('maplibre-gl');
  const map: MlMap = new ml.Map({
    container,
    style: {
      version: 8,
      sources: {
        onemap: { type: 'raster', tiles: [ONEMAP_TILE_URL(styleForTheme(opts.dark))], tileSize: 256, minzoom: ONEMAP_MINZOOM, maxzoom: ONEMAP_MAXZOOM, bounds: ONEMAP_BOUNDS },
      },
      layers: [
        { id: 'land', type: 'background', paint: { 'background-color': tok(container, 'm-land') } },
        { id: 'onemap', type: 'raster', source: 'onemap' },
      ],
    },
    center: [103.8198, 1.3521],
    zoom: 15,
    minZoom: ONEMAP_MINZOOM,
    maxZoom: ONEMAP_MAXZOOM,
    maxBounds: [[ONEMAP_BOUNDS[0], ONEMAP_BOUNDS[1]], [ONEMAP_BOUNDS[2], ONEMAP_BOUNDS[3]]],
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  attributionHost.replaceChildren(createOneMapCredit(container.ownerDocument)); // 1.1 C1-A
  map.getCanvas().setAttribute('tabindex', '-1');

  await new Promise<void>((r) => (map.loaded() ? r() : map.once('load', () => r())));
  map.addSource('puck', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const puckColor = tok(container, 'puck');
  const greyColor = tok(container, 'c-ink-2');
  map.addLayer({ id: 'acc', type: 'fill', source: 'puck', filter: ['==', ['get', 'kind'], 'acc'], paint: { 'fill-color': tok(container, 'puck-accuracy'), 'fill-opacity': 0.14 } });
  map.addLayer({ id: 'cone', type: 'fill', source: 'puck', filter: ['==', ['get', 'kind'], 'cone'], paint: { 'fill-color': puckColor, 'fill-opacity': 0.35 } });
  map.addLayer({ id: 'dot', type: 'circle', source: 'puck', filter: ['==', ['get', 'kind'], 'dot'], paint: { 'circle-radius': 10, 'circle-color': puckColor, 'circle-stroke-width': 4, 'circle-stroke-color': tok(container, 'puck-ring') } });

  let following = true;
  let last: Puck | null = null;
  let followCb: (f: boolean) => void = () => {};
  const setFollowing = (f: boolean) => {
    if (f === following) return;
    following = f;
    followCb(f);
  };
  for (const ev of ['dragstart', 'zoomstart'] as const) {
    map.on(ev, (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) setFollowing(false); // never auto-zoom out of the viewer's own pan (AC 19)
    });
  }
  const camera = () => {
    if (!last) return;
    const c: [number, number] = [last.lng, last.lat];
    if (opts.reducedMotion) map.jumpTo({ center: c });
    else map.easeTo({ center: c, duration: 600 });
  };
  let first = true;

  return {
    setPuck(p) {
      last = p;
      (map.getSource('puck') as GeoJSONSource).setData(puckFeatures(p));
      map.setPaintProperty('dot', 'circle-color', p.grey ? greyColor : puckColor);
      if (first) {
        first = false;
        map.jumpTo({ center: [p.lng, p.lat], zoom: 16 });
      } else if (following) camera();
    },
    onFollowChange(cb) {
      followCb = cb;
    },
    recentre() {
      setFollowing(true);
      camera();
    },
    resize() {
      map.resize();
    },
  };
}
