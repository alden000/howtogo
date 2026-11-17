# 怎么去? — Style guide v1.0

Source of truth for the build. **Build strictly to these tokens and frames:** no raw values outside the token sheet, and no improvised UI. New tokens need Director approval. The prototype `creative/prototype/index.html` implements every token below in its `:root` block. Brand rationale lives in `docs/02-creative-direction.md`.

---

## 0. Logo

| File | Concept | Verdict |
|---|---|---|
| `logo/a-question-path.svg` | **A · Question Path.** A "?" drawn as a route: start ring → winding path → saffron destination dot. | **Recommended.** Reads at 16px (the ? silhouette plus the yellow dot survives). Ownable, and literally the app name. Not a pin, arrow, roundel or train. |
| `logo/a-question-path-maskable.svg` | A, full-bleed square with the mark scaled to 72% inside the 80% safe circle. | PWA `purpose: maskable` (192/512). Checked under a circle mask. |
| `logo/a-question-path-mono.svg` | A, single colour. | Android notification and badge icon (white on transparent at build). |
| `logo/b-qu-seal.svg` | B · 去 Seal. The character 去 as a chop seal, the last stroke ending in the dot. | Strong for Chinese readers, but it turns to mush at 16px and reads "official stamp". |
| `logo/c-lantern.svg` | C · Lantern lighting a winding path. | Warm and festive, but seasonal (CNY/Mid-Autumn) and busy small. |
| `logo/d-walk-with.svg` | D · Two companions walking a path. | Lovely story, but abstract. At 48px the dots read as a weather or sun icon. |

`logo/logo-sizes.png` shows every concept rendered at 192, 48 and 16px (DPR 1), plus the maskable variant under a circle mask.
Clear space = the dot's diameter. Minimum size is 16px (favicon). Below 24px, use the mono version on non-persimmon backgrounds.
Wordmark: "怎么去?" in Noto Sans SC 900 next to the mark. The "?" is ASCII, so it matches the mark.

## 1. Tokens

### 1.1 Colour (light / dark), with contrast ratios computed (WCAG 2.x)
| Token | Light | Dark | Pair → ratio (light / dark) | Use |
|---|---|---|---|---|
| `c-canvas` | `#FBF5EC` | `#14110E` | ink → 16.12 / 16.37 | App background ("warm paper") |
| `c-surface` | `#FFFFFF` | `#1F1A16` | ink → 17.47 / 15.00 | Cards, sheets, buttons |
| `c-surface-2` | `#F3EADC` | `#2A231D` | ink → 14.65 / 13.47 | Chips, quiet panels |
| `c-line` | `#D9CBB6` | `#43392F` | (decorative borders) | Dividers, secondary button border |
| `c-ink` | `#1D1915` | `#F6EEE4` | — | Body text, **AAA** |
| `c-ink-2` | `#4A4038` | `#CFC3B5` | canvas 9.31 / 10.86 · surface 10.09 / 9.96 · surface-2 8.46 / 8.94 | Secondary text, **AAA** |
| `c-primary` | `#9A3412` | `#FF9466` | on-primary 7.31 / 8.05 | Primary buttons, bus route, user dot |
| `c-on-primary` | `#FFFFFF` | `#1D1915` | — | Text on primary |
| `c-primary-text` | `#8A2E0B` | `#FFA77F` | on canvas 7.82 / 9.93 | Links, highlighted words |
| `c-primary-soft` / `c-on-primary-soft` | `#FBE3D3` / `#6E2409` | `#4A2414` / `#FFD9C6` | 8.87 / 10.29 | Step icon tile, avatars |
| `c-jade` / `c-on-jade` | `#0E5B49` / `#FFFFFF` | `#5FD3B0` / `#0A1F19` | 8.04 / 9.35 | Family, share, "safe", call |
| `c-jade-soft` / `c-on-jade-soft` | `#D6EDE4` / `#0A3F33` | `#123A30` / `#BDEFDF` | 9.65 / 9.90 | Status pills |
| `c-saffron` / `c-on-saffron` | `#FFD23F` / `#1D1915` | same | 12.10 | Destination dot, **get-off alert**, bus-here |
| `c-saffron-soft` | `#FFF1C2` | `#3D3212` | ink-market 8.24 / 10.48 | Market tile tint |
| `c-danger` / `c-on-danger` | `#A4161A` / `#FFFFFF` | `#FF8A80` / `#1D1915` | 7.75 / 7.65 · as text on canvas 7.15 / 8.24 | **995 only** |
| `c-scrim` | `rgba(29,25,21,.55)` | `rgba(0,0,0,.66)` | — | Behind sheets |
| `c-focus` | = ink | = ink | — | 3px focus ring, 3px offset |
| tile tints (`tint-*` / `ink-*`) | home `#FBE3D3/#6E2409` 8.87 · clinic `#D6EDE4/#0A3F33` 9.65 · market `#FFF1C2/#5C4300` 8.24 · family `#EADFF3/#4B2A63` 9.03 | dark: 10.29 · 9.90 · 10.48 · 10.30 | | Saved-place icons |

