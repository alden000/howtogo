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
## 2026-11-17 — Dev-B: shared engine (`src/shared`, branch `dev/engine`)

**Package:** `@howtogo/shared`. ESM, exports TS source (`"."` → `src/index.ts`, `"./fixtures"` → synthetic OneMap bodies for demo mode). No runtime dependencies. Pure functions: no DOM, no timers, no clock reads. `npm test -w @howtogo/shared` (82 tests, < 1 s) and `npm run typecheck -w @howtogo/shared` pass. Dev deps: vitest 2, typescript 5.

### API surface
| Area | Exports |
|---|---|
| Types (`types.ts`) | `Place, Stop, Leg (walk/bus/mrt/lrt), Itinerary, LineInfo, Step, StepKind, RoutePreference, RankedItinerary, Journey, JourneySegment, Fix, Cue, CueType, GuidanceEvent, GuidanceState, SharePayload, PlanResult` |
| Geo (`geo.ts`) | `haversine, bearing, destination, decodePolyline, encodePolyline (precision 5), snapToPolyline, pointToPolylineDistance, pointAlong, slicePolyline, cumulativeDistances, polylineLength, dedupePoints` |
| OneMap | `normalizeOneMapPlan(raw)` → `{ok:true, itineraries, from, to, warnings}` or `{ok:false, error:'malformed'/'no_route'/'api_error', message}`. Never throws. Also `prettyStopName`, `parseExit` |
| Lines (`lines.ts`) | `lineByCode, inferLine, inferTerminus`. NS/EW/CG/NE/CC/CE/DT/TE + LRT BP/SE/SW/PE/PW, with zh/en names and colour **token names** (`line-ns`… `line-lrt`), no hex values |
| Ranking | `rankItineraries(its, pref)` → best first, each with `labels` (`recommended`, `fastest`, `least_walk`, `fewest_transfers`, each given to one option) and `summary {minutes, walkM, changes, fare, services[]}`. Also `formatSummary(summary, lang)`, `scoreItinerary`, `ELDERLY_WEIGHTS` |
| Steps | `buildSteps(itinerary, lang, {destinationName})` → `Step[]`. Kinds: `walk_to_stop`, `board_bus`/`board_train` (`isTransfer`), `ride_bus`/`ride_train` (`stops[]` placed along the geometry, `stopCount`), `walk_transfer`, `walk_to_destination`. Each step has `id, key, params, text, detail, geometry, start, end, lengthM, durationS`. `buildJourneySteps(journey, lang)` |
| i18n | **`src/shared/src/i18n/steps.ts`**: the only copy table (zh-CN, en-SG), with `{x}`, `{n:one\|many}` and optional `[[…]]` parts. Creative can rewrite it freely |
| Multi-stop | `planJourney(places, fetchPlan, {departAt, preference, defaultDwellMin})` (async; `fetchPlan(from, to, departAt)` returns the raw body or a PlanResult), `chooseSegmentItinerary` |
| Guidance | `createGuidance(steps, t)`, `guidanceReducer(state, event, config?)`, `DEFAULT_GUIDANCE_CONFIG`, `currentStep` |
| Voice | `cueToSpeech(cue, lang)`, `SPEECH_LANG_TAG` |
| Share | `toSharePayload(state)` → `{lat,lng,acc,heading?,speed?,etaISO?,stepText?,status}`, or `null` before the first fix |
| Simulator | `simulateFixes(itinerary, {speedWalk, speedBus, speedTrain, jitterM, seed, intervalS, acc, waitCapS})`, `injectDeviation`, `mulberry32` |

### Guidance rules (as built)
- Events: `fix`, `next`, `previous`, `on_board` ("I'm on the bus"), `got_off`, `reroute_done{steps}`, `tick`. `state.cues` holds only the cues from the latest event.
- Fixes with `acc > 100 m` (or NaN) are ignored, and `gps_weak` fires once per weak spell.
- Off-route needs **3 consecutive good-accuracy fixes** further than 50 m from the path when walking, 80 m when waiting at a stop, or 150 m on transit. "Good accuracy" means ≤ 50 m on foot and ≤ 100 m on transit. It clears after 2 fixes closer than 0.6 × the threshold (hysteresis). A fix inside the band breaks a pending streak. Each episode has its own `off_route` and `back_on_route` cue.
- `get_off_next_stop` fires when the rider passes the last intermediate stop by 25 m. A one-stop ride fires it on boarding. A long ride with no intermediate stops (data probably missing) falls back to distance: 400 m for a bus, 1200 m for a train. `get_off_now` fires at 150 m (bus) or 300 m (train), capped at 0.6 × the last gap between stops so that "next stop" always comes first. If both conditions become true on the same fix, only "now" is spoken.
- Boarding is detected from the "I'm on the bus" button or from ≥ 120 m of travel along the ride path. A ride ends within 30 m of the alighting stop, or when the user is clearly already walking the next leg.
- Every cue fires once per step (`fired[]`). The exception is `step_changed`, which is re-emitted on manual navigation so the instruction is read again.
- Progress and remaining time are based on time (planned step durations). ETA = time of the last event + remaining time.

