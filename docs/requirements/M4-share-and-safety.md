# M4 — Share & safety (draft)

PM · 2026-11-17 · Estimate: **8–10 h if run straight through** (ROADMAP said 6–7 h; see "Estimate" at the end). Excludes owner waits: Director rulings, Creative frames (in progress on `dev/creative-m34`), and the real-phone session with a family member (≈ 30 min).

## Goal
Family can **see the trip live** without installing anything, they **know when she has arrived**, and the senior **always has a way out**: one tap to call family, a big address card for a taxi driver, "where am I", 995, and a fresh route. Family can **set up the senior's phone for her** with a link or QR code, with no accounts. All of it is private: location lives on the server only while a share is open (≤ 4 h, ends 30 min after arrival, D-6), and nothing else about her leaves the phone.

## Non-goals (other milestones)
- Accounts, logins, a family "app", contact syncing from the phone address book.
- Continuous sharing outside a trip ("always share my location"). Sharing is per trip, or from Help.
- Background share updates with the screen off (M6 Capacitor; web shares pause when the page is hidden, AC 14).
- Booking a taxi inside our app, or passing the destination into Grab/CDG unless the deep link is verified (D-6).
- SOS auto-dialling, fall detection, auto-calling family. Every call is the senior's own tap.
- Live bus/MRT data (M3), perf/a11y audit (M5).

## Already built (Worker, `src/worker/API.md`) and what M4 must add
| Built | M4 adds |
|---|---|
| `POST /api/share` → id (12 base62), owner token (hash stored), `viewPath /t/:id`, `expiresAt` | Optional `senderName` (≤ 40) and `senderPhone` (E.164, optional) for the family page (AC 18, OQ3); **per-IP rate limit** (AC 47) |
| `PUT /api/share/:id` statuses `travelling | arrived | paused | help`, 3 s write limit, 4 h TTL, auto-end 30 min after `arrived` | **D-7: `help` bypasses the 3 s limit** (not built yet: `share.ts` checks the limit before the status, AC 13) |
| `GET /api/share/:id`, WebSocket `/live` (≤ 50 viewers), `DELETE` with coordinate-free tombstone | Optional Web Push subscriptions held in the DO for the share's lifetime (Should, AC 31) |
| — | **`/api/setup`** one-time encrypted setup box for caregiver setup (AC 40–41) |

**Contract bug found while writing this spec:** the shared engine's `SharePayload.status` is `active | off_route | arrived | gps_weak` (`src/shared/src/types.ts:315`), but the Worker accepts only `travelling | arrived | paused | help` (`src/worker/src/share.ts:13`) and answers `400 invalid_status` to anything else. Every live share from the current engine would fail. Fixed by AC 10.

## Lessons carried in
- **Safety beats rate limits** (D-7) and **never fake data** (M1 Worker ruling: 503 rather than sample routes). The family page never shows a position it doesn't have.
- **In-memory per-IP limits only; IPs never logged or kept beyond the window** (M1 QA ruling on QA-15/17/18).
- **QA-1 (S2, empty Help) and flag `help`:** M2 shows the partial Help sheet; M4 completes it. Help must never be an empty or dead button anywhere.
- **Anything that can overwrite user data is S1 until proven otherwise** (process §2): caregiver import must show exactly what it replaces (AC 43).
- **Entry-point parity:** the Help button and the share entry must exist on every screen the parity table lists, not just the new sheets.
- Keep `data-testid`s and change-only hooks; no share ids, tokens, phone numbers, names or coordinates in hooks or the Report.

---

## Acceptance criteria

### A. Entry-point parity
| # | Pri | AC |
|---|---|---|
| 1 | Must | Every surface in "Entry-point parity" below offers the listed actions (Share, Help, Call family, Show the driver, Taxi). A Playwright matrix test opens each surface and asserts each action is present and works (or is deliberately absent, noted in the test). Flag `help` is **on** for the M4 release |

