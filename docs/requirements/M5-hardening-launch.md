# M5 — 1.0 hardening & launch (web) (draft)

PM · 2026-11-17 · Estimate: **7–9 h if run straight through** (ROADMAP said 5–6 h; see "Estimate" at the end). Excludes owner waits: the OneMap/LTA keys and `wrangler secret put` (D-6), the custom-domain decision, a privacy contact, the TalkBack/VoiceOver pass, and the field test with 1–2 seniors (≈ 1 h each plus travel).

## Goal
Version **1.0.0** of the web app is **fast on a mid-range Android phone over 4G**, **frugal with battery**, **usable with a screen reader and at 200 % text**, **survives updates and lost signal**, explains plainly **what it does with her data**, and runs **live** (real OneMap and LTA data, no sample routes) on the owner's Cloudflare account. Real seniors have tried it, and the owner has signed it off.

## Non-goals (other milestones / Later)
- Screen-off guidance, native TTS, lock-screen alerts, the APK and its download page (M6).
- New user features. M5 only hardens, measures, explains and ships what M1–M4 built. Anything a field tester asks for goes to a "Later" list unless it is an S1/S2 bug.
- Full analytics, session replay, crash SDKs, A/B tests, cookies or any third-party script. Monitoring is privacy-safe error **counts** only (§I).
- iOS app, Play Store (D-6), accounts.
- A legal review of the privacy text. M5 writes a plain notice aligned with PDPA principles; the owner may get it reviewed (OQ2).

## Starting point (measured)
| Item | Today | M5 target |
|---|---|---|
| Lighthouse mobile perf (median of 3, QA-20 ruling) | `/` 84–86, `/about` 84–88, `/settings` 80–87 (M1 gate + re-check). FCP/LCP up to 4.4 s on a loaded host; TBT 0, CLS 0 | **≥ 90** on every gated URL |
| Lighthouse a11y / best practices / SEO | 100 / 93–100 / not gated | **≥ 90 all four** (a11y stays ≥ 95) |
| App JS (M1) | 60 KB gz; MapLibre 265 KB gz lazy | budgets in AC 3 (M2–M4 add code; re-measure first) |
| Gate perf threshold | perf ≥ 80, a11y ≥ 95 | raised to the M5 numbers (AC 1) |
| Hosting | ONE Worker with embedded assets (D-10) at `howtogo.raus-ums.workers.dev`, `FIXTURE_MODE=1`, sample-routes banner | production Worker, live mode, same origin; custom domain if the owner wants (OQ1) |

## Lessons carried in
- **Measure, don't guess:** Lighthouse is the median of 3 runs, run before the parallel e2e steps (QA-20). Perf ACs name the URL, device profile and run count.
- **Never fake data** (M1 Worker ruling): production without credentials answers 503, never sample routes. 1.0 is never tagged in sample mode (OQ9).
- **Safety beats savings** (D-7): low-battery mode may slow the map, sharing and GPS on long rides, but **never** delays or drops a get-off alert, Help or an arrival message.
- **No identifiers in logs** (M1 QA-15/17/18, M4 AC 49): monitoring counts carry no IP, coordinates, place names, share ids or free text.
- **Release-build smoke** (process §4): every check runs on the minified release build actually deployed, not the dev server.
- **Entry-point parity:** new things (update bar, install helper, low-battery mode, privacy link) are reachable from every place the parity table lists.

---

## Acceptance criteria

