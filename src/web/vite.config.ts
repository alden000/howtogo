/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Service worker: src/sw/sw.ts is a second build entry emitted as /sw.js (no hash).
 * After bundling, the placeholder string '__PRECACHE__' is replaced with the list of
 * emitted shell files and `__SW_VERSION__` with a content hash, so every deploy
 * yields a byte-different sw.js → browser update flow.
 */
function serviceWorker(): Plugin {
  return {
    name: 'howtogo-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const sw = Object.values(bundle).find((c) => c.type === 'chunk' && c.fileName === 'sw.js');
      if (!sw || sw.type !== 'chunk') return;
      const files = Object.keys(bundle)
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        // MapLibre is big: cached at runtime on first map view, not precached.
        .filter((f) => !/maplibre/i.test(f))
        // QA-19: demo/mock fixtures are not shell: never precached; `?demo=1`/`?mock=1` loads them on demand (runtime cache).
        .filter((f) => !/(^|\/)mock-/i.test(f))
        .map((f) => '/' + f);
      const precache = ['/', '/manifest.webmanifest', ...files.filter((f) => f !== '/index.html')];
      let h = 0;
      const src = precache.join('|') + Object.values(bundle).map((c) => (c.type === 'chunk' ? c.code.length : 0)).join(',');
      for (let i = 0; i < src.length; i++) h = (Math.imul(31, h) + src.charCodeAt(i)) | 0;
      sw.code = sw.code
        .replace(/(["'`])__PRECACHE__\1/g, JSON.stringify(precache))
        .replace(/__SW_VERSION__/g, (h >>> 0).toString(36));
    },
  };
}

export default defineConfig({
  plugins: [preact({ prerender: { enabled: false } }), serviceWorker()],
  build: {
    target: 'es2022',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: { index: 'index.html', sw: 'src/sw/sw.ts' },
      output: {
        entryFileNames: (c) => (c.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    // share-contract.test.ts imports the Worker's validator; its Durable Object import is stubbed.
    alias: { 'cloudflare:workers': new URL('./test/stubs/cloudflare-workers.ts', import.meta.url).pathname },
  },
});
