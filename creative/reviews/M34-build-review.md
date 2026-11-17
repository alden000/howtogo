# Creative review: M3 + M4 web client (`dev/m34-web` @ 527e925)

Reviewer: Creative. This was a read-only review; the repo is unchanged.
Inputs: STYLE-GUIDE §6d and §6e, the dev-log entries for 2026-11-17 (viewer, and the M3+M4 web round), the baselines (`e2e/baselines/M3-*`, `M4-*`, the re-recorded H3/H4/H9/H10/H12/F6, and `e2e-viewer/baselines/*`), and `i18n/m34.ts`, `styles/m34.css`, `viewer/copy.ts`.
I also rendered the existing `dist` myself with `vite preview` on port 5800 and stopped it afterwards. That covered H5 at 100% and 200%, Home with a disruption in light, dark and 200%, and the en H5. Screenshots are in `scratchpad/shots/`.

## Verdict: APPROVED WITH FIXES

The voice is right almost everywhere. The honest-sharing copy, the calm 995 flow, the viewer states and the colour-never-alone handling on chips, pills and line tags are good work. The viewer at 1440 and at 200% is approved.

Three High items must be fixed before merge. Two are about how much space things take and one is about honesty:
1. The H5 arrival chip is mostly below the fold.
2. The Home disruption banner takes over the first screen.
3. The `nodata` chip promises a bus that may not come.

## Findings

