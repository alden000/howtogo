import { beforeEach, describe, expect, it } from 'vitest';
import { matchRoute } from '../src/router/routes';
import { createRouter, type Router } from '../src/router/router';
import { logLines, resetLog } from '../src/log';

const popped = () => new Promise<void>((r) => window.addEventListener('popstate', () => setTimeout(r, 0), { once: true }));

describe('matchRoute', () => {
  it('matches every screen', () => {
    expect(matchRoute('/').name).toBe('home');
    expect(matchRoute('/search?field=to').query.get('field')).toBe('to');
    expect(matchRoute('/routes').name).toBe('routes');
    expect(matchRoute('/trip').name).toBe('trip');
    expect(matchRoute('/guide').name).toBe('guide');
    expect(matchRoute('/share/start').name).toBe('share_start');
    expect(matchRoute('/t/aB3dE5fG7hJ9')).toMatchObject({ name: 'viewer', params: { id: 'aB3dE5fG7hJ9' } });
    expect(matchRoute('/help').name).toBe('help');
    expect(matchRoute('/settings').name).toBe('settings');
    expect(matchRoute('/nope').name).toBe('not_found');
  });
});

describe('router history', () => {
  let r: Router;
  beforeEach(() => {
    resetLog();
    r?.dispose();
    history.replaceState(null, '', '/');
  });

  it('pushes one entry per screen and sheet; Back closes the sheet first, then steps back', async () => {
    r = createRouter();
    expect(r.atRoot.value).toBe(true);
    r.navigate('/routes');
    r.navigate('/trip');
    r.openSheet('end-trip');
    expect(r.sheet.value).toBe('end-trip');
    expect(r.depth.value).toBe(3);
    r.back();
    await popped();
    expect(r.sheet.value).toBeNull();
    expect(r.route.value.name).toBe('trip');
    r.back();
    await popped();
    expect(r.route.value.name).toBe('routes');
    r.back();
    await popped();
    expect(r.route.value.name).toBe('home');
    expect(r.atRoot.value).toBe(true);
    expect(logLines()).toEqual(expect.arrayContaining(['screen:/', 'screen:/routes', 'screen:/trip', 'sheet:end-trip']));
  });

  it('navigating with a sheet open consumes the sheet entry', async () => {
    r = createRouter();
    r.navigate('/guide');
    r.openSheet('end-trip');
    r.navigate('/');
    expect(r.depth.value).toBe(2);
    r.back();
    await popped();
    expect(r.route.value.name).toBe('guide');
    expect(r.sheet.value).toBeNull();
  });

  it('seeds Home under a deep link so Back stays in the app', async () => {
    history.replaceState(null, '', '/routes');
    r = createRouter();
    expect(r.route.value.name).toBe('routes');
    expect(r.depth.value).toBe(1);
    r.back();
    await popped();
    expect(r.route.value.name).toBe('home');
  });

  it('D8 guard: Back on H5 opens the End-trip sheet, Back again returns to H5 (reload keeps the guard)', async () => {
    history.replaceState(null, '', '/guide');
    r = createRouter();
    r.setGuard(() => 'sheet');
    expect(r.route.value.name).toBe('guide');
    expect(r.depth.value).toBe(2);
    r.back();
    await popped();
    expect(r.route.value.name).toBe('guide');
    expect(r.sheet.value).toBe('end-trip');
    r.back();
    await popped();
    expect(r.route.value.name).toBe('guide');
    expect(r.sheet.value).toBeNull();
    r.back();
    await popped();
    expect(r.sheet.value).toBe('end-trip');
  });

  it('D8 guard: enterGuide from H4; no trip → Back passes through to H4', async () => {
    r = createRouter();
    r.navigate('/trip');
    r.enterGuide();
    expect(r.route.value.name).toBe('guide');
    r.setGuard(() => 'pass');
    r.back();
    await popped();
    await popped();
    expect(r.route.value.name).toBe('trip');
  });

  it('does not reseed on reload (history.state survives)', () => {
    r = createRouter();
    r.navigate('/routes');
    r.dispose();
    r = createRouter();
    expect(r.depth.value).toBe(1);
    expect(r.route.value.name).toBe('routes');
  });

  it('the public viewer is standalone (no seeded Home)', () => {
    history.replaceState(null, '', '/t/abcdef123456');
    r = createRouter();
    expect(r.depth.value).toBe(0);
  });

  it('replaceSheet swaps the sheet in place (explainer → denied help); one Back closes it', async () => {
    r = createRouter();
    r.navigate('/routes');
    r.openSheet('loc-explain');
    r.replaceSheet('loc-denied');
    expect(r.sheet.value).toBe('loc-denied');
    expect(r.depth.value).toBe(2);
    r.back();
    await popped();
    expect(r.sheet.value).toBeNull();
    expect(r.route.value.name).toBe('routes');
  });

  it('first run is a root (no Home seeded); reset() lands on Home as the new root', async () => {
    history.replaceState(null, '', '/welcome?p=1');
    r = createRouter();
    expect(r.depth.value).toBe(0);
    r.navigate('/welcome?p=2');
    r.navigate('/welcome?p=3');
    r.reset('/');
    await popped();
    expect(r.route.value.name).toBe('home');
    expect(r.depth.value).toBe(0);
    expect(matchRoute('/about').name).toBe('about');
  });
});