### A. Performance budget
| # | Pri | AC |
|---|---|---|
| 1 | Must | **Lighthouse ≥ 90 in all four categories** (performance, accessibility, best practices, SEO), mobile preset (Lighthouse default throttling: simulated slow 4G, 4× CPU), **median of 3 runs**, on the release build for `/`, `/route` (route list from fixtures), `/about`, `/privacy`, `/settings` and the family page `/t/:id` (fixture share). The gate threshold in `qa/scripts/lighthouse.sh` is raised to these numbers; a11y stays ≥ 95 |
| 2 | Must | **First load ≤ 2.5 s:** on the same Lighthouse mobile profile, LCP ≤ 2.5 s and TBT ≤ 200 ms (median of 3) on `/` cold (no SW, empty cache). Repeat visit with the SW: Home is usable (search field focusable) ≤ 1.0 s. CLS ≤ 0.05 on every gated URL. A real-phone check (owner's mid-range Android on 4G, cold, Chrome) is recorded in the field-test notes, not gated |
| 3 | Must | **JS/CSS budgets**, enforced by the gate's `build` step (gzip): entry chunk needed for Home ≤ **100 KB**; all app JS excluding MapLibre ≤ **250 KB**; family viewer entry ≤ **60 KB** (M4); CSS ≤ **30 KB**; MapLibre stays a separate lazy chunk, not precached, never loaded on Home until the map is shown. The ROADMAP's "≤ 300 KB excl. map" is the hard ceiling; these tighter numbers are the M5 budget. A budget overrun fails the gate with the chunk names and sizes |
| 4 | Must | **Fonts and images:** no web font download for CJK text (system fonts, as today); any Latin/numeral font is subset, `font-display: swap`, ≤ 30 KB. Icons are inline SVG sprites; raster images (logo, install-helper pictures) are AVIF/WebP with explicit width/height |
| 5 | Must | **Critical path:** `index.html` preloads the entry chunk and inlines the critical CSS for the first-run and Home screens; `/api/health` and the first search are not on the LCP path; the Worker serves static assets with `Cache-Control: public, max-age=31536000, immutable` for hashed files and `no-cache` for `index.html`, `sw.js` and the manifest (checked with `curl -I` in the post-deploy smoke, AC 33) |
| 6 | Should | Map first paint (route detail): tiles for the route's bounding box start within 300 ms of opening the screen; MapLibre is prefetched (`<link rel="prefetch">`) once Home has been idle 3 s |

### B. Battery
| # | Pri | AC |
|---|---|---|
| 7 | Must | **GPS throttling per leg (web):** the trip runtime passes the M2 location profile (walk 2 s, wait 5 s, ride 5–10 s, last 2 stops 2 s). On the web, which cannot set an interval, the adapter (a) uses `enableHighAccuracy: false` on the middle of a ride (more than 3 stops before the alighting stop) and `true` everywhere else, and (b) drops fixes that arrive faster than the profile interval before they reach the runtime, the map or the share. A Playwright test on the fake platform asserts the options per leg and the drop rate |
| 8 | Must | **Low-battery mode:** on when the battery reaches ≤ 20 % and is not charging (Battery Status API through `Platform.battery`, where supported), or when switched on in Settings ("省电模式 / Battery saver": Auto / On / Off, default Auto). It: dims to pocket view after 20 s idle instead of 45 s; stops map animations and renders only on camera change; sets the share cadence to 30 s moving / 120 s still; widens the ride-leg interval to 10 s. A small leaf chip on H5 says "省电模式 / Battery saver". Where the Battery API is missing (iOS, Firefox), Auto behaves like Off and the setting says so |
| 9 | Must | **Never degraded by battery saving:** get-off alerts (next stop / now), off-route detection on walk legs, Help, the arrival message and the wake lock behave exactly as in normal mode. A test runs the bus-only GPS replay in low-battery mode and asserts the same alert sequence and timing (± one fix) as normal mode |
| 10 | Should | **Battery measurement (owner):** one 1 h trip with the screen on (pocket view) on the owner's phone, normal vs low-battery mode, recorded in the field-test notes. Target ≤ 15 %/h normal (M2 OQ6), ≤ 10 %/h in battery saver. Reported, not gated |

### C. Accessibility audit
| # | Pri | AC |
|---|---|---|
| 11 | Must | **axe (WCAG 2.1 AA)** reports 0 violations on every screen, sheet and state in the QA matrix (M1–M4 screens, the family page's 9 states, the new M5 pages and bars), zh/en × light/dark × 100/200 % |
| 12 | Must | **Manual audit by QA** in headless/headed Chromium: keyboard-only through Home → search → route list → route detail → Start → End confirm → Help → Share; visible focus everywhere; focus moves to the sheet when it opens and back to its trigger when it closes; no keyboard trap. Results table in the QA report |
| 13 | Must | **Screen-reader semantics:** every control has a zh and en accessible name; headings form an outline per screen; the guided-trip headline and get-off alerts are announced once through one polite (headline) and one assertive (get-off alert) live region; the stops-left countdown is **not** announced on every change (only at 3, 2, 1 and "now"); decorative icons are hidden. Checked by an a11y-tree snapshot test per screen |
| 14 | Must | **200 % text and 400 % zoom reflow:** at the `xxlarge` app text size on a 390 px phone and at 320 CSS px wide (400 % zoom of 1280), no horizontal scroll, no clipped text, no overlap (rect-overlap test), all targets ≥ 56 px with 8 px gap |
| 15 | Must | **Owner screen-reader script** (below) is written in `qa/manual/screen-reader.md` in zh and en, ≤ 20 min each for TalkBack (Android Chrome) and VoiceOver (iOS Safari), with a results table the owner fills (pass / problem / note). Failures the owner reports are triaged like gate bugs (S1–S4) |
| 16 | Should | `prefers-reduced-motion` and the in-app reduce-motion setting remove all non-essential motion (pulse, slide, puck easing) — checked by a test that asserts no running CSS animations or transitions longer than 0 s on H1, H5, H6 |

### D. Updates and offline
| # | Pri | AC |
|---|---|---|
| 17 | Must | **SW update path across two builds** (extends the gate's two-build test): build A = 0.4.x with Home places, recents, settings, family contacts, an **active trip** and an **active share** in storage; build B = 1.0.0. Loading B: (a) the new SW installs in the background; (b) **during an active trip it never reloads the page and shows no update bar**; (c) on Home or Settings an update bar "有新版本 · 点这里更新 / New version · tap to update" appears; tapping it activates the new SW and reloads once; (d) after the update every stored key is intact or migrated (versioned keys `*.v1` → migration functions with unit tests), the trip resumes, the share keeps its id |
| 18 | Must | **Stale-cache safety:** an `index.html` from build A never loads chunks from build B or 404s on a missing chunk: old hashed chunks stay in the SW cache until the new SW activates, and a chunk-load failure triggers one clean reload, never a loop (tested by deleting a chunk from the server mid-session) |
| 19 | Must | **Offline active trip, release build, production Worker:** start a trip on the deployed build, go offline (Playwright `context.setOffline`) and finish the bus-only replay: steps, alerts, voice stubs, corridor tiles and auto-advance all work; the share reconnects and sends only the latest fix when online again (M4 AC 12). Re-verifies M2 AC 35 on the 1.0 artifact |
| 20 | Must | **Offline cold start:** with no network, launching the installed app opens Home with saved places, family contacts, recents and Settings; search and route buttons say "需要网络 / Needs internet" instead of spinning; Help still offers call family, Show the driver (last known address if any) and 995 |
| 21 | Should | A "What's new / 新功能" sheet appears once after updating to 1.0.0 (three plain lines, zh/en), never during a trip |

### E. Privacy page, About
| # | Pri | AC |
|---|---|---|
| 22 | Must | **Privacy page `/privacy`** (zh/en, plain language, ≤ 400 words per language, Creative copy): what stays on the phone (places, contacts, recents, settings, trip); what goes to our server and for how long (searches and route requests, not stored; a shared trip's position, only while sharing, ≤ 4 h, gone 30 min after arrival; the one-time setup box ≤ 24 h, ciphertext only; anonymous error counts, §I); who else is involved (OneMap/SLA for maps and routes, LTA DataMall for bus and train data, Cloudflare for hosting, WhatsApp/SMS/Grab only when she taps them); no ads, no tracking, no accounts, no sale of data; how to delete everything ("Delete all my data" in Settings + uninstall); the date and version of the notice. Linked from Settings, About, the family page footer and `/setup` |
| 23 | Must | **Contact line:** shown only when the owner provides a contact (OQ2). Until then the page says "有问题？用设置里的「报告问题」/ Questions? Use Report a problem in Settings", and the gate's secret scan keeps rejecting real e-mail addresses in `src/` except an explicitly allow-listed contact |
| 24 | Must | **About** (`/about`): app name and logo, version + build date, "示范路线 / Sample routes" status if in fixture mode, data attributions exactly as required (OneMap logo + "Map data © contributors, Singapore Land Authority"; "Contains information from LTA DataMall accessed on … which is made available under the terms of the Singapore Open Data Licence version 1.0"), an open-source licences list generated at build time (`licenses.txt`, linked), links to Privacy and Report a problem |
| 25 | Must | **Privacy review (QA):** a scripted check of the deployed build: localStorage/IndexedDB key list matches the documented list; no third-party requests other than OneMap tiles/attribution assets (HAR scan); no cookies set; CSP header present and blocks inline scripts other than hashed ones; the Worker's request logs (`wrangler tail` during the e2e run) contain no coordinates, place text, share ids, tokens or IPs |

### F. "Add to Home Screen" helper
| # | Pri | AC |
|---|---|---|
| 26 | Must | **Android Chrome / Edge / Samsung Internet:** after the **second** completed search or route view (never during a trip, never on first run), a card on Home "把怎么去放到桌面 / Put 怎么去 on your home screen" with one button that calls the captured `beforeinstallprompt`. Dismiss = hidden for 14 days; two dismissals = never again (Settings keeps an "Install" row, M1) |
| 27 | Must | **iOS Safari:** the same card shows a 3-step picture guide (Share icon → "添加到主屏幕 / Add to Home Screen" → Add), Creative frames. iOS Chrome/Edge on iOS 16.4+ get the same guide with their own share-menu position; other iOS browsers and older iOS get "用 Safari 打开 / Open in Safari" with a copy-link button |
| 28 | Must | **In-app browsers** (WhatsApp, Facebook, Telegram, WeChat, Line; detected by UA tokens): a slim bar "在浏览器里打开会更好用 / Works best in your browser" with "Open in Chrome" (Android `intent://` URL) or copy-link + "open Safari" steps (iOS). Not shown on the family page `/t/:id` (it must just work in WhatsApp's browser) |
| 29 | Must | Hidden when already installed (`display-mode: standalone`, `navigator.standalone`), inside the M6 Android app (`capabilities.native`), and in low-battery mode during a trip. Hook lines `install:shown|accepted|dismissed` (no UA string) |

### G. Production configuration and deploy
| # | Pri | AC |
|---|---|---|
| 30 | Must | **Two Workers (OQ4):** `howtogo` = production, `howtogo-preview` = preview / release candidates, each with its own KV namespace and Durable Object class, both deployed by `npm run deploy:prod` / `deploy:preview` from the repo root (embedded assets, D-10). `wrangler.toml` holds placeholders only; `[env.test]` alone may set `SHARE_TEST_TTL_SECONDS` (M4 OQ6) — the gate fails if production config sets it |
| 31 | Must | **Live mode:** production runs `FIXTURE_MODE="0"` once the owner has set `ONEMAP_EMAIL`, `ONEMAP_PASSWORD`, `LTA_ACCOUNT_KEY` (and `VAPID_*` if M4 push is built) with `wrangler secret put` (owner or Director with the owner's OK; values never in chat, logs or the repo). `/api/health` reports `{fixtureMode:false, onemap:"ok", lta:"ok", version}` without exposing token expiry or secrets. Without credentials, production answers 503 (M1 ruling) and the UI shows "暂时无法查路线 / Can't find routes right now", never sample routes |
| 32 | Must | **Origins and headers:** `ALLOWED_ORIGINS` for production lists only the production origin(s) (+ `https://localhost` for M6's WebView); security headers on every HTML response: CSP, `Referrer-Policy: no-referrer` on `/t/*` and `/setup*`, `X-Content-Type-Options`, `Permissions-Policy` limiting geolocation to self, HSTS on the custom domain |
| 33 | Must | **Post-deploy smoke** `npm run smoke:deploy -- <url>` (no secrets): `/` 200 with the expected version in `/version.json`; hashed assets immutable, `index.html`/`sw.js` no-cache; manifest valid; `/api/health` shape; `/t/<random>` → not-found page; security headers present. Runs after every deploy; a failure means `wrangler rollback` to the previous version (documented in `docs/process/release.md`) |
| 34 | Must | **Custom domain (owner, OQ1):** if the owner adds a zone, the production Worker gets a custom-domain route; `workers.dev` stays live and **redirects HTML pages** to the custom domain except `/t/:id` and `/api/*` (so share links already sent keep working until they expire). Until the owner decides, 1.0 ships on `workers.dev` |

### H. Live-credential smoke test
| # | Pri | AC |
|---|---|---|
| 35 | Must | **`npm run smoke:live -- <url>`** calls the deployed Worker's public API (no secrets on the client): search for 3 fixed places (e.g. "Tan Tock Seng Hospital", "Bedok Interchange", a postal code); 3 routes (bus-only, MRT + transfer, mixed); reverse geocode of a fixed point; bus arrival at 2 fixed stops; `/api/alerts`; `/api/lifts`. Each response is validated against the shared runtime types; it reports every ⚠ open item from D-7 and M3 (Bearer prefix and token expiry handled — inferred from `/api/health`; `fare` present?; `Monitored` present?; TrainServiceAlerts shape; FacilitiesMaintenance shape) as FOUND / MISSING |
| 36 | Must | Exit codes: 0 PASS; 1 FAIL (a live call failed or a shape mismatched); **2 BLOCKED** when `/api/health` says `fixtureMode:true` or credentials are missing (BLOCKED is not FAIL, as in M3). Output contains no tokens, no full responses, no coordinates beyond the fixed test points; a `--json` report goes to `qa/.out/smoke-live.json`. Rate: ≤ 20 requests per run, ≥ 300 ms apart |
| 37 | Should | `npm run smoke:live -- --direct` (Developer only, with a local `.dev.vars` never committed) calls OneMap and LTA directly to confirm the upstream field names when the Worker-level smoke fails |

### I. Monitoring-lite
| # | Pri | AC |
|---|---|---|
| 38 | Must | **Client error counts:** uncaught errors, unhandled rejections, chunk-load failures, API error classes (timeout, 5xx, 429, 503-no-creds), SW install failure, geolocation `unavailable`, speech unavailable. Each is sent as `POST /api/telemetry {v, code, screen, n}` — `code` from a fixed enum, `screen` from the router's screen ids, `n` a count — batched, at most one request per 5 min and 20 per day, `sendBeacon` on page hide. **No** message text, stack, URL query, UA, coordinates, place names, ids or timestamps finer than the day |
| 39 | Must | **Worker side:** a `Stats` Durable Object (or Workers Analytics Engine, OQ5) adds counts per day × version × code × screen, plus server-side upstream counts (OneMap/LTA 4xx/5xx/timeouts, token renewals, share creates/ends, rate-limit hits). The IP is used only for the existing in-memory rate limit and never stored. Data older than 90 days is deleted. `GET /api/stats?days=7` returns the table only with the `STATS_TOKEN` secret (owner); otherwise 404 |
| 40 | Must | Settings has "发送匿名错误统计 / Send anonymous error counts" (default per OQ3), explained in one line and on the Privacy page; off = nothing is sent. The family page sends nothing |

### J. Field test, release
| # | Pri | AC |
|---|---|---|
| 41 | Must | **Field-test kit** in `docs/field-test/`: an owner-run script (below) in zh and en; a one-page large-type feedback form (printable PDF + the same questions as a plain text list), ≤ 10 questions, smiley scales plus 3 open questions; a consent line the owner reads aloud; a notes template (phone model, Android/iOS version, battery start/end, issues with screen + time). No audio/video recording, no photos of faces, no participant names in the repo (P1, P2) |
| 42 | Must | Field-test findings are triaged by the PM into S1–S4 bugs (fixed before 1.0 if S1/S2) and a "Later" list in `docs/field-test/findings.md`. **Owner sign-off** is recorded in `director-log.md` |
| 43 | Must | **Release 1.0.0:** `version.ts`, `package.json` and `/version.json` = `1.0.0`; `docs/releases/1.0.0.md` with plain zh/en release notes (what she can do, what's not there yet, known limits: screen must stay on in the web app), the gate report `qa/reports/1.0.0.md`, the dist zip + `.sha256`; git tag `v1.0.0` on the gated commit (tag created only on the Director's go, pushed with the owner's OK); production deploy of exactly that artifact; post-deploy smoke (AC 33) and `smoke:live` (AC 35) PASS |
| 44 | Should | `docs/process/release.md`: the release checklist (gate → preview deploy → smoke:deploy → smoke:live → owner OK → prod deploy → smoke → tag), rollback steps (`wrangler versions` / `rollback`), and how to rotate the OneMap password and LTA key |

### Entry-point parity (new M5 items)
| Surface | Privacy link | Update bar | Install helper | Battery saver | Error-counts switch |
|---|---|---|---|---|---|
| H1 Home | via Settings | ✔ | ✔ card (AC 26–28) | — | — |
| H5 / pocket view | — | **never** during a trip | **never** | chip | — |
| Settings | ✔ | ✔ | Install row | ✔ setting | ✔ |
| About | ✔ | — | — | — | — |
| Family page `/t/:id` | footer ✔ | — | **never** | — | sends nothing |
| `/setup` | ✔ | — | — | — | — |

## Testability
| What | How | Needs |
|---|---|---|
| Lighthouse ≥ 90 ×4, LCP, TBT, CLS | `qa/scripts/lighthouse.sh`, mobile preset, median of 3, run before the parallel e2e steps; JSON kept | Release build |
| JS/CSS budgets | gate `build` step reads the Vite manifest and gzips each chunk | — |
| GPS throttling, low-battery mode, "never degraded" | Playwright on the fake platform + the M2 GPS replays; `Platform.battery` stub at 15 % / charging / unsupported | — |
| a11y | axe in the matrix; a11y-tree snapshots; keyboard script; rect-overlap at 200 %/400 % | — |
| SW update with active trip + share | `pwa.spec.ts` two-build server, storage seeded from a 0.4.x fixture | build A = previous release tag |
| Offline trip / cold start | `context.setOffline` on the release build (local `wrangler dev`) and once against the preview Worker | Preview deploy |
| Install helper | stub `beforeinstallprompt`; UA overrides for iOS Safari, iOS Chrome, WhatsApp/FB/WeChat in-app; `display-mode` emulation | — |
| Privacy review | HAR scan, storage key list, cookie check, CSP check, `wrangler tail` grep | Preview deploy |
| Monitoring | vitest (Stats DO, retention, token check, schema rejects extra fields); Playwright asserts the telemetry payload has only `v, code, screen, n` | — |
| smoke:deploy | runs against preview after each deploy | Preview deploy |
| **Needs credentials** | `smoke:live` PASS (BLOCKED until the owner's keys are set) | Owner's OneMap + LTA keys |
| **Needs real phones** | TalkBack + VoiceOver script; install helper on Android Chrome and iOS Safari; WhatsApp in-app browser bar; 4G cold load timing; battery drain; the field test | Owner, 1–2 seniors |

### Owner screen-reader script (summary; full text in `qa/manual/screen-reader.md`)
1. Turn on TalkBack (Android: Settings → Accessibility) or VoiceOver (iOS: Settings → Accessibility). Open the installed app.
2. Swipe through Home: every button reads a clear name (e.g. "去哪里？ 搜索", "回家"). Note any that read "button" or English in zh mode.
3. Search "医院", pick a result, open the first route. Swipe through the steps.
4. Tap Start. Listen: the step is read once; the countdown is not read every few seconds.
5. Use the demo replay (AC 50 M2) to reach "get off next stop": the alert is read at once, even mid-sentence.
6. Open Help, then close it: focus returns to where you were. Open Share, close it.
7. Back gesture from every screen goes back one step (Android).
8. Turn the screen reader off. Note the time taken and anything confusing.

### Field-test script (owner-run, per senior, ≈ 60 min; summary — full text in `docs/field-test/script.md`)
1. Read the consent line; note phone model and battery %.
2. Senior installs the app with the helper (or the owner does it, noted).
3. Task 1: find the way to a familiar place (clinic, market). Owner watches, does not help for 2 min.
4. Task 2: make the text bigger.
5. Task 3: a real short trip (1 bus ride or 2 MRT stops) with guided mode. Note: did she hear/feel the get-off alert in time? Did she look at the phone at the right times?
6. Task 4: share the trip with a family member (owner's phone as "family").
7. Task 5: open Help and find "call family" (cancel the call).
8. Feedback form together; battery % at the end.

## QA gate scope
- `qa/gate.sh` on the 1.0.0 release build with the raised Lighthouse thresholds (AC 1) and budgets (AC 3); every Must AC mapped to a test ID in `qa/reports/1.0.0.md`.
- Full regression of M1–M4 (dev-e2e, qa-e2e matrix, two-browser share test, GPS replays).
- Upgrade test 0.4.x → 1.0.0 with an active trip and share (AC 17).
- Privacy review (AC 25), `smoke:deploy` on preview and production, `smoke:live` (PASS required for the tag; BLOCKED holds the tag, OQ9).
- Owner items read from their notes: screen-reader results, field-test findings and sign-off, battery numbers, 4G cold load.
- Not in scope: anything Android-app (M6).

## Open questions (with recommended defaults)
| # | Question | Default | Who |
|---|---|---|---|
| OQ1 | Custom domain for 1.0? | **Ship on `howtogo.raus-ums.workers.dev`**; when the owner adds a domain to the Cloudflare account, add a custom-domain route and redirect HTML pages (AC 34). Domain name and purchase are the owner's | **Owner** |
| OQ2 | Privacy contact on About/Privacy? (pending since Creative round 2) | **No contact line until supplied**; point to Report a problem. Recommend a dedicated alias e-mail (not a personal address). Optional legal review of the notice | **Owner** |
| OQ3 | Anonymous error counts on by default? | **On**, with the Settings switch and a line on the Privacy page (no personal data is sent, AC 38) | **Owner** (privacy, FYI like M4 OQ3/4) |
| OQ4 | Separate preview and production Workers? | **Yes** (`howtogo-preview`, `howtogo`). The current `howtogo` Worker becomes production when 1.0 ships; share links sent from the preview stay on the preview | Director |
| OQ5 | Stats store: Durable Object vs Workers Analytics Engine? | **Durable Object** (already used, free plan, simple 90-day delete); switch to Analytics Engine only if counts grow | Director |
| OQ6 | Low-battery threshold | **≤ 20 % and not charging** | Director |
| OQ7 | Lighthouse perf stuck at 88–89 after the budget work? | **No waiver**: perf ≥ 90 is Must. If MapLibre's lazy load is the cause on `/route`, measure `/route` with the map below the fold; any change to the measurement method needs a Director ruling, logged | Director |
| OQ8 | Field-test participants | **1–2 seniors the owner knows**, verbal consent read from the script, owner present, no recordings, first names never written down (P1/P2) | **Owner** |
| OQ9 | Keys not in by release time? | **No 1.0 in sample mode.** Tag `1.0.0-rc.N` on the preview Worker; tag `v1.0.0` only after `smoke:live` PASS on production | Director / **Owner** (keys) |
| OQ10 | Who runs `wrangler secret put` for production? | **The owner**, from their computer or the Cloudflare dashboard (D-6). The Director may do it only with the owner's explicit OK, never echoing values | **Owner** |
| OQ11 | 1.0 waits for M6? | **No.** 1.0.0 = web. The Android app ships as 1.0.x/1.1.0 after M6 with the same version line | Director |

## Creative frames needed
- **Privacy page** (`/privacy`) and the reworked **About** (attributions block, licences link, version, sample-mode line), zh/en, 100/200 %, light/dark.
- **Update bar** on Home/Settings and the **What's new** sheet (1.0 copy).
- **Install helper:** Android card; iOS 3-step picture guide (Share icon, "Add to Home Screen", Add — drawn, not screenshots); "Open in Safari" note; **in-app-browser bar** (Android and iOS variants).
- **Battery saver:** Settings row (Auto / On / Off + "not supported on this phone" line) and the H5 leaf chip; any new icon (leaf).
- **Offline cold start** states: "需要网络 / Needs internet" on search and route buttons.
- **Error-counts** Settings row copy.
- **Field-test feedback form** (printable, large type, smiley scales, zh/en) and the consent line wording.
- Release-notes tone for `1.0.0.md` (Creative reviews the PM draft).
- Each: SR labels, Back target, baseline names.

## Estimate (wall clock, straight through)
| Step | Hours |
|---|---|
| Measure M1–M4 build; perf work (critical CSS, preload, chunking, caching headers) to Lighthouse ≥ 90 ×4 | 1.5–2 |
| Battery: per-leg throttling on web, low-battery mode, "never degraded" test | 0.75 |
| a11y fixes + a11y-tree snapshots + keyboard audit + screen-reader script | 1 |
| SW update with active trip/share, migrations, chunk-failure reload, offline cold start | 0.75–1 |
| Privacy page, About, licences, install helper, in-app-browser bar | 1 |
| Production config: two Workers, headers, smoke:deploy, smoke:live, release doc | 0.75–1 |
| Monitoring-lite (client + Stats DO + Settings switch) | 0.5 |
| QA gate + one fix round; field-test kit; release notes, tag | 1–1.5 |
| **Total** | **7–9 h** (+ owner time: keys, screen readers ≈ 40 min, field test ≈ 1 h per senior) |
