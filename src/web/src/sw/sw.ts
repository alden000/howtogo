/**
 * 怎么去? service worker (hand-written, classic script, no imports).
 *  - precaches the app shell (list injected at build time into PRECACHE);
 *  - OneMap tiles: cache-first, bounded LRU (800 tiles); trip corridor tiles in their own cache;
 *  - /api GETs (except share): network-first, short-TTL cached fallback;
 *  - navigations: network-first (3 s) → cached shell, so a cold offline start shows Home;
 *  - update flow: a new SW waits until the page posts SKIP_WAITING (prompt-to-refresh).
 */
/// <reference lib="webworker" />
export {};
const sw = self as unknown as ServiceWorkerGlobalScope;
/** Replaced at build time (vite.config.ts) with the shell file list. */
const PRECACHE = '__PRECACHE__' as unknown as string[];

const VERSION = '__SW_VERSION__';
const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime-v1';
const TILES = 'tiles-v1';
const TRIP_TILES = 'trip-tiles-v1';
const API = 'api-v1';
const MAX_TILES = 800;
const MAX_TRIP_TILES = 600;
const KEEP = new Set([SHELL, RUNTIME, TILES, TRIP_TILES, API]);
const API_TTL_MS: Record<string, number> = {
  search: 24 * 3600_000,
  revgeocode: 24 * 3600_000,
  route: 10 * 60_000,
  'bus-arrival': 60_000,
  alerts: 5 * 60_000,
};

sw.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!KEEP.has(k)) await caches.delete(k);
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('message', (e) => {
  const d = e.data as { type?: string; urls?: string[] } | undefined;
  if (d?.type === 'SKIP_WAITING') void sw.skipWaiting();
  else if (d?.type === 'TRIP_TILES' && Array.isArray(d.urls)) e.waitUntil(cacheTripTiles(d.urls.slice(0, MAX_TRIP_TILES)));
  else if (d?.type === 'TRIP_TILES_CLEAR') e.waitUntil(caches.delete(TRIP_TILES));
});

async function cacheTripTiles(urls: string[]) {
  const c = await caches.open(TRIP_TILES);
  for (const u of urls) {
    if (await c.match(u)) continue;
    try {
      const r = await fetch(u, { mode: 'cors' });
      if (r.ok) await c.put(u, r);
    } catch {
      /* offline: skip */
    }
  }
}

let putsSinceTrim = 0;
async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys(); // insertion order: oldest first
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]!);
}

async function tile(req: Request): Promise<Response> {
  const trip = await (await caches.open(TRIP_TILES)).match(req);
  if (trip) return trip;
  const c = await caches.open(TILES);
  const hit = await c.match(req);
  if (hit) {
    // LRU touch: re-insert so it moves to the end of the key order.
    const copy = hit.clone();
    void c.delete(req).then(() => c.put(req, copy));
    return hit;
  }
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    await c.put(req, res.clone());
    if (++putsSinceTrim >= 25) {
      putsSinceTrim = 0;
      void trimTiles();
    }
  }
  return res;
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

async function api(req: Request, endpoint: string): Promise<Response> {
  const c = await caches.open(API);
  try {
    const res = await timeout(fetch(req), 8000);
    if (res.ok) {
      const body = await res.clone().arrayBuffer();
      const headers = new Headers(res.headers);
      headers.set('x-sw-cached-at', String(Date.now()));
      await c.put(req, new Response(body, { status: res.status, statusText: res.statusText, headers }));
    }
    return res;
  } catch (err) {
    const hit = await c.match(req);
    const at = Number(hit?.headers.get('x-sw-cached-at') ?? 0);
    if (hit && Date.now() - at < (API_TTL_MS[endpoint] ?? 60_000)) return hit;
    throw err;
  }
}

async function navigate(req: Request): Promise<Response> {
  try {
    return await timeout(fetch(req), 3000);
  } catch {
    const shell = await caches.match('/', { cacheName: SHELL });
    return shell ?? Response.error();
  }
}

async function asset(req: Request): Promise<Response> {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await (await caches.open(RUNTIME)).put(req, res.clone());
  return res;
}

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'www.onemap.gov.sg' && url.pathname.startsWith('/maps/tiles/')) return e.respondWith(tile(req));
  if (url.origin !== sw.location.origin) return;
  if (req.mode === 'navigate') return e.respondWith(navigate(req));
  const m = /^\/api\/([a-z-]+)/.exec(url.pathname);
  if (m) {
    if (m[1] === 'share' || m[1] === 'health') return;
    return e.respondWith(api(req, m[1]!));
  }
  if (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest') return e.respondWith(asset(req));
});
