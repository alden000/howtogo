import type { Env } from "./env";
import { HttpError, UpstreamError, upstreamStatus, upstreamTimeout } from "./http";
import { fetchWithTimeout } from "./onemap";

export const LTA_BASE = "https://datamall2.mytransport.sg/ltaodataservice";

/** GET an LTA DataMall path with the AccountKey header. Returns the body text on 200. */
export async function ltaGet(env: Env, pathAndQuery: string): Promise<string> {
  if (!env.LTA_ACCOUNT_KEY) throw new HttpError(503, "not_configured", "This feature is not set up yet.");
  let res: Response;
  try {
    res = await fetchWithTimeout(LTA_BASE + pathAndQuery, {
      headers: { AccountKey: env.LTA_ACCOUNT_KEY, Accept: "application/json" },
    });
  } catch {
    throw upstreamTimeout();
  }
  if (!res.ok) {
    console.error("lta_upstream_error", pathAndQuery.split("?")[0], res.status);
    throw upstreamStatus(res.status);
  }
  return res.text();
}

/** Where LTA data comes from: our own key, the owner's proxy Worker (service binding), or nowhere. */
export type LtaSource = "key" | "proxy" | "none";

export function ltaSource(env: Env): LtaSource {
  if (env.LTA_ACCOUNT_KEY) return "key";
  if (env.LTA_PROXY) return "proxy";
  return "none";
}

/**
 * Raw LTA BusArrival v3 body text for one stop. With LTA_ACCOUNT_KEY: DataMall directly. Otherwise via
 * the `whereisthebus-lta-proxy` service binding, whose body is { [code]: BusArrival v3 + PolledAt };
 * we return that one entry (PolledAt kept, see handleBusArrival). Any proxy failure → UpstreamError.
 * Neither key nor proxy → 503 not_configured.
 */
export async function ltaBusArrival(env: Env, stop: string): Promise<string> {
  if (env.LTA_ACCOUNT_KEY || !env.LTA_PROXY) return ltaGet(env, `/v3/BusArrival?BusStopCode=${stop}`);
  let res: Response;
  try {
    res = await env.LTA_PROXY.fetch(new Request("https://lta-proxy/bus-arrival?BusStopCode=" + stop));
  } catch {
    throw upstreamTimeout();
  }
  if (!res.ok) {
    console.error("lta_proxy_error", "/bus-arrival", res.status);
    throw upstreamStatus(res.status);
  }
  let entry: unknown;
  try {
    entry = ((await res.json()) as Record<string, unknown> | null)?.[stop];
  } catch {
    throw new UpstreamError();
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    console.error("lta_proxy_error", "/bus-arrival", "missing_stop");
    throw new UpstreamError();
  }
  return JSON.stringify(entry);
}
