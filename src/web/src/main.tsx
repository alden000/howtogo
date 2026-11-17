/**
 * Bootstrap. Modes:
 *  - normal: web platform + HTTP API at VITE_API_BASE ("" = same origin);
 *  - `?mock=1` (or VITE_API_MOCK=1): mock API on the shared fixtures, real device location;
 *  - `?demo=1`: mock API + demo platform — location is a simulated GPS stream
 *    (`simulateFixes`) along the chosen itinerary; `&demoMs=<n>` sets ms per fix.
 * The mode sticks for the tab (sessionStorage) so in-app navigation and reloads keep it.
 */
import './styles/tokens.css';
import './styles/app.css';
import './styles/guide.css';
import { render } from 'preact';
import { effect } from '@preact/signals';
import { simulateFixes } from '@howtogo/shared';
import { App } from './app';
import { createHttpApi } from './api/client';
import { offlineAware, watchOnline } from './api/offline';
import type { Api } from './api/types';
import { ServicesContext, type Services } from './context';
import { log } from './log';
import { createDemoPlatform, createFakePlatform, createWebPlatform, type FakePlatform, type Platform } from './platform';
import { captureInstallPrompt } from './pwa/install';
import { cacheTripTiles, clearTripTiles, registerServiceWorker } from './pwa/register';
import { corridorTiles, styleForTheme } from './map/onemap';
import { isDark } from './map/MapPanel';
import { createRouter } from './router/router';
import { parseRouteLink } from './router/deeplink';
import { checkSampleMode, sampleMode } from './state/sample';
import { session } from './state/storage';
import { createStore } from './state/store';
import { createTripRuntime } from './trip/runtime';

const DEMO_DEFAULT_MS = 400;
const DEFAULT_FLAGS = ['guide', 'help'];

