/**
 * M4 AC 40–41 (OQ1): caregiver setup box. A one-time, 24 h store for an AES-GCM ciphertext made in the
 * family member's browser. The key stays in the URL fragment (`/s/<code>#k=<key>`), which browsers never
 * send, so the Worker only ever sees ciphertext. One Durable Object per code.
 *
 * Privacy: the ciphertext and the code are never logged. After the single read the ciphertext is deleted
 * and only a content-free tombstone ({state, expiresAt}) is kept so the app can say "already used"; the
 * tombstone itself is deleted 7 days after expiry.
 */
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { HttpError, errorResponse, json, readJsonBody } from "./http";
import { checkLimit } from "./ratelimit";
import { newShareId } from "./share";

export const SETUP_TTL_MS = 24 * 3600_000;
export const SETUP_TOMBSTONE_MS = 7 * 24 * 3600_000;
/** Max ciphertext size in bytes (decoded). */
export const SETUP_MAX_BYTES = 4096;
/** IV (12) + GCM tag (16): anything shorter cannot be an AES-GCM message. */
export const SETUP_MIN_BYTES = 28;
export const SETUP_CODE_RE = /^[0-9A-Za-z]{12}$/;
/** base64url (no padding) of at most SETUP_MAX_BYTES. */
const CT_RE = /^[A-Za-z0-9_-]+$/;
const MAX_CT_CHARS = Math.ceil((SETUP_MAX_BYTES * 4) / 3);

interface Box {
  state: "stored" | "used" | "expired";
  expiresAt: number;
}

export type SetupResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string; message: string };

const fail = (status: number, code: string, message: string): SetupResult<never> => ({ ok: false, status, code, message });
const NOT_FOUND = () => fail(404, "setup_not_found", "This setup link does not exist.");
const USED = () => fail(410, "setup_used", "This setup link has already been used.");
const EXPIRED = () => fail(410, "setup_expired", "This setup link has expired.");

/** Decoded byte length of an unpadded base64url string, or -1 if it is not valid. */
export function base64urlBytes(ct: string): number {
  if (!CT_RE.test(ct) || ct.length % 4 === 1) return -1;
  return Math.floor((ct.length * 3) / 4);
}

export class SetupBox extends DurableObject<Env> {
  async put(input: { ct: string; expiresAt: number }): Promise<SetupResult> {
    if (await this.ctx.storage.get<Box>("box")) return fail(409, "setup_exists", "Please try again.");
    await this.ctx.storage.put({ box: { state: "stored", expiresAt: input.expiresAt } satisfies Box, ct: input.ct });
    await this.ctx.storage.setAlarm(input.expiresAt);
    return { ok: true, value: undefined };
  }

  /** Returns the ciphertext once, then deletes it. Single-threaded DO: two readers can never both get it. */
  async take(): Promise<SetupResult<{ ct: string; expiresAt: string }>> {
    const box = await this.ctx.storage.get<Box>("box");
    if (!box) return NOT_FOUND();
    if (box.state === "used") return USED();
    if (box.state === "expired" || Date.now() >= box.expiresAt) {
      if (box.state !== "expired") await this.expire(box);
      return EXPIRED();
    }
    const ct = await this.ctx.storage.get<string>("ct");
    if (typeof ct !== "string") return USED();
    await this.ctx.storage.delete("ct");
    await this.ctx.storage.put("box", { ...box, state: "used" } satisfies Box);
    return { ok: true, value: { ct, expiresAt: new Date(box.expiresAt).toISOString() } };
  }

  private async expire(box: Box): Promise<void> {
    await this.ctx.storage.delete("ct");
    await this.ctx.storage.put("box", { ...box, state: "expired" } satisfies Box);
    await this.ctx.storage.setAlarm(box.expiresAt + SETUP_TOMBSTONE_MS);
  }

  async alarm(): Promise<void> {
    const box = await this.ctx.storage.get<Box>("box");
    if (!box) return;
    const now = Date.now();
    if (now >= box.expiresAt + SETUP_TOMBSTONE_MS) {
      await this.ctx.storage.deleteAll();
      return;
    }
    if (now >= box.expiresAt) {
      // Used or not, the ciphertext must be gone at 24 h; keep only the content-free tombstone.
      if (box.state === "stored") await this.expire(box);
      else {
        await this.ctx.storage.delete("ct");
        await this.ctx.storage.setAlarm(box.expiresAt + SETUP_TOMBSTONE_MS);
      }
      return;
    }
    await this.ctx.storage.setAlarm(box.expiresAt);
  }
}

function stub(env: Env, code: string) {
  return env.SETUP_BOX.get(env.SETUP_BOX.idFromName(code));
}

function limited(wait: number | null): void {
  if (wait !== null) {
    throw new HttpError(429, "rate_limited", "Too many requests. Please wait a moment and try again.", { "Retry-After": String(wait) });
  }
}

/** POST /api/setup {ct} → 201 {code, expiresAt}. */
export async function handleCreateSetup(request: Request, env: Env): Promise<Response> {
  limited(await checkLimit("setupCreate", request.headers.get("CF-Connecting-IP")));
  const body = await readJsonBody(request, MAX_CT_CHARS + 64);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid_body", "The setup data is not valid.");
  const keys = Object.keys(body);
  // Only {ct}. Anything else (e.g. a key sent by a buggy client) is refused rather than stored.
  if (keys.length !== 1 || keys[0] !== "ct") throw new HttpError(400, "invalid_body", "Only the encrypted setup data may be sent.");
  const ct = (body as { ct: unknown }).ct;
  if (typeof ct !== "string") throw new HttpError(400, "invalid_ciphertext", "ct must be base64url text.");
  const n = base64urlBytes(ct);
  if (n < 0) throw new HttpError(400, "invalid_ciphertext", "ct must be base64url text without padding.");
  if (n > SETUP_MAX_BYTES) throw new HttpError(413, "payload_too_large", "The setup data is too large.");
  if (n < SETUP_MIN_BYTES) throw new HttpError(400, "invalid_ciphertext", "ct is too short to be encrypted data.");
  const expiresAt = Date.now() + SETUP_TTL_MS;
  for (let i = 0; i < 3; i++) {
    const code = newShareId(12);
    const r = await stub(env, code).put({ ct, expiresAt });
    if (r.ok) return json({ code, expiresAt: new Date(expiresAt).toISOString() }, 201, { "Cache-Control": "no-store" });
  }
  throw new HttpError(500, "internal_error", "Could not save the setup. Please try again.");
}

/** GET /api/setup/:code → 200 {ct, expiresAt} once; then 410 setup_used. */
export async function handleSetupByCode(request: Request, env: Env, code: string): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "method_not_allowed", "Method not allowed.");
  // Counted before the lookup so code guessing is limited whether or not the code exists.
  limited(await checkLimit("setupRead", request.headers.get("CF-Connecting-IP")));
  if (!SETUP_CODE_RE.test(code)) return errorResponse(404, "setup_not_found", "This setup link does not exist.");
  const r = await stub(env, code).take();
  if (!r.ok) return errorResponse(r.status, r.code, r.message, { "Cache-Control": "no-store" });
  return json(r.value, 200, { "Cache-Control": "no-store" });
}
