# M2 — Guided trip (draft)

PM · 2026-11-17 · Estimate: **8–10 h if run straight through** (see "Estimate" at the end). Excludes owner waits: Director rulings, the Creative frame round for the missing frames (≈ 1 h, can run in parallel with the engine round), and the owner's real-phone walk/bus test.

## Goal
The owner's core ask: once a route is chosen, the app **takes the senior there**. One big step at a time, spoken in Chinese or English, with a map that follows them, a loud and unmissable "get off at the next stop", calm re-routing when they go another way, and a clear "You're here!" at the end. It works for single trips and for journeys with up to 5 stops, keeps working without data, survives a reload or a killed tab, and starts the same way from every place a trip can begin.

## Non-goals (later milestones)
- Real-time bus arrival chip, seat load, WAB icons (M3). The wait step shows the stop name and the "check the stop sign" line only.
- MRT disruption banner, lift warnings, fewest-transfers/fastest preference in the UI, fare, MRT exit hint, zh station-name table (M3).
- Share my trip, family page, Help sheet "call family", caregiver setup, saved places beyond Home (M4). See OQ4 for what the Help button does in M2.
- Low-battery mode, the full a11y audit and perf tuning (M5).
- Guidance with the screen off or the phone locked (M6, Capacitor). M2 keeps the screen on.

## Scope change to confirm
- **Multi-stop A→B→…→n moves from M3 into M2** (Director brief, 2026-11-17). The shared engine already has `planJourney` and `buildJourneySteps`, so the cost is mainly UI (≈ +1.5 h). ROADMAP M3 should drop it once ruled (OQ1).

## Lessons carried in (M1 rounds, process §2/§7)
There is no M1 QA report yet; these come from the M1 rounds and logs.
- **Keep every `data-testid`** the web shell defined (`guide`, `end-trip` sheet, etc.). The e2e suite depends on them.
- **No invented look:** the shell has placeholder views and haptic names (`tap/notice/get_off/alert/arrived`) that do not match STYLE-GUIDE §3 (`tick/confirm/attention/getoff/arrive/gentle`). M2 aligns them (AC 37).
- **Fixtures are synthetic.** Thresholds in `DEFAULT_GUIDANCE_CONFIG` are untested in the real world. The owner walk/bus test is the only proof; schedule it early.
- **Director review found the H5 station label half-hidden under the End button** (S4). Add a rect-overlap check for the H5 map labels against the top bar.
- **Decisions are pure functions** with unit tests (guidance reducer, follow-me reducer). Keep new logic (pocket-view trigger, resume policy, alert escalation, GPS profile) the same way.
- **Back is a history entry everywhere**, including the alert and the End-trip sheet (D8).
- **Unverified ⚠ items stay flagged:** wake lock in installed iOS PWAs before iOS 18.4; zh voice presence on cheap Android phones; OneMap fields for LRT and exits.

---

## Acceptance criteria

### A. Start a trip — entry-point parity
| # | Pri | AC |
|---|---|---|
| 1 | Must | The feature flag `guide` is **on** in the M2 release (D-8 OQ5). "开始出发 / Start" on H4 Trip overview starts guidance. There is no other way to start a trip, so every entry point goes through H4 → Start |
| 2 | Must | **Entry-point parity:** a trip can be started from (a) a Home tile (saved place), (b) "带我回家 / Take me home", (c) Search → result, (d) a recent destination, (e) H12 Arrival "回家的路 / Route home", (f) a multi-stop journey (§I), and (g) the deep link `/route?from=…&to=…`. Each reaches H3 (or H4 when there is a single option) and then the **same** runtime start call with the same itinerary shape. A Playwright matrix test starts and finishes a trip from each entry |
| 3 | Must | "Take me home" when already within 200 m of Home shows the H1 toast "你现在就在家附近，不用找路啦。" and starts nothing. Away from Home it goes to H3 with From = my location, To = Home |
| 4 | Must | The Start tap is the user gesture that unlocks audio (iOS), asks for location if needed (H4 explainer from M1), asks for compass permission on iOS, and acquires the wake lock. If location is denied, the trip still starts in **manual mode** (Next/Previous, "I'm on the bus", "I got off") with a clear note |
| 5 | Must | Only one active trip at a time. Starting a new one while a trip is active asks "要结束现在的行程吗？" first (copy from Creative) |

