import type { Env } from "./env";
import { HttpError, UpstreamError, upstreamStatus, upstreamTimeout } from "./http";
import { bump } from "./stats";

export const ONEMAP_BASE = "https://www.onemap.gov.sg";
export const TOKEN_URL = `${ONEMAP_BASE}/api/auth/post/getToken`;
export const TOKEN_KV_KEY = "onemap:token";
/** Renew when less than this is left on the token (tokens last ~3 days). AC 15: < 12 h. */
export const RENEW_BEFORE_MS = 12 * 60 * 60 * 1000;
/** AC 19: upstream timeout 8 s. */
export const UPSTREAM_TIMEOUT_MS = 8_000;

interface TokenRecord {
  token: string;
  /** Epoch ms. */
  expiresAt: number;
}

let memToken: TokenRecord | null = null;
let renewing: Promise<TokenRecord> | null = null;

/** Test hook: forget the in-memory token. */
export function resetTokenCache(): void {
  memToken = null;
  renewing = null;
}

export function hasOneMapCredentials(env: Env): boolean {
  return Boolean(env.ONEMAP_EMAIL && env.ONEMAP_PASSWORD);
}

function fresh(rec: TokenRecord | null, now: number): rec is TokenRecord {
  return !!rec && rec.expiresAt - now > RENEW_BEFORE_MS;
}

function usable(rec: TokenRecord | null, now: number): rec is TokenRecord {
  return !!rec && rec.expiresAt - now > 60_000;
}

/** OneMap returns expiry_timestamp in epoch seconds (string or number). Accept ms too, defensively. */
export function parseExpiry(value: unknown, now = Date.now()): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) return now + 24 * 60 * 60 * 1000; // assume 1 day if missing
  return n < 1e12 ? n * 1000 : n;
}

export function fetchWithTimeout(input: string, init: RequestInit = {}, ms = UPSTREAM_TIMEOUT_MS): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
}

async function requestNewToken(env: Env): Promise<TokenRecord> {
  let res: Response;
  try {
    res = await fetchWithTimeout(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.ONEMAP_EMAIL, password: env.ONEMAP_PASSWORD }),
    });
  } catch {
    throw upstreamTimeout();
  }
  if (!res.ok) {
    // Never echo the upstream body: it may reflect the credentials.
    console.error("onemap_token_renew_failed", res.status);
    throw upstreamStatus(res.status);
  }
  let data: { access_token?: unknown; expiry_timestamp?: unknown };
  try {
    data = await res.json();
  } catch {
    throw new UpstreamError();
  }
  if (typeof data.access_token !== "string" || !data.access_token) throw new UpstreamError();
  const rec = { token: data.access_token, expiresAt: parseExpiry(data.expiry_timestamp) };
  bump("token_renew");
  try {
    const ttl = Math.max(60, Math.floor((rec.expiresAt - Date.now()) / 1000));
    await env.TOKEN_KV.put(TOKEN_KV_KEY, JSON.stringify(rec), { expirationTtl: ttl });
  } catch {
    /* KV is a cache; carry on with the in-memory token */
  }
  return rec;
}

function renewOnce(env: Env): Promise<TokenRecord> {
  if (!renewing) {
    renewing = requestNewToken(env).finally(() => {
      renewing = null;
    });
  }
  return renewing;
}

/**
 * Returns a valid OneMap token, or null when no credentials are configured.
 * force=true skips caches (used after a 401).
 */
export async function getOneMapToken(env: Env, opts: { force?: boolean } = {}): Promise<string | null> {
  if (!hasOneMapCredentials(env)) return null;
  const now = Date.now();
  if (!opts.force) {
    if (fresh(memToken, now)) return memToken.token;
    if (!memToken || !fresh(memToken, now)) {
      try {
        const stored = await env.TOKEN_KV.get<TokenRecord>(TOKEN_KV_KEY, "json");
        if (stored && typeof stored.token === "string") {
          memToken = stored;
          if (fresh(stored, now)) return stored.token;
        }
      } catch {
        /* ignore */
      }
    }
  }
  const stale = memToken;
  try {
    memToken = await renewOnce(env);
    return memToken.token;
  } catch (err) {
    // Renewal failed: fall back to an older token that has not actually expired yet.
    if (!opts.force && usable(stale, Date.now())) return stale.token;
    throw err;
  }
}

/**
 * GET a OneMap API path. Adds the token (raw value in Authorization, per OneMap docs) when available,
 * retries once with a renewed token on 401. Returns the successful response; throws on failure.
 */
export async function oneMapGet(env: Env, pathAndQuery: string, opts: { requireToken: boolean }): Promise<Response> {
  if (opts.requireToken && !hasOneMapCredentials(env)) {
    throw new HttpError(503, "not_configured", "This feature is not set up yet.");
  }
  const url = ONEMAP_BASE + pathAndQuery;
  const attempt = async (token: string | null): Promise<Response> => {
    try {
      return await fetchWithTimeout(url, { headers: token ? { Authorization: token } : {} });
    } catch {
      throw upstreamTimeout();
    }
  };
  let token = await getOneMapToken(env);
  let res = await attempt(token);
  if (res.status === 401 && token) {
    token = await getOneMapToken(env, { force: true });
    res = await attempt(token);
  }
  if (!res.ok) {
    console.error("onemap_upstream_error", pathAndQuery.split("?")[0], res.status);
    throw upstreamStatus(res.status);
  }
  return res;
}
