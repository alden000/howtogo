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

## 2026-11-17 — Hosting move + M6 round 1
- Owner: the domain is in a different Cloudflare account; "don't use raus-ums". Owner saved a Cloudflare token for the domain's account as an environment network secret. Plan: redeploy the Worker + KV + DOs there, attach howtogo.wwweeeiii.com via the API, then (owner's OK) delete the old raus-ums deployment and KV.
- M6 round 1 (dev/m6): signed R8 release APK 0.2.0, com.wwweeeiii.howtogo, versionCode 20000, 1.6 MB; keystore outside the repo at /home/user/keys (to hand to the owner). Rulings: WAKE_LOCK not needed (FGS keeps the CPU awake for location) → allow-list updated to drop it; the extra non-exported Play services activity is accepted (no exported surface). ALLOWED_ORIGINS gains https://localhost (Capacitor origin) on the next deploy.

## 2026-11-17 — M3/M4 merged pre-gate (handover)
- Merged dev/m34-web (Creative High/Medium fixes done; unit tests 139/180/162 green; typecheck clean) into the session branch so the work survives the session switch for the hosting move. Not deployed (old account). QA gate for M3/M4 is the next step in the new session; see HANDOVER.md.

## 2026-11-18 — Local machine session: sync, hosting blocked, M3/M4 gate FAIL
- Sync: the session branch had the LTA-binding merge that ccr-3d674ac5-27etk6 lacked, so this was a real merge, not a fast-forward. Pushed. Dev now runs on the owner's Windows PC (4 cores, Git Bash; npm scripts need `--script-shell` bash).
- Hosting: wrangler isn't logged in. The OAuth login timed out twice at ~04:45 local (approval window ~2 min). **Blocked on the owner** running `npx wrangler login` with the wwweeeiii.com account.
- M3/M4 gate (qa/reports/0.3.0-m34.md): FAIL. M3 32/8/3/2, M4 36/11/3/2 (pass/fail/deferred/untested). QA-29…49, no S1/S2. Gate scripts fixed for Windows paths, zip and orphan ports.
- Rulings:
  - QA-37: Creative §6e.3 order stands. The "让家人看到我在哪里 / share" row is in Creative's spec (Help while not sharing is a share entry point, STYLE-GUIDE §6e.3 / entry points) → build it, at Creative's position. Amend AC 32 to point at §6e.3.
  - QA-40: **up to 5 family members** (Creative's frame, P-series "最多 5 个人"), everywhere incl. `/setup`. Amend AC 39/40. The My places editor (AC 39, up to 6) is a bug: build it.
  - QA-46: **AC 5 wins: no times in the share message** (privacy: a forwarded message must not leak a schedule). Creative to drop the ETA from the copy.
  - QA-48: **self-host the fonts** (subset woff2, font-display swap, preload the primary weight), with no third-party font request. That covers both privacy (no Google request with the user's IP) and Lighthouse perf ≥ 80.
  - Visual baselines: they were recorded on Linux. On Windows, the gate runs dev-e2e inside the Playwright Docker image (Docker Desktop on this host) so pixels compare like-for-like. Developer to script it.
  - M3 AC 45 `smoke:live`: deferred to M5 (needs the owner's OneMap/LTA secrets).
  - QA-47: version 0.3.0. QA-49: raise that test's timeout. QA-29 stays S3.
- Fix round: two fresh Developers in parallel worktrees (A: M3 + gate/infra; B: M4), then Creative review of the visible changes, then a QA re-check of the failures only.

## 2026-11-18 — M3/M4 fix round: Creative reviews and rulings
- Fix A (M3, fonts, version, gate Docker dev-e2e) and fix B (M4) are done. Lighthouse perf 85–91. Creative: both APPROVED WITH FIXES (creative/reviews/m34-fix-a.md, m34-fix-b.md).
- Rulings:
  - A help-only share (started from Help) keeps updating location at the normal share cadence until "我没事了" or expiry (safety over battery, as M4 AC 14).
  - Share row in Help sits after 找路/回家 and before 995 (Creative).
  - AC 28: the Lift-friendly switch leaves the H3 options sheet until M5 ranking exists. It stays in Settings with the honest sub-line.
  - AC 44: About shows the date in words ("交通资料日期：2026年11月17日"); the Report keeps `data: 2026-11-17`.
  - AC 32/39 amended per the earlier rulings (Creative §6e.3 rows; 5 family members).
- Developer C: merge A+B, all Creative fixes, re-record baselines once in Docker; then a QA re-check of the failures only.

## 2026-11-18 — M3/M4 0.3.0: QA PASS WITH FIXES → merged, awaiting deploy
- QA re-check (qa/reports/0.3.0-m34.md "Re-check 0.3.0 RC"): QA-29…49 all FIXED (21/21, each test-proven). Gate: dev-e2e 156/156 (Docker), Lighthouse perf 86–93 / a11y 100. New S4s QA-50 (About licence link testid/target) and QA-51 (stale worker assets.ts) fixed in 3c2eb0d; matrix 12/12, worker 171/171, web 208/208. Host-load flakes (m2 AC 40/49, m4 AC 12/16) pass 3/3 alone.
- Merged dev/m34-fix into the session branch. **Deploy blocked:** wrangler not logged in to the owner's wwweeeiii.com account.
- Duration: the M3/M4 gate + fix round took ~4.5 h wall clock (04:40–09:20), incl. one invalid gate run (Windows tooling).
- Note: the Docker baseline image has no bold CJK font, so bold Chinese renders regular in the baselines only (real phones are fine). Consider adding fonts-noto-cjk to the image in M5.

## 2026-11-18 — M5 Hardening started (owner's kickoff authorises M5 after the M3/M4 gate)
- Rulings on M5 OQs: OQ1 answered by D-11 (production = howtogo.wwweeeiii.com on the owner's account; preview on that account's workers.dev). OQ2: no contact line until the owner supplies one; point to Report a problem. OQ3: ON (owner, D-11). OQ4: two Workers, `howtogo-preview` and `howtogo`, both on the owner's account. OQ5: Durable Object. OQ6: ≤ 20 % and not charging. OQ7: no waiver. OQ8: owner's call at field-test time (default stands). OQ9: no 1.0 in sample mode. OQ10: the owner runs `wrangler secret put`. OQ11: 1.0.0 = web.
- Carry-ins from M3/M4: lift-friendly ranking, bus-routes-only re-query, Contact Picker, auto-share, save-as-place, chip lastgone/notrunning, `smoke:live` (M3 AC 45), viewer QR (M4 AC 42), viewer notify-me (M4 AC 30), CJK bold font in the Docker baseline image. PM to fold the ones that fit "hardening, no new features" into M5 and list the rest under Later.
- Tracks in parallel: Creative M5 frames (dev/m5-creative) ‖ Developer engine round (dev/m5-engine: perf, battery logic, SW update/migrations, production config, monitoring-lite Worker side, smoke scripts). The UI round follows the frames, then the QA gate.

## 2026-11-18 — M5 Creative frames approved (dev/m5-creative 396f66d)
- STYLE-GUIDE v1.4 §6f: L1 Privacy, L2 About, L3 update bar + What's new (replaces F7), L4 install helper, L5 battery saver, L6 offline cold start, L7 Settings order + error-counts row, L8 privacy links on the viewer/setup, L9 feedback form + consent. Direction v1.4 (D27–D30).
- Approved: icons `leaf`, `add-square`, `open-browser`, and six drawn iOS step pictures (creative/m5/). No new tokens.
- Rulings: AC 24 licences link dropped (owner preference; an unlinked licenses.txt may exist). AC 26 wording 主屏幕. Feedback form = one double-sided A4 (PM copies it to docs/field-test/). iOS Edge share-menu position → owner real-phone check.
- Build gaps for the UI round (Privacy copy depends on them, S2 if missed): "Delete all my data" must stop a live share first, then clear localStorage, sessionStorage, Cache Storage (searches, routes, map tiles) and IndexedDB if used. The offline cache must evict expired search/route results.

## 2026-11-18 — 0.3.0 LIVE at https://howtogo.wwweeeiii.com (owner's account)
- The owner logged in to wrangler (09:4x). It sees two accounts: bda70e28… (workers.dev `genixm`, zones incl. wwweeeiii.com, has howtogo-TOKEN_KV and whereisthebus-lta-proxy) and an empty second one. Deployed to bda70e28…, not raus-ums.
- `wrangler deploy -c wrangler.toml --env=""` with **static assets worked** (26 files). Version 5236b3db. Bindings: TRIP_SHARE, SETUP_BOX, TOKEN_KV, LTA_PROXY, ASSETS. FIXTURE_MODE=1 (sample routes) until the owner's OneMap key is in. /api/health → `lta: proxy`.
- Custom domain howtogo.wwweeeiii.com attached via the Workers Domains API. Smoke: /, /settings, /about, manifest, sw.js, /api/health all 200; HSTS, CSP, nosniff present. Pixel 7 (Playwright, zh): no horizontal scroll, SW registers, renders correctly. The only console errors: the zone's Cloudflare Web Analytics beacon, blocked by our CSP (kept blocked; the owner may turn auto-injection off).
- Engine round told: drop the raus-ums origin for genixm, make the embedded-assets import opt-in, pin the account id.
- Old raus-ums Worker `howtogo` + KV: this login can't see that account. Deleting them needs the owner (dashboard) or a login to that account — ask.

## 2026-11-18 — Owner request: smaller text size
- Owner: the text is a bit big for younger users; wants a "normal" size option. Ruling: add ONE option below 100 %; new installs still default to 100 %; it's offered wherever text size is chosen (first-run, Settings, /setup). Touch targets keep the guide minimum. Creative specs it (STYLE-GUIDE v1.4.1); built in the M5 UI round (small, specified, so it goes into the round).

## 2026-11-18 — M5 engine round merged (dev/m5-engine 74ec2ea)
- Lighthouse median of 3: / 96, /about 95, /settings 96, /t 100 (were 83/81/92); a11y 100; Home JS 99.2 KB (budget 100). Battery logic + the "never degraded" replay test; SW update deferral, migrations, chunk reload; two Worker environments (`howtogo-preview` on workers.dev, `[env.production]` `howtogo` on howtogo.wwweeeiii.com, account pinned, static assets default, embed opt-in); smoke:deploy 29/29 locally; monitoring Worker side + client. Unit tests 159/229/220, Docker dev-e2e 156/156.
- Rulings: (1) production stays on the 0.3.0 sample deploy until the owner's OneMap/LTA secrets are in; the first `deploy:prod` waits for them (OQ9). New builds go to `howtogo-preview`. (2) `/api/health` keeps `lta: key|proxy|none`. (3) `/t/*` excluded from the SEO threshold (noindex by design). (4) AC 30 amended: static assets are the default deploy; embedding stays opt-in.
- The Director creates the preview KV namespace when first deploying the preview (owner authorised hosting work on their account).
- Next: M5 UI round (Creative §6f L1–L9 + 6f.11 smaller text size, Settings switch for error counts, OneMap logo resolution, "Delete all my data" completeness, expired-cache eviction).

## 2026-11-18 — M5 UI rounds done; Creative review; integration
- UI-1 (dev/m5-ui b3a92dc): L1 Privacy, L2 About (OneMap logo srcset), L5 battery saver, L7 Settings + error counts (ON), L8 links, 6f.11 85 % text, delete-all (stops share, clears storage/caches/IDB), expired cache eviction, a11y heading tests.
- UI-2 (dev/m5-ui2 c2d86e8): L3 update bar + What's new, L4 install helper + in-app-browser bars (pure UA detection), L6 offline (Home/route), L9 field-test docs.
- Rulings: Home JS budget stays 100 KB gz → lazy-load the non-first-paint UI. Privacy page ≤ 400 words, with Creative's cuts (396) and a unit test. The Docker image has no bold CJK, so bold Chinese is checked on a real phone.
- Creative M5 UI review (2ca2dcf): APPROVED WITH FIXES (2 High, 4 Medium, 5 Low). All of them go into the integration round (dev/m5-int) with the remaining L6 Help/driver offline states, h1 on route detail/guidance, the Settings update bar and the flaky-test hardening.

## 2026-11-18 — Owner report: location always "Ang Mo Kio"
- Cause: FIXTURE_MODE reverse geocoding snaps the real GPS fix to the nearest of the few FIXTURE_PLACES, so most of Singapore reads "Ang Mo Kio". That's a realistic-looking wrong address, which breaks the never-mislead rule. Bug QA-D1 (S2: wrong "Where am I" info, safety-adjacent).
- Ruling: in fixture mode, reverse geocoding returns no name or address. The app labels the point "你的位置 / Your location" with a sample-mode note (Creative to word it). The route origin keeps using the real coordinates. Goes into the M5 fix round.
- Preview deployed: https://howtogo-preview.genixm.workers.dev (dev/m5-int 43fc5a1). smoke:deploy 29/30: MapLibre referenced from index.html (sent to QA). Also seen: first-run step dots stacked vertically (sent to QA).

## 2026-11-18 — M5 gate (qa/reports/1.0.0-rc1-m5.md): PASS WITH FIXES
- 34 PASS / 4 FAIL / 6 DEFERRED. Lighthouse perf 93–100, others 100; unit 655; dev-e2e 239/239. Bugs QA-52…58 (6 S3, 1 S4) plus the owner-reported sample-mode location (QA-D1, renumbered QA-59, S2).
- Rulings: QA-55: `smoke:live` treats `lta: proxy` as PASS for bus arrival; alerts and lifts report SKIP not_configured (WARN, not FAIL) until the owner sets LTA_ACCOUNT_KEY. The v1.0.0 tag needs live OneMap plus a bus-arrival PASS. The owner's checklist gains "LTA key → disruption and lift features". QA-58: LCP ≤ 2.5 s, no waiver; preload the Welcome chunk on a first visit (no profile) or make it eager if the budget allows. QA-56 (Should, prefetch) is built in this round if cheap.
- One fix round on dev/m5-int: QA-52…59, then a QA re-check of the failures only.

## 2026-11-18 — M5 re-check: QA-58 PASS on a quiet host
- QA re-check (ead2de8): QA-52…57 and QA-59 FIXED. QA-58 failed at 2544 ms under 50–100 % host load. The cause was an orphaned `wrangler dev` from the engine round (since 09:46, ~27 000 CPU-s); the Director killed it. Re-measured with qa/scripts/lighthouse.sh (median of 3) at 20–36 % load: `/` perf 96, **LCP 2483 ms** → PASS. Lighthouse against remote URLs fails on this PC (NO_NAVSTART); PageSpeed Insights is not used (it would send the owner's domain to Google).
- Lesson: every dev/QA brief must kill the servers it starts, and the Director checks for orphans before any perf measurement.
- QA-60 (S4: idle preload fetches the viewer chunk → false chunk_load count offline) and the version string 1.0.0-rc.1 go into a short round, then the preview gets rc.1.
- M5 duration so far: ~7 h wall clock (09:20–16:50) incl. two parallel UI rounds and the integration round.

## 2026-11-18 — 1.0.0-rc.1 on the preview
- Merged dev/m5-int (341ca33: version 1.0.0-rc.1, QA-60 fixed). m5 AC 31/38/40 failed under load in the dev round and pass 3/3 alone (flakes). Deployed `howtogo-preview` version 7b6e0625; smoke:deploy 30/30. Tagged v1.0.0-rc.1.
- v1.0.0 (production, live mode) waits for the owner: OneMap secrets on production, then `deploy:prod` + smoke:deploy + smoke:live. The field test is the owner's call (OQ8). Then M6 (APK on a device; keystore from the owner).

## 2026-11-19 — v1.0.0 LIVE at https://howtogo.wwweeeiii.com (live mode)
- The owner set ONEMAP_EMAIL, ONEMAP_PASSWORD and LTA_ACCOUNT_KEY on production (names verified, values never seen). The OneMap registration "access code" is a one-time email verification, not needed by the app.
- rc.1 deploy:prod (72ed2d81) passed smoke:deploy 31/31 (fixtureMode false, onemap ok, lta key) and smoke:live 11/11. The Director then bumped the version to 1.0.0 (package.json, version.ts, fixa test), ran unit tests, deployed (0fa796a0): smoke:deploy 31/31, smoke:live 11/11. Pixel 7 check: no sample banner, search 200, no console errors, no horizontal scroll. Tagged v1.0.0.
- Still open (owner): field test (OQ8), privacy contact, old raus-ums Worker. Next: M6 (APK on a device; keystore from the owner). QA-60 fixed; known flakes listed in qa/reports/1.0.0-rc1-m5.md.

## 2026-11-19 — Hotfix 1.0.1 live (owner bug: route map didn't show the whole trip)
- Root cause: map minZoom = OneMap tile minzoom 11, but MapLibre zoom is in 512 px units and OneMap tiles are 256 px, so the fit for long trips (Seletar→Novena ≈ z10.3) was clamped and cut both ends. Fix (4855b7f): pure overview fit (all legs + ends, overlay-aware padding, z 9.5–16.5, refit on change/resize); attribution bottom-left, locate bottom-right. New e2e projects every vertex inside the card at 390/412 px × 100/200 % (fails on the old build). Unit 290/290; Docker dev-e2e 244/244.
- Deployed preview (smoke 30/30) and production f383717e (smoke:deploy 31/31, smoke:live 11/11). Tagged v1.0.1.
- Follow-up (M6 or 1.0.2): the family viewer map has the same zoom floor; check its fit for long trips.

## 2026-11-19 — Owner requests → 1.1 "Smart search + compact credit"
- (1) OneMap credit as a minimised icon. Ruling: logo-only chip, tap/ⓘ expands the full credit line, **only if OneMap's terms of use allow it**; Creative checks the public terms; if the full text must stay visible, report back to the owner.
- (2) Smarter search (KKH → KK Women's and Children's Hospital; "guan yin" → Guan Yin temples). Owner decision: **Claude (Anthropic API)** as the AI fallback (asked with three options).
- Design: Layer 1 = a curated SG alias dictionary (abbreviations, zh/colloquial names → OneMap terms), instant and offline-capable. Layer 2 = only when OneMap + aliases return 0 or very few results, the Worker asks Claude to rewrite the query into 1–5 OneMap search terms (structured JSON output), re-queries OneMap, merges and de-dups, and shows a "did you mean" list for ambiguous cases.
- Model: `claude-opus-5-5` (the skill default), effort `low`, structured outputs via the official `@anthropic-ai/sdk` in the Worker, `fallbacks: "default"` (server-side fallback beta) on refusal. Cache rewrites in KV by normalised query (30 days); per-client rate limit; timeout ~4 s, after which plain results are shown. Send ONLY the query text — no location, ids or IP. The owner adds `ANTHROPIC_API_KEY` with `wrangler secret put`; without it the AI layer is off (aliases still work). Privacy page + Settings line updated.

## 2026-11-19 — 1.1 Creative spec (STYLE-GUIDE v1.5 §6g, d7487e4)
- OneMap credit: a tap-to-expand chip is NOT approved. OneMap docs say "you MUST include the OneMap logo and attribution", and ToU 3(b)(ii) forbids obscuring copyright notices or logos. Build C1-A: an always-visible compact credit (20 px logo + two-line text, ~160×35 px, bottom-left, plain text with no links on map cards; the linked credit stays on About). C1-B (the chip) is specced but needs SLA's written OK. Asking SLA is the owner's call.
- Search frames: alias explainer line, "换个说法再找找… / Trying other names for it…", "你是不是要找： / Did you mean:", postal-code hint on empty, silent plain fallback, voice "你说的是：… / You said: …". The words "AI" and "Claude" never appear in the UI.
- Privacy v2: Anthropic line (only words, only when nothing is found, guesses kept ≤ 30 days) + the speech-service line; en 399 words.

- 1.1 engine (5be61c1): 135 aliases + station zh names; flow aliases → OneMap → voice alternatives → ≤1 Claude rewrite → OneMap; cached 30 d; 20/client/h. Ruling: AI_DAILY_CAP default 300 (KV free-plan write limit; worst day ≈ $3). SDK adds ~340 KB gz to the Worker, lazy-loaded: accepted (Worker-side, not the PWA budget).

- 1.1 Creative review (7d2e8bc): APPROVED WITH FIXES. M1 ruling: keep FEW = 2 (one result is often the wrong place); privacy copy becomes 几乎搜不到时 / "finds almost nothing" so it stays accurate. L1/L2 cosmetic. All batched with QA findings.

## 2026-11-19 — Owner bug on live 1.0.1: family viewer map blank (S2)
- Desktop ~1252 px, dark, zh: the status card works, the map panel is blank (no tiles, no puck). CSP is the same as the app (not the cause). viewerMap.ts has the same 256/512 minZoom mistake as 1.0.1; other suspects: zero-size container, setPuck before style load, lazy import failure. Also "Kk Women's" title-casing. Added to the 1.1 fix round with a failing-first scripted e2e (canvas size, tile request, puck layer).

## 2026-11-19 — v1.1.0 LIVE
- QA re-check PASS (qa/reports/1.1.0.md, 93c284a): QA-61…67 fixed, owner's viewer map bug fixed (the container was 0 px tall; new map.spec), KK casing fixed; suites 165/165; LCP 2337 ms.
- Preview smoke 30/30; production efe346f9: smoke:deploy 31/31, smoke:live 11/11. Health: `ai: "off"` (no ANTHROPIC_API_KEY yet), aliases live (`kkh` → KK Women's and Children's Hospital, via alias). Tagged v1.1.0.
- Notes: a search cached before the deploy still shows the old casing until its cache entry expires. New S4 QA-69: KEEP_UPPER holds VivoCity/JCube/NParks upper-cased, so they would render "VIVOCITY" — use a proper-case map for brands. QA-68 "ICA Hq". Both go to the next round.

- Model eval built (qa/ai-eval 32d3f34): 63 cases, deterministic OneMap grader using step=1 direct hits (no live AI/cap use), 4 arms, ~$0.95, $1.50 guard. Waiting on a valid Anthropic key: the owner's key returns 401 both in production (ai_rewrite api_error_401 seen in wrangler tail) and locally; production degrades silently to plain results. New S4 QA-70: alias "poly" → polyclinic even when a polytechnic is meant.

## 2026-11-20 — Search-rewrite model eval (qa/evals/search-rewrite/report.txt)
- 63 cases × 4 arms, total spend $0.18. Accuracy: Opus 5.5 low 93.7% (3 wrong-place), Sonnet 5.5 between_tools 92.1% (5), Sonnet 5.5 low 90.5% (5), Haiku 5.5 81.0% (5 wrong, 11% none). Opus vs Haiku significant (McNemar p=0.008); Opus vs Sonnet not (p≈0.6–1.0), but Sonnet makes 2 more wrong-place errors.
- Measured cost per call is far below the estimate: Opus $0.0015 (~$2.3/month at 50/day), Sonnet $0.0007, Haiku $0.00006. p50 latency 1.5–2.1 s for all.
- Ruling: keep claude-opus-5-5 (decision rule: cheapest arm within significance AND wrong-place ≤ best+1; none qualify). Revisit with a larger case set if volume grows. Some grader strictness may count near-misses as wrong (e.g. "National Library, Singapore"); it affects Haiku most.

## 2026-11-20 — M6: new Android signing key created on nnie (owner request)
- The 2026-11-17 key was not found, so the owner asked for a new one; no users have installed the APK yet. D:\keysndroid\howtogo-release.p12 (PKCS12, RSA 4096, SHA384withRSA, alias howtogo, valid to 2056-11-12, DN "CN=HowToGo, O=HowToGo, C=SG", no personal data). Random 40-char password in keystore-password.txt (store = key password), never printed. ACL: owner account only. Certificate SHA-256 89:44:29:84:68:3A:45:E9:F7:6B:4E:25:F7:BD:A0:5F:BF:73:FC:F5:69:E4:10:4D:11:5D:B8:C4:75:B6:7E:D1. Outside the repo. The owner must back up the folder offline.
- Builds pass HOWTOGO_KEYSTORE / _PASSWORD / _KEY_ALIAS / _KEY_PASSWORD from those files at build time (env only, never keystore.properties in the repo).

## 2026-11-20 — M6 build round: signed 1.1.0 APK
- f9ff7b9: the SDK already existed at D:\Android\sdk (platform-tools 37.0.1, android-36, build-tools 36.0.0); JDK 21, Gradle 8.14.3, AGP 8.13.0. Windows fixes for release/sign scripts; .gitattributes keeps *.sh and gradlew LF. verify-release.sh: v2, 1 signer, cert 89442984… = release-cert.sha256; zipalign -P 16 OK; versionCode 1010000; allow-list OK; not debuggable; no backup; no cleartext; JVM 13/13.
- APK D:\howtogo-builds.1.0\howtogo-1.1.0.apk, 1 863 011 B, SHA-256 7cc62f33bdd1d9109caca59b9f70f0089fb6f7a408bff8cdf1dc830ad3f0f3e8.
- AC 28 notes (re-confirmed from the 2026-11-17 rulings): no WAKE_LOCK (FGS keeps the CPU awake); the non-exported GoogleApiActivity is accepted. The script keeps them as notes. Lint is pending for the M6 gate.
- Next: the first device session with the owner (docs/process/android-sideload.md), Creative M6 frames, then the M6 UI round.

## 2026-11-20 — M6 Creative frames approved (12cbfb0, STYLE-GUIDE v1.6 §6h, direction v1.5 D31–D34)
- Approved: icons battery, bell-off, smartphone; launcher/splash/notification icon geometry; 27 drawn battery-guide pictures (zh/en). No new tokens.
- OQ defaults accepted: off-route notification on the `info` channel; no destination or contact names in notifications (lock-screen privacy); the QA build keeps the same icon (label "怎么去 QA" tells them apart); Play Protect wording checked on the owner's phone.
- Next: M6 UI round (native explainers, battery guide, notifications, no-voice, WebView-too-old, update notice, Get-the-app card, /android page, icons into res/).

## 2026-11-20 — Owner request: dialect place names (坡底, 黑桥头…)
- Live check: the Claude fallback already handles 坡底/坡低/大坡 → Chinatown, 小坡 → Bugis, 水仙门 → High Street, 红灯码头 → Clifford Pier; it fails on 黑桥头/黑桥/乌桥/结霜桥. Also a ranking issue: a 7-Eleven sits above Chinatown MRT for 坡底 → rank MRT/landmarks above shops (QA-71, S3).
- PM research (pm/dialect-names): 60–90 sourced names with estimated locations, routing targets, confidence and sources, plus a list of owner questions. The owner reviews; then they become alias entries (instant, free, deterministic).
- Note: curl on this Windows host garbles CJK query strings; use node fetch with encodeURIComponent for CJK tests.

- APK handed out via the owner's existing dl.wwweeeiii.com share tool (D:\srv\downloads-service\share.ps1, random-token folder, expires 2026-11-27 08:00 SGT): 200, application/vnd.android.package-archive, 1 863 011 B. The temporary LAN server on :8978 was stopped. Future APKs use share.ps1 too.
- Dialect research interim: 结霜桥 = Sungei Road / Sim Lim Tower (high); 黑桥头 = Havelock/Delta Rd at Beo Crescent (medium-high); 黑桥/乌桥 alone can also mean Balestier → did-you-mean.

## 2026-11-20 — Owner bug: driver card (H10) shows only "Admiralty Grove" for Home (S2)
- The saved Home has no address/postal: a road/estate-level OneMap hit was accepted. H10 shows name + address + postal only when present (tripSheets.tsx:157).
- Ruling (next round, QA-72): (1) H10 back-fills a missing postal/block by reverse geocoding the saved lat/lng (live OneMap) and shows the full address; (2) choosing a road/estate as Home or a place asks "哪一座？/ Which block?" with nearby blocks or a postal-code entry (Creative to spec); (3) a one-time Home nudge for places without a postal code. Owner workaround: re-save Home by postal code.

- Owner add (QA-73, S2, same round as QA-72): "use my location" when setting Home saves only an estate/building name. Cause: normaliseRevGeocode (worker/src/normalise.ts:103) prefers the GeocodeInfo entry with BUILDINGNAME (e.g. "ADMIRALTY GROVE") even without BLOCK/POSTAL. Fix: prefer entries with BLOCK + 6-digit POSTAL, keep the estate name as a secondary line; the set-Home-from-location flow shows the full address + postal for confirmation with "不对？换一个 / Not right? Pick another" (nearby blocks), and saves address + postal. Unit tests with multi-entry GeocodeInfo fixtures.