### B. Live guidance screen (H5)
| # | Pri | AC |
|---|---|---|
| 6 | Must | H5 answers the three questions at all times: **what to do now** (step headline ≥ 32 px), **where** (stop/station name chip, stops left on rides), **how long** (metres/minutes left on walks, stops left on rides, arrival clock time in the top area) |
| 7 | Must | Step card templates for walk, wait (bus/MRT), bus here (M3 only, hidden in M2), ride (stop dots + "下一站：…" + "下车前我会提醒你。"), alight, transfer walk and final walk, in zh and en, exactly as H5 copy. Text comes from `shared/i18n/steps.ts` + `i18n/ui.ts` |
| 8 | Must | Ride steps show a **stops-left countdown** ("还有 4 站") that decreases as each intermediate stop is passed (engine `passStopM`). It never counts up and never shows a negative number |
| 9 | Must | Top bar: 结束 End · voice toggle · 帮忙 Help (M2 content per OQ4). The map station label and puck are never covered by the top bar or step card (rect-overlap check, fixes the D-8 S4) |
| 10 | Must | Manual controls are always reachable without the map: "下一步 / Next", "上一步 / Back a step", and on bus/MRT steps "我上车了 / I'm on" and "我下车了 / I got off". Each sends the matching reducer event. Manual navigation re-speaks the instruction |
| 11 | Must | Step changes go to a polite live region. All controls are ≥ 56 px with an accessible name and `data-testid`. The map stays `aria-hidden`; the step card alone is enough to complete the trip |
| 12 | Should | A "全部步骤 / All steps" sheet lists the remaining steps (H6 Route detail style) with the current one marked; it is a history entry |

### C. Follow-me map
| # | Pri | AC |
|---|---|---|
| 13 | Must | On start the map is in **follow** mode: heading-up, puck at 34% height, pitch per `map.ts`, camera eased (k = 3.2/s; snaps under reduce motion) |
| 14 | Must | Heading comes from the compass (`platform.heading`) when available and moving slowly, else course-over-ground from fixes when speed > 1 m/s, else north-up. A heading cone shows only when heading is known |
| 15 | Must | Any drag, pinch or rotate gesture switches to **free** mode immediately. The follow toggle changes to "跟着我走 / Follow me" |
| 16 | Must | Follow resumes **only** on a recentre/follow tap or a step change (as built in `follow.ts`). **Never on a timer.** A unit test advances the clock 10 min in free mode and asserts the camera stays free |
| 17 | Must | "看全程 / See whole trip" fits the remaining route north-up. It is a mode of the same toggle and is left by the follow tap |
| 18 | Should | In follow mode the camera zooms out on rides (stop dots visible) and in on walks near a turn or stop |

### D. Step auto-advance
| # | Pri | AC |
|---|---|---|
| 19 | Must | Steps advance from position alone using `guidanceReducer`: walk legs end within `arriveRadiusM` of the leg end, boarding from ≥ `boardDetectM` along the ride path or "I'm on", rides end within 30 m of the alighting stop or when the user is clearly walking the next leg |
| 20 | Must | Each advance gives the `confirm` haptic and speaks the new headline once. A step is never skipped silently: if two steps complete on one fix, the screen shows the latest and the log records both |
| 21 | Must | Fixes with accuracy > 100 m are ignored for advance and off-route (engine rule). Duplicate or out-of-order fixes (older timestamp) are dropped |

