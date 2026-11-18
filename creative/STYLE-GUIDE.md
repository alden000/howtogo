# 怎么去? — Style guide v1.4.1

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
- Font stack `"Atkinson Hyperlegible", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", system-ui, sans-serif`.
- Atkinson is **self-hosted** (Latin subset, woff2, 400/700, `font-display: swap`, 700 preloaded). No third-party font request.
- **CJK comes from the device font**, never a web font.
- Only 400 and 700 really render, so a `900` role shows at 700. Hierarchy comes from size, never from 900 against 700.
- **Wording:** in zh, "transfer" is always **换车** (最少换车, 不用换车, 换 [CC] …), never 转车.

Numerals use Atkinson and `tabular-nums`.
`html { font-size: calc(20px * var(--ts)) }`, where `--ts` ∈ {0.85, 1, 1.25, 1.5, 2} (0.85 = 较小 / Smaller, v1.4.1, see 6f.11; the default stays 1). All type is in rem.

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
| `caption` | 0.85 / 17 (min) | 400 | 1.3 | Sub-lines (never smaller than 17px at 100%; 14.5px at the opt-in 85%, the absolute floor) |

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

### 5.0 Segmented choice (`.seg`)
- Labels never break inside a word (`keep-all`).
- A set whose labels exceed 3 CJK characters, or that sits in a sheet, stacks as one column of full-width 56 px rows with the check on the right.
- Every `.seg` stacks at 150 % and 200 %.

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
States: counting · `here` (saffron fill, "快到了 / Arriving") · stale > 60s (build: dot turns grey and shows "约 / about") · no data (build: "暂时没有到站时间，请看站牌 / No live time right now — check the stop sign"). **M3 supersedes these with the six states in 6d.1.**

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
**M4 full version: 6e.3.** Options in fixed order: 打电话给美玲 (jade disc) → 给司机看地址 (saffron disc) → 我在哪里？ → 帮我重新找路 (only during a trip) → `紧急情况 · 拨打 995` (danger outline, last, not a big red button).

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

- **Route options (M3):** the **选项 / Options** secondary button (`sliders`) sits under the From line, after 加一个地方. It opens the **路线选项 / Route options** sheet, which holds **先给我看 / Show first**: 最少走路 / Least walking (default) · 最少换车 / Fewest changes · 最快 / Fastest. A pick closes the sheet, re-ranks the cards and announces `现在先给你看：{label}` / `Now showing first: {label}`. The Lift-friendly switch joins the sheet only when its ranking ships (M5).

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
- 语言 Language: 中文 / English · 字体大小: 85 / 100 / 125 / 150 / 200% (6f.11) · 颜色: 跟手机 / 白天 / 夜间 · 语音提示: 开 / 关 · 震动提示: 开 / 关 · 减少动画: 跟手机 / 开 / 关.
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
  - 字体大小 / Text size: 5 radio cards (v1.4.1, 6f.11): 较小 85% / Smaller · 标准 100% / Standard · 大 125% / Large · 特大 150% / Extra large · 最大 200% / Largest. The whole page re-renders at the chosen size; that **is** the live preview. A preview card under it reads 早上好！今天想去哪里？/ Good morning! Where would you like to go today? (`display` role).
  - Up to 150% the grid has 2 columns and the odd last card (最大 200%) spans the full row; at 200% the radio grid becomes 1 column (same `auto-fit` rule as `.tile`). 标准 100% stays pre-selected.
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
- **出行 / Travel (M3):** the rows are 先给我看 (stacked seg) · 我用轮椅或助行器 · 我有乐龄卡 · 少走楼梯，用电梯. 少走楼梯，用电梯 has the sub `路上会提醒你跟着电梯标志走。` / `On the way, I'll remind you to follow the lift signs.`
- **About (M3):** the licence sentence links "Singapore Open Data Licence version 1.0" (`.inlink`, new tab). Under it, a `caption` reads `交通资料日期：2026年11月17日` / `Transit data date: 17 Nov 2026`.
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
- **Map viewport** = the rectangle from the band's bottom edge to the step card's top edge. It is **never shorter than 160 px**: the step card's max height is `min(62% of the screen, screen − band − 160 px)` and the card scrolls inside it (this matters at 200% while the H11 banner is in the band). In MapLibre, size the map container to the full screen and set `map.setPadding({ top: bandHeight, bottom: cardHeight })` on every band or card resize (ResizeObserver), **and** clip symbol rendering to that rectangle by sizing the canvas container to it. The step card's `r-xl` corners show `m-land` behind them, so the join looks continuous.
- **Puck:** horizontally centred, at **66% down the map viewport** (34% up from its bottom edge; this replaces "34% of the screen" in AC 13 and stays correct at 200%). It is never closer than 72 px to either edge of the viewport; if the viewport is shorter than 144 px (200% text with a tall card), the puck is centred in it.
- **Map controls (`.mapctl`)** float at the right edge of the viewport, 14 px above the card. They are the only things over the map. Labels under them are acceptable; the puck never is (it is centred).
- **QA check (AC 9):** for every H5 state at 100% and 200%, the puck rect and every rendered station/stop label rect intersect neither the band rect nor the card rect. Zero overlap.
- **Trip notes** (6c.8, 6c.10–6c.12) sit at the top of the step card, not over the map.
- Step-card action rows (6c.7): row B (Say it again · Pocket) and row C (Previous step · Next) each fit on **one line at 100%** (`flex: 1 1 7rem` and `1 1 5rem`), so the card stays ≈ 45% of the screen on a walk step at 100%.

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
The `searching` and `found` states keep the §5.7 banner, placed **inside the top band** (6c.0). The `failed` and `offline` states are **not** banners: they carry buttons and stay up, so they are a **trip note at the top of the step card** (6c.10, highest priority). Putting them in the band left no map at 200% (self-audit).

| State | Title | Line | Spoken | Haptic |
|---|---|---|---|---|
| `failed` | 暂时找不到新的路 / No new way found yet | 先跟着地图上的线走。/ Follow the line on the map for now. | title + line, once | none (the `gentle` of `off_route` came first) |
| `offline` | 没有网络，现在不能找新的路 / No internet, so I can't find a new way now | 网络回来后我会再找。先跟着地图上的线走。/ I'll try again when you're back online. Follow the line on the map for now. | title + line, once | none |

- Icon: `route` in `c-ink` (no spinner, no check). The note does not auto-dismiss; it has a ✕ (56 px, SR 知道了 / OK), goes away by itself if the next off-route episode finds a way (`found`), and clears on a step change.
- Fallback buttons in the note, in this order (only what exists in M2):
  1. **给司机看地址 / Show the driver** (secondary 56 px, `car` icon) → H10 on 去目的地 / Where I'm going.
  2. **紧急情况 · 拨打 995 / Emergency · Call 995** (the §5.9 danger outline, 56 px, last, on a `c-surface` fill: on `c-surface-2` the danger text is only 6.5:1). "Call family" arrives in M4 and is not shown.
- Polite announcement (not assertive: it is not urgent). Retries on the next off-route episode (AC 33).
- **Back goes to:** End-trip sheet. Baselines: `H11-failed`, `H11-offline`.

### 6c.9 G6 "End your current trip?" (AC 5) and H9 in M2 (OQ4)
- **G6 sheet** (from H4 Start while a trip is active): title 要结束现在的行程吗？/ End your current trip? · body 你正在去 {dest}。一次只能走一个行程。/ You're on your way to {dest}. You can take one trip at a time. · **回到现在的行程 / Back to my trip** (primary → H5 of the active trip) · **结束，去新的地方 / End it and go here** (secondary → the old trip ends, the new one starts). **Back goes to:** H4, sheet closed. Baseline `G6-endfirst`. `data-testid`: `end-first`.
- **H9 M2 subset**, same order rules as §5.9 with "call family" removed: 给司机看地址 · 大字显示，方便叫德士 → 我在哪里？· 显示你现在的位置 → 帮我重新找路 · 从你现在的地方开始 (trip only) → 紧急情况 · 拨打 995. Baselines `H9-m2-trip`, `H9-m2-home`.

### 6c.10 Trip note component (`.tripnote`) and the wake-lock note
- **Trip note** (new component, built only from tokens): a row at the top of the step card: `c-surface-2`, `r-m`, padding `s-3`, 28 px `c-ink` icon, text in `label` (700, `c-ink`), optional second line in `caption` `c-ink-2`, optional ✕ (56 px, SR 知道了 / OK). It wraps at 200%. Announced once, polite.
- Layout: icon · text (`flex: 1 1 0`, so it wraps beside the icon even at 200%) · ✕; buttons, if any, on a full-width row below.
- One note at a time, by priority: re-route failed/offline (6c.8) > offline > weak GPS > manual mode > wake lock > no voice. A lower note waits until the higher one clears.
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

## 6d. M3 SG transit smarts

Frames for the M3 build (live LTA data, transfers, exits, fares, recent trips). Designed from the feature list (`01-research-and-plan.md` F9, F17, S3, S4, S5, S8; ROADMAP M3) while the PM writes the M3 requirements in parallel; the Director reconciles AC numbers. They reuse §1 tokens and §5/§6b/§6c components. **No new colour, type, space, radius or motion tokens.** New icons and components are listed in 6d.10 for Director approval.

Shared rules (as §6, 6b, 6c, plus):
- Frame IDs: **T1–T9**. Baselines: `M3-{frame}-{state}-{light|dark}-{100|200}-{zh|en}.png` at 390×844 DPR 2.
- **Never colour-only (D7).** Every live-data state is carried by words first, then a glyph, then colour. Remove all colour and each state must still read.
- **Honest data.** Live numbers say where they come from: 实时 / Live only when LTA reports a monitored bus; otherwise 约 / About. We never invent a time, an exit, a fare or a station name. Missing data = the line is hidden, not guessed.
- Live data refresh: BusArrival every **20 s** while the chip is on screen (the Worker caches 20 s). Alerts every **60 s** while H3, H4 or H5 is open. Refreshes are silent: no live-region traffic on a number change (only on a **state** change).
- No red. `c-danger` stays 995-only. Disruptions use **saffron** (attention), never danger.

### 6d.1 T1 Bus-arrival chip states (`.arrchip`, extends §5.5)
Where: H5 wait step (§6, 6c), H4 timeline bus row (a compact chip, first bus only), H3 bus card (one line under the chain: `下一班 139：4 分钟 / Next 139: 4 min`, live/estimated only).

Anatomy (100%): bus badge · big minutes (`1.6rem`/900 tabular) · source tag (`label`) · second line (`caption` ink-2): next bus + load. Then a glyph row (6d.2). At 200% everything wraps; the minutes stay on the first line with the badge.

| State | Trigger (Worker data) | Big text zh / en | Source tag zh / en | Second line zh / en | Look |
|---|---|---|---|---|---|
| `live` | `etaMin ≥ 1`, bus monitored, data ≤ 60 s old | `4 分钟` / `4 min` | `● 实时` / `● Live` (jade dot blinks 1.6 s) | 下一班 12 分钟 / Next one in 12 min | `c-surface-2` |
| `here` | `etaMin = 0` | `快到了` / `Arriving` | — | 看清楚车头的号码，再上车。/ Check the number on the front before you get on. | `c-saffron` fill, ink text (12.1:1) |
| `estimated` | bus not monitored (LTA `Monitored = 0`: time from the schedule), **or** the last good fetch is > 60 s old | `约 4 分钟` / `About 4 min` | `按时间表` / `By timetable` (hollow ring, no blink) | 时间可能会变，请看站牌。/ Times may change. Check the stop sign. | `c-surface-2`, a 2 px dashed `c-line` border |
| `nodata` | service in route, but `next` is empty and the service is in its operating hours, or the fetch failed | `暂时没有到站时间` / `No arrival time right now` (`label` 700, not big) | — | 请看站牌上的时间。巴士还是会来的。/ Check the times on the stop sign. The bus will still come. | `c-surface-2`, `clock` icon in place of minutes |
| `lastgone` | after the service's last bus (BusRoutes `LastBus` for that stop and day type) and `next` is empty | `今天的末班车开走了` / `The last bus today has gone` | — | 我帮你找别的路。/ I'll help you find another way. | `c-surface`, 8 px `c-saffron` left rule, `moon` icon |
| `notrunning` | before the first bus, or the service does not run today (BusRoutes `FirstBus` / day type) | `{svc} 号现在不开` / `Bus {svc} isn't running now` | — | 第一班大约 {t}。/ First bus about {t}. (hidden if unknown) | as `lastgone`, `clock` icon |

- `lastgone` and `notrunning` add a button row under the chip: **找别的路 / Find another way** (primary 56 px, `route` icon → re-plan from here, T4 flow without the disruption note) · **给司机看地址 / Show the driver** (secondary 56 px → H10 去目的地). On H3 the card for that route gets the same sentence in its facts row and moves to the bottom; it is not removed (the user may know better).
- `here` keeps the §2 signature moment: chip flips to saffron, haptic `attention`, voice "{svc} 号巴士快到了。看清楚车头的号码，再上车。/ Bus {svc} is almost here. Check the number on the front before you get on."
- Voice for the other states, **once per state per step**, in the trip language: `nodata` "暂时没有到站时间，请看站牌。/ No arrival time right now. Check the stop sign." · `lastgone` "今天的末班车开走了。我帮你找别的路。/ The last bus today has gone. I'll help you find another way." · `notrunning` "{svc} 号现在不开。/ Bus {svc} isn't running now." `live` and `estimated` are not spoken on refresh (the wait-step headline already says the minutes when the step starts).
- Haptic: `attention` for `here` only. None for the others (we never buzz bad news; 6c.13).
- **SR label** (the chip is one `role="group"` with this `aria-label`; children `aria-hidden`):
  - live: "139 号巴士，4 分钟后到，实时。有座位，轮椅可以上，双层巴士。下一班 12 分钟。" / "Bus 139 in 4 minutes, live. Seats free, wheelchair OK, double deck. Next one in 12 minutes."
  - estimated: "139 号巴士，大约 4 分钟后到，按时间表。" / "Bus 139 in about 4 minutes, by timetable."
  - here / nodata / lastgone / notrunning: the big text + second line.
  - State changes (not number changes) go to the polite region once.
