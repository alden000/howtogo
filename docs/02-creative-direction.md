# 怎么去? — Creative direction

**Version:** v1.0 (2026-11-17) · **Owner:** Creative · **Status:** for owner sign-off
Companion files: `creative/STYLE-GUIDE.md` (tokens, components, frames H1–H13), `creative/logo/`, `creative/prototype/index.html`.

---

## 1. Brand idea

> **Every question has a way. 每个“怎么去？”都有答案。**

The app's name is a question older people ask every day: *怎么去?* "How do I get there?" The brand answers it the way a patient grandchild would: by walking beside them, one step at a time, never rushing and never making them feel slow.

The mark shows this. A question mark is drawn as a route: it starts at a ring (*you are here*) and ends at a warm saffron dot (*you have arrived*). The same saffron dot is the destination marker on every map, the "get off now" colour, and the dot that lands in the arrival celebration. **The question resolves into a place.**

### Personality: the kind companion (陪你去的人)
| We are | We are not |
|---|---|
| Calm, unhurried, warm | Cute, childish, or patronising ("Great job, sweetie!") |
| Plain and concrete ("Bus 139 comes in 4 min") | Technical ("ETA recalculating…", "GPS signal lost") |
| Respectful: we talk to an adult who has lived a full life | Alarmist (red flashing, "WARNING") |
| Honest about limits ("Bus times can change by a few minutes") | Over-promising |
| Quietly proud of the user when they arrive | Gamified (no points, streaks or badges) |

Visual personality: **warm paper, persimmon and saffron.** The palette comes from things our users know well: kopitiam cups, red lanterns, a persimmon at Chinese New Year, the yellow of a void-deck letterbox. It stays well away from the blue/green/red/yellow of Google Maps and from the red, purple and green identities of SMRT, SBS Transit, LTA and OneMap.

## 2. Design principles for seniors

1. **One thing at a time.** Each moment has one primary action and one main sentence. Secondary actions are quieter and never compete.
2. **Big, close, high-contrast.** Base text is 20px (and grows to 200%). Body text is AAA (≥ 7:1). Targets are at least 56px, and 72px for primary actions. Nothing important sits in a corner.
3. **No gestures required.** Every swipe, pinch or long-press has a visible button. The map never needs panning: *Follow me* and *See whole trip* are buttons.
4. **Say it, show it, buzz it.** Every key moment goes out on three channels: big text, voice, and vibration. Any one of them is enough on its own (for deaf, low-vision and noisy-bus users).
5. **Signs, not maps.** Users navigate by what they can see. Steps quote the exact text on the bus-stop pole or MRT sign ("Blk 79", "Tan Tock Seng Hosp"), in English as printed, with Chinese next to it.
6. **Forgiving everywhere.** Wrong turns are "another way", never a mistake. Back never silently ends a trip. Every destructive step asks once, kindly.
7. **Family is part of the product.** Sharing a trip, calling a daughter and showing a driver the address are one tap away on every screen, through the persistent **帮忙 Help** button.
8. **Earn the celebration.** Arriving somewhere alone is a real achievement for many users. We mark it warmly and briefly, then step aside.
9. **Respect the device.** Old, small, cracked Android phones, low battery and bright sun. Use high contrast, no thin type, no glassy blur, and dark mode that is truly dark.

## 3. Voice rules

- **Calm.** Short sentences. No exclamation marks, except for arrival and "the bus is here".
- **Warm.** Talk like a kind relative, not a machine. Use 你 in Chinese, never 您 (it reads cold in SG usage).
- **Plain.** Use concrete numbers and nouns: minutes, stops, the bus number, the sign. No jargon (ETA, GPS, route, transit, interchange…).
- **One action per moment.** One instruction per sentence, starting with the verb: 走到… / 在这里等… / 下一站下车.
- **Never blame.** "You took another way", not "You went the wrong way". "Couldn't find …, try other words", not "Invalid input".
- **Honest about limits.** If data is estimated or might change, say so once, calmly.
- **Security and safety are clear, never alarmist.** "Only this trip is shared. Your location is not stored." 995 is offered plainly and sits last.
- **Chinese first, English equal.** Every string exists in both languages. They are written to fit together, not machine-translated. Place names on signage stay in English as printed.
- **Voice lines** are the on-screen headline, spoken a little slowly (rate 0.9). They are never longer than one breath.

### Copy examples
| Moment | 中文 | English |
|---|---|---|
| Greeting | 早上好，林阿姨 · 今天想去哪里？ | Good morning, Auntie Lin · Where would you like to go today? |
| Walk step | 走到 Blk 79 巴士站 · 还有 120 米，大约 2 分钟 | Walk to Blk 79 bus stop · 120 m to go, about 2 min |
| Waiting | 在这里等 139 号巴士 · 3 分钟 | Wait here for bus 139 · 3 min |
| Bus here | 139 号巴士来了！看清楚车头的号码，再上车。 | Bus 139 is here! Check the number on the front, then get on. |
| On bus | 坐着就好，还有 4 站 · 下车前我会提醒你。 | Sit back. 4 stops to go · I'll tell you before your stop. |
| Get off | 下一站下车 · 请现在按铃 | Get off at the next stop · Press the bell now |
| Off route | 没关系，你走了另一条路 · 我在帮你找新的路… | That's okay — you took another way · I'm finding a new way for you… |
| Empty search | 没找到“…” · 换个说法试试，比如“医院”“巴刹”或地址。 | Couldn't find “…” · Try other words, like “hospital”, “market” or an address. |
| Privacy | 只分享这一次的行程，不会保存你的位置。 | Only this trip is shared. Your location is not stored. |
| End trip? | 要结束这次行程吗？ · 继续行程 / 结束行程 | End this trip? · Keep going / End trip |
| Arrival | 到了！· 你做得很好 | You're here! · Well done |