async function boot() {
  const q = new URLSearchParams(location.search);
  if (q.get('demo') === '1') session.set('mode.demo', '1');
  if (q.get('demo') === '0') session.remove('mode.demo');
  if (q.get('mock') === '1') session.set('mode.mock', '1');
  if (q.get('demoMs')) session.set('mode.demoMs', q.get('demoMs')!);
  // Feature flags per tab: `?ff=live` adds, `?ff=-guide` removes (comma-separated; `?ff=` clears the tab's list).
  // M2 release (AC 1): `guide` and `help` are on by default.
  if (q.has('ff')) session.set('mode.ff', q.get('ff')!);
  const flags = new Set(DEFAULT_FLAGS);
  for (const f of [...String(import.meta.env.VITE_FLAGS ?? '').split(','), ...(session.get('mode.ff') ?? '').split(',')].map((x) => x.trim()).filter(Boolean)) {
    if (f.startsWith('-')) flags.delete(f.slice(1));
    else flags.add(f);
  }
  const demo = session.get('mode.demo') === '1';
  const mock = demo || session.get('mode.mock') === '1' || import.meta.env.VITE_API_MOCK === '1';
  log(`mode:${demo ? 'demo' : mock ? 'mock' : 'live'}`);

  let api: Api;
  let start = undefined as undefined | { lat: number; lng: number };
  if (mock) {
    const m = await import('./api/mock');
    api = m.createMockApi();
    start = m.DEMO_START;
  } else {
    api = createHttpApi({ base: import.meta.env.VITE_API_BASE ?? '' });
    // D-10: the preview Worker answers from fixtures → show the sample-routes banner.
    void checkSampleMode(import.meta.env.VITE_API_BASE ?? '');
  }
  if (q.get('sample') === '1') session.set('mode.sample', '1');
  if (q.get('sample') === '0') session.remove('mode.sample');
  if (session.get('mode.sample') === '1') sampleMode.value = true;
  api = offlineAware(api);
  watchOnline();

  const web = createWebPlatform();
  let platform: Platform = web;
  let fake: FakePlatform | null = null;
  if (demo) {
    fake = createFakePlatform({ start: { ...start!, acc: 8, t: Date.now() } });
    platform = createDemoPlatform(web, fake);
  }

  const store = createStore();
  // AC 6: the shared deep link `/#/route?from=lat,lng&to=lat,lng` restores Route options (from is optional = my location).
  const deep = await parseRouteLink(location.hash, api);
  if (deep) {
    store.setPlan({ from: deep.from, to: deep.to, options: [], selected: 0, fetchedAt: 0 });
    history.replaceState(null, '', '/routes');
  }
  // F1: first launch opens the first run (root of the stack) instead of Home; never again after Skip or Done.
  if (!store.settings.peek().onboarded && location.pathname === '/' && !(history.state as { howtogo?: number } | null)?.howtogo) {
    history.replaceState(null, '', '/welcome?p=1');
  }
  const router = createRouter();
  const demoMs = Number(session.get('mode.demoMs')) || DEMO_DEFAULT_MS;
  const runtime = createTripRuntime({
    store,
    platform,
    api,
    onAttach: fake
      ? (trip, resumed) => {
          const fixes = simulateFixes(trip.itinerary, { speedWalk: 3, intervalS: 2, jitterM: 2, waitCapS: 20, seed: 7 });
          const saved = session.get('demo.idx')?.split(':');
          const idx = resumed && saved?.[0] === trip.id ? Number(saved[1]) || 0 : 0;
          fake!.fake.load(fixes, idx);
          fake!.fake.onProgress = (i) => session.set('demo.idx', `${trip.id}:${i}`);
          fake!.fake.play(demoMs);
        }
      : undefined,
  });

  // Reflect settings on <html> (Creative's CSS keys off these attributes).
  effect(() => {
    const s = store.settings.value;
    const root = document.documentElement;
    root.lang = s.lang === 'en' ? 'en-SG' : 'zh-CN';
    root.dataset.textSize = s.textSize;
    root.dataset.theme = s.theme;
  });
  // Reduce motion (§2): the OS setting, or the H13 override.
  const rmQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const applyMotion = () => {
    const m = store.settings.peek().motion;
    document.documentElement.classList.toggle('rm', m === 'on' || (m === 'auto' && !!rmQuery?.matches));
  };
  effect(() => {
    void store.settings.value.motion;
    applyMotion();
  });
  rmQuery?.addEventListener?.('change', applyMotion);
  effect(() => {
    const tr = store.trip.value;
    log(`trip:${tr ? (tr.guidance.status === 'arrived' ? 'arrived' : 'active') : 'none'}`);
  });
  // Offline active trip: ask the SW to keep the route corridor's tiles (z15–17) while the trip lasts.
  let tilesFor = '';
  effect(() => {
    const tr = store.trip.value;
    const key = tr ? `${tr.id}:${tr.reroutes}` : '';
    if (key === tilesFor) return;
    tilesFor = key;
    if (!tr) return clearTripTiles();
    const pts = tr.guidance.steps.flatMap((st) => st.geometry).filter((_, i) => i % 3 === 0);
    cacheTripTiles(corridorTiles(pts, [15, 16, 17], styleForTheme(isDark(store.settings.peek().theme))));
  });
  const flush = () => store.flushTrip();
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

  const services: Services = { store, router, api, platform, runtime, mode: { demo, mock }, flags };
  render(
    <ServicesContext.Provider value={services}>
      <App />
    </ServicesContext.Provider>,
    document.getElementById('app')!,
  );

  // Resume an unfinished trip after a reload / relaunch (OQ5): straight into H5, or the G4 stale sheet on H1.
  void runtime.resume().then((resumed) => {
    const onGuide = router.route.value.name === 'guide';
    if (resumed && !onGuide) router.enterGuide();
    else if (runtime.ui.peek().stale) {
      if (!onGuide) return router.openSheet('stale-trip');
      addEventListener('popstate', () => setTimeout(() => router.openSheet('stale-trip')), { once: true });
      router.reset('/');
    }
  });

  captureInstallPrompt();
  if (import.meta.env.PROD && session.get('sw.disabled') !== '1') void registerServiceWorker();
  (window as unknown as { __howtogo?: Services }).__howtogo = services;
}

void boot();
