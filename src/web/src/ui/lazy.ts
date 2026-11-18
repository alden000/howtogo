/**
 * M5 AC 3/5: code-split screens and sheets that Home and the first run do not need. A lazy view renders nothing
 * for the few milliseconds its chunk takes to load (it is precached by the SW, so offline works), and
 * `preloadViews()` warms every lazy chunk once the app is idle, so in-app navigation stays instant.
 * A chunk that fails to load is handled by pwa/chunkReload.ts (one clean reload).
 */
import { h, type ComponentType, type FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { handleChunkError, quietChunkErrors, shouldReloadFor } from '../pwa/chunkReload';

type Loader<P> = () => Promise<ComponentType<P>>;
const registry: (() => Promise<unknown>)[] = [];

export interface LazyView<P> extends FunctionComponent<P> {
  preload(): Promise<unknown>;
}

/**
 * `idle: false` keeps a view out of the idle `preloadViews()` warm-up (QA-60: the family Viewer chunk is
 * deliberately not precached, so warming it costs a fetch nobody needs and fails offline).
 */
export function lazyView<P extends object>(load: Loader<P>, opts: { idle?: boolean } = {}): LazyView<P> {
  let C: ComponentType<P> | null = null;
  let pending: Promise<unknown> | null = null;
  const preload = () =>
    (pending ??= load().then(
      (c) => {
        C = c;
      },
      (e: unknown) => {
        pending = null; // allow a retry; the global handler decides about reloading
        throw e;
      },
    ));
  const Lazy = ((props: P) => {
    const [, setReady] = useState(0);
    useEffect(() => {
      if (C) return;
      const load = () => preload().then(() => setReady((n) => n + 1), (e: unknown) => shouldReloadFor(e) && handleChunkError());
      void load();
      // Offline on first visit (chunk not cached yet): try again when the network comes back.
      addEventListener('online', load);
      return () => removeEventListener('online', load);
    }, []);
    return C ? h(C as ComponentType<P>, props) : null;
  }) as LazyView<P>;
  Lazy.preload = preload;
  if (opts.idle !== false) registry.push(preload);
  return Lazy;
}

/**
 * Warm the lazy chunks (call when idle after the first paint, or on the first interaction). Best effort: a
 * failure here is never a `chunk:failed` / `chunk_load` error and never reloads (QA-60). A screen the user then
 * opens loads its chunk again and reports a real failure itself.
 */
export function preloadViews(): Promise<unknown> {
  return quietChunkErrors(() => Promise.allSettled(registry.map((p) => p())));
}

/** Runs `fn` when the main thread is idle (or after `fallbackMs`). */
export function whenIdle(fn: () => void, fallbackMs = 2000): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: fallbackMs * 2 });
  else setTimeout(fn, fallbackMs);
}
