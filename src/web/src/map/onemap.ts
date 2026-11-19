/** OneMap raster basemap constants (verified 2026-11-17 against OneMap TileJSON + docs). */
export type OneMapStyle = 'Default' | 'Night' | 'Grey';

export const ONEMAP_TILE_URL = (style: OneMapStyle) => `https://www.onemap.gov.sg/maps/tiles/${style}/{z}/{x}/{y}.png`;
/** From https://www.onemap.gov.sg/maps/json/raster/tilejson/2.2.0/Default.json */
export const ONEMAP_BOUNDS: [number, number, number, number] = [103.502, 1.16, 104.11475, 1.56073];
export const ONEMAP_MINZOOM = 11;
export const ONEMAP_MAXZOOM = 19;
export const SG_CENTER: [number, number] = [103.8198, 1.3521];

/** The official OneMap logo (checked live: 200 image/png). The linked credit lives on About (L2). */
export const ONEMAP_LOGO_URL = 'https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png';
/** C1-A credit text (English in both languages: it is the legal line). */
export const ONEMAP_CREDIT_LINES = ['OneMap © contributors', 'Singapore Land Authority'] as const;

/**
 * 1.1 C1-A (STYLE-GUIDE 6g.1): the compact, always-visible OneMap credit on every map card. OneMap's terms
 * require the logo and the attribution and forbid obscuring the copyright notice, so it is never collapsed.
 * Plain text, no links (a tiny link is an accidental tap while panning); not focusable; outside the
 * aria-hidden map node, read once as "OneMap © contributors, Singapore Land Authority".
 */
export function createOneMapCredit(doc: Document = document): HTMLParagraphElement {
  const p = doc.createElement('p');
  p.className = 'credit';
  p.lang = 'en';
  p.setAttribute('data-testid', 'map-credit');
  const img = doc.createElement('img');
  img.src = ONEMAP_LOGO_URL;
  img.alt = '';
  img.width = 20;
  img.height = 20;
  const txt = doc.createElement('span');
  const l1 = doc.createElement('span');
  l1.textContent = ONEMAP_CREDIT_LINES[0];
  const sep = doc.createElement('span');
  sep.className = 'sr';
  sep.textContent = ', ';
  const l2 = doc.createElement('span');
  l2.textContent = ONEMAP_CREDIT_LINES[1];
  txt.append(l1, sep, l2);
  p.append(img, txt);
  return p;
}

export const styleForTheme = (dark: boolean): OneMapStyle => (dark ? 'Night' : 'Default');

/** Slippy-map tile index for a coordinate (used to pre-cache corridor tiles for offline trips). */
export function tileXY(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x, y };
}

/** Tile URLs covering a polyline (plus a 1-tile margin) at the given zooms. */
export function corridorTiles(points: { lat: number; lng: number }[], zooms: number[], style: OneMapStyle, max = 600): string[] {
  const out = new Set<string>();
  for (const z of zooms) {
    for (const p of points) {
      const { x, y } = tileXY(p.lat, p.lng, z);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          out.add(ONEMAP_TILE_URL(style).replace('{z}', String(z)).replace('{x}', String(x + dx)).replace('{y}', String(y + dy)));
          if (out.size >= max) return [...out];
        }
    }
  }
  return [...out];
}