### OneMap shape: verified vs assumed
- **Verified** against a live response published in a public repo (ang-kl/gia `geoloc/ONEMAP_API_Sample.MD`, request dated 10 Nov 2025, Farrer Park → Labrador Park area), plus three third-party clients:
  - top level is `requestParameters`, `plan.{date, from, to, itineraries[]}`;
  - times are epoch ms, durations are seconds, and `fare` is a **string** ("1.77");
  - `mode` is `WALK`, `BUS` or `SUBWAY`. `route` and `routeShortName` are "NE" or "963", `routeId` is equal to the route, and `routeLongName` is "NORTH EAST LINE" or "TTS BUS 963";
  - `agencyName` is e.g. "SBS Transit" or "SMRT Corporation";
  - stops look like `{name, stopId:"FERRY:NE8", stopCode:"NE8", lat, lon, arrival, departure, stopIndex, stopSequence, vertexType}`. Bus stop codes are 5 digits;
  - `intermediateStops[]` has the same shape as a stop. `legGeometry.points` is a Google polyline (precision 5) and contains `??` zero deltas;
  - walk `steps[]` often hold a single `DEPART` on a bogus "path" street. Transit legs have `steps: []`;
  - a direct MRT→MRT change (NE1 → CC29) shows up as two back-to-back SUBWAY legs with no walk leg between them, and the wait is the time gap;
  - **some bus stop names carry the station exit** ("FARRER PK STN EXIT A") → parsed into `Stop.exit`.
- **Assumed / not yet seen:**
  - `RAIL` or `TRAM` modes for LRT. We handle `TRAM`, `RAIL`, `MONORAIL` and GTFS `routeType`;
  - a `headsign` field, which was absent in the sample. We infer "towards" from the station numbering and a terminus table. Termini need checking as new stages open: TEL, DTL and the Circle Line closing its loop (CC30–32);
  - MRT exit numbers on the final walk. They are not in the sample, so we parse them when present;
  - the error body format. We handle `{error:"…"}`, the OTP form `{error:{msg, noPath}}`, and a missing `plan`, which is treated as no route;
  - whether `fare` is the adult card fare or a concession fare.
- **Fixtures** (`test/fixtures/`) are **SYNTHETIC**. They have the same field set as the real response, but the trips are invented: Toa Payoh → TTSH by bus 139, or by NS 1 stop; Bishan → Raffles Place on NS, or with an NS → NE change at Dhoby Ghaut; Ang Mo Kio bus 73 → walk → NS → TTSH (mode "RAIL", numeric fare).
- Station names are shown in English in zh steps (for example "步行到 Bishan 地铁站"). There is no zh station-name table yet.

### Not committed / notes
- `npm install` created a root `package-lock.json`. It was left uncommitted because it is outside my scope; the Director should commit it at merge.

### Next steps
1. Once the Worker has a OneMap token, record 5–10 real `routeType=pt` responses: bus only, MRT only, an LRT trip, an interchange, a no-route case and an error. Add them to `test/fixtures/recorded/` and run the normaliser test over them. Remove whichever "assumed" items above they settle.
2. Worker: call `normalizeOneMapPlan` server-side, or pass the body through and normalise on the client. Either way, pass `departAt` → OneMap `date=MM-DD-YYYY&time=HH:MM:SS` in SGT.
3. Web: wire `guidanceReducer` to `watchPosition`. Speak `state.cues` by priority, where `high` interrupts. Persist `GuidanceState` to make offline/resume work. Use `simulateFixes` with the `./fixtures` export for demo mode.
4. Add a zh station-name table (LTA has one) and an MRT exit table for the final station (S3 in the plan).
5. Add LTA BusArrival to the board step: "Bus 139 comes in 4 min".
6. Field-test the thresholds (`DEFAULT_GUIDANCE_CONFIG`) with real phones. MRT tunnels will mostly produce `gps_weak`, and trains rely on the `on_board`/`got_off` buttons and the station-distance cues.
