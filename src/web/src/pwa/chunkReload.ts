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

/** Installs the listeners: Vite's `vite:preloadError` and unhandled dynamic-import rejections. */
export function installChunkReload(deps: ChunkReloadDeps = {}): void {
  addEventListener('vite:preloadError', (e) => {
    e.preventDefault(); // we handle it; don't also throw
    handleChunkError(deps);
  });
  addEventListener('unhandledrejection', (e) => {
    if (isChunkLoadError((e as PromiseRejectionEvent).reason)) {
      e.preventDefault();
      handleChunkError(deps);
    }
  });
}
