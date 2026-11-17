# Creative review — M3/M4 fix round A (dev/m34-fix-a @ 9c7d828)

**Verdict: APPROVED WITH FIXES** (1 High, 3 Medium, 3 Low).

Reviewed: the dev-log "Visible changes" 1–10, the diff `75cbcda..9c7d828 -- src/web`, and renders of the 0.3.0 build (`qa/.out/dist`) at 390 px, zh, text size 100 % and 200 %: Home with 5 recent trips, H3, the Route options sheet, H4 step list, Settings and About. Pictures are in the reviewer's scratchpad. They were not committed.

## Rulings

| # | Change | Ruling |
|---|---|---|
| 1 | H3 **选项 / Options** button under the From line | **Approved.** It is the right place, a quiet secondary button with the `sliders` icon, as §1.4 allows. The copy 选项 / Options is approved. |
| 2 | **路线选项 / Route options** sheet, **先给我看 / Show first** row | **Approved** copy: 路线选项 / Route options and 先给我看 / Show first. See F1 (layout) and F2 (Lift-friendly). |
| 2b | Lift-friendly switch in the sheet | **Not honest yet. Take it out of the sheet until M5.** It sits under a ranking control in a sheet called "Route options", so it promises different routes. The routes don't change, because the ranking is M5. Turning it on and seeing nothing happen breaks the trust rule ("we never invent"). Settings keeps it, with a sub-line that says what it does today (F2). It comes back to the sheet when `rank.ts` ships the M5 ranking. **Director:** AC 28's "Route options sheet" part moves to M5 along with the ranking. |
| 3 | Settings → 出行: Show first is the first row | **Approved.** |
| 4 | Card tag 最少转车 → **最少换车** | **Approved.** The card's facts row still says 不用转车, which is fixed in F3. |
| 5 | H4 step list: 走到 碧山 Bishan (NS17) / 在 莱佛士坊 Raffles Place (NS26) 下车 | **Approved for M3.** It has the zh name, the English sign text and the code, so a senior can match it to the sign. The full T7 layout for H4 rows (bold zh name, line tag `[NS17]`, English in `caption`) is **M5**, together with the H4 re-shoot. A bracketed code is fine as the interim form. |
| 6 | Home: 5 recent trips | **Approved: AC 34 wins.** The rows sit under the tiles and the search, so the first action stays above the fold. Update §6d.9 from 3 to 5. See F6 for a wrap bug. |
| 7 | About: Open Data Licence inline link | **Approved** (`.inlink`, `lang=en`, new tab, `noopener`). An inline link in a text sentence is exempt from the 56 px target rule (WCAG 2.5.8 inline exception). |
| 7b | About: `data: 2026-11-17` | **Not for a senior's screen.** Lowercase English "data:" in the zh UI, with an ISO date, reads like debug output. It is fixed in F4. The problem-report line stays `data: 2026-11-17` exactly as it is, because it is machine text for support. |
| 9 | Self-hosted Atkinson Hyperlegible for Latin, CJK from the device | **Approved.** It is the right call for privacy (no Google request) and for performance (no ~700 KB CJK file). Both faces load and render correctly. The stack order is fixed in F5. |

## Fixes

### F1 — High — `.seg` breaks CJK labels mid-word; the selected check forces a wrap
**Where:** `src/web/src/styles/app.css` (`.seg`), `Seg` in `views/Settings.tsx`. Seen in the Route options sheet and in Settings.

**What's wrong:**
- At 200 % the labels split mid-word: "最少换 / 车", and "少走楼梯，用电 / 梯" in the switch row next to it.
- At 100 % the **selected** 最少走路 wraps to "最少 / 走路" because the check takes the label's room. 跟手机 in 颜色 does the same ("跟手 / 机").
- Three options of four CJK characters plus a check cannot fit in a third of 390 px.

**Fix:**
- Show-first stacks as a single column at every size. Each option is a full-width 56 px row with the check on the right, so it reads as a short list.
- Every `.seg` stacks at 150 % and 200 %.
- Seg labels never break inside a word.
```css
.seg button{word-break:keep-all}
.seg.stack{flex-direction:column}
.seg.stack button,:root[data-text-size="xlarge"] .seg button,:root[data-text-size="xxlarge"] .seg button{flex:none;width:100%;justify-content:flex-start}
:root[data-text-size="xlarge"] .seg,:root[data-text-size="xxlarge"] .seg{flex-direction:column}
```
`Seg` gets a `stack?: boolean` prop, which adds the class `seg stack`. `PrefRow` passes `stack`.

**Switch rows at 200 %:** fix A's `overflow-wrap:anywhere` now breaks 我用轮椅或助行 / 器 and 少走楼梯，用电 / 梯. The 开/关 value then floats indented on its own line.
- Limit the `xlarge`/`xxlarge` rule to `word-break:normal`: let CJK break between characters, but not after a single trailing character. Add `line-break:strict` and give the label `text-wrap:pretty`.
- Lay the value out on its own line, left-aligned under the label (`.row:has(.tx + .val){flex-wrap:wrap}` and `.row .val{margin-left:0}` at those sizes).
- QA re-checks the switch rows and "清除最近去过的地方 · 没有记录" at 200 %.

### F2 — Medium — Lift-friendly: remove it from the H3 sheet and say what it does today
- `views/Settings.tsx` `RoutePrefsSheet`: delete the `<div class="opts"><Switch … pref-liftfriendly …/></div>` block. Update `e2e/fixa.spec.ts` QA-30 so it expects the sheet to have **no** `pref-liftfriendly`.
- Settings `TravelRows`: give the existing switch a sub-line with the new key `set_liftfriendly_s`:
  - zh: `路上会提醒你跟着电梯标志走。`
  - en: `On the way, I'll remind you to follow the lift signs.`