All text pairs are ≥ 7:1 (AAA). The address card (H10) is always light (`#FFFFFF` / `#1D1915`, 17.5:1) in both themes.

**Transit line colours (official; never colour-only, D7).** The **line tag** = 12px colour stripe + code text in `c-ink` on `c-surface` (17:1). The colour is a secondary cue.
| Token | Hex | vs paper / vs dark surface |
|---|---|---|
| `line-ns` North–South | `#D42E12` | 4.61 / 3.45 |
| `line-ew` East–West | `#009645` | 3.56 / 4.47 |
| `line-ne` North East | `#9900AA` | 6.60 / 2.41 |
| `line-cc` Circle | `#FA9E0D` | 1.94 / 8.18 |
| `line-dt` Downtown | `#005EC4` | 5.70 / 2.79 |
| `line-te` Thomson–East Coast | `#9D5B25` | 4.90 / 3.25 |
| `line-lrt` LRT | `#748477` | 3.65 / 4.36 |
Several colours fall under 3:1 on one theme. That is acceptable only because the text code carries the meaning and the tag has a `c-line` border. Never use a bare coloured dot for a line.

Bus services use the **bus badge**: an `c-ink` block with the bus icon and number in `c-ink-inv` (16:1). We deliberately do not mimic operator liveries.

Map tokens (`m-*`): land `#F1E9DC`/`#1C1815`, block `#E3D6C2`/`#2B241E`, park `#CFE3C2`/`#1E2B20`, water `#B9D9E4`/`#162A33`, road `#FFF`/`#3B332C`, casing `#D8C8B0`/`#2B241E`, expressway `#F6D7A4`/`#4A3A22`, label = ink-2 with a 5px land-colour halo, travelled route `m-done` `#B5A792`/`#5E544A`. With OneMap tiles: Default (light) and Night (dark), overlays unchanged.

### 1.2 Type
Font stack: `"Atkinson Hyperlegible", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif` (Google Fonts, `display=swap`). Weights are **400 / 700 / 900 only**. Numerals use Atkinson and `tabular-nums`.
`html { font-size: calc(20px * var(--ts)) }`, where `--ts` ∈ {1, 1.25, 1.5, 2}. All type is in rem.

| Role | Size (rem / px @100%) | Weight | Line height | Use |
|---|---|---|---|---|
| `display` | 2.1 / 42 | 900 | 1.15 | Greeting |
| `alert` | 2.4 / 48 | 900 | 1.1 | 下一站下车 |
| `arrival` | 3.0 / 60 | 900 | 1.05 | 到了！ |
| `duration` | 2.2 / 44 | 900 | 1.0 | "23 分钟" on route cards |
| `title` | 1.5 / 30 | 700 (balanced wrap) | 1.2 | Screen titles |
| `step` | 1.45 / 29 | 900 (balanced wrap) | 1.2 | Step card instruction |
| `tile` | 1.45 / 29 | 900 | 1.15 | Saved-place names |
| `headline` | 1.2 / 24 | 700 | 1.3 | Sheet titles, list titles |
| `button` | 1.15 / 23 | 700 | 1.2 | Primary buttons |
| `body` | 1.0 / 20 | 400 | 1.45 | Body |
| `label` | 0.9 / 18 | 700 | 1.3 | Chips, meta |
| `caption` | 0.85 / 17 (min) | 400 | 1.3 | Sub-lines (never smaller than 17px at 100%) |

The only exception is map attribution at 11px (legal text, not content).

