/**
 * M5 §I monitoring-lite (AC 38–39, OQ5 = Durable Object). Anonymous COUNTS only.
 *
 *  - `POST /api/telemetry` takes a client report (a JSON array of `{v, code, screen, n}`, validated by the
 *    shared `parseTelemetry`: extra fields, unknown codes/screens or bad counts → 400, nothing stored).
 *  - The Worker adds its own counts (`SERVER_CODES`: upstream 4xx/5xx/timeouts, token renewals, share
 *    creates/ends, rate-limit hits) through `bump()`, coalesced in isolate memory and flushed at most
 *    once a minute.
 *  - One `Stats` Durable Object (name "stats") keeps a SQLite table day × version × code × screen → n.
 *    The day is the Singapore day the row ARRIVES on (no client time is stored). Rows older than 90 days
 *    are deleted by a daily alarm (and on every write, cheaply).
 *  - `GET /api/stats?days=7` returns the table only with `Authorization: Bearer <STATS_TOKEN>`; without
 *    the secret, or with a wrong token, it is a plain 404 (the endpoint does not reveal itself).
 *
 * Privacy: the IP is used only for the existing in-memory rate limit (hashed, never stored, never
 * logged); nothing here is logged at all.
 */
import { DurableObject } from "cloudflare:workers";
import { SERVER_CODES, TELEMETRY, VERSION_RE, parseTelemetry, sgDay, type ServerCode, type TelemetryRow } from "@howtogo/shared/telemetry";
import type { Env } from "./env";
import { HttpError, errorResponse, json, readJsonBody } from "./http";
import { checkLimit } from "./ratelimit";

export const STATS_NAME = "stats";
const DAY_MS = 24 * 3600_000;
/** Distinct versions accepted per day (a bogus-version flood cannot grow the table). */
export const MAX_VERSIONS_PER_DAY = 12;
/** Hard cap on rows per day (all codes × screens × versions fit well below it). */
export const MAX_ROWS_PER_DAY = 4000;
/** Server-side counts are flushed to the DO at most this often per isolate. */
export const SERVER_FLUSH_MS = 60_000;

export interface StatsRow {
  day: string;
  v: string;
  code: string;
  screen: string;
  n: number;
}

export class Stats extends DurableObject<Env> {
  private ready = false;

  private init(): void {
    if (this.ready) return;
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, v TEXT NOT NULL, code TEXT NOT NULL, screen TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, v, code, screen))",
    );
    this.ready = true;
  }

  /** Adds rows under today's Singapore day. Returns the number of rows accepted. */
  async add(rows: { v: string; code: string; screen: string; n: number }[], now = Date.now()): Promise<number> {
    this.init();
    const sql = this.ctx.storage.sql;
    const day = sgDay(now);
    this.prune(now);
    const versions = new Set(sql.exec<{ v: string }>("SELECT DISTINCT v FROM counts WHERE day = ?", day).toArray().map((r) => r.v));
    let total = sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM counts WHERE day = ?", day).one().c;
    let accepted = 0;
    for (const r of rows) {
      if (!versions.has(r.v)) {
        if (versions.size >= MAX_VERSIONS_PER_DAY) continue;
        versions.add(r.v);
      }
      const exists = sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM counts WHERE day = ? AND v = ? AND code = ? AND screen = ?", day, r.v, r.code, r.screen).one().c > 0;
      if (!exists && total >= MAX_ROWS_PER_DAY) continue;
      sql.exec(
        "INSERT INTO counts (day, v, code, screen, n) VALUES (?, ?, ?, ?, ?) ON CONFLICT (day, v, code, screen) DO UPDATE SET n = MIN(n + excluded.n, 1000000000)",
        day,
        r.v,
        r.code,
        r.screen,
        r.n,
      );
      if (!exists) total++;
      accepted++;
    }
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + DAY_MS);
    return accepted;
  }

  /** The table for the last `days` Singapore days (today included), newest first. */
  async table(days: number, now = Date.now()): Promise<StatsRow[]> {
    this.init();
    this.prune(now);
    const from = sgDay(now - (days - 1) * DAY_MS);
    return this.ctx.storage.sql
      .exec<{ day: string; v: string; code: string; screen: string; n: number }>(
        "SELECT day, v, code, screen, n FROM counts WHERE day >= ? ORDER BY day DESC, code, screen, v",
        from,
      )
      .toArray()
      .map((r) => ({ day: r.day, v: r.v, code: r.code, screen: r.screen, n: r.n }));
  }

  /** Test hook: every stored day. */
  async days(): Promise<string[]> {
    this.init();
    return this.ctx.storage.sql.exec<{ day: string }>("SELECT DISTINCT day FROM counts ORDER BY day").toArray().map((r) => r.day);
  }

  /** Test hook: write a row under an explicit day (retention tests). */
  async addOn(day: string, row: { v: string; code: string; screen: string; n: number }): Promise<void> {
    this.init();
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO counts (day, v, code, screen, n) VALUES (?, ?, ?, ?, ?)", day, row.v, row.code, row.screen, row.n);
  }

  /** Deletes rows older than the retention window (90 days, today counted as day 1). */
  prune(now = Date.now()): number {
    this.init();
    const cutoff = sgDay(now - (TELEMETRY.retentionDays - 1) * DAY_MS);
    return this.ctx.storage.sql.exec("DELETE FROM counts WHERE day < ?", cutoff).rowsWritten;
  }

  async alarm(): Promise<void> {
    this.prune();
    const any = this.ctx.storage.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM counts").one().c;
    if (any > 0) await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
  }
}

