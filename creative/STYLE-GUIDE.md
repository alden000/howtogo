# 怎么去? — Style guide v1.2

Source of truth for the build. **Build strictly to these tokens and frames:** no raw values outside the token sheet, and no improvised UI. New tokens need Director approval. The prototype `creative/prototype/index.html` implements every token below in its `:root` block. Brand rationale lives in `docs/02-creative-direction.md`.

---

## 0. Logo — B · 去 Seal (owner pick, D-8 / D17)

**The mark:** the character 去 ("go") cut as a white-on-persimmon chop seal. Its last stroke, 厶's turn, is drawn as a path that rises toward a **saffron dot**: the 点 of 去 doubles as the destination, "arrived". The dot is the signature and is always saffron `#FFD23F` (never recoloured, except in mono). Seal `#9A3412` (`c-primary` light), glyph `#FBF5EC` (`c-canvas` light). The same colours in dark mode: the seal is a solid object.

| File (`logo/final/`) | Use |
|---|---|
| `icon.svg` → `icon-192.png`, `icon-512.png` | Manifest `purpose: any`. Rounded square (rx 112/512) with an inner chop frame line (12/512); glyph at 84%. |
| `maskable.svg` → `maskable-192.png`, `maskable-512.png` | Manifest `purpose: maskable`. Full bleed, no frame; glyph at 74%, wholly inside the central 80% circle. Checked under circle and squircle masks. |
| `apple-touch-icon-180.png` | From the maskable art (iOS applies its own corners). |
| `favicon.svg` → `favicon-32.png`, `favicon-16.png` | Pixel geometry: every bar on a 32/512 grid (1px at 16, 2px at 32), equal 64/512 strokes, no frame line. Use this geometry for every rendering ≤ 48px (top-bar wordmark too). |
| `mono.svg` | One colour (`currentColor`), glyph and dot knocked out. Android notification/badge, print, embossing. |
| `wordmark.svg` | Mark + "怎么去?" in Noto Sans SC 900, gap = 0.17 × mark. In the app the text is live HTML, not the SVG text. |
| `check.png` | Check sheet: 16/32/48/192 on paper, dark and white; circle and squircle masks; mono 48/24; 8× pixel zoom of 16/32. |
| `build.js` | Generates all of the above from one geometry (`node creative/logo/build.js`, Playwright). Edit the geometry there, never the SVGs by hand. |

Geometry (master, 512 grid): 土 = vertical `M256 96V204` (w 56), short bar `M196 128H316` and long bar `M100 216H412` (w 50: horizontals 6 units lighter so they read optically equal), 厶 path `M262 292L178 408L304 396` (w 56, the last arm rises 12 units toward the dot), dot `c(388,392) r44`. Optical centre is 6 units below the geometric centre.
Clear space = the dot's diameter on every side. Minimum size 16px. Don't rotate, outline, recolour the dot, put the glyph on a non-persimmon seal, or set the seal on `c-primary` dark (`#FF9466`); on persimmon or busy backgrounds use mono.
Earlier concepts (A, C, D and the B sketch) stay in `logo/` for the record only; `logo/a-*` are retired.

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
  2. **Arrival (H12) — "the seal stamps, the dot lands":** the seal stamps down (from scale 1.35, −6°, `ease-spring` 0.5s at 0.15s) with a persimmon ink ring spreading from its edge (0.7s) → 厶's path draws (0.5s at 0.6s) → the saffron dot drops onto the end of the path with the spring (0.7s at 1.1s) → a saffron ring ripples out of the dot (1.2s at 1.6s) → 18 petals in persimmon, saffron and jade drift outward (1.6–2.4s) → text rises (staggered 150ms). Haptic `arrive`. Voice: 到了！
  3. **Bus is here:** the arrival chip flips to saffron, plus haptic `attention`.
  4. **Live:** the user-dot pulse (2s) and the "live" dot blink (1.6s) show that data is fresh.
- **Reduce motion** (OS setting, or Settings → 减少动画): all transitions become a 120ms cross-fade. Pulses, petals and ripples are removed. The alert appears without bounce and the edge glow is static. The map camera snaps. The arrival seal is shown complete (stamped, path drawn, dot in place). Haptics and voice are unchanged.

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
Contents: tag pill (best = primary fill with a check: "推荐 · 最少走路") → duration (`duration` + unit) and "上午 10:39 到达" → leg chain (walk chip `walk-icon + min`, bus badge, line tag, chevrons between) → dashed divider → facts row (walk total, changes, stops; stairs/lift facts hidden until M3 data, D-8) → "选这条路 ›" in primary-text.
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
A right-edge column of 56px round buttons that floats 14px above the step card (from M2 the top bar is a solid band and the map sits between it and the card: see 6c.0): **Follow / See whole trip** toggle (filled primary when following) and **Share**.
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
- Cards (sample): ① 推荐 · 最少走路 / Best for you · Least walking — 23 分钟, walk 3 › bus 139 › walk 2; 走路 5 分钟 · 不用转车 · 6 站. ② 最快 / Fastest — 16 分钟, walk 6 › NS › walk 5; 走路 11 分钟 · 不用转车 · 1 站.
- **Stairs/lift facts hidden (owner decision D-8):** "没有楼梯 / No stairs" and "有电梯 / Lifts all the way" are not shown until a data source exists (M3 research). The facts row is walk total · changes · stops.
- Notes: 巴士时间来自实时信息，可能会有几分钟变化。/ Bus times are live but can change by a few minutes. Single option: 这里很近，只有一条好走的路。/ It's close by. There's one easy way.
- Top right: 帮忙 Help.
- Loading, no route, too close, outside SG, error, busy, offline: see **6b F3**.
- No route (build): see 6b F3 `none` (M4 adds the "show a driver" option → H10).
- **Back goes to:** H2 (or H1 if opened from a tile). Baselines: `H3-two`, `H3-one`, `H3-loading`, `H3-none`.

### H4 Trip overview
- Title 去 陈笃生医院 / To Tan Tock Seng Hospital · 23 分钟 · 上午 10:39 到达.
- Fitted north-up map with the route. Timeline steps: 走到 Blk 79 巴士站 · 大约 3 分钟 → 坐 139 号巴士，坐 6 站 · 在 Tan Tock Seng Hosp 下车 → 走到 陈笃生医院 · 大约 2 分钟 → 到达 陈笃生医院 · 正门.
- Dock: **开始出发 / Start** (only when feature flag `guide` is on; OQ5, see 6b F3) · quiet link 出发前，告诉家人 / Tell family before I go (→ H7, M4).
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

## 6b. M1 states

Frames for the M1 build (`docs/requirements/M1-foundation.md`). They reuse the §1 tokens and §5 components only. **No new colour, type, space, radius or motion tokens.** The only additions are eight icons, listed at the end for Director approval.

Shared rules (as §6, plus):
- Frame IDs are `F1`–`F8` so they don't clash with H1–H13. Baselines: `M1-F{n}-{state}-{light|dark}-{100|200}-{zh|en}.png` at 390×844 DPR 2. QA also runs 150% × browser zoom 200% (AC 9).
- **State panel (`.state`)** is the one layout for every empty, error and offline state: a 72px `c-surface-2` icon tile (`r-m`, 40px `c-ink` icon) → `headline` → `body` in `c-ink-2` → button stack (primary `tap-hero` 72px, secondary 56px, `s-3` apart). Left-aligned, `s-5` gutters. At 200% it simply grows taller and the page scrolls. The headline is announced once via a polite live region. Focus does not move.
- No red anywhere in these states. `c-danger` stays 995-only (D-rule §1.1). Errors are calm: ink icons, "try again", never "failed" or "error".
- Exact copy below is final. `{x}` = variable.

