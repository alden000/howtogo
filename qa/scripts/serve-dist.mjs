#!/usr/bin/env node
// Minimal static server for a built dist with the SPA fallback `vite preview` gives (no Vite, so it runs
// inside the Linux Playwright container even though the mounted node_modules hold Windows-native builds).
// Usage: node qa/scripts/serve-dist.mjs <distDir> <port>
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'qa/.out/dist');
const port = Number(process.argv[3] ?? 4183);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8',
};
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (!isFile(file) && isFile(join(file, 'index.html'))) file = join(file, 'index.html');
  // SPA fallback as in `vite preview`: unknown paths without an extension get index.html.
  if (!isFile(file)) {
    if (extname(path)) { res.writeHead(404).end(); return; }
    file = join(root, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`serve-dist ${root} :${port}`));
