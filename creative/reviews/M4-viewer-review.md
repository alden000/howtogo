# Creative review: family viewer `/t/:id` (dev/m34-worker)

**Verdict: APPROVED WITH FIXES** (2 x P1, 3 x P2, 2 x P3). Copy matches §6e.2 verbatim in both languages. OG is generic. Help uses saffron with ink and has no red. Tokens are used throughout and the layout follows the approved prototype. I read the code and baselines only: bus, help, arrived, nosignal, expired and invalid at 390 and 1440, plus the 200%/dark shots.

## P1 (fix before merge)
1. **ETA overflows the card at 200% text** (`M4-V-nosignal-dark-390-200-en`): "Arriving" runs past the card's right edge to the viewport edge. §6e.2 says "no clipping". The page has no horizontal scroll, so the test passes, but the text is clipped visually.
   - File: `src/web/src/viewer/viewer.css` `.eta b`. Fix: `font-size:min(2.1rem, 18vw); overflow-wrap:anywhere;`. This does not change 100% (42px < 70px at 390).
   - Also make the 200% test assert `el.scrollWidth <= el.clientWidth` for `.card` and `.eta b`.
2. **Help disc broken at 200%** (`M4-V-help-dark-390-200-en`): the ink disc shows as a crescent behind or around the help icon, so it no longer reads as "icon in an ink disc".
   - File: `viewer.css`. Fix: scale the disc and icon together, `.avatar{width:max(56px,2.8rem);height:max(56px,2.8rem)}` `.avatar svg.i{width:58%;height:58%}`, and the same for `.avatar.ok` (`max(64px,3.2rem)`).

## P2
3. **Bad zh line breaks inside words**, at 390 at 100%:
   - `妈妈已经到 / 了 陈笃生医院`
   - `上午 10:22 到 / 的`
   - `约 上午 10:39 / 到达` is fine.
   - At 200% en, the button breaks as `Call 妈 / 妈`.
   - Fix in `viewer.css`: `.who h1, .eta b, .btn { word-break: keep-all; }` (`overflow-wrap:anywhere` stays as the rescue for long names with no spaces). The results are `妈妈已经到了 / 陈笃生医院`, `上午 10:22 / 到的` and `Call / 妈妈`.
4. **Desktop map top is 16 px above the status card** (1440: map y=72, card y=88). The empty `note` row still adds a 16 px row gap.
   - File: `viewer.css` `@media (min-width:1000px)`. Add `.layout:has(.notearea:empty){grid-template-areas:"status map" "rest map";grid-template-rows:auto 1fr}`. Also make the map bottom margin 24: `.map{height:calc(100dvh - 96px)}`, which is header 72 + 24.
5. **Footer line 1 on terminal states** (`expired`, `ended`, `endedArrived`): `{me}到了 30 分钟后，这个链接会停止…` reads wrong once the link has already stopped.
   - File: `render.ts`. For those states use `P.foot = <div class="foot"><p>{foot2}</p>{details}</div>` (keep 这是什么？).

## P3
6. `stepText` is shown as sent, so after a language toggle the pill text stays in the sender's language. Add `lang="{share.lang==='zh'?'zh-Hans':'en'}"` on the pill `<span>` (`render.ts` `pill()`) so screen readers pronounce it correctly.
7. Expired at 390 breaks as `这个链接已 / 经过期了`. Optional: emit `这个链接<wbr>已经过期了` (render with `<wbr>` after 链接) so it reads `这个链接 / 已经过期了`.

## Rulings on the dev-log assumptions
- **No destination marker:** accepted for now. Fit the map to the puck only. The `destLat/destLng` ask (6e.9) stays open.
- **stepText shown as sent:** accepted as interim (6e.9 already says so). See P3 #6.
- **Pill icon guessed from text (`stepKindOf`):** accepted as **interim only**. The regex is good for app-generated zh/en strings. The risks are free text ("Walk to the stop and wait…" goes to `wait`) and the silent `walk` fallback.
  - Interim rule: when no keyword matches, hide the icon (text-only pill) instead of falling back to `walk`. A wrong mode icon is worse than no icon.
  - Required API: the PUT carries structured `step: {k:'walk'|'wait'|'bus'|'train', svc?, line?, stops?, place?, station?, towards?}` (6e.9). The viewer then uses `step.k` for the icon and `data-state`, and renders the pill from the §6e.2 templates in the viewer's language:
    - `正在走路去 {place} / Walking to {place}`
    - `在 {stop} 等 {svc} 号巴士 / Waiting at {stop} for bus {svc}`
    - `在 {station} 等地铁 / Waiting for the train at {station}`
    - `在 {svc} 号巴士上，还有 {n} 站 / On bus {svc}, {n} stops to go`
    - `在地铁上，往 {towards} 方向，还有 {n} 站 / On the train towards {towards}, {n} stops to go`

    Fall back to `stepText` only when `step` is absent. Please add this to the Worker contract for the next drop.

## Checked OK
- Header and language toggle (SR labels exact).
- Status sentence sizes. At 1440 there is no hero scaling.
- Help panel: call button inside it, ink fill, saffron text.
- Nosignal note uses the `wifi-off` icon; the last-updated dot is hollow.
- Arrived uses the jade check disc and the stop-time pill, as in the approved prototype.
- Invalid has no call button and the 640 px centred column.
- Tab titles. Polite/assertive split. Haptics only on help and arrived.
- New strings not in the spec (`titleExpired 链接过期了 / Link expired`, `titleInvalid 找不到链接 / Link not found`, `最后位置：不知道 / Last position unknown`, helpcleared zh `{me}说自己没事了。`) are approved; please log them in §6e.2.
