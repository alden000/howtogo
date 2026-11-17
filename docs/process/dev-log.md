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

## 2026-11-17 — M2 round 1: engine + runtime, no new screens (Developer, branch `dev/m2-engine`)

**Done.** Logic only. Screens are unchanged, and the M1 view files were not touched. "runtime" is `src/web/src/trip/` and "store" is `src/web/src/state/` (the existing folders).
- **Haptics (AC 37, 6c.13):** `VibratePattern` is now the shared `HapticName` (`tick|confirm|attention|getoff|arrive|gentle`). `VIBRATE_PATTERNS` = `HAPTIC_PATTERNS`, copied from the 6c.13 table. No `tap/notice/get_off/alert/arrived` names remain. New setting `haptics` (default on) silences all six.
- **Engine (`src/shared/src/trip.ts`, all pure):** haptic map, alert escalation reducer, resume decision, pocket reducer, manual-mode rule, location profile, stops-left countdown, MRT soft estimate, journey progress and total ETA, and the speech queue. `guidance.ts`: a segment guided on its own (built with `isWaypoint`) now ends with `arrived_waypoint`.
- **Voice copy:** Creative's 6c.14/H11 lines are in `i18n/steps.ts` (`cue.get_off_now` = 到站了，请下车。, `cue.gps_weak`, `cue.off_route`, `cue.arrived_waypoint`, `cue.arrived_destination` = 到了！, and `voice.*`). `cueToSpeech` gives the first alert line; `alertSecondLine()` gives the line spoken 2.2 s later. TTS rate: zh 0.9, en 0.92.
- **Platform (D-4):** new fields `capabilities {backgroundGuidance, speechNeedsGesture, os}` and `visibility {isVisible, onChange}`. `speak(text, lang, prio, {force})` now resolves when the line has been spoken; `force` plays even while muted. Web `wakeLock.acquire` dedupes in-flight requests. The fake platform gains `setVisible`, `setWakeLockOk`, `setPermission`, `emitError`, `watchIntervals`, `wakeLockRequests`, and the options `capabilities/voices/wakeLockOk/permission`.
- **Share contract (Director add-on):** `ShareStatus`/`SHARE_STATUSES` = exactly the Worker's `travelling|arrived|paused|help`. `toSharePayload(state, {status?, updatedAt?})` maps arrived → `arrived` and everything else, including off route and weak GPS, → `travelling`. It now sends `updatedAt`, and `acc` is required. `test/share-contract.test.ts` runs every PUT body of whole trips (off route, weak spell, help, arrival) through the Worker's real `validateUpdate`. The `cloudflare:workers` import is aliased to a stub in the vitest config.

### API for the UI round (`runtime` from `useServices()`)
**State:** `runtime.ui` (signal `TripUi`) has these fields:
- `phase`: `idle|guiding|waypoint|arrived`
- `alert`: `AlertState|null`, where `kind 'next'` = H6 and `'now'` = H6b. It also carries `stop`, `mode`, `shownAt`, `escalated`.
- `reroute`: `idle|searching|found|failed|offline`. `searching` and `found` are banners; `failed` and `offline` are trip notes.
- `manual`, `gpsWeak`, `pocket`
- `follow`: `follow|free`
- `wakeLockFailed`, `voiceUnlockNeeded`, `noVoice`
- `stale`: `{dest}|null`. G4 sheet.
- `resumed`: shows the toast.
- `stopsLeft`: `number|null`. Never counts up.
- `mrt`: `{stopsLeft, preAlertAt, station}|null`. The OQ3 "约 还有 N 站" estimate.
- `mrtPreAlert`: shows the banner for 4.2 s.
- `continuing`, `segmentError`
- `progress`: `{place, places, to, next, isLast, overall}`, i.e. "第 k 个地方，共 n 个"
- `etaMs`: total ETA, including dwell and later segments.
- `lastLine`

The trip and its step still come from `store.trip` (`guidance`, `journey {segment, plans}`, `phase`, `alert`, `places`).

**Actions:**
- `start(itinerary, places, {journey?})`, `planTrip(places)` (uses `planJourney`; ≤ 5 stops; `Place.dwellMin` 15/30/60/90, default 30), `startJourney(journey)`
- `resume()` (OQ5 window), `continueStale()`, `endStale()`, `unlockVoice()`, `dismissResumed()`
- `next()`, `previous()`, `onBoard()`, `gotOff()`, `repeat()` (say again, plays even when muted; repeats the alert lines while an alert shows), `ackAlert()`
- `touch()` (call it on any pointerdown/keydown on H5/pocket), `pocket()`, `setSheetOpen(bool)`
- `mapGesture()`, `recentre()`, `overview()`
- `continueJourney()`, `endAtWaypoint()`
- `dismissRerouteNote()`, `dismissWakeNote()`, `eta()`, `testVoice()`, `speakLine(line)`, `end()`
- Unchanged: `startShare`, `stopShare`, `help`, `clearHelp`, `heading`, `locationError`, `rerouting`, `attached`

**Behaviour, as built:**
- **Get-off alerts:** H6 → `getoff`, then line 1, then line 2 at 2.2 s. H6b → `getoff` twice, 800 ms apart, with high-priority voice. Both also `notify({tag:'getoff'})`. One repeat at 20 s if not acknowledged. The alert clears when the ride step ends, and it is not repeated after that.
- **Off route:** `gentle`, then a re-route to the *current segment's* destination (≤ 1 per 20 s). Then `found` (`confirm`, 4.2 s), `failed`, or `offline` (no call; retried on the `online` event).
- **Waypoint:** GPS stops at once, and the wake lock is released after 60 s. Nothing happens until `continueJourney()`, which re-plans from `location.current()`.
- **Arrival:** wake lock released after 60 s. The stored trip stays (phase `arrived`) until the UI calls `end()`. A reload drops it.
- **Manual mode:** permission denied, or no good fix for 60 s. Speaks the note once. Pocket view is hidden in manual mode.
- **Pocket view:** 45 s idle on walk/ride steps. Blocked by an alert, a sheet, the H11 banner/note, the waypoint screen, the voice bar, the stale sheet or the MRT banner.
- **Location profile:** walk 2 s, wait 5 s, bus 5 s, train 10 s, the last 2 stops 2 s. The watch restarts only when the interval changes.
- **Fixes:** duplicate or out-of-order fixes are dropped.
- **Language:** the trip language is fixed at start.

