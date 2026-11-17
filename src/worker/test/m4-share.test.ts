/** M4 Worker ACs: 10 (status enum), 13 (D-7 help bypass), 18/OQ3 (sender fields), 21 (states), 47 (limits), 48, OQ6. */
import { createExecutionContext, env, runDurableObjectAlarm, runInDurableObject, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { LIMITS, resetRateLimit } from "../src/ratelimit";
import { HELP_INTERVAL_MS, STATUSES, shareTtlMs, type TripShare } from "../src/share";
import { ORIGIN, call } from "./helpers";

interface Created {
  id: string;
  ownerToken: string;
  expiresAt: string;
}

beforeEach(() => resetRateLimit());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const fix = (over: Record<string, unknown> = {}) => ({
  lat: 1.3521,
  lng: 103.8198,
  acc: 12,
  heading: 90,
  speed: 1.2,
  etaISO: "2026-11-17T07:30:00Z",
  stepText: "Take bus 162",
  status: "travelling",
  updatedAt: Date.now(),
  ...over,
});

async function create(body: Record<string, unknown> = {}, headers: Record<string, string> = {}, e = env): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request("https://api.test/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
      body: JSON.stringify({ destName: "Tan Tock Seng Hospital", lang: "zh", ...body }),
    }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}
const created = async (body: Record<string, unknown> = {}) => {
  const r = await create(body);
  expect(r.status).toBe(201);
  return (await r.json()) as Created;
};
const put = (id: string, token: string, body: unknown) =>
  call(`/api/share/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
const getState = async (id: string) => (await (await call(`/api/share/${id}`)).json()) as Record<string, unknown>;
const stubFor = (id: string) => env.TRIP_SHARE.get(env.TRIP_SHARE.idFromName(id));
const storage = (id: string) =>
  runInDurableObject(stubFor(id), async (_i: TripShare, state) => Object.fromEntries(await state.storage.list()));
const clearWriteLimit = (id: string) =>
  runInDurableObject(stubFor(id), async (_i: TripShare, state) => {
    await state.storage.put({ lastWriteAt: 0, lastHelpAt: 0 });
  });
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("AC 10: status contract", () => {
  it("STATUSES is exactly the four statuses the shared payload may emit", () => {
    expect([...STATUSES]).toEqual(["travelling", "arrived", "paused", "help"]);
  });
  it("engine-only statuses are rejected", async () => {
    const c = await created();
    for (const s of ["active", "off_route", "gps_weak", "waiting", "ended"]) {
      const r = await put(c.id, c.ownerToken, fix({ status: s }));
      expect(r.status).toBe(400);
      expect(await code(r)).toBe("invalid_status");
    }
  });
});

describe("AC 18 / OQ3: sender fields", () => {
  it("senderName and senderPhone are optional and exposed while live", async () => {
    const plain = await created();
    expect(await getState(plain.id)).toMatchObject({ senderName: null, senderPhone: null });
    resetRateLimit();
    const c = await created({ senderName: "妈妈", senderPhone: "+6591234567" });
    expect(await getState(c.id)).toMatchObject({ senderName: "妈妈", senderPhone: "+6591234567", status: "waiting" });
  });
  it("validates: name 1–40, phone E.164", async () => {
    for (const [body, err] of [
      [{ senderName: "x".repeat(41) }, "invalid_sender_name"],
      [{ senderName: "  " }, "invalid_sender_name"],
      [{ senderName: 5 }, "invalid_sender_name"],
      [{ senderPhone: "91234567" }, "invalid_sender_phone"],
      [{ senderPhone: "+65 9123 4567" }, "invalid_sender_phone"],
      [{ senderPhone: "+0123456789" }, "invalid_sender_phone"],
    ] as const) {
      const r = await create(body);
      expect(r.status).toBe(400);
      expect(await code(r)).toBe(err);
    }
  });
  it("AC 48: ending drops the phone and the position from storage; the tombstone has neither", async () => {
    const c = await created({ senderName: "妈妈", senderPhone: "+6591234567" });
    expect((await put(c.id, c.ownerToken, fix())).status).toBe(204);
    await call(`/api/share/${c.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${c.ownerToken}` } });
    const s = JSON.stringify(await storage(c.id));
    expect(s).not.toContain("6591234567");
    expect(s).not.toContain("1.3521");
    expect(s).not.toContain("103.8198");
  });
});

describe("PUT without a position (AC 8 start before a fix, AC 14 paused, AC 35 help-only share)", () => {
  it("is accepted; the family sees the status with null position", async () => {
    const c = await created({ destName: "我在这里" });
    expect((await put(c.id, c.ownerToken, { status: "help", updatedAt: Date.now() })).status).toBe(204);
    expect(await getState(c.id)).toMatchObject({ status: "help", lat: null, lng: null, acc: null, positionAt: null });
  });
  it("keeps the last known position and its time", async () => {
    const c = await created();
    const t = Date.now() - 10_000;
    await put(c.id, c.ownerToken, fix({ updatedAt: t }));
    await clearWriteLimit(c.id);
    expect((await put(c.id, c.ownerToken, { status: "paused", updatedAt: Date.now() })).status).toBe(204);
    const s = await getState(c.id);
    expect(s).toMatchObject({ status: "paused", lat: 1.3521, lng: 103.8198, acc: 12, positionAt: new Date(t).toISOString() });
    expect(Date.parse(s.updatedAt as string)).toBeGreaterThan(t);
  });
  it("half a position is rejected", async () => {
    const c = await created();
    const r = await put(c.id, c.ownerToken, { lat: 1.35, status: "travelling", updatedAt: Date.now() });
    expect(await code(r)).toBe("invalid_coordinates");
    const r2 = await put(c.id, c.ownerToken, { lat: 1.35, lng: 103.8, status: "travelling", updatedAt: Date.now() });
    expect(await code(r2)).toBe("invalid_accuracy");
  });
});

describe("D-7 / AC 13: help bypasses the 3 s write limit (max 1 help write per second)", () => {
  it("help right after a write is accepted; a second help within 1 s is 429; other statuses still wait 3 s", async () => {
    const c = await created();
    expect((await put(c.id, c.ownerToken, fix())).status).toBe(204);
    expect((await put(c.id, c.ownerToken, fix())).status).toBe(429); // normal limit unchanged
    expect((await put(c.id, c.ownerToken, fix({ status: "help" }))).status).toBe(204);
    const again = await put(c.id, c.ownerToken, fix({ status: "help" }));
    expect(again.status).toBe(429);
    expect(again.headers.get("Retry-After")).toBe("1");
    expect((await put(c.id, c.ownerToken, fix({ status: "travelling" }))).status).toBe(429);
    expect(HELP_INTERVAL_MS).toBe(1000);
  });
  it("helpAt marks when the help episode started and survives repeated help writes; cleared after", async () => {
    const c = await created();
    await put(c.id, c.ownerToken, fix({ status: "help" }));
    const first = (await getState(c.id)).helpAt as string;
    expect(Date.parse(first)).toBeGreaterThan(Date.now() - 5000);
    await clearWriteLimit(c.id);
    await put(c.id, c.ownerToken, fix({ status: "help" }));
    expect((await getState(c.id)).helpAt).toBe(first);
    await clearWriteLimit(c.id);
    await put(c.id, c.ownerToken, fix({ status: "travelling" }));
    expect(await getState(c.id)).toMatchObject({ status: "travelling", helpAt: null });
  });
});

describe("AC 47 rate limits", () => {
  const ip = (v: string) => ({ "CF-Connecting-IP": v });
  it("POST /api/share: 10 per hour per IP", async () => {
    expect(LIMITS.shareCreate).toEqual({ max: 10, windowMs: 3_600_000 });
    for (let i = 0; i < 10; i++) expect((await create({}, ip("203.0.113.5"))).status).toBe(201);
    const r = await create({}, ip("203.0.113.5"));
    expect(r.status).toBe(429);
    expect(await code(r)).toBe("rate_limited");
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(3000);
    expect((await create({}, ip("203.0.113.6"))).status).toBe(201);
  });
  it("viewer GET: 1 per 5 s per IP per share; the WebSocket is not counted", async () => {
    const a = await created();
    const b = await created();
    const g = (id: string) => call(`/api/share/${id}`, { headers: ip("198.51.100.7") });
    expect((await g(a.id)).status).toBe(200);
    const r = await g(a.id);
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("5");
    expect((await g(b.id)).status).toBe(200); // other share
    expect((await call(`/api/share/${a.id}`, { headers: ip("198.51.100.8") })).status).toBe(200); // other viewer
    const ws = await call(`/api/share/${a.id}/live`, { headers: { Upgrade: "websocket", ...ip("198.51.100.7") } });
    expect(ws.status).toBe(101);
    ws.webSocket!.accept();
    ws.webSocket!.close();
  });
  it("owner writes (PUT/DELETE) are not IP-limited", async () => {
    const c = await created();
    for (let i = 0; i < 3; i++) {
      await clearWriteLimit(c.id);
      const r = await call(`/api/share/${c.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${c.ownerToken}`, ...ip("203.0.113.9") },
        body: JSON.stringify(fix()),
      });
      expect(r.status).toBe(204);
    }
  });
});

describe("AC 21: live states over the WebSocket", () => {
  function nextMessage(ws: WebSocket): Promise<any> {
    return new Promise((resolve) => ws.addEventListener("message", (e) => resolve(JSON.parse(e.data as string)), { once: true }));
  }
  it("help (with helpAt), arrived, and the ended state with phone and position removed", async () => {
    const c = await created({ senderName: "妈妈", senderPhone: "+6591234567" });
    const res = await call(`/api/share/${c.id}/live`, { headers: { Upgrade: "websocket" } });
    const ws = res.webSocket!;
    const first = nextMessage(ws);
    ws.accept();
    expect(await first).toMatchObject({ type: "state", state: { status: "waiting", senderName: "妈妈", senderPhone: "+6591234567" } });
    let m = nextMessage(ws);
    await put(c.id, c.ownerToken, fix({ status: "help" }));
    const help = await m;
    expect(help.state.status).toBe("help");
    expect(typeof help.state.helpAt).toBe("string");
    await clearWriteLimit(c.id);
    m = nextMessage(ws);
    await put(c.id, c.ownerToken, fix({ status: "arrived", etaISO: null }));
    expect(await m).toMatchObject({ type: "state", state: { status: "arrived", etaISO: null } });
    m = nextMessage(ws);
    // arrival + 30 min → auto-end
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      const meta = (await state.storage.get<{ arrivedAt: number }>("meta"))!;
      await state.storage.put("meta", { ...meta, arrivedAt: Date.now() - 31 * 60_000 });
    });
    await runDurableObjectAlarm(stubFor(c.id));
    expect(await m).toMatchObject({ type: "state", state: { status: "ended", lat: null, senderPhone: null, senderName: "妈妈" } });
  });

  it("expired: {type:'expired'} then close; storage empty", async () => {
    const c = await created();
    await put(c.id, c.ownerToken, fix());
    const res = await call(`/api/share/${c.id}/live`, { headers: { Upgrade: "websocket" } });
    const ws = res.webSocket!;
    const first = nextMessage(ws);
    ws.accept();
    await first;
    const m = nextMessage(ws);
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      const meta = (await state.storage.get<{ expiresAt: number }>("meta"))!;
      await state.storage.put("meta", { ...meta, expiresAt: Date.now() - 1 });
    });
    await runDurableObjectAlarm(stubFor(c.id));
    expect(await m).toEqual({ type: "expired" });
    expect(await storage(c.id)).toEqual({});
  });
});

describe("OQ6: test-only short TTL", () => {
  it("SHARE_TEST_TTL_SECONDS is honoured only with ENVIRONMENT=test", () => {
    expect(shareTtlMs({ ...env, ENVIRONMENT: "test", SHARE_TEST_TTL_SECONDS: "90" })).toBe(90_000);
    expect(shareTtlMs({ ...env, ENVIRONMENT: undefined, SHARE_TEST_TTL_SECONDS: "90" })).toBe(4 * 3600_000);
    expect(shareTtlMs({ ...env, ENVIRONMENT: "production", SHARE_TEST_TTL_SECONDS: "90" })).toBe(4 * 3600_000);
    expect(shareTtlMs({ ...env, ENVIRONMENT: "test", SHARE_TEST_TTL_SECONDS: "0" })).toBe(4 * 3600_000);
    expect(shareTtlMs({ ...env, ENVIRONMENT: "test", SHARE_TEST_TTL_SECONDS: "1.5" })).toBe(4 * 3600_000);
  });
  it("a share made under [env.test] expires after the short TTL (fake clock)", async () => {
    const testEnv = { ...env, ENVIRONMENT: "test", SHARE_TEST_TTL_SECONDS: "60" };
    const r = await create({}, {}, testEnv);
    const c = (await r.json()) as Created;
    expect(Date.parse(c.expiresAt) - Date.now()).toBeLessThanOrEqual(60_000);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    const g = await call(`/api/share/${c.id}`);
    expect(g.status).toBe(410);
    expect(await code(g)).toBe("share_expired");
    vi.useRealTimers();
    expect((await call(`/api/share/${c.id}`)).status).toBe(404); // lazily wiped
  });
});

describe("structured step (viewer review ruling)", () => {
  it("stores and serves step; status-only updates carry it too", async () => {
    const c = await created();
    const step = { k: "train", line: "NS", towards: "NS1", stops: 3 };
    expect((await put(c.id, c.ownerToken, fix({ step }))).status).toBe(204);
    expect((await getState(c.id)).step).toEqual(step);
    await clearWriteLimit(c.id);
    const wait = { k: "wait", svc: "139", stop: "Opp Blk 215" };
    expect((await put(c.id, c.ownerToken, { status: "travelling", updatedAt: Date.now(), step: wait })).status).toBe(204);
    expect((await getState(c.id)).step).toEqual(wait);
  });
  it.each([
    [{ k: "fly" }],
    [{ svc: "139" }],
    [{ k: "bus", stops: -1 }],
    [{ k: "bus", stops: 2.5 }],
    [{ k: "bus", svc: "x".repeat(9) }],
    [{ k: "walk", place: "x".repeat(81) }],
    [{ k: "walk", lat: 1.3 }],
    [{ k: "walk", place: "" }],
    ["walk"],
    [[{ k: "walk" }]],
  ])("refuses a bad step %j", async (step) => {
    const c = await created();
    const res = await put(c.id, c.ownerToken, fix({ step }));
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("invalid_step");
  });
});
