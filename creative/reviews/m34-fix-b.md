# Creative review: M3/M4 fix round B (`dev/m34-fix-b`, 75cbcda..bb4da0e)

Reviewer: Creative · 2026-11-18 · Read-only review of `src/web` (Developer B's "Visible changes" table in `docs/process/dev-log.md`), against STYLE-GUIDE §5, §6, §6e and the Director rulings of 2026-11-18. That includes today's new ruling: **a help-only share keeps updating location at the normal cadence until "我没事了" or expiry.**

I rendered the release build (`vite preview`, Playwright, 390×844, zh, text size 100% and 200%) for Home with places, the Help sheet, Where am I and `/places`. The server was stopped afterwards.

## Verdict: **APPROVED WITH FIXES** (1 High, 4 Medium, 6 Low)

Overall this is good, calm work. The copy follows the house voice: plain, one action per row, no alarm words. Tokens are used throughout, with no raw colours outside the always-light H10 card that already existed. Targets are 56 px or more. At 200% the rows wrap and nothing truncates. The radiogroup is now a real one.

## Rulings on the questions Developer asked

1. **Share row position in Help: confirmed as built.** The order is call → driver → where am I → find my way / take me home → **让家人看到我在哪里** → 995.
   - Why: Help reads as a ladder, from "I can sort this out myself" (look, find my way) to "someone else needs to know" (family sees me) to "emergency" (995).
   - Calling family stays first, because it is the fastest one-tap human contact.
   - This also matches PM AC 32, minus the taxi row (taxi lives in H10, 6e.6). See the frame text below.
2. **Sub-line:** it needs one honest change (M1): the tap also tells family you need help.
3. **en help message** `I need help. See where I am: {url}`: approved. The zh `我需要帮忙，我在这里：{url}` is verbatim from AC 35 and stays, and it still reads right now that the link updates.
4. **Places lead:** approved with a softer wording (L3).
5. **`Near · 附近：{building}`:** approved. The H10 card is bilingual for the driver, and the line only shows when the building differs.
6. **Viewer en copy** `Too many people are watching. Please try again later.`: approved, with a small sub-line (L5).
7. **"在地图上打开 / Open in Maps" style:** approved: secondary 56, 12 px under the 72 px call button, `locate` icon, opens in a new tab with noopener.
8. **AC 47 fallback text:** approved: `我需要帮忙。我在这里：{address} {maps link}` / `我需要帮忙。`
9. **W `/setup` and share sheet 429 / offline:** approved as built.
10. **Share message with no time (ruling):** approved as built.

## Fixes

### High

**H1 — A help-only share must keep updating (Director ruling today).**
- Where: `state/helpShare.ts`, `views/helpSheet.tsx` `HelpShareRow`.
- Today it sends one fix, at the tap. Per the ruling, it must send positions at the normal share cadence (the same cadence and throttle as a trip share, the latest fix only after a reconnect) until "我没事了" or `expiresAt`.
- The copy "让家人看到我在哪里" promises a live view, so one fix makes it untrue.
- Remove the "Limitation" line from the dev-log entry once this is fixed.
- No copy change is needed for this fix. M2 and M3 cover the related copy.

### Medium

**M1 — The Help share row sub-line must say that it marks help** (6e honesty rule, same as row 1's "她的页面也会显示你需要帮忙").
- Where: `i18n/m34.ts`, keys `hp_share_s` and `hp_share_s_any`.

| Key | zh | en |
|---|---|---|
| `hp_share_s` | `用 WhatsApp 发链接给{fam}，说你需要帮忙` | `Send {fam} a link by WhatsApp to say you need help` |
| `hp_share_s_any` | `用 WhatsApp 发链接，说你需要帮忙` | `Send a link by WhatsApp to say you need help` |

Offline keeps `需要网络 / Needs internet`, as built.

**M2 — "我没事了" on a help-only share must not leave family looking at "停止了分享".**
- Where: `views/helpSheet.tsx` `HelpNote`, `state/helpShare.ts` `end()`, `viewer/state.ts`, `viewer/render.ts`, `viewer/copy.ts`, `i18n/m34.ts`.
- The problem: today the share is just DELETEd. The family page then jumps from the saffron help panel to `{me}停止了分享 · 想知道她在哪里，可以打电话给她。` That is the most worrying possible reading of the best possible news.
- The behaviour fix: `end()` first PUTs `status: travelling` (best effort), then DELETEs.
- In the viewer, if the share ends while help is cleared (`helpClearedAt` set within the last 5 min, or the last status seen was `help`), show a new `endedOk` state instead of `ended`:
  - status sentence (key `endedOk`): zh `${me}说自己没事了。分享结束了。` · en `${Me} says everything’s okay now. Sharing has ended.`
  - line (key `endedOkLine`): zh `想再联系${me}，可以打电话。` · en `You can still give ${me} a call.`
  - jade check avatar (as in `endedArrived`), no map, call button if the number is known, `foot2` footer.
  - Page title: zh `${me}没事了` · en `${Me} is okay`.
- In the app, the toast (new key `hp_ok_end`, replacing the use of `sh_stopped` here): zh `好的，已经停止分享。{fam} 的页面会显示你没事了。` · en `Okay, sharing has stopped. {fam}'s page will show you're okay.`

**M3 — The privacy bullet must cover the help-only share** (it now tracks).
- Where: `i18n/m34.ts`, `priv_m4_time`.
- zh: `行程分享在你到了 30 分钟后自己停止；从“帮忙”开始的分享，在你按“我没事了”后停止。最长都是 4 小时，你也可以随时停止。停止后，你的位置马上删掉。`
- en: `A trip share stops by itself 30 minutes after you arrive. A share started from Help stops when you tap "I'm okay now". Either way it stops after 4 hours at most, and you can stop it any time. Your position is deleted when it stops.`

**M4 — A live help-only share must always have a visible off switch.**
- Where: `views/helpSheet.tsx` (`canShare`, `HelpNote`).
- The problem: if she starts a trip while a help-only share is live, `HelpNote` hides it (it checks `!trip`) and the Help share row reappears. Positions would keep going out (after H1) with no visible control, and a second share could be created.
- Fix:
  - Show `HelpNote` for a live help-only share whatever the trip state, on Home and on the H5 step card.
  - Hide the share row while any help-only share is live: `canShare = !sharing && !helpShare.current.value`.
  - Drop a help-only share from `current` once `expiresAt` passes while the app is open (re-check on render or with a timer), so the note doesn't outlive the share.

**M5 — Gaps between targets are under 8 px on the My places rows (and the G2 rows they reuse).**
- Where: `styles/guide.css` lines 179 and 182.
- The rename, ↑, ↓ and trash buttons sit 6 px apart; §1.3 requires 8 px or more.
- Replace `.stoplist .ctl{…gap:6px…}` with `gap:var(--s-2)`, and `.stoplist .ctl .mv{…gap:6px…}` with `gap:var(--s-2)`.

### Low

**L1 — The place tint guesses wrong on English names.**
- Where: `state/places.ts` `placeKind`.
- Verified in the render: "Robinsons The Heeren" got the family tint, because `son` matched. `grand` would also catch "Grand Hyatt".
- Use word boundaries for the Latin terms: `/\b(daughter|son|grand(child|son|daughter|ma|pa)?|family|friend)\b/`, `/\b(clinic|hospital|polyclinic|doctor)\b/`, `/\b(market|hawker|food cent(re|er))\b/`. Keep the CJK terms as they are.

**L2 — The Home tile screen-reader name repeats itself when label = name.**
- Where: `views/Home.tsx`.
- Use `aria-label={p.label !== p.name ? `${p.label}${t('sr_sep')}${p.name}` : p.label}`.

**L3 — The places lead says "永远", which is heavier than needed.**
- Where: `i18n/m34.ts` `pl_lead`.
- zh `家总是排在第一个。最多可以存 6 个地方。` · en `Home is always first. You can save up to 6 places.`

**L4 — Help row titles leave an orphan character at 100%.**
- Rendered: "让家人看到我在哪 / 里" and "发链接给美 / 玲".
- Where: `styles/guide.css` `.opt b` and `.opt span`.
- Add `text-wrap:balance` to `.opt b` and `text-wrap:pretty` to `.opt span`. The title role already allows balanced wrap (§1.2).

**L5 — The 51st viewer still gets updates, so say so.**
- Where: `viewer/render.ts` (the `viewer-full` note) and `viewer/copy.ts`.
- Keep the AC 25 line bold. Add `<span>` key `tooManyLine`: zh `这一页还会自己更新，只是慢一点。` · en `This page still updates, just less often.`

**L6 — Home with places but no Home has no way to set Home.**
- Where: `views/Home.tsx`.
- When `others.length > 0 && !home`, add the 5.1 "Add a place" style tile, labelled `设好你的家 / Set your Home` (existing `set_your_home`), going to `/search?mode=home`.

## Checked and fine

- **Copy:** every new key matches the dev-log table, the spec or AC verbatim where marked.
  - `需要网络` on the re-route and share rows when offline.
  - 429 `请稍后再试。`.
  - `/setup` offline `需要网络，连上网络再试一次。`.
  - The places editor reuses P4 strings (`名字`, `保存`, `要删掉 {name} 吗？`, `删掉`/`不用了`, `存好了`/`删掉了`).
  - The cap line `最多 6 个地方` matches P3's `最多 5 个人`.
- **Tokens:**
  - The share disc uses `c-jade-soft`/`c-on-jade-soft`.
  - The place discs use the 5.1 `tint-*`/`ink-*` pairs, and `other` uses `c-surface-2`/`c-ink`.
  - The help note uses `c-saffron-soft`.
  - The viewer's secondary button uses `c-surface`, `c-line` and `e-1`.
  - No new tokens.
- **Targets:** `.opt` 84 px, `.iconbtn` and `.dwell` 56 px, `.addrow` 72 px, viewer maps button 56 px.
- **200%:**
  - `/places` rows wrap. The rename button goes full width (existing `xxlarge` rule) and the ↑↓🗑 row drops below it.
  - The Help sheet scrolls, and the title and sub-lines wrap without truncation.
  - The H10 postal chip wraps inside the card.
- **Screen reader:**
  - Places: `往前移：{p}` / `往后移：{p}` / `删掉：{p}` / `改名字：{p}` / `换一个家`. After a move, the position is announced and focus follows the moved place.
  - Chips: `role=radio` + `aria-checked` only, a roving tabindex and arrow keys, as WAI-ARIA describes.
  - Viewer notes: `role=status`.

## STYLE-GUIDE frame entries to add (Creative will fold these into v1.4)

Under **§6e.3 P2**, after item 4, insert:

> 4b. **让家人看到我在哪里 / Let family see where I am** (`share`, `c-jade-soft` disc; only while nothing is shared): sub `用 WhatsApp 发链接给{fam}，说你需要帮忙 / Send {fam} a link by WhatsApp to say you need help` (no contact: `用 WhatsApp 发链接，说你需要帮忙 / Send a link by WhatsApp to say you need help`; offline: `需要网络 / Needs internet`). On a trip: starts the trip share with `status: help`. Not on a trip: a help-only share (`destName` 我在这里 / Where I am, `status: help`) that **keeps sending positions at the normal cadence until 我没事了 or 4 h**. Either way WhatsApp opens to the first contact with `我需要帮忙，我在这里：{url} / I need help. See where I am: {url}`. Failed, offline or 429 (AC 47): WhatsApp opens with `我需要帮忙。我在这里：{address} {maps link} / I need help. I'm here: {address} {maps link}`, or `我需要帮忙。/ I need help.` with no fix. Position rationale: Help runs from self-help to telling family to emergency.
> - Help-only note (Home and step card, `c-saffron-soft`): `{fam} 的页面显示你需要帮忙。` + **我没事了** → ends the share; toast `好的，已经停止分享。{fam} 的页面会显示你没事了。/ Okay, sharing has stopped. {fam}'s page will show you're okay.` Baseline `P2-helponly-note`.

Under **§6e.2 V** states, add:

> | `endedOk` | ended right after help was cleared | {me}说自己没事了。分享结束了。/ {me} says everything’s okay now. Sharing has ended. | jade check · `想再联系{me}，可以打电话。/ You can still give {me} a call.` · no map · call |
> | (note) `full` | 51st viewer (AC 25) | top note on any state, `clock`: **看的人太多了，请稍后再试 / Too many people are watching. Please try again later.** + `这一页还会自己更新，只是慢一点。/ This page still updates, just less often.` | last state stays; GET polling |
> - **在地图上打开 / Open in Maps** — secondary 56, `locate`, under the call button whenever a position is shown; `https://maps.google.com/?q={lat},{lng}`, new tab.

New **§6e.7b P8 My places** (`/places`, Settings → 我 → 常去的地方 / My places, value = count):

> Title `常去的地方 / My places` · lead `家总是排在第一个。最多可以存 6 个地方。/ Home is always first. You can save up to 6 places.` · G2 `.stoplist` rows with a 44 px 5.1-tint disc: Home row first (edit → Home sheet; none → `设好你的家`), then ≤ 5 places, each with **改名字 / Rename** (`.dwell`) and ↑ ↓ 🗑 (56 px, 8 px gaps) · dashed **加一个地方 / Add a place** (72) → search; at the cap the caption `最多 6 个地方 / Up to 6 places` · rename sheet `改名字` / `名字` / placeholder `比如：诊所 / e.g. Clinic` / **保存** · remove confirm as P4. H1 shows the places as 5.1 tiles after Home; tint from the label (诊所 clinic · 巴刹 market · 女儿/family family · else `c-surface-2`). Baselines `P8-list`, `P8-max`, `P8-rename`, `P8-remove`.