### F1 First run (one time, 3 pages, skippable)
- Shown once, before Home, on first launch (flag in localStorage, try/catch; if storage throws, show it once per session). Never shown again after Skip or Done.
- Every page: progress dots top-left (SR "第 {n} 步，共 3 步" / "Step {n} of 3") and **跳过 / Skip** top-right (quiet text button, 56px; SR "跳过，以后可以在设置里改" / "Skip. You can change this later in Settings"). Skip → Home with defaults (中文, 100%, no name, no Home).
- **Page 1: language and text size.**
  - Title (always bilingual on this page, both lines `title`): 你好！/ Hello!
  - 语言 / Language: two big radio cards (`r-l`, 72px), each written in its own language with a matching `lang` attribute: **中文** · **English**. Tapping re-renders the page at once.
  - 字体大小 / Text size: 4 radio cards: 标准 100% / Standard · 大 125% / Large · 特大 150% / Extra large · 最大 200% / Largest. The whole page re-renders at the chosen size; that **is** the live preview. A preview card under it reads 早上好！今天想去哪里？/ Good morning! Where would you like to go today? (`display` role).
  - At 200% the radio grid becomes 1 column (same `auto-fit` rule as `.tile`).
  - Primary: **下一步 / Next**.
- **Page 2: name (optional).**
  - Title: 怎么称呼你？/ What should we call you?
  - Body: 我们会用它跟你打招呼，比如"早上好，林阿姨"。只保存在这部手机里。/ We'll use it to greet you, like "Good morning, Auntie Lin". It stays on this phone only.
  - Field label 称呼 / Name · placeholder 例如：林阿姨 / e.g. Auntie Lin · max 20 characters, trimmed.
  - Primary **下一步 / Next** (an empty field counts as skip) · secondary **不用了 / No thanks**.
  - Fallback: with no name the H1 greeting is just 早上好 / Good morning (下午好 / 晚上好 by hour), with no comma.
- **Page 3: Home (optional).**
  - Title: 你的家在哪里？/ Where do you live?
  - Body: 设好了，以后一按就带你回家。/ Set it once, and one tap takes you home.
  - Three choices, as stacked 72px rows with icons: **搜索地址或邮区编号 / Search an address or postcode** (search) → H2 in set-home mode (title 找你的家 / Find your home) · **用我现在的位置 / Use where I am now** (locate) → F2 if permission is not yet granted, then reverse geocode · **以后再说 / Later** (quiet).
  - Confirm card (surface, `r-l`, home tint icon): 家：{label} / Home: {label} · **对，就是这里 / Yes, that's it** (primary) · **不对，重新找 / No, search again**. If reverse geocode fails the label is 我现在的位置 / Where I am now.
  - Done → Home with toast 设好了！/ All set!
- **Back goes to:** page n−1; from page 1 it leaves the app (first run is the root). From set-home search → page 3.
- Baselines: `F1-lang`, `F1-lang-200` (live preview at 200%), `F1-name`, `F1-name-filled`, `F1-home`, `F1-home-confirm`.

### F2 Location permission
- **Explainer (sheet, `role=dialog`)** appears on the first tap of 我的位置 / Use where I am now, **before** the browser prompt. Never at launch.
  - 72px `c-primary-soft` tile with the locate icon.
  - Title: 让我知道你在哪里 / Let me know where you are
  - Body: 这样我才能从你身边开始找路。手机接下来会问你，请按"允许"。/ Then I can find the way from where you are. Your phone will ask next. Please tap "Allow".
  - Lock line (lock icon, `caption`): 你的位置只用来找路，不会保存，也不会给别人。/ Your location is only used to find the way. It isn't saved or shared.
  - **好的 / OK** (primary → calls geolocation) · **不用，我打地方名字 / No, I'll type the place** (secondary → H2).
- **Denied (sheet)** when the permission is `denied` or the error code is 1:
  - Title: 手机没有让我看你的位置 / Your phone isn't sharing your location
  - Body: 没关系，你还是可以打出地方名字找路。/ That's okay. You can still type a place name.
  - Disclosure **怎么打开？/ How do I turn it on?** Tabs **安卓手机 / Android** · **iPhone**, pre-selected from the user agent. Steps are an `<ol>`, `body` size, number in a 32px `c-primary-soft` disc:
    - Android (Chrome): 1. 按网址左边的小图标（像两条横线或一把锁）。/ Tap the small icon left of the web address (it looks like two lines or a lock). 2. 按"权限"或"网站设置"。/ Tap "Permissions" or "Site settings". 3. 按"位置"，选"允许"。/ Tap "Location" and choose "Allow". 4. 回到这里，按"再试一次"。/ Come back here and tap "Try again".
    - Android, installed app: 1. 长按主屏幕上的 怎么去? 图标。/ Press and hold the 怎么去? icon on your home screen. 2. 按"应用信息"→"权限"→"位置"。/ Tap "App info" → "Permissions" → "Location". 3. 选"使用应用时允许"。/ Choose "Allow only while using the app". 4. 回到这里，按"再试一次"。
    - iPhone (Safari): 1. 在 Safari 地址栏按"aA"按钮。/ In Safari, tap the "aA" button in the address bar. 2. 按"网站设置"。/ Tap "Website Settings". 3. 按"位置"，选"允许"。/ Tap "Location" and choose "Allow". 4. 回到这里，按"再试一次"。 Fallback line: 还是不行？打开手机"设置"→"隐私与安全性"→"定位服务"，打开它，再把"Safari 网站"设为"使用 App 期间"。/ Still not working? Open the phone's Settings → "Privacy & Security" → "Location Services", turn it on, then set "Safari Websites" to "While Using the App".
  - **再试一次 / Try again** (primary) · **打地方名字 / Type a place** (secondary → H2).
- **Unavailable or timeout** (not denied): inline note under the From field: 现在找不到你的位置。请再试一次，或打出地方名字。/ Can't find your location right now. Try again, or type a place. The From field falls back to "我的位置 / My location" (AC 26).
- **Back goes to:** closes the sheet → the screen underneath.
- Baselines: `F2-explainer`, `F2-denied-android`, `F2-denied-ios`.

