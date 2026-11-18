/**
 * AC 20: per-IP sliding-window rate limit for the read endpoints, in isolate memory only
 * (no KV, no Durable Object). Each Cloudflare isolate counts on its own, so the real limit
 * is "per IP per isolate"; that is accepted for M1 (Director ruling, QA gate 1).
 *
 * Privacy: the raw IP is never stored or logged. It is hashed with a random salt that lives
 * only in this isolate's memory, and each entry is dropped once its window has passed.
 */
export const RATE_LIMIT = { max: 60, windowMs: 60_000 } as const;

/**
 * M4 AC 47 limits (per IP, same in-memory sliding window and privacy rules as RATE_LIMIT).
 * `shareView` is keyed on IP + share id (1 GET per 5 s per viewer per share); the WebSocket is not counted.
 */
export const LIMITS = {
  read: RATE_LIMIT,
  shareCreate: { max: 10, windowMs: 3_600_000 },
  setupCreate: { max: 5, windowMs: 3_600_000 },
  setupRead: { max: 30, windowMs: 3_600_000 },
  shareView: { max: 1, windowMs: 5_000 },
  /** M5 AC 38: the client sends ≤ 1 report per 5 min and ≤ 20 per day; 12/h leaves room for several tabs. */
  telemetry: { max: 12, windowMs: 3_600_000 },
} as const;
export type LimitName = keyof typeof LIMITS;
/** Upper bound on tracked clients per isolate, so memory stays small under abuse. */
const MAX_KEYS = 10_000;

const hits = new Map<string, number[]>();
/** Window of each tracked key, so sweep() can tell when an entry is stale. */
const windows = new Map<string, number>();
let salt: Uint8Array | null = null;

/** Test hook. */
export function resetRateLimit(): void {
  hits.clear();
  windows.clear();
  salt = null;
}

/** Test hook: number of clients currently tracked. */
export function trackedClients(): number {
  return hits.size;
}

async function keyFor(ip: string): Promise<string> {
  // Random values may only be generated inside a request, so the salt is made lazily.
  if (!salt) salt = crypto.getRandomValues(new Uint8Array(16));
  const ipBytes = new TextEncoder().encode(ip);
  const buf = new Uint8Array(salt.length + ipBytes.length);
  buf.set(salt);
  buf.set(ipBytes, salt.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  let hex = "";
  for (let i = 0; i < 16; i++) hex += digest[i]!.toString(16).padStart(2, "0");
  return hex;
}

function sweep(now: number): void {
  for (const [k, ts] of hits) {
    if (ts.length === 0 || ts[ts.length - 1]! <= now - (windows.get(k) ?? RATE_LIMIT.windowMs)) {
      hits.delete(k);
      windows.delete(k);
    }
  }
}

/**
 * Records one request from `ip`. Returns null when allowed, or the number of seconds to wait
 * (for Retry-After) when the client is over the limit. Requests without a client IP
 * (local dev, tests) are not limited.
 */
export async function checkRateLimit(ip: string | null, now = Date.now()): Promise<number | null> {
  return checkLimit("read", ip, now);
}

/**
 * Same as checkRateLimit for a named limit. `scope` narrows the key (e.g. a share id for shareView);
 * it is hashed together with the IP and never stored in clear.
 */
export async function checkLimit(name: LimitName, ip: string | null, now = Date.now(), scope = ""): Promise<number | null> {
  if (!ip) return null;
  const { max, windowMs } = LIMITS[name];
  const key = await keyFor(`${name}\u0000${scope}\u0000${ip}`);
  const cutoff = now - windowMs;
  let ts = hits.get(key);
  if (ts) {
    let i = 0;
    while (i < ts.length && ts[i]! <= cutoff) i++;
    if (i) ts.splice(0, i);
  } else {
    if (hits.size >= MAX_KEYS) sweep(now);
    if (hits.size >= MAX_KEYS) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) {
        hits.delete(oldest);
        windows.delete(oldest);
      }
    }
    ts = [];
    hits.set(key, ts);
    windows.set(key, windowMs);
  }
  if (ts.length >= max) {
    return Math.max(1, Math.ceil((ts[0]! + windowMs - now) / 1000));
  }
  ts.push(now);
  return null;
}
