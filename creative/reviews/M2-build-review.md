# Creative review: M2 guided-trip screens (dev/m2-engine @ ba0054d)

Reviewer: Creative. Read-only. Sources: the 27 `M2-*` baselines plus the re-recorded H3/H4 baselines (`src/web/e2e/baselines/`), `styles/guide.css`, `views/Guide.tsx`, `views/guideModel.ts`, `shared/src/i18n/steps.ts`, `web/src/i18n/ui.ts`, `shared/src/trip.ts` (haptics) and `trip/runtime.ts`, checked against STYLE-GUIDE §2, §3, H5, H6, H9–H12 and §6c, and against the prototype. I did not run a server: the baselines and the code were enough.

## Verdict: **APPROVED WITH FIXES**

This is a strong build. The H6 → H6b escalation reads the way it should: the saffron "get ready" panel, then the ink takeover with saffron type that says "go now". The edge glow, the bell swing and the ripple rings, and the pocket view on true black are all at prototype quality. The seal-stamp timeline (stamp 0.15 s, ink ring, path 0.6 s, drop 1.1 s, ring 1.6 s, text rising at 1.3, 1.45 and 1.6 s) matches §2 to the beat. The haptics are exactly the six canonical names and patterns. The getoff ×2 at 800 ms, the 2.2 s second line and the 20 s escalation are all wired. Copy in `ui.ts` matches §6c word for word. Dark mode holds everywhere.

What stops a clean pass is the **live step headline**. It is the one line the user hears and reads all trip, and it is currently planner copy: formal, coded and sometimes stale. Two P1 data and wrapping issues follow from it. Nothing else blocks.

## Rulings on the dev-log deviations

| # | Deviation | Ruling |
|---|---|---|
| 1 | H5 headline = the spoken step sentence (`step.text`) | **Principle APPROVED** (screen = voice, AC 22). **Wording REJECTED**: the runtime must speak H5-register templates and not reuse the H3/H4 planner strings. See F1. The planner `step.*` strings stay as they are for H3/H4. |
| 2 | No zh name on the H6/H6b bus sign chip | **APPROVED, and the spec changes.** The chip shows *exactly what the physical sign says*, and Singapore stop signs are in English. A zh name never goes inside the chip. In M3, once the table exists, add it as a `caption` line under the chip (`c-on-saffron` on H6, `c-saffron` on H6b). The train chip, however, must carry the station code (F4). I will amend §6c.1. |
| 3 | The End sheet over the pocket view shows in the normal theme | **APPROVED.** Back is a deliberate touch, and §6c.2 already says the first touch wakes the screen. Amend §6c.2: "Back → pocket exits (tick) → End-trip sheet over H5 in the normal theme. Back again → H5; the 45 s pocket clock restarts." Condition: the sheet uses its normal scrim fade (`d-base`), not a hard cut from black (F12). |
| 4 | AC 12 "全部步骤 / All steps" sheet not built | **Deferral APPROVED, not dropped.** It is a Should, and 看全程 covers the map side. It must land in the M2 polish round, before the owner phone test, because seniors use it to rehearse the trip. It is built from the existing §5.9 sheet and the `.opt` rows, so no new tokens are needed. |
| (5) | G2: ↑ ↓ ✕ on a second row at 100 % | **APPROVED.** It is calmer than one crowded row. Amend §6c.3. |
| (6) | H10 "Where I am" without address lines | **APPROVED.** |

## Fix table

P1 = before the M2 gate. P2 = in the M2 polish round. P3 = nice to have.