### B. Start sharing (senior's phone)
| # | Pri | AC |
|---|---|---|
| 2 | Must | **H7 share sheet** (STYLE-GUIDE 5.8, H7): "告诉谁？" lists saved family contacts (avatar initial, name, relation; first contact pre-selected); "别的人 / Someone else" sends without a contact. Copy exactly as H7 |
| 3 | Must | Tapping a send button creates the share (`POST /api/share` with `destName`, `lang`, `senderName` = the greeting name or "妈妈/爸爸" as chosen at caregiver setup, `senderPhone` if set and allowed, OQ3) and then sends the link `https://<app host>/t/<id>`. The owner token is kept only on the device (`howtogo.share.v1`) and deleted when the share ends |
| 4 | Must | **Send channels**, in this order: (a) **WhatsApp** (jade primary): `https://wa.me/<digits>?text=<msg>` to the chosen contact, or `https://wa.me/?text=` with no contact; (b) **SMS** (`sms:<number>?&body=<msg>`, ⚠ verify the body param on iOS and Android); (c) **More… / 更多** = Web Share (`navigator.share({title,text,url})`) when available; (d) **Copy link** with toast "链接已复制". Each channel is a ≥ 56 px button |
| 5 | Must | Message text (zh/en per the share language, Creative final copy): "我正在去 陈笃生医院。点这里看我在哪里：<link>（我到了就会自动停止）" — no address, no coordinates, no times in the text itself |
| 6 | Must | Toast on send "已分享给 美玲。她现在看得到你。" and the **share pill** on H5 ("美玲 看得到你", jade, live dot, 5.6). Tapping the pill opens H7 sharing state: "正在分享给 美玲 · 到达后自动停止 · 看看家人会看到什么 · 停止分享" |
| 7 | Must | **Stop sharing** (pill sheet, H7, Settings while sharing) → `DELETE /api/share/:id` → toast "已停止分享". Ending the trip (M2 End sheet) also ends the share; the End sheet line says "分享也会停止 / Sharing stops too" |
| 8 | Must | Creating a share works **before** Start (H4) and **during** a trip (H5). A share started on H4 sends `status: travelling` with no position until the first good fix (family page shows "妈妈还没出发 / Not started yet") |
| 9 | Should | Settings "出门时自动分享给 / Always share my trips with" (off by default): when on, Start creates the share and opens WhatsApp to that contact pre-filled; the senior still taps Send in WhatsApp (we cannot send silently) |

