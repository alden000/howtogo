/**
 * Two-tier response cache: a small in-isolate memory map (works everywhere, including
 * workers.dev) in front of the Cloudflare Cache API (shared per colo, custom domains only).
 * Only successful upstream bodies are cached. Keys must not contain secrets.
 */
export interface CachedValue {
  body: string;
  /** Epoch ms when the upstream response was fetched. */
  storedAt: number;
  hit: boolean;
}

interface MemEntry {
  body: string;
  storedAt: number;
  expiresAt: number;
}

const MEM_MAX = 500;
const mem = new Map<string, MemEntry>();
const CACHE_ORIGIN = "https://cache.howtogo.internal/";

export function resetMemoryCache(): void {
  mem.clear();
}

function memGet(key: string, now: number): MemEntry | undefined {
  const e = mem.get(key);
  if (!e) return undefined;
  if (e.expiresAt <= now) {
    mem.delete(key);
    return undefined;
  }
  return e;
}

function memSet(key: string, entry: MemEntry): void {
  if (mem.size >= MEM_MAX) {
    const oldest = mem.keys().next().value;
    if (oldest !== undefined) mem.delete(oldest);
  }
  mem.set(key, entry);
}

function cacheApi(): Cache | undefined {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  } catch {
    return undefined;
  }
}

export async function cached(
  key: string,
  ttlSec: number,
  producer: () => Promise<string>,
  ctx?: Pick<ExecutionContext, "waitUntil">,
): Promise<CachedValue> {
  const now = Date.now();
  const m = memGet(key, now);
  if (m) return { body: m.body, storedAt: m.storedAt, hit: true };

  const cache = cacheApi();
  const cacheReq = new Request(CACHE_ORIGIN + encodeURIComponent(key));
  if (cache) {
    try {
      const hit = await cache.match(cacheReq);
      if (hit) {
        const body = await hit.text();
        const storedAt = Number(hit.headers.get("X-Stored-At")) || now;
        const remaining = storedAt + ttlSec * 1000 - now;
        if (remaining > 0) {
          memSet(key, { body, storedAt, expiresAt: now + remaining });
          return { body, storedAt, hit: true };
        }
      }
    } catch {
      /* cache is best-effort */
    }
  }

  const body = await producer();
  const storedAt = Date.now();
  memSet(key, { body, storedAt, expiresAt: storedAt + ttlSec * 1000 });
  if (cache) {
    const put = cache
      .put(
        cacheReq,
        new Response(body, {
          headers: { "Cache-Control": `max-age=${ttlSec}`, "X-Stored-At": String(storedAt) },
        }),
      )
      .catch(() => undefined);
    if (ctx) ctx.waitUntil(put);
    else await put;
  }
  return { body, storedAt, hit: false };
}