### F3 Route options states (H3)
Title and From line stay as in H3 in every state. **Back goes to** the same place as H3.
| State | Icon | Headline | Body | Buttons |
|---|---|---|---|---|
| `loading` | — | 我在帮你找路… / Finding the way for you… | After 6 s add: 还在找，请稍等一下。/ Still looking, just a moment. | none |
| `none` | route | 现在没有合适的巴士或地铁 / No good bus or train right now | 可以晚一点再试，或者换个地方。/ Try again a bit later, or choose another place. | 再试一次 / Try again · 换个地方 / Choose another place (→ H2). M4 adds 给司机看地址 / Show a driver the address (→ H10). |
| `close` (< 200 m) | walk | 很近了，走路就到 / It's very close, you can walk | 大约 {m} 米，走路大约 {min} 分钟。/ About {m} m, about {min} min on foot. | 看走路的路线 / Show the walking way (→ route detail with one walk step) · 换个地方 / Choose another place |
| `outside` (destination) | locate | 这个地方不在新加坡 / That place isn't in Singapore | 怎么去? 只能在新加坡找路。请换一个地方。/ 怎么去? can only find ways in Singapore. Please choose another place. | 换个地方 / Choose another place |
| `outside` (my location) | locate | 你现在好像不在新加坡 / You seem to be outside Singapore | 请打出你出发的地方。/ Please type where you're starting from. | 打出发的地方 / Type where I'm starting |
| `error` (upstream / timeout, AC 19) | refresh | 现在找不到路 / Can't find the way right now | 可能是网络慢了，请再试一次。/ The connection may be slow. Please try again. | 再试一次 / Try again · 换个地方 / Choose another place |
| `busy` (429, AC 20) | clock | 现在用的人很多 / Lots of people are using it right now | 请等一会儿，再试一次。/ Please wait a moment, then try again. | 再试一次 / Try again |
| `offline` | wifi-off | 没有网络 / No internet | 连上网络后，我会自动再找一次。/ When you're back online, I'll look again by myself. | 再试一次 / Try again. Auto-retries on the `online` event. |
- **Loading skeleton:** 2 card-shaped blocks (`r-l`, `c-surface-2`, the height of a real card at the current text size) under the line. They breathe opacity 1 → .55 → 1 over 1.6 s ease-in-out (the live-dot timing). Reduce motion: static. A small seal mark sits beside the line, and its saffron dot pulses on the same 1.6 s cycle (this replaces the old Question Path loop). The `aria-busy` list carries SR "正在找路" / "Finding routes"; the skeleton is `aria-hidden`.
- **Route facts (owner decision D-8):** cards show walk total · changes · stops only. **"没有楼梯 / No stairs" and "有电梯 / Lifts all the way" are hidden** until M3 has a data source. See H3.
- **Start (OQ5):** H4's **开始出发 / Start** is rendered only when feature flag `guide` is on (off in M1, on in M2). With the flag off there is no dock button, no badge and no placeholder; the step list simply ends with the arrival step.
- Baselines: `F3-loading`, `F3-none`, `F3-close`, `F3-outside`, `F3-error`, `F3-busy`, `F3-offline`.

### F4 Search states (H2)
- `error`: state panel under the field, icon refresh. 现在找不到，请再试一次 / Can't search right now. Please try again. · **再试一次 / Try again**. What was typed stays in the field.
- `offline`: icon wifi-off. 没有网络，暂时找不到新的地方。/ No internet, so I can't look up new places right now. · 连上网络后会自动再找。/ I'll look again once you're back online. The Recent list stays visible below it under 最近去过 / Recent.
- `busy` (429): same panel as F3 `busy`.
- **Back goes to:** as H2. Baselines: `F4-error`, `F4-offline`.

### F5 Toasts
Component §5.7 toast (ink card, `role=status`, 3.6 s, 110px above the bottom, wraps at 200%). One at a time; a newer toast replaces the older one. If offline → online happens within 3 s, show neither.
| Name | Icon | zh | en | When |
|---|---|---|---|---|
| `updated` | check | 已更新到新版本 | Updated to the new version | First launch after a service-worker update (AC 4) |
| `offline` | wifi-off | 没有网络了。已经打开的内容还能看。 | You're offline. What's already open still works. | `offline` event |
| `online` | check | 网络恢复了 | Back online | `online` event after `offline` |
| `busy` | clock | 现在用的人很多，请等一会儿再试。 | Lots of people are using it. Please try again in a moment. | Any 429 not shown as a state panel |
| `home-set` | check | 设好了！ | All set! | Home saved |
| `cleared` | check | 已经清除了 | Cleared | Recent places cleared |
| `installed` | check | 已经放到主屏幕了 | Added to your home screen | `appinstalled` |
| `copied` | check | 已经复制了。可以贴到 WhatsApp 发给我们。 | Copied. You can paste it into WhatsApp to send it. | Report fallback |
| `report` | check | 谢谢你的报告！ | Thanks for the report! | Web Share resolved |
While offline, H1 also shows its persistent note (H1 states). Baselines: `F5-updated`, `F5-offline`, `F5-online`, `F5-busy`.

### F6 Settings (H13 extended to a full screen for M1)
Groups in this order; each row is 56px+ with label, current value in `c-ink-2`, chevron.
1. **我 / Me:** 称呼 / Name (value or 没有设 / Not set) → sheet like F1 page 2, buttons **保存 / Save** · **删除称呼 / Remove name** · 家 / Home (value = label or 没有设 / Not set) → H2 set-home mode; when set, a sheet with **换个地址 / Change address** · **删除 / Remove**.
2. **看和听 / Display:** 语言 · 字体大小 · 颜色 · 减少动画 (as H13). 语音提示 and 震动提示 are hidden while flag `guide` is off.
3. **记录 / History:** 清除最近去过的地方 / Clear recent places → confirm sheet 要清除最近去过的地方吗？/ Clear your recent places? · 只会清除这部手机上的记录。/ This only clears them on this phone. · **清除 / Clear** (primary) · **不用了 / Cancel**. With nothing to clear the row shows 没有记录 / Nothing to clear and is `aria-disabled` (still 56px).
4. **这个应用 / This app:** 安装到主屏幕 / Add to Home screen (hidden when running standalone) · 报告问题 / Report a problem · 关于和隐私 / About & privacy. Under the groups: `caption` 版本 {v} / Version {v}.

**Install sheet** (title 把 怎么去? 放到主屏幕 / Put 怎么去? on your home screen · body 以后一按图标就能打开，像普通应用一样。/ Then one tap on the icon opens it, like any other app. · 72px app icon preview labelled 怎么去?):
- Chrome with a captured `beforeinstallprompt`: **安装 / Install** → native prompt. Dismissed → nothing else, no nagging.
- Android without the prompt: 1. 按右上角的 ⋮（三个点）。/ Tap ⋮ (three dots) at the top right. 2. 按"添加到主屏幕"或"安装应用"。/ Tap "Add to Home screen" or "Install app". 3. 按"安装"或"添加"。/ Tap "Install" or "Add".
- iPhone (Safari): 1. 按分享按钮（一个方框，上面有箭头）。/ Tap the Share button (a square with an arrow pointing up). Inline glyph `ios-share`. If you can't see it: 先按右下角的"⋯"。/ First tap "⋯" at the bottom right. 2. 往下滑，按"添加到主屏幕"。/ Scroll down and tap "Add to Home Screen". 3. 按右上角的"添加"。/ Tap "Add" at the top right.
- Steps use the same numbered `<ol>` as F2.

