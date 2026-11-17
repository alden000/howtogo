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

## 2026-11-17 — M2 requirements drafted
- PM M2 spec: 50 ACs, estimate 8–10 h (multi-stop moved in from M3).
- Rulings: M2 OQ1–OQ10 all accepted at PM defaults (owner pre-approved recommended defaults, D-6). OQ7 pocket view after 45 s idle is a UI dimming only, not a guidance guard, so the "no time-window heuristics" rule doesn't apply.
- PM finding: shell vibration names ≠ style guide haptic map → fold into M1 fix round.

## 2026-11-17 — Creative round 2 merged (prototype v1.1)
- Logo B master + PNG exports in creative/logo/final/; M1 state frames F1–F8 in STYLE-GUIDE §6b. ~11 min, ~163k tokens.
- Approved: 8 new icons (wifi-off, refresh, install, ios-share, info, trash, person, report). F8: the From/To swap button moves to Route options (AC 22 amended).
- Owner question pending: privacy contact for About (default: a generic contact form/email the owner provides; until then About shows no contact line).

## 2026-11-17 — M1 UI round done (dev/m1-ui)
- 50 unit + 52 e2e pass, app JS 58 KB gz, 36 baselines. ~? min (report arrived while Creative round 3 ran).
- Rulings: (1) bus-times "live" note is hidden in M1 (live bus data is M3). (2) The 8 §6b icons are approved (same set as Creative's list). (3) Build the Swap button on Route options in the fix round (F8). (4) H2 From-mode title: Creative supplies exact copy in its review. (5) Logo B icons go into the PWA manifest in the fix round (copy from creative/logo/final/).
- Next: Creative review of built screens (read-only) + QA gate in parallel → one batched fix round.

## 2026-11-17 — Creative round 3 (M2 frames, prototype v1.2) merged
- Approved: token `c-pocket` #000000 (pocket view only), 5 icons (exit, moon, plus, arrow-up, arrow-down), trip-note component, copy "第 2 个地方 / Place 2 of 4" (avoids clash with bus "站"), Creative's wording for AC 13 puck and AC 10 "Previous step" (PM to align M2 ACs). Canonical haptic names = STYLE-GUIDE 6c.13; the shell renames in the M2 round.
- D-8 S4 (H5 top bar over map label) fixed in the prototype.

## 2026-11-17 — M1 QA gate 1: PASS WITH FIXES (qa/reports/0.1.0-m1.md on dev/m1-ui)
- Gate 8/11 steps pass; 30/42 Must ACs pass; 19 bugs (1 S2, 11 S3, 7 S4). Creative review: 3 High, 10 Medium, 9 Low.
- Rulings: QA-1 (S2, empty Help): hide the Help row/button in the M1 release behind flag `help` (M2 builds the partial Help sheet per M2 OQ4). Kept as S2 until fixed. Worker items QA-15/17/18: follow the M1 ACs exactly; per-IP rate limit is in-memory only, IPs never logged or stored beyond the window. Flaky baseline: fix the root cause, don't retry-mask it. AC 38 (map canvas) BLOCKED accepted: assert via the map module's test log hook instead.
- Next: ONE batched Developer fix round (all Creative High+Medium, all QA S2/S3, known items Swap + logo icons + manifest), then targeted QA re-check.
- Worker fix round done (dev/m1-worker-fix e1873a3, 91 tests). Ruling: without credentials and without FIXTURE_MODE the Worker answers 503 — never silently serves sample routes (a senior following a fake route is a safety issue). AC 21 amended accordingly. Merge into dev/m1-ui after the web fix round finishes (don't touch a tree an agent is working in).

## 2026-11-17 — Owner: speed up with more parallelism (D-9)
- Owner: "Speed up the development process by doing things in parallel. Ok to use more tokens for today." Logged as authorisation to run ahead on later milestones' independent work today.
- New parallel tracks: PM specs M3+M4; Creative frames M3+M4 (+ family viewer page); Dev data round (zh station names, MRT exits, line termini) in src/shared/data; Dev M6 spike (Capacitor Android debug APK feasibility in this container). Running alongside: QA M1 re-check, Dev M2 engine round.
- Host contention rule: Android/Gradle builds wait while Playwright runs (4 CPUs).
- Deployment: owner pre-approved hosting on their Cloudflare account (D-6). The M1 preview will deploy to pages.dev in fixture mode once the re-check passes; the owner will be told before anything goes live.

## 2026-11-17 — M1 re-check: PASS WITH FIXES → release prep
- QA re-check (qa/reports/0.1.1-m1-recheck.md): 42/42 Must ACs pass, QA-1…19 fixed. QA-20 (S4): approved — gate Lighthouse uses the median of 3 runs.
- Hosting ruling (D-10): the Cloudflare token can manage Workers/KV/DO but not Pages → serve the PWA and API from ONE Worker using Workers Static Assets (`assets` = src/web/dist, SPA fallback, `/api/*` → Worker code). Preview runs with FIXTURE_MODE=1 and a clear "示范路线 / Sample routes" banner until the owner's OneMap/LTA keys are in, so nobody mistakes sample routes for real ones.
- Release-prep round: Creative R1–R3, QA-20, Worker static-assets deploy config, sample-mode banner (Creative copy below).

## 2026-11-17 — M3 + M4 requirements (PM)
- M3: 45 ACs, 6–7 h. Lift data source found (LTA v2/FacilitiesMaintenance) → lift warnings + "no repairs reported" fact in; "No stairs" stays hidden (D-8). M4: 52 ACs, 8–10 h. Roadmap total now ~41–50 h.
- Rulings: M3 OQ1–OQ9 and M4 OQ1–OQ11 accepted at PM defaults (owner's standing D-6 instruction). M4 OQ3 (send the senior's own number with a share, only if set, off switch) and OQ4 (destination name only, no coordinates) are privacy calls → accepted at the privacy-protective defaults and flagged to the owner as FYI.
- Conflict M4 AC 14 vs M2 AC 41: **sharing continues in pocket view** (safety over battery) at the OQ7 cadence (15 s moving / 60 s still).
- Bugs found by PM: share status enum mismatch → folded into the running M2 engine round (small, specified). D-7 help write-limit bypass not built → M4 Worker round.

## 2026-11-17 — M6 spike result
- Capacitor 8.6.2 debug APK builds here (5.1 MB, minSdk 24, target 36). Custom TripPlugin/TripService (location FGS + Stop action, per-leg interval, native backup get-off alert), zh-CN TTS, lock-screen alert channel. No ACCESS_BACKGROUND_LOCATION needed (trip starts with the app open). Locked-screen behaviour unproven until a real device.
- Rulings: keep the custom plugin approach. Back fix (toggleBackButtonHandler by depth) goes into M6 proper. Guidance cues must be driven by location fixes, not JS timers (hidden-WebView throttling) — note for M2/M6.
- appId: owner to confirm (placeholder `sg.howtogo.app`; permanent once installed by users). Spike stays on dev/m6-spike until M6.

## 2026-11-17 — M1 0.1.0 preview LIVE (fixture mode)
- Deployed Worker `howtogo` (embedded assets, wrangler.preview.toml) → https://howtogo.raus-ums.workers.dev. Version e880916c. KV TOKEN_KV created on the owner's account. First minute after deploy returned mixed 404/500 while the version propagated; stable 200 since. Phone-width smoke (Pixel 7, Playwright): first-run renders, no console errors.
- The KV namespace id is not a secret (it's useless without the account token) → QA to allow-list it in the secret scan.
- M1 actual duration: ~5.5 h wall clock from kickoff of the UI round to preview (incl. parallel creative/QA rounds). M3/M4 Worker round done on dev/m34-worker (136 tests), merges after M2.

## 2026-11-17 — Creative round 4 (M3/M4 frames + family viewer) merged
- STYLE-GUIDE §6d/§6e; family viewer prototype (15 states); prototype v1.3 republished with viewer.html.
- Approved: 11 new icons (seat, stand, full, wheelchair, wheelchair-no, deck2, train-off, card, copy, edit, qr) and the new components. CCL copy = "往 {next interchange} 方向" + next stop (never clockwise/anticlockwise) → data round's loop keys to be replaced in the M3 UI round.
- Note for build: sample phone numbers in the prototype must not ship; production uses only the user's own contacts.

## 2026-11-17 — Family viewer built (dev/m34-worker) + Creative review
- Viewer: 15 states, 10.3 KB gz, 44 e2e. Creative: APPROVED WITH FIXES (2 P1 at 200%: ETA overflow, help disc crescent; zh keep-all; 1440 map offset; footer on ended/expired).
- Ruling: share contract gains a structured step (`step: {k, ...fields}`) sent by the sharer; the viewer renders §6e.2 templates; until then no keyword-guessed icons (no match → no icon). Fixes batched into the M4 web round.

## 2026-11-17 — M2 Creative review: APPROVED WITH FIXES
- Rulings on deviations accepted as Creative ruled: headline = spoken line (principle) with Creative's F1 wording; sign chip = sign text only (train chip adds code); End sheet over pocket in normal theme with a scrim fade; AC 12 All-steps sheet built in the M2 fix round (before the owner phone test). AC 50 demo controls also in the fix round.
- P1: F1 copy, F2 walk sub-line minutes, F3 H6b at 200%. Batched with QA findings into ONE M2 fix round.

## 2026-11-17 — M2 QA gate 1: PASS WITH FIXES (qa/reports/0.2.0-m2.md on dev/m2-engine)
- 41/46 Must pass; bugs QA-21…27 (1 S2, 4 S3, 2 S4). AC 36/41 blocked on a real phone (owner test).
- Rulings: QA-25 S2 "route home" must plan from the current position. QA-21: request notification permission at Start, with a one-line explainer, only once; if denied, the in-app alerts still work and a note says alerts need the app open. QA-22: AC wins — H5 headline ≥ 32 px (2rem at 100%); Creative's 200% wrap rules apply. QA-23: the wake-lock note shows once per trip. QA-27: version 0.2.0.
- ONE M2 fix round now: all QA bugs + Creative F1–F6 + AC 12 All-steps sheet + AC 50 demo controls.

## 2026-11-17 — Owner decisions (D-11)
- Domain: **howtogo.wwweeeiii.com** (owner adds the custom domain in the Cloudflare dashboard; this session's token can't see the zone). Config must allow both this and the workers.dev origin.
- Android appId: **com.wwweeeiii.howtogo**. Signing key: generated in this session (never committed), handed to the owner once (file + password) to keep; M6 builds need it back.
- Error counts: ON, anonymous counts only, listed on the privacy page, Settings switch.
- Container restarted mid-afternoon; all worktrees/branches survived. M2 fix round done (gate 10/12; remaining failures = QA harness updates + load flakes). M3/M4 web round done on dev/m34-web (dev-e2e 132/132; QA M1 specs contradict M2 flags → QA update).

## 2026-11-17 — M3/M4 Creative review: APPROVED WITH FIXES
- 3 High (H5 arrival chip placement, Home disruption banner → 72 px strip only when a recent trip uses the line, drop the possibly-false night line), Mediums (en list joiner, colour-only picked contact, Help pronoun → neutral wording).
- Deviation rulings accepted as Creative ruled: build now nodata voice, T4 title/note, T6 meta; defer the rest to M5; drop Web Push; keep the 995 confirm; drop the `pronoun` field (neutral copy everywhere).
- Sequence: after the M2 re-check passes → merge M2 into dev/m34-web → QA M3/M4 gate → ONE fix round (Creative + QA).

## 2026-11-17 — M2 0.2.0 released to preview
- QA re-check 0.2.1: gate 12/12, all M2 bugs fixed; AC 36/41 await the owner's phone test. Merged dev/m2-engine → session branch; deployed version 728d70b4 (fixture mode). Config allows howtogo.wwweeeiii.com (origins + CSP wss) ahead of the owner adding the custom domain.
- M2 actual: ~5 h wall clock (runtime round, UI round, QA, fix, re-check), overlapped with M3/M4/M6 tracks.
