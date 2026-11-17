import type { Connect, Plugin } from 'vite';

type Req = { url?: string };

/**
 * Family viewer entry (M4 AC 17): `/t/:id` is served by viewer.html, a separate lightweight entry.
 * Production: the Worker rewrites /t/* (src/worker/src/viewer.ts). Here: the same rewrite for
 * `vite` (dev) and `vite preview`, so e2e and local work match.
 */
export const VIEWER_INPUT = { viewer: 'viewer.html' };

/** Built files that belong to the viewer only (kept out of the app's service-worker precache). */
export const isViewerFile = (f: string) => /(^|\/)viewer/i.test(f);

const rewrite = ((req: Req, _res: unknown, next: () => void) => {
  const url = req.url ?? '';
  if (/^\/t(\/[^?#]*)?(\?.*)?$/.test(url) && !url.startsWith('/t/assets')) req.url = '/viewer.html';
  next();
}) as unknown as Connect.NextHandleFunction;

export function viewerEntry(): Plugin {
  return {
    name: 'howtogo-viewer',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}
