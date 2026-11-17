/** M4 AC 40–41, 44, 47 (setup limits), 49: the caregiver setup box. */
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimit } from "../src/ratelimit";
import { SETUP_MAX_BYTES, SETUP_TOMBSTONE_MS, SETUP_TTL_MS, base64urlBytes, type SetupBox } from "../src/setup";
import { ORIGIN, call } from "./helpers";

beforeEach(() => resetRateLimit());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** What the /setup page does: AES-GCM-256 with a random key; ct = base64url(iv ‖ ciphertext). The key stays local. */
async function encrypt(plain: unknown) {
  const key = (await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])) as CryptoKey;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(plain))));
  const all = new Uint8Array(iv.length + ct.length);
  all.set(iv);
  all.set(ct, iv.length);
  const raw = new Uint8Array((await crypto.subtle.exportKey("raw", key)) as ArrayBuffer);
  return { ct: b64url(all), key, keyText: b64url(raw) };
}
async function decrypt(ct: string, key: CryptoKey) {
  const bin = Uint8Array.from(atob(ct.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bin.slice(0, 12) }, key, bin.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  call("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const errCode = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;
const stubFor = (code: string) => env.SETUP_BOX.get(env.SETUP_BOX.idFromName(code));
const storage = (code: string) =>
  runInDurableObject(stubFor(code), async (_i: SetupBox, state) => Object.fromEntries(await state.storage.list()));

const SECRET_SETUP = { greeting: "陈太太", home: { name: "Blk 123 Toa Payoh", lat: 1.3343, lng: 103.8563 }, contacts: [{ name: "美玲", phone: "+6591234567" }] };

describe("POST /api/setup + one-time GET", () => {
  it("round trip: ciphertext in, same ciphertext out once, decrypts with the fragment key; then 410 setup_used", async () => {
    const { ct, key, keyText } = await encrypt(SECRET_SETUP);
    const r = await post({ ct });
    expect(r.status).toBe(201);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const { code, expiresAt } = (await r.json()) as { code: string; expiresAt: string };
    expect(code).toMatch(/^[0-9A-Za-z]{12}$/);
    expect(Math.abs(Date.parse(expiresAt) - Date.now() - SETUP_TTL_MS)).toBeLessThan(5000);

    // The server holds ciphertext only: no key, no plaintext.
    const stored = JSON.stringify(await storage(code));
    expect(stored).not.toContain(keyText);
    expect(stored).not.toContain("Toa Payoh");
    expect(stored).not.toContain("6591234567");
    expect(Object.keys(await storage(code)).sort()).toEqual(["box", "ct"]);

    // The share link is /s/<code>#k=<key>; the app calls /api/setup/<code> — the fragment never reaches the Worker.
    const g = await call(`/api/setup/${code}`);
    expect(g.status).toBe(200);
    expect(g.headers.get("Cache-Control")).toBe("no-store");
    const body = (await g.json()) as { ct: string; expiresAt: string };
    expect(body.ct).toBe(ct);
    expect(await decrypt(body.ct, key)).toEqual(SECRET_SETUP);
    expect(await storage(code)).toEqual({ box: { state: "used", expiresAt: Date.parse(expiresAt) } });

    const again = await call(`/api/setup/${code}`);
    expect(again.status).toBe(410);
    expect(await errCode(again)).toBe("setup_used");
  });

  it("refuses anything but {ct}: a key field, extra fields, bad base64url, too small, too big", async () => {
    const { ct, keyText } = await encrypt({ a: 1 });
    expect(await errCode(await post({ ct, k: keyText }))).toBe("invalid_body");
    expect(await errCode(await post({ ct, key: keyText }))).toBe("invalid_body");
    expect(await errCode(await post({}))).toBe("invalid_body");
    expect(await errCode(await post([ct]))).toBe("invalid_body");
    expect(await errCode(await post({ ct: 5 }))).toBe("invalid_ciphertext");
    expect(await errCode(await post({ ct: ct + "==" }))).toBe("invalid_ciphertext");
    expect(await errCode(await post({ ct: "abc+/def" }))).toBe("invalid_ciphertext");
    expect(await errCode(await post({ ct: "AAAA" }))).toBe("invalid_ciphertext");
    const big = b64url(new Uint8Array(SETUP_MAX_BYTES + 3));
    const r = await post({ ct: big });
    expect(r.status).toBe(413);
    expect(await errCode(await post("not json"))).toBe("invalid_json");
    const max = b64url(new Uint8Array(SETUP_MAX_BYTES));
    expect((await post({ ct: max })).status).toBe(201);
  });

  it("base64urlBytes", () => {
    expect(base64urlBytes("AAAA")).toBe(3);
    expect(base64urlBytes("AAAAA")).toBe(-1);
    expect(base64urlBytes("AA=")).toBe(-1);
  });

  it("unknown or malformed codes → 404; wrong methods → 405", async () => {
    expect(await errCode(await call("/api/setup/AAAAAAAAAAAA"))).toBe("setup_not_found");
    expect(await errCode(await call("/api/setup/short"))).toBe("setup_not_found");
    expect((await call("/api/setup")).status).toBe(405);
    expect((await call("/api/setup/AAAAAAAAAAAA", { method: "DELETE" })).status).toBe(405);
  });
});

describe("24 h expiry", () => {
  it("fake clock: after 24 h the GET says setup_expired and the ciphertext is gone", async () => {
    const { ct } = await encrypt({ a: 1 });
    const { code } = (await (await post({ ct })).json()) as { code: string };
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + SETUP_TTL_MS + 1000);
    const g = await call(`/api/setup/${code}`);
    expect(g.status).toBe(410);
    expect(await errCode(g)).toBe("setup_expired");
    vi.useRealTimers();
    expect(Object.keys(await storage(code))).toEqual(["box"]);
  });

  it("alarm at 24 h deletes the ciphertext; a later alarm deletes the tombstone", async () => {
    const { ct } = await encrypt({ a: 1 });
    const { code } = (await (await post({ ct })).json()) as { code: string };
    const shift = async (ms: number) =>
      runInDurableObject(stubFor(code), async (_i: SetupBox, state) => {
        const box = (await state.storage.get<{ state: string; expiresAt: number }>("box"))!;
        await state.storage.put("box", { ...box, expiresAt: box.expiresAt - ms });
      });
    await shift(SETUP_TTL_MS + 1);
    expect(await runDurableObjectAlarm(stubFor(code))).toBe(true);
    expect(await storage(code)).toMatchObject({ box: { state: "expired" } });
    expect(Object.keys(await storage(code))).toEqual(["box"]);
    expect(await errCode(await call(`/api/setup/${code}`))).toBe("setup_expired");
    await shift(SETUP_TOMBSTONE_MS);
    expect(await runDurableObjectAlarm(stubFor(code))).toBe(true);
    expect(await storage(code)).toEqual({});
    expect(await errCode(await call(`/api/setup/${code}`))).toBe("setup_not_found");
  });
});

describe("AC 47 setup rate limits", () => {
  const ip = { "CF-Connecting-IP": "203.0.113.40" };
  it("POST: 5 per hour per IP", async () => {
    const { ct } = await encrypt({ a: 1 });
    for (let i = 0; i < 5; i++) expect((await post({ ct }, ip)).status).toBe(201);
    const r = await post({ ct }, ip);
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toMatch(/^\d+$/);
  });
  it("GET: 30 per hour per IP, counted even for unknown codes (code guessing)", async () => {
    for (let i = 0; i < 30; i++) expect((await call("/api/setup/AAAAAAAAAAAA", { headers: ip })).status).toBe(404);
    expect((await call("/api/setup/AAAAAAAAAAAA", { headers: ip })).status).toBe(429);
    expect((await call("/api/setup/AAAAAAAAAAAA", { headers: { "CF-Connecting-IP": "203.0.113.41" } })).status).toBe(404);
  });
});
