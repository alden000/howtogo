import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { inSingapore } from "./geo";
import { HttpError, errorResponse, json, readJsonBody } from "./http";
import { checkLimit } from "./ratelimit";

// ---------- helpers ----------
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const SHARE_ID_LENGTH = 12; // ~71 bits
export const SHARE_ID_RE = /^[0-9A-Za-z]{10,32}$/;
export const WRITE_INTERVAL_MS = 3000;
/** D-7 / M4 AC 13: a `help` write skips the 3 s limit but is capped at one per second. */
export const HELP_INTERVAL_MS = 1000;
export const ARRIVED_GRACE_MS = 30 * 60 * 1000;
export const MAX_VIEWERS = 50;
export const STATUSES = ["travelling", "arrived", "paused", "help"] as const;
export type ShareStatus = (typeof STATUSES)[number];

/** Unbiased base62 id via rejection sampling. */
export function newShareId(length = SHARE_ID_LENGTH): string {
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < 248 && out.length < length) out += BASE62[b % 62];
    }
  }
  return out;
}

export function newOwnerToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * M4 OQ6: SHARE_TEST_TTL_SECONDS (1..86400) is honoured ONLY when ENVIRONMENT is "test", which is set
 * solely in wrangler.toml's [env.test] block (test/config.test.ts fails if either leaks into production).
 */
export function shareTtlMs(env: Env): number {
  if (env.ENVIRONMENT === "test" && env.SHARE_TEST_TTL_SECONDS) {
    const s = Number(env.SHARE_TEST_TTL_SECONDS);
    if (Number.isInteger(s) && s >= 1 && s <= 86_400) return s * 1000;
  }
  const h = Number(env.SHARE_TTL_HOURS ?? "4");
  const hours = Number.isFinite(h) && h > 0 ? Math.min(24, Math.max(1, h)) : 4;
  return hours * 3600_000;
}

// ---------- validation ----------
/** A validated PUT body. lat/lng/acc are all null when the update carries no position (M4 AC 8, AC 35). */
export interface PositionUpdate {
  lat: number | null;
  lng: number | null;
  acc: number | null;
  heading: number | null;
  speed: number | null;
  etaISO: string | null;
  stepText: string | null;
  /** Structured step (viewer review ruling): the viewer renders §6e.2 templates from it. */
  step: ShareStep | null;
  status: ShareStatus;
  updatedAt: string;
}

export const STEP_KINDS = ["walk", "wait", "bus", "train"] as const;
export interface ShareStep {
  k: (typeof STEP_KINDS)[number];
  svc?: string;
  line?: string;
  stops?: number;
  place?: string;
  stop?: string;
  station?: string;
  towards?: string;
}
const STEP_TEXT_FIELDS: Record<string, number> = { svc: 8, line: 4, place: 80, stop: 80, station: 80, towards: 80 };

