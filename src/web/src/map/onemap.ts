/** OneMap raster basemap constants (verified 2026-11-17 against OneMap TileJSON + docs). */
export type OneMapStyle = 'Default' | 'Night' | 'Grey';

export const ONEMAP_TILE_URL = (style: OneMapStyle) => `https://www.onemap.gov.sg/maps/tiles/${style}/{z}/{x}/{y}.png`;
/** From https://www.onemap.gov.sg/maps/json/raster/tilejson/2.2.0/Default.json */
export const ONEMAP_BOUNDS: [number, number, number, number] = [103.502, 1.16, 104.11475, 1.56073];
export const ONEMAP_MINZOOM = 11;
export const ONEMAP_MAXZOOM = 19;
export const SG_CENTER: [number, number] = [103.8198, 1.3521];

/**
 * Required attribution (OneMap Terms of Use: "MUST include the OneMap logo and attribution").
 * The logo URL was checked live (200 image/png). The docs page also lists om_logo_256.png.
 */
export const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;" alt=""/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';

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
