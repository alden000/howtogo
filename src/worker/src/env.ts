export interface Env {
  /** OneMap account e-mail (Worker secret). */
  ONEMAP_EMAIL?: string;
  /** OneMap account password (Worker secret). */
  ONEMAP_PASSWORD?: string;
  /** LTA DataMall AccountKey (Worker secret). */
  LTA_ACCOUNT_KEY?: string;
  /** Comma-separated list of allowed browser origins, e.g. "https://howtogo.pages.dev,http://localhost:5173". */
  ALLOWED_ORIGINS?: string;
  /** Lifetime of a live trip share in hours (default 12, clamped 1..24). */
  SHARE_TTL_HOURS?: string;
  /**
   * "1" = answer search/route/revgeocode/bus-arrival/alerts from bundled synthetic fixtures (AC 21).
   * Dev/QA only (`wrangler dev --var FIXTURE_MODE:1`); unset in production.
   */
  FIXTURE_MODE?: string;
  /** KV namespace that holds the cached OneMap token. */
  TOKEN_KV: KVNamespace;
  /** Durable Object namespace: one TripShare per share id. */
  TRIP_SHARE: DurableObjectNamespace<import("./share").TripShare>;
}