/** `step` is optional; unknown keys are refused so the stored shape stays exactly the contract. */
export function validateStep(v: unknown): ShareStep | null {
  if (v === undefined || v === null) return null;
  const bad = () => new HttpError(400, "invalid_step", "step is not valid.");
  if (typeof v !== "object" || Array.isArray(v)) throw bad();
  const o = v as Record<string, unknown>;
  if (typeof o.k !== "string" || !(STEP_KINDS as readonly string[]).includes(o.k)) throw bad();
  const out: ShareStep = { k: o.k as ShareStep["k"] };
  for (const [key, val] of Object.entries(o)) {
    if (key === "k") continue;
    if (key === "stops") {
      if (!Number.isInteger(val) || (val as number) < 0 || (val as number) > 200) throw bad();
      out.stops = val as number;
      continue;
    }
    const max = STEP_TEXT_FIELDS[key];
    if (max === undefined || typeof val !== "string" || val.length === 0 || val.length > max) throw bad();
    (out as unknown as Record<string, string>)[key] = val;
  }
  return out;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateUpdate(body: unknown): PositionUpdate {
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid_body", "The update is not valid.");
  const b = body as Record<string, unknown>;
  const absent = (v: unknown) => v === undefined || v === null;
  const hasPosition = !(absent(b.lat) && absent(b.lng));
  if (hasPosition) {
    if (!isNum(b.lat) || !isNum(b.lng)) throw new HttpError(400, "invalid_coordinates", "lat and lng must be numbers.");
    if (!inSingapore(b.lat, b.lng)) throw new HttpError(400, "out_of_bounds", "The location must be in Singapore.");
    if (!isNum(b.acc) || b.acc < 0 || b.acc > 100_000) throw new HttpError(400, "invalid_accuracy", "acc must be metres (number).");
  }
  const opt = (k: string, ok: (v: number) => boolean): number | null => {
    const v = b[k];
    if (v === undefined || v === null) return null;
    if (!isNum(v) || !ok(v)) throw new HttpError(400, `invalid_${k}`, `${k} is not valid.`);
    return v;
  };
  const heading = opt("heading", (v) => v >= 0 && v <= 360);
  const speed = opt("speed", (v) => v >= 0 && v < 100);
  let etaISO: string | null = null;
  if (b.etaISO !== undefined && b.etaISO !== null) {
    if (typeof b.etaISO !== "string" || b.etaISO.length > 40 || !Number.isFinite(Date.parse(b.etaISO))) {
      throw new HttpError(400, "invalid_eta", "etaISO must be an ISO date-time.");
    }
    etaISO = new Date(Date.parse(b.etaISO)).toISOString();
  }
  let stepText: string | null = null;
  if (b.stepText !== undefined && b.stepText !== null) {
    if (typeof b.stepText !== "string" || b.stepText.length > 280) throw new HttpError(400, "invalid_step_text", "stepText is too long.");
    stepText = b.stepText;
  }
  const step = validateStep(b.step);
  if (typeof b.status !== "string" || !(STATUSES as readonly string[]).includes(b.status)) {
    throw new HttpError(400, "invalid_status", "status must be travelling, arrived, paused or help.");
  }
  let updatedMs: number;
  if (isNum(b.updatedAt)) updatedMs = b.updatedAt;
  else if (typeof b.updatedAt === "string" && Number.isFinite(Date.parse(b.updatedAt))) updatedMs = Date.parse(b.updatedAt);
  else throw new HttpError(400, "invalid_updated_at", "updatedAt must be epoch ms or an ISO date-time.");
  // Never trust a client clock that is in the future.
  updatedMs = Math.min(updatedMs, Date.now());
  return {
    lat: hasPosition ? (b.lat as number) : null,
    lng: hasPosition ? (b.lng as number) : null,
    acc: hasPosition ? (b.acc as number) : null,
    heading: hasPosition ? heading : null,
    speed: hasPosition ? speed : null,
    etaISO,
    stepText,
    step,
    status: b.status as ShareStatus,
    updatedAt: new Date(updatedMs).toISOString(),
  };
}

// ---------- Durable Object ----------
interface Meta {
  destName: string;
  lang: string;
  /** M4 AC 18: how the family calls the sender ("妈妈"); null if not given. */
  senderName: string | null;
  /** M4 OQ3: the sender's own phone (E.164), only if she allowed it; removed when the share ends. */
  senderPhone: string | null;
  ownerHash: string;
  createdAt: number;
  expiresAt: number;
  ended: boolean;
  arrivedAt: number | null;
}

/** What is stored under "pos": the last update plus server-derived times. */
interface StoredPos extends PositionUpdate {
  /** updatedAt of the last update that carried a position; null if none yet. */
  positionAt: string | null;
  /** When the current help episode started (server time); null when status is not help. */
  helpAt: string | null;
}

export interface PublicState {
  destName: string;
  lang: string;
  senderName: string | null;
  senderPhone: string | null;
  status: ShareStatus | "waiting" | "ended";
  lat: number | null;
  lng: number | null;
  acc: number | null;
  heading: number | null;
  etaISO: string | null;
  stepText: string | null;
  step: ShareStep | null;
  updatedAt: string | null;
  positionAt: string | null;
  helpAt: string | null;
  expiresAt: string;
}

export type ShareResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

const fail = (status: number, code: string, message: string, retryAfter?: number): ShareResult<never> => ({
  ok: false,
  status,
  code,
  message,
  retryAfter,
});

const NOT_FOUND = () => fail(404, "share_not_found", "This shared trip does not exist.");
const EXPIRED = () => fail(410, "share_expired", "This shared trip has expired.");
const ENDED = () => fail(410, "share_ended", "This shared trip has ended.");

export class TripShare extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private async meta(): Promise<Meta | undefined> {
    return this.ctx.storage.get<Meta>("meta");
  }

  /** Returns meta if live; handles lazy expiry. */
  private async live(): Promise<ShareResult<Meta>> {
    const meta = await this.meta();
    if (!meta) return NOT_FOUND();
    if (Date.now() >= meta.expiresAt) {
      await this.wipe("expired");
      return EXPIRED();
    }
    if (meta.ended) return ENDED();
    return { ok: true, value: meta };
  }

  private publicState(meta: Meta, pos: StoredPos | undefined): PublicState {
    return {
      destName: meta.destName,
      lang: meta.lang,
      senderName: meta.senderName,
      senderPhone: meta.ended ? null : meta.senderPhone,
      status: meta.ended ? "ended" : (pos?.status ?? "waiting"),
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      acc: pos?.acc ?? null,
      heading: pos?.heading ?? null,
      etaISO: pos?.etaISO ?? null,
      stepText: pos?.stepText ?? null,
      step: pos?.step ?? null,
      updatedAt: pos?.updatedAt ?? null,
      positionAt: pos?.positionAt ?? null,
      helpAt: pos?.helpAt ?? null,
      expiresAt: new Date(meta.expiresAt).toISOString(),
    };
  }

  private broadcast(message: unknown): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        /* socket already gone */
      }
    }
  }

  private closeAll(reason: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, reason);
      } catch {
        /* ignore */
      }
    }
  }

  private async wipe(reason: "expired" | "ended"): Promise<void> {
    this.broadcast({ type: reason });
    this.closeAll(reason);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private async authorize(ownerHash: string): Promise<ShareResult<Meta>> {
    const r = await this.live();
    if (!r.ok) return r;
    if (!timingSafeEqualHex(r.value.ownerHash, ownerHash)) {
      return fail(403, "forbidden", "You are not allowed to change this shared trip.");
    }
    return r;
  }

  async init(input: {
    destName: string;
    lang: string;
    senderName: string | null;
    senderPhone: string | null;
    ownerHash: string;
    expiresAt: number;
  }): Promise<ShareResult> {
    if (await this.meta()) return fail(409, "share_exists", "Please try again.");
    const meta: Meta = { ...input, createdAt: Date.now(), ended: false, arrivedAt: null };
    await this.ctx.storage.put("meta", meta);
    await this.ctx.storage.setAlarm(meta.expiresAt);
    return { ok: true, value: undefined };
  }

  async update(ownerHash: string, pos: PositionUpdate): Promise<ShareResult> {
    const r = await this.authorize(ownerHash);
    if (!r.ok) return r;
    const meta = r.value;
    const now = Date.now();
    const last = (await this.ctx.storage.get<number>("lastWriteAt")) ?? 0;
    // D-7: safety beats rate limits. "help" bypasses the 3 s limit, capped at 1 help write per second.
    const minGap = pos.status === "help" ? HELP_INTERVAL_MS : WRITE_INTERVAL_MS;
    const lastGate = pos.status === "help" ? ((await this.ctx.storage.get<number>("lastHelpAt")) ?? 0) : last;
    if (now - lastGate < minGap) {
      return fail(429, "rate_limited", "Updates are too frequent.", Math.max(1, Math.ceil((minGap - (now - lastGate)) / 1000)));
    }
    const prev = await this.ctx.storage.get<StoredPos>("pos");
    const stored: StoredPos =
      pos.lat === null && prev && prev.lat !== null
        ? // No fix in this update: keep the last known position (e.g. "paused" from a hidden page).
          { ...pos, lat: prev.lat, lng: prev.lng, acc: prev.acc, heading: prev.heading, speed: prev.speed, positionAt: prev.positionAt, helpAt: null }
        : { ...pos, positionAt: pos.lat === null ? null : pos.updatedAt, helpAt: null };
    if (pos.status === "help") stored.helpAt = prev?.status === "help" && prev.helpAt ? prev.helpAt : new Date(now).toISOString();
    // D-6: arrival schedules an automatic end 30 min later; leaving "arrived" cancels it.
    let nextMeta = meta;
    if (pos.status === "arrived" && meta.arrivedAt === null) nextMeta = { ...meta, arrivedAt: now };
    else if (pos.status !== "arrived" && meta.arrivedAt !== null) nextMeta = { ...meta, arrivedAt: null };
    const writes: Record<string, unknown> = { pos: stored, lastWriteAt: now };
    if (pos.status === "help") writes.lastHelpAt = now;
    if (nextMeta !== meta) writes.meta = nextMeta;
    await this.ctx.storage.put(writes);
    if (nextMeta !== meta) await this.ctx.storage.setAlarm(this.alarmTime(nextMeta));
    this.broadcast({ type: "state", state: this.publicState(nextMeta, stored) });
    return { ok: true, value: undefined };
  }

  private alarmTime(meta: Meta): number {
    return meta.arrivedAt === null ? meta.expiresAt : Math.min(meta.expiresAt, meta.arrivedAt + ARRIVED_GRACE_MS);
  }

  async get(): Promise<ShareResult<PublicState>> {
    const r = await this.live();
    if (!r.ok) return r;
    return { ok: true, value: this.publicState(r.value, await this.ctx.storage.get<StoredPos>("pos")) };
  }

  /** Ends the share: drops the position immediately, keeps a tombstone (no coordinates) until expiry. */
  private async endShare(meta: Meta): Promise<void> {
    // M4 AC 48 / OQ3: the position and the sender's phone go now; the tombstone keeps neither.
    const ended: Meta = { ...meta, ended: true, senderPhone: null };
    await this.ctx.storage.delete(["pos", "lastWriteAt", "lastHelpAt"]);
    await this.ctx.storage.put("meta", ended);
    await this.ctx.storage.setAlarm(ended.expiresAt);
    this.broadcast({ type: "state", state: this.publicState(ended, undefined) });
    this.closeAll("ended");
  }

  async end(ownerHash: string): Promise<ShareResult> {
    const r = await this.authorize(ownerHash);
    if (!r.ok) return r;
    await this.endShare(r.value);
    return { ok: true, value: undefined };
  }

  async alarm(): Promise<void> {
    const meta = await this.meta();
    if (!meta) return;
    const now = Date.now();
    if (now >= meta.expiresAt) {
      await this.wipe("expired");
      return;
    }
    if (!meta.ended && meta.arrivedAt !== null && now >= meta.arrivedAt + ARRIVED_GRACE_MS) {
      await this.endShare(meta);
      return;
    }
    // Fired early (e.g. clock skew): re-arm.
    await this.ctx.storage.setAlarm(meta.ended ? meta.expiresAt : this.alarmTime(meta));
  }

  /** WebSocket upgrade for viewers (hibernation API). */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      // QA-43 (M4 AC 25): a refused upgrade hides its status from the browser's WebSocket API, so a plain
      // GET here tells the viewer page whether the share is full (429) before the usual 426.
      if (this.ctx.getWebSockets().length >= MAX_VIEWERS) {
        return errorResponse(429, "too_many_viewers", "Too many people are following this trip.");
      }
      return errorResponse(426, "upgrade_required", "Use a WebSocket to follow this trip live.");
    }
    const r = await this.get();
    if (!r.ok) return errorResponse(r.status, r.code, r.message);
    if (this.ctx.getWebSockets().length >= MAX_VIEWERS) {
      return errorResponse(429, "too_many_viewers", "Too many people are following this trip.");
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "state", state: r.value }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(): Promise<void> {
    /* viewers are read-only; "ping" is answered by the auto-response */
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      /* ignore */
    }
  }
}

