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

## 2026-11-17 — M1 UI round (Developer, branch `dev/m1-ui`)

**Done.** The placeholder views are replaced by production screens built to STYLE-GUIDE v1.1 (§1–5, H1–H4, H13, §6b F1–F8; `dev/creative-b` merged).
- **Tokens:** `src/web/src/styles/tokens.css` holds the prototype `:root` values verbatim: light, dark, and auto via `prefers-color-scheme` (guarded by `data-theme`). It also sets `--ts` from `html[data-text-size]` (100/125/150/200 %) and defines the map aliases. `styles/app.css` holds the component rules, copied from the prototype. The stage is a full-bleed phone layout, with a 480 px centred column at ≥ 600 px.
- **Reduce motion:** `html.rm` is set from the OS setting or from Settings → 减少动画.
- **Fonts:** Google Fonts, `display=swap`, weights 400/700/900.
- **Settings model:** `textSize` gains `xxlarge` (200 %). New settings `motion` (auto/on/off) and `name` (the greeting).
- **Screens:**
  - H1 Home: greeting by SGT hour, with the optional name.
  - H2 Search: debounced live search with recent, results, empty, loading, error, offline and busy states. The mic uses Web Speech (zh-CN / en-SG) through the new `platform.recognition`; it is hidden when that is unsupported.
  - H3 Route options: shared ranking with least walking as the default. Cards show the tag, duration, arrival time, chips and facts; there are no stairs or lift facts. Notes: only one option, and the honest bus-times note.
  - H4 Trip overview: map plus timeline. Start appears only with `?ff=guide` / `VITE_FLAGS=guide` (OQ5).
- **§6b states:**
  - F1 first run: 3 pages. It is the root of the stack, and Skip or Done never shows it again.
  - F2: location explainer before any browser prompt, and denied help with Android/iPhone tabs.
  - F3 route states: loading skeleton with the seal mark (+6 s line), none, too close, outside SG (destination / me), error, busy, offline with auto-retry.
  - F4 search states.
  - F5 toasts: updated, offline/online (a drop under 3 s is suppressed), installed, home-set, cleared, copied, report.
  - F6 Settings as a full screen: Me / Display / History / This app, with name, home, clear, install and report sheets, plus an About & privacy screen.
  - F7 update banner, on Home only.
  - F8 Home mapping: location pill = From, Recent under My places, "Set your Home" dock.
- **Map:** route casing, walk dotted in ink-2, bus in primary, MRT in its line token. Boarding and alighting stops; saffron destination dot. All colours come from tokens.
- **Test hooks:** `state:` lines for every new state: `routes-*`, `search-*`, `toast-*`, `trip-bus|mrt|walk`, `home-*`.
- **Tests:**
  - vitest: 50 tests (+14): presentation helpers, i18n key parity (AC 8), router `replaceSheet`/`reset`, SG box, settings defaults.
  - Playwright: 52 tests, about 55 s including the build:
    - zh/en journeys and dark mode;
    - 200 % layout checks: clipping, horizontal scroll, overlap, 56 px targets;
    - Back on every screen and sheet;
    - location explainer → denied; first run; offline; too close;
    - 36 screenshot baselines in `src/web/e2e/baselines/`.
- **Bundle:** app JS 58 KB gz (budget 150). MapLibre is still lazy.