- **Reduce motion:** the live dot does not blink (solid); the saffron flip is a 120 ms cross-fade.
- `data-testid`: `arrchip` with `data-state="live|here|estimated|nodata|lastgone|notrunning"`. Baselines: `T1-live`, `T1-here`, `T1-estimated`, `T1-nodata`, `T1-lastgone`, `T1-notrunning`.

### 6d.2 T2 Seat load, wheelchair and double-deck glyphs (`.loadtag`)
A row of small tags under the chip's second line (and on H4's compact chip). Each tag = 24 px glyph + `label` text, `c-ink` on `c-surface`, 2 px `c-line` border, `r-s`, min height 40 px (not a control). **The word carries the meaning; the glyph repeats it; there is no colour code.**

| Data | Glyph (new icon) | zh | en | Notes |
|---|---|---|---|---|
| `load: SEA` | `seat` (a seat) | 有座位 | Seats free | Default when LTA leaves it blank — then the tag is **not shown** (we don't claim seats we don't know) |
| `load: SDA` | `stand` (a person holding a rail) | 要站着 | Standing room | |
| `load: LSD` | `full` (two people close) | 很挤，可以等下一班 | Very full — you can wait for the next one | The only load tag with advice. If the next bus is SEA/SDA, the second line reads 下一班 12 分钟，有座位 / Next one in 12 min, seats free |
| `wheelchair: true` | `wheelchair` | 轮椅可以上 | Wheelchair OK | |
| `wheelchair: false` | — | — | — | Not shown (all SG public buses are WAB except a few; absence ≠ claim) |
| `deck: double` | `deck2` (two-storey bus) | 双层巴士 | Double deck | Helps recognise the bus from afar |
| `deck: bendy` | `bus` + text | 长巴士 | Bendy bus | |
| `deck: single` | — | — | — | Not shown |

- Order: load · wheelchair · deck. They wrap at 200%.
- Load is about the **first** bus only; the next-bus load appears only in the LSD advice sentence.
- Settings → 出行 / Travel (new row, M3): **我用轮椅或助行器 / I use a wheelchair or walker** (开 / 关). When on, `wheelchair: false` **is** shown as a tag `这班车轮椅不方便 / Not wheelchair friendly` (ink, `wheelchair` glyph with a diagonal stroke drawn in the same icon: `wheelchair-no`, new) and the second line suggests the next WAB bus if there is one.
- SR: included in the chip label (6d.1). Tags themselves are `aria-hidden`.
- Baselines: `T2-tags-sea`, `T2-tags-lsd`, `T2-tags-nowab`.

### 6d.3 T3 MRT disruption banner (`.banner.warn`, TrainServiceAlerts)
Shown only when `/api/alerts` reports `disrupted` **and** an affected line + station range intersects a train leg on screen (H3 card, H4, H5 active route), or on H1 when a recent trip (T9) uses the line. Never shown for lines the user is not taking.

Look: the §5.7 info banner with the left rule in **`c-saffron`** (8 px) instead of jade, `c-surface` fill, `train-off` icon (new) in `c-ink` on a 44 px `c-saffron-soft` disc, and the affected **line tag** (stripe + code, D7) inline in the title. Text: `c-ink` / `c-ink-2` (≥ 9.3:1 both themes).

| Part | zh | en |
|---|---|---|
| Title (stopped) | [NE] 东北线 有些站暂时没有地铁 | [NE] North East Line: no trains at some stations |
| Title (delay; LTA message contains "delay") | [NE] 东北线 地铁会慢一些 | [NE] North East Line: trains are running slowly |
| Line 1 | {from 站} 到 {to 站}，往 {direction} 方向 | {from} to {to}, towards {direction} |
| Line 2 (if `freePublicBus`) | 这些站有免费巴士：{codes}。跟着“免费接驳巴士”的牌子走。 | Free buses at {codes}. Follow the “Free bridging bus” signs. |
| Primary (56 px, `route`) | 找别的路 | Find another way |
| Quiet link | 看 LTA 的通知 | Read the LTA notice |

- Station names follow T7 (zh name + code). `{direction}` is the LTA direction station, T7 rule.
- **Where it sits:** H3: above the cards; the affected card gets a facts-row line `[NE] 有些站没有地铁 / [NE] no trains at some stations` and loses the 推荐 tag (the best non-affected card takes it). H4: under the title. H5: **inside the top band** (6c.0), so it never covers the map; at 200% the band yields as in 6c.8 (map ≥ 160 px), and if there isn't room the banner collapses to its title + button and Line 1–2 move to a trip note on the step card.
- **LTA notice sheet:** title 交通管理局（LTA）的通知 / Notice from LTA (LTA) → the latest `messages[].text` verbatim in English (`body`, `lang="en"`), each with its time (`caption`, e.g. 下午 5:10 / 5:10 pm) → caption 原文是英文。/ The notice is in English, as published. → **找别的路** primary. Back → screen below.
- **When it clears** (`status: normal` or the line is no longer listed): banner removed, toast `{line} 恢复正常了 / The {line} is running normally again` (`train` icon), polite.
- Moments: first time the banner appears for the **active trip** (H5): haptic `attention`, voice "{line}有些站暂时没有地铁。要找别的路，就按“找别的路”。/ No trains at some {line} stations. To go another way, tap Find another way." Polite (not assertive: no immediate danger), once per disruption. On H3/H4: no haptic, no voice, polite announcement of the title.
- SR: banner is `role="region"` `aria-label` = the title text with the line name spelled out (never just "NE").
- `data-testid`: `disruption`, `disruption-find`, `disruption-notice`. Baselines: `T3-h3`, `T3-h4`, `T3-h5`, `T3-h5-200`, `T3-notice`, `T3-cleared`.

### 6d.4 T4 "Find another way" flow
1. Tap **找别的路** → H3 in `reroute` mode (history entry; Back → where the user came from). From = the current position (H5) or the original From (H3/H4).
2. Loading (F3 skeleton) with the line `我在找不坐 {line} 的路… / Finding a way without the {line}…` (spinner, `aria-busy`).
3. Results: the H3 title becomes 换一条路去 {dest} / Another way to {dest}. Above the cards a jade-rule note: `这些路不经过 {line} 有问题的站。/ These ways avoid the affected {line} stations.` Cards are the normal §5.2 cards (max 3). If LTA lists free buses for the stretch, a card may be the bridging bus route; it carries the tag `免费接驳巴士 / Free bridging bus` and the note `上车时不用付钱。/ No fare on this bus.`
4. Pick a card → H4 → Start, or in-trip → straight to H5 with the new route (the G6 "end your current trip" sheet is **not** shown: it is the same trip). Haptic `confirm`. Voice: the new first headline. Toast `换好路了 / New way ready` (`route` icon).
5. No alternative: F3 `none` with the M4 additions (show a driver → H10, call family, 6e.3).
- Offline: the button shows the 6c.8 offline note instead (no new copy).
- `data-testid`: `reroute-results`. Baselines: `T4-loading`, `T4-results`, `T4-none`.

### 6d.5 T5 MRT exit hint (`.exittag`)
Data: the curated exit table (Dev data round). **Only shown when the table has an exit for the destination** (or for the walk leg's first point within 80 m of an exit); otherwise no hint (never guessed).

- **Exit tag:** a square `c-saffron` badge with the exit letter/number in `c-on-saffron` 900 (12.1:1; saffron = "get off / way out" across the app), min 40 × 40 px, `r-s`, `aria-hidden` (the text says it). Exit codes print exactly as the sign: `B`, `A1`, `E`.
- **Alight step (train, H5)** sub-line, after the platform line: `出站时走 [B] 出口 / Use Exit [B] when you leave`.
- **Walk step after the station (H5)**, the headline becomes: `从 [B] 出口出来 / Use Exit [B]`; sign chip = the exit sign text as printed, e.g. `B · Tan Tock Seng Hospital`; sub-line: `出站后，往 {landmark} 方向走 / After the gates, head towards {landmark}` (only if the table has a landmark; else `出了闸门，找写着 B 的黄色牌子 / After the gates, look for the sign marked B`). *(Director: "yellow" describes SMRT/SBS exit signage; confirm before release or drop the colour word.)*
- **H4 timeline** train row: `… 在 诺维娜 NS20 下车 · 走 [B] 出口 / … get off at Novena NS20 · Exit [B]`.
- **G1 pocket view** walk line: `从 B 出口出来 / Use Exit B`.
- Voice at the alight step (after the 6c.14 line): "出站时走 B 出口。/ Use Exit B when you leave." At the walk step: "从 B 出口出来。/ Use Exit B." (letters spoken as letters: `B`, `A 1`.)
- SR: "从 B 出口出来，出口牌子上写着 B，Tan Tock Seng Hospital。" / "Use Exit B. The sign says B, Tan Tock Seng Hospital."
- Lift exits: the table may later flag lifts; until then **no lift claims** (D-8).
- Baselines: `T5-alight`, `T5-walk`, `T5-h4`.

### 6d.6 T6 Transfer step card (MRT line change)
A walk step whose `to` is a platform of another line inside the same station complex (engine `transfer`; haptic `confirm`, 6c.13).

| Part | zh | en |
|---|---|---|
| Meta | 换车 · 第 3 步，共 6 步 | Change trains · Step 3 of 6 |
| Icon tile | `walk` on `c-primary-soft` + a 28 px line tag of the **next** line overlapping its corner | |
| Headline (`step`) | 换车：走到 [CC] 环线 月台 | Change: walk to the [CC] Circle Line platform |
| Sign chip (two lines, as on the station signs) | [CC] Circle Line · 往 HarbourFront 方向 | [CC] Circle Line · towards HarbourFront |
| Sub-line | 跟着 [CC] 的牌子走，大约 {n} 分钟。不用出闸门。 | Follow the [CC] signs, about {n} min. You don't need to go out through the gates. |
| Sub-line (out-of-system transfer, e.g. Bras Basah ⇄ Bencoolen) | 要先出闸门，再进去。用同一张卡，车费会连起来算。 | You'll go out through the gates and in again. Use the same card; the fare continues. |
| Next line | 然后坐 [CC] 往 港湾 HarbourFront 方向，坐 {n} 站 | Then take [CC] towards HarbourFront, {n} stops |

- The **towards** text is the terminus as printed on the platform (T7). If the engine can't name the terminus, the line reads `跟着 [CC] 的牌子走 / Follow the [CC] signs` only.
- Interchange stations with two directions on one platform (e.g. cross-platform at Jurong East): sub-line `在对面的月台上车 / Board from the platform across` only when the table says so.
- Voice (trip language): "换车。跟着环线的牌子走，坐往港湾方向的地铁。/ Change trains. Follow the Circle Line signs, towards HarbourFront." — line names are spoken as names, never codes.
- H4 timeline: a transfer row between the two train rows: `walk` icon · `在 {station} 换 [CC] 环线 · 大约 {n} 分钟 / Change to [CC] Circle Line at {station} · about {n} min`.
- SR: the card's headline and sign chip are read with the line code expanded ("CC 环线" → "环线"; en "Circle Line").
- Baselines: `T6-transfer`, `T6-transfer-out`, `T6-h4`.

#### 6d.6b Circle Line loop: boarding copy (replaces `step.board_train.loop*`, Director request)
The CCL has no terminus, and 顺时针 / 逆时针 ("clockwise / anticlockwise") is not how seniors (or the platform signs) think about a train. **Lead with a station name they can find on the platform sign: the next interchange in the direction of travel (`{via}`), as zh name + English sign text (T7). Never show or speak clockwise/anticlockwise.**

| Key | zh | en |
|---|---|---|
| `step.board_train.loop` (headline) | 坐 [CC] 环线，往 **{via_zh}** {via_en} 方向 | Take the [CC] Circle Line towards **{via_en}** |
| `step.board_train.loop.transfer` (headline) | 换车：坐 [CC] 环线，往 **{via_zh}** {via_en} 方向 | Change to the [CC] Circle Line towards **{via_en}** |
| Sign chip | `Circle Line · {via_en}` | `Circle Line · {via_en}` |
| Sub-line (always, confirms the side) | 这个方向的下一站是 {next_zh} {next_en}。 | In this direction, the next stop is {next_en}. |
| Voice | 坐环线，往{via_zh}方向。下一站是{next_zh}。 | Take the Circle Line towards {via_en}. The next stop is {next_en}. |
| Fallback (no `{via}` known) headline | 坐 [CC] 环线，下一站是 **{next_zh}** {next_en} | Take the [CC] Circle Line. The next stop is **{next_en}** |

- Example (from Bishan CC15, heading south): zh 坐 [CC] 环线，往 **实龙岗** Serangoon 方向 · sub 这个方向的下一站是 罗弄泉 Lorong Chuan。 en Take the [CC] Circle Line towards **Serangoon** · In this direction, the next stop is Lorong Chuan.
- `{via}` = the next interchange station in the direction of travel (as on the CCL platform signs), even if the user gets off before it; the next-stop sub-line is what confirms the side. If the user's alight station **is** that interchange, the headline still names it (it's both).
- `{direction}` (顺时针 / 逆时针) stays internal (engine/debug); it is not a UI string in either language. Dev: drop it from the two keys, or keep it out of rendered output.
- No-zh-name rule (T7) applies to `{via}` and `{next}`: English only, never translated.
- SR: "坐环线，往实龙岗方向，下一站罗弄泉" / "Take the Circle Line towards Serangoon, next stop Lorong Chuan".
- Baselines: `T6-ccl-board`, `T6-ccl-transfer`.

