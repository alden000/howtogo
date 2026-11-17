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
import { matchRoute, ROOTS, STANDALONE, type RouteMatch } from './routes';

export interface NavState {
  howtogo: 1;
  idx: number;
  sheet?: string;
  sheetData?: unknown;
  /** D8 guard under the guidance screen: Back onto it opens the End-trip sheet instead of leaving. */
  guard?: boolean;
}

/** What Back onto the guidance guard does: End-trip sheet (trip running), Home (arrived), or keep going back (no trip). */
export type GuardAction = 'sheet' | 'home' | 'pass';

const GUIDE = '/guide';
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
  /** Swap the open sheet for another in the same history entry (e.g. explainer → denied help). */
  replaceSheet(name: string, data?: unknown): void;
  /** Drop the whole in-app stack and land on `path` as the new root (first run done); then push `then`, if given. */
  reset(path: string, then?: string): void;
  /** Open the guidance screen over a D8 guard entry (H4 Start, resume). */
  enterGuide(): void;
  /** Decide what Back onto the guard does (set by the app). */
  setGuard(fn: () => GuardAction): void;
  back(): void;
  dispose(): void;
}

export function createRouter(win: Window = window): Router {
  const h = win.history;
  const href = () => win.location.pathname + win.location.search;

  // Seed history on first load.
  if (!isNav(h.state)) {
    const m = matchRoute(href());
    if (m.name === 'guide') {
      // D8: a reload on /guide keeps the End-trip guard under it.
      h.replaceState({ howtogo: 1, idx: 0 } satisfies NavState, '', '/');
      h.pushState({ howtogo: 1, idx: 1, guard: true } satisfies NavState, '', GUIDE);
      h.pushState({ howtogo: 1, idx: 2 } satisfies NavState, '', GUIDE);
    } else if (!ROOTS.has(m.name) && !STANDALONE.has(m.name)) {
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

  let guardFn: () => GuardAction = () => 'pass';
  const sync = () => {
    const st = isNav(h.state) ? h.state : ({ howtogo: 1, idx: 0 } as NavState);
    if (st.guard) {
      const a = guardFn();
      log(`guard:${a}`);
      if (a === 'pass') return void (st.idx > 0 ? h.back() : h.replaceState({ howtogo: 1, idx: 0 } satisfies NavState, '', '/'));
      if (a === 'home') return resetTo('/', undefined, st.idx);
      h.pushState({ howtogo: 1, idx: st.idx + 1 } satisfies NavState, '', GUIDE);
      h.pushState({ howtogo: 1, idx: st.idx + 2, sheet: 'end-trip' } satisfies NavState, '', GUIDE);
      state.value = h.state as NavState;
      route.value = matchRoute(href());
      return announce();
    }
    state.value = st;
    route.value = matchRoute(href());
    announce();
  };
  const onPop = () => sync();
  function resetTo(path: string, then?: string, from?: number) {
    const n = from ?? state.value.idx;
    const land = () => {
      h.replaceState({ howtogo: 1, idx: 0 } satisfies NavState, '', path);
      if (then) h.pushState({ howtogo: 1, idx: 1 } satisfies NavState, '', then);
      state.value = h.state as NavState;
      route.value = matchRoute(href());
      announce();
    };
    const cur = isNav(h.state) ? h.state.idx : 0;
    const back = from ?? Math.max(n, cur);
    if (back <= 0) return land();
    const once = () => {
      win.removeEventListener('popstate', once, true);
      // Stop the regular handler from seeing the intermediate entry (it may be a guard).
      win.removeEventListener('popstate', onPop);
      land();
      win.addEventListener('popstate', onPop);
    };
    win.removeEventListener('popstate', onPop);
    win.addEventListener('popstate', once, true);
    h.go(-back);
  }
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
    replaceSheet(name, data) {
      const next: NavState = { howtogo: 1, idx: state.value.idx, sheet: name };
      if (data !== undefined) next.sheetData = data;
      h.replaceState(next, '', href());
      sync();
    },
    reset(path, then) {
      resetTo(path, then);
    },
    enterGuide() {
      const cur = state.value;
      if (route.value.name === 'guide' && !cur.sheet) return;
      const base = cur.sheet ? cur.idx : cur.idx + 1;
      if (cur.sheet) h.replaceState({ howtogo: 1, idx: cur.idx, guard: true } satisfies NavState, '', GUIDE);
      else h.pushState({ howtogo: 1, idx: base, guard: true } satisfies NavState, '', GUIDE);
      h.pushState({ howtogo: 1, idx: base + 1 } satisfies NavState, '', GUIDE);
      state.value = h.state as NavState;
      route.value = matchRoute(href());
      announce();
    },
    setGuard(fn) {
      guardFn = fn;
    },
    back() {
      if (state.value.idx > 0) h.back();
      else if (!ROOTS.has(route.value.name) && !STANDALONE.has(route.value.name)) {
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