### E. Voice
| # | Pri | AC |
|---|---|---|
| 22 | Must | Voice zh-CN (rate 0.9) and en (rate 0.92) via `platform.speech`, in the trip language fixed at start. Each spoken line equals the on-screen headline (no voice-only info) |
| 23 | Must | Priorities: `high` cues (get off now, off route) interrupt speech; others queue; a queued line older than 10 s that no longer matches the current step is dropped |
| 24 | Must | **Mute** in the H5 top bar and in Settings. Mute stops speech at once and persists. Haptics and visuals continue. The speaker icon and SR label show the state |
| 25 | Must | **"再说一遍 / Say it again"** (≥ 56 px, on the step card) repeats the current headline, and the alert line when an alert is showing. It works while muted only if the user taps it (a tap is consent) |
| 26 | Must | If no voice exists for the trip language, the trip still works: a one-time note "这部手机没有中文语音，请看屏幕" (copy from Creative) and Settings shows a "试听 / Test voice" button |

### F. Get-off alerts
| # | Pri | AC |
|---|---|---|
| 27 | Must | **"下一站下车 / Get off at the next stop"** (engine `get_off_next_stop`): H6 full-width saffron sheet, bell, sign chip with stop name, "请现在按铃 / Press the bell now" (bus) or "车门开了就下车 / Get off when the doors open" (train), `getoff` haptic, voice line then second line after 2.2 s, saffron **edge glow** over the map, `role="alertdialog"` + assertive announcement |
| 28 | Must | **"到站了，请下车 / Get off now"** (engine `get_off_now`): its own full sheet (frame H6b, missing), the same haptic repeated, high-priority voice, edge glow. If both conditions come on one fix only "now" shows (engine rule). "Next stop" always precedes "now" on a normal ride (GPS-replay test) |
| 29 | Must | The alert stays until "知道了 / OK, got it" or until the ride step ends. Back does not dismiss it (Back opens the End-trip sheet over it, D8). If not acknowledged, voice + haptic repeat **once** after 20 s (pure, unit-tested escalation policy) |
| 30 | Must | When the page is hidden (user switched apps briefly), the alert also goes out through `platform.notify` with tag `getoff`, so a newer alert replaces an older one |
| 31 | Must | Reduce motion: no bounce, ripple or bell swing; the edge glow is static. Voice and haptics are unchanged |

### G. Off route, weak GPS, offline
| # | Pri | AC |
|---|---|---|
| 32 | Must | **Off route** (engine: 3 good fixes beyond 50/80/150 m): H11 banner "没关系，你走了另一条路" + `gentle` haptic + voice, then auto re-route from the current fix to the current segment's destination (≤ 1 per 20 s), `reroute_done` with new steps, banner "找到了新的路" + `confirm`, auto-dismiss 4.2 s. Never blames |
| 33 | Must | Re-route failure (no route, API error) keeps the old steps, shows "暂时找不到新的路，先跟着地图走" (copy from Creative) and retries on the next off-route episode. Offline: no re-route call; the banner says it will try again when back online |
| 34 | Must | **Weak GPS** (`gps_weak`): H5 note "位置不太准，跟着站牌走 / Location is rough, follow the signs", spoken once per weak spell; the puck shows the accuracy circle and greys after 30 s without a good fix; manual controls are emphasised. In MRT tunnels the ride relies on "I'm on"/"I got off" and the station-distance cues (see OQ3 for timed estimates) |
| 35 | Must | **Offline active trip:** once started, the trip runs with no network: steps, voice (on-device voices), alerts, auto-advance and the corridor tiles (z15–17) cached at start. H5 shows "没有网络，行程继续 / No internet, trip continues". A Playwright test sets offline right after start and completes the trip |
| 36 | Should | Tiles outside the cached corridor show the plain background with the route line still drawn (no broken-image grid) |