**Report a problem sheet:**
- Title 报告问题 / Report a problem · body 按一下就能把问题报告发给我们。里面没有你的位置、地址或搜索内容。/ One tap sends us a problem report. It never contains your location, addresses or searches.
- **发送报告 / Send report** (primary, one tap) → Web Share (text) → toast `report`. No Web Share → copy to clipboard → toast `copied`.
- **看看会发送什么 / See what's sent** (quiet) → expands a `c-surface-2`, `r-m` box (max-height 40vh, scrolls, `caption` size) with the exact redacted text (AC 42).
- **About & privacy screen** (title 关于和隐私 / About & privacy):
  - Wordmark + 版本 {v}.
  - 地图和数据 / Maps and data: 地图和地址来自 OneMap，新加坡土地管理局。/ Maps and addresses come from OneMap, Singapore Land Authority. OneMap logo + `Map data © OneMap / Singapore Land Authority`. 交通资料：Contains information from LTA DataMall which is made available under the terms of the Singapore Open Data Licence version 1.0. (Licence line stays in English in both languages.)
  - 你的隐私 / Your privacy (bullets):
    - 不用注册，也不用账号。/ No sign-up, no account.
    - 你的称呼、家和最近去过的地方只存在这部手机里。/ Your name, Home and recent places stay on this phone only.
    - 找路时，起点和终点会发给 OneMap 算路线，我们不保存。/ To find a route, the start and end are sent to OneMap to work it out. We don't keep them.
    - 我们的记录里没有你的位置、地址或搜索内容。/ Our logs never contain your location, addresses or searches.
    - 报告问题时，发不发、发给谁，由你决定。/ If you report a problem, you decide whether to send it and to whom.
    - 没有广告，不追踪你。/ No ads, no tracking.
    - 你随时可以在设置里删除称呼、家和最近去过的地方。/ You can remove your name, Home and recent places in Settings at any time.
    - 有问题请联系：{contact} / Questions? Contact {contact}. (**Owner to supply** the contact, the PDPA contact point.)
  - **No open-source licences screen** (owner preference).
- **Back goes to:** sub-sheets → Settings; Settings → H1; About → Settings.
- Baselines: `F6-settings`, `F6-name`, `F6-clear`, `F6-install-android`, `F6-install-ios`, `F6-report`, `F6-about`.

### F7 Update notice
- When a new service worker is waiting, Home (and only Home) shows the §5.7 info banner (jade rule, refresh icon, no spinner): **有新版本 · 更新** / **New version ready · Update**. The whole banner minus ✕ is one 56px button (SR "有新版本，按一下更新" / "New version ready. Tap to update"). ✕ is 56px (SR 以后再说 / Later).
- Tap → activate + reload → toast `updated`. Ignored or ✕ → it applies on the next launch anyway (AC 4). It never auto-dismisses and never appears mid-search or during a trip.
- Announced once, polite. Baseline: `F7-update`.

### F8 M1 Home mapping (H1 → AC 22, Creative recommendation for Director)
- **From** = the H1 location pill: 从：我的位置 / From: My location (or the reverse-geocoded label). Tap → H2 in from mode (SR "出发地：{label}，按一下更改" / "Starting from {label}. Tap to change").
- **To** = the H1 search button. **Find route** happens on picking a result, so there is no extra button press.
- **Swap** (AC 22) moves to H3's header as a 56px **对调 / Swap** button (route icon rotated 90°), where it means something. *This deviates from AC 22 wording; Director to rule.*
- **Take me home** dock: shown only when Home is set. With no Home, the dock is **设好你的家 / Set your Home** (→ set-home mode).
- **Recent destinations:** up to 5 rows under 最近去过 / Recent, beneath My places.
- Font size control: M1 AC 9 asks for 100/125/150; we keep 200% too (§1.2), and QA covers 150% × zoom 200%.

### Icons needing Director approval (same grid and stroke as §1.4; no other new tokens)
`wifi-off` (offline) · `refresh` (error, update) · `install` (arrow into tray) · `ios-share` (square with up arrow, only to mirror the iOS button in instructions) · `info` (About) · `trash` (clear recent) · `person` (name) · `report` (speech bubble with "!"; or reuse `message`).

## 6c. M2 guided-trip frames

Frames for the M2 build (`docs/requirements/M2-guided-trip.md`, OQ1–OQ10 at PM defaults). They reuse the §1 tokens and the §5/§6b components. **New items for Director approval are listed at the end (one colour token, five icons, one component). Nothing else is new.**

Shared rules (as §6 and §6b, plus):
- Frame IDs keep the H numbers where the frame is a state of an existing screen (H5, H6, H6b, H11, H12) and use **G1–G7** for new ones: G1 pocket view, G2 multi-stop builder, G3 waypoint arrival, G4 resume, G5 manual controls, G6 end-current-trip sheet, G7 voice help sheet. Baselines: `M2-{frame}-{state}-{light|dark}-{100|200}-{zh|en}.png` at 390×844 DPR 2. Pocket view (G1) is dark only, so it has no `light` baselines.
- "Spoken" lines are said in the **trip language** fixed at start (AC 22, OQ10). The on-screen line is the same words. Voice never says anything the screen does not show.
- Live regions: **polite** = the `#live` region (`aria-live="polite"`). **Assertive** = `role="alertdialog"` plus the `#live2` region. One announcement per moment, never repeated by both regions.
- Haptic names are the canonical list in **6c.13**. No other names exist.
- No red anywhere except the 995 button (§1.1). No "error", "failed" or "GPS" in copy (banned list in the creative direction).
- **Reduce motion** everywhere below: transitions become the 120 ms cross-fade, ripples and bell swing are removed, the edge glow is static at full width. Voice and haptics are unchanged.

### 6c.0 H5 layout fix: nothing covers the map (D-8 S4, AC 9)
The v1.0 top bar was a gradient laid over the map, so the End button sat on top of station labels. From M2:
- **Top band (`.top`)** is a solid strip, not an overlay: `c-canvas` background, `e-1` shadow on its bottom edge, padding `s-3` `s-4`. Row 1 is 结束 End · voice toggle · 帮忙 Help (unchanged). Further rows, only when present and in this order, go **inside the band**: share pill (§5.6), H11 banner (6c.8), resume voice bar (6c.6). The band grows; it never overlaps the map.
- **Map viewport** = the rectangle from the band's bottom edge to the step card's top edge. In MapLibre, size the map container to the full screen and set `map.setPadding({ top: bandHeight, bottom: cardHeight })` on every band or card resize (ResizeObserver), **and** clip symbol rendering to that rectangle by sizing the canvas container to it. The step card's `r-xl` corners show `m-land` behind them, so the join looks continuous.
- **Puck:** horizontally centred, at **66% down the map viewport** (34% up from its bottom edge; this replaces "34% of the screen" in AC 13 and stays correct at 200%). It is never closer than 72 px to either edge of the viewport; if the viewport is shorter than 144 px (200% text with a tall card), the puck is centred in it.
- **Map controls (`.mapctl`)** float at the right edge of the viewport, 14 px above the card. They are the only things over the map. Labels under them are acceptable; the puck never is (it is centred).
- **QA check (AC 9):** for every H5 state at 100% and 200%, the puck rect and every rendered station/stop label rect intersect neither the band rect nor the card rect. Zero overlap.
- **Trip notes** (6c.10–6c.12) sit at the top of the step card, not over the map.

### 6c.1 H6 → H6b Get off now (bus and train)
H6 is unchanged (§6, 5.7): saffron bottom panel "下一站下车 / Get off at the next stop". **H6b** is the second, stronger stage when the engine sends `get_off_now`. It is visibly different so the user knows something changed: **H6 = saffron panel, "get ready"; H6b = full ink takeover with saffron type, "go now".**