### 6d.7 T7 Station names display rule (zh name + code + English sign text)
Singapore station signs show the **English name**, the **Chinese name** and the **code**. Seniors must be able to match the screen to the sign. Rule:
- Interim for M3: H4 rows may read `碧山 Bishan (NS17)` (zh, English, code in brackets). The full T7 primary-mention layout on H4 is M5.

| Context | zh UI | en UI |
|---|---|---|
| Primary mention (step headline, H4 row, alert sign chip) | **诺维娜** [NS20] · `Novena` — zh name in the role's weight, then the line tag with the code, then the English sign text in `caption` (`lang="en"`) | **Novena** [NS20] (zh name hidden) |
| Sign chip (§5.3) — what to look for on the platform | `Novena · 诺维娜 NS20` (exactly as on the sign: English first) | `Novena NS20` |
| Towards (direction) | 往 **滨海南码头** Marina South Pier 方向 | towards **Marina South Pier** |
| Voice | zh name only: "在诺维娜下车。" (TTS reads codes badly) | English name only |
| SR | zh name + "NS20" (spelled "N S 20") | English name + code |
| No zh name in the table | English name only, in both UIs, **never machine-translated** | — |
| Interchange with several codes | All codes as tags, the one for the line in use first: [NS24] [NE6] [CC1] | the same |
| LRT | as MRT, line tag `LRT` (`line-lrt`) + code `BP6` | |

- **Bus stops:** SG bus-stop signs are English only. Show the English stop name as printed (`Opp Shaw Plaza`) + the 5-digit stop code in `caption`: `车站编号 53009 / Stop 53009` (printed on the pole). A zh name is added only for known landmarks from the same table (e.g. `Tan Tock Seng Hosp · 陈笃生医院`).
- The zh name table is the Dev data round (`src/shared/data`); this rule is how it displays.
- Baselines: covered by T5/T6 and the existing H5 MRT frames re-shot with codes.

### 6d.8 T8 Fare estimate + concession note (H3, H4)
Only when the OneMap itinerary has a fare (`fare` string); otherwise nothing is shown (no "unknown").
- **H3 card facts row**, after walk total: `card` icon (new) + `约 $1.19 / About $1.19`. SR: "车费大约 1 块 1 毛 9" → simpler and safe: "车费大约 1.19 元" / "Fare about 1 dollar 19".
- **H3 note** (the existing honest-note style, `card` icon), once under the cards: `车费是成人卡的价钱。用乐龄卡（Senior Citizen concession card）会更便宜。/ Fares shown are adult card fares. With a Senior Citizen concession card you pay less.`
- **H4** under the title line: `车费 约 $1.19（成人卡）· 乐龄卡更便宜 / Fare about $1.19 (adult card) · less with a senior card`.
- Settings → 出行 / Travel (M3): **我有乐龄卡 / I have a senior concession card** (开 / 关, default 关). When on, the note reads `你用乐龄卡，车费会比这里写的便宜。/ You use a senior card, so you'll pay less than shown.` We do **not** compute the concession fare (no reliable source; Director to confirm if a fare table appears).
- Never on H5 (not useful mid-trip). Never in voice.
- Baselines: `T8-h3`, `T8-h4`, `T8-h3-concession`.