### 1.3 Space, radii, elevation, targets
- **Space (4pt):** `s-1` 4 · `s-2` 8 · `s-3` 12 · `s-4` 16 · `s-5` 20 (screen gutter) · `s-6` 24 · `s-8` 32 · `s-10` 40 · `s-12` 48.
- **Radii:** `r-s` 12 (chips, badges) · `r-m` 20 (list items, options) · `r-l` 28 (cards, tiles, buttons) · `r-xl` 36 (sheets, step card) · `r-pill` 999.
- **Elevation:** `e-1` resting card · `e-2` raised (search, route card) · `e-3` sheets and toasts. Shadows are warm brown in light mode and black in dark. No blur or glass.
- **Targets:** `tap` **56px** minimum, every control (verified in the audit). `tap-hero` **72px** for primary actions. Spacing between targets is ≥ 8px.
- **Breakpoints:** phone < 600 (full bleed) · 600–999 (centred 440 column) · ≥ 1000 × 760 (device frame 390×844 + guide panel). The production PWA on desktop uses a 480px max content column with a two-pane trip view (steps | map) from 1280px.

### 1.4 Icons
Custom set on a 24px grid, 2.2px stroke, round caps and joins, `currentColor`, inline SVG `<symbol>`s. Base set: walk, bus, train, home, clinic (plus sign, **never a red cross**), market (basket), family, search, mic, help (lifebuoy), share (broadcast), phone, close, back, chevron, sliders, speaker, mute, nav (follow), route, bell, check, car, locate, lift, clock, lock, message, eye.
Icons always come with a text label, except close, mute and follow-map, which have `aria-label`s. The destination marker is always the **saffron dot**, never a teardrop pin.

## 2. Motion

| Token | Value | Use |
|---|---|---|
| `ease-out` | `cubic-bezier(.2,.8,.2,1)` | Default |
| `ease-spring` | `cubic-bezier(.34,1.36,.64,1)` | Sheets, alert, toast, dot drop (gentle ~6% overshoot) |
| `ease-in` | `cubic-bezier(.4,0,1,1)` | Exits |
| `d-fast` | 160ms | Press feedback (scale .97) |
| `d-base` | 280ms | Screen push/pop, scrim |
| `d-slow` | 420ms | Banners, toasts |
| `d-sheet` | 460ms | Sheet and alert rise |

- **Screen push:** incoming slides from translateX(12%) with opacity 0→1. Outgoing slides to −6% and fades. Pop is the mirror. Short travel, so older eyes keep their place.
- **Sheets:** slide up with the spring over a 280ms scrim fade. Closing uses ease-in at 280ms.
- **Map camera:** exponential ease (k = 3.2/s) of x, y, zoom and rotation along the shortest arc. It is never instant, except under reduce motion.
- **Signature moments:**
  1. **Get off now (H6):** the saffron panel springs up. The bell swings (1.2s loop). Two ripple rings expand (1.6s). The screen edge glows saffron (1.2s breathe). Haptic `getoff`. Voice speaks the line, then repeats the second line after 2.2s.
  2. **Arrival (H12):** the Question Path stroke draws (1.1s) → saffron dot drops with the spring (0.7s) → ring ripples out → 18 petals in persimmon, saffron and jade drift outward (1.6–2.4s) → text rises (staggered 150ms). Haptic `arrive`. Voice: 到了！
  3. **Bus is here:** the arrival chip flips to saffron, plus haptic `attention`.
  4. **Live:** the user-dot pulse (2s) and the "live" dot blink (1.6s) show that data is fresh.
- **Reduce motion** (OS setting, or Settings → 减少动画): all transitions become a 120ms cross-fade. Pulses, petals and ripples are removed. The alert appears without bounce and the edge glow is static. The map camera snaps. The arrival mark is shown complete. Haptics and voice are unchanged.

## 3. Haptics (`navigator.vibrate`; iOS Safari ignores it, so voice and visual must carry the moment)
| Name | Pattern (ms) | Use |
|---|---|---|
| `tick` | 12 | Any tap that navigates or toggles |
| `confirm` | 20·40·20 | Step advanced, share sent, alert acknowledged |
| `attention` | 60·80·60 | Bus or train arriving, reached the stop |
| `getoff` | 300·150·300·150·600 | Get off at the next stop (the strongest pattern, unique) |
| `arrive` | 40·60·40·60·160 | Arrived at destination |
| `gentle` | 30·60·30 | Off route detected (soft, not an error buzz) |
There is no "reject" buzz: we never punish. Settings → 震动提示 turns all haptics off.

