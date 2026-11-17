# M1 — Foundation (draft)

PM · 2026-11-17 · Estimate: **6–8 h if run straight through**. That is two Developer rounds (engine/Worker, then UI after M0 sign-off), plus a gate and one fix round.

## Goal
An installable PWA, in Chinese and English, that finds **real** public-transport routes A→B from OneMap and shows them as a simple list, steps and a map. It is served via a Cloudflare Worker that holds every secret.

## Non-goals (later milestones)
- Guided trip, voice, follow-me, alerts (M2).
- Bus arrival, MRT alerts, lifts, multi-stop, fare (M3).
- Share, Help, saved places beyond Home, caregiver setup (M4).
- Perf/battery tuning and the full a11y audit (M5).

## Lessons carried in (process §3, §7)
- Report button and test log hooks from M1.
- In-app history so Back works everywhere.
- Decisions as pure functions with unit tests.
- Every control labelled.
- Playwright from day one.

---

## Acceptance criteria

### A. PWA shell & navigation
| # | Pri | AC |
|---|---|---|
| 1 | Must | App served over HTTPS from Cloudflare Pages; valid web manifest (name "怎么去?", short_name, 192/512 + maskable icons from Creative, `display: standalone`, theme colours light/dark) |
| 2 | Must | Service worker precaches the app shell. A cold reload while offline shows the Home screen plus an offline notice (copy from Creative), not a browser error |
| 3 | Must | Lighthouse "installable" passes. Chrome shows the install prompt; the app offers its own "安装到主屏幕 / Add to Home screen" entry in Settings |
| 4 | Must | SW update: a new deploy is picked up on the next launch with a calm "已更新 / Updated" toast; there is no stuck old version (Playwright test with two builds) |
| 5 | Must | Every screen, sheet and dialog pushes a history entry. Browser/Android Back goes back one in-app step and closes the topmost sheet first. It leaves the app only from Home |
| 6 | Must | Screens: Home, Search, Route options, Route detail, Settings, About. The deep link `/#/route?from=…&to=…` restores Route options |

### B. Language, type, theme
| # | Pri | AC |
|---|---|---|
| 7 | Must | UI language 简体中文 (default) and English, switchable in Settings and on first run. The choice persists (localStorage, try/catch) |
| 8 | Must | All strings come from i18n files. A script check fails the build on a missing key in either language |
| 9 | Must | Font size control: 标准 / 大 / 特大 (100/125/150%). The layout holds at 150% × browser zoom 200% with no clipped or overlapping text (Playwright rect-overlap check on all screens) |
| 10 | Must | Base text ≥ 20 px CSS at 100%. All tap targets ≥ 56 × 56 px with ≥ 8 px spacing (automated check) |
| 11 | Must | Light/dark follow the system, with a manual override. Text contrast ≥ 4.5:1 everywhere and ≥ 7:1 for primary instructions (axe + token check) |
| 12 | Should | Reduce motion honoured: no map fly animations or transitions when `prefers-reduced-motion` is set |

### C. Worker / API proxy
| # | Pri | AC |
|---|---|---|
| 13 | Must | The Worker exposes `/api/search`, `/api/revgeocode`, `/api/route`. The PWA calls only these, never OneMap directly (except tiles) |
| 14 | Must | OneMap credentials and LTA key live only in Worker secrets. A secret scan of the built PWA bundle and repo finds none |
| 15 | Must | Token: the Worker obtains a token via `getToken`, caches it with its expiry, renews when < 12 h is left, and on a 401 renews once and retries once. This is a unit-tested pure function on expiry logic plus an integration test with a mocked OneMap |
| 16 | Must | Input validation: coordinates inside the SG bounding box (1.13–1.48 N, 103.59–104.10 E), and search text 1–100 chars. Otherwise 400 with an error code (no stack trace) |
| 17 | Must | Caching: search 24 h by normalised query; revgeocode 1 h by coordinates rounded to 5 dp; route 2 min by (from, to, preference, minute) |
| 18 | Must | Worker logs never contain coordinates, search text or tokens (log-line test) |
| 19 | Must | Upstream failure or timeout (8 s) → the Worker returns a typed error. The PWA shows the Creative error state with a "再试一次 / Try again" button |
| 20 | Should | Basic rate limit per IP (e.g. 60 req/min) → 429 with a friendly PWA message |
| 21 | Must | **Fixture mode:** with no OneMap credentials configured, the Worker serves recorded fixtures (≥ 5 real SG trips), so dev and QA run before the owner registers |

