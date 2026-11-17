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

## 2026-11-17 — Web shell, infrastructure only (Developer, branch `dev/web-shell`)

**Package:** `@howtogo/web` (`src/web`). Vite 8 + Preact 10 + `@preact/signals` + TypeScript. It imports `@howtogo/shared` from source. This round has **no visual design**: the views are bare semantic HTML with `data-testid`s, and the code invents no colours or spacing.
Scripts: `dev`, `build` (prints one size line and fails over budget), `preview`, `test` (vitest, 36 tests, about 2 s), `e2e` (Playwright, 5 tests, about 10 s including the build), `typecheck` (app + SW).
Bundle: app JS **42 KB gz**, against a budget of 150 KB. MapLibre is 265 KB gz and is lazy-loaded only when a map mounts. sw.js is 1.2 KB.

### Module map (`src/web/src`)
| Module | What |
|---|---|
| `main.tsx` | Bootstrap. Chooses the mode (live, `?mock=1`, `?demo=1`; the mode sticks per tab via sessionStorage). Builds the API, platform, store, router and runtime. Reflects settings on `<html lang data-text-size data-theme>`. Resumes an unfinished trip. Registers the SW (prod only). Asks the SW to cache the trip's corridor tiles. |
| `router/` | `routes.ts` is a pure `matchRoute`. `router.ts` puts every screen and sheet in history: `history.state = {howtogo:1, idx, sheet?}`. `navigate`, `openSheet`, `closeSheet` and `back` each move one step. A deep link gets Home seeded under it; `/t/:id` is standalone. Path routing, with `public/_redirects` as the SPA fallback. |
| `platform/` | `types.ts` holds the D-4 interface: location watch/current/permission, heading (iOS permission), speech (zh/en voices, priority, mute), wake lock (re-acquired on visibilitychange), vibrate(pattern name), notify(cue), share (Web Share → clipboard), battery. It is all async, with no DOM types. `web.ts` is the browser implementation. `fake.ts` is a scripted fix stream that records speech, vibration and notifications. `createDemoPlatform` combines fake location with real speech. |
| `api/` | `client.ts` is the HTTP client for API.md, with timeouts (10 s, route 15 s), typed `ApiError` (`kind`, `status`, `code`, `retryAfterS`, `retryable`, `shareGone`) and SGT date/time. The live WebSocket reconnects with backoff (1 s→30 s, jittered). After a drop it checks the share with GET and stops on 404/410, `ended` or `expired`. `offline.ts` provides the `online` signal and an `offlineAware()` wrapper that fails fast. `mock.ts` serves the shared fixtures, re-timed to the requested time, with a localStorage share relay that enforces the 3 s limit and the help bypass. |
| `state/` | `storage.ts` wraps every storage access in try/catch. `store.ts` holds the signals: settings (zh, standard, auto, unmuted, least_walk by default), saved places (Home), the last 5 recents, the plan (sessionStorage) and the active trip (localStorage `howtogo.trip.v1`: itinerary, GuidanceState, share credentials). The trip is written at once on a step, status or share change and at most every 2 s otherwise, plus on pagehide. |
| `trip/runtime.ts` | Location → `guidanceReducer` → cues (log line, `cueToSpeech` → speak, vibrate, notify) → share PUT (≥ 3 s apart, latest fix wins). It honours 429 Retry-After, drops the share on 404/410, and status `help` bypasses the limit (D-7). On `off_route` it re-routes from the current fix to the final place (at most once per 20 s) and sends `reroute_done`. It also offers next/previous/onBoard/gotOff/repeat, start/resume/end, startShare/stopShare/help, and a 30 s ETA tick. |
| `map/` | `onemap.ts` holds the tile URL, bounds/zoom (from OneMap's TileJSON), attribution, and the tile maths and corridor tiles. `follow.ts` is the pure follow-me reducer: a gesture sets free; only recentre or a step change sets follow; there is nothing time-based. `map.ts` is the lazy MapLibre controller: raster OneMap with Default/Night, route layers whose colours come from CSS variables, a puck with accuracy circle and heading cone, follow camera (heading-up, pitch 30), fitRoute and setTheme. `MapPanel.tsx` is the component (aria-hidden, with recentre and overview buttons). |
| `sw/sw.ts` | Hand-written classic SW. It precaches the shell; the file list is injected at build time by the `howtogo-sw` plugin in `vite.config.ts`. Navigations are network-first (3 s) with the cached shell as fallback. OneMap tiles are cache-first in an **LRU of 800** (re-put on hit, trimmed every 25 puts), plus a separate `trip-tiles` cache. `/api` GETs, except share, are network-first with TTL fallback: search/revgeo 1 d, route 10 min, bus 60 s, alerts 5 min. Lazy assets are cached at runtime. A new SW waits for `SKIP_WAITING`. |
| `pwa/` | `register.ts` exposes the signals `updateReady` and `justUpdated` and `applyUpdate()`. The page reloads on controllerchange, and the next launch shows "已更新". It also has trip-tile messages. `install.ts` captures `beforeinstallprompt`. |
| `log.ts` | `window.__howtogoLog` (alias `__hooks`), change-only, last 200 lines: `screen:/guide`, `sheet:end-trip`, `cue:get_off_now`, `api:route 200`, `route:n=3 pref=least_walk`, `trip:resumed`, `reroute:done`, `share:help`, `loc:ok`, `sw:update-ready`. It never logs coordinates or search text. `report.ts` builds the redacted report. |
| `views/`, `app.tsx`, `i18n/ui.ts` | Placeholder screens for every route, plus the `end-trip` sheet as a history entry. There is a minimal zh/en string table. |

### Demo mode
`/?demo=1[&demoMs=400]` uses the mock API and the demo platform. "My location" is the fixture origin (Toa Payoh). Searching "tan tock", "raffles" or "陈笃生" returns fixture places, and route options are the fixture itineraries re-timed to now. When a trip starts, `simulateFixes(itinerary, {speedWalk:3, intervalS:2, waitCapS:20, seed:7})` plays one fix every `demoMs` ms through the real runtime, so speech, vibration and the share relay are all real code paths. The playback index is kept in sessionStorage so a reload resumes mid-trip. `?mock=1` uses the mock API with the real device GPS. Viewer: open `/t/<id>?demo=1` in another tab of the same browser.

### Tests
- **vitest:** store (defaults, persistence, corrupt or throwing storage, trip resume); runtime (bus trip cue order, speech, vibration, notify, wake lock; mute; reload/resume; share throttle with latest fix, 429 Retry-After, 410 drop, help bypass; re-route; end deletes the share); API client (URLs, SGT, typed errors, timeout, offline, backoff, WebSocket reconnect/ended/expired); mock; router (sheets, deep-link seeding, reload, standalone viewer); follow-me; log.
- **Playwright** (headless Chromium from `/opt/pw-browsers`, against `vite preview` of the prod build):
  - the demo flow search → route → guide with get_off_next_stop before get_off_now and arrived_destination last;
  - a reload mid-trip resumes;
  - Back goes guide→trip→routes→home, and a sheet takes one Back;
  - mocked geolocation;
  - the SW offline reload shows Home plus the offline notice;
  - MapLibre with OneMap attribution, with no page errors.

### TODO-creative (placeholders in code)
- CSS tokens read by the map: `--route-walk`, `--route-bus`, `--route-train`, `--line-ns|ew|cc|ne|dt|te|ce|cg|lrt` (the token names come from `shared/lines.ts`), `--puck`, `--puck-ring`, `--puck-accuracy`, `--route-line-width`. Fallback grey `#888888`.
- Manifest `theme_color`/`background_color` and icons (192, 512, maskable). The `<meta theme-color>` values are placeholders. There is no favicon or apple-touch-icon yet.
- All view markup and copy: `i18n/ui.ts` is a stub, and the offline, updated and error copy is placeholder text.
- Map height and collapse, recentre/overview button styling, and attribution placement at 150% text.
- Speech rate (0.9) and vibration patterns (`platform/types.ts VIBRATE_PATTERNS`).

### Notes / caveats
- The attribution wording is the one given in the brief. OneMap's docs require "the OneMap logo and attribution" but show no exact snippet, and their TileJSON carries none. `om_logo.png` was checked live and returns 200. A `Default_HD` 512 px tile set also exists, which could be an option for retina screens.
- The trip language is fixed at start: steps are built in that language. Switching the language mid-trip only affects the UI chrome.
- The web platform `notify` shows a notification only when the page is hidden and permission is granted. Requesting permission is a UI-round task, after the share or start-trip explainer.
- The root `package-lock.json` is updated and committed.

### Next steps for the UI round
1. Load the Creative tokens into a global CSS file: colours (light/dark, keyed off `html[data-theme]` + `prefers-color-scheme`), the type scale keyed off `html[data-text-size]`, and the map tokens above. Swap the placeholder views for H1–H9 frames. Keep every `data-testid`; the e2e suite depends on them.
2. Move `i18n/ui.ts` to Creative's copy. Add the missing-key check script (M1 AC 8).
3. Add a first-run (H1) gate using `settings.onboarded`. Add the location explainer (H4) before the first `platform.location.current()`.
4. Map: mount `MapPanel` in Route detail (collapsed by default) and Guide (follow-me). Add start, end and stop markers. Pass `steps` from `trip.guidance.steps`.
5. Add the update toast via `updateReady` / `applyUpdate()` / `justUpdated`. Add a second e2e with two builds for AC 4.
6. Gate: the `npm run gate` script (typecheck, unit, i18n check, secret scan, build + size, e2e, axe, Lighthouse) and rect-overlap/tap-size checks at 150% × 200% zoom.
7. Deploy the preview: Pages project `src/web/dist`, with `/api/*` routed to the Worker, or set `VITE_API_BASE`.

## 2026-11-17 — Dev data round: rail stations, termini, exits (Developer, branch `dev/data`)

**Module:** `src/shared/src/data/` (exported from `@howtogo/shared`). `stations.ts` is generated by `data/gen/build_stations.py` (not run by tests; header in `gen/header.txt`). `npm test -w @howtogo/shared` (111 tests) and typecheck pass; web typecheck and unit tests still pass.

### What is in it
- **191 stations** (184 open on 2026-11-17): all MRT (NS, EW, CG incl. Tanah Merah, NE, CC, DT, TE) and LRT (BP, SE/SW, PE/PW). Each has `codes` (31 interchanges with several), English name, official Chinese name, lat/lng, `lines`, `exits`, and `opens` when not open: DT36 Xilin, DT37/TE31 Sungei Bedok, TE30 Bedok South `2026-12-26`; TE22A Founders' Memorial `2028`; CC18 Bukit Brown, TE10 Mount Pleasant, TE21 Marina South `TBC`. CCL6 (CC30–32) is open since 12 Jul 2026. Old codes CE1/CE2 resolve to Bayfront CC34 / Marina Bay CC33.
- **Exits:** 613 LTA exit points → per-station exit codes with coordinates (combined MRT/LRT stations carry `part`). Landmarks only where a hospital's own page names the exit: Novena A → TTSH, Outram Park 7 → SGH campus (Exit 6 path closed since Aug 2025), Kent Ridge A → NUH. No other landmarks; none invented.
- **Helpers:** `stationByCode` (aliases, "ns-17"), `stationByStopId("FERRY:NE8")`, `stationByName` (OneMap upper-case names, Stn/Pk abbreviations, spacing, ≤2-letter typos, Chinese names; ambiguous → undefined; rail stops only), `stationForStop`, `zhStationName`, `stationLabel`, `lineStations`, `lineTermini`, `isStationOpen`, `inferHeading`, `DATA_AS_OF`.
- **Termini:** the hand table in `lines.ts` is gone. `inferTerminus(line, from, to, at?)` uses the lowest/highest station open on the travel date, so DT and TE switch from Expo/Bayshore to Sungei Bedok on 26 Dec 2026 by themselves (epoch ms read in SGT). **Circle Line** is now a loop (CC4…CC34→CC4) plus the Dhoby Ghaut spur: `inferHeading` returns `clockwise`/`anticlockwise` (rising numbers = anticlockwise, per LTA's HarbourFront platform signs) plus `via` = the next open interchange, as on the platform signs. Peak short-workings and the weekend Dhoby Ghaut–Stadium shuttle are not modelled.
- **Steps:** zh rail stops now read like the sign, for example "步行到 碧山 Bishan (NS17) 地铁站" and "在 诺维娜 Novena (NS20) 下车". The code is the one for the line in use. en text is unchanged. New copy keys `step.board_train.loop[.transfer]` for the CCL ("搭乘环线，逆时针方向（经滨海湾）" / "Take the Circle Line, Anticlockwise (via Marina Bay)"); **Creative to review**. Snapshots are updated (9 zh lines changed).

### Provenance
- MRT codes, English and Chinese names, and opening dates come from en.wikipedia "List of Singapore MRT stations" (fetched 2026-11-17), whose name columns cite LTA's 2026 System Map (English/Chinese). These are facts under CC BY-SA, and no prose was copied.
- LRT Chinese names come from the zh.wikipedia line articles (武吉班让轻轨, 盛港輕軌, 榜鹅轻轨), converted to simplified.
- Exits and coordinates come from data.gov.sg "LTA MRT Station Exit (GEOJSON)" (`d_b39d3a0871985372d7e1637193335da5`, updated 2026-10-18; Singapore Open Data Licence v1.0, so the attribution already in the About copy covers it). Station point = mean of its exits. The 6 unopened stations without exits use Wikipedia coordinates. The two sources agree within 320 m everywhere except Gul Circle.
- CCL direction terms come from LTA's CCL wayfinding and landtransportguru's CCL6 opening article.

### Low confidence
1. The Chinese loop words 顺时针/逆时针: I found no LTA Chinese signage for them.
2. Gul Circle coordinates: the LTA exit centroid is about 690 m from the Wikipedia point.
3. TE22A "2028": the date is only "end of 2028" and the station is never treated as open.
4. LRT zh names are from zh.wikipedia only, not checked against the LTA Chinese map.
5. The Kent Ridge → NUH exit comes from an NUH-linked directions page, not NUH's main site.
6. Opening dates for the 26 Dec 2026 stations come from news reports. Re-check after the opening.

### Next steps
- Field-check the zh loop wording and the three landmarks. Add more landmarks (polyclinics, markets) only from official pages.
- Web: use `exits` for the final-walk exit chip, and `stationLabel` / the zh name for the sign chip (STYLE-GUIDE H6b).
- Re-run `gen/build_stations.py` when stations open (TEL/DTL 26 Dec 2026, JRL, CRL). The JRL/CRL codes on interchange stations are filtered out until those lines exist in `lines.ts`.
- Bundle cost: `stations.ts` is 55 KB raw, about 12 KB gzipped.