### H. Platform, screen and battery
| # | Pri | AC |
|---|---|---|
| 37 | Must | **Platform adapter only (D-4):** views and the trip runtime call location, heading, speech, wake lock, vibrate, notify and battery only through `Platform`. A gate grep fails the build on `navigator.geolocation`, `speechSynthesis`, `navigator.wakeLock`, `navigator.vibrate` or `Notification` outside `src/web/src/platform/`. `VibratePattern` names are aligned with STYLE-GUIDE §3 (`tick, confirm, attention, getoff, arrive, gentle`) |
| 38 | Must | The runtime passes a **location profile** to `location.watch` per leg (`intervalMs`: walk 2 s, wait 5 s, ride 5–10 s, last 2 stops before alight 2 s). The web ignores it; M6 native honours it. The adapter exposes `capabilities` (e.g. `backgroundGuidance: false` on web) so the UI can hide the keep-screen-on advice in M6 |
| 39 | Must | **Wake lock** is held from Start to End/arrival, re-acquired on `visibilitychange`, and released on End, arrival + 60 s, or page hide. If the wake lock fails, H5 shows "请保持屏幕亮着 / Please keep the screen on" once |
| 40 | Must | **Pocket view (dimmed):** after 45 s with no touch on walk/ride steps, or on a "放口袋 / Pocket" tap, the screen switches to a near-black view with only the headline, stops/metres left and a big "打开 / Show" target; the map is paused (no render loop). Any touch or any alert returns to H5 at once. Alerts still show full-sheet and glow |
| 41 | Should | **Battery budget (web, screen on, pocket view):** ≤ 15 %/h on a mid Android phone, measured by the owner (OQ6). Share/map work is paused in pocket view; MapLibre renders only on camera change |

### I. Multi-stop journeys
| # | Pri | AC |
|---|---|---|
| 42 | Must | From H3 a "加一个地方 / Add a stop" action builds a journey A→B→…→n with **≤ 5 stops** (places after the start), each with an optional **dwell** (default 30 min, choices 15/30/60/90 min). Stops can be removed and reordered with ↑/↓ buttons (no drag needed). Uses `planJourney` |
| 43 | Must | H4 shows the whole journey (segments, dwell, final arrival time). Guidance runs segment by segment. At each waypoint, `arrived_waypoint` shows a "到了第 2 个地方 / Stop 2 of 4" screen (frame missing) with "继续下一段 / Go to the next place" (primary) and "结束行程" |
| 44 | Must | The next segment is **re-planned from the current position at the "continue" tap** (dwell times are only for the H4 estimate). It never auto-starts on a timer. A failed segment shows the H3 no-route state for that segment with the taxi hand-off later in M4 |

### J. End, resume and arrival
| # | Pri | AC |
|---|---|---|
| 45 | Must | **End-trip confirm (D8):** Back or "结束" on H5/H6/H11 opens "要结束这次行程吗？" with "继续行程 / Keep going" primary. Back again closes the sheet and keeps the trip. "结束行程" stops voice, GPS watch, wake lock, deletes the stored trip and goes to H1 |
| 46 | Must | **Resume after reload or a killed tab:** the stored trip (`howtogo.trip.v1`) reopens straight into H5 at the stored step with a toast "继续上次的行程 / Continuing your trip". Voice and wake lock need a tap on iOS: a full-width "点一下继续语音 / Tap to turn voice back on" shows until tapped. A trip older than its ETA + 2 h asks "继续 / 结束" instead (OQ5) |
| 47 | Must | **Arrival (H12):** on `arrived_destination` the arrival screen shows the mark animation (static under reduce motion), "到了！", place name, "用了 N 分钟", `arrive` haptic, voice "到了！". "完成 / Done" → H1; "回家的路 / Route home" → H3 from here to Home (hidden if Home is not set or the place is Home). Back → H1 (trip stack replaced). The stored trip is cleared |
| 48 | Should | The trip is logged to recents (place only, no track) and H12's shared/not-shared lines are hidden until M4 |