Layout (H6b, both themes, the same colours):
- A full-height sheet over the whole screen below the top band (the band stays, so End and Help remain reachable). Background `c-on-saffron` `#1D1915`; text `c-saffron` `#FFD23F` (12.10:1, AAA).
- **Edge glow:** `c-saffron` 10 px inset ring around the whole viewport, including the band, on top of everything (`z` above the sheet, `pointer-events: none`), breathing 1.2 s (static under reduce motion). Against the ink sheet the saffron glow is fully visible.
- Content, top to bottom, left-aligned, `s-5` gutters: 112 px saffron disc with the ink `exit` icon (64 px; new icon) and the two ripple rings from H6 → title (`alert` role, 2.4 rem/900) → instruction line (`headline` 1.2 rem/700) → sign chip (saffron fill, ink text, `r-s`; the exact sign text) → spacer → **知道了 / OK, got it** (saffron fill, ink text, `tap-hero` 72 px, full width, check icon), pinned to the bottom.

| | zh | en |
|---|---|---|
| Title | 到站了，请下车 | This is your stop. Get off now |
| Bus line | 车停稳了再站起来，慢慢下车。 | Wait until the bus stops, then get off slowly. |
| Train line | 车门开了就下车，小心空隙。 | Get off when the doors open. Mind the gap. |
| Sign chip (bus) | `{stop sign}` · `{zh name}` 巴士站 | `{stop sign}` bus stop |
| Sign chip (train) | `{station}` `{code}` · `{zh name}` 站 | `{station}` `{code}` station |
| Button | 知道了 | OK, got it |

How it follows H6:
- If H6 is showing (acknowledged or not) when `get_off_now` arrives, the saffron panel **grows** into the full ink sheet (height from panel to full, background saffron → ink, `d-sheet` `ease-spring`; title cross-fades `d-base`). Reduce motion: H6b replaces H6 with the 120 ms cross-fade.
- If both conditions arrive on one fix, only H6b shows (engine rule).
- H6 is **never shown after** H6b on the same ride.

Moments:
| Moment | Haptic | Voice (trip language) | Screen reader |
|---|---|---|---|
| H6 shown | `getoff` | "下一站下车。" then after 2.2 s "请现在按铃。" (train: "车门开了就下车。") / "Get off at the next stop." then "Press the bell now." (train: "Get off when the doors open.") | assertive: title + line, once |
| H6b shown | `getoff`, then `getoff` again after 800 ms | High priority, interrupts: "到站了，请下车。" then after 2.2 s the bus/train line | assertive: "到站了，请下车。{line}" / "This is your stop. Get off now. {line}" |
| **Escalation** (OQ9): the alert is not acknowledged 20 s after it was shown | `getoff` once | The same two lines once more | assertive, the same text once more |
| OK tapped | `confirm` | none | focus moves to the step card headline; polite: nothing (the card already says it) |
| Ride step ends while showing | `confirm` (step change) | the new step headline | polite: new headline |

- Escalation happens **at most once per alert** (H6 and H6b each have their own single repeat). If H6 grows into H6b before its 20 s are up, H6's repeat is cancelled. No repeat after the ride step has ended. The visual does not change on escalation, except that the ripple rings restart (none under reduce motion).
- **Back goes to:** End-trip sheet over the alert (D8). Back again → the alert, unchanged. Back does not acknowledge the alert.
- Page hidden: `platform.notify({ tag: 'getoff', title: '到站了，请下车', body: '{sign}' })` (en: 'This is your stop. Get off now'), which replaces the H6 notification with the same tag.
- 200%: the sheet scrolls; the OK button stays pinned at the bottom (sticky, `c-on-saffron` behind it) so it is always visible.
- SR: `role="alertdialog"`, `aria-labelledby` = title, `aria-describedby` = line + sign. Focus moves to the title when it appears. The OK button is labelled with its visible text.
- `data-testid`: `getoff-now`, `getoff-now-ack`.
- Baselines: `H6b-bus`, `H6b-train`, `H6b-rm` (light/dark identical, both captured).

### 6c.2 G1 Pocket view (dimmed, dark only)
Purpose: keep the screen on (wake lock) at the lowest light and battery cost while the phone is in a pocket or bag.

**Trigger (OQ7):** 45 s with no touch on a **walk or ride** step, or the **放口袋 / Pocket** button on the step card. Never during an alert, a sheet, the H11 banner, the waypoint screen, a wait step, or while the resume voice bar is showing. The 45 s clock restarts on any touch and on every step change.

Layout (always dark, whatever the theme):
- Background `c-pocket` `#000000` (new token). No map: the map render loop is paused.
- Centred column: current-step glyph (walk, bus or train icon) at **160 px** (96 px at 200%), stroke in dark `c-primary` `#FF9466` (9.68:1 on black) → **one line**, the step headline in short form, `title` 1.5 rem/700, dark `c-ink-2` `#CFC3B5` (12.13:1) → the count in `display` 2.1 rem/900 tabular, the same colour → **打开 / Show**: a 72 px full-width button at the bottom, transparent with a 2 px `#CFC3B5` border and `#CFC3B5` text, `r-l`, eye icon.
- Under the button, `caption`: 按任何地方都可以回来 / Touch anywhere to come back.
- If voice is muted, one more `caption` line above the button with the mute icon: 声音关着，提醒只会震动。/ Voice is off. Reminders will only vibrate.

| Step | Line (zh) | Line (en) | Count (zh) | Count (en) |
|---|---|---|---|---|
| Walk | 走到 {place} | Walk to {place} | 还有 {m} 米 | {m} m to go |
| Ride | 坐 {svc} 号巴士 / 坐地铁 | On bus {svc} / On the train | 还有 {n} 站 | {n} stops to go |
| Ride, MRT estimate (6c.12) | 坐地铁 | On the train | 约 还有 {n} 站 | About {n} stops to go |

Behaviour:
- **Enter:** a 420 ms (`d-slow`) fade to black; reduce motion: 120 ms cross-fade. No haptic. Polite: 屏幕调暗了。按任何地方都可以回来。/ Screen dimmed. Touch anywhere to come back.
- **Exit:** any touch, key press or the Show button returns to H5 **at once** (no animation). The first touch only wakes the screen; it never activates what is under the finger. Focus goes to the step card headline. Haptic `tick`.
- **Step change while in pocket view:** stays in pocket view and updates the glyph and line; `confirm` haptic, voice speaks the new headline, polite announcement.
- **Alerts break through:** H6, H6b, H11 (off route), waypoint arrival and H12 arrival leave pocket view **instantly** and show at full brightness in the normal theme, with their full haptic + voice + glow. Weak GPS and offline do not leave pocket view (voice says the line once; the note is waiting on the card).
- The wake lock stays held. Hook lines `pocket:on` / `pocket:off`.
- **Back goes to:** End-trip sheet, drawn in the dark theme over the pocket view. Back again → pocket view.
- SR: the pocket view is a `region` labelled 口袋模式 / Pocket view; the line and count are its content. The Show button's name is 打开地图 / Show the map.
- `data-testid`: `pocket`, `pocket-show`, `pocket-btn` (the card button).
- Baselines: `G1-pocket-walk`, `G1-pocket-ride`, `G1-pocket-muted` (dark only, 100/200, zh/en).