**Banned words:** 错误 / error, 失败 / failed, 无效 / invalid, 警告 / warning, recalculating, GPS, ETA, transit, route (use 路 / way), 请稍候 (use 我在帮你…), "Oops".

## 4. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Brand idea **"Every question has a way"**, mark = **Question Path** (concept A). | It turns the app name into the mark. It is ownable, reads at 16px, and avoids pins, arrows and transit logos. |
| D2 | Palette: **persimmon `#9A3412`** primary, **saffron `#FFD23F`** for destination and attention, **jade `#0E5B49`** for family and "safe", on **warm paper `#FBF5EC`**. Dark mode uses warm charcoal `#14110E` with persimmon lifted to `#FF9466`. | Warm and culturally familiar. AAA with white text. Distinct from Google, SMRT, SBS, LTA and OneMap. |
| D3 | **Attention is saffron, not red.** "Get off at the next stop" is a full saffron panel with a ringing bell, an edge glow, a long vibration and voice. Red is reserved for 995 only. | Red alarms older users. Saffron has the highest luminance contrast with ink (12.1:1) and is still visible in sunlight. |
| D4 | **Base text 20px, in-app text size 100/125/150/200%**, on top of the OS setting. Layout reflows (tiles go to one column, chips wrap). Nothing truncates except the decorative URL in the family preview. | Low vision is the norm, not the edge case. |
| D5 | Type: **Atkinson Hyperlegible** (Latin and numerals, designed for low vision) + **Noto Sans SC** (CJK), weights 400/700/900 only. | Clear 0/O, 1/l/I and bus numbers. Strong CJK at large sizes. |
| D6 | **Signage-first naming:** stops and stations appear exactly as on the pole or sign (English), with the Chinese name beside them. | Users match what they read on the street. SG signage is English-first. |
| D7 | MRT lines are shown as a **line tag** (colour stripe + code text "NS", ink on surface), never colour alone. | Colour-blind users. Some official line colours fail 3:1 on our surfaces (CC orange on paper is 1.9:1), so the text carries the meaning. |
| D8 | **Back never silently ends a trip.** Back from live guidance opens "End this trip?" with **Keep going** as the primary action. Every screen, sheet and dialog is a history entry (§7). | Accidental Back is common with shaky hands. |
| D9 | **Follow-me is the default** in guidance: heading-up, the user dot sits in the upper third above the step card, and the camera eases. One button toggles to "See whole trip" (north-up, fitted). No pan or pinch is needed. | It matches how people hold the phone while walking. |
| D10 | **帮忙 Help** is a persistent, high-contrast ink pill in guidance and a row on Home. Its order is: call family → show the driver my address → where am I → find my way again → 995 (last, outlined). | The most common real need is "call my daughter". Next is "tell the taxi uncle where I live". |
| D11 | **Show the driver** is a full-screen, always-light card: big English address and postal code (on a saffron highlight), Chinese underneath. It has three tabs: where I'm going, my home, where I am. | Taxi and private-hire drivers read English. Postal codes are what they type. |
| D12 | **Share my trip** is time-boxed to *this trip* and stops on arrival. Family see a no-install web page with the ETA, plain status ("On bus 139, 3 stops to go"), a map and **Call Mum**. | Privacy by default. It builds trust for both the senior and the family. |
| D13 | **Arrival moment:** the Question Path draws itself, the saffron dot drops in with a spring and ripples out, petals rise, the voice says "到了！你做得很好", and an arrival vibration plays. It lasts about 2.5 s. With reduce motion, everything shows at once. | A signature, brand-owned moment that marks the user's achievement. |
| D14 | **Say it again** is always on the step card. The voice toggle is in the top bar, and the speaker icon shows its state. | Users miss lines on noisy buses. Repeating is the most-used control in senior voice UX. |
| D15 | Prototype map is an **illustrated Toa Payoh–Novena map** (not to scale). The build uses **OneMap tiles** (Default by day, Night in dark mode) with the same overlays and the required OneMap/SLA attribution. | It shows the art direction for route overlays independent of tile style. Attribution is planned from day one. |
| D16 | Route options show at most **3 cards**, labelled by what seniors care about: 最少走路 Least walking (recommended, persimmon border), 最快 Fastest, 最少转车 Fewest changes. Each card also shows "No stairs" or "Lifts all the way". | Walking distance and stairs matter more than 4 minutes saved. |

## 5. Open questions for the owner
1. Approve **Question Path** as the logo (alternatives: 去 Seal, Lantern, Walk With).
2. Approve **persimmon + saffron + jade** as the brand palette.
3. Greeting uses a stored nickname ("林阿姨"). Should we ask for a name at first run (optional), or greet without one?
4. Family share: WhatsApp deep link + SMS + copy link (recommended), or SMS only for v1?

## Change log
| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-11-17 | First creative run: brand idea, principles, voice, D1–D16, logo concepts, tokens, motion and haptics, components, frames H1–H13, interactive prototype. |
