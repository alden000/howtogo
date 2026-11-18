import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { stubFetch } from "./helpers";

const fxEnv: typeof env = { ...env, FIXTURE_MODE: "1", ONEMAP_EMAIL: undefined, ONEMAP_PASSWORD: undefined, LTA_ACCOUNT_KEY: undefined };

async function get(path: string, e: typeof fxEnv = fxEnv): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://api.test" + path), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

interface Plan {
  plan: { date: number; to: { lat: number; lon: number }; itineraries: { startTime: number; legs: unknown[] }[] };
}

afterEach(() => vi.restoreAllMocks());

describe("AC 21 fixture mode (FIXTURE_MODE=1)", () => {
  it("GET /api/health reports fixtureMode (D-10 sample-routes banner)", async () => {
    const on = await get("/api/health");
    expect(on.status).toBe(200);
    expect(on.headers.get("Cache-Control")).toBe("no-store");
    expect(await on.json()).toMatchObject({ ok: true, fixtureMode: true });
    const off = await get("/api/health", { ...fxEnv, FIXTURE_MODE: "0" });
    expect(await off.json()).toMatchObject({ ok: true, fixtureMode: false });
    const unset = await get("/api/health", { ...fxEnv, FIXTURE_MODE: undefined });
    expect(await unset.json()).toMatchObject({ ok: true, fixtureMode: false });
  });

  it("is off by default: without credentials /api/route is not_configured", async () => {
    const res = await get("/api/route?start=1.3347,103.8491&end=1.3214,103.8465", { ...fxEnv, FIXTURE_MODE: undefined });
    expect(res.status).toBe(503);
  });

  it("serves >= 5 distinct trips without credentials or upstream calls, re-timed to the request", async () => {
    const { calls } = stubFetch(() => new Response("no", { status: 500 }));
    const ends = [
      [1.33465, 103.8491, 1.32135, 103.8465, "toaPayohToTTSH"],
      [1.3529, 103.8501, 1.2812, 103.8514, "bishanToRafflesPlace"],
      [1.3672, 103.8438, 1.32135, 103.8465, "angMoKioToNovena"],
      [1.3335, 103.7436, 1.2941, 103.7831, "jurongEastToNUH"],
      [1.3248, 103.9282, 1.3405, 103.9493, "bedokToCGH"],
    ] as const;
    for (const [a, b, c, d, name] of ends) {
      const res = await get(`/api/route?start=${a},${b}&end=${c},${d}&date=12-01-2026&time=08:00:00`);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Fixture")).toBe("1");
      expect(res.headers.get("X-Fixture-Trip")).toBe(name);
      const body = (await res.json()) as Plan;
      expect(body.plan.itineraries.length).toBeGreaterThan(0);
      expect(body.plan.itineraries[0]!.startTime).toBe(Date.UTC(2026, 11, 1, 0, 0, 0)); // 08:00 SGT
      expect(body.plan.to.lat).toBeCloseTo(c, 3);
    }
    expect(calls).toHaveLength(0);
  });

  it("still validates input", async () => {
    expect((await get("/api/route?start=1.6,103.8&end=1.3,103.8")).status).toBe(400);
    expect((await get("/api/search?q=")).status).toBe(400);
  });

  it("search matches names, postal codes and Chinese aliases", async () => {
    const r1 = (await (await get("/api/search?q=tan%20tock")).json()) as { results: { name: string; lat: number }[] };
    expect(r1.results[0]!.name).toBe("Tan Tock Seng Hospital");
    const r2 = (await (await get(`/api/search?q=${encodeURIComponent("樟宜")}`)).json()) as { results: { postal: string }[] };
    expect(r2.results[0]!.postal).toBe("529889");
    const r3 = (await (await get("/api/search?q=zzzz")).json()) as { results: unknown[] };
    expect(r3.results).toEqual([]);
  });

  it("revgeocode never names the position (QA-59): empty fields + sample:true, anywhere", async () => {
    for (const q of ["lat=1.2942&lng=103.7830", "lat=1.3700&lng=103.8495", "lat=1.4400&lng=103.8000"]) {
      const res = await get(`/api/revgeocode?${q}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Fixture")).toBe("1");
      expect(await res.json()).toEqual({ name: "", address: "", postal: "", sample: true });
    }
    // Input validation still applies.
    expect((await get("/api/revgeocode?lat=1.6&lng=103.8")).status).toBe(400);
  });

  it("bus-arrival and alerts answer from fixtures with live-looking times", async () => {
    const bus = (await (await get("/api/bus-arrival?stop=52009")).json()) as { stop: string; services: { no: string; next: { etaMin: number }[] }[] };
    expect(bus.stop).toBe("52009");
    expect(bus.services.map((s) => s.no)).toEqual(["13", "162", "410W"]);
    expect(bus.services[0]!.next[0]!.etaMin).toBeGreaterThanOrEqual(0);
    expect(bus.services[0]!.next[0]!.etaMin).toBeLessThan(5);
    const alerts = (await (await get("/api/alerts")).json()) as { status: string };
    expect(alerts.status).toBe("normal");
  });
});
