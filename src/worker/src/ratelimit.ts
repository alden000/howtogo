/**
 * AC 20: per-IP sliding-window rate limit for the read endpoints, in isolate memory only
 * (no KV, no Durable Object). Each Cloudflare isolate counts on its own, so the real limit
 * is "per IP per isolate"; that is accepted for M1 (Director ruling, QA gate 1).
 *
 * Privacy: the raw IP is never stored or logged. It is hashed with a random salt that lives
 * only in this isolate's memory, and each entry is dropped once its window has passed.
 */
export const RATE_LIMIT = { max: 60, windowMs: 60_000 } as const;
/** Upper bound on tracked clients per isolate, so memory stays small under abuse. */
const MAX_KEYS = 10_000;

const hits = new Map<string, number[]>();
let salt: Uint8Array | null = null;

/** Test hook. */
export function resetRateLimit(): void {
  hits.clear();
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
    if (ts[ts.length - 1]! <= now - RATE_LIMIT.windowMs) hits.delete(k);
  }
}

/**
 * Records one request from `ip`. Returns null when allowed, or the number of seconds to wait
 * (for Retry-After) when the client is over the limit. Requests without a client IP
 * (local dev, tests) are not limited.
 */
export async function checkRateLimit(ip: string | null, now = Date.now()): Promise<number | null> {
  if (!ip) return null;
  const key = await keyFor(ip);
  const cutoff = now - RATE_LIMIT.windowMs;
  let ts = hits.get(key);
  if (ts) {
    let i = 0;
    while (i < ts.length && ts[i]! <= cutoff) i++;
    if (i) ts.splice(0, i);
  } else {
    if (hits.size >= MAX_KEYS) sweep(now);
    if (hits.size >= MAX_KEYS) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }
    ts = [];
    hits.set(key, ts);
  }
  if (ts.length >= RATE_LIMIT.max) {
    return Math.max(1, Math.ceil((ts[0]! + RATE_LIMIT.windowMs - now) / 1000));
  }
  ts.push(now);
  return null;
}