### K. Diagnostics and test hooks
| # | Pri | AC |
|---|---|---|
| 49 | Must | Change-only hook lines for every cue, step change, mode change (`follow:free`, `follow:on`, `pocket:on/off`), alert shown/acknowledged/escalated, wake lock state, resume and re-route, readable via `window.__hooks`. No coordinates, places or search text in hooks or the Report |
| 50 | Must | Demo mode (`?demo=1`) plays every new state (alerts, off route, weak GPS, waypoint, arrival) so Creative review and owner previews need no walking |

---

## Testability
| What | How |
|---|---|
| Engine (reducer, follow-me, escalation, resume policy, pocket trigger, GPS profile) | **Vitest**, pure functions with a fake clock. Cue order for each fixture route; follow never resumes on time (AC 16) |
| End-to-end guidance | **Playwright, headless Chromium**, against `vite preview` + mock API. Two drivers: (1) the `fake` platform fed by the shared **`simulateFixes`** simulator (fast, deterministic seed); (2) the real `web` adapter with `context.setGeolocation()` stepped through the same simulator fixes, to prove the browser adapter path |
| GPS replays (ROADMAP exit) | Three scripted replays end to end: **bus only**, **MRT with a transfer**, **mixed** (walk → bus → walk → MRT). Plus `injectDeviation` for off route, a weak-accuracy spell, a 5-stop journey, and offline after start |
| Speech, vibration, wake lock, notify | `page.addInitScript` stubs that record calls (`speechSynthesis.speak`, `navigator.vibrate`, `navigator.wakeLock.request`, `Notification`). Visibility changes via a `document.visibilityState` override + `visibilitychange` event |
| Resume | Close the page mid-ride, open a new page in the same context, assert H5 at the same step and the "tap to turn voice back on" bar |
| Entry-point matrix (AC 2) | One parameterised test per entry, each completing a short fixture trip |
| Back | Every H5 state (walk, ride, alert, off route, pocket, waypoint) → Back → End-trip sheet → Back → same state |
| Visual | Screenshot baselines per Creative frame names (H5-*, H6-bus/train, H6b, H11-*, H12-*, pocket, waypoint) at 100%/200%, light/dark, zh/en; rect-overlap and 56 px checks |
| Needs a real phone (owner) | GPS thresholds in the street, compass heading-up, real TTS voices, vibration feel, wake lock on an installed PWA, battery drain, MRT tunnel behaviour, bus bell timing. Nothing else |

### Owner test script (real phone, ≈ 45 min, Android Chrome installed PWA; iOS Safari optional)
Personal phone, the owner holds it; nobody else touches device settings.
1. Battery at ≥ 60 %, note the %. Open the installed app, check voice is on.
2. **Walk test (10 min):** Home tile → a place 600–900 m away → Start. Check: voice speaks; map turns with you; drag the map → it stays put until you tap Follow; steps advance at corners/stop without touching.
3. Deliberately walk one block the wrong way → "没关系，你走了另一条路" and a new route within ~30 s.
4. Pull down the app switcher and come back → still guiding, screen stays on. Swipe the app away, reopen → trip continues; tap to turn voice on.
5. **Bus test (15 min):** pick a trip with a bus of ≥ 4 stops. Board; the stop count goes down. "下一站下车" comes **one stop before** with voice + vibration + saffron sheet; "到站了，请下车" at the stop. Note any early/late alert and the stop name.
6. Put the phone in a pocket for one ride; does the pocket view appear, and can you hear the alert?
7. Optional MRT leg: note what happens underground (weak GPS note, "I'm on"/"I got off" buttons).
8. Arrive → "到了！". Tap "回家的路". Note the battery %.
9. Settings → Report a problem → send the report to the Director. Tell us anything confusing, too quiet, too late.

## QA gate scope
- `npm run gate` on the release build: typecheck, unit, i18n key check, secret scan, **platform-API grep (AC 37)**, build + size, Playwright e2e (incl. the three GPS replays and the entry-point matrix), axe on H5/H6/H6b/H11/H12/pocket/waypoint, Lighthouse PWA.
- Every Must AC mapped to a test ID in `qa/reports/0.2.0.md`.
- Upgrade test: a 0.1.0 install with a stored M1 state (settings, Home, recents) updates to 0.2.0 without loss; SW update toast shows.
- Back (button + gesture) on every guidance state.
- Real device: the owner test script above; QA reads the Report log and the owner's notes. Battery is reported, gated only if OQ6 says so.
- Not in scope: LTA live data, share/family page, screen-off guidance.

