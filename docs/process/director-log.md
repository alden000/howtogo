# Director log

## 2026-11-17 — Kickoff
- Project: 怎么去? — elderly-friendly SG public-transport routing PWA. Repo `alden000/howtogo`, branch `claude/elderly-routing-pwa-app-hdhvge`.
- Spike done (see docs/00-brief.md): OneMap routing & reverse geocode need a token (3-day expiry) → server-side Worker required. Tiles + search public. LTA DataMall needs key.
- Ruling D-1: Architecture = static PWA + Cloudflare Worker (secrets, token renewal, caching) + Durable Object for live trip sharing. Pending user confirmation.
- Ruling D-2: Run kickoff research/plan (PM) and creative run (Creative) in parallel to save ~2–3 h; both are pre-code and cheap to revise. User signs off both before any production code.

## 2026-11-17 — Owner authorises parallel development
- Owner: "Develop this project in parallel using agents." Logged as authorisation to start code work before the plan/design sign-off, for work that does not depend on the design.
- Ruling D-3: Stack = npm workspaces monorepo. `src/shared` (TS types + pure engine), `src/worker` (Cloudflare Worker + Durable Object, vitest), `src/web` (Vite + Preact + TypeScript PWA, MapLibre GL JS with OneMap raster tiles, Playwright). The UI round starts only after Creative delivers tokens and frames.
- Parallel tracks: Dev-A Worker backend (worktree), Dev-B shared engine (worktree), while PM and Creative finish. Merge order: shared → worker → web.

## 2026-11-17 — Screen-off guidance / APK question
- Owner asked whether a PWA wrapped in an APK can guide with the screen off. Answer: a TWA (Bubblewrap) cannot (it is Chrome; geolocation stops when hidden). A Capacitor shell can (location foreground service, native TTS, lock-screen alerts).
- Ruling D-4: The web UI must put location, speech, wake-lock, vibration and notifications behind one `platform` adapter interface (web implementation now; Capacitor implementation later). Recommended an optional "Android app" milestone after M2 — awaiting the owner's yes.
- 2026-11-17 Ruling D-5: Owner said yes → M6 Android app (Capacitor) added to ROADMAP, 6–8 h, can start after M2 in parallel with M3–M5.

## 2026-11-17 — Owner accepts all recommended defaults (D-6)
Owner: "Go with all your recommended defaults. No need android play store."
- Languages: Simplified Chinese (default) + English.
- OneMap account and LTA DataMall key: the owner registers them with their own email and adds them as Cloudflare secrets. Until then we build and test on recorded/synthetic sample routes.
- Hosting: the owner's Cloudflare account, free plan; `*.pages.dev` address, custom domain later.
- Share link: ends 30 min after arrival, at most 4 h, stoppable any time. Worker default SHARE_TTL_HOURS=4, plus auto-end 30 min after status "arrived".
- Default route preference: least walking.
- Screen stays on (dimmed pocket view) during a web trip; accepted.
- Taxi fallback: show the address in big text, open Grab if installed, link the CDG Zig site.
- Architecture D-1 confirmed. M6 Android: **sideload APK only, no Play Store** (drop the closed-test track).

## 2026-11-17 — Worker round merged
- Dev-A Worker merged to the session branch (76 tests pass, ~3 s). Took ~11 min wall clock, ~156k tokens.
- Ruling D-7: status "help" bypasses the 3 s share write limit (safety beats rate-limit). Rate-limit on POST /api/share → M4 scope.
- Open until real credentials: OneMap "Bearer" prefix, expiry format, revgeocode fields, BusArrival v3 fields, TrainServiceAlerts path.

## 2026-11-17 — Engine round merged
- Dev-B shared engine merged (82 tests, <1 s). ~17 min wall clock, ~214k tokens. Real OneMap response (Nov 2025, public GitHub) confirms the OTP shape.
- Gaps carried to M1/M3: Chinese station-name table (zh steps currently show English station names), MRT exit table, line-terminus table maintenance.

## 2026-11-17 — Creative run v1.0 delivered
- Creative done (~28 min, ~222k tokens). Prototype published privately for the owner: https://claude.ai/artifact/AkPm6sk5pu2bw5GbWRFcEj
- Director review: H1 and H5 look strong. One small issue: on H5, the map station label is half-hidden under the End button (S4, fix in the UI round).
- Awaiting owner: logo A, palette, greeting name at first run, WhatsApp/SMS/link sharing, lift/no-stairs data source (recommend: hide the "No stairs/Lifts" facts until M3 has data).

## 2026-11-17 — Owner design sign-off (D-8)
- Logo: **B, 去 seal** (owner's pick, not the recommended A). Creative to refine B into the master mark: app icon, maskable, mono, favicon, wordmark; update the prototype/style guide.
- Palette and type approved as is.
- Greeting: optional name asked once at first use; skip → plain greeting.
- "No stairs"/"Lifts all the way" facts hidden until a data source exists (research in M3).
- Design signed off → production UI work may start.
- Web shell merged (36 unit + 5 e2e pass; app JS 42 KB gz, MapLibre 265 KB gz lazy).
- Rulings on M1 open questions: OQ1 as default (Vite+Preact+MapLibre). OQ2: keep the standalone Worker (built with CORS); serve it on the same custom domain later via a route `/api/*`. OQ3 as built (KV + memory). OQ4 fixture mode. OQ5: "Start" button behind feature flag `guide` (off in the M1 release, on in M2). OQ6: 500 m, widen to 1000 m if no itinerary. OQ7: pages.dev.
- Parallel tracks now: Creative round 2 (logo B master + missing M1 state frames) in wt-creative; Developer M1 UI round in wt-m1ui.