| ID | Sev | Screen / file | Problem | Exact fix |
|---|---|---|---|---|
| F1 | **P1** | H5 headline + voice · `shared/src/i18n/steps.ts`, runtime headline source | The headline and voice use planner copy. **Walk:** 步行到巴士站 Toa Payoh Int（52009）. This is bookish and puts a stop code in the line people hear; at 200 % it breaks as "（52009" (see `M2-H5-walk-*-200`). **Ride:** 坐 4 站，在 … 下车 goes **stale**: when the ride box says 还有 2 站, the headline still says 坐 4 站. **Wait:** 等候 is formal. The pocket view already says 走到 {p}, so H5 and G1 disagree. | Add guidance-only keys (`guide.*`), used for the H5 headline **and** speech, with H3/H4 keeping `step.*`. zh / en: `guide.walk_to_stop.bus` 走到 {stop} 巴士站 / Walk to {stop} bus stop · `guide.walk_to_stop.train` 走到 {stop} 地铁站 / Walk to {stop} station · `guide.walk_to_destination` [[从 {exit} 号出口出站，]]走到 {dest} / [[Leave by Exit {exit}. ]]Walk to {dest} · `guide.board_bus` 在这里等 {route} 号巴士 / Wait here for bus {route} · `guide.board_train` 在月台等地铁[[，往 {towards} 方向]] / Wait on the platform[[ for trains to {towards}]] · `guide.ride_bus` 坐 {route} 号巴士，在 {stop} 下车 / Ride bus {route}, get off at {stop} · `guide.ride_train` 坐地铁，在 {stop} 下车 / Ride the train, get off at {stop}. No count goes in the headline: the count lives only in 还有 {n} 站. The bus stop code moves to the walk sign chip: `{stop} · {code}` (e.g. `Toa Payoh Int · 52009`), because the pole shows both. |
| F2 | **P1** | H5 walk sub-line · `Guide.tsx:286` (`minutes={minLeft}`) | 还有 80 米，大约 13 分钟: the minutes are the **whole trip's** remaining time, not this walk. 80 m does not take 13 min, and wrong numbers erode trust. | Use the walk's own remaining time: `n = max(1, ceil(metresLeft / 67))` (≈ 4 km/h, the planner's walk speed if it differs), or the step's remaining duration from the engine. The ETA row keeps `minLeft`. |
| F3 | **P1** | H6b at 200 % · `.alert.now` (`M2-H6b-bus-light-200-zh`) | The title breaks as 到站 / 了，请 / 下车 (an orphaned 了 and a comma at the line start). The line text is cut by the pinned OK, and the **sign chip, the one thing that tells them which stop, is below the fold**. | (a) Render the title as two unbreakable phrases: `<span class="ph">到站了，</span><span class="ph">请下车</span>` with `.alert h2 .ph{display:inline-block}`. Do the same for H6 下一站下车 → `下一站` `下车`, and for en ("This is your stop." / "Get off now"). (b) `:root[data-text-size="xxlarge"] .alert.now .bellwrap{width:72px;height:72px}` and its `svg{width:40px;height:40px}`. (c) At 200 %, order the content as title → **sign chip** → line (CSS `order` on `.sign`), so the chip shows without scrolling. |
| F4 | P2 | H6/H6b train sign chip · `ui.ts` `sign_train` | "Raffles Place station" has no code. §6c.1 asks for `{station} {code}`, and the platform signs show NS26. | zh `sign_train`: `{s} {code} 站` → "Raffles Place NS26 站". en: `{s} {code} station` → "Raffles Place NS26 station". Keep `{code}` in a `.num` span. |
| F5 | P2 | Voice register · `steps.ts` zh cues | The engine cues use the formal 您, while every UI line and §6c voice line uses 你. Within one trip the voice switches register. | `cue.arrived_at_stop` 您已到达 {stop}。 → **到了，这里是 {stop}。** · `cue.boarded` 好，您已上车。到站前我会提醒您。 → **好，你上车了。下车前我会提醒你。** (the same words as `g_ride_tell`) · `cue.back_on_route` 您已回到路线上。 → **好，你回到路上了。** en: `cue.boarded` → "Good, you're on. I'll tell you before your stop." · `cue.back_on_route` → "Good, you're back on the way." Grep `steps.ts` zh for 您 and replace every one. |
| F6 | P2 | Reduce motion · `guide.css` vs `app.css:203` | `:root.rm *{animation-duration:1ms!important}` overrides the non-important `:root.rm .alert / .alert.now / .pocket{animation:fadeIn 120ms…}`. Under reduce motion, H6, H6b and pocket therefore snap in at 1 ms instead of the §2 120 ms cross-fade. | Add `!important`: `:root.rm .alert,:root.rm .alert.now,:root.rm .pocket{animation:fadeIn 120ms linear both!important}`. |
| F7 | P2 | H5 en action rows (`M2-H5-walk-light-100-en`) | "Say it again" and "Previous step" wrap to 2 lines at 100 %, which breaks the 6c.0 "one line at 100 %" rule and makes the card taller. | `.stepacts .btn-secondary,.stepacts .btn-quiet{white-space:nowrap;gap:8px;padding-inline:var(--s-3)}`. Keep `:root[data-text-size="xxlarge"]` at full-width rows (wrapping is allowed there). |
| F8 | P2 | Step transition (H5) · `Guide.tsx` `.steprow` | A step change swaps the headline with no motion, so the most important moment of the trip just blinks. | Key `.steprow` and `.ridebox` on `g.stepIndex` and add `.stepin{animation:rise var(--d-base) var(--ease-out) both}` (12 px rise + fade). Under rm the global rule gives the cross-fade. The progress bar uses `transition:width var(--d-base) var(--ease-out)`, not `.3s linear`. |
| F9 | P2 | G1 pocket at 200 % (`M2-G1-pocket-walk-dark-200-zh`) | 还有 80 / 米 splits the number from its unit. | In `pk_m`, `pk_n_est` and `g_stops_left` (zh and en), join `{m}` and its unit with U+00A0 and wrap the count in `<span class="num" style="white-space:nowrap">`. For example 还有 80 米 → `还有 80 米`. |
| F10 | P2 | H12 / G3 rhythm (`M2-H12-*`) | The seal sits 8 px above 到了！, so the moment feels cramped next to the generous space below. | `.arrive .mark{margin-bottom:var(--s-5)}` (24 px). Optional: `.arrive .dest{margin-top:var(--s-3)}`. |
| F11 | P2 | H10 card (`M2-H10-dest`) | The name and the address run together in one 2.1 rem/900 block ("…Hospital 11 Jalan…"), so the driver cannot tell where the name ends. | Name stays at 2.1 rem/900. The address line goes on its own line at 1.4 rem/700 with `margin-top:var(--s-2)`. |
| F12 | P2 | Deviation 3 | Leaving the pocket view straight into a light sheet must not flash. | On Back from the pocket view, unmount the pocket view and open the sheet with the standard 280 ms scrim fade. No new tokens. |
| F13 | P2 | Baselines (QA handoff) | 27 of the frames §6c names are captured. Missing: `H5-wait`, `H5-weak`, `H5-weak-stale`, `H5-mrt-estimate`, `H5-journey`, `H5-note-{wakelock,offline,novoice}`, `H5-manual-{wait,ride}`, `H6b-rm`, `H12-rm`, `H11-{searching,found,offline,mrt-prealert}`, `G1-pocket-muted`, `G2-five`, `G2-dwell`, `G3-continuing`, `G4-*`, `G6-endfirst`, `G7-*`, `H4-journey-5`, `H9-m2-home`. Capture is at DPR 1, while §6c says DPR 2. | Add these in the polish round, once F1–F3 land so they are recorded once. DPR 1 is accepted for CI size; I will amend §6c. |
| F14 | P3 | H4 journey (`M2-H4-journey-3`) | The map takes the whole fold, so at 100 % the timeline (the point of this screen) is barely visible. "…到最后一个地方" orphans 方. | Cap the journey map at 200 px tall. Wrap 大约 {t} 到最后一个地方 in `white-space:nowrap`, or allow the break only before 大约. |
| F15 | P3 | Map camera · `map/map.ts:168` | `easeTo` runs 600 ms per fix with the default easing. §2 asks for an exponential ease (k = 3.2/s). | Keep 600 ms and pass `easing: (t) => (1 - Math.exp(-1.92 * t)) / (1 - Math.exp(-1.92))` (k = 3.2/s × 0.6 s, normalised to 1). Low priority: check it on the owner's phone first. |

## Motion audit

| Moment | Spec | Build | Status |
|---|---|---|---|
| H6 entrance | Spring panel, bell 1.2 s, ripples 1.6 s, glow 1.2 s | `sheetUp d-sheet ease-spring`, `ring 1.2s`, `ripple 1.6s` ×2 (0.8 s offset), `glow 1.2s` | ✓ |
| H6 → H6b | Panel grows saffron → ink, `d-sheet` spring | `nowIn` clip-path 52 % → 0, saffron → ink, `d-sheet ease-spring`; ripples restart on escalation (`key` on `.bellwrap`) | ✓ The title cross-fade is not built; accepted. |
| H11 banner | Drops into the band | `.banner` `dropIn d-slow ease-spring` | ✓ The band grows instantly. Acceptable, because the map padding follows on the next frame. |
| Pocket enter / exit | 420 ms fade / instant | `fadeIn d-slow` / unmount | ✓ (rm: F6) |
| Arrival stamp | 0.15 / 0.5 / 0.6 / 1.1 / 1.6 s, petals 1.6–2.4 s, text staggered 150 ms | Identical timings; 18 petals | ✓ |
| G3 dot | Drop + one ripple, 1.2 s, no seal or petals | `.wpmark` drop 0 s, ring 0.5 s | ✓ |
| Step change | Should feel like a page turn | None | F8 |
| Reduce motion | 120 ms cross-fade, no ripples, petals or pulses, static glow | Ripples, petals and swing removed; glow static at 10 px; seal shown complete | ✓ except the 120 ms fade (F6) |

## Voice audit (§4, §6c.14, H6, H11)

All §6c.14 lines are verbatim in zh and en: get off now bus/train, waypoint, re-route failed/offline, weak GPS, MRT pre-alert, manual mode, test voice. H6 line 1 and line 2 (bell / train), the H11 off-route, found and arrival lines (到了！ / You're here!) all match. Three problems: the **step headlines** (F1), the **您 register** (F5), and the en `cue.turn.*` / `cue.transfer.*` lines are fine. No banned words (error, failed, GPS) appear in user copy.

## Haptics audit (§6c.13)

`HAPTIC_PATTERNS` = tick 12 · confirm 20·40·20 · attention 60·80·60 · getoff 300·150·300·150·600 · arrive 40·60·40·60·160 · gentle 30·60·30. These are exact, there are no legacy names, a unit test pins the key set, getoff ×2 is at `GETOFF_NOW_REPEAT_MS = 800`, the escalation is at 20 s, and the Settings toggle gates all six. ✓

## Dark mode / 200 %

- **Dark:** H5, H6, H12 and the pocket view are correct. The persimmon-on-dark map controls, the `c-primary-soft` step tile and the saffron alert are identical in both themes, as specified. ✓
- **200 %:** the band wraps cleanly (Help drops to row 2), and the map window stays at ≥ 160 px. Three issues are left: the H6b title break and the chip below the fold (F3), the code in the H5 headline (removed by F1), and the pocket count split (F9). The 200 % e2e covers no clipping and ≥ 56 px targets. ✓

## Award-level notes (no action required)

- H6b has a large empty ink field between the chip and OK. Once F3(c) lands, consider centring the content block vertically above the pinned button (`.alert.now .grow` before the disc as well as after the chip). It would read as a poster, not a form.
- The H12 stats pills (用了 N 分钟 · 你做得很好) match the prototype. In M4 the "told family" line will give the screen a third beat; keep the pills.