## Open questions (with recommended defaults)
| # | Question | Default | Who |
|---|---|---|---|
| OQ1 | Move multi-stop from M3 to M2? | **Yes**, as briefed; update ROADMAP M3 (−1 h) and M2 (+1.5 h) | Director |
| OQ2 | Does a step change re-engage follow-me after the user dragged the map? | **Yes** (as built): a new step is a natural moment to look again. Still never time-based | Director |
| OQ3 | MRT underground with no GPS: give a time-based "get off soon" estimate? | **Soft only:** show "约 还有 2 站" from the schedule with "约", and a gentle pre-alert at the scheduled time of the second-last station. The strong "get off now" stays position- or button-based. Real-test before trusting | Director (+ owner test) |
| OQ4 | What does Help do in M2 (full Help sheet is M4)? | Show the H9 sheet with what exists now: 给司机看地址 (H10, destination + Home), 我在哪里？, 帮我重新找路, 紧急情况 · 拨打 995. "Call family" arrives in M4 | Director |
| OQ5 | Resume window after a kill? | Auto-resume if within ETA + 2 h; otherwise ask Continue/End; drop silently after 24 h | Director |
| OQ6 | Battery target for the web trip with the screen on? | **≤ 15 %/h** as a Should, measured by the owner, not a gate blocker (M6 target ≤ 8 %/h, screen off) | Owner |
| OQ7 | Pocket view trigger? | 45 s no touch on walk/ride steps + a manual "放口袋" button; never during an alert | Creative/Director |
| OQ8 | Waypoint dwell default and limits? | 30 min default; 15/30/60/90 choices; ≤ 5 stops after the start; continue is always a tap | Director |
| OQ9 | Alert escalation if not acknowledged? | One repeat after 20 s; none after the ride step ends | Creative/Director |
| OQ10 | Change trip language mid-trip? | No (as built): steps keep the start language; the UI chrome switches. Note in Settings | Director |

## Creative frames still missing (STYLE-GUIDE)
- **H6b Get off now** full sheet (bus/train) — copy, glow, Back.
- **Pocket view** (dimmed) — layout, "打开 / Show", how alerts look over it, dark only.
- **Waypoint arrival** ("Stop 2 of 4", continue / end) and the **multi-stop builder** on H3/H4 (add, remove, ↑/↓, dwell picker), plus H4 journey timeline.
- **Resume** toast and "Tap to turn voice back on" bar; "keep the screen on" note when wake lock fails.
- **Manual mode** (location denied) and manual controls on H5 (Next/Back a step/I'm on/I got off) and "Say it again" placement.
- **Re-route failed / offline re-route** banner copy (H11 states).
- **No voice installed** note + Settings "Test voice".
- **"End current trip first?"** sheet (AC 5) and the H9 M2 subset (OQ4).
- H5 MRT tunnel/approximate state (OQ3) and the stale-GPS grey puck.
- Each: light/dark, 100/200 %, zh/en, SR labels, reduce motion, Back target, baseline names.

## Estimate (wall clock, straight through)
| Step | Hours |
|---|---|
| Engine top-ups (escalation, resume policy, pocket trigger, GPS profile, haptic names, journey continue) + tests | 1–1.5 |
| UI round: H5/H6/H6b/H11/H12, follow-me, voice, pocket, resume, End sheet, Help subset | 3–3.5 |
| Multi-stop builder + waypoint flow | 1.5 |
| Playwright replays, entry matrix, gate additions | 1–1.5 |
| QA gate + one fix round | 1.5–2 |
| **Total** | **8–10 h** (Creative missing frames ≈ 1 h in parallel; owner phone test not included) |
