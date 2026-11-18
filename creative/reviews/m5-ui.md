# Creative review: M5 UI build (UI-1 + UI-2)

Reviewer: Creative · 2026-11-18 · against STYLE-GUIDE v1.4.1 §6f + 6f.11
Branches: `dev/m5-ui` @ b3a92dc (UI-1: L1, L2, L5, L7, L8, 6f.11, delete-all) · `dev/m5-ui2` @ c2d86e8 (UI-2: L3, L4, L6, L9)
Read: commit diffs from bf22bd9, i18n tables (`privacy.ts`, `m5lazy.ts`, `m5ui1.ts`, `m5launch.ts`), `Privacy.tsx`, `Settings.tsx`, `launch.tsx`, `m5ui1.css`, `m5.css`, and the new M5 baselines (L1 top/full, L2, L5 sheet, L7 100/200, F1 85, L3 bar 100/200 + What's new, L4a second, L4b guide, L4c, L4d android, L6 home offline).

## Verdict: APPROVED WITH FIXES

This is a good round. The copy is almost word for word what the guide says, in both languages. No new tokens. The 56/72 px targets hold. The AA cycle skips 85 %. The viewer stays at 100 %. The iOS picture guide reads well, and the offline captions are calm and do not grey anything out. The UI-2 copy (`m5launch.ts`) has no deviations.

Two things are visibly broken on the privacy page, the screen AC 22 is judged on, so they must be fixed before merge: a CSS class collision, and inline links that break the text flow. The rest is polish. Fix 1–4 before the integration build; 5–12 can go in the integration round.

Known items that are tracked elsewhere and not repeated here: the Help and Show-the-driver offline states (`M5-L6-help-offline`, `M5-L6-driver-offline`), the missing `h1` on route detail and guidance, and the Settings update bar with `M5-L3-bar-settings`.

## Fixes

### 1. HIGH · L1 Privacy · `views/Privacy.tsx`, `styles/m5ui1.css`: the contact line renders as a family contact card
`<p class="contact">` picks up M4's `.contact` card style (`m34.css:40`: surface fill, shadow, 84 px min-height, flex). In `M5-L1-full-light-100-en` the line "Questions? Use Report a problem in Settings." is a white card, and the link breaks it into three rows.
- `Privacy.tsx`: `<p class="contact" data-testid="pv-contact">` → `<p class="pvcontact" data-testid="pv-contact">`
- `m5ui1.css`: `.pv .contact{margin:var(--s-6) 0 var(--s-2)}` → `.pv .pvcontact{margin:var(--s-6) 0 var(--s-2)}`

### 2. HIGH · L1 Privacy + L2 About · `styles/m5ui1.css`: inline links break the sentence they sit in
`.inlink` is `display:inline-flex; min-height:56px`. Inside running text this splits the line. In L1 h2 5 you get "In Settings, tap **Delete all my data**:" / break / "everything…", with the bullet dot floating above. The same thing happens in About, where "the" is orphaned before the licence link. Keep the 56 px hit area but take it out of the line box. Add:
```css
.pv li .inlink.btnlink,.pv .pvcontact .inlink.btnlink,.abattrib .inlink{display:inline;min-height:0;padding-block:16px;vertical-align:baseline}
```
Vertical padding on an inline box enlarges the tap area without moving the line. Re-record `M5-L1-full-*` and `M5-L2-*`.

### 3. MEDIUM · L1 Privacy copy · `i18n/privacy.ts` (AC 22 ≤ 400 words)
The en page is 439 words counting headings, glance and contact. QA will count everything visible, so get under 400 with no argument. These cuts bring it to **396** (footer and the "Open 怎么去?" link not counted). No fact is lost. They also remove the third repeat of "no ads, no tracking, no accounts", which the lead and the glance card already say. Keep `PRIVACY_NOTICE.n = 1`, because the notice is not released yet. The zh lines change the same way so the two languages match.

| key | zh (new) | en (new) |
|---|---|---|
| `pv_lead` | (unchanged) | `怎么去? has no sign-up, no ads and no tracking. Here is where your information goes.` |
| `pv_1b` | `为了没有网络也能用，手机还会暂存看过的地图和最近的搜索。` | `To work without internet, it also keeps maps you have seen and recent searches.` |
| `pv_2a` | `**找路和搜索：**你打的字、起点和终点，用来向 OneMap 和陆路交通管理局查询。我们不记下是谁问的。查到的结果最多暂存 1 天，然后自动删掉。` | `**Searches and routes:** what you type, and the start and end, to ask OneMap and the Land Transport Authority. We don't record who asked. Answers are kept for up to 1 day, then deleted.` |
| `pv_2d` | `**匿名错误统计（可以关）：**只有“哪一种问题、在哪个画面、几次”。没有位置、地址、搜索内容，也没有能认出你的东西。保留 90 天。` | `**Anonymous error counts (you can turn this off):** only which problem, on which screen, how many times. No location, addresses, searches or anything that could identify you. Kept for 90 days.` |
| `pv_2e` | `我们的服务器记录里没有你的位置、地址、搜索内容或网络地址（IP）。网络地址只短暂用来防止滥用，不会保存。` | `Our server logs never contain your location, addresses, searches or internet address (IP). The IP is used briefly to stop misuse, never kept.` |
| `pv_3a` | (unchanged) | `**OneMap (Singapore Land Authority):** maps and addresses. Your phone gets map pictures straight from OneMap.` |
| `pv_3d` | `**WhatsApp、短信、电话、Grab、CDG Zig：**只有你按了才会打开；打开以后，由它们自己的隐私规定负责。` | `**WhatsApp, SMS, phone calls, Grab, CDG Zig:** they open only when you tap them; then their own privacy rules apply.` |
| `pv_4a` | `不卖你的资料，不用 cookie。` | `No selling your data. No cookies.` |
| `pv_5a` | `在设置里按 [清除所有资料]：这部手机上的资料全部删掉，包括暂存的地图和搜索；正在分享的行程也会先停止。` | `In Settings, tap [Delete all my data]: everything on this phone is removed, including saved maps and searches, and any trip share stops first.` |
| `pv_family` | `家人打开行程链接，不用安装，也不用账号；我们不记录是谁在看。` | `Family who open a trip link need no app or account, and we don't record who is watching.` |

Why "you can turn it off in Settings" leaves `pv_2d`: the lead-in already says so, and Settings → Details links straight to this section. Creative will carry these lines into STYLE-GUIDE 6f.1 (v1.4.2) at integration. Until then, this table supersedes 6f.1 for these keys. Add a unit test that counts the words in `PV_EN`, excluding `pv_open` and `pv_footer`, and fails above 400.

### 4. MEDIUM · process · `docs/process/dev-log.md` on `dev/m5-ui`
b3a92dc ("…dev-log") committed **UI-2's** entry word for word, and there is no UI-1 entry, so no UI-1 "Visible changes" list exists. I reviewed UI-1 from its commit diffs instead. Before merge, UI-1 adds its own entry (`## 2026-11-18 — Developer UI-1: M5 UI round`) with its Visible changes and baseline list, and the merge keeps exactly one copy of the UI-2 entry.

### 5. MEDIUM · 6f.11 first run · `views/Welcome.tsx`: the 85 % warning sits under the fold
In `M5-F1-size-85-light-100-zh` the caption 字会变小。看不清楚，可以在设置里改回来。 is behind the sticky 下一步 fade, so it is the one line nobody sees. Render the `size-85-note` `<p>` directly after the size `.radiogrid` and before the preview card, with style `margin: var(--s-2) 0 0`. The copy is unchanged. Settings already places it right under the segment, which is correct. Guide amendment (6f.11, "Preview sentence"): on F1 the caption sits under the size cards, not under the preview. Re-record `M5-F1-size-85-*`.

### 6. MEDIUM · L4d in-app band · `views/launch.tsx` / `styles/m5.css`: zh text squeezed into a 3-line column at 100 %
In `M5-L4d-android-light-100-zh`, 在浏览器里打开会更好用 breaks as 在浏览器/里打开会/更好用 beside the button. Use the 200 % layout at every size: row 1 is the `open-browser` icon + text, with ✕ top-right; row 2 is the button, left-aligned, 56 px. The band still grows taller and is never sticky. Guide amendment (6f.4 L4d "200 %" bullet) → "All sizes: text on its own line, button below it, left-aligned; ✕ top-right." Re-record `M5-L4d-android`, `M5-L4d-ios`.

### 7. LOW · zh quotation marks · `i18n/m5lazy.ts`, `i18n/privacy.ts`
UI-1 uses straight ASCII `"` in zh, while UI-2 and M4 use “ ”. Make them match:
- `set_errors_s`: `只发“哪种问题、几次”，帮我们修好它。不含位置、地址或搜索内容。`
- `bs_auto_s_na`: `这部手机不能告诉我电量，所以“自动”不会打开省电。需要时请选“开”。`
- `pv_2d`: as in fix 3.

### 8. LOW · L7 Settings · `views/Settings.tsx` row-clear: label breaks after the colon
At 100 %, 记录：/清除最近去过的地方 wraps after 记录：, so it reads like a heading. The group context makes "记录：" unnecessary. Use the existing key: `label={t('clear_recent_row')}` (清除最近去过的地方 / Clear recent places), and delete `set_clear_recent` from `m5lazy.ts`. Guide 6f.7, row 5 → 清除最近去过的地方.

### 9. LOW · delete-all sheet · `views/family.tsx` (`DeleteAllSheet`): no visible busy state
`deleteAllData` can wait up to 4 s for the share DELETE, and meanwhile the button looks dead. While `busy`, the button label becomes **正在清除… / Deleting…** (new keys `set_delete_all_busy`, zh `正在清除…`, en `Deleting…`). Keep `aria-busy`.

### 10. LOW · L2 About · `views/Settings.tsx` About + `kit.tsx` Wordmark
- The seal renders at about 44 px; 6f.2 says 72 px. Add a `size="72"` variant to the About wordmark only.
- The OneMap logo is hotlinked from onemap.gov.sg, so it is broken offline, and L6 says About fully works offline. Self-host the official asset under `/assets/onemap-logo.png` (+ the 256 px `@2x`) and precache it. The `alt="OneMap"` and the line stay.

### 11. LOW · L1 SR · `views/Privacy.tsx`
- Glance `<ul class="glance">`: add `role="list"`. Safari/VoiceOver drops list semantics when `list-style:none`, which the `.dots` lists already guard against.
- `?s=sent` (Settings → Details): after `scrollIntoView`, also focus the h2: `document.getElementById('pv-h2')?.focus({ preventScroll: true })`. It already has `tabIndex={-1}`.

### 12. LOW · zh bold lead-ins on L1, check on a device
In the Docker zh baselines, `<strong>` lead-ins such as 找路和搜索： and the glance labels do not look bold, while en is bold. This is likely the container's CJK font having no bold face. QA: check on a real Android and iPhone at 100 %. If they are not bold there, add `.pv strong{font-weight:900}` (system CJK fonts synthesise or pick the heavier face).

## Checked and fine
- **Copy:** L2, L5 (row values, sheet, note, unsupported line, announcement), L7 error row, L8 links, 6f.11 labels and all 10 SR names, L3 (bar, updating, slow, What's new), L4a–d, and the L6 captions + announcement all match the guide exactly in zh and en. The delete-all body was updated as fact 1 requires.
- **6f.11:** `--ts .85` with no new token. The F1 grid is 2+2+1 with the last card spanning the row. Settings `.seg.sizes` is 3+2 and stacks at 150/200. W has 5 options with a default of 125. Seg `aria-label`s contain the visible "%" (label-in-name OK). The AA cycle skips 85. Nothing in this round drops below the 14.5 px floor at 85 % (`.row .tx small` .85rem ≈ 14.5).
- **Targets:** rows, segments and sheet radios are ≥ 56 px. Primary buttons are 72 px. Details is 56 px on its own line. The L3 ✕ and the L4d ✕ are 56 px.
- **200 %:** in L7 every row wraps and nothing clips. In the L3 bar the text wraps beside the icon and ✕ stays top-right. The L6 Home has no horizontal scroll (e2e).
- **States:** L3 has waiting/updating (with `aria-busy`, ✕ hidden)/slow, with no retry loop. The polite announcement fires once. The "never during a trip" gate goes through the engine's `updateBar`. What's new has one button and focus moves to the title and back.
- **L4b pictures:** inlined, they follow the theme, the saffron ring marks the tap target, and the step 1 Chrome variant is in place. They read well at 280 px.
- **L6:** nothing spins. Controls stay enabled at full contrast with a calm 需要网络 line, and no "failed" wording anywhere.
