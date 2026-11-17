import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { inSingapore } from "./geo";
import { HttpError, errorResponse, json, readJsonBody } from "./http";

// ---------- helpers ----------
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const SHARE_ID_LENGTH = 12; // ~71 bits
export const SHARE_ID_RE = /^[0-9A-Za-z]{10,32}$/;
export const WRITE_INTERVAL_MS = 3000;
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

export function shareTtlMs(env: Env): number {
  const h = Number(env.SHARE_TTL_HOURS ?? "4");
  const hours = Number.isFinite(h) && h > 0 ? Math.min(24, Math.max(1, h)) : 4;
  return hours * 3600_000;
}

// ---------- validation ----------
export interface PositionUpdate {
  lat: number;
  lng: number;
  acc: number;
  heading: number | null;
  speed: number | null;
  etaISO: string | null;
  stepText: string | null;
  status: ShareStatus;
  updatedAt: string;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateUpdate(body: unknown): PositionUpdate {
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid_body", "The update is not valid.");
  const b = body as Record<string, unknown>;
  if (!isNum(b.lat) || !isNum(b.lng)) throw new HttpError(400, "invalid_coordinates", "lat and lng must be numbers.");
  if (!inSingapore(b.lat, b.lng)) throw new HttpError(400, "out_of_bounds", "The location must be in Singapore.");
  if (!isNum(b.acc) || b.acc < 0 || b.acc > 100_000) throw new HttpError(400, "invalid_accuracy", "acc must be metres (number).");
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
    lat: b.lat,
    lng: b.lng,
    acc: b.acc,
    heading,
    speed,
    etaISO,
    stepText,
    status: b.status as ShareStatus,
    updatedAt: new Date(updatedMs).toISOString(),
  };
}

// ---------- Durable Object ----------
interface Meta {
  destName: string;
  lang: string;
  ownerHash: string;
  createdAt: number;
  expiresAt: number;
  ended: boolean;
  arrivedAt: number | null;
}

export interface PublicState {
  destName: string;
  lang: string;
  status: ShareStatus | "waiting" | "ended";
  lat: number | null;
  lng: number | null;
  acc: number | null;
  heading: number | null;
  etaISO: string | null;
  stepText: string | null;
  updatedAt: string | null;
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

  private publicState(meta: Meta, pos: PositionUpdate | undefined): PublicState {
    return {
      destName: meta.destName,
      lang: meta.lang,
      status: meta.ended ? "ended" : (pos?.status ?? "waiting"),
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      acc: pos?.acc ?? null,
      heading: pos?.heading ?? null,
      etaISO: pos?.etaISO ?? null,
      stepText: pos?.stepText ?? null,
      updatedAt: pos?.updatedAt ?? null,
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

  async init(input: { destName: string; lang: string; ownerHash: string; expiresAt: number }): Promise<ShareResult> {
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
    if (now - last < WRITE_INTERVAL_MS) {
      return fail(429, "rate_limited", "Updates are too frequent.", Math.ceil((WRITE_INTERVAL_MS - (now - last)) / 1000));
    }
    // D-6: arrival schedules an automatic end 30 min later; leaving "arrived" cancels it.
    let nextMeta = meta;
    if (pos.status === "arrived" && meta.arrivedAt === null) nextMeta = { ...meta, arrivedAt: now };
    else if (pos.status !== "arrived" && meta.arrivedAt !== null) nextMeta = { ...meta, arrivedAt: null };
    const writes: Record<string, unknown> = { pos, lastWriteAt: now };
    if (nextMeta !== meta) writes.meta = nextMeta;
    await this.ctx.storage.put(writes);
    if (nextMeta !== meta) await this.ctx.storage.setAlarm(this.alarmTime(nextMeta));
    this.broadcast({ type: "state", state: this.publicState(nextMeta, pos) });
    return { ok: true, value: undefined };
  }

  private alarmTime(meta: Meta): number {
    return meta.arrivedAt === null ? meta.expiresAt : Math.min(meta.expiresAt, meta.arrivedAt + ARRIVED_GRACE_MS);
  }

  async get(): Promise<ShareResult<PublicState>> {
    const r = await this.live();
    if (!r.ok) return r;
    return { ok: true, value: this.publicState(r.value, await this.ctx.storage.get<PositionUpdate>("pos")) };
  }

  /** Ends the share: drops the position immediately, keeps a tombstone (no coordinates) until expiry. */
  private async endShare(meta: Meta): Promise<void> {
    const ended: Meta = { ...meta, ended: true };
    await this.ctx.storage.delete(["pos", "lastWriteAt"]);
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

export async function handleCreateShare(request: Request, env: Env): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  const destName = typeof body?.destName === "string" ? body.destName.trim() : "";
  if (!destName || destName.length > 120) throw new HttpError(400, "invalid_dest_name", "destName is required (max 120 characters).");
  const lang = body?.lang === undefined ? "zh" : body.lang;
  if (typeof lang !== "string" || !/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(lang)) throw new HttpError(400, "invalid_lang", "lang must be a language code like zh or en.");
  const ownerToken = newOwnerToken();
  const ownerHash = await sha256Hex(ownerToken);
  const expiresAt = Date.now() + shareTtlMs(env);
  for (let i = 0; i < 3; i++) {
    const id = newShareId();
    const r = await stub(env, id).init({ destName, lang, ownerHash, expiresAt });
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
    case "GET":
      return toResponse(await s.get(), 200);
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