### Visible changes for Creative's review (exact strings → where)
| Where | zh | en |
|---|---|---|
| H1 bar | 怎么去? (B seal mark) · EN · AA (SR 字体大小：{n}%) · ⚙ (SR 设置) | 中 / Text size: {n}% / Settings |
| H1 greeting | 早上好 / 下午好 / 晚上好[，{name}] · 今天想去哪里？ | Good morning…[, {name}] · Where would you like to go today? |
| H1 pill (From) | 你在：家附近 · 你在：{label}附近 · 从：我的位置 · 从：{typed place} (SR 出发地：{p}，按一下更改) | You are near: … / From: My location |
| H1 | 说出或打出地方名字 · 常去的地方 + date · 家 tile · 最近去过 rows · 需要帮忙？/打电话给家人，或给司机看地址 | Say or type a place · My places · Home · Recent · Need help? … |
| H1 dock | 带我回家 (home set) · 设好你的家 (no home) · toast 你现在就在家附近，不用找路啦。 | Take me home · Set your Home · You're already near home. No trip needed. |
| H1 offline note | 没有网络，已保存的行程还能用 | No internet. Saved trips still work. |
| H1 update banner | 有新版本 · 更新 · ✕ (SR 以后再说) | New version ready · Update · Later |
| H2 titles | 去哪里？ · 找你的家 (set-home mode) · **打出发的地方 (From mode, borrowed from F3)** | Where to? · Find your home · Type where I'm starting |
| H2 | 地方名字 · 用说的 · 我在听…请说地方名字 · 最近去过 · 找到这些地方 · 没找到“{q}” · 换个说法试试… · 我在找… · From mode first row: 用我现在的位置 | Place name · Speak · … |
| H3 | 怎么去 {p}？ · 从：{p} · 推荐 · 最少走路 / 最快 / 最少转车 · {n} 分钟 · 上午 10:27 到达 · 走路 {n} 分钟 · 不用转车 · {n} 站 · 选这条路 · notes 这里很近，只有一条好走的路。/ 巴士时间来自实时信息，可能会有几分钟变化。 · 帮忙 | How do I get to {p}? … |
| H4 | 去 {p} · {n} 分钟 · {t} 到达 · 走到 {p}/大约 {n} 分钟 · 坐 {s} 号巴士，坐 {n} 站/在 {p} 下车 · 坐地铁 {l} 线，坐 {n}[ · 往 {p} 方向] · 到达 {p}/{address} | To {p} … |
| F6 Settings | 设置 · 我 / 称呼 (没有设) / 家 · 看和听 + 语言 Language / 字体大小 100–200% / 颜色 跟手机·白天·夜间 / 减少动画 跟手机·开·关 · 记录 / 清除最近去过的地方 (没有记录) · 这个应用 / 安装到主屏幕 / 报告问题 / 关于和隐私 · 版本 0.1.0 | … |
| F6 sheets | Name: title **怎么称呼你？ (F1 page 2 title)**, 保存 / 删除称呼 · Home: title **家：{label}**, 换个地址 / 删除 · Clear / Install / Report as in §6b | |
| End-trip sheet | 要结束这次行程吗？ · 结束后，语音和地图提示会停止。 · 继续行程 / 结束行程 | End this trip? … |

### Deviations from the frames (with reason)
1. **Logo:** the wordmark uses `creative/logo/b-qu-seal.svg` as is (owner pick B, D-8). The manifest icons and favicon wait for Creative's B master. `theme_color`/`background_color` = `c-canvas`.
2. **Baselines** are at DPR 1 (round brief), not DPR 2 (§6). Fonts and OneMap tiles are stubbed in tests, so baselines render with system fallback fonts. The map canvas and `<img>` are masked.
3. **The 8 §6b icons** (wifi-off, refresh, install, ios-share, info, trash, person, report) were drawn by Dev on the 24 px grid with a 2.2 stroke. They still need Director approval and a Creative check.
4. **"设为家" per search row removed.** Home is now set only through the set-home mode (F1 / F8 / F6), which has Creative copy.
5. **H2 From-mode title** borrows F3's "打出发的地方 / Type where I'm starting", because no title exists for that mode. Creative to confirm.
6. **F2 "unavailable" note:** it shows as an H3 state panel (Try again · Type a place), because there is no From field on H3.
7. **Too close:** distance is a straight line, and minutes assume 1 m/s.
8. **H3 notes:**
   - The honest note says bus times are *live*. M1 has no live bus data, only OneMap schedules. **Creative/Director: keep or reword?**
   - "这里很近…" shows for any single option, as §5.2 says, even when the option is far.
9. **H3 tags:** a card with no preference label has no tag pill. The sample's second card shows "最快", but the engine gives that label to the best card when it is also fastest.
10. **Motion:** only the incoming screen animates (push 12 % / pop −6 %). Sheets rise with the spring but close without the exit animation.
11. **Map:** line width 6 px, casing +4 px, stop dot r 6, destination r 10. These are map-only values with no token.
12. **Not built:**
    - the H1 "Add a place" tile (saved places beyond Home = M4);
    - the F8 Swap button (Director to rule);
