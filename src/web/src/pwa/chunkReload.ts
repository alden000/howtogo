/**
 * M5 AC 18: a lazy chunk that fails to load (a stale index.html after a deploy, a chunk deleted from the server)
 * triggers ONE clean reload — never a loop. The reload time is kept in sessionStorage (`chunk.reloadedAt`); a
 * second failure within `CHUNK_RELOAD_WINDOW_MS` is only logged (`chunk:reload-skipped`) and counted.
 * The active trip is flushed to storage first, so a reload mid-trip resumes it (OQ5).
 * Log hooks: `chunk:failed`, `chunk:reload`, `chunk:reload-skipped`.
 */
import { log } from '../log';
import { session, type KV } from '../state/storage';

export const CHUNK_RELOAD_WINDOW_MS = 60_000;
const KEY = 'chunk.reloadedAt';

/** Messages browsers use for a failed dynamic import / module script. */
export function isChunkLoadError(reason: unknown): boolean {
  const msg = reason instanceof Error ? `${reason.name} ${reason.message}` : typeof reason === 'string' ? reason : '';
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk \S+ failed/i.test(msg);
}

/** Pure decision: reload now, or skip because we already reloaded recently. */
export function chunkReloadDecision(kv: KV, now: number): 'reload' | 'skip' {
  const last = Number(kv.get(KEY));
  return Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_WINDOW_MS ? 'skip' : 'reload';
}

export interface ChunkReloadDeps {
  kv?: KV;
  now?: () => number;
  reload?: () => void;
  /** Persist state before reloading (the store's flushTrip). */
  beforeReload?: () => void;
}

/** Handles one chunk-load failure. Returns what it did. */
export function handleChunkError(deps: ChunkReloadDeps = {}): 'reload' | 'skip' {
  const kv = deps.kv ?? session;
  const now = (deps.now ?? Date.now)();
  log('chunk:failed');
  // Offline: a reload would only trade a missing screen for the browser's offline page. Wait instead; the lazy
  // view retries when the network is back (ui/lazy.ts).
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    log('chunk:offline');
    return 'skip';
  }
  const d = chunkReloadDecision(kv, now);
  if (d === 'skip') {
    log('chunk:reload-skipped');
    return d;
  }
  kv.set(KEY, String(now));
  log('chunk:reload');
  try {
    deps.beforeReload?.();
  } finally {
    (deps.reload ?? (() => location.reload()))();
  }
  return d;
}

/**
 * MapLibre (JS + CSS) is optional: it is not precached, so it fails offline by design, and the map code shows
 * its own fallback. Its failures must never reload the page (a reload mid-trip, offline, helps nobody).
 */
export function isOptionalChunk(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  return /maplibre/i.test(msg);
}

/** Only a real load failure of an app chunk reloads. */
export const shouldReloadFor = (reason: unknown): boolean => isChunkLoadError(reason) && !isOptionalChunk(reason);

let quiet = 0;

/**
 * QA-60: runs a best-effort preload during which Vite's global `vite:preloadError` is left alone, so the error
 * reaches the caller (which swallows it) instead of being logged as `chunk:failed` and reloading. A lazy view
 * opened meanwhile still reports its own failure (ui/lazy.ts catches it), and an unhandled rejection still does.
 */
export async function quietChunkErrors<T>(run: () => Promise<T>): Promise<T> {
  quiet++;
  try {
    return await run();
  } finally {
    quiet--;
  }
}

/**
 * Installs the listeners: Vite's `vite:preloadError` and unhandled dynamic-import rejections. Vite fires
 * `vite:preloadError` for ANY error in a dynamic-import chain (e.g. a MapLibre constructor error), so the reason
 * is checked: anything that is not a chunk/CSS load failure is left alone.
 */
export function installChunkReload(deps: ChunkReloadDeps = {}): void {
  addEventListener('vite:preloadError', (e) => {
    if (quiet > 0) return; // an idle preload: let it reject to its caller, which swallows it (QA-60)
    if (!shouldReloadFor((e as Event & { payload?: unknown }).payload)) return; // the caller's own catch handles it
    e.preventDefault(); // we handle it; don't also throw
    handleChunkError(deps);
  });
  addEventListener('unhandledrejection', (e) => {
    if (!shouldReloadFor((e as PromiseRejectionEvent).reason)) return;
    e.preventDefault();
    handleChunkError(deps);
  });
}