**Test hooks (`window.__hooks`):**
- `cue:<type>` (+ `cue:mrt_prealert`)
- `alert:next|now|ack|escalate|clear`
- `state:pocket` + `pocket:on|off`
- `state:manual|auto`
- `state:waypoint`, `state:continuing`, `state:segment-failed`, `segment:<k>`
- `state:resume|resume-ask|resume-drop`, `state:voice-unlock`, `resume:voice`
- `state:wakelock-failed`, `wakelock:on`
- `state:reroute-failed|reroute-offline`, `state:gps-weak`, `state:mrt-estimate`, `state:no-voice`
- `follow:on|free`, `loc:profile <ms>`

### Tests
- shared: 104 tests (+22 in `test/trip.test.ts`; 3 updated for the new copy and share statuses).
- web: 87 vitest tests. `test/runtime-m2.test.ts` has 30, using fake timers: escalation at 19.999 s vs 20 s, ack, ride end, H6b ×2, resume windows (ETA + 2 h / ask / 24 h, iOS voice bar), multi-stop (plan, waypoint, continue from here, failure, reload at a waypoint), manual mode, pocket view, wake lock + visibility, profile, follow over 10 min, language, dedupe, re-route found/failed/offline, MRT estimate. Plus `test/share-contract.test.ts` (3).
- e2e: 60/60. The demo test now also checks `alert:next` before `alert:now`, `state:resume` and `loc:profile 2000`. Typecheck is clean (shared, web, worker).

### Left / caveats
- **No UI:** H5/H6/H6b/H11/H12, G1–G6 and the Help subset are all for the next round. `Guide.tsx` still shows M1 placeholders. It works because `trip.guidance` is still the current segment's guidance.
- `main.tsx` still calls `void runtime.resume()`. The UI must render `ui.stale` (H1 sheet) and `ui.resumed` (toast).
- **Not done yet:** compass `requestPermission` at Start (AC 4) and the "End current trip first?" check (AC 5). Both belong to the UI Start flow.
- **Location profile on the web:** restarting `watchPosition` per leg is harmless, but it could be skipped on web (the interval is ignored there).
- **Thresholds are untested in the real world:** MRT estimate (30 s without a fix), manual mode (60 s), escalation (20 s). They need the owner's phone test.
- **Arrived trips:** a reload drops an arrived trip, so H12 is not shown again after a reload.

### Next steps (UI round)
1. Build H5 from `runtime.ui` plus the store trip, and call `touch()` from a capture listener. Add H6/H6b sheets bound to `ui.alert` + `ackAlert()`, the H11 banner/notes, G1 pocket, G3 waypoint (`continueJourney`/`endAtWaypoint`), G4 (`stale`, `resumed`, `voiceUnlockNeeded`), and G5 controls.
2. Build the H3 multi-stop builder → `planTrip()` → H4 timeline → `startJourney()`. Turn the `guide` flag on.
3. Add Playwright replays (bus, MRT + transfer, mixed, 5-stop, offline) and the entry-point matrix, asserting through the hooks above.
## 2026-11-17 — M3 + M4 Worker round (dev/m34-worker) · Developer (fresh)
Scope: Worker-side ACs only (`src/worker/`). 136 tests pass (was 91), typecheck clean. Contract details in `src/worker/API.md`.

**Endpoints added / changed**
- `GET /api/bus-arrival`: each `next[]` entry gains `monitored: boolean` (LTA `Monitored` 1 → true; 0/missing → false) — M3 AC 4.
- `GET /api/alerts`: adds `minor` (Status 1 + message, AC 24); each line adds `freeBusIslandWide`, `shuttleDirection`; station lists are now codes only (LTA `|`, `;`, `*` delimiters flattened). Tolerates `value` as array / single objects (LTA Jan 2026 revision). Cache key bumped to `alerts:v2`.
- **New `GET /api/lifts`** from `v2/FacilitiesMaintenance` → `{fetchedAt, lifts:[{line, station, stationName, liftId|null, desc}]}`, cached 5 min, 502/503 rules, in the 60/min read bucket — M3 AC 30.
- FIXTURE_MODE: `/api/lifts` fixture + `?fixture=` scenarios (bus `live|empty|not_configured`, alerts `normal|minor|disrupted|not_configured`, lifts `outage|none|not_configured`) — M3 AC 39. All new fixtures are labelled SYNTHETIC.
- `POST /api/share`: optional `senderName` (≤ 40) and `senderPhone` (E.164) — AC 18/OQ3. Phone removed from storage and from the ended state when the share ends. No destination coordinates anywhere (OQ4).
- `PUT /api/share/:id`: position now optional (status-only updates for start-before-fix, paused, help-only share; last position kept). **D-7: `help` bypasses the 3 s limit, max 1 help write/s** — AC 13.
- Share state adds `senderName`, `senderPhone`, `positionAt`, `helpAt`.
- Rate limits (AC 47): share create 10/h, viewer GET 1 per 5 s per share, setup create 5/h, setup GET 30/h (per IP, in-memory, hashed). `ratelimit.ts` now has named limits (`checkLimit`).
- **New caregiver setup box** (AC 40–41): `POST /api/setup {ct}` → `{code, expiresAt}`; `GET /api/setup/:code` returns the ciphertext once (then `410 setup_used`); 24 h (`410 setup_expired`), 4096-byte cap, body must be exactly `{ct}` (a key field is refused). New DO class `SetupBox` (`src/setup.ts`).
- OQ6: `SHARE_TEST_TTL_SECONDS` honoured only when `ENVIRONMENT="test"`; `test/config.test.ts` scans `wrangler.toml` and fails if either (or `FIXTURE_MODE`) appears outside `[env.test]`.
- `npm run record:lta -w @howtogo/worker` (AC 40, owner-run, refuses in CI).

**Contract changes the web client must follow**
- Bus chip: use `monitored` for Live vs Timetable.
- Alerts: `minor` → quiet Home line; `freeBusIslandWide`; `shuttleDirection`; station lists are codes.
- Lifts: poll `/api/lifts`; "lifts OK" fact only if `fetchedAt` < 15 min; show zh name by `station` code.
- Share create: send `senderName`, and `senderPhone` only if allowed. PUT without `lat/lng/acc` for status-only updates; `etaISO:null` on arrived. Viewer: use `helpAt`, `positionAt`, `updatedAt` (signal lost), poll GET at 15 s (5 s limit).
- Setup: `ct` = base64url (no padding) of `iv(12) ‖ ciphertext‖tag`, ≤ 4096 bytes; key only in `#k=`; GET only when about to show the preview (it consumes the box).