| # | Sev | Screen | File | Problem | Exact fix |
|---|---|---|---|---|---|
| 1 | **High** | H5 wait step, T1 chip (100% and 200%) | `views/Guide.tsx` (step card), `styles/m34.css` `.arrchip` | At 390×844, 100%, the chip's top is at y=717, so only about 120 px shows. At 200% its top is at y=1516, about two screens down. The chip is indented under the headline column (264 px wide). In the `estimated` state, `约 8 分钟` wraps under the badge, which breaks §6d.1 ("the minutes stay on the first line with the badge"). The chip repeats the `139` badge that the sign line already shows. The T1 baselines are cropped at the viewport, so the tags are never captured. | (a) Render `.arrchip` straight after the headline row, before the `站名牌上写着` sign line, at full card width. Make it a sibling of the icon+headline row, not a child of the text column. (b) In H5 only, drop the chip's bus badge so the row reads `4 分钟 · ● 实时` / `4 min · ● Live`. H4 and H3 keep the badge. (c) Move the wake-lock notice (`请让屏幕保持亮着`) below the step card, or reduce it to a one-line trip note, so the step leads the sheet. (d) Add an e2e assertion that `.arrchip b.big` bottom ≤ `innerHeight` at 100% (wake-lock note present) and that it is visible within one scroll of the sheet at 200%. (e) Re-record `M3-T1-*` so the whole chip shows. |
| 2 | **High** | H1 Home, T3 banner | `views/transit.tsx` (Home banner), Home view | The banner is 400 px tall at 100%, light and dark, and 1085 px at 200%. That pushes the greeting, search and 设好你的家 off screen. It shows for any disrupted line, but §6d.3 allows it on H1 only when a recent trip (T9) uses the line. At 200% the 44 px `train-off` disc overflows and collides with the `NS` tag. | On H1, use a **compact strip** of 72 px minimum: `train-off` icon, line tag, title, chevron. Text: `[NS] 南北线 有些站暂时没有地铁` / `[NS] North-South Line: no trains at some stations`. Tapping it opens the LTA notice sheet, and that sheet now also holds Line 1 and Line 2. Keep `知道了 / OK` as a 56 px icon button (`close`, SR `知道了 / Dismiss`). Show the strip only when a recent trip uses the line. Otherwise show the quiet note `LTA：有地铁消息 / LTA: train service news`, which already exists. Give the disc `flex:none; width:44px; height:44px` at every size. |
| 3 | **High** | T1 `nodata` (honesty) | `i18n/m34.ts` `arr_nodata_s` and the caller | Because `lastgone` is not built, `nodata` also shows after the last bus, and then `巴士还是会来的 / The bus will still come` can be false. That breaks the "Honest data" rule. | Between 23:30 and 05:30 local time, or whenever the service has had no arrivals for more than 30 min, use second line `请看站牌上的时间。/ Check the times on the stop sign.` without the promise. Add **给司机看地址 / Show the driver** (secondary 56) → H10. Keep the current line in daytime. |
| 4 | Med | T1 `nodata` voice | trip voice | Not spoken (a listed deviation). | Build now. Speak `暂时没有到站时间，请看站牌。/ No arrival time right now. Check the stop sign.` once per step. The key `arr_voice_nodata` already exists. |
| 5 | Med | T3 free buses, en | `views/transit.tsx:194` | The en text reads `Ang Mo Kio、Bishan…` because the ideographic comma is used in English. | `.join(lang === 'en' ? ', ' : '、')` |
| 6 | Med | P1 contact radiogroup | `styles/m34.css` `.radio[aria-checked=true]` | The selected contact is shown only by a rust border going from 2 to 3 px. That is colour-only. | Checked: `background:var(--c-primary-soft)` plus a trailing 32 px disc in `c-primary` with a `check` icon (`c-on-primary`). Unchecked: an empty 2 px `c-line` ring in the same slot. |
| 7 | Med | P4 `发给 TA 的信息用` seg | `views/family.tsx` | The selected option is shown by border and tint only. Settings → 语言 shows a check, so this seg is inconsistent with it. | Reuse the Settings seg component with its `check` icon. |
| 8 | Med | P2 Help, call row sub (sharing) | `i18n/m34.ts` (help sub) | `一按就打，她的页面也会显示你需要帮忙` gives the contact a gender. It is wrong for 儿子 and 丈夫. | zh `一按就打，{fam} 的页面也会显示你需要帮忙`; en `One tap to call. {fam}'s page will also show you need help.` |
| 9 | Med | Settings, `我的电话号码` | `views/Settings.tsx`, `i18n/m34.ts` | The bare input sits under 家人 with no reason given. Seniors will hesitate to type a phone number without one. | Add a helper (`caption`, `lock`): `家人看你的行程时，可以一按就打给你。只在你分享行程时才会发出去。/ So family can call you from your trip page. It's only sent when you share a trip.` |
| 10 | Med | W `/setup` | `views/family.tsx` (W) | The section titles (`家`, `常去的地方`) are smaller than the field label `找地址`, so the hierarchy is inverted. The search inputs have no placeholder. There is no header or language toggle, which §6e.5 requires because a family member may read English. | Section title: `label` 900 1.05 rem. Field label: `地址 / Address`. Placeholder: `街名、大牌号或邮区编号 / Street, block or postcode`. Add the viewer-style header (logo plus `English` / `中文` toggle, 56 px). Rename `做好了` to `做好了，拿链接 / Done — get the link`, and show `w_sent` only after the WhatsApp/copy tap. |
| 11 | Low | P2 995 confirm | `styles/m34.css` `.btn-danger` | The label `拨打 995` is underlined, which makes it look like a link. | `.btn-danger{text-decoration:none}` |
| 12 | Low | P1 sharing pill | `styles/guide.css` `.sharepill` | Solid `c-jade` fill competes with the primary actions. §6e.1 specifies the soft pair. | `background:var(--c-jade-soft);color:var(--c-on-jade-soft)`. The dot stays `c-jade`. |
| 13 | Low | T1 freshness, en | `i18n/m34.ts` `arr_upd_s` | `Updated {n} s ago` uses an abbreviation. | `Updated {n} seconds ago` |
| 14 | Low | P3 list | `styles/m34.css` `.contact .first` | The `最先打给 TA` tag stretches the full row width. | `width:fit-content` |
| 15 | Low | V footer, 1440 zh | `viewer/render.ts` / `viewer.css` | `（最长 4 小时）。` breaks inside `小时`, leaving `时）。` on its own line. | Wrap `（最长 4 小时）` in `<span style="white-space:nowrap">`, plus `text-wrap:pretty` on the footer. |
| 16 | Low | V helpcleared, en, no pronoun | `viewer/copy.ts:87` | `妈妈 says they’re okay now` reads oddly. | en `{Me} says everything’s okay now.` (zh stays `{me}说自己没事了。`) |
| 17 | Low | V help, 200% en | `viewer.css` call in panel | `Call 妈妈` wraps into two centred lines, far from the icon. | `.call{justify-content:flex-start;text-align:left;gap:12px}` at < 1000 px. |
| 18 | Low | V, en with zh dest | share contract | `妈妈 is on the way to 陈笃生医院`. The name is fine; the destination is untranslated. | Defer to M5: optional `destNameEn` in POST, used when the viewer is in en. Never machine-translate. |
| 19 | Low | baselines | `e2e/baselines` | There is no dark baseline for the T3 banner and none for P1 at 200%. | Add `M3-T3-home-dark-100-zh` (after fix 2) and `M4-P1-choose-light-200-zh`. |