### 6d.9 T9 Recent trips (H1, H2)
Stored on the device only (max 10, newest first; a trip is recorded when it **starts**, deduped on from+to).
- **H1:** a section under the tiles, before the help row: header `最近的行程 / Recent trips` (`label`, ink-2) + up to **5** rows (`.ritem`, 72 px): `clock` icon · `去 陈笃生医院 / To Tan Tock Seng Hospital` (`headline`) · `从 家 · 上星期二 / From Home · last Tuesday` (`caption`) · chevron. Tap → H3 to that destination **from where the user is now** (the row's From is a memory aid). If the user is within 300 m of the destination → the F5 "already here" toast pattern: `你现在就在 {dest} 附近。/ You're already near {dest}.`
- Rows whose route uses a disrupted line show the line tag + `有些站没有地铁 / No trains at some stations` as a second caption line (T3).
- Hidden when empty (no empty state on H1). Saved places (tiles) never appear as recent rows (no duplication); trips **to** a saved place do, because the From differs.
- **H2:** the existing `最近去过 / Recent` list shows recent **destinations** (from the same store), max 5.
- **Settings → 隐私 / Privacy:** `清除最近的行程 / Clear recent trips` (secondary 56 px, `trash`) → confirm sheet `要清除最近的行程吗？/ Clear recent trips?` · `这只会清除这部手机上的记录。/ This only clears the list on this phone.` · **清除 / Clear** (secondary) · **不用了 / Keep them** (primary). Toast `清除了 / Cleared`.
- Relative dates: 今天 / Today · 昨天 / Yesterday · 星期X / {weekday} (within 6 days) · 上星期X / last {weekday} · else `11月3日 / 3 Nov`.
- SR: one label per row: "去陈笃生医院，从家出发，上星期二。" / "To Tan Tock Seng Hospital, from Home, last Tuesday."
- `data-testid`: `recent-trips`, `recent-trip-{i}`, `clear-recent`. Baselines: `T9-home`, `T9-home-disrupted`, `T9-clear`.

### 6d.10 New items needing Director approval (M3)
- **Icons** (24 grid, 2.2 stroke, as §1.4): `seat`, `stand`, `full`, `wheelchair`, `wheelchair-no`, `deck2`, `train-off`, `card` (fare card). Eight.
- **Components** (existing tokens only): `.loadtag` (6d.2), `.exittag` (6d.5), `.banner.warn` (saffron-rule banner variant, 6d.3), arrival chip states `estimated` / `nodata` / `lastgone` / `notrunning`.
- **Settings rows (M3):** 出行 / Travel: 我用轮椅或助行器 · 我有乐龄卡; 隐私 / Privacy: 清除最近的行程.
- **Data asks (Dev / PM, not Creative calls):** the Worker's BusArrival response needs LTA `Monitored` (for `estimated`); BusRoutes `FirstBus`/`LastBus` per stop and day type (for `lastgone` / `notrunning`); the exit table with sign text and optional landmark; terminus names as printed.
- **No new tokens.**

## 6e. M4 share and safety

Frames for the M4 build (live share end-to-end, the public family viewer page, Help in full, family contacts, caregiver setup, taxi hand-off). From F8, F12, S2, S7 and ROADMAP M4; the PM's M4 requirements are being written in parallel. Reuse §1 tokens and §5–6c components. **No new colour, type, space, radius or motion tokens.** New icons, components, pages and API asks are listed in 6e.9.

Shared rules (as above, plus):
- Frame IDs: **P1–P8** (in-app), **V** (family viewer page, its own baselines), **W** (family-side setup page). Baselines: `M4-{frame}-{state}-{light|dark}-{100|200}-{zh|en}.png` at 390×844 DPR 2; the viewer also at **1440×900** (`M4-V-{state}-{light|dark}-1440-{zh|en}.png`).
- **Honesty about sharing.** We can open WhatsApp with the message ready, but we can't know it was sent or opened. Copy never says "she can see you now"; it says the link is ready / sent. (Replaces the H7 toast; see 6e.1.)
- **Calm safety copy.** Words like 安全 / safe, 加密 / encrypted appear once, plainly, next to the action they describe. No shields, no alarm red, no "WARNING".
- Names: `{fam}` = the contact's name as saved (美玲 / Mei Ling); `{me}` = what that contact calls the senior (妈妈 / Mum), set per contact (6e.4). Default `{me}` when unknown: 你的家人 / your family member.

### 6e.1 P1 Share flow end-to-end (replaces H7 copy where they differ)
Entry points: H4 quiet link `出发前，告诉家人 / Tell family before I go` · H5 map control `share` (SR 分享我的行程 / Share my trip) · Help sheet while not sharing (6e.3) · H12 when not shared (one-off message, below).

**Step 1 — 告诉谁？ / Who should know?** (sheet, history entry)
- Title 让家人知道你在哪里 / Let family see where you are · lead 他们会看到你在哪里、大约什么时候到。你到了 30 分钟后，分享会自己停止。/ They'll see where you are and about when you'll arrive. Sharing stops by itself 30 minutes after you arrive.
- Radiogroup of saved contacts (max 5, §5.8 cards: avatar initial, name, relation). The first contact is preselected. Last option: **别的人 / Someone else** (`person` icon), which skips the contact and lets WhatsApp/SMS pick the person.
- No saved contacts: the radiogroup is replaced by one row **加一个家人的电话 / Add a family phone number** (→ P4 add, then back here with that person selected) and the Someone else option.
- **Step 2 — 怎么发？ / How to send?** (same sheet, below the radiogroup):
  1. **用 WhatsApp 发送 / Send by WhatsApp** — jade, `tap-hero` 72. Opens `https://wa.me/{intl number}?text={msg}` (or `https://wa.me/?text=` for Someone else).
  2. **发短信 / Send a text message** — secondary 64. `sms:{number}?&body={msg}` (iOS `sms:{number}&body=`).
  3. **用别的方式发 / Send another way** — secondary 56, `share` icon. `navigator.share({ title, text, url })`; hidden where unsupported.
  4. **复制链接 / Copy link** — quiet, `copy` icon (new). Toast `链接复制好了 / Link copied`.
  5. Quiet: **看看家人会看到什么 / See what family will see** → the viewer preview (H8 frame = V page inside the app frame).
  - Lock line (`caption`, `lock`): 只分享这一次的行程。到了以后会自己停止，我们不会保存你的位置。/ Only this trip is shared. It stops by itself after you arrive, and we don't keep your location.
- **Preparing:** tapping 1–4 first creates the share (POST). The tapped button shows a spinner + `我在准备链接… / Getting the link ready…` (`aria-busy`), ≤ 10 s. If it fails or there is no internet, the sheet shows the 6b state panel inline: `现在发不了 / Can't send right now` · `请检查网络，再试一次。/ Check your internet and try again.` · **再试一次 / Try again** (primary) · **打电话给 {fam} / Call {fam}** (secondary, only with a contact).
- **Message** (language = the contact's message language, 6e.4; default the app language):
  - zh: `我正在去 {dest}，大约 {t} 到。按这里看我在哪里：{url} （我到了以后，这个链接会自己停止。）——怎么去?`
  - en: `I'm on my way to {dest}, arriving about {t}. See where I am: {url} (The link stops by itself after I arrive.) — 怎么去?`
- **Back in the app** (page visible again after WhatsApp/SMS): sheet closed, pill shown, toast `链接发出去了。{fam} 打开后就看得到你。/ Link sent. {fam} can see you once they open it.` (Someone else: `链接发出去了。对方打开后就看得到你。/ Link sent. They can see you once they open it.`) Haptic `confirm`. Polite.
- **Also share with another person:** the sharing sheet (below) offers `也发给别人 / Also send to someone else` → step 1 with the same link (no second share).
- **H12 one-off** (not sharing): `告诉{fam}我到了 / Tell {fam} I've arrived` opens WhatsApp with `我到 {dest} 了。/ I've arrived at {dest}.` — no share is created. The H12 tick reads `已经准备好给 {fam} 的信息 / Message ready for {fam}` (honest: we can't confirm sending).
- **Back goes to:** step 1 sheet → screen below; the preview → the sheet. Baselines: `P1-choose`, `P1-nocontacts`, `P1-preparing`, `P1-failed`, `P1-sent-toast`.

**Sharing pill states** (§5.6 pill, inside the H5 band, centred; tap → sharing sheet). SR = the visible text + "，按一下管理分享 / , tap to manage sharing".

| State | When | Pill | zh | en |
|---|---|---|---|---|
| `sharing` | share alive, last PUT accepted ≤ 60 s ago | `c-jade-soft` / `c-on-jade-soft`, blinking jade dot | 正在分享给 {fam} | Sharing with {fam} |
| `paused` | no fix or no internet for > 60 s (PUTs failing) | `c-surface-2` / ink, `wifi-off` icon, no dot | 分享暂停：没有信号 | Sharing paused: no signal |
| `help` | status `help` sent (6e.3) | `c-saffron` / ink, `help` icon | {fam} 知道你需要帮忙 | {fam} knows you need help |
| `arrived` | status `arrived` sent | jade-soft, `check` icon | 到了 · 分享 {t} 停止 | Arrived · sharing stops at {t} |
| `ended` | DELETE / auto-end / expiry | pill removed; toast below | | |

- `paused` → `sharing`: no toast (quiet recovery). Polite announcements on state change only.
- Ended by expiry while still travelling (4 h cap): toast `分享时间到了，已经停止。/ Sharing has reached its time limit and stopped.` + the share sheet offers **再分享一次 / Share again**.

**Sharing sheet** (tap pill or the share control while sharing):
- Title 正在分享给 {fam} / Sharing with {fam} · lead 你到了 30 分钟后会自己停止，最长 4 小时（到 {t}）。/ Stops by itself 30 minutes after you arrive, at most 4 hours (until {t}).
- **看看家人会看到什么 / See what family sees** (secondary, `eye`) · **再发一次链接 / Send the link again** (secondary, `msg`; reopens WhatsApp/SMS with the same message) · **也发给别人 / Also send to someone else** (secondary, `family`) · **停止分享 / Stop sharing** (secondary, `close`, last).
- **Stop sharing** is one tap (no confirm: it is safe and can be redone). DELETE → toast `已经停止分享。{fam} 现在看不到你了。/ Sharing stopped. {fam} can't see you now.` Haptic `confirm`. Voice: none. Offline: queued; the pill shows `正在停止分享… / Stopping sharing…` until the DELETE goes through, and the device stops sending positions at once.
- **Auto "arrived":** at `arrived_destination` the app PUTs `status: arrived` with the final position. The viewer turns to its `arrived` state (V). H12 tick reads `{fam} 的页面会显示你到了 / {fam}'s page shows you've arrived` (replaces `美玲已经知道你到了`, which we can't know). The share ends 30 min later (Worker alarm). Optional **Web Push** to family who opted in on the viewer (S7) is post-M4 unless the PM pulls it in; the viewer has no push UI until then.
- Baselines: `P1-pill-sharing`, `P1-pill-paused`, `P1-pill-help`, `P1-pill-arrived`, `P1-sheet-sharing`, `P1-stopped`.

### 6e.2 V Family viewer page `/t/:id` (standalone public web page)
A plain web page, **no install, no login, no app chrome**. It must work on an older relative's Android phone at 200% browser text, on an iPhone in WhatsApp's in-app browser, and on a desktop. It is the brand's first impression for many families: warm, calm, legible.

**Language:** default = the share's `lang`; a text toggle in the header **English** / **中文** (56 px, SR "Switch to English" / "切换到中文"); the choice is remembered on that browser (`localStorage`, try/catch). `<html lang>` follows.
**Theme:** follows the OS (`prefers-color-scheme`); no toggle. Same tokens as the app.
**Header** (60 px, `c-canvas`): logo mark 32 px + `怎么去?` (`label` 900) · language toggle. No other links.

**Phone layout (< 1000 px), top to bottom, `s-5` gutters, max column 560 centred from 600 px:**
1. **Status block** (`c-surface`, `r-l`, `e-1`, padding 20): avatar initial (`tint-home`) + **status sentence** (`title` 1.5 rem/700, the main message) → **ETA** (`display` 2.1 rem/900 tabular): `约 上午 10:39 到达 / Arriving about 10:39 am` → `还有 16 分钟 / 16 min to go` (`headline`, ink-2) → **step pill** (`c-jade-soft`, icon + `label`), e.g. `在 139 号巴士上，还有 3 站 / On bus 139, 3 stops to go`.
2. **Live map** (OneMap tiles, MapLibre; 300 px tall at 390, `r-l`, attribution visible): the sharer's puck (§6c.12 style, accuracy circle), the saffron destination dot when coordinates are known, north-up, **auto-fit** to puck + destination; a 56 px `locate` button (SR 回到她的位置 / Back to her position) appears after the viewer pans.
3. **Last updated** (`caption`, live dot): `刚刚更新 / Updated just now` (≤ 30 s) · `{n} 分钟前更新 / Updated {n} min ago`. Ticks every 15 s, **not** announced.
4. **Call button**: jade, `tap-hero` 72, `phone` icon: `打电话给{me} / Call {me}` → `tel:{number}`. Shown only when the share carries a number (6e.9 API ask). Without it: no button and no placeholder.
5. **Footer** (`caption`, centred): `{me}到了 30 分钟后，这个链接会停止（最长 4 小时）。/ This link stops 30 minutes after {me} arrives (4 hours at most).` · `怎么去? 不会保存任何人的位置。/ 怎么去? doesn't keep anyone's location.`

**Desktop (≥ 1000 px):** two panes, full height: left column 440 px (status block, last updated, call button, footer, scrolls) · right: the map fills the rest (min 560 px wide) with `r-l` corners and a 24 px margin. At 1440 the status sentence and ETA stay the same rem sizes (no hero scaling; calm). `max-width: 1600px` centred beyond.

**States** (status sentence · ETA · pill · map · call · extras). `{dest}` = destName.

| State | Trigger | Status sentence zh / en | Below |
|---|---|---|---|
| `loading` | before the first GET answers | — | Skeleton blocks + `正在打开… / Opening…` (`aria-busy`) |
| `waiting` | `status: waiting` (no PUT yet) | {me}还没出发 / {me} hasn't set off yet | Line `她出发后，这里会显示她在哪里。/ Once she sets off, you'll see where she is here.` (en: "Once they set off, you'll see where they are here.") · destination card `要去：{dest} / Going to: {dest}` · no ETA, no map · call button |
| `walk` | travelling, step walk | {me}正在去 {dest} / {me} is on the way to {dest} | ETA · pill `walk` `正在走路去 {place} / Walking to {place}` · map · call |
| `wait` | travelling, step wait | (same) | pill `clock` `在 {stop} 等 {svc} 号巴士 / Waiting at {stop} for bus {svc}` (train: `在 {station} 等地铁 / Waiting for the train at {station}`) |
| `bus` | travelling, ride bus | (same) | pill `bus` `在 {svc} 号巴士上，还有 {n} 站 / On bus {svc}, {n} stops to go` |
| `train` | travelling, ride train | (same) | pill `train` `在地铁上，往 {towards} 方向，还有 {n} 站 / On the train towards {towards}, {n} stops to go` (station names per T7) |
| `help` | `status: help` | **{me}按了“帮忙” / {me} tapped Help** | A **saffron panel** replaces the status block's top (`c-saffron` fill, ink text 12.1:1, `help` icon in an ink disc): title as left, line `她可能需要你。请打电话给她。/ She may need you. Please give her a call.` (en neutral: "They may need you. Please give them a call.") · the **call button moves into the panel** (ink fill, saffron text, 72 px) · then `她现在在 {near} 附近 / She's near {near} now` (revgeocode; hidden if none) · map · last updated. No red, no siren, no flashing. |
| `helpcleared` | `help` → `travelling` | jade-soft note at the top for 5 min: `{me}说她没事了。/ {me} says she's okay now.` | then the normal travelling state |
| `arrived` | `status: arrived` | **{me}已经到了 {dest} / {me} has arrived at {dest}** | jade check disc (64 px) with one saffron-dot ripple (static under reduce motion) · `{t} 到的 / Arrived at {t}` · map with the final position · `分享会在 {t+30} 停止 / Sharing stops at {t+30}` · call |
| `nosignal` | `status: paused`, or `updatedAt` > 2 min old while travelling | {me}的手机暂时没有信号 / {me}'s phone has no signal right now | `c-surface-2` note, `wifi-off`: `最后位置：{near} 附近，{n} 分钟前 / Last seen near {near}, {n} min ago` · `在地铁里或大楼里常常这样，信号回来后会自己更新。/ This often happens in the MRT or inside buildings. It will update by itself when the signal returns.` · ETA kept with 约 and `（可能有变化）/ (may change)` · puck grey (6c.12) · call |
| `ended` | `410 share_ended` / ws `ended`, not after arrival | {me}停止了分享 / {me} stopped sharing | `想知道她在哪里，可以打电话给她。/ To find out where she is, you can call her.` · no map, no last position (it was deleted) · call (if number known from earlier state) |
| `endedArrived` | ended after `arrived` | {me}已经到了 {dest}。分享结束了。/ {me} arrived at {dest}. Sharing has ended. | jade check · no map |
| `endedOk` | ended right after help was cleared | {me}说自己没事了。分享结束了。/ {me} says everything’s okay now. Sharing has ended. | jade check · `想再联系{me}，可以打电话。/ You can still give {me} a call.` · no map · call |
| (note) `full` | 51st viewer (AC 25) | top note on any state, `clock`: **看的人太多了，请稍后再试 / Too many people are watching. Please try again later.** + `这一页还会自己更新，只是慢一点。/ This page still updates, just less often.` | last state stays; GET polling |
| `expired` | `410 share_expired` / ws `expired` | 这个链接已经过期了 / This link has expired | `分享最长 4 小时。可以请{me}再发一个。/ Sharing lasts 4 hours at most. You can ask {me} for a new one.` · no map |
| `invalid` | `404` / malformed id | 找不到这个链接 / We can't find this link | `请检查链接是否完整，或请家人再发一次。/ Check the whole link was copied, or ask your family member to send it again.` · no map, no call |
| `offline` (viewer's own internet) | WebSocket closed and GET fails | a top note on any state: `你的网络断了，正在重新连接… / Your internet dropped. Reconnecting…` (`wifi-off`, spinner) | the last state stays on screen, last-updated keeps ticking honestly |
- **在地图上打开 / Open in Maps** — secondary 56, `locate`, under the call button whenever a position is shown; `https://maps.google.com/?q={lat},{lng}`, new tab.

- Pronouns: zh uses 她/他 only when the contact record says so; default zh "TA" is avoided by repeating `{me}`. en uses "they" unless set. (The share carries `senderName` and an optional pronoun, 6e.9.)
- **Updates:** WebSocket `/api/share/:id/live`; reconnect with backoff (1, 2, 5, 10, 30 s). Each `state` message updates in place without layout jumps (fixed-height ETA line).
- **Page title** (tab): `{me}正在去 {dest} · 怎么去?` → help: `{me}按了帮忙 · 怎么去?` → arrived: `{me}到了 · 怎么去?`. No title flashing.
- **Link preview (WhatsApp/OG):** generic and location-free: `og:title` `家人的行程 · 怎么去? / A family member's trip · 怎么去?`, `og:description` `看看家人现在在哪里，大约什么时候到。/ See where your family member is and about when they'll arrive.`, `og:image` = the logo icon. **Never** the destination or name in OG (previews are cached by WhatsApp servers). `robots: noindex, nofollow`.
- **Live regions:** polite = status sentence + pill on **state change** only. Assertive = `help` once ("{me}按了帮忙。她可能需要你。"). The last-updated ticker is `aria-live="off"`.
- **Haptics (viewer, Android only):** `attention` once on entering `help`; `confirm` once on `arrived`. Nothing else. **Voice:** none.
- **200% (browser text zoom / 2× root):** single column at every width below 1000; the ETA wraps under itself; the call button stays full width; the map keeps ≥ 240 px height; no horizontal scroll.
- **Reduce motion:** the live dot is solid, the arrival ripple is static, the map camera jumps.
- **Back:** browser default (no in-page Back). Links to the app: none (the family member doesn't need it). A small quiet footer link `这是什么？/ What is this?` opens an in-page `details` with two sentences about 怎么去? (no store links).
- `data-testid`: `viewer` with `data-state`, `viewer-call`, `viewer-lang`. Baselines: `M4-V-{loading|waiting|walk|wait|bus|train|help|helpcleared|arrived|nosignal|ended|endedArrived|expired|invalid|offline}-{light|dark}-{390|1440}-{zh|en}`, plus `-200` at 390 for `bus`, `help`, `nosignal`.

### 6e.3 P2 Help sheet, full (replaces §5.9 / H9 for M4)
Title 别担心，我来帮你 / Don't worry, I'm here to help. Fixed order:
1. **打电话给{fam} / Call {fam}** (jade disc, `phone`): sub `{relation} · 一按就打 / {relation} · one tap to call`; while sharing the sub reads `一按就打，她的页面也会显示你需要帮忙 / One tap to call. Her page will also show you need help` (honest about what the tap does). → `tel:` directly. With 2+ contacts, a second row **打给别的家人 / Call someone else** → P4 list in call mode. No contacts: the row is **加一个家人的电话 / Add a family phone number** → P4 add.
2. **给司机看地址 / Show the driver** (saffron disc, `car`): sub `大字显示，也可以叫车 / Big address, or book a ride` → H10 + taxi hand-off (6e.6).
3. **我在哪里？/ Where am I?** (`loc`): → H10 `here` tab, which gains **把我的位置发给{fam} / Send my location to {fam}** (secondary, WhatsApp with `我在这里：{address} {maps link}` / `I'm here: {address} {maps link}`).
4. **帮我重新找路 / Find my way again** (`route`, trip only): → re-plan from here (H11 found / 6c.8). Not on a trip: **带我回家 / Take me home** (`home`) → H3 to Home.
4b. **让家人看到我在哪里 / Let family see where I am** (`share`, `c-jade-soft` disc; only while nothing is shared): sub `用 WhatsApp 发链接给{fam}，说你需要帮忙 / Send {fam} a link by WhatsApp to say you need help` (no contact: `用 WhatsApp 发链接，说你需要帮忙 / Send a link by WhatsApp to say you need help`; offline: `需要网络 / Needs internet`). On a trip: starts the trip share with `status: help`. Not on a trip: a help-only share (`destName` 我在这里 / Where I am, `status: help`) that **keeps sending positions at the normal cadence until 我没事了 or 4 h**. Either way WhatsApp opens to the first contact with `我需要帮忙，我在这里：{url} / I need help. See where I am: {url}`. Failed, offline or 429 (AC 47): WhatsApp opens with `我需要帮忙。我在这里：{address} {maps link} / I need help. I'm here: {address} {maps link}`, or `我需要帮忙。/ I need help.` with no fix. Position rationale: Help runs from self-help to telling family to emergency.
- Help-only note (Home and step card, `c-saffron-soft`): `{fam} 的页面显示你需要帮忙。` + **我没事了** → ends the share; toast `好的，已经停止分享。{fam} 的页面会显示你没事了。/ Okay, sharing has stopped. {fam}'s page will show you're okay.` Baseline `P2-helponly-note`.
5. **紧急情况 · 拨打 995 / Emergency · Call 995** (danger outline, last). → confirm sheet: title `要打 995 吗？/ Call 995?` · `995 是救护车和消防。/ 995 is for an ambulance or the fire service.` · **拨打 995 / Call 995** (the **only** `c-danger` fill in the app, `c-on-danger`, 72 px) · **不用了 / No, go back** (secondary). Back = No.
- **Help status:** when sharing, tapping 1 or confirming 5 PUTs `status: help` (bypasses the rate limit, D-7). The pill turns `help` and a trip note appears on the step card (6c.10, `help` icon): `{fam} 的页面显示你需要帮忙。/ {fam}'s page shows you need help.` + button **我没事了 / I'm okay now** (secondary 56) → PUT `travelling`, pill back to sharing, toast `好的，已经告诉{fam}你没事了。/ Okay, {fam}'s page now shows you're okay.` Opening the sheet alone never sends `help`.
- Haptic: `tick` on open; `confirm` on each action. Voice: none (the user is reading). SR: each row's name = title + sub.
- **Back goes to:** the screen underneath; confirm sheet → Help.
- Baselines: `P2-trip-sharing`, `P2-home`, `P2-nocontacts`, `P2-995confirm`, `P2-helpnote`.

### 6e.4 P3–P4 Family contacts (saved on the device)
**P3 list** — `家人的电话 / Family phone numbers`, from Settings → 家人 / Family, and from Help/Share when empty.
- Lead: `有事的时候，一按就能打给他们。/ So you can call them with one tap when you need to.`
- Rows (max 5; `r-m` surface cards, ≥ 84 px): avatar initial (tint by order) · name (`headline`) + `{relation} · {phone formatted +65 9123 4567}` (`caption`, tabular) · first row has the tag `最先打给 TA / Called first` (`label` on `c-jade-soft`) · **call** 56 px jade round button (`phone`, SR `打电话给 {name} / Call {name}`) · **edit** 56 px round surface button (`edit` icon, new; SR `改 {name} 的资料 / Edit {name}`).
- Under the list: **加一个家人 / Add a family member** (dashed 72 px row, `plus`; replaced at 5 by caption `最多 5 个人 / Up to 5 people`) · **让家人帮我设置 / Let family set it up for me** (quiet → P5).
- Lock line: `家人的电话只存在这部手机里。/ Family numbers stay on this phone only.`
- Reorder: on the edit screen, `设为最先打给 TA / Make them first to call` (secondary). No drag.

**P4 add / edit** (screen, history entry). Title `加一个家人 / Add a family member` or `改 {name} 的资料 / Edit {name}`.
- **从手机通讯录选 / Pick from my contacts** (secondary 56, `family`) — Contact Picker API (Android Chrome); hidden where unsupported. Fills name + number.
- Fields (labels above, `label` 700; inputs 64 px, `body` 1rem+, `r-m`, 2 px `c-line` border, 3 px focus ring):
  1. `名字 / Name` (required) — placeholder `比如：美玲 / e.g. Mei Ling`.
  2. `TA 是你的… / They are your…` — chip radio (56 px, wraps): 女儿 Daughter · 儿子 Son · 太太 Wife · 丈夫 Husband · 孙子 / 孙女 Grandchild · 朋友 Friend · 邻居 Neighbour · 其他 Other.
  3. `电话号码 / Phone number` (required) — `type="tel"`, `inputmode="tel"`, a fixed `+65` prefix block; accepts an 8-digit SG number or a full `+` international number.
  4. `TA 叫你什么？/ What do they call you?` — placeholder `比如：妈妈 / e.g. Mum`; helper `在他们看到的页面上用。/ Used on the page they see.`
  5. `发给 TA 的信息用 / Messages to them in` — seg `中文 / English`.
- **保存 / Save** (primary 72, `check`) · edit only: **删掉 {name} / Remove {name}** (quiet) → confirm sheet `要删掉 {name} 吗？/ Remove {name}?` · **删掉 / Remove** (secondary) · **不用了 / Keep** (primary).
- **Validation** (on Save, never while typing; calm, `c-ink` text with the `info` icon, field border 3 px `c-ink`; no red): name empty `请写一个名字 / Please add a name` · phone short `这个号码好像少了几个数字 / This number seems to be missing some digits` · not SG and no `+` `新加坡号码是 8 个数字，外国号码请用 + 开头 / Singapore numbers have 8 digits. For other countries, start with +`. Focus moves to the first field with a note; polite announcement.
- Toasts: `存好了 / Saved` · `删掉了 / Removed`. Haptic `confirm`.
- **Back goes to:** P3 (unsaved changes are kept as a draft for this session; no "discard?" dialog).
- `data-testid`: `contacts`, `contact-call-{i}`, `contact-edit-{i}`, `contact-add`, `contact-save`. Baselines: `P3-list`, `P3-empty`, `P4-add`, `P4-edit`, `P4-invalid`, `P4-remove`.

### 6e.5 P5 Caregiver setup (senior side) and W family-side page
**Model:** the senior's phone shows a QR; a family member scans it with their own phone (or opens the same link sent by WhatsApp), fills in places and contacts on a web page, and sends them back. The senior's phone shows what arrived and applies it **only after one big confirm**. The data is end-to-end encrypted with a key that lives only in the QR/link fragment (`#k=`), never sent to our server. One-time, 30 minutes. *(Needs a small Worker relay; 6e.9.)*

**P5a Show the code** (screen; from Settings → 家人 / Family, P3, F1 page 3, and the H1 "Add a place" empty tile)
- Title `让家人帮你设置 / Let family set it up for you`.
- Lead: `请家人用他们的手机扫这个二维码。他们可以帮你加常去的地方和家人的电话。/ Ask a family member to scan this code with their phone. They can add your places and family phone numbers.`
- QR: always black on white (`#1D1915` on `#FFFFFF`, like the H10 address card, both themes), 240 px min (280 at 390 if space), 16 px quiet zone, `r-m` white card. `aria-label`: `设置用的二维码 / Setup code`.
- `或者把链接发给他们 / Or send them the link`: **用 WhatsApp 发送 / Send by WhatsApp** (jade 72) · **复制链接 / Copy link** (quiet).
- Status line (polite, `role="status"`): `等家人打开… / Waiting for your family to open it…` (spinner) → `家人正在填 / Your family member is filling it in` (when the page connects) → arrives → P5b.
- Lock line: `只有你的手机能打开他们填的资料。这个二维码 30 分钟后就不能用了。/ Only your phone can open what they fill in. This code stops working after 30 minutes.`
- Expired: the QR is replaced by the 6b state panel `这个二维码过期了 / This code has expired` · **再做一个 / Make a new one** (primary).
- Screen kept awake while shown (Wake Lock). Back → where it came from (the session is cancelled).

**P5b Review and confirm** (screen, replaces P5a in history)
- Title `{家人} 帮你设置好了 / {fam} has set things up for you` (from the sender name in the payload; else `家人帮你设置好了 / Your family has set things up`).
- Sections, each a surface card: `常去的地方 / Places` (mini tiles: icon + name + address) · `家人的电话 / Family phone numbers` (rows: name, relation, number) · `问好 / Greeting`: `早上好，{name} / Good morning, {name}` · `语言和字体 / Language and text size`.
- Replacements are named, never silent: `会换掉现在的“家” / This replaces your current Home` (`caption` with `info` icon) under the affected item.
- **好，用这些 / Yes, use these** — primary `tap-hero` 72, `check`, full width, pinned at the bottom (sticky at 200%).
- **不用了 / No thanks** — secondary 56.
- Caption: `以后可以在“设置”里改。家人不能从远处改你的手机，每次都要你按“好”。/ You can change these later in Settings. Family can't change your phone from far away; you always tap Yes first.`
- On Yes: apply, haptic `confirm`, toast `设置好了！/ All set!`, → H1 (with the new tiles and greeting). Voice: none. On No: nothing applied, toast `没有改动 / Nothing changed`, → where P5a was opened.
- Arrival of the data: haptic `attention`, polite announcement of the title, voice (if on) speaks the title + `看一看，没问题就按“好，用这些”。/ Have a look, and if it's right, tap Yes, use these.`
- **Back goes to:** = No thanks (nothing applied).

**W Family-side setup page** (`/s/:id#k=…`, standalone like V; same header, language toggle, OS theme)
- Title `帮家人设置 怎么去? / Set up 怎么去? for your family`.
- Lead: `你填的资料会加密，只有那部手机能打开。我们不会保存。/ What you fill in is encrypted so only that phone can open it. We don't keep it.`
- Form (single column, `r-l` sections, 64 px inputs): 1 `TA 的名字（用来问好）/ Their name (for the greeting)` e.g. 林阿姨 · 2 `家 / Home` (address search, OneMap) · 3 `常去的地方 / Places they go` (max 5: label chips 诊所 / 巴刹 / 女儿家 / 其他 + address search; `plus` add) · 4 `家人的电话 / Family phone numbers` (max 5; same fields as P4 incl. "what they call you" and message language; the first is called first) · 5 `语言和字体 / Language and text size` (seg 中文/English; 100/125/150/200%) · `你的名字 / Your name` (shown on their review screen).
- **发送到 TA 的手机 / Send to their phone** (primary 72). Then: `发好了。请 TA 在手机上按“好，用这些”。/ Sent. Ask them to tap "Yes, use these" on their phone.` Expired/used: `这个设置码已经用过或过期了。请在 TA 的手机上再打开一次。/ This setup code has been used or has expired. Open it again on their phone.`
- Desktop: centred 640 px column. 200%: single column, nothing truncates.
- Baselines: `P5a-code`, `P5a-filling`, `P5a-expired`, `P5b-review`, `M4-W-form`, `M4-W-sent`, `M4-W-expired` (+ 1440 for `W-form`).

### 6e.6 P6 Taxi hand-off (H10 additions)
Under the always-light address card on H10 (all tabs), a button stack (`s-3` apart):
- **用 Grab 叫车 / Book with Grab** — secondary 64, `car` icon. Android: `intent://open?…#Intent;scheme=grab;package=com.grabtaxi.passenger;S.browser_fallback_url=https%3A%2F%2Fwww.grab.com%2Fsg%2Ftransport%2F;end` with the drop-off prefilled when the deep link supports it (⚠ to verify); iOS: try `grab://` and, if the page is still visible after 1.5 s, show the caption `好像没有 Grab。可以用下面的方法。/ Grab doesn't seem to be on this phone. Try the options below.`
- **用 CDG Zig 叫车 / Book with CDG Zig** — secondary 64, `car`. Opens the ComfortDelGro Zig page (web link; the app if installed).
- **打电话叫德士 / Call for a taxi** — quiet, `phone`: `6552 1111（ComfortDelGro）` (⚠ Director to verify the number before release).
- Caption (`info`): `叫车会打开别的应用，车费由他们收。拦德士时，把上面的地址给司机看。/ Booking opens another app, and they charge the fare. If you stop a taxi, show the driver the address above.`
- The address card stays first and unchanged (always light, 17.5:1), Wake Lock on, landscape allowed. The buttons are below the fold at 200%; the card is never pushed off by them.
- H3 `none` state (6b F3) gains **给司机看地址 / Show the driver** (secondary) → H10 去目的地.
- Haptic `tick`. SR: names = visible text. Baselines: `P6-dest`, `P6-ios-nograb`, `H3-none-m4`.

### 6e.7 P7 Home and Settings in M4
- **H1 help row** sub-line uses the first contact: `打电话给{fam}，或给司机看地址 / Call {fam}, or show a driver your address`; no contacts: `加一个家人的电话，有事一按就打 / Add a family number to call with one tap`.
- **Settings** gains: `家人 / Family` → P3 · `让家人帮我设置 / Let family set it up for me` → P5a · (M3) 出行 / Travel · 隐私 / Privacy rows.
- Baselines: `P7-home-contacts`, `P7-settings`.

### 6e.7b P8 My places
Title `常去的地方 / My places` · lead `家总是排在第一个。最多可以存 6 个地方。/ Home is always first. You can save up to 6 places.` · G2 `.stoplist` rows with a 44 px 5.1-tint disc: Home row first (edit → Home sheet; none → `设好你的家`), then ≤ 5 places, each with **改名字 / Rename** (`.dwell`) and ↑ ↓ 🗑 (56 px, 8 px gaps) · dashed **加一个地方 / Add a place** (72) → search; at the cap the caption `最多 6 个地方 / Up to 6 places` · rename sheet `改名字` / `名字` / placeholder `比如：诊所 / e.g. Clinic` / **保存** · remove confirm as P4. H1 shows the places as 5.1 tiles after Home; tint from the label (诊所 clinic · 巴刹 market · 女儿/family family · else `c-surface-2`). Baselines `P8-list`, `P8-max`, `P8-rename`, `P8-remove`.

### 6e.8 Voice and haptics added in M4
| Moment | zh | en | Haptic |
|---|---|---|---|
| Share link sent (back in app) | — (toast only) | — | `confirm` |
| Sharing stopped | — | — | `confirm` |
| Setup arrived (P5b) | {fam}帮你设置好了。看一看，没问题就按“好，用这些”。 | {fam} has set things up for you. Have a look, and if it's right, tap Yes, use these. | `attention` |
| Setup applied | — | — | `confirm` |
| Viewer: help | (no voice) | | `attention` (viewer device) |
| Viewer: arrived | (no voice) | | `confirm` (viewer device) |
No new haptic names (6c.13 stays the canonical six).

### 6e.9 New items needing Director approval (M4)
- **Icons:** `copy` (two sheets), `edit` (pencil), `qr` (QR finder squares). Three new icons (adding a person reuses `plus`; contacts reuse `family`). (`wifi-off`, `person`, `info`, `trash` are already approved in 6b.)
- **Components / pages:** sharing pill states (6e.1); `.viewer` standalone page + desktop two-pane (V); `.qrcard` (always-light code card, like `.card2`); form fields `.field2` (labelled 64 px input + calm note); W setup page.
- **Copy deviations:** the H7 toast `她现在看得到你` and H12 `美玲已经知道你到了` are replaced by honest versions (6e.1); the H8 footer becomes the 30 min / 4 h line.
- **API asks (Dev / Director, not Creative calls):** `POST /api/share` gains optional `senderName` (≤ 40, "what they call you"), `callTel` (E.164) and `destLat/destLng`; `PUT` gains optional structured `step` (`{k: walk|wait|bus|train, svc, line, stops, place, towards}`) so the viewer can render either language (until then the viewer shows `stepText` as sent). New **setup relay** (`POST /api/setup`, WS, 30 min TTL, opaque ciphertext only; key in the URL fragment). OG tags for `/t/:id` must be generic (6e.2).
- **No new tokens.** `c-danger` fill appears only on the 995 confirm button (6e.3); `c-saffron` panel for viewer `help` reuses the get-off colour pair.

## 6f. M5 hardening and launch (1.0)

Frames for `docs/requirements/M5-hardening-launch.md` and the Director's M5 rulings (2026-11-18: production at the owner's custom domain; error counts ON with a Settings switch; battery saver at ≤ 20 % and not charging; no 1.0 in sample mode). Reuse §1 tokens and §5–6e components. **No new colour, type, space, radius or motion tokens.** Three new icons (6f.10). Drawn assets live in `creative/m5/` (`icons.svg`, `install/*.svg`, `field-test/`); `creative/m5/preview.html` is a sketch of the new pieces in both themes (`node creative/m5/build-preview.js --shots` re-renders it and checks overflow, clipping and 56 px targets).

Shared rules (as §6 / 6b, plus):
- Frame IDs **L1–L9** ("launch"). Baselines `M5-L{n}-{state}-{light|dark}-{100|200}-{zh|en}.png` at 390×844 DPR 2. Every frame is checked at 100 % and 200 % (`xxlarge`), zh/en, light/dark, and at 320 CSS px (AC 14).
- Targets ≥ 56 px, primary actions 72 px, ≥ 8 px (`s-2`) between targets. Text never truncates; rows wrap; bars grow taller.
- **Never during a trip:** the update bar, What's new, the install card and the in-app-browser bar do not render on H4 after Start, H5/H6/H6b, G1 pocket view, H11 or H12, nor over any sheet opened from them. They wait for H1 or Settings.
- No red. `c-danger` stays 995-only. Calm, honest copy: "需要网络", never "失败 / failed".
- **Reduce motion:** every new bar/card/sheet appears with the 120 ms cross-fade; nothing slides, pulses or bounces.
- Exact copy below is final. `{x}` = variable. zh first, en second.

### 6f.1 L1 Privacy page `/privacy` (AC 22, 23, 40)
A plain page, reachable from Settings → 隐私 → **隐私说明**, About, the family page footer (V) and `/setup` (W). It is a real route (deep-linkable, works offline from the shell cache), `lang` follows the app setting; opened from V or W it follows that page's language (`?lang=zh|en`).

**Layout:** top bar (Back, title) → title `title` role → lead `body` → "一眼看懂 / At a glance" card (`c-surface`, `r-l`, three rows: 48 px `c-surface-2` icon disc + `label` text) → five sections, each an `h2` (`headline`) and a bullet list (`body`, 8 px between items, bullets are 8 px `c-ink-2` dots, list semantics kept) → contact line → notice footer (`caption`). Max content width 480. Links are `.inlink` (`c-primary-text`, underlined). No accordions: everything is visible, the page scrolls.

Copy (zh ≈ 560 characters, en ≈ 390 words; both inside the AC 22 limit):

| Block | zh | en |
|---|---|---|
| Title | 隐私说明 | Privacy |
| Lead | 怎么去? 不用注册，没有广告，也不追踪你。下面说清楚你的资料去了哪里。 | 怎么去? has no sign-up, no ads and no tracking. Here is exactly where your information goes. |
| Glance 1 (`lock`) | 不用账号 | No account |
| Glance 2 (`check`) | 没有广告，不追踪 | No ads, no tracking |
| Glance 3 (`home`) | 你的资料多数只在这部手机里 | Most of your information stays on this phone |
| h2 1 | 留在这部手机里 | Stays on this phone |
| • | 你的称呼、家、常去的地方、最近去过的地方、家人的名字和电话、设置，还有正在走的行程。 | Your name, Home, your places, recent places, family names and numbers, your settings and the trip you are on. |
| • | 为了没有网络也能用，手机还会暂存看过的地图和最近的搜索结果。 | So it works without internet, the phone also keeps map pictures you have seen and recent search results. |
| • | 我们看不到这些。 | We cannot see any of this. |
| h2 2 | 发到我们的服务器 | Sent to our server |
| • | **找路和搜索：**你打的字、起点和终点，用来向 OneMap 和陆路交通管理局查询。我们不记下是谁问的。同样的问题会暂存最多 1 天，让下次更快，然后自动删掉。 | **Searches and routes:** what you type, and the start and end, so we can ask OneMap and the Land Transport Authority. We don't record who asked. The same question is kept for up to 1 day to answer faster next time, then deleted by itself. |
| • | **分享行程：**只在你分享时，发出你的位置、下一步、目的地的名字和家人怎么称呼你（还有你的电话，如果你同意）。分享最长 4 小时；到达后 30 分钟自动结束。结束时，位置和电话马上删掉，其余的最晚 4 小时内删掉。 | **Sharing a trip:** only while you share, we send your position, your next step, the name of where you're going and what family call you (and your phone number, if you allow it). A share lasts at most 4 hours and ends by itself 30 minutes after you arrive. When it ends, your position and number are deleted at once, and the rest within 4 hours. |
| • | **家人帮你设置：**家人填好的内容，先在他们的手机上锁好（加密）。我们只保管这个打不开的包，最多 24 小时；你打开一次，就删掉。 | **Family setup:** what your family fill in is locked (encrypted) on their phone first. We only hold the locked box, for at most 24 hours, and delete it once you open it. |
| • | **匿名错误统计（可以关）：**只有"哪一种问题、在哪个画面、几次"。没有位置、地址、搜索内容，也没有能认出你的东西。保留 90 天。可以在设置里关掉。 | **Anonymous error counts (you can turn this off):** only which kind of problem, on which screen, and how many times. No location, addresses, searches or anything that could identify you. Kept for 90 days. You can turn it off in Settings. |
| • | 我们的服务器记录里没有你的位置、地址、搜索内容或网络地址（IP）。网络地址只用来防止有人滥用，不会保存。 | Our server logs never contain your location, addresses, searches or internet address (IP). The IP is used only for a moment to stop misuse, and is not kept. |
| h2 3 | 还有谁会参与 | Who else is involved |
| • | **OneMap（新加坡土地管理局）：**地图和地址。你的手机直接向 OneMap 下载地图图片。 | **OneMap (Singapore Land Authority):** maps and addresses. Your phone downloads the map pictures straight from OneMap. |
| • | **LTA DataMall（陆路交通管理局）：**巴士和地铁资料，经过我们的服务器去问。 | **LTA DataMall (Land Transport Authority):** bus and train information, asked through our server. |
| • | **Cloudflare：**帮我们运行网站和服务器。 | **Cloudflare:** runs our website and server. |
| • | **WhatsApp、短信、电话、Grab、CDG Zig：**只有你按了才会打开。打开以后，由它们自己的隐私规定负责。 | **WhatsApp, SMS, phone calls, Grab, CDG Zig:** they open only when you tap them. After that, their own privacy rules apply. |
| h2 4 | 我们不做的事 | What we never do |
| • | 没有广告，不追踪你，没有账号，不卖你的资料，不用 cookie。 | No ads, no tracking, no accounts, no selling your data, no cookies. |
| h2 5 | 删除所有资料 | Deleting everything |
| • | 在设置里按 **清除所有资料**：这部手机上的资料全部删掉，包括暂存的地图和搜索。如果正在分享，会先停止分享。 | In Settings, tap **Delete all my data**: everything on this phone is removed, including saved maps and searches. If you are sharing a trip, sharing stops first. |
| • | 再把 怎么去? 从主屏幕删掉，就全部完成了。 | Then remove 怎么去? from your home screen, and you're done. |
| Family line (`caption`, under h2 5) | 家人打开行程链接时，不用安装，也不用账号；我们不记录是谁在看。 | When family open a trip link, they need no app and no account, and we don't record who is watching. |
| Contact (AC 23; until the owner supplies one) | 有问题？用设置里的 **报告问题**。 | Questions? Use **Report a problem** in Settings. |
| Footer (`caption`) | 说明版本 {n} · {date}（怎么去? {v}） | Notice version {n} · {date} (怎么去? {v}) |

- `{n}`/`{date}` come from one constant (`PRIVACY_NOTICE = { n: 1, date: '2026-11-xx' }`) bumped only when the text changes; `{date}` in words (2026年11月20日 / 20 Nov 2026); `{v}` = app version.
- **Report a problem** in the contact line is a link: in the app it opens the F6 Report sheet; from V/W (no app state) it goes to `/settings` → Report. When the owner supplies a contact, it **replaces** the contact line: 有问题？请联系 {contact}。/ Questions? Contact {contact}. (Owner-supplied alias only; the gate's secret scan allow-list.)
- "Delete all my data" in h2 5 is a link to Settings → the existing delete sheet (P-series `DeleteAllSheet`).
- **Facts this copy relies on (Developer must make them true before 1.0; QA checks in AC 25):**
  1. `DeleteAllSheet` also clears **Cache Storage** (`api-v1`, `tiles-v1`, `trip-tiles-v1`, `runtime-v1`; keep the shell) and, if a share or help-only share is live, sends `DELETE /api/share/:id` first. *Today it clears only `localStorage` + `sessionStorage`, so the SW keeps search/route responses and tiles.* Also update its body copy: 家、常去的地方、家人电话、设置和暂存的地图都会从这部手机上删掉。如果正在分享，会先停止。/ Home, your places, family numbers, settings and saved maps are removed from this phone. If you are sharing a trip, sharing stops first.
  2. The SW API cache honours its TTLs on read **and** deletes expired entries (search/revgeocode 24 h, others ≤ 10 min), so "recent search results" really are recent.
  3. Worker edge cache TTLs: search 1 day, revgeocode 1 h, route 2 min (`src/worker/src/api.ts` `TTL`). If any rises above 1 day, this page changes.
  4. Telemetry body is `{v, code, screen, n}` only; Stats keeps 90 days (AC 38–39).
  If any fact changes, Creative rewrites the line and `{n}` bumps.
- SR: one `h1`, five `h2`; the glance card is a `<ul>` with `aria-label` 一眼看懂 / At a glance; icons `aria-hidden`. Bold lead-ins are `<strong>`, read inline.
- 200 %: single column, the glance rows wrap under their disc; no horizontal scroll at 320 px.
- **Back goes to:** the screen that opened it (Settings, About). Opened directly or from V/W: the top-bar Back is `history.back()` when there is history, otherwise it is replaced by a quiet link **打开 怎么去? / Open 怎么去?** → `/`.
- Baselines: `M5-L1-top`, `M5-L1-full` (full-page), `M5-L1-contact` (with an owner contact, for later), each light/dark × 100/200 × zh/en.

### 6f.2 L2 About `/about` (reworked, replaces the F6 About block; AC 24)
Order, top to bottom:
1. Wordmark (`wordmark` live text + the seal at 72 px), then `body`: **版本 {v}（{buildDate}）/ Version {v} ({buildDate})**, date in words.
2. **Sample-mode line** (only when `/api/health` says `fixtureMode:true`, i.e. preview or local; never on 1.0 production): a `.tripnote`-style panel, `c-saffron-soft`, `info` icon: **现在是示范路线，不是真的巴士和地铁资料。/ These are sample routes, not real bus and train information.** SR reads it as part of the page (no live region).
3. **地图和数据 / Maps and data** (`h2`), the attribution block on `c-surface`, `r-l`, padding 18:
   - OneMap logo (the official asset, ≥ 24 px tall, `alt="OneMap"`) + the line exactly **Map data © contributors, Singapore Land Authority** (English in both languages; AC 24 wording replaces the F6 "Map data © OneMap / Singapore Land Authority").
   - zh only, `body`: 地图和地址来自 OneMap（新加坡土地管理局）。 / en: Maps and addresses come from OneMap (Singapore Land Authority).
   - The LTA line, English in both languages, with the Open Data Licence linked (`.inlink`, new tab, as M3): **Contains information from LTA DataMall accessed on {dataDateEn} which is made available under the terms of the Singapore Open Data Licence version 1.0.** `{dataDateEn}` = `DATA_AS_OF` as "17 November 2026".
   - zh only, `caption`: 交通资料日期：{dataDateZh}（2026年11月17日）. (In en the date is already in the licence line; no second caption.)
   - Map tiles are OneMap only, so no OpenStreetMap line. If tiles ever change provider, its attribution joins this block.
4. **你的隐私 / Your privacy** (`h2`): one line 你的资料多数只留在这部手机里。/ Most of your information stays on this phone. → row **隐私说明 / Privacy** (56 px, `lock` icon, chevron) → L1.
5. Row **报告问题 / Report a problem** (56 px, `report` icon, chevron) → F6 Report sheet.
- **No open-source licences list or link** (owner preference, F6). AC 24's "`licenses.txt`, linked" is a deviation for the Director: recommend the build may still emit `licenses.txt` at the site root for compliance, unlinked from the UI.
- No privacy contact line here; L1 carries it when it exists.
- SR: `h1` 关于 / About; the version line reads "版本 1.0.0，2026年11月20日". The OneMap logo `alt` + the line read as one sentence.
- **Back goes to:** Settings. Baselines: `M5-L2-live`, `M5-L2-sample`.
- Settings row label changes from 关于和隐私 / About & privacy to **关于 / About** (privacy has its own row, L7).

### 6f.3 L3 Update bar and What's new (AC 17, 21; supersedes F7)
**Update bar** (`.updbar`, the §5.7 info banner: `c-surface`, 8 px `c-jade` left rule, `r-m`, `e-2`, `refresh` icon). Shown on **H1 (under the top bar, above the greeting)** and **Settings (top of the list)** when a new SW is waiting and no trip is active.
| State | Visible | SR / behaviour |
|---|---|---|
| `waiting` | **有新版本 · 点这里更新** / **New version · tap to update**; ✕ on the right (56 px) | Whole bar minus ✕ is one button, name "有新版本，按一下更新" / "New version ready. Tap to update". ✕ name 以后再说 / Later. Announced once, polite, when it appears. |
| `updating` | refresh icon turns (1.2 s linear loop; reduce motion: static) + **正在更新…** / **Updating…**; ✕ hidden | `aria-busy="true"`, button `aria-disabled`. Page reloads once when the new SW takes control. |
| `slow` (no control after 10 s) | **这次没更新好，下次打开时会自动更新。** / **It didn't update this time. It will update next time you open the app.** ✕ visible | Polite announce. No retry loop. |
- ✕ hides the bar until the next launch; the update still applies on the next cold start (as F7).
- During a trip: the waiting state is remembered; the bar appears on H1 after the trip ends, never mid-trip, never reloading.
- After the reload: toast `updated` (F5), **except** the first launch on 1.0.0, which shows What's new instead (no toast on top of a sheet).
- 200 %: text wraps to 2–3 lines beside the icon; ✕ stays top-right; bar min-height 56.
- Baselines: `M5-L3-bar-home`, `M5-L3-bar-settings`, `M5-L3-updating`, `M5-L3-slow`.

**What's new sheet** (`role=dialog`, §5 sheet, once per device after updating to 1.0.0; never during a trip; flag `whatsnew.v1`):
- Title: **怎么去? 1.0 来了** / **怎么去? 1.0 is here**
- Three rows (`body`, 48 px `c-surface-2` icon disc each, `<ul>`):
  1. `bus` — 现在用的是真的巴士和地铁资料。/ Bus and train times are now real.
  2. `leaf` — 电量低时会自动省电，下车提醒照样准时。/ When your battery is low, it saves power by itself. Get-off alerts still come on time.
  3. `wifi-off` — 没有网络也能打开，你的家和家人电话都还在。/ It opens without internet. Your Home and family numbers are still there.
- One button: **知道了 / Got it** (primary 72). No second action (one action per moment); privacy is announced through Settings, not here.
- Focus moves to the title on open, back to H1's search button on close. Back = Got it.
- **Back goes to:** H1 (or Settings if it opened there). Baseline: `M5-L3-whatsnew`.

### 6f.4 L4 "Add to Home Screen" helper (AC 26–29)
One **install card** on H1, after the second completed search or route view, never on first run, never during a trip, never when standalone / `navigator.standalone` / `capabilities.native`, never in battery saver during a trip. Placement: **under the place tiles, above Recent** (it never pushes the search button off the first screen). Card = §5 card (`c-surface`, `r-l`, `e-1`, padding 18): 60 px `c-primary-soft` tile with `install` → title (`headline`) → body → buttons.

Title and body are the F6 install-sheet copy (one voice everywhere; AC 26's "放到桌面" is replaced by the established 主屏幕, which is also the word iOS and Android show):
- Title **把 怎么去? 放到主屏幕** / **Put 怎么去? on your home screen**
- Body **以后一按图标就能打开，像普通应用一样。** / **Then one tap on the icon opens it, like any other app.**

**L4a Android** (Chrome, Edge, Samsung Internet with a captured `beforeinstallprompt`):
- **放到主屏幕 / Add to home screen** (primary 72, `install`) → native prompt. Accepted → card gone, toast `installed`. Prompt dismissed → counts as a dismissal.
- **以后再说 / Not now** (quiet 56). Hidden 14 days. On the second showing, a `caption` under the buttons: 以后也可以在设置里安装。/ You can also do this later in Settings. Second dismissal → never again (Settings keeps its Install row).
- Android without a captured prompt (e.g. Firefox): the button reads **看看怎么做 / Show me how** → F6 install sheet (Android steps).

**L4b iOS Safari** (and iOS Chrome / Edge ≥ 16.4):
- Button **看看怎么做 / Show me how** (primary 72) → **picture guide sheet**:
  - Title **放到主屏幕，三步就好** / **Three steps to your home screen**
  - `<ol>`, each step = 32 px `c-primary-soft` number disc + `body` text + one drawn picture (inline SVG from `creative/m5/install/`, max-width 280, `r-m`, on `c-surface-2`; `aria-hidden`, the text carries the meaning):
    1. 按分享按钮（一个方框，上面有箭头）。/ Tap the Share button (a square with an arrow pointing up). — `ios-step1-safari.svg` (Chrome: `ios-step1-chrome.svg`). Under it, `caption`: 看不到？先按右下角的"⋯"。/ Can't see it? First tap "⋯" at the bottom right. (Chrome: 分享按钮在网址栏的右边。/ The Share button is at the right of the address bar.) (Edge: 先按下面中间的"⋯"，再按"分享"。/ First tap "⋯" at the bottom middle, then "Share". ⚠ verify on a device.)
    2. 往下滑，按"添加到主屏幕"。/ Scroll down and tap "Add to Home Screen". — `ios-step2-{zh|en}.svg`
    3. 按右上角的"添加"。/ Tap "Add" at the top right. — `ios-step3-{zh|en}.svg`
  - **好了，我知道了 / OK, got it** (primary 72) closes the sheet and counts as "shown", not as a dismissal. `appinstalled` never fires on iOS: the card hides for good once the app is opened standalone.
  - The pictures use classes `ig-*` and read `--c-*` tokens with light fallbacks, so they **must be inlined** (not `<img>`) to follow dark mode. The saffron ring marks "tap here"; the seal in step 3 keeps its brand colours in both themes (§0).
- Card's quiet **以后再说 / Not now** behaves as L4a.

**L4c Other iOS browsers and iOS < 16.4** ("Open in Safari"):
- Body replaced by **在 iPhone 上，要用 Safari 才能放到主屏幕。** / **On iPhone, only Safari can put it on your home screen.**
- **复制链接 / Copy link** (primary 72, `copy`) → copies the site root (never the current URL with its query) → toast: **已经复制了。打开 Safari，在网址栏按住，选"粘贴并前往"。** / **Copied. Open Safari, press and hold the address bar, then choose "Paste and Go".**
- Steps (`<ol>`, `body`): 1. 按"复制链接"。/ Tap "Copy link". 2. 打开 Safari（蓝色指南针图标）。/ Open Safari (the blue compass icon). 3. 在网址栏按住，选"粘贴并前往"。/ Press and hold the address bar and choose "Paste and Go".
- Quiet **以后再说 / Not now**.

**L4d In-app browser bar** (WhatsApp, Facebook, Instagram, Telegram, WeChat, Line by UA token; never on `/t/:id` or `/setup`; never during a trip):
- A slim **non-sticky** band at the very top of H1 (`c-surface-2`, full bleed, min-height 64, `s-5` gutters, `open-browser` icon + `label` text + one button). `role=region`, name 打开方式 / How to open.
- Text **在浏览器里打开会更好用** / **Works best in your browser**.
- **Android:** button **用 Chrome 打开 / Open in Chrome** (secondary 56) → `intent://{host}/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url={encoded root};end`. If the page is still visible after 1.5 s, the button changes to **复制链接 / Copy link** with toast `copied`-style text: 已经复制了。打开 Chrome，贴到网址栏。/ Copied. Open Chrome and paste it into the address bar.
- **iOS:** button **怎么打开？/ How?** (secondary 56) → small sheet: title 用 Safari 打开 / Open in Safari · line 1 按右上角或右下角的"⋯"，选"在浏览器中打开"。/ Tap "⋯" at the top or bottom right and choose "Open in browser". · line 2 没有这个选项？/ No such option? → the L4c copy-link steps and button.
- ✕ (56, 以后再说 / Later) hides it for the session.
- 200 %: text on its own line, button below it, left-aligned; ✕ top-right.
- Hook lines `install:shown|accepted|dismissed` only (no UA).
- **Back goes to:** sheets close to H1. Baselines: `M5-L4a-card`, `M5-L4a-card-second`, `M5-L4b-card`, `M5-L4b-guide`, `M5-L4b-guide-chrome`, `M5-L4c-safari`, `M5-L4d-android`, `M5-L4d-ios`, `M5-L4d-ios-sheet`.

### 6f.5 L5 Battery saver (AC 8–9)
**Settings row** in group 出行 / Travel (after 少走楼梯，用电梯): icon `leaf`, label **省电模式 / Battery saver**, value in `c-ink-2`: 自动 / Auto · 自动（现在开着）/ Auto (on now) · 开 / On · 关 / Off. Tap → sheet.

**Sheet** (`role=dialog`), title **省电模式 / Battery saver**, a stacked `.seg` radiogroup (§5.0 sheet rule), each option 56 px+ with a sub-line:
| Option | zh | en |
|---|---|---|
| 自动 Auto (default) | **自动** · 电量剩 20% 或更少、又没在充电时，自动打开。 | **Auto** · Turns on when the battery is at 20% or less and isn't charging. |
| 开 On | **开** · 一直省电。 | **On** · Always save battery. |
| 关 Off | **关** · 不省电。 | **Off** · Don't save battery. |
- Note under the options (`caption`, `leaf` icon): **省电时，地图动得少一些，家人看到你位置的次数也少一些。下车提醒、帮忙和到达消息不会受影响。** / **While saving battery, the map moves less and family see your position less often. Get-off alerts, Help and arrival messages are never affected.**
- **Not supported** (no Battery Status API: iOS, Firefox): the Auto sub-line becomes **这部手机不能告诉我电量，所以"自动"不会打开省电。需要时请选"开"。** / **This phone can't tell me its battery level, so Auto won't turn it on. Choose On if you need it.** The Settings row value reads 自动（这部手机不支持）/ Auto (not on this phone). Auto stays selectable (it behaves as Off), so a later browser update just works.
- Changes apply at once, also mid-trip.

**H5 leaf chip:** when battery saver is active during a trip, the step card's meta row gets a chip at its right end: `c-surface-2`, `r-s`, `leaf` 18 px + **省电模式 / Battery saver** (`label`). Not a button (no chevron, not focusable); it sits in the card, never on the map (6c.0). At 200 % it wraps onto its own line under the step counter. Pocket view (G1): one `caption` line under the main line, `c-ink-2` on black (`#CFC3B5`, 10.9:1): 省电模式 / Battery saver.
- When Auto turns it on mid-trip: chip fades in (280 ms; reduce motion: appears), and one polite announcement: **电量低了，已经打开省电模式。下车提醒照样会响。** / **Battery is low, so battery saver is on. Get-off alerts will still sound.** No voice line, no toast, no haptic (never compete with trip guidance). Turning off (charging) removes the chip silently.
- SR: the chip is plain text inside the meta row ("第 3 步，共 5 步，省电模式").
- **Back goes to:** sheet → Settings. Baselines: `M5-L5-row`, `M5-L5-sheet`, `M5-L5-sheet-unsupported`, `M5-L5-h5-chip`, `M5-L5-g1`.

### 6f.6 L6 Offline cold start (AC 20)
App opened with no network (shell from the SW). H1 renders as usual with the existing offline note (F5 `offline` persistent note on H1). Then:
- **Nothing spins.** Any control that needs the network keeps its label and adds a second line `caption` in `c-ink-2` with `wifi-off` 16 px: **需要网络 / Needs internet**. Controls: the search button (去哪里？), place tiles (sub-line replaced), the 回家 / Take me home dock, Recent rows, H3 options.
- Those controls stay enabled and focusable (no greyed-out text below AAA). Tap → no navigation, haptic `tick`, polite announcement **需要网络。连上网络以后再按。** / **Needs internet. Tap again once you're online.** The search button is the exception: it opens H2, where F4 `offline` shows and the Recent list stays readable.
- On `online`: the second lines disappear, toast `online` (F5). No auto-navigation.
- Still fully working: My places and family contacts (view/edit), Settings, Privacy (L1 is precached), About, Help: **call family** (`tel:`), **Show the driver** (Home tab; 我在哪里 tab shows the last known address with `caption` 这是 {time} 的位置。/ This was where you were at {time}., or, if none, 现在找不到地址。可以给司机看你家的地址。/ No address right now. You can show the driver your home address.), **995**. 帮我重新找路 is hidden (no trip). 我在哪里？ row sub: 需要网络 / Needs internet when there is no last known address.
- SR: the second line is part of the control's name ("回家，需要网络" / "Take me home, needs internet").
- 200 %: the second line wraps under the label; tiles grow taller; no clipping.
- An in-flight request that loses the network resolves to the F3/F4 `offline` panel, never an endless spinner.
- **Back goes to:** unchanged. Baselines: `M5-L6-home-offline`, `M5-L6-help-offline`, `M5-L6-driver-offline`.

### 6f.7 L7 Settings in M5: privacy group, error counts (AC 40) and row order
Settings groups (F6 + 6e.7, final order for 1.0):
1. Update bar (L3) if waiting.
2. **我 / Me** — 称呼 · 家 · 常去的地方 · 家人.
3. **看和听 / Display** — 语言 · 字体大小 · 颜色 · 减少动画 · 语音提示 · 震动提示.
4. **出行 / Travel** — 先给我看 · 轮椅 · 乐龄卡 · 少走楼梯，用电梯 · **省电模式 / Battery saver** (L5).
5. **隐私 / Privacy** — 我的电话号码 · 分享时让家人打给我 · **发送匿名错误统计** (below) · **隐私说明 / Privacy** (→ L1) · 清除所有资料 / Delete all my data · 记录：清除最近去过的地方.
6. **这个应用 / This app** — 安装到主屏幕 (hidden when standalone) · 让家人帮我设置 · 报告问题 · **关于 / About** (L2). Under the groups: `caption` 版本 {v} / Version {v}.

**Error-counts row** (switch row, as 6c switch rows: label left, switch right, sub-line under, whole row is the switch, 56 px+):
- Label **发送匿名错误统计 / Send anonymous error counts** · default **On** (Director ruling).
- Sub-line (on and off alike): **只发"哪种问题、几次"，帮我们修好它。不含位置、地址或搜索内容。** / **Only sends which kind of problem and how often, so we can fix it. No location, addresses or searches.** + inline link **详细 / Details** (→ L1, h2 2). The link is a separate 56 px target below the sub-line at 200 %.
- SR: `role=switch`, name = label, `aria-describedby` = sub-line; state "开 / on", "关 / off".
- Off = nothing is sent from that moment (queued counts are dropped). No confirmation sheet either way (it is not destructive).
- Baselines: `M5-L7-settings` (full page), `M5-L7-errors-off`.

### 6f.8 L8 Family viewer and setup page links (entry-point parity)
- **V (`/t/:id`) footer:** after the existing 30 min / 4 h line, a `.inlink` **隐私说明 / Privacy** → `/privacy?lang={viewer lang}` (same tab). V sends no error counts and shows no install card, update bar or in-app bar.
- **W (`/setup`)**: under the lock line, **隐私说明 / Privacy** link, same rule.
- Baselines: `M4-V-active-…` re-recorded with the link; `M5-L8-setup-link`.

### 6f.9 L9 Field-test kit: feedback form and consent line (AC 41)
**Feedback form:** `creative/m5/field-test/feedback-form.html` (source) and `feedback-form.pdf` (A4, printed both sides of **one sheet**: page 1 = 7 smiley questions, page 2 = 3 open questions). Black ink only, so a mono printer works; question text 16.5 pt zh / 12.5 pt en; 3-face scale (not 5: easier to choose, and the labels say what each face means); a P-number, never a name. PM copies it into `docs/field-test/` (PM-owned) and keeps the plain-text list below beside it.

Plain-text list (same questions):
1. 字够大、看得清楚吗？/ Was the writing big and clear enough? — 不好 · 还可以 · 很好 / Not good · OK · Good
2. 找到要去的地方，容易吗？/ Was it easy to find the place you wanted? — 不容易 · 还可以 · 很容易
3. 一步一步的提示，清楚吗？/ Were the step-by-step directions clear? — 不清楚 · 还可以 · 很清楚
4. 下车提醒，来得及吗？/ Did the get-off reminder come in time? — 来不及 · 差一点 · 来得及; and tick: 听到声音 / Heard it · 感到震动 / Felt it · 看到画面 / Saw it · 没注意到 / Didn't notice
5. 语音说得清楚吗？/ Was the voice clear?
6. 用的时候，你觉得安心吗？/ Did you feel at ease using it?
7. 你还会再用它吗？/ Would you use it again? — 不会 · 可能 · 会
8. 哪里最好用？/ What worked best? (open)
9. 哪里让你不明白，或者不放心？/ What was confusing or worrying? (open)
10. 你最希望它还能帮你做什么？/ What one thing would you most like it to help with? (open)

**Consent line** (the owner reads it aloud before anything else, then ticks 已同意（口头）/ Agreed (spoken) on the form):
> 我在试一个帮老人家坐巴士和地铁的手机应用，叫"怎么去?"。今天想请你用一用，然后告诉我哪里好、哪里不好。如果有什么不好用，那是应用的问题，不是你的问题。我不会录音、录像，也不会拍你的脸，也不写你的名字。试的时候，你的位置只会分享到我这部手机，试完就停。你随时可以停下来，不用说原因。可以开始吗？

> I'm testing a phone app called 怎么去? that helps older people get around by bus and train. I'd like you to try it today and then tell me what works and what doesn't. If something is hard to use, that's the app's fault, not yours. I won't record sound or video, take photos of your face, or write down your name. During the test your location is shared only with my phone, and that stops when we finish. You can stop at any time without giving a reason. Is it okay to start?

Checked: 390 px screen (no horizontal scroll) and A4 print (2 pages, no row split, no text/face overlap) by `creative/m5/build-preview.js --shots` → `creative/m5/shots/feedback-form-390.png`, `feedback-form-a4-print.png`.

### 6f.10 New items needing Director approval (M5)
- **Icons** (`creative/m5/icons.svg`, same grid and stroke as §1.4): `leaf` (battery saver), `add-square` (only to mirror iOS "Add to Home Screen" in instructions, like `ios-share`), `open-browser` (in-app-browser bar).
- **Drawn pictures:** `creative/m5/install/ios-step1-safari.svg`, `ios-step1-chrome.svg`, `ios-step2-{zh,en}.svg`, `ios-step3-{zh,en}.svg` (inline only; classes `ig-*`).
- **Components:** `.updbar` states (L3), install card (L4), in-app-browser band (L4d), leaf chip (L5). All built from existing tokens.
- **Copy deviations from the PM's ACs:** AC 24 licences link dropped (owner preference; `licenses.txt` may exist unlinked); AC 24 OneMap line uses the AC wording, which replaces F6's; AC 26 放到桌面 → 放到主屏幕 (consistency with F6 and the OS wording).
- **Build asks (Developer):** Delete all clears Cache Storage and stops a live share first (L1 fact 1); SW API cache prunes expired entries (fact 2); `PRIVACY_NOTICE` constant; `/privacy` precached.
- **No new tokens.**

### 6f.11 Text size 较小 85% / Smaller (owner request 2026-11-18, v1.4.1)
Owner: the text is a little big for younger, normal-sighted users. Director: add **one** option below 100%; new installs still default to **100%** (seniors first); the option appears everywhere the text-size choice appears today.

**Value and key.** `--ts: 0.85` → root 17px. Settings key `textSize: 'small'`; `:root[data-text-size="small"]{--ts:.85}` in `tokens.css`; `TEXT_SCALE.small = 0.85`, first in `TEXT_SIZES` (ascending order). `setup.ts` accepts `'small'`. No new tokens: it is one more value of the existing `--ts`.

At 85% (px, rounded): `body` 17 · `label` 15.3 · `caption` 14.5 (absolute floor; nothing but map attribution is smaller) · `button` 19.6 · `headline` 20.4 · `step` 24.7 · `display` 35.7 · `alert` 40.8 · `arrival` 51. The get-off alert and arrival stay the largest things on screen.

**Labels.** zh **较小** · en **Smaller**. It is relative to Standard and says nothing about age or eyesight (never "young", "normal" or "small print").
- First-run card: `较小 85% / Smaller` (same pattern as the other cards: zh name + %, `/`, en name).
- Settings and W setup page segments: `85%` (like the others).
- i18n key `size_85`: `较小` / `Smaller`.

**Screen-reader names** (every place, zh / en; the % alone is not enough):

| Option | zh | en |
|---|---|---|
| 85 | 较小，85% | Smaller, 85% |
| 100 | 标准，100% | Standard, 100% |
| 125 | 大，125% | Large, 125% |
| 150 | 特大，150% | Extra large, 150% |
| 200 | 最大，200% | Largest, 200% |

Settings and W segments get these as `aria-label`; first-run cards already read them from their text. Home `AA` button: `字体大小：85%` / `Text size: 85%` (existing pattern).

**Position and layout (390 × 844, `s-5` gutters, content 350 px).**
- **First run (F1 page 1)** `.radiogrid`, order 较小 85% · 标准 100% · 大 125% · 特大 150% · 最大 200%. Add `.radiogrid > :last-child:nth-child(odd){grid-column:1/-1}`.
  - 85% and 100%: 2 columns of 169 px → rows [较小 | 标准] [大 | 特大] [最大, full width]. Cards ≥ 72 px (79 px at 85%, 88 px at 100%; zh and en wrap onto two lines).
  - 200%: 1 column, 5 full-width cards (up to 146 px each where the label wraps). No horizontal scroll.
  - 标准 100% is pre-selected; Skip keeps 100%.
- **Settings (H13 / F6 看和听)**: the text-size `Seg` gets class `sizes`: `.seg.sizes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,5rem),1fr))}`. 85% and 100%: 3 columns of 111 px → [85% | 100% | 125%] [150% | 200%], each 56 px tall. 150% and 200%: the existing rule stacks it into one column of full-width 56 px+ rows.
- **W family setup page** (`/setup`, 6e.5) language-and-size card: the same `.seg.sizes` with 5 options (inside the card: 2 columns, [85 | 100] [125 | 150] [200]). Its default stays **125%** (it sets up an older person's phone).
- **Home `AA` button** cycles 100 → 125 → 150 → 200 → 100 and **never lands on 85%**: a senior tapping AA again and again must not end up below Standard. From 85% the next tap goes to 100%. 85% is chosen only on purpose (first run, Settings, W).

**Preview sentence.** Unchanged: the page re-renders at the chosen size, and the preview card reads 早上好！今天想去哪里？/ Good morning! Where would you like to go today? in `display`. Only while 85% is selected, a `caption` in `c-ink-2` sits under the preview: **字会变小。看不清楚，可以在设置里改回来。** / **Text gets smaller. If it's hard to read, change it back in Settings.** It is not announced separately (the radio state already is). The same line sits under the Settings segment while 85% is selected.

**What scales and what doesn't.**
- Scales (rem): every type role; `em`-sized inline icons (`svg.i`, 1.4em), so they stay matched to the words beside them (about 24 px next to `body` at 85%).
- Does **not** scale (px tokens, unchanged): `tap` **56 px** and `tap-hero` **72 px** (the guide minimum; seniors' safety controls never shrink), spacing `s-*`, radii `r-*`, gaps ≥ 8 px, fixed-px icons (40 px step and tile icons, 28 px note icons, 44 px wordmark, 56 px mic), progress bar, map overlays, 11 px map attribution. Rows and buttons simply get a little more air at 85%.
- The 150%/200% layout overrides (`data-text-size="xlarge|xxlarge"`) do not apply at 85%; 85% uses the 100% layout.
- No frame adds its own size override for 85%; Help, 995 and the get-off alert follow the table above and nothing else.

**Family viewer `/t/*`: stays at 100%, gets no picker and does not follow the sender's choice.** Why: (1) it is someone else's browser and the share carries no text setting, and it should not (less data sent); (2) viewers are not only young relatives: a spouse or sibling of the same age opens it too, often in a worried moment, and the status sentence must read at a glance, so 100% (body 20 px) is the safe floor; (3) a younger viewer already has the browser's own zoom and phone text size, which the rem-based page respects. A page meant to need no controls gets no new control.

**Baselines (390×844, DPR 2, light + dark, zh + en):** `F1-size-85`, `F1-size-100` (5-card grid), `F1-size-200` (5 cards, 1 column), `H13-size-85` (Settings segment 3+2 with the caption), `H1-default-85`, `H5-walk-85`, `H8-walk-85` (get-off alert at 85%), `W-size-85` (setup card). Checks: no horizontal scroll, every target ≥ 56 px at 85%, no text under 14.5 px except attribution, the AA cycle never reaches 85%.

Checked: the F1 grid and the Settings segment rendered at 390 px with the build's `tokens.css` + `app.css` at 85%, 100% and 200% (Playwright): no horizontal scroll, cards 169×79 / 169×88 / 350×146, last card full width, segments 111×56 (3+2), 1 column at 200%.

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
- [ ] M3: every live-data state readable with colour removed (arrival chip, load tags, disruption banner); no guessed exit, fare or station name (6d).
- [ ] M4: share copy never claims the family has seen it; viewer OG tags carry no name or place; `c-danger` fill only on the 995 confirm (6e).
- [ ] Viewer `/t/:id`: all 15 states at 390 and 1440, light/dark, zh/en; 200% at 390 without horizontal scroll.
- [ ] M5: nothing from 6f (update bar, What's new, install card, in-app bar) renders during a trip; the leaf chip never changes alert timing.
- [ ] M5: `/privacy` text matches the code facts in 6f.1 (Delete all clears caches and stops a share; TTLs; telemetry fields); no contact line until the owner supplies one; no licences link anywhere.
- [ ] M5: offline cold start has no spinner; every network-only control says 需要网络 / Needs internet.
- [ ] v1.4.1: 较小 85% offered on F1, Settings and W; default 100%; targets still 56 px at 85%; AA never cycles to 85%; viewer stays 100%.

## Change log
| Version | Date | Change |
|---|---|---|
| v1.4.1 | 2026-11-18 | 6f.11 text size 较小 85% / Smaller (owner request): `--ts` 0.85, first of 5 options, default still 100%; 5-card grid (odd last card spans the row) and `.seg.sizes`; SR names; targets and px icons do not scale; AA cycle skips 85%; viewer stays 100%. |
| v1.4 | 2026-11-18 | 6f M5 hardening and launch: L1 Privacy page, L2 About rework, L3 update bar + What's new (supersedes F7), L4 install helper (Android card, iOS picture guide, Open in Safari, in-app-browser bar), L5 battery saver, L6 offline cold start, L7 Settings order + error counts, L8 V/W privacy links, L9 field-test form + consent line. Icons `leaf`, `add-square`, `open-browser`; drawn iOS guide pictures in `creative/m5/`. |
| v1.3 | 2026-11-17 | 6d M3 transit smarts, 6e M4 share and safety; m34 fix-round entries. |
| v1.2 | 2026-11-17 | 6c M2 guided-trip frames. |
| v1.1 | 2026-11-17 | Logo B master, 6b M1 states. |
| v1.0 | 2026-11-17 | Tokens, components, frames H1–H13. |