## 4. Sound and voice
- Uses the platform TTS (`speechSynthesis`): zh-CN at rate 0.9, en at 0.92. Each line is the on-screen headline, spoken once. **再说一遍 / Say it again** repeats it.
- Voice is on by default. The mute toggle is in the guidance top bar and in Settings. The speaker icon shows the state. Mute stops speech at once.
- Lines: walk start, wait, bus here, ride, get off (+ bell reminder), alight, off route, new way found, arrival. Copy is in §6.
- No earcons in v1. A soft two-note chime before the get-off line is a v1.1 candidate, pending a user test.
- Screen readers: step changes go to a polite live region. Get-off goes to an assertive live region plus `role="alertdialog"`.

## 5. Components

### 5.1 Big destination tile (`.tile`)
A 2-column grid using `repeat(auto-fit, minmax(min(100%, 8rem), 1fr))`, so it becomes 1 column automatically at 200%. Min height 148px, `r-l`, `e-1`, padding 18. Contents: a 60px tinted icon square (`r` 20, 34px icon), name (`tile` role), sub-line (`caption`).
States: default, pressed (scale .97, `d-fast`), focus ring. SR label: "诊所，陈笃生医院".
Saved places v1: 家 Home (tint-home), 诊所 Clinic (tint-clinic), 巴刹 Market (tint-market), 女儿家 Daughter's home (tint-family). Max 6, editable in build M2.

### 5.2 Route option card (`.card`)
`r-l`, `e-2`, padding 18, full width. The whole card is one button.
Contents: tag pill (best = primary fill with a check: "推荐 · 最少走路") → duration (`duration` + unit) and "上午 10:39 到达" → leg chain (walk chip `walk-icon + min`, bus badge, line tag, chevrons between) → dashed divider → facts row (walk total, no changes, no stairs / lifts, stops) → "选这条路 ›" in primary-text.
The best card has a 3px primary border. Max 3 cards. A single option adds the "only one easy way" note. A bus route adds the honest note about times.
SR label: the whole sentence, e.g. "推荐，最少走路，23 分钟，上午 10:39 到达。走路 3 分钟，然后巴士 139，然后走路 2 分钟".

### 5.3 Step card (`.stepcard`)
A bottom panel over the map, `r-xl` top corners, max 62% of the height (it scrolls at 200%).
Contents: meta row ("第 2 步，共 4 步" · "上午 10:39 到达 · 还有 18 分钟") → 72px step icon tile → instruction (`step`) → sign chip (the exact sign text) → sub-line → optional arrival chip or stop dots → progress bar (10px) → **再说一遍** secondary button (56px).
Icon tile by type: walk = primary-soft · waiting = ink · bus-here / arrive / alight = saffron.

### 5.4 Transit badge
- **Bus badge:** ink block, `r-s`, min height 40px, bus icon + number (700).
- **Line tag:** surface + 2px `c-line` border, 12px colour stripe, code text ("NS"), optional station code ("NS19").

### 5.5 Bus-arrival chip (`.arrchip`)
`surface-2` panel, `r-m`. Contents: bus badge, big minutes (900, 1.6rem, tabular), a "● 实时 Live" blinking dot, and "下一班 12 分钟".
States: counting · `here` (saffron fill, "快到了 / Arriving") · stale > 60s (build: dot turns grey and shows "约 / about") · no data (build: "暂时没有到站时间，请看站牌 / No live time right now — check the stop sign").

### 5.6 Follow-me map controls (`.mapctl`)
A right-edge column of 56px round buttons that floats 14px above the step card: **Follow / See whole trip** toggle (filled primary when following) and **Share**.
The top bar holds **结束 End** (left), the voice toggle, and the **帮忙 Help** ink pill (right). A share-status pill (jade, live dot, "美玲 看得到你") sits centred under the top bar while sharing. Tapping it opens the share sheet.

### 5.7 Alert banner
- **Get-off alert (`.alert`, H6):** full-width saffron bottom panel with an 84px ink bell disc, the alert title, an instruction line, a sign chip (ink on saffron, inverted), and a 72px "知道了 OK" ink button. The edge glow sits on top of the map. It stays until acknowledged or until the bus reaches the stop.
- **Info banner (`.banner`, H11):** a surface card at the top under the bar, with an 8px jade left rule and spinner → check. It auto-dismisses 4.2s after resolving.
- **Toast:** an ink card 110px above the bottom, check icon. It lasts 3.6s and is `role="status"`.