13. **F6 details:**
    - Voice/vibration rows are hidden (flag `guide` off).
    - The About contact bullet is omitted until the owner supplies the PDPA contact.
    - The en LTA line has no "Transport data:" prefix (no en copy given).
14. **F1:** if storage throws, the first run reappears on every load, not once per session.

### Left for the fix round / M2
- **Old shell placeholder strings still in use** (no frame yet):
  - Guide, Share, Viewer, Help and 404 screens;
  - `no_route` on H4 without options;
  - the map `error_generic`, `recentre` and `overview` labels;
  - `continue_trip`.
- **H2 listening state:** no baseline (`H2-listening` needs a recognition stub).
- **Missing baselines:** F3 loading/none/error/busy/offline, F4 error, F5 toasts, F6 name/clear/install, F7 update. These need mock error injection; the spec already has the hooks.
- **AC 4:** the two-build SW update e2e. AC 45: the `npm run gate` script (axe, Lighthouse, secret scan).
- **Shared step templates** (`src/shared/src/i18n/steps.ts`) still use the engine's wording (步行到…, 走路最少). H3/H4 use the web copy from the frames. Align them for M2 guidance.
- **Platform `VIBRATE_PATTERNS`** do not match §3 yet (M2).

### Next steps (precise)
1. Creative reviews the visible-changes table and deviations 4, 5, 8 and 9. Director approves the 8 icons and rules on Swap (F8).
2. Add a mock-API fault switch (`?fault=route:429|500|none`) and record the remaining F3/F4/F5/F7 baselines.
3. Swap in the logo B master: favicon, apple-touch-icon, manifest icons 192/512/maskable.
4. Write the gate script and the two-build update e2e.
5. M2: turn on `guide`, build H5/H6/H11/H12 on the same kit (`ui/kit.tsx`, `views/present.ts`), and align the shared step strings.

## 2026-11-17 — M1 batched fix round (dev/m1-ui) · Developer (fresh)

### Visible changes (exact strings, where)
| Where | Change |
|---|---|
| Every bar, About, F3 loading seal | Logo B master geometry (favicon.svg): `#9A3412` tile rx 96, `#FBF5EC` 去 strokes w 64, `#FFD23F` dot (`seal-dot` pulse kept) |
| Browser tab / home screen | favicon.svg + favicon-32.png, apple-touch-icon (180), manifest icons 192/512 + maskable 192/512 |
| H1 Home | "需要帮忙？ / Need help?" row hidden (flag `help`, QA-1); at 150/200 % the wordmark text is visually hidden (seal stays, h1 text for SR) and the search button's trailing magnifier is hidden |
| H3 bars, H4 bar | "帮忙 / Help" pill hidden (flag `help`) |
| H3 Route options | New bar button **对调 / Swap** (route icon rotated 90°, SR "对调出发地和目的地 / Swap start and destination"); "巴士时间来自实时信息… / Bus times are live…" note hidden (flag `live`); single option note: < 1 km "这里很近，只有一条好走的路。" else **只找到这一条路。/ This is the only way I found.**; card fact **走路 {m} 米 / Walk {m} m** (was minutes; rounded to 10); duration reads "13 分钟" (a space instead of a 4 px margin); From line keeps the icon beside the text |
| F3 close | metres rounded to 10 (min 10); < 30 m: **你已经在这附近了，走几步就到。/ You're already nearby, just a few steps away.** |
| H2 Search | From-mode title **从哪里出发？ / Where are you starting from?**; no-result uses the §6b state panel (tile → headline → body, left-aligned); titles in rows are ink; at 150/200 % row icon tiles hidden |
| H4 Route detail | MRT step: **坐地铁 [NS]，往 {dir} 方向，坐 {n} 站 / Take the [NS] train towards {dir}, {n} stops** with the line tag inline; train disc is ink like bus; step text unchanged colour; map: OneMap attribution pinned top-left; my-location dot + accuracy circle and a 56 px recentre button (icon, SR "回到我的位置"); **放大地图 / Bigger map** ↔ **缩小地图 / Smaller map** toggle under the map |
| F1 / F6 | Selected radio card / segment shows a check icon; F6 rows: label keeps its words next to a value; 中文/English buttons carry `lang` |
| F2 explainer | 72 px tile above the title |
| Copy (zh + en) | All straight `"…"` quotes → `“…”` |
| Motion | Outgoing screen slides −6 % (pop +12 %) and fades over 280 ms; sheets drop + scrim fades on close; under reduce motion 120 ms fades (incl. sheets, toasts, banner) |
| Misc | "帮忙"/pill text 20 px (iconbtn 1rem); dock content fades under the dock; dark primary button uses black elevation; progress dots scale with text; `text-wrap: balance/pretty` on state headlines, sheet titles, bodies |