### Checks that passed
- **Colour-never-alone:** the chip states carry words plus a glyph (`● 实时`, hollow `按时间表`, a dashed border with `约`, the `clock` icon, saffron with `快到了`). Line tags carry a code. Pill states carry words and icons. The viewer help panel has a title plus an icon. The only failures are items 6 and 7.
- **Dark:** T1 at 200%, H12, the viewer, and the Home banner all hold contrast. The saffron-soft disc is dim but legible.
- **Copy fidelity:** the share sheet, toast, lock line, Help, 995, P3/P4 validation and P5b all match §6e word for word, apart from the items above.
- **Viewer at 1440:** the two-pane layout, the calm sizes, the help panel with the ink call button and the footer are approved, apart from items 15 and 18.
- **Taxi H10:** the address card stays first and the buttons sit below it. Approved.

## Rulings on the deviations

| Deviation | Ruling |
|---|---|
| Chip `lastgone` / `notrunning` | **Defer to M5.** It needs BusRoutes FirstBus/LastBus data. Fix #3 is the interim honesty guard and is required now. |
| `nodata` not spoken | **Build now** (#4). |
| Lift-friendly ranking | **Defer to M5.** Keep the toggle, since its "follow the lift signs" line is useful. Its caption must not promise ranking: `会提醒你跟着电梯标志走。/ We'll remind you to follow the lift signs.` |
| Bus-routes-only re-query | **Defer to M5.** Until then, do **not** render `只看巴士路线 / Bus routes only` as a control. The `dis_all` note is enough. |
| Contact Picker | **Defer to M5.** It is Android-only and the manual form is fine. |
| Auto-share (AC 9) | **Defer to M5.** It needs its own consent design, and Creative will draw it. |
| Web Push / notify-me | **Drop from M4.** §6e.1 already marked it post-M4; revisit in M5 alongside the viewer. |
| Save as a place on recents | **Defer to M5.** |
| T6 transfer meta and icon tile | **Build the meta now:** `换车 · 第 {i} 步，共 {n} 步 / Change trains · Step {i} of {n}`. A transfer is the moment seniors fear most, and this costs one string. The overlapping line-tag tile is **deferred to M5**. |
| T4 title and note | **Build now.** The keys `rr_title` and `rr_note` already exist. Without them, someone who taps 找别的路 cannot tell that the results avoid the broken line. |
| Viewer: structured `step` pill instead of inferring from stepText | **Approved.** It is better than the spec's fallback. |
| Caregiver setup: family page first, link only, no QR, 24 h box | **Approved for M4**, with fix #10. The QR is **deferred to M5** (Director decides on the dependency). The P5a lead is already written for links. |
| Share before Start (starts the trip) | **Approved.** |
| 995 confirm sheet (vs AC 34) | **Keep the confirm.** It is the Creative ruling, §6e.3 specifies it, and one extra tap for 995 is the calm, safe choice. |
| Recents reuse the v1 store | **Approved.** |
| CDG phone line hidden until verified | **Approved.** |

## Ruling on the `pronoun` API ask

**Drop it.** Do not add `pronoun` to the share contract.
- In zh, repeating `{me}` (`妈妈可能需要你。请打电话给妈妈。`) is how families actually talk, and it reads warmer than 她.
- In en, "they" is fine.
- A pronoun field is one more question in front of a senior, plus another personal attribute leaving the device, for very little gain.

The viewer can keep reading `pronoun` if it ever appears, but the app never sends it and §6e.9 drops the ask. In the same spirit, the app must not guess the contact's gender either (fix #8).