### 5.8 Share sheet (H7)
Bottom sheet: title, lead, a "告诉谁？" radiogroup of contact options (avatar initial, name, relation, radio check), then **用 WhatsApp 发送** (jade, primary), **发短信** (secondary), **看看家人会看到什么** (quiet link), and a lock line about privacy.
While sharing: title "正在分享给 美玲", "到达后自动停止", preview, **停止分享**.

### 5.9 Help sheet (H9)
Options in fixed order: 打电话给美玲 (jade disc) → 给司机看地址 (saffron disc) → 我在哪里？ → 帮我重新找路 (only during a trip) → `紧急情况 · 拨打 995` (danger outline, last, not a big red button).

## 6. Frames

Shared rules for every frame:
- Light and dark from tokens.
- At 200% text: content reflows, rows wrap, nothing truncates (only the decorative URL in H8 ellipsises). Screens scroll vertically. No horizontal scroll.
- Targets ≥ 56px.
- Every screen, sheet and dialog is a history entry. Back closes the topmost sheet first.
- Baselines: `H{n}-{state}-{light|dark}-{100|200}-{zh|en}.png` at 390×844 DPR 2, plus `H{n}-desktop-1440.png` for H1, H3 and H5.

### H1 Home
- Bar: mark + 怎么去? · `EN`/`中` (SR: "Switch to English"/"切换到中文") · `AA` text size (SR "字体大小：125%") · settings (SR "设置").
- Greeting: 早上好，林阿姨 / Good morning, Auntie Lin (下午好 / 晚上好 by hour). Sub: 今天想去哪里？ / Where would you like to go today?
- Location pill: 你在：家附近 / You are near: Home.
- Search button: 说出或打出地方名字 / Say or type a place (mic disc). Section: 常去的地方 / My places + today's date.
- Tiles: 家 Home · 大巴窑4巷 第79座 · 诊所 Clinic · 陈笃生医院 · 巴刹 Market · 大巴窑8巷 第210座 · 女儿家 Daughter's home · 美玲家 · 碧山11街.
- Help row: 需要帮忙？/ Need help? · 打电话给家人，或给司机看地址 / Call family, or show a driver your address.
- Dock primary: 带我回家 / Take me home.
- States: at home, "Take me home" → toast 你现在就在家附近，不用找路啦。/ You're already near home. No trip needed. Away from home → H3 to home. No saved places (build) → tiles replaced by an "Add a place" tile. Offline (build) → top note 没有网络，已保存的行程还能用 / No internet. Saved trips still work.
- **Back goes to:** leaves the app (root).
- Baselines: `H1-default-*`, `H1-away-*`.

### H2 Search
- Title 去哪里？/ Where to? · field (label 地方名字 / Place name, autofocus) · mic (SR 用说的 / Speak).
- Listening line: 我在听…请说地方名字 / I'm listening… say the place (ripple rings).
- List header: 最近去过 / Recent → 找到这些地方 / Places found. Rows show icon, name and address.
- Empty: 没找到“{q}” / Couldn't find “{q}” · 换个说法试试，比如“医院”“巴刹”或地址。/ Try other words, like “hospital”, “market” or an address.
- Loading (build): three skeleton rows with 我在找… / Looking…
- Error (build): 现在找不到，请再试一次 / Can't search right now. Please try again.
- **Back goes to:** H1. Baselines: `H2-recent`, `H2-results`, `H2-empty`, `H2-listening`.

