/** QA-60: the 3 s idle preload never fetches the family Viewer chunk, and its failures never count as `chunk_load`. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installChunkReload } from '../src/pwa/chunkReload';
import { codeForLine } from '../src/telemetry/client';
import { lazyView, preloadViews } from '../src/ui/lazy';
import { logLines, resetLog } from '../src/log';
import { memoryKV } from '../src/state/storage';

const chunkErr = () => new TypeError('Failed to fetch dynamically imported module: /assets/Search-x.js');

/** Mimics Vite's preload helper: dispatch `vite:preloadError`; rethrow unless a listener prevented it. */
const viteLoad = (fail: () => boolean) => async () => {
  if (fail()) {
    const err = chunkErr();
    const e = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: unknown };
    e.payload = err;
    dispatchEvent(e);
    if (!e.defaultPrevented) throw err;
    return undefined as unknown as () => null;
  }
  return () => null;
};

const reload = vi.fn();
installChunkReload({ kv: memoryKV(), reload });

afterEach(() => {
  resetLog();
  reload.mockReset();
});

describe('QA-60 idle preload', () => {
  it('skips views registered with idle: false (the non-precached Viewer)', async () => {
    const viewer = vi.fn(async () => () => null);
    const other = vi.fn(async () => () => null);
    lazyView(viewer, { idle: false });
    lazyView(other);
    await preloadViews();
    expect(viewer).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalled();
  });

  it('a failed preload logs no chunk:failed (no chunk_load telemetry) and never reloads', async () => {
    let offline = true;
    const v = lazyView(viteLoad(() => offline));
    await expect(preloadViews()).resolves.toBeDefined();
    expect(logLines().some((l) => codeForLine(l) === 'chunk_load')).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    // The view can still load later (the failed preload left no poisoned promise).
    offline = false;
    await expect(v.preload()).resolves.toBeUndefined();
  });

  it('outside the idle preload, the same failure is still handled (AC 18 unchanged)', async () => {
    const v = lazyView(viteLoad(() => true), { idle: false });
    await v.preload().catch(() => undefined);
    expect(logLines().some((l) => codeForLine(l) === 'chunk_load')).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
