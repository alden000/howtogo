/** LTA_PROXY service binding: bus arrival via the owner's whereisthebus-lta-proxy Worker when no own key. */
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evictCached, resetMemoryCache } from "../src/cache";
import worker from "../src/index";
import { stubFetch } from "./helpers";

beforeEach(async () => {
  resetMemoryCache();
  for (const s of ["53009", "53011", "60001", "60002", "60003", "60004"]) await evictCached(`bus:v1:${s}`);
});
afterEach(() => vi.restoreAllMocks());

const iso = (ms: number) => new Date(ms).toISOString();
function ba(now: number, polledAgoMs = 5_000) {
  return {
    "odata.metadata": "https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival",
    BusStopCode: "x",
    Services: [
      {
        ServiceNo: "162",
        Operator: "SBST",
        NextBus: { EstimatedArrival: iso(now + 4.5 * 60_000), Monitored: 1, Load: "SDA", Feature: "WAB", Type: "DD", Latitude: "1.35", Longitude: "103.85" },
        NextBus2: { EstimatedArrival: iso(now + 15 * 60_000), Monitored: 0, Load: "SEA", Feature: "", Type: "SD", Latitude: "0.0", Longitude: "0.0" },
        NextBus3: { EstimatedArrival: "" },
      },
    ],
    PolledAt: iso(now - polledAgoMs),
  };
}

/** Fake Fetcher standing in for the service binding; records the requested URLs. */
function fakeProxy(handler: (url: URL) => Response | Promise<Response>) {
  const urls: URL[] = [];
  const fetcher = {
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      urls.push(url);
      return handler(url);
    },
    connect: () => {
      throw new Error("unused");
    },
  } as unknown as Fetcher;
  return { fetcher, urls };
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

async function get(path: string, e: typeof env): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://api.test" + path), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const noKey = (proxy?: Fetcher): typeof env => ({ ...env, LTA_ACCOUNT_KEY: undefined, LTA_PROXY: proxy });

type Out = { stop: string; fetchedAt: string; services: { no: string; next: { etaMin: number; monitored: boolean; lat?: number }[] }[] };

describe("bus arrival via LTA_PROXY", () => {
  it("picks body[code] from a multi-stop body and normalises it like a direct LTA answer", async () => {
    const now = Date.now();
    const { fetcher, urls } = fakeProxy(() => json({ "53011": ba(now), "53009": ba(now, 3_000) }));
    const net = stubFetch(() => json({}, 500));
    const res = await get("/api/bus-arrival?stop=53009", noKey(fetcher));
    expect(res.status).toBe(200);
    expect(urls[0]!.pathname).toBe("/bus-arrival");
    expect(urls[0]!.searchParams.get("BusStopCode")).toBe("53009");
    expect(net.calls).toHaveLength(0); // no direct DataMall call
    const b = (await res.json()) as Out;
    expect(b.stop).toBe("53009");
    expect(b.services[0]!.no).toBe("162");
    expect(b.services[0]!.next.map((n) => n.monitored)).toEqual([true, false]);
    expect([4]).toContain(b.services[0]!.next[0]!.etaMin);
    expect(b.services[0]!.next[1]!.lat).toBeUndefined();
    expect(Date.parse(b.fetchedAt)).toBe(Date.parse(ba(now, 3_000).PolledAt));
  });

  it("keeps our own 20 s cache (one proxy call for two requests)", async () => {
    const { fetcher, urls } = fakeProxy(() => json({ "60001": ba(Date.now()) }));
    await get("/api/bus-arrival?stop=60001", noKey(fetcher));
    const res = await get("/api/bus-arrival?stop=60001&service=162", noKey(fetcher));
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(urls).toHaveLength(1);
  });

  it("missing code in the body → 502 upstream_unavailable", async () => {
    const { fetcher } = fakeProxy(() => json({ "99999": ba(Date.now()) }));
    const res = await get("/api/bus-arrival?stop=60002", noKey(fetcher));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error?.code ?? "").toBe("upstream_unavailable");
  });

  it("proxy 502 (plain text) → 502 upstream_unavailable, nothing cached", async () => {
    let n = 0;
    const { fetcher } = fakeProxy(() => (n++ === 0 ? new Response("LTA upstream error", { status: 502 }) : json({ "60003": ba(Date.now()) })));
    expect((await get("/api/bus-arrival?stop=60003", noKey(fetcher))).status).toBe(502);
    expect((await get("/api/bus-arrival?stop=60003", noKey(fetcher))).status).toBe(200);
  });

  it("stale PolledAt (> 60 s) is reported as fetchedAt, etaMin still against now", async () => {
    const now = Date.now();
    const { fetcher } = fakeProxy(() => json({ "60004": ba(now, 90_000) }));
    const b = (await (await get("/api/bus-arrival?stop=60004", noKey(fetcher))).json()) as Out;
    expect(Date.now() - Date.parse(b.fetchedAt)).toBeGreaterThan(60_000);
    expect(b.services[0]!.next[0]!.etaMin).toBe(4);
  });

  it("own key wins over the proxy", async () => {
    const { fetcher, urls } = fakeProxy(() => json({}));
    const net = stubFetch(() => json({ Services: [] }));
    expect((await get("/api/bus-arrival?stop=53009", { ...env, LTA_PROXY: fetcher })).status).toBe(200);
    expect(urls).toHaveLength(0);
    expect(net.calls[0]!.url.hostname).toBe("datamall2.mytransport.sg");
  });
});

describe("no key: alerts/lifts stay not configured; health reports the LTA source", () => {
  it("/api/alerts and /api/lifts → 503 not_configured even with the proxy bound", async () => {
    const { fetcher, urls } = fakeProxy(() => json({}));
    for (const p of ["/api/alerts", "/api/lifts"]) {
      const res = await get(p, noKey(fetcher));
      expect(res.status).toBe(503);
      expect(JSON.stringify(await res.json())).toMatch(/not_configured/);
    }
    expect(urls).toHaveLength(0);
  });
  it("/api/health lta: key | proxy | none", async () => {
    const { fetcher } = fakeProxy(() => json({}));
    const lta = async (e: typeof env) => ((await (await get("/api/health", e)).json()) as { lta: string }).lta;
    expect(await lta({ ...env, LTA_PROXY: undefined })).toBe("key");
    expect(await lta(noKey(fetcher))).toBe("proxy");
    expect(await lta(noKey(undefined))).toBe("none");
  });
});