### H3 Route options
- Title: 怎么去 **陈笃生医院**？/ How do I get to **Tan Tock Seng Hospital**? · From: 从：家 · Blk 79 Toa Payoh Lor 4 / From: Home · Blk 79 Toa Payoh Lor 4.
- Cards (sample): ① 推荐 · 最少走路 / Best for you · Least walking — 23 分钟, walk 3 › bus 139 › walk 2; 走路 5 分钟 · 不用转车 · 没有楼梯 · 6 站. ② 最快 / Fastest — 16 分钟, walk 6 › NS › walk 5; 走路 11 分钟 · 不用转车 · 有电梯 · 1 站.
- Notes: 巴士时间来自实时信息，可能会有几分钟变化。/ Bus times are live but can change by a few minutes. Single option: 这里很近，只有一条好走的路。/ It's close by. There's one easy way.
- Top right: 帮忙 Help.
- Loading (build): 我在帮你找路… / Finding the way for you… with the Question Path drawing loop.
- No route (build): 现在没有合适的公共交通。要给司机看地址吗？/ No good bus or train right now. Show a driver the address? → H10.
- **Back goes to:** H2 (or H1 if opened from a tile). Baselines: `H3-two`, `H3-one`, `H3-loading`, `H3-none`.

### H4 Trip overview
- Title 去 陈笃生医院 / To Tan Tock Seng Hospital · 23 分钟 · 上午 10:39 到达.
- Fitted north-up map with the route. Timeline steps: 走到 Blk 79 巴士站 · 大约 3 分钟 → 坐 139 号巴士，坐 6 站 · 在 Tan Tock Seng Hosp 下车 → 走到 陈笃生医院 · 大约 2 分钟 → 到达 陈笃生医院 · 正门.
- Dock: **开始出发 / Start** · quiet link 出发前，告诉家人 / Tell family before I go (→ H7).
- **Back goes to:** H3. Baselines: `H4-bus`, `H4-mrt`.

### H5 Live guidance (follow-me)
- Top: 结束 End (SR 结束行程) · voice toggle (SR 关掉声音 / 打开声音) · 帮忙 Help.
- Map heading-up, user dot at 34% height. Controls: follow toggle (SR 看全程 / 跟着我走) · share (SR 分享我的行程).
- Step card examples:
  - Walk: 走到 Blk 79 巴士站 [Blk 79] · 还有 120 米，大约 2 分钟.
  - Wait: 在这里等 139 号巴士 · 站名牌上写着：[Blk 79] · chip `139 · 3 分钟 · ● 实时 · 下一班 12 分钟`.
  - Bus here: 139 号巴士来了！· 看清楚车头的号码，再上车。
  - Ride: 坐着就好，还有 4 站 · 下一站：Opp Shaw Plaza · 下车前我会提醒你。· stop dots.
  - Alight: 到站了，请下车 · 慢慢来，扶好扶手。
  - MRT wait: 在月台等地铁 · [NS · NS19] 往 Marina South Pier 方向.
- States: walking, waiting, bus-here, riding, alight, sharing (pill), muted, overview mode, GPS weak (build: 位置不太准，跟着站牌走 / Location is rough, follow the signs), offline (build: 没有网络，行程继续 / No internet, trip continues).
- **Back goes to:** opens "End this trip?" sheet (D8). 继续行程 is primary; Back again keeps the trip.
- Baselines: `H5-walk`, `H5-wait`, `H5-bushere`, `H5-ride`, `H5-overview`, `H5-sharing`.

### H6 Get off at the next stop (state of H5)
- 下一站下车 / Get off at the next stop · 请现在按铃 / Press the bell now (train: 车门开了就下车 / Get off when the doors open) · sign chip `Tan Tock Seng Hosp · 陈笃生医院 巴士站` · **知道了 / OK, got it**.
- `role=alertdialog`, assertive announcement, haptic `getoff`.
- **Back goes to:** End-trip sheet. The alert stays; OK dismisses it.
- Baselines: `H6-bus`, `H6-train`.

### H7 Share my trip (sheet)
- Copy as in §5.8: 让家人知道你在哪里 / Let family see where you are · 他们会看到你的位置和到达时间。你到达后，分享会自动停止。· 告诉谁？ 美玲 女儿 / 志明 儿子 · 用 WhatsApp 发送 · 发短信 · 看看家人会看到什么 · 只分享这一次的行程，不会保存你的位置。
- Toast on send: 已分享给 美玲。她现在看得到你。/ Shared with Mei Ling. They can see you now.
- Sharing state: 正在分享给 美玲 · 到达后自动停止 · 看看家人会看到什么 · 停止分享 → toast 已停止分享。
- **Back goes to:** H5 or H4 (closes the sheet). Baselines: `H7-choose`, `H7-sharing`.

