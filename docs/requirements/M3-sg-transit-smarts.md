# M3 — SG transit smarts (draft)

PM · 2026-11-17 · Estimate: **6–7 h if run straight through** (see "Estimate" at the end). Excludes owner waits: Director rulings, the LTA DataMall key (D-6: the owner registers it), the live-API smoke once the key exists, and the owner's real bus/MRT test.

## Goal
Make every trip feel like it was planned by someone who knows Singapore: **when the bus actually comes** (and whether there is a seat), **whether the MRT is broken** today and what to do instead, the station names **in Chinese**, **which exit** to take, how to **change lines** without getting lost, **roughly what it costs**, and a route that suits **walking aids** with honest lift warnings. Plus one-tap **recent trips**, because seniors repeat the same few journeys.

## Non-goals (other milestones)
- Multi-stop journeys (moved to M2, M2 OQ1 ruled).
- Share my trip, family page, Help "call family", caregiver setup, taxi hand-off (M4).
- Exact senior-concession fare amounts (Later; M3 shows the adult card fare plus a concession note, OQ5).
- Platform/train crowding (LTA `PCDRealTime`) and train arrival times (no public SG API). Later.
- "No stairs" walking-path claims. OneMap gives no stairs/overhead-bridge data, so this fact stays **hidden** (D-8). Only lift facts backed by LTA data are shown (§F).
- Bus stop names in Chinese (there is no official source; bus stops keep English names plus the 5-digit code).
- Screen-off guidance (M6).

## Data sources (verified 2026-11-17 against LTA DataMall API User Guide v6.11, 30 Oct 2026)
| Need | Source | Status |
|---|---|---|
| Bus arrival, load, WAB, deck | `ltaodataservice/v3/BusArrival?BusStopCode=` → Worker `GET /api/bus-arrival` (built) | Built. v3 also has **`Monitored`** (0 = from the schedule, 1 = from bus GPS). The Worker drops it today → AC 4 |
| MRT/LRT disruption | `ltaodataservice/TrainServiceAlerts` → Worker `GET /api/alerts` (built). Fields Status 1/2, Line, Direction, Stations, FreePublicBus, FreeMRTShuttle, Message | Built. LTA notes "minor revisions to the response" (Jan 2026) → re-check against the live key (D-7 open item). GTFS-RT train alerts (Aug 2026) is a possible later replacement |
| Lift maintenance | **`ltaodataservice/v2/FacilitiesMaintenance`** (launched 10 Jul 2025, "ad hoc lift maintenance in MRT stations"). Fields: `Line`, `StationCode`, `StationName`, `LiftID` (optional, e.g. `B1L01`), `LiftDesc` (e.g. "Exit B Street level - Concourse") | **Real source found.** Not in the Worker yet → AC 30 |
| MRT exits | LTA `GeospatialWholeIsland?ID=TrainStationExit` (SHP, needs the key) or the data.gov.sg "LTA MRT Station Exit" GeoJSON (public) | The **data round** (`dev/data`, worktree `wt-data`, target `src/shared/data`) is building the exit table now. M3 consumes it; it is static, bundled, no runtime call |
| zh station names, line termini | Data round table in `src/shared/data` (official LTA Chinese names; termini per line and direction) | In progress (`dev/data`). M3 consumes it |
| Fare | OneMap route `fare` (engine `parseFare` already reads it into `Itinerary.fare`, adult card SGD) | ⚠ Unconfirmed on the live API (D-7 open item). Hidden when absent |

**LTA key needed** for every live call above (BusArrival, TrainServiceAlerts, FacilitiesMaintenance, and GeospatialWholeIsland if used). ACs marked **[LTA]** pass on recorded fixtures in the gate and need the owner's key for the live smoke (AC 45).

## Lessons carried in (M1 gate, M2 spec, Worker rounds)
- **Never show made-up live data.** M1 ruling: without credentials and without FIXTURE_MODE the Worker answers 503, never sample data. M3 applies it to bus times and lifts: no key → the UI says "no live time", never a fixture number (AC 6).
- **Keep every `data-testid`** and the change-only `window.__hooks` lines. No coordinates or stop codes typed by the user in hooks or the Report.
- **Live data is a hint, not a guard.** Bus ETA and alerts never advance or block guidance steps (M2 rule: decisions are pure and position-based).
- **Rect-overlap and 56 px checks** on every new chip and banner (H5 top bar lesson, D-8 S4).
- **The M1 bus-times "live" note was hidden** (M1 UI ruling 1). M3 turns it on only where real data shows.
- **zh steps currently show English station names** (engine round gap) — closing it is the headline of §C.

