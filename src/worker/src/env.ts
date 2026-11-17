export interface Env {
  /** OneMap account e-mail (Worker secret). */
  ONEMAP_EMAIL?: string;
  /** OneMap account password (Worker secret). */
  ONEMAP_PASSWORD?: string;
  /** LTA DataMall AccountKey (Worker secret). */
  LTA_ACCOUNT_KEY?: string;
  /** Comma-separated list of allowed browser origins, e.g. "https://howtogo.pages.dev,http://localhost:5173". */
  ALLOWED_ORIGINS?: string;
  /** Lifetime of a live trip share in hours (default 4, clamped 1..24). */
  SHARE_TTL_HOURS?: string;
  /** "test" only in wrangler.toml [env.test]; unlocks SHARE_TEST_TTL_SECONDS. Never set in production. */
  ENVIRONMENT?: string;
  /** M4 OQ6: short share lifetime in seconds for the two-browser e2e test. Honoured only when ENVIRONMENT = "test". */
  SHARE_TEST_TTL_SECONDS?: string;
  /**
   * "1" = answer search/route/revgeocode/bus-arrival/alerts from bundled synthetic fixtures (AC 21).
   * Dev/QA only (`wrangler dev --var FIXTURE_MODE:1`); unset in production.
   */
  FIXTURE_MODE?: string;
  /** KV namespace that holds the cached OneMap token. */
  TOKEN_KV: KVNamespace;
  /** Durable Object namespace: one TripShare per share id. */
  TRIP_SHARE: DurableObjectNamespace<import("./share").TripShare>;
  /** Durable Object namespace: one SetupBox per caregiver setup code (M4 AC 41). */
  SETUP_BOX: DurableObjectNamespace<import("./setup").SetupBox>;
}
