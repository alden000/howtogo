import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ARRIVED_GRACE_MS, newOwnerToken, newShareId, sha256Hex, shareTtlMs, type TripShare } from "../src/share";
import { ORIGIN, call } from "./helpers";

interface Created {
  id: string;
  ownerToken: string;
  viewPath: string;
  expiresAt: string;
}

const pos = (over: Record<string, unknown> = {}) => ({
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

async function create(body: unknown = { destName: "Bishan MRT Station", lang: "zh" }): Promise<Created> {
  const res = await call("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return res.json();
}

const put = (id: string, token: string | null, body: unknown) =>
  call(`/api/share/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const stubFor = (id: string) => env.TRIP_SHARE.get(env.TRIP_SHARE.idFromName(id));

/** Lets the next write through the 3 s rate limit without waiting. */
const clearRateLimit = (id: string) =>
  runInDurableObject(stubFor(id), async (_i: TripShare, state) => {
    await state.storage.put("lastWriteAt", 0);
  });

const errCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("share helpers", () => {
  it("ids are 12-char base62 and unique; tokens are 32 bytes base64url", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newShareId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9A-Za-z]{12}$/);
    expect(newOwnerToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("TTL defaults to 4 h and is clamped to 1..24 h", () => {
    expect(shareTtlMs({ ...env, SHARE_TTL_HOURS: undefined })).toBe(4 * 3600_000);
    expect(shareTtlMs({ ...env, SHARE_TTL_HOURS: "99" })).toBe(24 * 3600_000);
    expect(shareTtlMs({ ...env, SHARE_TTL_HOURS: "junk" })).toBe(4 * 3600_000);
  });
});

describe("share lifecycle", () => {
  it("create → stores only the token hash, expires in 4 h", async () => {
    const before = Date.now();
    const c = await create();
    expect(c.id).toMatch(/^[0-9A-Za-z]{12}$/);
    expect(c.viewPath).toBe(`/t/${c.id}`);
    const exp = Date.parse(c.expiresAt) - before;
    expect(exp).toBeGreaterThan(4 * 3600_000 - 5000);
    expect(exp).toBeLessThanOrEqual(4 * 3600_000 + 5000);
    const hash = await sha256Hex(c.ownerToken);
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      const all = JSON.stringify([...(await state.storage.list()).entries()]);
      expect(all).not.toContain(c.ownerToken);
      expect(all).toContain(hash);
      expect(await state.storage.getAlarm()).toBe(Date.parse(c.expiresAt));
    });
  });

  it("validates the create body", async () => {
    const r = await call("/api/share", { method: "POST", body: JSON.stringify({ destName: "" }) });
    expect(r.status).toBe(400);
    expect((await call("/api/share", { method: "POST", body: "{nope" })).status).toBe(400);
    expect((await call("/api/share", { method: "POST", body: JSON.stringify({ destName: "x", lang: "<b>" }) })).status).toBe(400);
  });

  it("GET before any update shows status waiting", async () => {
    const c = await create();
    const res = await call(`/api/share/${c.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ destName: "Bishan MRT Station", lang: "zh", status: "waiting", lat: null });
  });

  it("PUT by owner → 204, then GET shows public state (no speed, no token)", async () => {
    const c = await create();
    const res = await put(c.id, c.ownerToken, pos());
    expect(res.status).toBe(204);
    const state = (await (await call(`/api/share/${c.id}`)).json()) as Record<string, unknown>;
    expect(state).toMatchObject({ status: "travelling", lat: 1.3521, lng: 103.8198, acc: 12, heading: 90, stepText: "Take bus 162" });
    expect(state.etaISO).toBe("2026-11-17T07:30:00.000Z");
    expect(Object.keys(state).sort()).toEqual(
      [
        "acc", "destName", "etaISO", "expiresAt", "heading", "lang", "lat", "lng", "status", "stepText", "updatedAt",
        "senderName", "senderPhone", "positionAt", "helpAt",
      ].sort(),
    );
  });

  it("auth failures: missing token 401, wrong token 403", async () => {
    const c = await create();
    expect((await put(c.id, null, pos())).status).toBe(401);
    const wrong = await put(c.id, newOwnerToken(), pos());
    expect(wrong.status).toBe(403);
    expect(await errCode(wrong)).toBe("forbidden");
    expect((await call(`/api/share/${c.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${newOwnerToken()}` } })).status).toBe(403);
  });

  it("rejects coordinates outside Singapore and bad status", async () => {
    const c = await create();
    expect(await errCode(await put(c.id, c.ownerToken, pos({ lat: 1.5, lng: 103.76 })))).toBe("out_of_bounds");
    expect(await errCode(await put(c.id, c.ownerToken, pos({ status: "flying" })))).toBe("invalid_status");
    expect(await errCode(await put(c.id, c.ownerToken, pos({ updatedAt: "yesterday" })))).toBe("invalid_updated_at");
  });

  it("rate-limits to one write per 3 s", async () => {
    const c = await create();
    expect((await put(c.id, c.ownerToken, pos())).status).toBe(204);
    const r2 = await put(c.id, c.ownerToken, pos({ lat: 1.36 }));
    expect(r2.status).toBe(429);
    expect(await errCode(r2)).toBe("rate_limited");
    expect(Number(r2.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    await clearRateLimit(c.id);
    expect((await put(c.id, c.ownerToken, pos({ lat: 1.36 }))).status).toBe(204);
  });

  it("unknown / malformed id → 404", async () => {
    expect((await call(`/api/share/${newShareId()}`)).status).toBe(404);
    expect((await call("/api/share/short")).status).toBe(404);
  });

  it("DELETE by owner ends the share: position wiped, 410 afterwards", async () => {
    const c = await create();
    await put(c.id, c.ownerToken, pos());
    const del = await call(`/api/share/${c.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${c.ownerToken}` } });
    expect(del.status).toBe(204);
    const res = await call(`/api/share/${c.id}`);
    expect(res.status).toBe(410);
    expect(await errCode(res)).toBe("share_ended");
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      expect(await state.storage.get("pos")).toBeUndefined();
    });
    await clearRateLimit(c.id);
    expect((await put(c.id, c.ownerToken, pos())).status).toBe(410);
  });

  it("expiry: GET after expiresAt → 410; alarm deletes all storage → 404", async () => {
    const c = await create();
    await put(c.id, c.ownerToken, pos());
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      const meta = (await state.storage.get<Record<string, unknown>>("meta"))!;
      await state.storage.put("meta", { ...meta, expiresAt: Date.now() - 1000 });
      await state.storage.setAlarm(Date.now() - 1000);
    });
    expect(await runDurableObjectAlarm(stubFor(c.id))).toBe(true);
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      expect((await state.storage.list()).size).toBe(0);
    });
    expect((await call(`/api/share/${c.id}`)).status).toBe(404);
  });

  it("lazy expiry returns 410 share_expired even before the alarm runs", async () => {
    const c = await create();
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      const meta = (await state.storage.get<Record<string, unknown>>("meta"))!;
      await state.storage.put("meta", { ...meta, expiresAt: Date.now() - 1 });
    });
    const res = await call(`/api/share/${c.id}`);
    expect(res.status).toBe(410);
    expect(await errCode(res)).toBe("share_expired");
  });
});

