# Dev log

## 2026-11-17 — Worker backend (Dev-A, branch dev/worker)

**Done** (`src/worker`, contract in `src/worker/API.md`)
- Cloudflare Worker in TypeScript. Endpoints: `/api/search`, `/api/route` (raw OneMap pass-through), `/api/revgeocode`, `/api/bus-arrival` (LTA v3), `/api/alerts`, `/api/health`.
- OneMap token manager. Tokens are cached in memory and in KV (`TOKEN_KV`), renewed when < 6 h are left or on a 401 (one retry). Concurrent renewals are deduped. If renewal fails, a token that has not expired yet is still used. Credentials and tokens are never logged or echoed.
- Two-tier cache: an in-isolate map plus the Cache API. TTLs: search 1 d, revgeocode 1 d, route 60 s (coords at 4 dp + minute), bus 20 s (ETA recomputed per request), alerts 60 s.
- `TripShare` Durable Object (SQLite-backed, WebSocket hibernation). Create, put, get, live, delete. Only the SHA-256 hash of the owner token is stored. 1 write per 3 s. SG bbox enforced. An alarm deletes all storage at expiry.
- **D-6 folded in:** `SHARE_TTL_HOURS` defaults to 4. Status `arrived` sets the alarm to min(expiresAt, arrivedAt + 30 min), then the share ends and viewers get `ended`. Leaving `arrived` cancels the auto-end.
- CORS allow-list (other Origins get 403), security headers, JSON errors, `502 upstream_unavailable`.
- Tests: 76 vitest tests on `@cloudflare/vitest-plugin` 1.8.3 (the renamed `vitest-pool-workers`), running in workerd, about 3 s. They cover normalisers (real OneMap search fixtures plus synthetic LTA/revgeo fixtures), bbox and params, cache keys, token renewal and 401 retry, no-leak checks, CORS, the share lifecycle (auth, rate limit, expiry, delete, arrival auto-end) and WebSocket broadcast. `wrangler deploy --dry-run` bundles at 38 KiB.

**Run**
```
npm install                        # from repo root (workspaces)
npm test -w @howtogo/worker
npm run typecheck -w @howtogo/worker
cp src/worker/.dev.vars.example src/worker/.dev.vars && npm run dev -w @howtogo/worker   # wrangler dev
```
Notes:
- I did not commit the root `package-lock.json`, because I was scoped to `src/worker`. The Director should generate it once at merge time.
- On npm 10.9, `npm install -w ... <pkg>` crashed with an arborist "edgesOut" error when combined with vitest 4 peer deps. Writing the deps into package.json and running a plain `npm install` works.

**Deploy (Director)**, from `src/worker`:
1. `npx wrangler kv namespace create TOKEN_KV`, then paste the id into `wrangler.toml`.
2. Set `ALLOWED_ORIGINS` in `wrangler.toml` to the Pages origin(s), comma-separated.
3. `npx wrangler secret put ONEMAP_EMAIL`, then `ONEMAP_PASSWORD`, then `LTA_ACCOUNT_KEY`.
4. `npx wrangler deploy`. The DO migration `v1` (`new_sqlite_classes`) applies on the first deploy.
5. Route `/api/*` on the PWA's domain to the Worker. The Cache API tier only works on a custom domain; on workers.dev only the memory tier caches.
6. Smoke test: `curl https://<host>/api/health`, then `/api/search?q=bishan`.

**Assumptions to verify with a real token/key**
- OneMap accepts the raw token in `Authorization` with no `Bearer` prefix. If routing still returns 401 with a fresh token, try `Bearer` (one line in `onemap.ts`).
- `getToken` returns `expiry_timestamp` in epoch seconds. The parser accepts seconds or ms and assumes 1 day if the field is missing.
- revgeocode field names (`GeocodeInfo[].BUILDINGNAME/BLOCK/ROAD/POSTALCODE`, "NIL" for missing). The fixture is synthetic.
- BusArrival v3 fields (`Load`, `Feature: "WAB"`, `Type: SD|DD|BD`, lat/lng "0.0" when unknown). The fixture is synthetic.
- TrainServiceAlerts path is unversioned (`/ltaodataservice/TrainServiceAlerts`), with shape `{value:{Status:1|2,AffectedSegments,Message}}`. I found no v2/v3 of this endpoint in public sources.
- OneMap route errors arrive with HTTP 200 and an error body (passed through). Any 4xx other than 401 becomes a 502.

**Next steps**
1. Shared engine: consume the raw `/api/route` body. The web app consumes the API.md contract.
2. Real-credential smoke test of the assumptions above. Replace the synthetic fixtures with recorded real responses, scrubbed of tokens.
3. Abuse controls: a Cloudflare rate-limiting rule on `POST /api/share` and `/api/search`. Optionally Turnstile on share creation.
4. Optional: SSE fallback for `/live`, the `/api/bus-stops` daily cache, and `FacilitiesMaintenance` (lift outages) per the plan.
5. Decide whether a `help` status should bypass the 3 s rate limit. It is strict now, and the client must resend after `Retry-After`.