### H8 What family sees (family web page; preview inside the app)
- Header: 家人看到的画面 / What your family sees · URL chip.
- Card: 妈妈正在去 陈笃生医院 / Mum is on her way to Tan Tock Seng Hospital · **约 上午 10:39 到达** · 还有 16 分钟 · status pill (在 139 号巴士上，还有 3 站 / On bus 139, 3 stops to go) · live map · 刚刚更新 · 每 15 秒更新一次.
- Button: 打电话给妈妈 / Call Mum. Footer: 这个链接在妈妈到达后会失效。/ This link stops working once Mum arrives.
- States (build): not started (妈妈还没出发), arrived (妈妈已经到达 …), link expired, signal lost > 2 min (最后位置：… 5 分钟前 / Last seen … 5 min ago).
- **Back goes to:** H7 (preview) · the family web page has no app Back.
- Baselines: `H8-walk`, `H8-bus`, `H8-arrived`.

### H9 Help (sheet)
- 别担心，我来帮你 / Don't worry, I'm here to help.
- Options: 打电话给美玲 · 女儿 · 一按就打 / 给司机看地址 · 大字显示，方便叫德士 / 我在哪里？· 显示你现在的位置 / 帮我重新找路 · 从你现在的地方开始 (trip only) / 紧急情况 · 拨打 995.
- Call overlay: 正在打电话给 美玲… · 挂断. In the build this opens `tel:` directly.
- **Back goes to:** the screen underneath. Baselines: `H9-trip`, `H9-home`.

### H10 Show the driver
- Tabs: 去目的地 / Where I'm going (trip only) · 我的家 / My home · 我在哪里 / Where I am.
- Always-light card: **Please take me to** / 请送我去 · `Tan Tock Seng Hospital / 11 Jalan Tan Tock Seng` · saffron `Singapore 308433` · 陈笃生医院 正门.
- The build keeps the screen awake (Wake Lock) and allows landscape.
- **Back goes to:** H9. Baselines: `H10-dest`, `H10-home`, `H10-here`.

### H11 Off route (state of H5)
- Banner: 没关系，你走了另一条路 / That's okay — you took another way · 我在帮你找新的路… → 找到了新的路 · 跟着地图上的点走就好。
- Haptic `gentle` → `confirm`. Voice speaks both lines.
- **Back goes to:** End-trip sheet. Baselines: `H11-searching`, `H11-found`.

### H12 Arrival
- Animated mark · **到了！/ You're here!** · 陈笃生医院 · 用了 23 分钟 / Took 23 min · 你做得很好 / Well done.
- If shared: ✓ 美玲已经知道你到了 / Mei Ling knows you have arrived. Otherwise: secondary 告诉美玲我到了 / Tell Mei Ling I've arrived → ✓ 已经告诉美玲了。
- Dock: **完成 / Done** · quiet 回家的路 / Route home.
- **Back goes to:** H1 (the trip stack is replaced). Baselines: `H12-shared`, `H12-notshared`, `H12-rm` (reduce motion).

### H13 Settings (sheet)
- 语言 Language: 中文 / English · 字体大小: 100 / 125 / 150 / 200% · 颜色: 跟手机 / 白天 / 夜间 · 语音提示: 开 / 关 · 震动提示: 开 / 关 · 减少动画: 跟手机 / 开 / 关.
- *The prototype-only "原型演示控制" block is not in the build.*
- **Back goes to:** H1. Baselines: `H13-*`.

**End-trip sheet (from Back or ✕ in H5):** 要结束这次行程吗？/ End this trip? · 结束后，语音和地图提示会停止。· **继续行程 / Keep going** (primary) · 结束行程 / End trip → H1.

## 7. Parity checklist (prototype ↔ build)
- [ ] Tokens identical: colour, type, space, radii, motion, haptics.
- [ ] Back stack per frame, as above, including the D8 end-trip guard.
- [ ] Every string from frames, in both languages. No new copy without Creative.
- [ ] 200% text: no clipping, no horizontal scroll (automated scrollWidth check).
- [ ] All targets ≥ 56px (automated).
- [ ] Get-off alert: visual + voice + `getoff` haptic + assertive announcement.
- [ ] Reduce motion: no pulses or petals, cross-fades only.
- [ ] Map: OneMap tiles + attribution "Map data © OneMap / Singapore Land Authority"; saffron destination dot; line tags never colour-only.
- [ ] Family page H8 matches status copy and expires on arrival.
