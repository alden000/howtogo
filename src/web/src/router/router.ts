/**
 * In-app history. Every screen, sheet and dialog is one history entry, so
 * browser/Android Back (and, in M6, the Capacitor back button) steps back one
 * in-app step, closes the topmost sheet first, and leaves the app only from Home.
 *
 * history.state = { howtogo: 1, idx, sheet? }  — idx is the in-app depth.
 * Deep links (e.g. a reload on /guide, or /routes?…) get a Home entry seeded
 * underneath on first load, so Back from them lands on Home, not outside.
 */
import { signal, computed } from '@preact/signals';
import { log } from '../log';
import { matchRoute, STANDALONE, type RouteMatch } from './routes';

export interface NavState {
  howtogo: 1;
  idx: number;
  sheet?: string;
  sheetData?: unknown;
}

const isNav = (s: unknown): s is NavState => !!s && typeof s === 'object' && (s as NavState).howtogo === 1;

export interface Router {
  route: { readonly value: RouteMatch };
  sheet: { readonly value: string | null };
  sheetData: { readonly value: unknown };
  depth: { readonly value: number };
  atRoot: { readonly value: boolean };
  navigate(path: string, opts?: { replace?: boolean }): void;
  openSheet(name: string, data?: unknown): void;
  closeSheet(): void;
  back(): void;
  dispose(): void;
}

export function createRouter(win: Window = window): Router {
  const h = win.history;
  const href = () => win.location.pathname + win.location.search;

  // Seed history on first load.
  if (!isNav(h.state)) {
    const m = matchRoute(href());
    if (m.name !== 'home' && !STANDALONE.has(m.name)) {
      const target = href();
      h.replaceState({ howtogo: 1, idx: 0 } satisfies NavState, '', '/');
      h.pushState({ howtogo: 1, idx: 1 } satisfies NavState, '', target);
    } else {
      h.replaceState({ howtogo: 1, idx: 0 } satisfies NavState, '', href());
    }
  }

  const state = signal<NavState>(h.state as NavState);
  const route = signal<RouteMatch>(matchRoute(href()));
  const sheet = computed(() => state.value.sheet ?? null);
  const sheetData = computed(() => state.value.sheetData);
  const depth = computed(() => state.value.idx);
  const atRoot = computed(() => route.value.name === 'home' && !sheet.value);

  const announce = () => {
    log(`screen:${route.value.path}`);
    log(`sheet:${sheet.value ?? '-'}`);
  };
  announce();

  const sync = () => {
    state.value = isNav(h.state) ? h.state : { howtogo: 1, idx: 0 };
    route.value = matchRoute(href());
    announce();
  };
  const onPop = () => sync();
  win.addEventListener('popstate', onPop);

  return {
    route,
    sheet,
    sheetData,
    depth,
    atRoot,
    navigate(path, opts = {}) {
      const cur = state.value;
      // A sheet open underneath a navigation is consumed: replace its entry.
      const replace = opts.replace || !!cur.sheet;
      const next: NavState = { howtogo: 1, idx: replace ? cur.idx : cur.idx + 1 };
      if (replace) h.replaceState(next, '', path);
      else h.pushState(next, '', path);
      sync();
    },
    openSheet(name, data) {
      const cur = state.value;
      const next: NavState = { howtogo: 1, idx: cur.idx + 1, sheet: name };
      if (data !== undefined) next.sheetData = data;
      h.pushState(next, '', href());
      sync();
    },
    closeSheet() {
      if (state.value.sheet) h.back();
    },
    back() {
      if (state.value.idx > 0) h.back();
      else if (route.value.name !== 'home' && !STANDALONE.has(route.value.name)) {
        h.replaceState({ howtogo: 1, idx: 0 } satisfies NavState, '', '/');
        sync();
      }
      // At root: nothing (the platform may exit the app; the web cannot).
    },
    dispose() {
      win.removeEventListener('popstate', onPop);
    },
  };
}