describe("D-6: arrival auto-ends after 30 min", () => {
  it("arrived schedules alarm at min(expiresAt, arrivedAt+30min); leaving arrived cancels it", async () => {
    const c = await create();
    const t0 = Date.now();
    await put(c.id, c.ownerToken, pos({ status: "arrived" }));
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      const alarm = (await state.storage.getAlarm())!;
      expect(alarm).toBeGreaterThanOrEqual(t0 + ARRIVED_GRACE_MS);
      expect(alarm).toBeLessThan(t0 + ARRIVED_GRACE_MS + 5000);
    });
    await clearRateLimit(c.id);
    await put(c.id, c.ownerToken, pos({ status: "travelling" }));
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      expect(await state.storage.getAlarm()).toBe(Date.parse(c.expiresAt));
    });
  });

  it("alarm after the grace period ends the share (viewers see ended / 410), tombstone kept until expiry", async () => {
    const c = await create();
    await put(c.id, c.ownerToken, pos({ status: "arrived" }));
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      const meta = (await state.storage.get<Record<string, unknown>>("meta"))!;
      await state.storage.put("meta", { ...meta, arrivedAt: Date.now() - ARRIVED_GRACE_MS - 1 });
      await state.storage.setAlarm(Date.now() - 1);
    });
    expect(await runDurableObjectAlarm(stubFor(c.id))).toBe(true);
    const res = await call(`/api/share/${c.id}`);
    expect(res.status).toBe(410);
    expect(await errCode(res)).toBe("share_ended");
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      expect(await state.storage.get("pos")).toBeUndefined();
      expect(await state.storage.getAlarm()).toBe(Date.parse(c.expiresAt));
    });
  });

  it("arrival near expiry: alarm is capped at expiresAt", async () => {
    const c = await create();
    const soon = Date.now() + 10 * 60_000;
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      const meta = (await state.storage.get<Record<string, unknown>>("meta"))!;
      await state.storage.put("meta", { ...meta, expiresAt: soon });
    });
    await put(c.id, c.ownerToken, pos({ status: "arrived" }));
    await runInDurableObject(stubFor(c.id), async (_i: TripShare, state) => {
      expect(await state.storage.getAlarm()).toBe(soon);
    });
  });
});

describe("live WebSocket", () => {
  function nextMessage(ws: WebSocket): Promise<any> {
    return new Promise((resolve) => ws.addEventListener("message", (e) => resolve(JSON.parse(e.data as string)), { once: true }));
  }

  it("426 without Upgrade header", async () => {
    const c = await create();
    expect((await call(`/api/share/${c.id}/live`)).status).toBe(426);
  });

  it("sends current state on connect, broadcasts updates and the end", async () => {
    const c = await create();
    const res = await call(`/api/share/${c.id}/live`, { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    const first = nextMessage(ws);
    ws.accept();
    expect(await first).toMatchObject({ type: "state", state: { status: "waiting" } });

    const second = nextMessage(ws);
    expect((await put(c.id, c.ownerToken, pos({ status: "help" }))).status).toBe(204);
    expect(await second).toMatchObject({ type: "state", state: { status: "help", lat: 1.3521 } });

    const third = nextMessage(ws);
    const closed = new Promise<CloseEvent>((r) => ws.addEventListener("close", (e) => r(e as CloseEvent), { once: true }));
    await call(`/api/share/${c.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${c.ownerToken}` } });
    expect(await third).toMatchObject({ type: "state", state: { status: "ended", lat: null } });
    expect((await closed).code).toBe(1000);
  });

  it("404 for unknown share", async () => {
    expect((await call(`/api/share/${newShareId()}/live`, { headers: { Upgrade: "websocket" } })).status).toBe(404);
  });
});