---

## Acceptance criteria

### A. Entry-point parity (where each new fact appears)
| # | Pri | AC |
|---|---|---|
| 1 | Must | **Parity matrix:** every surface in the table "Entry-point parity" below shows the new facts it lists, in zh and en. A Playwright matrix test checks each cell (present, or deliberately absent with the reason noted in the test) |

### B. Real-time bus arrival [LTA]
| # | Pri | AC |
|---|---|---|
| 2 | Must | The boarding stop of every bus leg has an **arrival chip** (`.arrchip`, STYLE-GUIDE 5.5): bus badge, big minutes ("4 分钟"; 0 → "快到了 / Arriving", saffron), "● 实时 / Live" dot, and "下一班 12 分钟 / Next bus 12 min". Shown on H5 wait step, H4 overview (first bus) and the H3 card of the first bus leg. The stop code comes from the OneMap leg (`from.stopCode`, ⚠ verify the field for bus stops on the live API) |
| 3 | Must | **Seat load** as icon + words, never colour alone: SEA "有座位 / Seats", SDA "要站 / Standing", LSD "很挤 / Very full". **Wheelchair** (WAB) shows the wheelchair icon with the SR label "轮椅可以上 / Wheelchair accessible". Double-deck shows "双层 / Double deck" (Should) |
| 4 | Must | Worker adds `monitored: boolean` to each `next[]` entry in `/api/bus-arrival` (from v3 `Monitored`). When false the minutes read "约 8 分钟 / about 8 min" and the dot is hollow with "按时间表 / Timetable"; no "Live" claim. API.md updated |
| 5 | Must | Freshness: the chip shows "刚刚更新 / Updated just now" or "30 秒前更新"; data older than 60 s (from `fetchedAt`) greys the dot and adds "约"; older than 3 min hides the minutes and shows the no-data state |
| 6 | Must | **No data** (no key → 503, upstream 502, offline, the service is not in the reply, or `next` empty): "暂时没有到站时间，请看站牌 / No live time right now — check the stop sign". Never a fixture number outside fixture mode. Guidance is unaffected |
| 7 | Must | Polling: every 20 s only while a chip is on screen **and** the page is visible **and** online; stops in pocket view (M2 G1) and when hidden; one request per stop at a time (deduped). Battery: no polling on H1/H2 |
| 8 | Must | When the bus has passed (minutes went from ≤ 1 to the next bus's value) the chip moves to the next bus with a calm line "刚错过一班，下一班 9 分钟 / Just missed one, next in 9 min". No alarm tone, no blame |
| 9 | Should | "车快到了 / Your bus is almost here" spoken once and `attention` haptic when the user's service reaches ≤ 1 min while on the wait step (monitored data only) |
| 10 | Should | If the next bus is **LSD** and the one after is SEA/SDA within +10 min, a soft hint "下一班比较空 / The next bus is less crowded". Never automatic |

### C. Chinese station names, transfer guidance, exits
| # | Pri | AC |
|---|---|---|
| 11 | Must | In the zh UI every **MRT/LRT station name** comes from the data-round zh table (`src/shared/data`) by station code: H3 cards, H4, H5 chips, H6/H6b sign chips, route detail, voice lines, disruption and lift banners, recents, and the share `stepText` (M4). Format "碧山 Bishan" on sign chips (Chinese first, English small, because SG signs carry both). Unknown code → English name, logged once as `zh_name_missing:<code>` |
| 12 | Must | A unit test proves every station code in the engine's `LINES` table and every code in the TrainServiceAlerts/FacilitiesMaintenance fixtures has a zh name. Bus stops keep English names + the 5-digit code (no zh source) |
| 13 | Must | Voice uses the zh name in zh trips (e.g. "在碧山站下车"). en trips use the English name. Spoken text equals the on-screen headline (M2 AC 22) |
| 14 | Must | **Transfer step** (engine transfer leg): "换乘 环线（橙色）/ Change to the Circle Line (orange)", line tag with colour stripe, "往 港湾 方向 / towards HarbourFront" from the data-round **termini** table for the leg's direction, and "跟着橙色的指示牌走 / Follow the orange signs". Same-platform/cross-platform hints only if the data round supplies them (Should) |
| 15 | Must | **MRT exit hint** on the alight step of the **last** MRT leg of a segment: "从 B 出口出去 / Take Exit B", chosen as the exit nearest (straight line) to the next walk leg's end, from the data-round exit table. Shown on H5 alight step, H6b get-off sheet line 2 after "车门开了就下车", H4 and route detail. Voice reads it once on the alight step |
| 16 | Must | Exit hint is **hidden** when the table has no exits for the station or the nearest two exits are within 30 m of each other in distance-to-destination (ambiguous). Never guess |
| 17 | Should | Exit hint on transfer between a station pair that needs leaving the gates (e.g. out-of-station interchanges if the data round lists them): "要出闸再进 / You'll exit and re-enter the gates — no extra fare" |

### D. MRT/LRT disruption alerts [LTA]
| # | Pri | AC |
|---|---|---|
| 18 | Must | `/api/alerts` is fetched on app open (when online), on every route search, on H4 open, and every 2 min during an active trip that still has an MRT/LRT leg ahead. Cached client-side 60 s. Offline: no call, no banner |
| 19 | Must | **Home banner** when `status = disrupted`: "地铁 东北线 有故障 / North East Line has a problem" with line tag(s) and "看详情 / Details" → a sheet with LTA message text, affected stations (zh names), free bus / free shuttle stations. Dismissable for that alert (keyed by message `createdAt`) |
| 20 | Must | **Route options:** a card whose MRT/LRT leg uses an affected station on the affected line (and direction, or "Both") gets a saffron "受影响 / Affected" fact; it loses the "推荐" tag; an unaffected card becomes recommended. If all cards are affected, H3 shows "地铁有故障，可以改坐巴士" with "只看巴士路线 / Bus routes only" (re-query `mode=BUS`) |
| 21 | Must | **During a trip (H5):** if a future MRT/LRT leg becomes affected, the H11-style banner "前面的地铁有故障 / The train ahead has a problem" + `gentle` haptic + voice once, and a **re-route offer** sheet: "换一条路 / Find another way" (primary) and "继续原来的路 / Keep this route". **Never auto re-route** on an alert (the line may recover; the senior decides). Back = keep |
| 22 | Must | Re-route on offer = re-plan from the current fix to the segment destination and drop itineraries touching affected stations on the affected line; if none remain, `mode=BUS`; if still none, the H3 no-route state (taxi hand-off arrives in M4). Free bus/shuttle at the user's station is mentioned: "这个站有免费巴士 / Free buses at this station" |
| 23 | Must | Resolved alert (status back to normal or the line no longer listed) removes banners within one poll and shows "地铁恢复了 / Train service is back" once on H5 if a banner had been shown |
| 24 | Should | Planned/minor messages (Status 1 with a message) show as a quiet info line on Home only, not a banner |

### E. Fare estimate
| # | Pri | AC |
|---|---|---|
| 25 | Must | When the itinerary has `fare`, H3 card facts and H4 show "车费 约 $1.77 / Fare about $1.77" (adult card). Absent → nothing (no "$0", no placeholder). ⚠ live OneMap field unconfirmed [needs OneMap credentials] |
| 26 | Must | Settings "我有乐龄优惠卡 / I have a Senior Citizen concession card" (default off). On: the fare line reads "用乐龄卡会更便宜 / Cheaper with your concession card" and the adult number moves to the route detail only (OQ5). Copy never states a concession amount we don't compute |
| 27 | Should | Multi-stop journeys (M2) show the total fare on H4 only when every segment has a fare |

### F. Lift-friendly preference and lift-maintenance warnings [LTA]
| # | Pri | AC |
|---|---|---|
| 28 | Must | Settings + Route options sheet: "少走楼梯，用电梯 / Lift-friendly" preference (off by default; persisted). On: ranking (engine `rank.ts`) penalises transfers, walking, and any station with a lift under maintenance; ties prefer bus legs (SG buses are wheelchair accessible; the WAB flag is shown, AC 3). Pure function + unit tests |
| 29 | Must | **Lift warning:** when any boarding, transfer or alighting MRT/LRT station of an itinerary is in FacilitiesMaintenance, H3 card fact "碧山站有电梯在维修 / A lift at Bishan is under repair", and H4/H5 (on the step that uses the station) the detail "B 出口 地面层—大堂 的电梯在维修 / Lift at Exit B (street level – concourse) is under repair" from `LiftDesc`. If the repaired lift is at the **exit chosen by AC 15**, the exit hint switches to the nearest other exit and says why |
| 30 | Must | Worker `GET /api/lifts` → `{"fetchedAt","lifts":[{"line":"NEL","station":"NE12","liftId":"B1L01","desc":"Exit B Street level - Concourse"}]}` from `v2/FacilitiesMaintenance`, cached 5 min, same error rules as the other LTA routes (502/503, no upstream body). Fixture + normaliser tests. API.md updated |
| 31 | Must | **Positive lift fact (replaces the hidden D-8 "Lifts all the way"):** only when lift data is fresh (< 15 min) and none of the itinerary's stations is listed: "车站电梯正常（没有维修通知）/ Station lifts OK (no repairs reported)". Hidden when lift data is missing, stale or the itinerary has no rail. "No stairs" stays hidden (Non-goals) |
| 32 | Should | With Lift-friendly on, the H5 alight/transfer step says "坐电梯：跟着电梯标志 / Use the lift: follow the lift signs" |

### G. Preferences
| # | Pri | AC |
|---|---|---|
| 33 | Must | Route options sheet: "最少走路 / Least walking" (default, D-6), "最少换车 / Fewest changes", "最快 / Fastest", plus the Lift-friendly toggle. The choice persists and is re-applied to recents and Take me home. Ranking is pure (`rank.ts`) with tests per preference |

### H. Recent trips
| # | Pri | AC |
|---|---|---|
| 34 | Must | Home shows **"最近的行程 / Recent trips"**: up to 5 trips (from-name → to-name, last date), newest first, deduped by from+to place. A tap goes to H3 **from my location** to that destination (default), with "从原来的地方出发 / From the original start" as a secondary action when the original start was a saved place |
| 35 | Must | A trip is recorded when started (M2 AC 48 recorded arrivals only; M3 records starts too, marked done/not done). Stored on-device only (`howtogo.recents.v2`): place names, coordinates of the two places, date. **No GPS track, no times of day beyond the date** |
| 36 | Must | Migration: M1's last-5 destinations (`howtogo.recents.v1` or as built) are converted into recent trips with from = "my location"; nothing is lost; the upgrade test covers it |
| 37 | Must | Long-press is **not** required: each recent row has a "⋯" (56 px) with "删除 / Remove". Settings "清除最近的行程 / Clear recent trips" (exists in M1) clears both |
| 38 | Should | A recent trip whose destination is not yet a saved place offers "存为常去的地方 / Save as a place" (M4 saved places) |

### I. Worker, data and diagnostics
| # | Pri | AC |
|---|---|---|
| 39 | Must | `/api/bus-arrival`, `/api/alerts`, `/api/lifts` have recorded fixture replies (sanitised; real-shape) used by FIXTURE_MODE and the e2e mock: normal, disrupted (with free bus + shuttle), lift outage at a route station, monitored = 0, LSD load, empty `next`, 503 not_configured |
| 40 | Must | `npm run record:lta` (owner-run, key from env) fetches live BusArrival (2 stops), TrainServiceAlerts and FacilitiesMaintenance, strips nothing personal (there is none) and writes fixtures, so field drift is caught by diffing. Never run in CI |
| 41 | Must | The About page line "Contains information from LTA DataMall" becomes real (it was a placeholder in M1), with the Singapore Open Data Licence link |
| 42 | Must | Hooks (change-only): `bus:chip <state>` (live/timetable/stale/none, no stop code), `alerts:<normal|disrupted>`, `alerts:offer shown|accepted|kept`, `lifts:<n affected>`, `exit:shown|hidden`, `zh_name_missing:<code>`. Demo mode (`?demo=1`) plays: bus arriving, missed bus, disruption banner + offer, lift warning, exit hint, transfer |
| 43 | Must | The shared share payload (`toSharePayload`) uses the zh station name in `stepText` for zh shares. (Also see M4 AC 10 for the status enum mismatch.) |
| 44 | Should | The data-round tables are covered by a "data freshness" note in About/Report (`data: 2026-11-xx`) so a stale table is visible in reports |
| 45 | Must | **Live smoke** `npm run smoke:live` adds bus-arrival (a busy interchange stop), alerts and lifts, run by the owner once the key is set; the gate records PASS or "BLOCKED: no key" — not FAIL |

---

## Entry-point parity
| Surface | Bus chip + load + WAB | Disruption | zh names | Exit hint | Transfer copy | Fare | Lift fact/warning | Recents |
|---|---|---|---|---|---|---|---|---|
| H1 Home | — | banner (AC 19) | in banner | — | — | — | — | list (AC 34) |
| H2 Search (empty state) | — | — | stations in results (zh subtitle) | — | — | — | — | list |
| H3 Route options card | first bus (AC 2) | Affected fact (AC 20) | ✔ | — | line tags | ✔ (AC 25) | ✔ (AC 29/31) | — |
| H4 Trip overview / journey | first bus | ✔ | ✔ | ✔ | ✔ | ✔ (+ total, AC 27) | ✔ | — |
| Route detail (H6 list) | per bus leg | ✔ | ✔ | ✔ | ✔ | adult fare | ✔ | — |
| H5 wait step | ✔ live polling | in-trip banner + offer (AC 21) | ✔ | — | — | — | — | — |
| H5 ride / transfer / alight | — | ✔ | ✔ | alight (AC 15) | transfer (AC 14) | — | step detail (AC 29) | — |
| H6 / H6b get-off sheets | — | — | sign chip zh | line 2 (AC 15) | — | — | — | — |
| G1 Pocket view | polling stops (AC 7) | alert still breaks through as banner | ✔ | — | — | — | — | — |
| G3 waypoint (multi-stop) | next segment's first bus | ✔ | ✔ | — | — | — | — | — |
| G4 Resume | chip resumes polling | re-check alerts on resume | ✔ | ✔ | ✔ | — | ✔ | — |
| Take me home / Home tile / deep link | same as H3/H4 | same | same | same | same | same | same | recorded on start |
| Voice | Should (AC 9) | once (AC 21) | ✔ (AC 13) | once | ✔ | — | — | — |
| Settings | — | — | — | — | — | concession toggle | Lift-friendly toggle | clear |
| Share `stepText` / family page (M4) | — | — | ✔ (AC 43) | — | — | — | — | — |

## Testability
| What | How | Needs |
|---|---|---|
| Normalisers (`/api/lifts`, `monitored`) | Worker **vitest** with fixtures | — |
| Ranking (preferences, lift penalty, disruption filter), exit choice, missed-bus logic, freshness states, zh-name coverage | Shared **vitest**, pure functions, fake clock | Data-round tables merged |
| Chips, banners, offer sheet, exit hints, fare, recents | **Playwright** headless Chromium against `vite preview` + mock API serving the AC 39 fixtures; clock control via `page.clock` for staleness and polling; visibility override for the pause rule (AC 7) | — |
| In-trip disruption | GPS replay (M2 simulator) of an MRT route; the mock flips `/api/alerts` to disrupted mid-trip; assert banner, offer, keep vs re-route | — |
| Request budget | Playwright counts `/api/bus-arrival` calls over 2 min visible / hidden / pocket | — |
| Visual | Baselines per Creative frame names, 100/200 %, light/dark, zh/en; rect-overlap + 56 px checks on chip and banners | Creative M3 frames |
| **Needs the owner's LTA key** | Live smoke (AC 45); `record:lta` (AC 40); confirming the live TrainServiceAlerts shape after LTA's Jan 2026 revision; whether `Monitored` and `Load` arrive filled | LTA DataMall key |
| **Needs OneMap credentials** | Live `fare` field (AC 25), bus `stopCode` on legs (AC 2) | OneMap account |
| **Needs a real phone/street** | Chip vs a real bus (is "Arriving" on time?), readability in sunlight, exit hint correct at 2–3 real stations | Owner, ≈ 20 min (fold into the M2 owner walk if timing allows) |

## QA gate scope
- `npm run gate`: typecheck, unit (incl. zh-name coverage, AC 12), i18n keys, secret scan, platform-API grep (M2 AC 37), build + size (no growth > 15 KB gz for M3 UI; data tables lazy-loaded if > 20 KB gz), Playwright incl. the parity matrix (AC 1), axe on H1 banner, H3, H4, H5 wait/transfer/alight, disruption sheet, offer sheet.
- Every Must AC mapped to a test ID in `qa/reports/0.3.0.md`.
- Upgrade test: 0.2.0 with settings, Home, recents v1, and a stored active trip → 0.3.0 keeps all (AC 36).
- Live smoke recorded as PASS or BLOCKED (no key) — BLOCKED does not fail the gate (OQ1).
- Not in scope: share/family/help (M4), screen-off (M6), crowding.

## Open questions (with recommended defaults)
| # | Question | Default | Who |
|---|---|---|---|
| OQ1 | Can M3 ship with no LTA key yet? | **Yes, as "fixture-gated":** ship with chips showing the no-data state in production until the key exists; release notes say "live bus times turn on when the key is added". Gate live smoke = BLOCKED, not FAIL | Director (+ owner key) |
| OQ2 | Auto re-route on an MRT disruption? | **No — offer only** (AC 21). Lines often recover in minutes; a silent route change confuses | Director |
| OQ3 | Lift data source? | **LTA `v2/FacilitiesMaintenance`** (exists, verified in guide v6.11). Show warnings + the positive "no repairs reported" fact; keep "No stairs" hidden (D-8) | Director → owner FYI |
| OQ4 | Exit table source if the data round can't finish? | data.gov.sg MRT exit GeoJSON (public, no key) bundled as a static table; hide hints for stations without data | Director |
| OQ5 | Concession fares? | Show adult card fare with "约"; concession toggle shows a "cheaper with your card" line, no amount. Exact concession table → Later | Director |
| OQ6 | Recent trips: from my location or the original start? | **My location** by default; original start as a secondary action | Director |
| OQ7 | Bus chip polling interval? | 20 s (Worker caches 20 s per stop; LTA updates ~20 s) | Director |
| OQ8 | Bus "arriving" voice cue (AC 9)? | Should, monitored data only, once per wait step | Creative/Director |
| OQ9 | Should disruption on a line the user isn't using show on Home? | **Yes**, small banner, dismissable (seniors hear about breakdowns from family and worry) | Director |

## Creative frames needed (Creative round `dev/creative-m34` is drawing M3+M4 now; this is the checklist)
- **Bus chip states** on H5 wait / H4 / H3: live, timetable (`monitored` false), stale, no data, arriving, missed bus, load (3), WAB, double deck, "next is less crowded".
- **Disruption:** Home banner + details sheet; H3 "Affected" fact and all-affected state with "Bus routes only"; H5 in-trip banner + re-route offer sheet; "service is back" toast.
- **Transfer step** card (line colour, direction by terminus, follow-the-signs line).
- **Exit hint** on alight step, H6b line 2, H4/route detail; "lift at this exit is under repair, use Exit A" variant.
- **Lift:** warning fact (H3), step detail (H5), positive fact, Lift-friendly toggle in Route options + Settings.
- **Fare** line on H3/H4 + concession toggle and line; journey total.
- **Recent trips** list on Home and Search empty state; "⋯" menu (remove, save as place).
- **Route options sheet** with the 3 preferences.
- Each: light/dark, 100/200 %, zh/en, SR labels, reduce motion, Back target, baseline names.

## Estimate (wall clock, straight through)
| Step | Hours |
|---|---|
| Worker: `/api/lifts`, `monitored`, fixtures, `record:lta`, smoke additions | 0.5–0.75 |
| Shared: zh-name wiring, exit choice, transfer copy, ranking prefs + lift/disruption filters, freshness/missed-bus logic + tests (data tables from the data round) | 1.25–1.5 |
| UI round: chips, banners + offer sheet, exit/transfer/fare/lift lines, preferences sheet, recents + migration | 2–2.5 |
| Playwright parity matrix, in-trip disruption replay, request budget, baselines | 0.75–1 |
| QA gate + one fix round | 1–1.25 |
| **Total** | **~6–7 h** (ROADMAP unchanged: multi-stop left for M2, recents came in from M4; the data round already covers zh names/exits/termini) |