**wrangler.toml additions (appended block at the end, for the Director to merge with the static-assets change)**
- `[[durable_objects.bindings]] SETUP_BOX → SetupBox` and `[[migrations]] tag "v2" new_sqlite_classes ["SetupBox"]`.
- `[env.test]` (name `howtogo-api-test`) with vars `ENVIRONMENT="test"`, `SHARE_TEST_TTL_SECONDS="90"`, `ALLOWED_ORIGINS` (localhost 4173/5173), and repeated KV + both DO bindings (envs don't inherit bindings). If the static-assets change adds `[assets]`, repeat it under `[env.test]` too.

**Assumptions to verify with a real LTA key**
- FacilitiesMaintenance v2 reply is `{value:[…]}` with ≤ 500 rows (no `$skip` paging implemented); v2 has no dates (guide v6.11 lists none).
- `Monitored` arrives as number 1/0 (string "1" also accepted).
- TrainServiceAlerts after the Jan 2026 revision still matches §2.11 (defensive parsing in place; check `record:lta` diff).

**Not done / next steps**
- Web Push (AC 31, Should) not built.
- `smoke:live` (M3 AC 45) does not exist yet in the repo; add bus-arrival/alerts/lifts when it does.
- Arrival grace (30 min) has no test override; with the 90 s test TTL, expiry comes first in the two-browser test.
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

## 2026-11-17 — M2 round 2: guided-trip UI (Developer, branch `dev/m2-engine`)

**Visible changes (for Creative / QA review)**
- **Flags:** `guide` and `help` are **on by default** (AC 1). `?ff=-guide` / `?ff=-help` turns one off for a tab; `?ff=live` still adds `live`.
- **H3:** new secondary button **加一个地方 / Add a stop** under the From line (→ G2).
- **H4:** **开始出发 / Start** is shown. A multi-stop plan opens **H4 journey** (今天的行程, one block per part, dwell rows, note, 改一改).
- **H5 (new):** solid top band (结束 · voice toggle · 帮忙 pill; share pill, H11 banner, MRT pre-alert and the voice-unlock bar sit inside the band), a map window between the band and the step card, map controls (Follow / See whole trip, Share). The step card has a trip note, journey dots + "去第 k 个地方（共 n 个）", "第 n 步，共 m 步", ETA, the step icon tile, the headline (polite live region), sign chip, sub-line, bus badge / line tag, stops left + stop dots, progress bar and the G5 action rows (I'm on / I got off · Say it again · Pocket · Previous step / Next).
- **H6 / H6b:** a saffron panel and an ink takeover with saffron type, edge glow, OK. Back opens the End-trip sheet over them.
- **H11:** searching/found banner in the band. Re-route failed/offline is a trip note with Show the driver + 995.
- **Trip notes:** weak GPS, offline, manual mode (+ "found you" for 4.2 s), wake lock failed, no voice (+ a link to the G7 voice help sheet).
- **G1 pocket view** (black, dark tokens), **G3 waypoint** screen, **H12 arrival** (seal stamp, petals, 用了 N 分钟, Done, Route home).
- **H9 Help sheet** (M2 subset) on H1, H3, H4 and H5. **H10 Show the driver** (always light card; tabs Where I'm going / My home / Where I am). **G6 End your current trip?** and the **G4 stale trip** sheet.
- **G2 builder** screen (`/journey`), plus the dwell picker sheet and H2 in "Add a place" mode.
- **Settings:** 语音提示 on/off, **试听 / Test voice** (with the "no Chinese voice" caption and link), 震动提示 on/off.
- **Back on H5 / H6 / H6b / H11 / pocket / G3** opens the End-trip sheet (D8 guard history entry). Back on H12 goes to H1 and clears the trip.

**Done.** All views render from `runtime.ui` + `store.trip` and call only runtime actions. No guidance logic in views.
- `views/Guide.tsx`: H5 (Live), H6/H6b (GetOffAlert), trip notes, G1 Pocket, G3 Waypoint, H12 Arrival.
- `views/guideModel.ts` (pure, unit-tested): step group/icon, note priority (6c.10), G5 action rows (6c.7), alert copy, pocket text, stop dots, next stop, card max height + puck padding (6c.0), heading choice (AC 14: compass when slow → course > 1 m/s → north-up), follow zoom (AC 18).
- `map/GuideMap.tsx` + `map/map.ts` (`setFollow`, `setPadding`, `setFollowZoom`, `onGesture`, stale grey puck). The canvas is sized to the window between the band and the card, so labels are clipped to it. The puck sits at 66 % down that window. The follow mode is the runtime's (gesture → `mapGesture()`, Follow → `recentre()`, See whole trip → `overview()`, and a step change re-engages it). Nothing is timer-based.
- `views/tripSheets.tsx`: H9, H10, G7 voice help, G6, G4 stale, G2 dwell. `views/Journey.tsx`: G2 + the pure list edits.
- `views/TripDetail.tsx`: `useStartTrip()` is the single Start path (AC 2). It calls `heading.requestPermission()` inside the tap (AC 4), then `runtime.start`/`startJourney`, then `router.enterGuide()`. It shows G6 first when a trip is active (AC 5).
- **Router:** `NavState.guard` + `enterGuide()` + `setGuard()`. A reload on `/guide` seeds Home → guard → guide. `reset(path, then?)` (H12 Route home → H1 + H3).
- **main.tsx:** `DEFAULT_FLAGS`. After `resume()`: straight into H5, or G4 on H1 when stale.
- i18n: 150 new keys (`ui.ts`, zh + en, copy verbatim from §6/§6c). 11 icons added (5 approved 6c icons + speaker, mute, bell, car, phone, eye from §1.4). The `c-pocket` token and `styles/guide.css` (values from the prototype).
- `playwright.config.ts`: `E2E_PORT` (default 4173), so parallel worktrees don't share a preview server.

**Tests**
- vitest web: 109 (+ `test/guideModel.test.ts` 14 and 2 router guard tests).
- e2e `e2e/guide.spec.ts` (12):
  - bus trip zh: cue order, H6 → ack → H6b, Back over the alert, arrival, Back → H1 + trip cleared, spoken lines
  - MRT trip en
  - off route → found, then re-route failed note → H10 → ✕
  - manual mode
  - pocket: enter; the first touch only wakes the screen; alert breaks through
  - resume after reload: same step, toast, guard
  - Back/End + H9 subset + H10 Back → H9
  - multi-stop 3 places (waypoints "第 k 个地方，共 3 个", Back → End sheet → Back → G3, continue ×2, arrival)
  - entry points: Take me home, Home tile, recent
  - AC 5 G6
  - 200 % dark zh and light en: no clipping, ≥ 56 px, labelled and test-id'd controls on H5/H9/pocket/H6/H6b
- M1 specs updated for M2 behaviour: Start visible; Help on by default; Back on H5/H12 per D8/AC 47; the `:4173` URL checks now accept any port.
- **Baselines** (`e2e/baselines-m2.spec.ts`, 27, 390×844 DPR 1, the WebGL canvas hidden):
  - `M2-H5-walk` ×4, `M2-H5-ride`, `M2-H5-manual-walk`
  - `M2-H6-bus` ×3, `M2-H6-train`, `M2-H6b-bus` ×3, `M2-H6b-train`
  - `M2-G1-pocket-walk` ×3 (dark), `M2-G1-pocket-ride`
  - `M2-H11-failed`, `M2-H12-notshared` ×2, `M2-H9-m2-trip`, `M2-H10-dest`, `M2-G2-two` ×2, `M2-H4-journey-3`, `M2-G3-waypoint`
  - Re-recorded M1: `H3-*`, `H4-*`, `M1-F3-close` (Add a stop / Start).

**Deviations**
- **H5 headline = the shared step sentence** (`step.text`, e.g. "坐 4 站，在 Tan Tock Seng Hosp 下车"), not the H5 example "坐着就好，还有 4 站". It is the line the runtime speaks, so screen = voice (AC 22). The H5 copy is in the sub-lines ("下一站：…", "下车前我会提醒你。", "还有 N 站"). The MRT estimate uses the 6c.12 headline. Creative to confirm, or the runtime should speak the H5 templates.
- **Bus sign chip on H6/H6b** = "{stop} 巴士站" / "{stop} bus stop". There is no zh bus-stop name table yet (M3), so there is no "· {zh name}".
- **End-trip sheet over pocket view:** opening any sheet leaves pocket view (runtime `setSheetOpen` → touch), so the sheet is drawn over H5 in the normal theme, not over a dark pocket view.
- **G2 at 100 %:** the dwell chip and ↑ ↓ ✕ do not fit one row at 390 px in zh, so ↑ ↓ ✕ stay together on a second row (as at 200 %).
- **H10 "Where I am"** shows the reverse-geocoded name (no address lines). It is always the "I am here" card.
- **Not built:** the "全部步骤 / All steps" sheet (AC 12, Should); demo-mode buttons that play every new state (AC 50). The e2e drives those states through the fake platform instead. The H12 shared/told lines are M4 (AC 48).

**Next steps**
1. Creative review of the built M2 frames against §6c (baselines above). QA gate M2: map ACs to tests, and add the axe pass on H5/H6/H6b/H11/H12/G1/G3.
2. AC 50 demo controls, and the AC 12 All-steps sheet.
3. Owner phone test (thresholds, compass, voices, wake lock, pocket battery).
4. The GPS replay variant with the real `web` adapter (`context.setGeolocation`) is still to do. The current e2e uses the fake platform + simulator.

**Gate (`npm run gate`, once):** 7 PASS, 4 FAIL. Passed: typecheck, unit 334, i18n, build (app JS 93.2 KB gz, budget 150), static-pwa, dev-e2e 103/103 on the release build, artifact.
- `secrets`: the known wrangler.toml KV id flag.
- `deps`, `qa-e2e`, `lighthouse`: `qa/node_modules` is not installed in this worktree (`@axe-core/playwright`, `@playwright/test`, `lighthouse` are missing). These are environment failures, not code failures. Run `npm ci --prefix qa` before the QA gate.
## 2026-11-17 — Preview deploy without Workers Static Assets (dev/deploy-embed)
- **Why:** the agent HTTPS proxy injects our Cloudflare API token on every api.cloudflare.com request, overwriting the short-lived JWT of wrangler's `/workers/assets/upload` → 401. Script, KV and DO uploads work, so the preview embeds the PWA in the Worker.
- `src/worker/scripts/embed-assets.mjs` walks `src/web/dist` → `src/worker/src/generated/assets.ts` (gitignored): path → `{body (utf-8 text or base64), contentType, etag (sha-256)}` plus `_headers` parsed into a rules table; `_headers`/`_redirects` never embedded. Fails if dist is missing or > 5 MB (today 16 files, 1.3 MB raw / 408 KiB gzip bundle). `--if-missing` (pretest/pretypecheck) writes an empty map + `public/_headers` rules on a fresh checkout.
- `src/static.ts`: exact match, `/` → index.html, SPA fallback for extensionless paths, 404 for missing files with an extension and `/_headers`, `_headers` rules applied (same CSP/cache values; no rule → `public, max-age=0, must-revalidate` like Cloudflare), ETag/If-None-Match 304, HEAD, 405 otherwise. `index.ts`: non-`/api` paths → `env.ASSETS` if bound, else the embedded map (no origin check); `/api/*` unchanged.
- `wrangler.preview.toml` = `wrangler.toml` minus `[assets]` (kept for later). vitest now runs on the preview config. `deploy:preview` = build:release → `npm run embed -w @howtogo/worker` → `wrangler deploy -c wrangler.preview.toml`. `npm run dev:preview -w @howtogo/worker` for local.
- Tests: 99 pass (7 new in `test/static.test.ts`; `/nope` API-404 test now `/api/nope`, since `/nope` is a PWA route). Typecheck clean. Dry run OK (TRIP_SHARE DO, TOKEN_KV, 3 vars, no ASSETS). `wrangler dev -c wrangler.preview.toml` smoke: `/`, `/settings`, hashed JS, `/sw.js` headers as `_headers`; `/api/health` → `{"ok":true,"fixtureMode":true}`; `/_headers` 404; 304 works.
- Note: `qa/scripts/secret-scan.mjs` flags the real KV id in wrangler.toml (pre-existing, since d97ce71; it does not check the preview config).

## 2026-11-17 — Merge main into dev/m34-worker + M4 family viewer page `/t/:id` (dev/m34-worker)
**Merge (main → dev/m34-worker).** Kept both sides. `src/worker/src/index.ts`: lifts + `handleAlerts(url, env, ctx)` (this branch) and `/api/health` `{ok, fixtureMode}` + embedded static serving (main). `package.json`: both `dev:preview` and `record:lta`. `wrangler.preview.toml` gains the `SETUP_BOX` DO binding + `v2` migration (it is also the vitest config); `[env.test]` stays only in `wrangler.toml`. `test/config.test.ts` conflicted with D-10 (`FIXTURE_MODE="1"` in the preview `[vars]`): it now allows FIXTURE_MODE only in the top-level `[vars]`. Fixed a broken worktree `node_modules` (symlinks into the main checkout) by reinstalling.

**Viewer module map** (separate Vite entry, vanilla TS, no Preact, no SW, no analytics, no cookies; only `localStorage howtogo.viewer.lang`):
- `src/web/viewer.html` — static shell: noindex/no-referrer metas, generic OG (§6e.2), icon sprite, header, loading skeleton (text before JS), live regions.
- `src/web/src/viewer/state.ts` — pure: wire type, `applyShare` (history: help→cleared, arrived time, phone memory), `deriveView` → the 15 `data-state`s, `terminalFromHttp`, `stepKindOf`, `pickLang`, backoff.
- `copy.ts` (exact §6e.2 zh/en, pronoun-neutral defaults), `render.ts` (escaped HTML per state), `live.ts` (GET → WebSocket; reconnect 1/2/5/10/30 s; GET poll 15 s while down; honours 429 `Retry-After`; offline = socket down + GET network error), `viewerMap.ts` (lazy MapLibre + OneMap raster, puck/accuracy > 30 m/heading cone, grey on no-signal, follow until the viewer pans → locate button), `main.ts` (wiring, title, polite/assertive announcements on state change only, vibrate on help/arrived, 15 s tick), `viewer.css` (prototype values; `@import` of tokens.css so no JS chunk is shared with the app).
- Build: `vite.viewer.ts` (input + `/t/*` → viewer.html rewrite for dev/preview; viewer files kept out of the SW precache). `scripts/size-viewer.mjs`: viewer JS 10.3 KB gz (budget 60, excl. MapLibre).
- Worker: `src/worker/src/viewer.ts` serves viewer.html for `/t/*` on both paths (ASSETS `/viewer`, or embedded) with `X-Robots-Tag noindex, nofollow`, `Referrer-Policy no-referrer`, `Cache-Control no-cache` and a viewer CSP (self + own ws/wss + OneMap; no Google Fonts). `wrangler.toml` `run_worker_first` += `/t/*`.

**Contract assumptions.** No destination coordinates (OQ4) → no destination dot, map centres on the puck. `stepText` is free text in the sharer's language: shown verbatim; the pill icon is inferred from it (等/wait → clock, 走路/walk, 巴士/bus, 地铁/train). No pronoun field → zh repeats `{me}`, en uses "they" (an optional `pronoun: 'f'|'m'` is read if the Worker adds it, 6e.9). A 410 on first load has no name → `{me}` default "你的家人 / your family member". "Near {place}" uses `/api/revgeocode` (help / no-signal only; hidden on failure). Times shown in the viewer's own time zone. Fonts: system stack only (no third-party requests from the family page).

**Tests.** Web vitest +17 (`test/viewer-state.test.ts`); Worker +7 (`test/viewer.test.ts`), 151 total. `npm run e2e:viewer` (`playwright.viewer.config.ts`, 44 tests): `e2e-viewer/live.spec.ts` two contexts against `wrangler dev --env test` (TTL 25 s via `--var`) behind `vite preview` with an `/api` + ws proxy — waiting → bus → help (≤ 2 s, assertive) → arrived → second viewer → DELETE → endedArrived; ended while travelling; expiry; invalid/malformed ids; generic OG. `e2e-viewer/states.spec.ts` mocked API: all 15 states at 390 and 1440 (`e2e-viewer/baselines/M4-V-*`, map canvas masked), 200 % + dark no-clipping (6 states, 3 baselines), lang toggle, no-phone. App e2e (64) and typecheck still green.

**Next steps.** AC 30 chime + Notification "到了通知我" and AC 31 Web Push (not built). AC 25 "看的人太多了" copy for `429 too_many_viewers` (now silently falls back to polling). AC 26 "Open in Maps". Add `npm run e2e:viewer` to `qa/gate.sh`. Creative review of the 1440 baselines (map pane) and the `pronoun` API ask. `og:image` is relative (`/icons/icon-512.png`); some unfurlers want an absolute URL.

## 2026-11-17 — M3 + M4 web client round (Developer, branch `dev/m34-web`)

**Visible changes (for Creative / QA review; copy verbatim from §6d/§6e unless listed under Deviations)**
- **H5 wait step (bus):** T1 arrival chip `arrchip` (`data-state` live / here / estimated / nodata) under the step sub-line: bus badge, big minutes, `● 实时` / hollow `按时间表`, second line (下一班 / 刚错过一班 / 看清楚车头的号码 / 请看站牌), T2 load tags (有座位 / 要站着 / 很挤，可以等下一班 · 轮椅可以上 · 双层巴士 / 长巴士; `这班车轮椅不方便` only with Settings → 我用轮椅或助行器), `下一班比较空`, `刚刚更新 / N 秒前更新`. Saffron fill for `here`.
- **H5 other steps:** CCL board sub-line `这个方向的下一站是 {next}。`; transfer sub-line with line tag (`跟着 … 的牌子走，大约 n 分钟。不用出闸门。` or the out-of-system line); exit hint `出站时走 [B] 出口` (ride train, last rail leg) and `从 [B] 出口出来` + `出了闸门，找写着 B 的牌子` / landmark (final walk); lift detail `B 出口 地面层—大堂 的电梯在维修`; with Lift-friendly on `坐电梯：跟着电梯标志`.
- **CCL copy (ruling):** `坐环线，往 {via_zh} {via_en} 方向` / `Take the Circle Line towards {via}`; fallback `坐{line}，下一站是 {next}`; clockwise/anticlockwise never rendered. Other train headlines now `往 {zh} {en} 方向` (T7).
- **Disruption:** saffron-rule banner `disruption` (train-off disc, line tag, title, L1 stations, L2 free buses, 找别的路 / 看 LTA 的通知 / Home only 知道了) on H1 (any disrupted line, dismissable, key = message createdAt), H3 (route affected; `[NS] 有些站没有地铁` fact; affected cards moved last and lose the tag; all affected → note `地铁有故障，可以改坐巴士`), H4, H5 band; LTA notice sheet (English verbatim); H5 offer sheet `前面的地铁有故障` (找别的路 / 继续原来的路), voice + `gentle` once; `{line} 恢复正常了` toast when it clears. Minor alerts: quiet Home note `LTA：有地铁消息`.
- **H3 cards:** fare `约 $1.77` (hidden with concession on, hidden when absent), lift fact / `车站电梯正常（没有维修通知）`, first card `下一班 139：4 分钟`; fare note under the cards. **H4:** banner, compact chip, `车费 约 $x（成人卡）· 乐龄卡更便宜`, lift detail, exit `走 [B] 出口` under the timeline, quiet link `出发前，告诉家人`.
- **H1:** `最近的行程` (≤ 3 rows: `去 {dest}` / `从 {from} · {relative day}` + 🗑 remove 56 px), help row sub-line `打电话给{fam}，或给司机看地址` / `加一个家人的电话，有事一按就打`, setup undo bar.
- **Share (P1):** sheet `让家人知道你在哪里` (contacts radiogroup, 别的人, add row when empty; WhatsApp jade 72 → SMS → 用别的方式发 (Web Share only) → 复制链接; preparing spinner; inline failed state with Try again / Call {fam}; lock line). Toast `链接发出去了。{fam} 打开后就看得到你。` Pill states sharing / paused / help / arrived; sharing sheet (preview, send again, also someone else, stop). End sheet line `分享也会停止`. H12 `{fam} 的页面会显示你到了` or `告诉{fam}我到了` → `已经准备好给 {fam} 的信息`.
- **Help (P2):** call first contact (sub `{relation} · 一按就打` / sharing variant), 打给别的家人 (2+), show driver (sub `大字显示，也可以叫车`), where am I, find my way again / 带我回家 (no trip), `紧急情况 · 拨打 995` → confirm sheet (only `c-danger` fill). Help trip note `{fam} 的页面显示你需要帮忙。` + `我没事了`. H10: taxi buttons (Grab, CDG Zig, caption), `把我的位置发给{fam}`, coordinates fallback.
- **Settings:** 家人 → P3 list (call/edit 56 px round buttons, `最先打给 TA` tag, add, setup, lock line) → P4 add/edit (fields, relation chips, +65 prefix, message language, save/remove confirm/make first; calm validation on Save); 让家人帮我设置 → P5 (send `/setup` by WhatsApp / copy, paste the link back); 我的电话号码 + `分享时让家人打给我` (OQ3, shown only when a number is set); 出行: 我用轮椅或助行器 · 我有乐龄卡 · 少走楼梯，用电梯; 清除所有资料 + confirm.
- **New pages:** `/setup` (W family page: name, home + places search, contacts, own phone, language/size, your name → `做好了` → link to send back), `/s/:code#k=` (P5b review with replace lines, `好，用这些` / `不用了`, 10 s undo bar on Home; error states 用过了 / 过期了 / 链接不完整 / 需要网络).
- **Viewer `/t/:id`:** pill from the structured step in the viewer's language; icon only from `step.k` or a keyword match (no match → text-only, `lang` attribute on stepText); review fixes P1–P3 (ETA `min(2.1rem,18vw)`, scaled avatar disc, `keep-all`, `.who` wraps under the avatar at 200 %, desktop map offset, terminal footer, `这个链接<wbr>已经过期了`).
- New icons from the approved sets: seat, stand, full, wheelchair, wheelchair-no, deck2, train-off, card, copy, edit, qr, msg.

**Done**
- **Share contract (ruling):** `step: {k, svc?, line?, stops?, place?, stop?, station?, towards?}` in `@howtogo/shared` (`ShareStep`, `shareStepOf`, `toShareUpdate`), validated by the Worker (`validateStep`, `400 invalid_step`, unknown keys refused), stored and served in GET/WS, documented in `src/worker/API.md`. Rail stations go as codes; the viewer names them in its own language (`@howtogo/shared/data` export, viewer JS 23.6 KB gz). Steps gain `fromCode`, `towardsCode`, `nextStop`.
- **Share runtime:** OQ7 cadence (step/status change, 15 s moving ≥ 20 m, 60 s still), status-only first update (start before a fix), hidden → `paused` / visible → `travelling`, keeps sharing in pocket view, backoff 5/10/20/30 s, `429` Retry-After, `410` → pill gone + toast; `startShare({senderName, senderPhone})`; `reroute(avoid)` for the disruption offer.
- **M3 logic** `src/web/src/transit/m3.ts` (chip states, missed bus, less crowded, disruption match, lift issues/detail/OK, exit hint with 30 m ambiguity rule + repaired-lift switch, out-of-system transfer, relative dates) and `transit/live.ts` (alerts 60 s cache + 2 min in trips with rail ahead, lifts 5 min, bus polling 20 s only while the chip is shown, visible, online, not pocket; one request per stop).
- **M4:** `state/family.ts` (contacts ≤ 5, phone validation, OQ3 prefs), `setup/setup.ts` (AES-GCM-256 WebCrypto, `iv‖ct` base64url, key only in `#k=`, sanitize, preview/apply/undo), screens in `views/share.tsx`, `helpSheet.tsx`, `family.tsx`, `transit.tsx`; copy in `i18n/m34.ts`.
- Mock API scenarios `?scn=bus:live|estimated|here|empty|lsd|nowab|stale|not_configured,alerts:normal|minor|disrupted|not_configured,lifts:outage|none,share:fail,setup:rate_limited` (session, switchable mid-test); `&realshare=1` keeps fixture routes but sends shares/setup to the real Worker (two-context e2e).
- Tests: shared 136, web 151 (+ `m3.test.ts`, `m4.test.ts`, share runtime cadence/paused/backoff), worker 162 (+ step contract). e2e `e2e/m34.spec.ts` (17: 6 chip scenarios, LSD, Home/H3/H4 banners, in-trip offer keep/accept, share WhatsApp/SMS/copy/failure, OQ3, Help + 995 + taxi, contacts validation, setup round trip + one-time + wrong key, 200 % dark zh / light en), `e2e-viewer/app-share.spec.ts` (app UI → real Worker → family page: walk from step, help, I'm okay, stop → ended), viewer specs updated (structured pill, lang toggle, 200 % card/ETA overflow assertion). Baselines (DPR 1): 16 new `M3-T1-*`, `M3-T3-*`, `M4-P1/P2/P3/P4/P5b/W-*`; viewer 1440 + 200 % re-recorded for the review fixes; M1/M2 frames whose screens gained M3/M4 content re-recorded (H3-two, H4-*, M1-F6-*, M2-H9/H10/H12).

**Deviations (with reason)**
- **Caregiver setup direction:** family page first (PM AC 40–42: family fills `/setup`, gets `/s/<code>#k=`, sends it back; senior opens or pastes it). §6e.5's "senior shows a QR first" needs a relay the Worker doesn't have (POST returns a server-made code). **No QR yet** (no QR encoder in the deps; adding one was blocked in this session) → link only, plus paste. Box life is the Worker's 24 h, not 30 min.
- **Share before Start (AC 8):** a share needs a running trip on this phone, so H4 `出发前，告诉家人` starts the trip and opens the share sheet on H5.
- **Help:** §6e.3 order (no "让家人看到我在哪里" row, no help-only share); 995 has the confirm sheet per §6e.3 (PM AC 34 said no confirm; the task asked for the confirm). Taxi: Grab + CDG Zig only; the CDG phone line is hidden until verified (OQ10).
- **Chip:** `lastgone` / `notrunning` not built (no FirstBus/LastBus data). Voice for `nodata` not spoken. H5 shows "约 N 分钟" when data is > 60 s old (6d.1) and nodata after 3 min (AC 5).
- **Not built:** Lift-friendly ranking in `rank.ts` (AC 28: the toggle exists and adds the "follow the lift signs" line only), "Bus routes only" re-query (AC 20: the note shows), Contact Picker, auto-share (AC 9), Web Push / notify-me (AC 30–31), "Save as a place" on recents, T6 transfer card meta/icon tile (sub-line only), T4 results title/note.
- **Recents on H1** reuse the M1 store (≤ 5, from+to) and show 3 rows; no `howtogo.recents.v2` key (the v1 rows already carry `from`, so nothing to migrate).
- Bundle: app JS 94 → ~126 KB gz (budget 150) — over the M3 "≤ 15 KB growth" note; station data now reaches the main chunk via the transit modules. Lazy-loading `views/family.tsx` and the setup crypto is the first saving.

**Contract changes:** PUT/GET/WS `step` (above). Client sends `senderName` (contact's "what they call you" or the greeting name) and `senderPhone` only when set and allowed. No Worker behaviour change otherwise.

**Next steps**
1. Creative review of the new baselines (esp. H5 chip inside the step card at 100 %, Home banner size, P1 sheet) and the deviations above; Director: QR dependency, setup direction, 995 confirm vs AC 34.
2. QA's M1-era specs (`qa/tests`) still assert M1 flags (Help hidden, Start hidden, ≤ 5 `recent-*` test ids); they need the M2/M4 updates (not changed here).
3. Lift-friendly ranking, Bus-routes-only re-query, lastgone/notrunning (needs BusRoutes data), lazy-load the M4 screens.

**Gate (`npm run gate`, last run):** 8 PASS / 3 FAIL. PASS: deps, typecheck, unit 449, i18n, build (app JS 126.4 KB gz), static-pwa, **dev-e2e 132/132** on the release build, artifact. FAIL, none from this round: `secrets` (known: `Bearer wrong-tok…` literal in `src/worker/test/logs.test.ts` and the wrangler.toml KV id); `qa-e2e` 6 = QA's M1-release specs (AC-35 "Start hidden", QA-1 "Help hidden", recheck smoke expects no `nav-help`) that contradict the M2 flags; `lighthouse` "run failed" inside the gate on this host, though a manual `npx --prefix qa lighthouse` run against the same dist works (needs a look by QA). `npm run e2e:viewer` 44 + `e2e-viewer/app-share.spec.ts` 1 pass (not in the gate yet). Under heavy parallel load, `demo.spec` / `guide.spec` MRT trip / `fixround` exit-motion failed once each and passed on rerun.
## 2026-11-17 — M2 fix round: QA-21…27, Creative F1–F6/F12, AC 12 All-steps, AC 50 demo controls (Developer, branch `dev/m2-engine`)

**Visible changes (written first, before code)**
1. H5 headline + voice use new H5-register lines (`guide.*`, Creative F1): 走到 {stop} 巴士站 / 在这里等 {route} 号巴士 / 坐 {route} 号巴士，在 {stop} 下车 … No stop code and no stop count in the headline. H3/H4 keep the planner `step.*` text.
2. Walk sign chip on H5 shows `{stop} · {code}` (e.g. `Toa Payoh Int · 52009`).
3. H5 headline is 2rem (32 px) at 100 % (QA-22 ruling); never breaks inside a word at 200 %.
4. Walk sub-line minutes are this walk's own time (`max(1, ceil(m / 67))`), not the whole trip's (F2).
5. Voice says 你, never 您 (F5): 到了，这里是 {stop}。/ 好，你上车了。下车前我会提醒你。/ 好，你回到路上了。
6. H6/H6b titles never orphan a character (two unbreakable phrases); at 200 % H6b shows title → sign chip → line, bell 72 px (F3).
7. Train sign chip carries the station code: "Raffles Place NS26 站" / "Raffles Place NS26 station" (F4).
8. Reduce motion: H6, H6b and pocket view cross-fade in 120 ms instead of snapping (F6).
9. Back from pocket view: the End sheet fades in over H5 with the normal scrim (F12).
10. Start asks once for notification permission with a one-line explainer on H5; denied → note "下车提醒要开着这个应用才收得到" (QA-21).
11. Wake-lock note shows once per trip (QA-23).
12. G3 and H12 content is keyboard-scrollable at 200 % (QA-24).
13. Route home on H12 plans from where you are now (QA-25); any plan right after a trip starts from the trip's last position.
14. A trip older than 24 h reloaded on /guide lands on H1 (QA-26).
15. Version 0.2.0 in About / Report / SW (QA-27).
16. New "全部步骤 / All steps" sheet from H5 (AC 12): remaining steps, current one marked, Back closes it.
17. New demo controls panel in `?demo=1` on H5 (AC 50): buttons that play get-off alert, off route, weak GPS, skip to waypoint/arrival.

**Fixed**
- **QA-25 (S2)** `runtime.end()` sets `here` to the trip's last fix (≤ 15 min old), else clears it so the next plan locates afresh. H12 Route home → `api.route` start = the arrival position (QA check passes up to its own harness issue, below).
- **QA-21 (AC 30)** New `platform.notifications` (`permission()` sync, `request()`); web wraps `Notification`, fake records requests. `runtime.start()` asks once ever (`howtogo.notify.asked`), synchronously inside the Start tap, with the trip note `notify-ask` while the prompt is up. Denied → note `notify-denied` "下车提醒要开着这个应用才收得到" (closable, per trip). Prompt dismissed without an answer → never asked again, no nag.
- **QA-22 (AC 6)** `.steptx h2` 1.6rem = **32 px** on the 20 px root (the ruling's "2rem" assumes a 16 px root; 2rem here would be 40 px). `word-break:keep-all` + `overflow-wrap:break-word`, so 200 % breaks only at spaces/punctuation.
- **QA-23 (AC 39)** the wake-lock note is set only on the first failure of a trip.
- **QA-24 (AC 47)** G3 and H12 `main` get `tabIndex=0` (+ label on G3): axe clean at 200 %.
- **QA-26 (AC 46)** `main.tsx`: no trip after resume while on `/guide` → `router.reset('/')`.
- **QA-27** web 0.2.0 (`package.json`, `version.ts`, lockfile). The manifest has no version field.
- **F1** `Step.say` (shared `guide.*` templates, exact Creative strings) drives the H5 headline, `step_changed` and every re-speak; H3/H4 keep `step.text`. Station codes ("(NS17)") are stripped from the spoken stop. Walk chip = `{stop} · {code}`.
- **F2** walk sub-line minutes = `max(1, ceil(m / 67))`. **F3** H6/H6b titles as two `.ph` phrases; title size `min(2.4rem, 20vw)` (at 200 % a 96 px title cannot hold 到站了， on one 350 px line); 200 % H6b: bell 72 px, chip before line. **F4** chip text from the alighting stop's sign name + code (`sign`/`code` on the get-off cues and `AlertState`): "Raffles Place NS26 站". **F5** no 您 in zh cues (unit test). **F6** `!important` on the rm 120 ms fades. **F7** action labels nowrap at 100 %. **F12** the pocket view unmounts as soon as a sheet opens, so the End sheet scrim-fades over H5.
- **AC 12** All-steps sheet (`sheet-all-steps`, a history entry) opened from the step counter "第 1 步，共 4 步 ›" (SR: "全部步骤，第 1 步，共 4 步"): remaining steps in the H4 timeline style, current one tagged 现在. A visible button in row C did not fit one line in en.
- **AC 50** demo controls (`demo-controls`) at the bottom of H9 Help, only with `?demo=1` on a trip: 下车提醒, 走错了路, 位置不准, 跳到下一步, 直接到达.
- Tests: shared +3 (say lines, no 您), web unit +8 (notify, wake note, here, walk minutes, note order), dev e2e +3 (AC 12, F1/F2, AC 50). Dev e2e `onboarded()` reports Notification permission as granted (headless Chromium says denied, which would put the denied note on every H5).

**Not fixed (and why)**
- QA check "AC 2 entry parity: arrival-route-home" still fails, **after** its QA-25 assertions pass: its second `runUntil(page, 'trip:arrived')` returns at once because the change-only log already holds `trip:arrived` from the first trip. Test harness issue → QA (qa/ is QA's).
- QA's AC 12 and AC 50 checks are `test.fail` and look for visible text 全部步骤 on H5 / `demo-controls` on H1. Both features are built where the dev-log says; QA to replace those two checks.
- Creative P2 F8 (step transition), F9 (nbsp in counts: QA regexes match plain spaces), F10, F11, F13 (missing baselines), F14/F15 (P3): polish round.

**Baselines re-recorded (intentional, 12):** `M2-H5-walk-light-100-zh`, `-dark-100-zh`, `-light-200-zh`, `-light-100-en`, `M2-H5-ride-light-100-zh`, `M2-H5-manual-walk-light-100-zh`, `M2-H6-bus-light-200-zh`, `M2-H6-train-light-100-en`, `M2-H6b-bus-light-200-zh`, `M2-H6b-train-light-100-en`, `M2-H11-failed-light-100-zh` (H5 copy/size), `M2-H9-m2-trip-light-100-zh` (demo section). No M1 baseline changed.

**Gate (`npm run gate`, once, c99e1c3, load 5–11 with the other worktree's Playwright):** 10 PASS, 2 FAIL. deps, typecheck, unit 352, i18n, build (app JS 95.4 KB gz / 150), static-pwa, platform-api, secrets, lighthouse (perf 83 / a11y 100 / bp 100), artifact `howtogo-web-0.2.0-dist.zip` sha256 `a2aa9cd8…5d93` PASS.
- dev-e2e 105/106: `M2-H5-manual-walk-light-100-zh` failed under load; passes alone (just re-recorded).
- qa-e2e 116/119: (1) `ac.spec` AC-42 expects `0.1.0` in the Report — needs QA update for QA-27; (2) `AC 2 … arrival-route-home` harness issue above; (3) `AC 13–17` follow-me timed out under load, passes alone. All QA-21…26 checks and the 200 %/axe checks pass.
- The gate wrote `qa/reports/howtogo-web-0.2.0-dist.zip.sha256` (left untracked for QA; the M1 checksum file is untouched).

**Next steps**
1. QA: update AC-42 (version), the arrival-route-home `runUntil` (log already has `trip:arrived`), and replace the `test.fail` AC 12 / AC 50 checks; then targeted re-check.
2. Creative: review the 12 re-recorded baselines (step counter as All-steps entry; H6b 200 % title size `min(2.4rem, 20vw)`); polish round F8–F11, F13–F15.
3. Owner phone test (notification prompt at Start, Route home "从" = here).
