/**
 * M5 §I monitoring-lite: the ONE contract shared by the PWA client (src/web/src/telemetry) and the
 * Worker's Stats Durable Object (src/worker/src/stats.ts).
 *
 * A report is a JSON array of rows `{ v, code, screen, n }` and nothing else:
 *  - `v`      app version (semver, e.g. "1.0.0" or "1.0.0-rc.1");
 *  - `code`   one of the fixed enums below (never free text);
 *  - `screen` one of the router's screen ids (never a path or query);
 *  - `n`      a positive integer count.
 * No message text, stack, URL, UA, coordinates, place names, ids or timestamps: the Worker files a row
 * under the Singapore *day* it arrives on, so no client time is ever sent.
 */

/** Client-side error classes (AC 38). */
export const CLIENT_CODES = [
  'err_uncaught',
  'err_rejection',
  'chunk_load',
  'api_timeout',
  'api_5xx',
  'api_429',
  'api_503',
  'sw_install',
  'geo_unavailable',
  'speech_unavailable',
] as const;

/** Server-side counts added by the Worker itself (AC 39). Never accepted from a client. */
export const SERVER_CODES = [
  'up_onemap_4xx',
  'up_onemap_5xx',
  'up_onemap_timeout',
  'up_lta_4xx',
  'up_lta_5xx',
  'up_lta_timeout',
  'token_renew',
  'share_create',
  'share_end',
  'rate_limited',
] as const;

export type ClientCode = (typeof CLIENT_CODES)[number];
export type ServerCode = (typeof SERVER_CODES)[number];
export type StatsCode = ClientCode | ServerCode;

/** The router's screen ids (src/web/src/router/routes.ts RouteName) + `boot` (before the router) + `worker`. */
export const SCREENS = [
  'boot',
  'home',
  'search',
  'routes',
  'trip',
  'journey',
  'guide',
  'share_start',
  'viewer',
  'help',
  'settings',
  'about',
  'welcome',
  'family',
  'family_edit',
  'setup_start',
  'setup',
  'setup_import',
  'places',
  'privacy',
  'not_found',
] as const;
export type ScreenId = (typeof SCREENS)[number] | 'worker';

export interface TelemetryRow {
  v: string;
  code: ClientCode;
  screen: (typeof SCREENS)[number];
  n: number;
}

/** Limits shared by the client batcher and the Worker validator. */
export const TELEMETRY = {
  /** Rows per report. */
  maxRows: 20,
  /** Largest count per row (a stuck error loop cannot inflate a row past this). */
  maxN: 1000,
  /** Report body limit (bytes). */
  maxBytes: 2048,
  /** Client: at most one report per 5 min ... */
  minIntervalMs: 5 * 60_000,
  /** ... and 20 per day. */
  maxPerDay: 20,
  /** Worker: rows are deleted after 90 days. */
  retentionDays: 90,
} as const;

export const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9a-z.]{1,16})?$/;

const ROW_KEYS = ['code', 'n', 'screen', 'v'];
const clientCodes = new Set<string>(CLIENT_CODES);
const screens = new Set<string>(SCREENS);

/**
 * Strict validator for a client report: an array of 1..maxRows rows, each with exactly the four keys,
 * known enums, a semver `v` and an integer `n` in 1..maxN. Returns null on ANY deviation (extra fields
 * included), so nothing unexpected is ever stored.
 */
export function parseTelemetry(body: unknown): TelemetryRow[] | null {
  if (!Array.isArray(body) || body.length < 1 || body.length > TELEMETRY.maxRows) return null;
  const out: TelemetryRow[] = [];
  for (const r of body) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const keys = Object.keys(r).sort();
    if (keys.length !== ROW_KEYS.length || keys.some((k, i) => k !== ROW_KEYS[i])) return null;
    const { v, code, screen, n } = r as Record<string, unknown>;
    if (typeof v !== 'string' || !VERSION_RE.test(v)) return null;
    if (typeof code !== 'string' || !clientCodes.has(code)) return null;
    if (typeof screen !== 'string' || !screens.has(screen)) return null;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > TELEMETRY.maxN) return null;
    out.push({ v, code: code as ClientCode, screen: screen as TelemetryRow['screen'], n });
  }
  return out;
}

/** Singapore (UTC+8, no DST) calendar day of an instant, `YYYY-MM-DD`. */
export const sgDay = (ms: number): string => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