### C. Share runtime (senior's phone)
| # | Pri | AC |
|---|---|---|
| 10 | Must | **Contract fix:** the shared `toSharePayload` emits the Worker enum: engine `active`, `off_route`, `gps_weak` → `travelling`; `arrived` → `arrived`; Help → `help`; page hidden → `paused`. Off-route is **not** exposed to family (dignity; she is being re-routed). A contract test imports the Worker's `STATUSES` and checks every value the shared code can emit. `stepText` uses the zh station names in zh shares (M3 AC 43) |
| 11 | Must | Update cadence: a PUT on each step change and on status change, and otherwise every 15 s while moving (≥ 20 m since the last sent fix), every 60 s when still. Never faster than the Worker's 3 s; on `429` keep only the latest fix and resend after `Retry-After` |
| 12 | Must | Offline or Worker errors: keep only the latest payload, retry with backoff (5, 10, 20, 30 s cap), no queue of old fixes. `410 share_ended/expired` → the pill disappears and toast "分享已经结束 / Sharing has ended" once |
| 13 | Must | **D-7:** a `help` PUT is accepted even within 3 s of the last write (Worker change + test), capped at 1 help write per second to prevent abuse |
| 14 | Must | On `visibilitychange` → hidden, send `status: paused` (fetch `keepalive`); on visible, resume `travelling` with a fresh fix. In pocket view (M2 G1) updates continue at the 15/60 s cadence (supersedes M2 AC 41's "share paused in pocket view": the page is still visible) |
| 15 | Must | **Arrival:** `arrived_destination` sends `status: arrived` with the final fix and ETA cleared; the Worker auto-ends 30 min later (built). H12 shows "美玲 知道你到了 / Mei Ling knows you've arrived" when a share was live; otherwise a "告诉家人我到了 / Tell family I've arrived" button (AC 29) |
| 16 | Must | Resume after reload/kill (M2 AC 46): a live share resumes from `howtogo.share.v1`; a share that has ended or expired is cleaned up silently |

### D. Family viewer page `/t/:id` (no install, no login)
| # | Pri | AC |
|---|---|---|
| 17 | Must | `/t/:id` is a **separate lightweight entry** (Pages rewrite `/t/* → /viewer.html`), not the full app: no service worker install prompt, no app chrome, no storage except the language choice. Text card renders before the map; JS ≤ 60 KB gz excluding the map; the map (OneMap tiles + attribution) loads lazily. Works on Chrome/Safari/Samsung Internet of the last 3 years |
| 18 | Must | Card (H8): "妈妈正在去 陈笃生医院 / Mum is on her way to Tan Tock Seng Hospital" (`senderName` + `destName`), "约 上午 10:39 到达 · 还有 16 分钟" from `etaISO`, the status line from `stepText` ("在 139 号巴士上，还有 3 站"), "刚刚更新 / 2 分钟前更新" from `updatedAt`. "打电话给妈妈 / Call Mum" (`tel:`) only when `senderPhone` is present |
| 19 | Must | Map: senior's position with accuracy circle (circle only when `acc` > 30 m; "位置不太准" when > 100 m), heading arrow when known, destination marker only if the senior's app sends it (OQ4 default: **no destination coordinates**, name only). Follow toggle; never auto-zooms out of a user's own pan |
| 20 | Must | Live via WebSocket `/api/share/:id/live`; on socket failure, poll `GET` every 15 s; reconnect with backoff; a visible "连接中… / Reconnecting…" line after 10 s without data |
| 21 | Must | **States**, each with its own copy and baseline: waiting ("妈妈还没出发"), travelling, **help** (saffron banner "妈妈按了「帮忙」· 上午 10:12" + big Call button when the phone is known), paused ("妈妈的手机暂时没有更新位置" + last-seen time), **signal lost** (no update > 2 min: "最后位置：5 分钟前"), **arrived** ("妈妈已经到达 陈笃生医院 · 上午 10:41" + ✔ mark, map frozen), **ended** by the sender ("妈妈已经停止分享"), **expired** ("这个链接已经过期"), **not found** ("找不到这个行程，请检查链接"). After ended/expired the position is gone (Worker sends null) and the map shows no marker |
| 22 | Must | Language: the share's `lang` by default; a zh/EN toggle on the page. Font scales with browser zoom to 200 % without loss |
| 23 | Must | The page is `noindex, nofollow`, `Referrer-Policy: no-referrer`, a strict CSP (self + OneMap tiles + the Worker), no analytics, no third-party scripts, no cookies |
| 24 | Must | **Link previews** (WhatsApp/Telegram/SMS unfurl the link): the HTML served for `/t/*` has **generic** Open Graph tags ("怎么去？ · 家人的行程 / A family trip link") — never the sender name, destination or position |
| 25 | Must | Multiple family members can watch the same link at once (≤ 50, built); the 51st sees "看的人太多了，请稍后再试" |
| 26 | Should | "在地图上打开 / Open in Maps" opens the senior's current position in Google/Apple Maps (`geo:`/`https://maps.google.com/?q=`) for family who want to drive there |
| 27 | Should | The senior's app has "看看家人会看到什么" (H8 preview) that renders the same viewer component with the live state, inside the app |
| 28 | Should | The page title shows the state ("✔ 已到达 · 怎么去？") so a background tab reads at a glance |

### E. Arrival notification for family
| # | Pri | AC |
|---|---|---|
| 29 | Must | **Senior-side tell (works everywhere):** on H12 a "告诉家人我到了 / Tell family I've arrived" one-tap opens WhatsApp (or SMS/Web Share) to the first contact with "我到了 陈笃生医院 ✔". Shown when no live share was running, and as a secondary action when one was |
| 30 | Must | **Viewer page open (foreground or background tab):** on `arrived` and on `help`, the page plays one short chime (only if the viewer interacted with the page once; browsers block autoplay otherwise), updates the title, and shows a system Notification if the viewer granted permission via "到了通知我 / Notify me when she arrives" |
| 31 | Should | **Web Push when the page is closed** (OQ5): the viewer page offers "到了通知我" → service-worker push subscription → stored in the share DO (≤ 10 per share), push sent by the Worker on `arrived` and `help` (VAPID keys as Worker secrets; aes128gcm with WebCrypto), deleted with the share. Hidden on iOS unless the viewer page runs as an installed web app (iOS limitation) |

### F. Help (full sheet, H9)
| # | Pri | AC |
|---|---|---|
| 32 | Must | Help opens from every surface in the parity table. H9 options in fixed order: **打电话给 美玲 · 女儿 · 一按就打** (first contact) → other contacts (≤ 2 more, smaller rows) → **给司机看地址** → **我在哪里？** → **帮我重新找路** (trip only) → **让家人看到我在哪里** (AC 35) → **叫德士 / Get a taxi** (§I) → **紧急情况 · 拨打 995** (danger outline, last) |
| 33 | Must | **Call family** is one tap: `tel:+65xxxxxxxx`. The phone's dialer is the confirmation (no extra in-app confirm). With no contacts saved, the row reads "还没有家人电话 · 添加 / No family number yet · Add" → contacts editor (G) |
| 34 | Must | **995** is `tel:995`, last in the list, never a big red button, no in-app confirm (the dialer confirms). It is available offline. Copy says what 995 is for ("救护车和火警 / Ambulance and fire") |
| 35 | Must | **"让家人看到我在哪里 / Let family see where I am"**: if a share is live, it sets `status: help` (bypassing the write limit, AC 13) and the family page shows the help state; if not, it creates a share (no destination: `destName` = "我在这里 / Where I am") with `status: help` and opens WhatsApp to the first contact with "我需要帮忙，我在这里：<link>". The senior clears help with "我没事了 / I'm OK now" (back to travelling or ends the help-only share) |
| 36 | Must | **我在哪里？/ Where am I** (H10 "Where I am" tab): reverse-geocoded address (`/api/revgeocode`) in huge type + postal code + "附近：<building>", always-light card, Wake Lock while open, landscape allowed. Offline or no result: coordinates in a plain "1.3512, 103.8483" line plus "给别人看这个号码 / Show this to someone" |
| 37 | Must | **给司机看地址 / Show the driver** (H10): tabs Where I'm going (trip only) · My home · Where I am, "Please take me to / 请送我去", name + address + saffron postal code, always light, Wake Lock, landscape |
| 38 | Must | Help works with no network for: call family, 995, show the driver (destination/home cached), and the coordinates fallback. Rows that need network say "需要网络 / Needs internet" instead of failing silently |

### G. Family contacts and saved places
| # | Pri | AC |
|---|---|---|
| 39 | Must | Settings → **家人 / Family**: up to 3 contacts {name, relation (女儿/儿子/丈夫/妻子/朋友/其他), phone}. Phone validated as SG 8 digits (adds +65) or full international. Reorder with ↑/↓ (first = Help call + share default). Stored on-device only. Also Settings → **常去的地方 / My places**: up to 6 saved places (STYLE-GUIDE 5.1 tiles) with add/rename/remove/↑↓; Home stays the first tile |

### H. Caregiver setup (no accounts)
| # | Pri | AC |
|---|---|---|
| 40 | Must | **Family side, `/setup`** (works on the family member's phone, no install): fills the senior's greeting name and how family call her ("妈妈"), Home, ≤ 6 places (search via `/api/search`), ≤ 3 contacts, the senior's own phone (optional), and preferences (language, font size, Lift-friendly, concession card). "做好了 / Done" encrypts the JSON in the browser (AES-GCM-256, random key) and `POST /api/setup {ct}` → `{code, expiresAt}` |
| 41 | Must | **Worker `/api/setup`**: stores only the ciphertext (≤ 4 KB) in a one-time Durable Object; `GET /api/setup/:code` returns it **once** and deletes it (then `410`); auto-deleted after **24 h**; code = 12 base62. The key travels only in the URL fragment (`/s/<code>#k=<key>`), which browsers never send to the server. Tests prove the Worker never receives the key |
| 42 | Must | Delivery to the senior: a **QR code** on the family phone's screen (scan with the senior's camera) and send buttons (WhatsApp/SMS/copy) for the link. The senior's app also has Settings → "用家人的设置 / Use family's setup" with **Scan QR** (in-app camera, lazy-loaded decoder) and **Paste link** — needed on iOS, where an installed web app has separate storage from Safari (⚠ verify on a real iPhone) |
| 43 | Must | **Import preview** before anything is saved: "家人帮你设置了：家、3 个地方、2 个家人电话" listing each item, and in saffron what will be **replaced** ("会换掉你现在的 2 个地方"). "保存 / Save" (primary) and "不要 / Don't". Nothing is written before Save; recents and an active trip are never touched. Undo toast for 10 s restores the previous data |
| 44 | Must | Errors: used code → "这个设置已经用过了，请家人再做一次"; expired → "过期了…"; wrong/missing key (decrypt fails) → "链接不完整"; offline → "需要网络". Each with a single next action |
| 45 | Should | Senior side "请家人帮我设置 / Ask family to set up" (Settings and first-run F1) shares the `/setup` link; "发给家人修改 / Send to family to edit" pre-fills `/setup` from the senior's current data via the same encrypted one-time box (reverse direction) |

### I. Taxi hand-off (D-6)
| # | Pri | AC |
|---|---|---|
| 46 | Must | "叫德士 / Get a taxi" (Help, H3 no-route state, M2 multi-stop failed segment, re-route failed banner) opens a sheet: the H10 address card first (destination, else home), then **打开 Grab** (Grab app via its universal link if installed, else the Grab site/store page; destination pre-fill only if the deep-link parameters are verified ⚠), **CDG Zig** (link to the official site/app page), and **打电话叫德士** to the CDG booking line (`tel:`, ⚠ verify the number). No booking inside our app; no tracking of whether a taxi was taken |

### J. Privacy, PDPA and abuse limits
| # | Pri | AC |
|---|---|---|
| 47 | Must | **Rate limits (in-memory per IP, IP not stored beyond the window, never logged):** `POST /api/share` 10 per hour, `POST /api/setup` 5 per hour, `GET /api/setup/:code` 30 per hour (code guessing), viewer `GET /api/share/:id` polling 1 per 5 s per IP per share. `429 rate_limited` + `Retry-After`; the app shows "请稍后再试 / Please try again in a minute" — except Help (AC 35) which, if create is limited, still opens WhatsApp with a plain-text "我需要帮忙" + the "Where am I" address |
| 48 | Must | **No location storage beyond the share:** position exists only in the share DO; deleted on stop, 30 min after arrival, or at expiry (≤ 4 h, built); a gate test reads DO storage after each of the three endings and finds no coordinates. Web Push subscriptions and `senderPhone` are deleted with it |
| 49 | Must | **No identifiers in logs:** Worker logs, client hooks and the Report contain no share id, owner token, setup code/key, phone numbers, names, place names or coordinates. Gate grep + a Worker test that captures `console` during a full share and setup run |
| 50 | Must | On-device data (contacts, places, share token) lives in localStorage only, is listed on the privacy page, and Settings → "清除所有资料 / Delete all my data" removes everything (with a confirm). The **privacy page** (zh/en) is updated: what a share sends, for how long, who can see it (anyone with the link), the setup box (encrypted, one use, 24 h) |
| 51 | Must | Share and setup inputs are rendered as text only (no HTML), length-checked server-side (`destName` ≤ 120, `senderName` ≤ 40, `stepText` ≤ 280, body ≤ 4 KB) |
| 52 | Should | The H7 sheet's lock line explains in one sentence: "有链接的人都看得到，到了就自动停止 / Anyone with the link can see it; it stops by itself when you arrive" |

---

## Entry-point parity
| Surface | Share | Help button | Call family | Show driver | Taxi | Notes |
|---|---|---|---|---|---|---|
| H1 Home | — | ✔ (top bar) | via Help | via Help (home/where I am) | via Help | first-run F1: "Ask family to set up" (AC 45) |
| H2 Search | — | ✔ | via Help | ✔ | ✔ | |
| H3 Route options | — | ✔ | via Help | ✔ | ✔ + no-route state (AC 46) | |
| H4 Trip overview | ✔ (AC 8) | ✔ | via Help | ✔ (dest tab) | ✔ | |
| H5 Live guidance | ✔ map control + pill (AC 6) | ✔ | via Help | ✔ | ✔ | pill shows while sharing |
| H6 / H6b alerts | — (pill hidden under sheet) | ✔ in top bar | via Help | — | — | alerts keep priority |
| H11 off route / re-route failed | pill | ✔ | via Help | ✔ | ✔ (AC 46) | |
| G1 Pocket view | pill text | ✔ big target | via Help | — | — | one tap returns to H5 first |
| G3 Waypoint / failed segment | ✔ keeps the same share | ✔ | via Help | ✔ | ✔ | multi-stop keeps one share; `destName` updates per segment |
| H12 Arrival | "Tell family I've arrived" (AC 29) | ✔ | via Help | — | — | |
| Settings | stop sharing; auto-share (AC 9) | — | contacts editor | — | — | family, places, setup import, delete all |
| Family page `/t/:id` | — | — | Call Mum (AC 18) | — | — | no app chrome |
| `/setup` (family phone) | — | — | — | — | — | creates the setup box |

## Testability
| What | How | Needs |
|---|---|---|
| Worker: status contract, help bypass, rate limits, sender fields, setup box (one-time, 24 h, no key), push sender, storage wipe | **vitest** (Workers pool) with fake time | — |
| Shared: payload mapping, cadence/backoff policy, viewer state derivation (signal lost, help, arrived…) | **vitest**, pure, fake clock | — |
| **Two-browser share test** | **Playwright, two browser contexts** against `vite preview` + `wrangler dev --local` (real DO): context A = senior (fake platform fed by the M2 `simulateFixes`), context B = family `/t/:id`. Asserts: waiting → travelling within 5 s of the first fix, marker moves, ETA and zh `stepText`; Help → B shows the help banner within 2 s; A hidden → B paused; A offline 3 min → B "last seen"; arrived → B arrived + title; stop → B ended + no marker; expiry → B expired. A third context opens the link after expiry → expired/not found | Test-only TTL override (OQ6) |
| Socket fallback | Block WebSocket in B (route abort) → poll every 15 s still updates | — |
| Caregiver setup | Two contexts: family fills `/setup`, gets the link; senior context opens it, previews, saves; reopening the link → used. Asserts the Worker request log has no `#k=` | — |
| Send channels | Assert the exact `wa.me`, `sms:`, `tel:` URLs and `navigator.share` payloads (stubbed) | — |
| Link preview | Fetch `/t/<id>` HTML without JS, assert generic OG tags (AC 24) | — |
| Visual | Baselines for H7 choose/sharing, H8 all 9 states, H9 trip/home/no-contacts, H10 three tabs, setup family + import preview, taxi sheet; 100/200 %, light/dark, zh/en; rect-overlap, 56 px | Creative M4 frames |
| **Needs real phones** | WhatsApp opening the right chat with the text; SMS body on iOS + Android; Web Share sheet; `tel:` to a **family** number (never test-call 995: open the dialer and cancel); Grab/CDG links; camera QR scan; iOS installed-app vs Safari storage for setup import; Web Push on Android Chrome (+ iOS installed); WhatsApp link preview text; family page on a second phone over 4G | Owner + one family member, ≈ 30 min |
| **Needs credentials** | `/api/revgeocode` live for "Where am I" (OneMap); VAPID keys for push (generated by the Developer, set as Worker secrets by the owner) | OneMap; owner sets secrets |

## QA gate scope
- `npm run gate`: typecheck, unit (Worker + shared incl. the status contract test), i18n keys, secret scan (incl. VAPID private key absent from the bundle), identifier-in-logs grep (AC 49), build + size (viewer entry ≤ 60 KB gz excl. map), Playwright incl. the **two-browser share test**, setup flow and parity matrix, axe on H7, H8 (all states), H9, H10, setup pages.
- Every Must AC mapped to a test ID in `qa/reports/0.4.0.md`.
- Upgrade test: 0.3.0 with Home, recents, settings and an active trip → 0.4.0 keeps all; no share is created by the upgrade.
- Privacy review (ROADMAP exit): DO storage empty of coordinates after stop / arrival + 30 min / expiry; no coordinates or ids in logs.
- Real-phone session (owner + family member) with the script below. QA reads the Report and notes.
- Not in scope: screen-off sharing (M6), Lighthouse/perf budgets beyond the viewer size (M5).

### Owner + family script (≈ 30 min, two real phones)
1. Family phone: open `/setup` from the WhatsApp link, add Home, 2 places, 2 contacts, the senior's phone. Show the QR. Senior phone: scan → preview → Save. Check the tiles and Help names.
2. Senior: Home tile → Start → Share → WhatsApp → the family chat opens with the message. Note the link preview text.
3. Family: open the link (no install). Watch the marker move for 5 min. Put the senior's app in the background for 1 min → "paused".
4. Senior: Help → 让家人看到我在哪里 → family page shows the help banner (and a push if enabled). Senior: "我没事了".
5. Senior: Help → call family (answer it); 995 → dialer opens → **cancel**. Show the driver: read it at arm's length. Get a taxi → Grab opens.
6. Arrive (or End) → family sees "arrived"/"ended"; 30 min later the link says expired/ended.

## Open questions (with recommended defaults)
| # | Question | Default | Who |
|---|---|---|---|
| OQ1 | Caregiver data flow? | **Encrypted one-time setup box** (AC 40–41): ciphertext only on the server, key in the URL fragment, one use, 24 h. Alternative (everything in the URL fragment, no server) rejected: the link would sit in WhatsApp history with addresses and numbers forever | Director |
| OQ2 | Import replaces or merges? | **Replace the categories the family filled, with a preview and 10 s undo** (AC 43); untouched categories stay | Director |
| OQ3 | Send the senior's own phone number to the share (for "Call Mum")? | **Yes if set** (caregiver setup or Settings), held only for the share's life; off switch in Settings | Owner (privacy) |
| OQ4 | Show the destination on the family map? | **Name only, no destination coordinates** (enough to reassure; less to leak if the link is forwarded) | Owner |
| OQ5 | Web Push for arrival? | **Should**: build after the Must set; skip on iOS unless installed. The senior-side "Tell family I've arrived" (AC 29) is the reliable path | Director |
| OQ6 | Test-only short TTL? | Worker var `SHARE_TEST_TTL_SECONDS` honoured **only** in the `[env.test]` wrangler config; a gate check fails if it is set for production | Director |
| OQ7 | Share update cadence? | 15 s moving / 60 s still / every step change; the family page says "每 15 秒更新一次" | Director |
| OQ8 | Who is the "first" family contact? | The first in the Settings order (↑/↓); caregiver setup sets it | Director |
| OQ9 | Rate limit numbers? | As AC 47; revisit after the field test | Director |
| OQ10 | Grab destination pre-fill and the CDG phone number? | Ship without pre-fill and with the CDG Zig link; add pre-fill / the hotline only after the Developer verifies them on a real phone | Director |
| OQ11 | Help "让家人看到我在哪里" when rate-limited or offline? | Fall back to a plain WhatsApp/SMS text with the "Where am I" address (AC 47) | Director |

## Creative frames needed (round `dev/creative-m34` in progress; checklist)
- **H7** choose / sharing / no contacts ("Someone else" only) / send-channel row (WhatsApp, SMS, More, Copy) / creating (spinner) / create failed.
- **Share pill** on H5 and pocket view; End-trip sheet line "Sharing stops too".
- **H8 family page** all 9 states (waiting, travelling walk/bus, help, paused, signal lost, arrived, ended, expired, not found), reconnecting line, notify-me button, "too many viewers", phone and desktop widths.
- **H9 full** (trip / home / no contacts / offline), "Let family see where I am" + "I'm OK now", 995 row copy.
- **H10** three tabs + coordinates fallback.
- **Taxi sheet** (address card + Grab / CDG Zig / call).
- **Settings:** Family contacts editor, My places editor, auto-share, phone-number switch, "Use family's setup" (scan / paste), "Delete all my data".
- **Caregiver `/setup`** (family phone): steps, QR screen, send buttons; **senior import preview** with the "will replace" line, undo toast, error states.
- **H12** "Mei Ling knows you've arrived" and "Tell family I've arrived".
- Each: light/dark, 100/200 %, zh/en, SR labels, reduce motion, Back target, baseline names.

## Estimate (wall clock, straight through)
| Step | Hours |
|---|---|
| Worker: status contract, help bypass, sender fields, rate limits, `/api/setup` DO, test TTL, storage-wipe tests | 1–1.5 |
| Shared: payload mapping, cadence/backoff, viewer state derivation + tests | 0.5 |
| Senior UI: H7 + channels + pill, Help full, H10, contacts + places editors, taxi sheet, H12 lines | 2–2.5 |
| Family viewer entry `/t/:id` (states, socket + poll, OG/CSP, notify) | 1–1.5 |
| Caregiver setup (family pages, crypto, QR, scan/paste import, preview/undo) | 1–1.5 |
| Two-browser Playwright, setup flow, parity matrix, baselines | 1 |
| QA gate + one fix round | 1.5 |
| **Total** | **8–10 h** (+0.75 h if Web Push, OQ5, is built) |