### 6c.3 G2 Multi-stop builder (from H3)
- **Entry:** H3 gets a secondary 56 px button under the From line: **加一个地方 / Add a stop** (`plus` icon; new). Tapping it opens G2 with stop 1 = the H3 destination.
- **G2 screen** (history entry). Bar: back · title 今天去哪几个地方？/ Today's places · lead (`body`, ink-2) 最多 5 个地方。每一段都会在你出发时再找路。/ Up to 5 places. Each part is worked out when you set off.
- **List** (an `<ol>`): first a fixed origin row 从：{from} / From: {from} (no controls). Then one row per stop:
  - 44 px number disc (`c-primary-soft`, `label` 900) · name (`headline`) + address (`caption`).
  - Dwell chip button (56 px, `c-surface-2`, clock icon): 待 {d} / Stay {d}. Hidden on the last stop, which shows the caption 最后一个地方 / Last place instead.
  - **↑** (`arrow-up`, new) · **↓** (`arrow-down`, new) · **✕** remove: 56 px round icon buttons. ↑ is `aria-disabled` on the first stop and ↓ on the last (still 56 px, 40% opacity). ✕ is hidden when only one stop is left.
  - 100%: name on the left; dwell chip, ↑, ↓, ✕ on one row under it. 200%: the same row wraps (dwell chip full width, then the three icon buttons).
- **Add another:** a dashed `c-line` 72 px row **加一个地方 / Add a stop** → H2 in add mode (H2 title 加一个地方 / Add a place). Picking a result returns to G2 with the stop appended. At 5 stops the row is replaced by the caption 最多 5 个地方 / Up to 5 places.
- **Dock:** primary **看看怎么走 / See the way** → H4 journey.

| Action | Result | Haptic | Polite announcement |
|---|---|---|---|
| Add | Row appended, focus on its name | `confirm` | 加上了 {name}，第 {n} 个地方 / Added {name} as place {n} |
| ↑ / ↓ | Row moves (280 ms slide, none under reduce motion); focus stays on the same button in the row's new place | `tick` | {name} 现在是第 {n} 个 / {name} is now place {n} |
| ✕ | Row removed at once, focus to the next row's name (or the Add row) | `tick` | 去掉了 {name} / Removed {name} |
| Dwell picked | Chip updates, sheet closes | `tick` | 在 {name} 待 {d} / Stay {d} at {name} |

SR labels: ↑ 往前移：{name} / Move up: {name} · ↓ 往后移：{name} / Move down: {name} · ✕ 去掉：{name} / Remove: {name} · dwell chip 在 {name} 待多久，现在是 {d} / How long at {name}, now {d}.

**Dwell picker (sheet):** title 在 {name} 待多久？/ How long at {name}? · four radio cards (72 px, the F1 radio-card style): 15 分钟 / 15 min · 30 分钟 / 30 min (default) · 1 小时 / 1 hour · 1 个半小时 / 1½ hours · note (`caption`): 只用来算时间，不会自己出发。/ Only used to work out times. Nothing starts by itself.

- **Back goes to:** G2 → H3 (the built list is kept until the user returns to H1); dwell sheet → G2; H2 add mode → G2.
- `data-testid`: `journey-builder`, `stop-add`, `stop-up-{i}`, `stop-down-{i}`, `stop-remove-{i}`, `stop-dwell-{i}`, `dwell-{15|30|60|90}`.
- Baselines: `G2-two`, `G2-five` (add row replaced), `G2-dwell`.

### 6c.4 H4 journey (multi-segment timeline)
- Title 今天的行程 / Today's trip · line (`label`, ink-2): {n} 个地方 · 大约 {t} 到最后一个地方 / {n} places · last one about {t}.
- Fitted north-up map with all segments: segment route lines as §1.1, waypoints as numbered `c-primary-soft` discs, final destination as the saffron dot.
- **Timeline**, one block per segment:
  - Segment header (`headline`): 第 {k} 段：去 {name} / Part {k}: to {name} · right-aligned `label` 大约 {t} 到 / About {t}.
  - The leg chain from §5.2 (walk chip, bus badge, line tag) in one row, wrapping at 200%.
  - Between segments, a dwell row (`c-surface-2`, `r-m`, clock icon): 在 {name} 待 {d} / Stay {d} at {name}.
- Note (`caption`): 每到一个地方，你按"继续"后，我才从那里找下一段路。/ At each place, I find the next part only after you tap Continue.
- Dock: **开始出发 / Start** (primary) · quiet **改一改 / Change places** → G2.
- **Back goes to:** G2. Baselines: `H4-journey-3`, `H4-journey-5`.

### 6c.5 G3 Waypoint arrival and H5 journey progress
**Progress in H5:** when the trip is a journey, the step card meta row gains a first line: a row of segment dots (one 14 px dot per place: done = `c-primary` filled, current = 3 px `c-primary` ring, next = `c-line` ring; the last place is the saffron dot) followed by `label` 去第 {k} 个地方（共 {n} 个）：{name} / To place {k} of {n}: {name}. The existing "第 2 步，共 4 步" counts steps **inside this part**; the ETA is for this part. SR: the dots are `aria-hidden`; the text is read.

**G3 Waypoint arrival** (`arrived_waypoint`; a full screen in place of H5, history entry):
- Eyebrow (`label`, ink-2): 第 {k} 个地方，共 {n} 个 / Place {k} of {n}.
- The saffron dot drops onto a short persimmon path and ripples once (the last two beats of the H12 signature, 1.2 s; static under reduce motion). No seal and no petals; those stay for the final arrival.
- Title (`arrival` role at 0.8×, i.e. `display` 2.1 rem/900): 到了 {name}！/ You're at {name}!
- Body: 慢慢来，准备好了再走下一段。/ Take your time. Go on when you're ready.
- Next card (`c-surface`, `r-l`, `e-1`): 下一个：{next name} / Next: {next name} · `caption` 你打算在这里待 {d} / You planned to stay {d}. **No countdown, no timer.**
- Dock: primary **继续下一段 / Go to the next place** (72 px, nav icon) · secondary **在这里结束 / End the trip here** (56 px).
- Haptic `attention`. Voice: 到了{name}。准备好了，就按"继续下一段"。/ You're at {name}. When you're ready, tap Go to the next place. Polite announcement of the same text.
- **Continue:** the button shows a spinner and 我在找路… / Finding the way… (`aria-busy`), the next part is planned from the current position (AC 44), then H5 for that part (`confirm`, the first headline spoken). If no way is found, the F3 `none` state for this part, with its H3 header 怎么去 {name}？.
- **End here:** goes to H12 for this place (the seal moment, "用了 N 分钟" = the whole trip so far); the stored trip is cleared.
- While G3 shows, the GPS watch is paused and the wake lock is released after 60 s (a clinic visit can last 90 min); both resume on Continue. The stored trip stays.
- **Back goes to:** End-trip sheet. Back again → G3.
- `data-testid`: `waypoint`, `waypoint-continue`, `waypoint-end`.
- Baselines: `G3-waypoint`, `G3-continuing`, `H5-journey`.

### 6c.6 G4 Resume and voice unlock
- **Resume toast** (F5 toast, nav icon), name `resume`: 继续上次的行程 / Continuing your trip. Shown when the stored trip reopens straight into H5 (within ETA + 2 h, OQ5).
- **Voice bar:** while speech (and the wake lock) still need a user gesture, a full-width primary button sits in the top band under row 1: **点一下继续语音 / Tap to turn voice back on** (speaker icon, 72 px, `c-primary`). If voice is muted, the bar reads **点一下，让屏幕保持亮着 / Tap to keep the screen on** (eye icon) instead, because the wake lock still needs the tap.
  - Tap → audio unlocked, wake lock re-acquired, the current headline is spoken, the bar disappears. Haptic `tick`. Hook `resume:voice`.
  - Shown on every platform where the first `speak()` or the wake-lock request fails without a gesture (always on iOS). Pocket view is never entered while the bar shows.
  - SR: a normal button; polite announcement on resume: 继续上次的行程。点一下就能听到语音。/ Continuing your trip. Tap to hear the voice.