### D. Search & location
| # | Pri | AC |
|---|---|---|
| 22 | Must | Home shows two large fields, "从 From" (default "我的位置 My location") and "到 To", and a primary "找路线 Find route" button. The swap button is ≥ 56 px |
| 23 | Must | Search: typing debounced at ≥ 300 ms; up to 8 results, each showing building name (large) + address/postal code (smaller); tolerant of postal-code-only input (e.g. "520123") |
| 24 | Must | Empty, no-result and error states per Creative frames, with exact copy |
| 25 | Must | "我的位置": asks for geolocation only on a user tap, with a pre-permission explainer screen. Denied → clear help text + typing still works |
| 26 | Must | My location is reverse-geocoded to a readable label ("Blk 123 Ang Mo Kio Ave 3"), falling back to "我的位置" if that fails |
| 27 | Must | **Home** can be saved (search → "设为家 Set as Home"). If Home is set, Home shows a large "回家 Take me home" button that routes from my location to Home in one tap. Stored on-device only |
| 28 | Should | Last 5 destinations are shown under the To field (on-device, clearable in Settings) |

### E. Route options & detail
| # | Pri | AC |
|---|---|---|
| 29 | Must | Route request: `routeType=pt`, `mode=TRANSIT`, `numItineraries=3`, current date/time, and the least-walking default (lower `maxWalkDistance`, re-rank by walk distance) |
| 30 | Must | **Ranking is a pure function** (`rankItineraries(itins, pref)`), unit-tested for least walking, fewest transfers and fastest. Only least walking is exposed in the M1 UI; the others land in M3 |
| 31 | Must | Each option card shows total time (large), arrival clock time, walking distance in metres, number of transfers, and mode chips: bus number / MRT line code + colour, never colour alone |
| 32 | Must | Leg parsing is a pure function from OneMap legs to a domain `Trip{segments[legs]}`, with a tested polyline decode. It handles walk-only, bus-only, MRT with transfer, and mixed |
| 33 | Must | Route detail: a vertical step list in plain language from Creative templates (e.g. "走路 300 米到 巴士站 Opp Blk 123", "坐 162 路，坐 6 站，在 XX 站下车"). Every step shows its stop/station name and stop count |
| 34 | Must | No route found / too close (< 200 m, offer walking) / outside SG → distinct friendly states |
| 35 | Should | "Start trip" button present but leads to an M2 preview state designed by Creative (no fake feature). Or hidden; Creative decides |

### F. Map
| # | Pri | AC |
|---|---|---|
| 36 | Must | MapLibre GL JS with OneMap raster tiles: Default in light, Night in dark. maxBounds = Singapore; zoom 11–19 |
| 37 | Must | OneMap attribution (logo + text) is always visible and not covered by UI at any font size |
| 38 | Must | Route detail map draws legs: walk dashed, bus solid, MRT in line colour. Markers for start, end and each boarding/alight stop; the map fits the route on open |
| 39 | Must | My-location dot with accuracy circle when permission is granted; a 56 px recentre button with a label |
| 40 | Must | The map is optional to understand the route. All information is in the step list, and the map is `aria-hidden` with a text alternative |
| 41 | Should | Map collapses to 30% height, with a 56 px "放大地图 Bigger map" toggle (no pinch needed) |

### G. Diagnostics & test hooks
| # | Pri | AC |
|---|---|---|
| 42 | Must | Settings → "报告问题 Report a problem" produces a redacted log: app version, UA, language, font size, last 200 deduped log lines, no coordinates or addresses. Shared via Web Share or copy |
| 43 | Must | Test log hooks: one-line, change-only events (`screen: <name>`, `route: n=<k> pref=<p>`, `api: <endpoint> <status>`), readable by Playwright via `window.__hooks` |
| 44 | Must | Every interactive control has an accessible name and a `data-testid` |