function stub(env: Env) {
  return env.STATS.get(env.STATS.idFromName(STATS_NAME));
}

/** `POST /api/telemetry`. 204 on success; 400 on any schema deviation; 429 over the per-IP limit. */
export async function handleTelemetry(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return errorResponse(405, "method_not_allowed", "Method not allowed.");
  const wait = await checkLimit("telemetry", request.headers.get("CF-Connecting-IP"));
  if (wait !== null) return errorResponse(429, "rate_limited", "Too many requests.", { "Retry-After": String(wait) });
  const body = await readJsonBody(request, TELEMETRY.maxBytes);
  const rows = parseTelemetry(body);
  if (!rows) throw new HttpError(400, "invalid_telemetry", "Invalid report.");
  await stub(env).add(rows satisfies TelemetryRow[]);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/** Constant-time string comparison (token check). */
function sameToken(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** `GET /api/stats?days=N` (1..90, default 7). 404 unless STATS_TOKEN is set and presented as a Bearer token. */
export async function handleStats(request: Request, url: URL, env: Env): Promise<Response> {
  const notFound = () => errorResponse(404, "not_found", "Not found.");
  const token = env.STATS_TOKEN;
  const auth = request.headers.get("Authorization") ?? "";
  const given = /^Bearer (.+)$/.exec(auth)?.[1] ?? "";
  if (!token || token.length < 16 || !given || !sameToken(given, token)) return notFound();
  if (request.method !== "GET") return errorResponse(405, "method_not_allowed", "Method not allowed.");
  const raw = Number(url.searchParams.get("days") ?? "7");
  const days = Number.isInteger(raw) ? Math.min(TELEMETRY.retentionDays, Math.max(1, raw)) : 7;
  const rows = await stub(env).table(days);
  return json({ days, rows }, 200, { "Cache-Control": "no-store" });
}

// ---------------------------------------------------------------------------------------------
// Server-side counts (AC 39): coalesced per isolate, flushed at most once per SERVER_FLUSH_MS.
const pending = new Map<ServerCode, number>();
let lastFlush = 0;
const serverCodes = new Set<string>(SERVER_CODES);

/** The Worker's own version label for server rows (`v`). */
export function serverVersion(v: string): string {
  return VERSION_RE.test(v) ? v : "0.0.0";
}

/** Counts one server-side event in isolate memory (no I/O; see flushStats). */
export function bump(code: ServerCode): void {
  if (!serverCodes.has(code)) return;
  pending.set(code, Math.min((pending.get(code) ?? 0) + 1, TELEMETRY.maxN));
}

/**
 * Flushes the coalesced server counts to the Stats DO through `ctx.waitUntil` when there are any and the
 * last flush is older than SERVER_FLUSH_MS. Never blocks the response; a failed write is dropped.
 */
export function flushStats(env: Env, ctx: ExecutionContext, version: string, now = Date.now()): boolean {
  if (!pending.size || !env.STATS || now - lastFlush < SERVER_FLUSH_MS) return false;
  lastFlush = now;
  const rows = [...pending].map(([c, n]) => ({ v: serverVersion(version), code: c, screen: "worker", n }));
  pending.clear();
  ctx.waitUntil(stub(env).add(rows).then(() => undefined, () => undefined));
  return true;
}

/** Test hooks. */
export function pendingServerCounts(): Record<string, number> {
  return Object.fromEntries(pending);
}
export function resetServerCounts(): void {
  pending.clear();
  lastFlush = 0;
}
