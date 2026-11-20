# Creative review: M6 UI round (`dev/m6-ui` @ e03d647)

**Verdict: APPROVED WITH FIXES** (3 Medium, 4 Low, 1 Info; none blocks the device session, all must land before the M6 gate).

Scope: dev-log "M6 UI round" (Visible changes), STYLE-GUIDE v1.6 §6h, the 34 new `M6-*` baselines (A2, A3-approx, A3-notify, A4, A6 + settings note, B1 ×7 + brand pick, B2 ok/notyet, B3 home, C1, D1 home/settings, D2), the 9 re-recorded Settings baselines (`M1-F6-settings-*` ×4, `M5-L7-settings-*` ×4, `M5-L3-bar-settings-light-100-zh`), `res/` drawables against `creative/m6/android-res/`, native notification strings (`Cues.java`, `TripLogic.java`, `TripPlugin.java`) and their web copy source (`platform/notifyCopy.ts`, `trip/runtime.ts`). W-A `/android` has no baseline, so I rendered `renderAndroidPage()` locally (zh/en, ready + from + unavailable, placeholder URL) and looked at it in a browser.

## What is right
- **Icons/splash:** every file in `creative/m6/android-res/` is **byte-identical** in `res/` (adaptive + round + monochrome, legacy PNGs ×5 densities, `ic_stat_trip`, `splash_icon`, `splash_background` light/night, `ic_launcher_background`). The Capacitor `splash.png` ×11 and the template foreground are gone. The theme has `windowSplashScreenBackground`/`AnimatedIcon`/`postSplashScreenTheme` and `windowBackground = splash_background`, so there is no white flash. The label is `怎么去` (`${appLabel}`). Approved as built; the device check of mask, themed icon and status bar stays with QA.
- **Notification copy (6h.7 N):** the channel names and descriptions match the table exactly in zh and en, and are re-created on a language change. Ongoing has subtext 行程进行中, text 下车前我会提醒你。/ 跟着屏幕走就好。, action 结束行程 / End trip, no timestamp, BigText and the accent colour. Get-off next/now titles and the `{sign} · advice` texts are exact, and "now" replaces "next". Off-route, arrival and share-ended are exact, with 知道了 / OK on off-route and the 10-min timeout on arrival. The step short texts match the table (walk, wait bus, ride bus, ride train, change trains, last walk, re-routing).
- **Lock-screen privacy:** passed. No title or text carries a destination, address, contact name or coordinate. The last walk is 快到了 · 还有 {m} 米 with no place name. Waypoint and transfer cues no longer post notifications (good call). Share-ended says 家人 and never a name. Stop and station signs only.
- **In-app frames:** the A2/A3/A4/A6/C1 copy matches §6h word for word in both languages. The tiles, pictures (dark mode follows the tokens, `aria-hidden`), lock line and primary 72 / secondary-quiet 56 are all correct. B1's brand row, the 7-option stacked `.seg`, the steps with pictures, the honesty caption, the B2 jade status with the Autostart caption, and the B2 not-yet caption without scolding are as specified. The Settings 这个应用 order and values are right, the DND caption has a 56 px 打开, and 安装到主屏幕 is hidden in the app but kept on the web (M5-L7). No new tokens and no red anywhere.
- **200 %:** A2, B1 (en dark) and C1 have no clipping and no horizontal scroll. Labels wrap; they are not cut.
- **SR:** ✕ names are 知道了 / OK (B3, A5) and 以后再说 / Later (D1). The D1 button name is `d1_sr`. B2 is `role=status` polite. A4/A6 are `role=dialog` sheets.
- **W-A `/android`:** the copy is exact (zh/en), the order matches §6h.9, there are no third-party requests, and the page never says "safe" or "verified". The language toggle and Copy are 56 px tall, Download is 72. The from line renders. The Play Protect card has the jade rule and the uninstall card has the saffron rule.
- **Deviations accepted:** dev-suite baselines at DPR 1 (QA's device shots cover the sharpness); pictures copied into `src/web/src/assets/m6/` and lazy-loaded.

## Ruling: first-train ongoing title (not in the 6h.7 table)
`坐地铁 {code} · {sign}` / `Take the {code} train · {sign}` is **not approved**. At this step she is still waiting on the platform. 坐地铁 is also how the ride title starts (坐地铁 {code} · 还有 {n} 站), so on the lock screen she can't tell whether she should already be on the train. Use the same pattern as the bus wait row:
- **zh `等地铁 {code} · {sign}`** (e.g. 等地铁 NS · 碧山 Bishan (NS17))
- **en `Wait for the {code} train · {sign}`**

The first 6 zh characters (等地铁 NS) carry the instruction. I will add this row to the 6h.7 table in the next guide edit (v1.6.1).

## Fixes

| # | Sev | File | Change (exact) |
|---|---|---|---|
| 1 | **Medium** | `src/web/src/platform/notifyCopy.ts` (`board_train`, non-transfer branch) + `test/m6.test.ts` / `native.test.ts` | `` `坐地铁 ${lineCode(step)} · ${sign(step)}` `` → **`` `等地铁 ${lineCode(step)} · ${sign(step)}` ``**; `` `Take the ${lineCode(step)} train · ${sign(step)}` `` → **`` `Wait for the ${lineCode(step)} train · ${sign(step)}` ``** (ruling above). |
| 2 | **Medium** | `src/web/src/styles/m6.css` (or the global `.btn` rule) | The D2 primary is an `<a class="btn">` and shows a link underline (看看怎么下载 / See how to get it in `M6-D2-settings` and all 9 re-recorded Settings baselines). Add **`a.btn{text-decoration:none}`**. Buttons are never underlined; only `.inlink`/quiet are. Re-record the 10 baselines. |
| 3 | **Medium** | `src/web/src/styles/m6.css` `.m6kill` (B3 home bar) | The ✕ wraps onto its own third row under 去设置 (`M6-B3-home`): about 60 px of extra height on H1 and an orphaned control. Keep the ✕ top-right beside the text, as on the D1 bar, with the button row full-width under both: **`.m6kill .updtx{flex:1 1 0}` `.m6kill>.iconbtn{order:2;align-self:flex-start}` `.m6kill>.btn{order:3;flex:1 1 100%}`** (or equivalent markup). Check at 200 % and re-record `M6-B3-home`. Apply the same to the A5/B3/C1 H5 notes if they share the rule. |
| 4 | Low | `src/web/src/views/m6.tsx` D1 bar (l. ~534) + `i18n/m6.ts` `d1_bar` | 去下载 breaks as 去下 / 载 at 100 % (`M6-D1-home`, `M6-D1-settings`). Render the action part unbreakable: split `d1_bar` into `有新版本 {v} · ` + **`<span class="nw">去下载</span>`** / `New version {v} · ` + **`<span class="nw">Get it</span>`** with `.updbar .nw{white-space:nowrap;flex:none}`. The words stay exactly the same. |
| 5 | Low | `src/web/src/views/m6.tsx` `.row` values (Settings 这个应用) | 还没设置 wraps as 还没 / 设置 (`M6-A6-settings-note`). A value of 4 zh characters or fewer (已设置好, 还没设置, 开, 关) must not break inside the word: give it **`white-space:nowrap`** and let the label wrap instead. The longer value 只给了大概位置 may still wrap at 200 %; check that there is no horizontal scroll. |
| 6 | Low | `src/web/src/i18n/m6.ts`, `src/web/src/platform/batteryGuide.ts`, `src/worker/src/android-page.ts` | **Quotes:** the shipped app quotes UI words with curly “ ” (`ui.ts` `andapp_2/3`: 按“应用信息”…). M6 uses straight `"…"` in every zh and en string (a2_b, a3a_b, a4_1–3, a3_b, a6_b, b2_*, c1_caption, batteryGuide steps, /android steps, pp, upd). Replace each `"X"` with **`“X”`** in both languages; the wording is unchanged. Also reword the Huawei line, which quotes words that are not on any screen: `b2_switches` zh **`那三个开关手机不告诉我，请你自己看一下。`** / en **`Your phone doesn't tell me about the three switches. Please check them yourself.`** |
| 7 | Low | `src/web/src/trip/runtime.ts` `nativeAlerts` (`name`) | 6h.7 train get-off text is `{station} {code} · …`. zh gets it from `stopName` (碧山 Bishan (NS17)). In en, `displayName` may carry no code. If it doesn't, append it: **`` `${name} ${code}` ``** (e.g. `Bishan NS17 · Mind the gap`). Add a unit assertion. |
| 8 | Info | `src/android/.../TripPlugin.java` l. 200 | `stopLabel` extra (default `"结束"`) is no longer read; the action uses `TripLogic.endTripLabel`. Remove it so no stale string lingers. |

## Still to verify (QA, not blocking this review)
- The A5, B3-H5 and C1-H5 trip notes and C2 have **no baseline**. Record `M6-A5-h5-note`, `M6-B3-h5`, `M6-C1-h5-note` and `M6-C2-webview` (light/dark, 100/200) before the gate, with the fix 3 layout.
- `/android`: add Playwright `M6-WA-{ready,from,unavailable,ios}` at 390 and 1440 with the 320 px scroll check and axe. My local render was at a 500 px minimum window, so 390/320 is unchecked.
- On the device: the themed icon, status-bar icon gaps, channel names after a language switch, and lock-screen truncation of the ongoing title at 200 % font (the first 6 zh / 12 en characters).

## Creative follow-ups (mine, `creative/m6`)
- `perm-dnd` picture label 覆盖"勿扰" vs body 覆盖勿扰: align the picture to the body wording (覆盖勿扰) in `build.js` so we quote exactly what we draw.
- Add the 等地铁 row to the 6h.7 table and note the curly-quote rule in §6h shared rules (v1.6.1).