### H. Quality
| # | Pri | AC |
|---|---|---|
| 45 | Must | Gate script (`npm run gate`): typecheck, unit tests, i18n key check, secret scan, build, Playwright e2e, axe, Lighthouse (PWA installable, a11y ≥ 95, perf ≥ 80 mobile) |
| 46 | Should | JS bundle excluding MapLibre ≤ 150 KB gz; MapLibre lazy-loaded on first map screen |
| 47 | Must | About page: OneMap attribution, "Contains information from LTA DataMall" (placeholder until M3 use), and a short privacy statement in zh/en |

---

## Testability
| What | How |
|---|---|
| All UI flows (A–G) | **Playwright, headless Chromium** (available in container), against `wrangler dev` (Worker in fixture mode) + local Pages |
| Geolocation | `context.grantPermissions(['geolocation'])` + `setGeolocation({latitude, longitude})`; the denied path via no grant |
| Offline / SW update | `context.setOffline(true)`; deploy build A, then build B, reload, assert the toast and new version hook |
| Font scale / zoom | Set the app font size + `deviceScaleFactor`, viewport 360×740 and 412×915; rect-overlap script |
| Worker token logic | Vitest unit tests with a fake clock; Miniflare integration with mocked OneMap 200/401 |
| Live OneMap | One smoke test, `npm run smoke:live`, runs only when the owner's credentials are set |
| Real phone | Only install + a one-route look on Android Chrome and iOS Safari (owner or Director). Nothing else needs a device in M1 |

## QA gate scope
- Run `npm run gate` on the release build; every Must AC is mapped to a test ID in `qa/reports/0.1.0.md`.
- Playwright screenshot baselines (light/dark/150%) for every Creative M1 frame.
- Lighthouse report attached.
- Manual: VoiceOver/TalkBack quick pass on Home → Route detail (real phone if available, else noted as deferred to M5).
- Not in scope: battery, a real-world GPS walk, LTA endpoints.

## Open questions (with recommended defaults)
| # | Question | Default | Who |
|---|---|---|---|
| OQ1 | Frontend stack? | Vite + TypeScript + Preact (small, fast), no heavy UI kit; MapLibre GL JS | Director |
| OQ2 | Worker as a Pages Function (same origin) or a separate Worker? | Pages Functions for `/api/*` (same origin, no CORS); the DO is bound in M4 | Director |
| OQ3 | Token storage? | KV key `onemap_token` {token, exp}; the in-memory isolate cache is checked first | Director |
| OQ4 | Owner credentials not yet available? | Build and gate in fixture mode (AC 21); live smoke when they arrive | Owner |
| OQ5 | Show "Start trip" in M1? | Hidden until M2 (avoids preview badges) unless Creative prefers a designed preview | Creative/Director |
| OQ6 | Default max walk for "least walking"? | 500 m per walking leg; widen to 1000 m only if no itinerary is found | Director |
| OQ7 | Domain for preview? | `<project>.pages.dev` preview branch | Owner (Q4 in plan) |

## Creative frames needed (STYLE-GUIDE, M1)
- **H1** First run: language choice + font size.
- **H2** Home: From/To, Take me home, recent destinations, offline notice.
- **H3** Search sheet: typing, results, empty, no result, error.
- **H4** Location permission explainer + denied help.
- **H5** Route options: loading, 1–3 cards, no route, too close, outside SG, error/retry.
- **H6** Route detail: step list + collapsible map; step templates zh/en for walk/bus/MRT/transfer.
- **H7** Map style: route line styles, markers, my-location dot, recentre button, attribution placement.
- **H8** Settings (language, font size, theme, Home, clear recent, install, Report) + About/privacy.
- **H9** Toasts: Updated, offline, rate-limited.
- Each frame: dark and light, 150% + 200% zoom, screen-reader labels, Back target.
