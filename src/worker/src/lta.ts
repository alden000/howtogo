import type { Env } from "./env";
import { HttpError, UpstreamError } from "./http";
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
    throw new UpstreamError();
  }
  if (!res.ok) {
    console.error("lta_upstream_error", pathAndQuery.split("?")[0], res.status);
    throw new UpstreamError();
  }
  return res.text();
}