- **Stale trip** (older than ETA + 2 h, younger than 24 h): H1 opens with a sheet:
  - Title 上次的行程还没结束 / Your last trip hasn't ended · body 要接着去 {dest} 吗？/ Do you want to carry on to {dest}?
  - **继续 / Continue** (primary) → H5 at the stored step; the engine re-plans if the user is now off the route. **结束 / End** (secondary) → the stored trip is deleted; H1 stays, no toast.
  - **Back goes to:** H1 with the sheet closed; the trip stays stored and the sheet returns on the next launch (until 24 h, then it is dropped silently).
- `data-testid`: `resume-toast`, `voice-unlock`, `stale-trip`, `stale-continue`, `stale-end`. Baselines: `G4-resume`, `G4-resume-muted`, `G4-stale`.

### 6c.7 G5 Manual controls and manual mode (H5)
Manual controls are **always on the step card** (AC 10). Layout of the card's action area, below the progress bar:

| Row | Walk step | Wait step | Ride step |
|---|---|---|---|
| A (step action) | — | **我上车了 / I'm on** (`bus`/`train` icon) | **我下车了 / I got off** (`exit` icon) |
| B | **再说一遍 / Say it again** (speaker) · **放口袋 / Pocket** (`moon`, new) | 再说一遍 | 再说一遍 · 放口袋 |
| C (quiet) | **‹ 上一步 / Previous step** · **下一步 › / Next** | the same | the same |

- Normal (auto) mode: row A is a secondary 56 px button, row B secondary 56 px, row C quiet 56 px (text buttons, `c-primary-text`, underline). Say it again is always the first button of row B, at the left (it is the most used control, D14).
- **Manual mode** (location denied, or no usable fix for 60 s): row A becomes a primary 72 px button, and on walk steps **下一步 / Next** moves up to row A as a primary 72 px button. Row C keeps Previous step only. Pocket is hidden (with no position there are no updates to wait for).
- "Previous step", not "Back", so it is never confused with the system Back.
- Each tap sends the reducer event (`manual_next`, `manual_prev`, `boarded`, `alighted`), gives `confirm`, and speaks the new headline (polite announcement). Previous step on step 1 is `aria-disabled`.
- 200%: every row becomes one column; the card scrolls (max 62% of the height).
- Manual mode note (trip note, 6c.10): icon `loc`, 没有位置信息，请自己按"下一步" / No location, so tap Next yourself. When location becomes available, the note is replaced by 找到你的位置了，我会自己往下走。/ Found you. I'll move on by myself. for 4.2 s and the card returns to normal layout.
- Starting without location (AC 4): the trip starts in manual mode and speaks the note once.
- SR names = visible text. `data-testid`: `say-again`, `pocket-btn`, `step-prev`, `step-next`, `im-on`, `got-off`.
- Baselines: `H5-manual-walk`, `H5-manual-wait`, `H5-manual-ride`.

### 6c.8 H11 states: re-route failed and offline (AC 33)
Same banner component (§5.7, jade rule), placed **inside the top band** (6c.0). The `searching` and `found` states are unchanged.

| State | Title | Line | Spoken | Haptic |
|---|---|---|---|---|
| `failed` | 暂时找不到新的路 / No new way found yet | 先跟着地图上的线走。/ Follow the line on the map for now. | title + line, once | none (the `gentle` of `off_route` came first) |
| `offline` | 没有网络，现在不能找新的路 / No internet, so I can't find a new way now | 网络回来后我会再找。先跟着地图上的线走。/ I'll try again when you're back online. Follow the line on the map for now. | title + line, once | none |

- Icon: `route` in `c-ink` (no spinner, no check). The banner does not auto-dismiss; it has a ✕ (56 px, SR 知道了 / OK) and goes away by itself if the next off-route episode finds a way (`found`).
- Fallback buttons in the banner, in this order (only what exists in M2):
  1. **给司机看地址 / Show the driver** (secondary 56 px, `car` icon) → H10 on 去目的地 / Where I'm going.
  2. **紧急情况 · 拨打 995 / Emergency · Call 995** (the §5.9 danger outline, 56 px, last). "Call family" arrives in M4 and is not shown.
- Polite announcement (not assertive: it is not urgent). Retries on the next off-route episode (AC 33).
- **Back goes to:** End-trip sheet. Baselines: `H11-failed`, `H11-offline`.

### 6c.9 G6 "End your current trip?" (AC 5) and H9 in M2 (OQ4)
- **G6 sheet** (from H4 Start while a trip is active): title 要结束现在的行程吗？/ End your current trip? · body 你正在去 {dest}。一次只能走一个行程。/ You're on your way to {dest}. You can take one trip at a time. · **回到现在的行程 / Back to my trip** (primary → H5 of the active trip) · **结束，去新的地方 / End it and go here** (secondary → the old trip ends, the new one starts). **Back goes to:** H4, sheet closed. Baseline `G6-endfirst`. `data-testid`: `end-first`.
- **H9 M2 subset**, same order rules as §5.9 with "call family" removed: 给司机看地址 · 大字显示，方便叫德士 → 我在哪里？· 显示你现在的位置 → 帮我重新找路 · 从你现在的地方开始 (trip only) → 紧急情况 · 拨打 995. Baselines `H9-m2-trip`, `H9-m2-home`.

### 6c.10 Trip note component (`.tripnote`) and the wake-lock note
- **Trip note** (new component, built only from tokens): a row at the top of the step card: `c-surface-2`, `r-m`, padding `s-3`, 28 px `c-ink` icon, text in `label` (700, `c-ink`), optional second line in `caption` `c-ink-2`, optional ✕ (56 px, SR 知道了 / OK). It wraps at 200%. Announced once, polite.
- One note at a time, by priority: offline > weak GPS > manual mode > wake lock > no voice. A lower note waits until the higher one clears.
- **Wake lock failed** (AC 39, once per trip, with ✕): icon `eye`. 请让屏幕保持亮着 / Please keep the screen on · second line 这部手机不让我一直亮着屏幕。屏幕暗了，提醒可能会晚。/ This phone won't let me keep the screen on. If it goes dark, reminders may be late. No voice, no haptic.
- **Offline** (AC 35): icon `wifi-off`. 没有网络，行程继续 / No internet, trip continues. No ✕; it goes when back online.
- `data-testid`: `trip-note`. Baselines: `H5-note-wakelock`, `H5-note-offline`.

### 6c.11 No voice installed (AC 26)
- Trip note (once per trip, with ✕), icon `mute`: 这部手机没有中文语音，请看屏幕 / This phone has no Chinese voice. Please read the screen. (en trip: 这部手机没有英文语音，请看屏幕 / This phone has no English voice. Please read the screen.) Second line is a quiet link **怎么加中文语音 / How to add a Chinese voice** → the voice help sheet.
- Haptics continue. Say it again stays visible; tapping it with no voice shows the toast 这部手机现在说不了话 / This phone can't speak right now.
- **Voice help sheet** (title 加一个中文语音 / Add a Chinese voice; numbered `<ol>` as F2):
  - **Android:** 1. 打开手机的"设置"。/ Open your phone's Settings. 2. 搜索"文字转语音"。/ Search for "Text-to-speech". 3. 按"首选引擎"旁边的齿轮，再按"安装语音数据"。/ Tap the gear next to "Preferred engine", then "Install voice data". 4. 选"中文（中国）"，下载。/ Choose "Chinese (China)" and download it. 5. 回到 怎么去?，在设置里按"试听"。/ Come back to 怎么去? and tap "Test voice" in Settings.
  - **iPhone:** 1. 打开"设置" → "辅助功能" → "朗读内容" → "声音"。/ Open Settings → Accessibility → Spoken Content → Voices. 2. 选"中文" → "普通话（中国大陆）"，下载一个声音。/ Choose "Chinese" → "Mandarin (China mainland)" and download a voice. 3. 回到 怎么去?，在设置里按"试听"。/ Come back to 怎么去? and tap "Test voice" in Settings.
  - The platform the device reports is shown first; the other is under 其他手机 / Other phones.
  - **Back goes to:** H5 (or Settings when opened there).
