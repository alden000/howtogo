/** Hotfix 1.0.1: the route-overview camera shows the whole itinerary, clear of the card's overlays. */
import { describe, expect, it } from 'vitest';
import { buildSteps, type LatLng } from '@howtogo/shared';
import { MAP_MIN_ZOOM, OVERVIEW_MAX_ZOOM, overlayInsets, overviewFit, overviewPoints, projectPoint, type OverviewFit } from '../src/map/overview';
import { ONEMAP_MINZOOM } from '../src/map/onemap';
import { itinerary } from './helpers';

const P = (lat: number, lng: number): LatLng => ({ lat, lng });
/** Seletar -> Novena (~11 km N-S): walk, bus down to Ang Mo Kio, NS line to Novena, walk to TTSH. */
const SELETAR_NOVENA = [
  P(1.417, 103.865), P(1.416, 103.866), P(1.405, 103.8655), P(1.392, 103.86), P(1.38, 103.852), P(1.3696, 103.8483),
  P(1.36994, 103.84954), P(1.35092, 103.84825), P(1.3404, 103.8468), P(1.33262, 103.84733), P(1.3204, 103.8436), P(1.3208, 103.845), P(1.32135, 103.8465),
];
/** A 60 m walk. */
const SHORT_WALK = [P(1.33465, 103.8491), P(1.3344, 103.8489), P(1.3342, 103.8488)];

/** H4 card at 412 px wide (412 - 2 x 16 margin) and 34vh of an 839 px viewport; attribution + locate button at the bottom. */
const CARD = { width: 380, height: 285 };
const card = { left: 0, top: 0, right: CARD.width, bottom: CARD.height };
const ATTRIB = { left: 12, top: CARD.height - 12 - 32, right: 12 + 280, bottom: CARD.height - 12 };
const LOCATE = { left: CARD.width - 12 - 56, top: CARD.height - 12 - 56, right: CARD.width - 12, bottom: CARD.height - 12 };

function allInside(fit: OverviewFit, pts: LatLng[], w: number, h: number) {
  const { top, right, bottom, left } = fit.padding;
  return pts.every((p) => {
    const { x, y } = projectPoint(p, fit.center, fit.zoom, w, h);
    return x >= left - 0.5 && x <= w - right + 0.5 && y >= top - 0.5 && y <= h - bottom + 0.5;
  });
}

describe('overlayInsets', () => {
  it('bottom corner overlays claim the bottom band (tallest one + gap); hidden or outside ones count for nothing', () => {
    const o = overlayInsets(card, [ATTRIB, LOCATE, { left: 0, top: 0, right: 0, bottom: 0 }, { left: 0, top: 400, right: 50, bottom: 450 }]);
    expect(o).toEqual({ top: 0, right: 0, bottom: 12 + 56 + 8, left: 0 });
    expect(overlayInsets(card, [{ left: 10, top: 10, right: 200, bottom: 40 }]).top).toBe(48);
  });
});

describe('overviewFit', () => {
  const overlays = overlayInsets(card, [ATTRIB, LOCATE]);

  it('long N-S trip (Seletar -> Novena): every point inside the padded box, above the overlays', () => {
    const fit = overviewFit({ points: SELETAR_NOVENA, ...CARD, overlays })!;
    expect(fit.fits).toBe(true);
    expect(fit.padding.bottom).toBeGreaterThanOrEqual(76);
    expect(fit.zoom).toBeLessThan(ONEMAP_MINZOOM); // the 1.0.0 floor (minZoom 11) could never hold this trip
    expect(fit.zoom).toBeGreaterThanOrEqual(MAP_MIN_ZOOM);
    expect(allInside(fit, SELETAR_NOVENA, CARD.width, CARD.height)).toBe(true);
    // ...and nothing is projected under the locate button or the attribution.
    for (const p of SELETAR_NOVENA) {
      const { x, y } = projectPoint(p, fit.center, fit.zoom, CARD.width, CARD.height);
      for (const r of [ATTRIB, LOCATE]) expect(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom).toBe(false);
    }
  });

  it('the same trip at 390 px and 200 % text (taller title, min-height card) still fits', () => {
    const fit = overviewFit({ points: SELETAR_NOVENA, width: 358, height: 220, overlays })!;
    expect(fit.fits).toBe(true);
    expect(allInside(fit, SELETAR_NOVENA, 358, 220)).toBe(true);
  });

  it('short walk: centred, zoom capped at street level', () => {
    const fit = overviewFit({ points: SHORT_WALK, ...CARD, overlays })!;
    expect(fit.zoom).toBe(OVERVIEW_MAX_ZOOM);
    expect(allInside(fit, SHORT_WALK, CARD.width, CARD.height)).toBe(true);
    const mid = projectPoint(P((1.33465 + 1.3342) / 2, (103.8491 + 103.8488) / 2), fit.center, fit.zoom, CARD.width, CARD.height);
    expect(mid.x).toBeCloseTo(fit.padding.left + (CARD.width - fit.padding.left - fit.padding.right) / 2, 0);
    expect(mid.y).toBeCloseTo(fit.padding.top + (CARD.height - fit.padding.top - fit.padding.bottom) / 2, 0);
  });

  it('single point, no size or no points', () => {
    expect(overviewFit({ points: [P(1.3, 103.8)], ...CARD })!.zoom).toBe(OVERVIEW_MAX_ZOOM);
    expect(overviewFit({ points: [], ...CARD })).toBeNull();
    expect(overviewFit({ points: SHORT_WALK, width: 0, height: 0 })).toBeNull();
  });

  it('overlays never take more than 60 % of a side: a tiny card keeps room for the route', () => {
    const fit = overviewFit({ points: SELETAR_NOVENA, width: 300, height: 120, overlays: { bottom: 200 } })!;
    expect(fit.padding.top + fit.padding.bottom).toBeCloseTo(72);
    expect(fit.fits).toBe(false); // reported, not hidden
  });

  it('overviewPoints: every leg geometry plus origin and destination', () => {
    const steps = buildSteps(itinerary('angMoKioToNovena'), 'en');
    const pts = overviewPoints(steps);
    expect(pts[0]).toEqual(steps[0]!.start);
    expect(pts[pts.length - 1]).toEqual(steps[steps.length - 1]!.end);
    expect(pts.length).toBeGreaterThan(steps.flatMap((s) => s.geometry).length);
  });
});