### Fixed
- **Director rulings / known items:** ruling 1 (live note behind flag `live`), QA-1 (Help row/pill behind flag `help`), ruling 3 / K-2 (Swap on Route options, `routes-swap`), ruling 4 / K-3 (H2 From title, new key `from_title`), ruling 5 / K-1 (logo B icons + favicon + apple-touch-icon in the manifest/index.html; `x_todo_creative` removed; Seal/Wordmark use the favicon geometry). AC 38: the map module logs `map:ready`, `map:route walk=n transit=n stops=n dest=1`, `map:me acc=circle|none`, `map:centre-me` (no coordinates) and `e2e/fixround.spec.ts` asserts on them.
- **Creative:** #1–#13 (all High and Medium), plus Lows #14–#22. Deviations: #7 uses `.row .tx:has(+ .val){flex:0 0 auto;word-break:keep-all;max-width:60%}` and `.tx{flex:1}` otherwise. Creative's rule as given made a long label with no value ("清除最近去过的地方") overflow at 200 % (QA matrix). #10 is played by an inert "ghost": a copy of the old screen or sheet in a closed shadow root (`ui/ghost.ts`). The router stays instant, and tests and screen readers never see duplicate testids or text.
- **QA:** QA-2, QA-3 (`router/deeplink.ts`: names come from revgeocode, with the coordinates as fallback; Back lands on Home), QA-4 (fact "走路 {m} 米"), QA-5 (dot + accuracy circle + 56 px recentre on Route detail), QA-6 (focus moves to the new screen's h1; Search keeps its input focus), QA-7 (canvas `tabindex=-1`; attribution moved out of the aria-hidden node, links tagged with testids), QA-9, QA-10 (`toggle-map`), QA-11, QA-12 (attribution pinned top-left; About `main` is focusable), QA-13 (root cause: the capture could land inside the new screen's enter cross-fade, a compositor-run opacity animation that `animations:'disabled'` does not always reach. `shot()` now waits until the app's finite animations have finished. No retries. 18/18 identical captures in a repro), QA-14 (passes; step text 7:1 in light and dark), QA-19 (`mock-*.js` is excluded from the precache and is still loaded on demand and runtime-cached in demo/mock mode).

### Not fixed (why)
- **QA-8 `npm run gate`:** it needs the root `package.json`, which is outside this round's scope (src/web, src/shared). It is a one-line change: `"gate": "bash qa/gate.sh"`. Director or owner to assign.
- **QA-15…18:** Worker (another developer's branch).
- **Test for QA:** `qa/tests/ac.spec.ts:553` ("需要帮忙？ leads to a useful Help screen") expects the Help row. Director ruling QA-1 hides it in M1, so QA should change the test to assert that `nav-help`/`bar-help` are absent (as `e2e/fixround.spec.ts` does). I did not edit it.

### Baselines re-recorded (35, all intentional; DPR 1, stubbed fonts)
H1-default (light-100-zh/en, dark-100-zh, light-200-zh), H1-away, H1-desktop-1440, H2-recent, H2-results (×4), H2-empty, H3-two (×4), H3-desktop-1440, H4-bus (×4), H4-mrt, H4-desktop-1440, M1-F1-lang, M1-F1-name, M1-F2-denied-android, M1-F2-explainer, M1-F3-close, M1-F4-offline, M1-F6-about, M1-F6-report, M1-F6-settings (×4). Causes: seal, hidden help row, dock background, Swap/notes/metres, map toggle/attribution, line tag, check icons, quotes, state panel.

### Gate (`bash qa/gate.sh`, 7c4e2c3)
10/11 PASS: deps, typecheck, unit 212, i18n, build 60.1 KB gz, static-pwa (no warnings), secrets, dev-e2e 60/60, lighthouse (perf 85, a11y 100), artifact. qa-e2e 60/61: the only failure is the Help test above, which is wrong against the ruling. Still deferred: live OneMap/LTA, deploy/HTTPS, and real-device install/TalkBack/VoiceOver.

### Next steps
1. QA updates `ac.spec.ts:553` to the QA-1 ruling and re-checks QA-1…14 and QA-19. The gate should then be green.
2. Director assigns QA-8 (root `gate` script).
3. Creative reviews the 35 re-recorded baselines, the #7 deviation and the exit motion on a device. Unstub fonts for one 100 % zh baseline per frame if wanted.
4. Worker developer: QA-15…18, then a smoke test with credentials.
## 2026-11-17 — M1 Worker fix round (dev/m1-worker-fix): QA-15…QA-18
- **QA-15 / AC 15:** token renews when < 12 h are left (`RENEW_BEFORE_MS`). 401 renew-once-retry-once unchanged. Tests at 11.5 h (renews) and 12.5 h (keeps).
- **QA-16 / AC 17–18:** TTLs search 24 h, route 2 min, revgeocode 1 h keyed on 5 dp (was 4 dp). `Cache-Control` matches. New `test/logs.test.ts` captures every console call through token failure, 401, upstream 5xx and rate-limit paths and asserts no coordinates, query text, tokens, credentials or IPs. A deliberately leaked IP fails it.
- **QA-17 / AC 20:** 60 req/min/IP sliding window in isolate memory on search/route/revgeocode/bus-arrival/alerts → `429 rate_limited` + `Retry-After`. Share and health are not counted (D-7). IPs are SHA-256 hashed with a per-isolate random salt and pruned after the window. No `CF-Connecting-IP` → not limited.
- **QA-18 / AC 21:** `FIXTURE_MODE=1` (`npm run dev:fixtures -w @howtogo/worker`). The 5 synthetic trips are the 3 from `@howtogo/shared/fixtures` (imported cleanly) + 2 in `src/worker/fixtures/trips.ts` (Jurong East→NUH, Bedok→CGH). They are re-timed to the request. Also 9 search places, nearest revgeocode, re-timed bus arrival and normal alerts. `X-Fixture: 1`. Off by default.
- **Deviation from AC 21 wording:** the AC reads "no credentials → fixtures". The task asked for an explicit flag, so production without secrets answers `503 not_configured` instead of fake routes. Director to confirm. `@howtogo/shared` is resolved via the workspace and not declared in the worker's package.json (that would need a root lockfile change). The fixtures are lazily imported.
- Also: AC 19 upstream timeout 10 s → 8 s (QA missed it).
- 91 tests pass; typecheck clean.

## 2026-11-17 — Release prep: Creative R1–R3, QA-20, D-10 one-Worker hosting, sample-routes banner (dev/m1-ui)
- **Creative R1** (Med): app.css 150/200 % rules exactly as specified — the Settings value drops to its own line under the label, chevron stays on row 1. Re-recorded only `M1-F6-settings-light-200-zh` (the only baseline that changed; the other 33 passed untouched).
- **R2**: `ui/ghost.ts` rewrites `:root` → `.groot` in the adopted sheet and wraps the ghost copy in a `.groot` div carrying `<html>`'s classes, `data-theme`, `data-text-size`. **R3**: zh `not_set` = "还没设置".
- **QA-20**: `qa/scripts/lighthouse.sh` (the gate's Lighthouse step) runs each URL 3× (`LH_RUNS` overrides) and judges the median per category; every run's scores are printed.
- **D-10**: `src/worker/wrangler.toml` → name `howtogo`, `[assets]` directory `../web/dist` (no copy step), binding `ASSETS`, `not_found_handling = "single-page-application"`, `run_worker_first = ["/api/*"]`; KV + DO bindings and the `v1` sqlite migration kept; vars `FIXTURE_MODE="1"`, `ALLOWED_ORIGINS="https://howtogo.raus-ums.workers.dev,http://localhost:5173,http://localhost:4173,http://localhost:8787"`. Unit tests force `FIXTURE_MODE:"0"` in vitest.config.ts.
- Static headers come from `src/web/public/_headers`: `/assets/*` `public, max-age=31536000, immutable`; `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` `no-cache` (SPA fallback paths get Cloudflare's default `max-age=0, must-revalidate`); nosniff, HSTS, X-Frame-Options DENY, COOP, Permissions-Policy (geolocation=self), CSP allowing self + `wss://howtogo.raus-ums.workers.dev`, OneMap (img/connect), Google Fonts (style/font/connect), `blob:` workers for MapLibre. `public/_redirects` removed (Pages-only; SPA fallback is now `not_found_handling`). The PWA calls relative `/api` (VITE_API_BASE empty).
- Checked with `wrangler dev` + Chromium: `/api/health` → `{"ok":true,"fixtureMode":true}`; headers as above; `/settings` and unknown paths → index.html; `/_headers` not exposed; banner shows on live Home; search → Route options → Trip detail works, map canvas renders, **0 CSP violations**.
- **Sample-routes banner**: `GET /api/health` now returns `{ok, fixtureMode}` (no-store, not rate-limited). `src/state/sample.ts` checks it at boot (live mode only; failure = no banner); `?sample=1` forces it for the tab (tests/demo). Banner (`data-testid="sample-banner"`, role note, info icon, surface-2 `.note.sample`) on Home, Search results and Route options, placed under the top bar, `flex-shrink:0` so it stays whole at 200 %. Creative copy zh/en. Tests: worker health test, 3 web unit tests, `e2e/sample.spec.ts` (4: live on/off/500, all three screens at 200 % zh+en, not on Settings).
- Root scripts: `build:release` (= web build with `VITE_API_BASE=` empty → `src/web/dist`) and `deploy:preview` (build:release, then `wrangler deploy` in src/worker). Not run.
- `npm run gate`: **GATE PASS, 11/11** — unit 231, dev-e2e 64, qa-e2e 68; Lighthouse medians `/` 82/100/100 (runs 74/82/85), `/about` 87/100/96, `/settings` 87/100/100; app JS 60.4 KB gz.

### Deploy steps for the Director (preview, fixture mode)
1. `cd src/worker && npx wrangler kv namespace create TOKEN_KV` → paste the printed `id` into `wrangler.toml` (`[[kv_namespaces]] id`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`).
2. Secrets: **none needed** while `FIXTURE_MODE="1"` (later: `wrangler secret put ONEMAP_EMAIL|ONEMAP_PASSWORD|LTA_ACCOUNT_KEY`, then set `FIXTURE_MODE="0"`).
3. From the repo root: `npm run deploy:preview` (builds src/web/dist, then `wrangler deploy`; the DO migration `v1` applies on the first deploy). The account's workers.dev subdomain must be `raus-ums` for the URL `https://howtogo.raus-ums.workers.dev`; otherwise update `ALLOWED_ORIGINS` and the `wss://` host in `_headers` CSP.
4. Smoke: `curl https://howtogo.raus-ums.workers.dev/api/health` → `{"ok":true,"fixtureMode":true}`; open `/` → the "示范路线" banner shows.
- Dry run (`npx wrangler deploy --dry-run --outdir …/wrangler-dry`, wrangler 4.163.0, no API calls): config valid; read 19 files from `src/web/dist`, total upload 66.54 KiB / gzip 19.45 KiB; bindings `TRIP_SHARE` (Durable Object TripShare), `TOKEN_KV` (KV, placeholder id), `ASSETS`, vars `ALLOWED_ORIGINS`, `SHARE_TTL_HOURS="4"`, `FIXTURE_MODE="1"`.
