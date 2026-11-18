/**
 * QA-56 (M5 AC 6, Should): once Home (or the screens that lead to a map: Search, Route options) has been idle
 * 3 s, add `<link rel="prefetch">` for the MapLibre chunk so the route detail map opens fast. Never during
 * the first paint, never on other screens, and not when the browser asks to save data or battery saver is on.
 * Prefetch only downloads into the HTTP cache: nothing is parsed or run.
 */
import { effect } from '@preact/signals';

export const MAP_BOUND = new Set(['home', 'search', 'routes']);
export const PREFETCH_IDLE_MS = 3000;

export interface PrefetchDeps {
  url: string | null;
  route: { readonly value: { name: string } };
  saver: () => boolean;
  idle: (fn: () => void) => void;
  doc?: Document;
  nav?: Navigator;
}

export function saveData(nav: Navigator | undefined): boolean {
  return !!(nav as (Navigator & { connection?: { saveData?: boolean } }) | undefined)?.connection?.saveData;
}

/** Wires the prefetch; returns a disposer. At most one link is ever added. */
export function installMapPrefetch(d: PrefetchDeps): () => void {
  const doc = d.doc ?? document;
  const nav = d.nav ?? (globalThis.navigator as Navigator | undefined);
  if (!d.url) return () => {};
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    if (done || !MAP_BOUND.has(d.route.value.name) || saveData(nav) || d.saver()) return;
    done = true;
    const l = doc.createElement('link');
    l.rel = 'prefetch';
    l.crossOrigin = 'anonymous'; // same request mode as the module import that will use it
    l.href = d.url!;
    doc.head.appendChild(l);
    dispose();
  };
  const stop = effect(() => {
    const name = d.route.value.name;
    clearTimeout(timer);
    if (done || !MAP_BOUND.has(name)) return;
    timer = setTimeout(() => d.idle(fire), PREFETCH_IDLE_MS);
  });
  function dispose() {
    clearTimeout(timer);
    stop();
  }
  return dispose;
}
