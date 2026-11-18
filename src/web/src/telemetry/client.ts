/**
 * M5 §I monitoring-lite, client side (AC 38, 40). Anonymous error COUNTS, nothing else.
 *
 *  - Counts come from the app's own log lines (`onLog`) and from `error` / `unhandledrejection`; each maps to a
 *    fixed code (shared CLIENT_CODES) and the current router screen id. No message, stack, URL, UA,
 *    coordinates, place names, ids or timestamps are ever read or kept.
 *  - Pending counts live in `howtogo.telemetry.v1` ({ day, sent, lastAt, rows }) so they survive a reload.
 *  - A report is the shared row array `[{v, code, screen, n}]`, at most one per 5 min and 20 per Singapore day,
 *    sent with `fetch(keepalive)` when due and with `sendBeacon` when the page is hidden.
 *  - Off (Settings switch `settings.errorCounts`, UI round) = nothing is counted or sent and pending rows are
 *    dropped. The family page (viewer entry) never loads this module.
 *  - Under automation (`navigator.webdriver`) it stays off unless the tab sets `?telemetry=1`
 *    (sessionStorage `telemetry.force`), so e2e request budgets are not disturbed while QA can still assert the
 *    payload (Testability: "only v, code, screen, n").
 * Log hook: `telemetry:sent <rows>` / `telemetry:dropped` (counts only).
 */
import { TELEMETRY, sgDay, type ClientCode, type TelemetryRow } from '@howtogo/shared/telemetry';
import { log, onLog } from '../log';
import { readJSON, writeJSON, type KV } from '../state/storage';

export const TELEMETRY_KEY = 'telemetry.v1';

interface Stored {
  day: string;
  sent: number;
  lastAt: number;
  rows: TelemetryRow[];
}

/** Log line → error code (exported for tests). Lines carry no identifiers; only the code is kept. */
export function codeForLine(line: string): ClientCode | null {
  if (/^chunk:failed$/.test(line)) return 'chunk_load';
  if (/^sw:failed$/.test(line)) return 'sw_install';
  if (/^loc:unavailable$/.test(line)) return 'geo_unavailable';
  if (/^state:no-voice$/.test(line)) return 'speech_unavailable';
  const api = /^api:[a-z-]+ (\S+)$/.exec(line);
  if (api) {
    const s = api[1]!;
    if (s === 'timeout') return 'api_timeout';
    if (s === '429') return 'api_429';
    if (s === '503') return 'api_503';
    if (/^5\d\d$/.test(s)) return 'api_5xx';
  }
  return null;
}

export type Screen = TelemetryRow['screen'];

export interface TelemetryDeps {
  kv: KV;
  version: string;
  /** Counting/sending allowed now (settings.errorCounts, live mode, not automation unless forced). */
  enabled: () => boolean;
  /** Current router screen id. */
  screen: () => Screen;
  now?: () => number;
  /** POST the rows; resolves true on a 2xx. */
  send: (rows: TelemetryRow[]) => Promise<boolean>;
  /** sendBeacon the rows (page hide); returns whether the browser queued it. */
  beacon?: (rows: TelemetryRow[]) => boolean;
}

export function createTelemetry(d: TelemetryDeps) {
  const now = d.now ?? Date.now;
  const empty = (): Stored => ({ day: sgDay(now()), sent: 0, lastAt: 0, rows: [] });
  const load = (): Stored => {
    const s = readJSON<Stored | null>(d.kv, TELEMETRY_KEY, null, (v): v is Stored => !!v && typeof v === 'object' && Array.isArray((v as Stored).rows));
    if (!s) return empty();
    // A new day resets the daily budget (pending rows are kept).
    return s.day === sgDay(now()) ? s : { ...s, day: sgDay(now()), sent: 0 };
  };
  const save = (s: Stored) => writeJSON(d.kv, TELEMETRY_KEY, s.rows.length || s.sent ? s : null);
  let inFlight = false;

  function count(code: ClientCode, screen: Screen = d.screen()): void {
    if (!d.enabled()) return;
    const s = load();
    const row = s.rows.find((r) => r.code === code && r.screen === screen && r.v === d.version);
    if (row) row.n = Math.min(TELEMETRY.maxN, row.n + 1);
    else if (s.rows.length < 50) s.rows.push({ v: d.version, code, screen, n: 1 });
    save(s);
  }

  /** May a report go out now? */
  function due(s: Stored): boolean {
    return s.rows.length > 0 && s.sent < TELEMETRY.maxPerDay && now() - s.lastAt >= TELEMETRY.minIntervalMs;
  }

  function take(s: Stored): TelemetryRow[] {
    return s.rows.slice(0, TELEMETRY.maxRows).map(({ v, code, screen, n }) => ({ v, code, screen, n }));
  }

  function commit(s: Stored, sentRows: number): void {
    s.rows = s.rows.slice(sentRows);
    s.sent += 1;
    s.lastAt = now();
    save(s);
    log(`telemetry:sent ${sentRows}`);
  }

  /** Sends one report when due. `beacon: true` (page hide) uses sendBeacon. */
  async function flush(opts: { beacon?: boolean } = {}): Promise<boolean> {
    if (!d.enabled()) {
      if (d.kv.get(TELEMETRY_KEY) !== null) {
        d.kv.remove(TELEMETRY_KEY);
        log('telemetry:dropped');
      }
      return false;
    }
    const s = load();
    if (!due(s) || inFlight) return false;
    const rows = take(s);
    if (opts.beacon && d.beacon) {
      if (!d.beacon(rows)) return false;
      commit(s, rows.length);
      return true;
    }
    inFlight = true;
    try {
      const ok = await d.send(rows).catch(() => false);
      if (ok) commit(load(), rows.length);
      else save({ ...load(), lastAt: now() }); // back off a full interval after a failure
      return ok;
    } finally {
      inFlight = false;
    }
  }

  /** Wires the log observer, global error listeners, page-hide beacon and a 5-minute check. Returns a disposer. */
  function install(win: Window & typeof globalThis = window): () => void {
    const offLog = onLog((line) => {
      const c = codeForLine(line);
      if (c) count(c);
    });
    const onError = () => count('err_uncaught');
    const onRejection = () => count('err_rejection');
    const onHide = () => {
      if (win.document.visibilityState === 'hidden') void flush({ beacon: true });
    };
    win.addEventListener('error', onError);
    win.addEventListener('unhandledrejection', onRejection);
    win.document.addEventListener('visibilitychange', onHide);
    const timer = win.setInterval(() => void flush(), 60_000);
    return () => {
      offLog();
      win.removeEventListener('error', onError);
      win.removeEventListener('unhandledrejection', onRejection);
      win.document.removeEventListener('visibilitychange', onHide);
      win.clearInterval(timer);
    };
  }

  return { count, flush, install, pending: () => load().rows };
}

export type Telemetry = ReturnType<typeof createTelemetry>;

/** Browser transport for `${base}/api/telemetry` (same origin in the PWA). */
export function httpTransport(base: string) {
  const url = `${base.replace(/\/+$/, '')}/api/telemetry`;
  const body = (rows: TelemetryRow[]) => JSON.stringify(rows);
  return {
    send: async (rows: TelemetryRow[]) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(rows), keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer' });
      return r.ok;
    },
    beacon: (rows: TelemetryRow[]) => {
      try {
        return navigator.sendBeacon?.(url, new Blob([body(rows)], { type: 'application/json' })) ?? false;
      } catch {
        return false;
      }
    },
  };
}