- **Settings → 语音提示 → 试听 / Test voice** (56 px secondary, speaker icon): speaks 你好，我会这样跟你说话。/ Hello, this is how I'll talk to you. If no voice exists for the language, the row shows the caption 这部手机没有中文语音 / This phone has no Chinese voice and the same quiet link.
- `data-testid`: `no-voice`, `voice-help`, `test-voice`. Baselines: `H5-note-novoice`, `G7-voicehelp-android`, `G7-voicehelp-ios`.

### 6c.12 Weak GPS (AC 34) and the MRT soft estimate (OQ3)
- **Weak GPS note** (trip note, no ✕), icon `loc`: 位置不太准，跟着站牌走 / Location is rough, follow the signs. Spoken once per weak spell. No haptic.
- **Puck:** an accuracy circle (`c-primary` at 12% fill, 2 px `c-primary` ring at 40%) with the radius of the fix accuracy. After 30 s without a good fix the puck turns grey: fill `c-ink-2`, `c-surface` ring, heading cone hidden, the pulse stopped. It returns to normal on the next good fix.
- **Manual controls emphasised:** row A (I'm on / I got off) becomes primary 72 px while the spell lasts (as manual mode, without the manual note).
- **MRT underground estimate** (ride step on a train while weak or no fix): the headline becomes 坐着就好，约 还有 {n} 站 / Sit back. About {n} stops to go; the sub-line 地下没有位置。车停时，看一看站名。/ No location underground. When the train stops, check the station name. The stop dots show the estimate with the current dot as a dashed ring. The count comes from the timetable, always with 约 / About. It never counts up and never goes below 1; it holds at 约 还有 1 站 until the user taps I got off or a fix arrives.
- **Soft pre-alert** at the scheduled time of the second-last station: the H11 banner component (jade rule, `train` icon), not the saffron alert: 大约下一站下车 / Probably getting off at the next stop · 车停时看站名：{station} / When the train stops, check for: {station}. Haptic `attention`. Voice: title + line. Polite. Auto-dismiss 4.2 s. The strong H6/H6b alerts stay position- or button-based (I got off).
- Baselines: `H5-weak`, `H5-weak-stale`, `H5-mrt-estimate`, `H11-mrt-prealert`.

### 6c.13 Haptic map: one canonical list (AC 37)
The web shell uses `tap / notice / get_off / alert / arrived` with different patterns. **These six names and patterns are the only ones.** `VibratePattern = 'tick' | 'confirm' | 'attention' | 'getoff' | 'arrive' | 'gentle'`; `VIBRATE_PATTERNS` is copied from this table.

| Name (replaces) | Pattern ms (on·off·on…) | Cues and moments |
|---|---|---|
| `tick` (was `tap`) | 12 | Any tap that navigates or toggles; pocket view exit; reorder; voice-unlock tap |
| `confirm` (was `notice` for step changes) | 20·40·20 | `step_changed`, `turn`, `transfer`, `boarded`, manual Next/Previous/I'm on/I got off, `back_on_route`, `reroute_done`, alert acknowledged, waypoint Continue, share sent |
| `attention` (new in the shell) | 60·80·60 | `arrived_at_stop`, `arrived_waypoint`, MRT soft pre-alert, bus here (M3) |
| `getoff` (was `get_off`, and `notice` for the next-stop alert) | 300·150·300·150·600 | `get_off_next_stop` once; `get_off_now` twice (800 ms apart); the single escalation repeat |
| `arrive` (was `arrived`) | 40·60·40·60·160 | `arrived_destination` only |
| `gentle` (was `alert` for off route) | 30·60·30 | `off_route` only (never an error buzz) |

No haptic: `approaching_stop`, `gps_weak`, offline/online, trip notes, H11 `failed`/`offline`, pocket view entry. Settings → 震动提示 off silences all six.

### 6c.14 Voice lines added in M2
| Moment | zh | en | Priority |
|---|---|---|---|
| Get off now (bus) | 到站了，请下车。… 车停稳了再站起来，慢慢下车。 | This is your stop. Get off now. … Wait until the bus stops, then get off slowly. | high |
| Get off now (train) | 到站了，请下车。… 车门开了就下车，小心空隙。 | This is your stop. Get off now. … Get off when the doors open. Mind the gap. | high |
| Waypoint | 到了{name}。准备好了，就按"继续下一段"。 | You're at {name}. When you're ready, tap Go to the next place. | normal |
| Re-route failed | 暂时找不到新的路。先跟着地图上的线走。 | No new way found yet. Follow the line on the map for now. | normal |
| Re-route offline | 没有网络，现在不能找新的路。网络回来后我会再找。 | No internet, so I can't find a new way now. I'll try again when you're back online. | normal |
| Weak GPS | 位置不太准，跟着站牌走。 | Location is rough, follow the signs. | normal |
| MRT pre-alert | 大约下一站下车。车停时看站名：{station}。 | Probably getting off at the next stop. When the train stops, check for {station}. | normal |
| Manual mode | 没有位置信息，请自己按"下一步"。 | No location, so tap Next yourself. | normal |
| Test voice | 你好，我会这样跟你说话。 | Hello, this is how I'll talk to you. | normal |
"…" = the 2.2 s pause before the second line.

### New items needing Director approval
- **Colour token** `c-pocket` `#000000` (pocket view background only; OLED pixels off). Text on it reuses dark `c-ink-2` (12.13:1) and the glyph dark `c-primary` (9.68:1).
- **Icons** (same grid and stroke as §1.4): `exit` (door with an arrow out; H6b, I got off) · `moon` (Pocket) · `plus` (Add a stop) · `arrow-up` · `arrow-down` (reorder).
- **Component** `.tripnote` (6c.10), built only from existing tokens.
- **Copy deviation (Creative recommendation):** the waypoint counter is 第 2 个地方，共 4 个 / Place 2 of 4, not "第 2 站，共 4 站 / Stop 2 of 4", because 站 / stop already means a bus stop or station on the same screens ("还有 4 站"). Director to confirm; the fallback is the brief's wording.
- **AC wording:** AC 13 "puck at 34% height" becomes "66% down the visible map window" (6c.0). AC 10 "上一步 / Back a step" becomes "上一步 / Previous step".

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
- [ ] H5: puck and station labels never intersect the top band or the step card (6c.0 rect check, 100% and 200%).
- [ ] Haptic names are exactly the six in 6c.13; no `tap/notice/get_off/alert/arrived` left in `src/web`.
- [ ] H6b, pocket view, manual controls, waypoint and resume states match 6c, with Back → End-trip sheet → Back → same state.
