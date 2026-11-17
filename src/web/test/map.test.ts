import { describe, expect, it } from 'vitest';
import { boundsOf, followCamera, followReducer } from '../src/map/follow';
import { corridorTiles, tileXY, ONEMAP_ATTRIBUTION } from '../src/map/onemap';

describe('follow-me', () => {
  it('pauses on any user gesture; resumes only on recentre or step change', () => {
    let m = followReducer('follow', { type: 'user_gesture' });
    expect(m).toBe('free');
    // nothing time-based exists: only these events change the mode
    expect(followReducer(m, { type: 'user_gesture' })).toBe('free');
    expect(followReducer(m, { type: 'recentre' })).toBe('follow');
    expect(followReducer(m, { type: 'step_changed' })).toBe('follow');
    m = followReducer('follow', { type: 'overview' });
    expect(m).toBe('free');
  });

  it('camera is heading-up with modest pitch', () => {
    expect(followCamera({ lat: 1.3, lng: 103.8 }, -90)).toMatchObject({ center: [103.8, 1.3], bearing: 270, pitch: 30 });
    expect(followCamera({ lat: 1.3, lng: 103.8 }, null).bearing).toBe(0);
  });

  it('bounds', () => {
    expect(boundsOf([{ lat: 1.3, lng: 103.9 }, { lat: 1.4, lng: 103.8 }])).toEqual([[103.8, 1.3], [103.9, 1.4]]);
    expect(boundsOf([])).toBeNull();
  });
});

describe('onemap', () => {
  it('tile maths and corridor tiles', () => {
    const { x, y } = tileXY(1.3521, 103.8198, 11);
    expect(x).toBe(1614);
    expect(y).toBe(1016);
    const urls = corridorTiles([{ lat: 1.3521, lng: 103.8198 }], [15], 'Default');
    expect(urls).toHaveLength(9);
    expect(urls[0]).toMatch(/^https:\/\/www\.onemap\.gov\.sg\/maps\/tiles\/Default\/15\/\d+\/\d+\.png$/);
  });
  it('attribution carries logo, OneMap and SLA', () => {
    expect(ONEMAP_ATTRIBUTION).toContain('om_logo.png');
    expect(ONEMAP_ATTRIBUTION).toContain('Singapore Land Authority');
  });
});
