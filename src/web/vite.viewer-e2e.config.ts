/** `vite preview` for the viewer e2e: same build, /api (incl. the live WebSocket) proxied to `wrangler dev --env test`. */
import { mergeConfig } from 'vite';
import base from './vite.config.ts';

export const VIEWER_E2E_PORT = 4175;
export const WORKER_E2E_PORT = 8788;

export default mergeConfig(base, {
  preview: {
    port: VIEWER_E2E_PORT,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${WORKER_E2E_PORT}`, ws: true } },
  },
});
