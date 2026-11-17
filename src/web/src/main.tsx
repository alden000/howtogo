/**
 * Bootstrap. Modes:
 *  - normal: web platform + HTTP API at VITE_API_BASE ("" = same origin);
 *  - `?mock=1` (or VITE_API_MOCK=1): mock API on the shared fixtures, real device location;
 *  - `?demo=1`: mock API + demo platform — location is a simulated GPS stream
 *    (`simulateFixes`) along the chosen itinerary; `&demoMs=<n>` sets ms per fix.
 * The mode sticks for the tab (sessionStorage) so in-app navigation and reloads keep it.
 */
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
import { registerServiceWorker } from './pwa/register';
import { createRouter } from './router/router';
import { session } from './state/storage';
import { createStore } from './state/store';
import { createTripRuntime } from './trip/runtime';

const DEMO_DEFAULT_MS = 400;

async function boot() {
  const q = new URLSearchParams(location.search);
  if (q.get('demo') === '1') session.set('mode.demo', '1');
  if (q.get('demo') === '0') session.remove('mode.demo');
  if (q.get('mock') === '1') session.set('mode.mock', '1');
  if (q.get('demoMs')) session.set('mode.demoMs', q.get('demoMs')!);
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
  }
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
  effect(() => {
    const tr = store.trip.value;
    log(`trip:${tr ? (tr.guidance.status === 'arrived' ? 'arrived' : 'active') : 'none'}`);
  });
  const flush = () => store.flushTrip();
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

  const services: Services = { store, router, api, platform, runtime, mode: { demo, mock } };
  render(
    <ServicesContext.Provider value={services}>
      <App />
    </ServicesContext.Provider>,
    document.getElementById('app')!,
  );

  // Resume an unfinished trip after a reload / relaunch.
  void runtime.resume();

  captureInstallPrompt();
  if (import.meta.env.PROD && session.get('sw.disabled') !== '1') void registerServiceWorker();
  (window as unknown as { __howtogo?: Services }).__howtogo = services;
}

void boot();