// ---------- HTTP handlers ----------
function toResponse(r: ShareResult<unknown>, okStatus = 204): Response {
  if (r.ok) return okStatus === 204 ? new Response(null, { status: 204 }) : json(r.value, okStatus, { "Cache-Control": "no-store" });
  return errorResponse(r.status, r.code, r.message, r.retryAfter ? { "Retry-After": String(r.retryAfter) } : {});
}

async function ownerHashFrom(request: Request): Promise<string> {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get("Authorization") ?? "");
  if (!m) throw new HttpError(401, "unauthorized", "Missing owner token.");
  return sha256Hex(m[1]!);
}

function stub(env: Env, id: string) {
  return env.TRIP_SHARE.get(env.TRIP_SHARE.idFromName(id));
}

function rateLimited(wait: number): never {
  throw new HttpError(429, "rate_limited", "Too many requests. Please wait a moment and try again.", { "Retry-After": String(wait) });
}

/** E.164: "+" then 7–15 digits, no leading 0. */
export const E164 = /^\+[1-9]\d{6,14}$/;

export async function handleCreateShare(request: Request, env: Env): Promise<Response> {
  const wait = await checkLimit("shareCreate", request.headers.get("CF-Connecting-IP"));
  if (wait !== null) rateLimited(wait);
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  const destName = typeof body?.destName === "string" ? body.destName.trim() : "";
  if (!destName || destName.length > 120) throw new HttpError(400, "invalid_dest_name", "destName is required (max 120 characters).");
  const lang = body?.lang === undefined ? "zh" : body.lang;
  if (typeof lang !== "string" || !/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(lang)) throw new HttpError(400, "invalid_lang", "lang must be a language code like zh or en.");
  let senderName: string | null = null;
  if (body?.senderName !== undefined && body.senderName !== null) {
    if (typeof body.senderName !== "string" || !body.senderName.trim() || body.senderName.trim().length > 40) {
      throw new HttpError(400, "invalid_sender_name", "senderName must be 1 to 40 characters.");
    }
    senderName = body.senderName.trim();
  }
  let senderPhone: string | null = null;
  if (body?.senderPhone !== undefined && body.senderPhone !== null) {
    if (typeof body.senderPhone !== "string" || !E164.test(body.senderPhone)) {
      throw new HttpError(400, "invalid_sender_phone", "senderPhone must be in international format, like +6591234567.");
    }
    senderPhone = body.senderPhone;
  }
  const ownerToken = newOwnerToken();
  const ownerHash = await sha256Hex(ownerToken);
  const expiresAt = Date.now() + shareTtlMs(env);
  for (let i = 0; i < 3; i++) {
    const id = newShareId();
    const r = await stub(env, id).init({ destName, lang, senderName, senderPhone, ownerHash, expiresAt });
    if (r.ok) {
      return json(
        { id, ownerToken, viewPath: `/t/${id}`, expiresAt: new Date(expiresAt).toISOString() },
        201,
        { "Cache-Control": "no-store" },
      );
    }
  }
  throw new HttpError(500, "internal_error", "Could not create the share. Please try again.");
}

export async function handleShareById(request: Request, env: Env, id: string, sub: string | undefined): Promise<Response> {
  if (!SHARE_ID_RE.test(id)) return errorResponse(404, "share_not_found", "This shared trip does not exist.");
  const s = stub(env, id);
  if (sub === "live") {
    if (request.method !== "GET") return errorResponse(405, "method_not_allowed", "Method not allowed.");
    return s.fetch(request);
  }
  if (sub !== undefined) return errorResponse(404, "not_found", "Not found.");
  switch (request.method) {
    case "GET": {
      // M4 AC 47: viewer polling, 1 per 5 s per IP per share (the WebSocket above is not counted).
      const wait = await checkLimit("shareView", request.headers.get("CF-Connecting-IP"), Date.now(), id);
      if (wait !== null) rateLimited(wait);
      return toResponse(await s.get(), 200);
    }
    case "PUT": {
      const hash = await ownerHashFrom(request);
      const update = validateUpdate(await readJsonBody(request));
      return toResponse(await s.update(hash, update));
    }
    case "DELETE": {
      const hash = await ownerHashFrom(request);
      return toResponse(await s.end(hash));
    }
    default:
      return errorResponse(405, "method_not_allowed", "Method not allowed.");
  }
}