- M5, when the ranking ships, puts the switch back in the sheet and changes the sub to:
  - zh: `先给你看楼梯少、电梯多的路。`
  - en: `Shows ways with fewer stairs and more lifts first.`

### F3 — Medium — Same word for the same thing on one card
`src/web/src/i18n/ui.ts` `no_change`: zh `不用转车` → **`不用换车`**. en `No changes` is unchanged. Any other zh "转车" in transfer copy uses 换车 too (a grep found none).

### F4 — Medium — About data date in plain words
`src/web/src/i18n/m34.ts` `ab_data`:
- zh: **`交通资料日期：{d}`**, where `{d}` = `2026年11月17日`
- en: **`Transit data date: {d}`**, where `{d}` = `17 Nov 2026`

Format the date from `DATA_AS_OF` (a pure helper next to `relDay`; zh `{y}年{m}月{d}日`, en `{d} {Mon} {y}`). Wrap the digits in `.num`. `report.ts` keeps `data: 2026-11-17` verbatim. **Director:** amend AC 44 so About shows the data date in the UI language and the report carries `data: YYYY-MM-DD`. QA updates the `about-data` assertion to match.

### F5 — Low — Exact CJK system-font order (§1.2)
`src/web/src/styles/tokens.css` `--font`:
```css
--font:"Atkinson Hyperlegible","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC","Source Han Sans SC","Microsoft YaHei",system-ui,sans-serif;
```
Order by platform:
- iOS and macOS: PingFang SC (Hiragino as the older fallback).
- Android, ChromeOS and Linux: Noto Sans CJK SC. That is the installed family name, not "Noto Sans SC", which only exists as a web font or a manual install.
- Windows: Microsoft YaHei.

Also fix the comment in `fonts.css`.

**Weights, now in writing:** Atkinson ships 400 and 700 only, and phone CJK fonts ship Regular and Bold (PingFang tops out at Semibold). So every `900` role renders at 700. Size and space must carry the hierarchy, never 900 against 700. The tokens can stay 900, so a future face picks them up for free.

### F6 — Low — Home recent caption splits "星期一"
**Where:** the Home `.ritem .tx span`, also used in the H2 recents.

**What's wrong:** the trash button narrows the row, and the caption breaks as "星期 / 一".

**Fix:** `.ritem .tx span{word-break:keep-all}`. The spaces in "从 我的位置 · 星期一" still give it break points.

### F7 — Low — The route options sheet closes itself after a pick
After F2 the sheet has a single choice, so one tap should finish the moment.

On a pick:
- close the sheet after 400 ms (immediately under reduce motion);
- the cards re-rank;
- `announce()` the result:
  - zh `现在先给你看：{label}`
  - en `Now showing first: {label}`

There is no toast, because the card tag 推荐 · {label} already shows the result.

**Not a fix, for the record (Low, later):** inside zh text, Atkinson's `unicode-range` (U+2000–206F) draws “ ” … — at Latin width. Before QA-48 Google's CSS behaved the same, so this is not a regression. M5 can add a zh-only alias face without that range.

## STYLE-GUIDE entries to add
1. **§1.2 Type**, replacing the first sentence:
   - Font stack `"Atkinson Hyperlegible", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", system-ui, sans-serif`.
   - Atkinson is **self-hosted** (Latin subset, woff2, 400/700, `font-display: swap`, 700 preloaded). No third-party font request.
   - **CJK comes from the device font**, never a web font.
   - Only 400 and 700 really render, so a `900` role shows at 700. Hierarchy comes from size, never from 900 against 700.
2. **§5 Components → Segmented choice (`.seg`):**
   - Labels never break inside a word (`keep-all`).
   - A set whose labels exceed 3 CJK characters, or that sits in a sheet, stacks as one column of full-width 56 px rows with the check on the right.
   - Every `.seg` stacks at 150 % and 200 %.
3. **H3 Route options**, new line:
   - The **选项 / Options** secondary button (`sliders`) sits under the From line, after 加一个地方.
   - It opens the **路线选项 / Route options** sheet, which holds **先给我看 / Show first**: 最少走路 / Least walking (default) · 最少换车 / Fewest changes · 最快 / Fastest.
   - A pick closes the sheet, re-ranks the cards and announces `现在先给你看：{label}` / `Now showing first: {label}`.
   - The Lift-friendly switch joins the sheet only when its ranking ships (M5).
4. **F6 Settings → 出行 / Travel:**
   - The rows are 先给我看 (stacked seg) · 我用轮椅或助行器 · 我有乐龄卡 · 少走楼梯，用电梯.
   - 少走楼梯，用电梯 has the sub `路上会提醒你跟着电梯标志走。` / `On the way, I'll remind you to follow the lift signs.`
5. **F6 About:**
   - The licence sentence links "Singapore Open Data Licence version 1.0" (`.inlink`, new tab).
   - Under it, a `caption` reads `交通资料日期：2026年11月17日` / `Transit data date: 17 Nov 2026`.
6. **§6d.9 Recents:** Home shows up to **5** rows (was 3). H2 Recent shows up to 5 distinct destinations.
7. **§6d.7 T7:** interim for M3: H4 rows may read `碧山 Bishan (NS17)` (zh, English, code in brackets). The full T7 primary-mention layout on H4 is M5.
8. **Wording:** in zh, "transfer" is always **换车** (最少换车, 不用换车, 换 [CC] …), never 转车.
