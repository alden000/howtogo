# 怎么去? — Kickoff research & plan

PM · 2026-11-17 · Status: **draft for owner confirmation** · Inputs: `docs/00-brief.md`

Legend: ⚠ = not yet verified; check before building on it.

---

## 1. Market scan: what works for seniors and what doesn't

| App | Strengths for seniors | Weaknesses for seniors |
|---|---|---|
| **Google Maps** | Best search; transit routing with live bus times in SG; step list; Live View; location sharing | Dense UI with small type; many tabs and options; jargon-heavy step list; transit voice guidance is weak or absent (voice is mostly for driving/walking ⚠); no "get off now" alarm that works reliably for buses; sharing needs a Google account on both sides |
| **Citymapper** (SG) | Very clear step-by-step transit; "Get off" alerts; "which exit" hints in some cities | SG coverage and data depth thinner than in London/NYC ⚠; playful but busy UI; English only; small type |
| **MyTransport.SG** (LTA) | Official data; bus arrival; shows whether a stop is wheelchair-accessible; MRT disruption info | Utility-style app with many features; small targets; no turn-by-turn guided trip; accessibility features not declared on the App Store listing |
| **SG BusLeh / other bus-arrival apps** | Fast bus arrival times, favourites | Arrival only: no routing, no guidance, no voice |
| **Moovit** | Step-by-step transit with "get off" alerts and live guidance; some accessibility settings | Ads; busy UI; sign-up prompts; quality of SG data unclear ⚠ |
| **OneMap app** (SLA) | Authoritative SG map and addresses; has a transit route planner | Map-first, built for general use; no guided trip; small type |
| **Grab (transit tab)** | Users already have it; ride fallback in the same app | Transit is secondary to ride-hailing; ads and promos; no guided trip ⚠ |

**The gap 怎么去? fills:** none of these is *built for a 60–90-year-old*. Nobody combines (1) a calm, one-action, large-type guided trip with **spoken Chinese**, (2) a reliable "get off at the next stop" alarm, (3) one-tap "take me home", (4) live trip sharing **without accounts**, and (5) family pre-setting the app for the senior. The bet is on depth of care rather than breadth of features.

---

## 2. Technical approach

### 2.1 Architecture (ruling D-1, pending owner OK)
```
PWA (Cloudflare Pages, static)  ──►  Worker /api/*  ──► OneMap (token auto-renew, cache)
   MapLibre + OneMap tiles             │               └► LTA DataMall (AccountKey)
   Service worker (offline trip)       └► Durable Object "Trip" (share relay, 1 per share)
```
- The PWA never holds a secret. The Worker stores `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` and `LTA_KEY` as Worker secrets.

### 2.2 OneMap
| Use | Endpoint | Notes |
|---|---|---|
| Token | `POST api/auth/post/getToken` (email + password) | Expires after **3 days**. The Worker caches it (in KV or a DO) and renews when under 12 h is left or on any 401, with one retry |
| Search | `api/common/elastic/search?searchVal=&returnGeom=Y&getAddrDetails=Y&pageNum=1` | Works without a token, but proxy it anyway. Results are bilingual-agnostic (English names) |
| Reverse geocode | `api/public/revgeocode?location=lat,lng&buffer=…` | Needs a token. Used for "Where am I" and the address shown to a taxi driver |
| Routing | `api/public/routingsvc/route?start=lat,lng&end=lat,lng&routeType=pt&date=MM-DD-YYYY&time=HH:MM:SS&mode=TRANSIT\|BUS\|RAIL&maxWalkDistance=…&numItineraries=3` | Response is **OpenTripPlanner-style**: `plan.itineraries[].legs[]` with mode, from/to stop names and codes, route (bus number / MRT line), `intermediateStops`, start/end times, and `legGeometry.points` (Google **encoded polyline**). Possibly also `fare` ⚠. Parameter names were seen only in third-party wrappers ⚠ |
| Tiles | `maps/tiles/{Default\|Night\|Grey}/{z}/{x}/{y}.png` | Public. Max zoom about 19, SG bounds only. **Attribution must stay visible**: OneMap logo + "© OneMap © contributors · Singapore Land Authority" |

- **Multi-stop (A→B→…→n):** chain one routing call per segment (A→B, B→C, …). The trip becomes an ordered list of segments, each with an itinerary choice. Add a "dwell" marker at each via-stop. There is no native multi-stop in OTP-style pt routing.
- **Route preference mapping:**
  - least walking = low `maxWalkDistance` (for example 400 m), then re-rank by total walk;
  - fewest transfers = re-rank by leg count;
  - lift-friendly = prefer bus legs and stations with no lift outage, plus a client-side penalty.

  All re-ranking is a pure function with unit tests.

### 2.3 LTA DataMall (free AccountKey, sent as the `AccountKey` header)
| Dataset | Path | Use |
|---|---|---|
| Bus arrival v3 | `ltaodataservice/v3/BusArrival?BusStopCode=` | "Bus 162 comes in 4 min". Also seat load (SEA/SDA/LSD) and wheelchair-accessible bus (WAB) flags ⚠ (confirm the v3 fields) |
| Bus stops | `ltaodataservice/BusStops` (paged, 500 per page) | Stop names/codes; the Worker caches them daily |
| Train service alerts | `ltaodataservice/TrainServiceAlerts` | Disruption banner on affected routes |
| Facilities maintenance | Listed on DataMall as "Facilities Maintenance" (ad-hoc lift maintenance at MRT stations). Path likely `ltaodataservice/v2/FacilitiesMaintenance` ⚠ | "Lift at Exit B under maintenance" warning |

- The Worker caches responses: bus arrival 20 s, alerts 60 s, facilities 15 min, bus stops 24 h.

### 2.4 Cloudflare
- **Pages** for the PWA, a **Worker** for `/api/*` (same origin via a Pages Function or route), and **KV** for the token and static caches.
- **Durable Object `Trip`** per share:
  - the senior's phone POSTs position and ETA every 15–30 s;
  - viewers connect via WebSocket (Hibernation API, so idle cost stays near zero);
  - an alarm auto-expires the share.
- DOs with SQLite storage are available on the Workers Free plan ⚠ (confirm the plan).

### 2.5 Map library: **recommend MapLibre GL JS**
| | MapLibre GL JS | Leaflet |
|---|---|---|
| Heading-up rotation (follow-me) | Native `bearing` with smooth `easeTo` | Needs a rotation plugin; jittery |
| Smooth camera follow | Yes (GPU) | CSS transforms, OK |
| Size | ~210 KB gz | ~40 KB gz |
| OneMap raster tiles | Raster source works | Native |

- MapLibre fits follow-me better, and the size cost is paid once and cached by the service worker. Use a raster source on OneMap tiles: Default by day, Night in dark mode, Grey as a calm option.

### 2.6 Device APIs
| Need | API | Caveats |
|---|---|---|
| Voice | `speechSynthesis` with `zh-CN` / `en-SG`→`en-GB` fallback | The voice list varies by device. iOS needs the first utterance inside a user tap, so "Start trip" unlocks audio. Show text for every spoken line. A voice-test button goes in Settings |
| Position | `geolocation.watchPosition({enableHighAccuracy})` | **Stops when the screen is off or the app is in the background** (both OSes), so the trip screen must keep the screen on |
| Heading | `DeviceOrientationEvent` (`webkitCompassHeading` on iOS, `alpha` absolute on Android) | iOS needs `requestPermission()` on a tap. Fall back to course-over-ground from GPS |
| Keep screen on | Screen Wake Lock API | Supported in Chrome and in Safari 16.4+. Re-acquire on `visibilitychange`. Installed iOS PWAs had bugs before iOS 18.4 ⚠ |
| Share link | Web Share API → copy-link fallback | WhatsApp is the realistic channel in SG |
| Vibration | `navigator.vibrate` | **Not on iOS**, so voice and screen must carry the alert alone |
| Offline | Service worker: precache the app shell. When a trip starts, store the itinerary plus the tiles along its corridor (z15–17) | Live data (bus ETAs) is unavailable offline; show "last updated" |
| Battery | `getBattery()` where available (Chrome) | Low-battery mode: GPS every 5–10 s instead of continuous, dim map, Grey tiles, share interval 60 s |

- **Background reality:** a PWA cannot guide with the screen off. The design keeps the screen on during a trip (Wake Lock plus a dimmed "pocket" view). Arrival alerts while the phone is in a pocket rely on the screen staying on and on voice. This is the biggest platform limit, and the owner should know it.

---

## 3. Elderly UX principles (inputs for Creative)
1. **Three questions, always answered on the trip screen:** *Where am I? What do I do next? How long?*
2. **Type:** base ≥ 20 px, key instruction ≥ 32 px. A font-size control (100/125/150%) holds up to 200% browser zoom with no truncation.
3. **Contrast:** WCAG AA at minimum, AAA (7:1) for instruction text. Never use colour alone; the MRT line colour always comes with the line code ("EW", "NS").
4. **Targets:** ≥ 56 px, ≥ 8 px apart. One primary action per screen. No required gestures, and no long-press.
5. **Cognitive load:**
   - plain verbs ("坐 162 路巴士，坐 6 站");
   - count stops, not minutes;
   - landmarks over street names;
   - hide map controls by default.
6. **Reassurance:**
   - confirm each step done ("好，您已上车");
   - "You are on the right bus" check-ins;
   - never blame ("我们重新找路" rather than "You went the wrong way").
7. **Forgiving input:** saved places first and typing last; tolerate typos; offer voice input later.
8. **Multi-sensory alerts:** voice + big screen + vibration (Android), all escalating near the alight stop.
9. **Visible way out:** a Help button on every trip screen.

---

## 4. Feature list (tiered)

### Must, for 1.0
| # | Feature | Why |
|---|---|---|
| F1 | Search a place (OneMap) + "Use my location" as start | Core |
| F2 | A→B route options (≤ 3), each with total time, walk distance, transfers, and buses/lines as big chips | Core (owner) |
| F3 | **Multi-stop A→B→…→n** (chained segments, up to 5 stops) | Owner ask |
| F4 | **Guided trip**: one step per screen, large instruction, map below, auto-advance on arrival at each leg end | Owner ask |
| F5 | **Voice guidance** zh-CN + English, with a repeat button | Owner ask |
| F6 | **Follow-me mode**: camera follows, heading-up, recentre button | Owner ask |
| F7 | **"Get off at the next stop" alert**: stops-left countdown, voice + vibration + full-screen card one stop before and at the stop | Most-feared failure for seniors |
| F8 | **Live share trip**: link shows position, current step and ETA. No accounts. Auto-expires. Shows "Arrived ✔" when done | Owner ask; arrival notice is our add |
| F9 | **Real-time bus arrival** at the boarding stop ("Bus 162: 4 min, then 12 min") | High reassurance, cheap |
| F10 | **Off-route detection + auto re-route** ("我们重新找路") | Lost users are the core risk |
| F11 | **Saved places** + one-tap **"Take me home" (回家)** on the home screen | Fastest path for daily trips |
| F12 | **Help button**: call family (tel:), "Show my location" big card for a passer-by, "Show address to taxi driver" in huge text, taxi/Grab hand-off | Safety net |
| F13 | **Route preference**: least walking (default) / fewest transfers / fastest | Seniors care about walking more than minutes |
| F14 | Languages: **简体中文 (default) + English** | Brief |
| F15 | Font-size control + dark/light + reduce motion | Accessibility baseline |
| F16 | **Offline active trip**: a started trip keeps working without data (steps, map corridor, voice) | SG MRT tunnels and patchy signal |
| F17 | **MRT disruption alert** (TrainServiceAlerts) on affected routes, with an offer to re-route | Avoids stranding |
| F18 | Installable PWA, Report button (redacted field log), PDPA-clean privacy page | Process §3; compliance |

### Should (1.0 if time allows, else 1.1)
| # | Feature | Why |
|---|---|---|
| S1 | **Lift-friendly route** + lift-under-maintenance warning (Facilities Maintenance) | Walking aids, wheelchairs, prams |
| S2 | **Caregiver setup by link/QR**: family fills in Home, places and family phone on their own phone, and the senior opens one link to import | Seniors rarely set up apps themselves |
| S3 | Transfer guidance ("Change to the Circle Line, follow orange signs") + **MRT exit hint** for the final station | Transfers confuse. Exit data is not in OneMap legs ⚠; may need a curated table |
| S4 | Fare estimate + concession note ("Senior concession card fares apply") | Cost reassurance. Depends on OneMap `fare` field ⚠ |
| S5 | Bus seat load and wheelchair-accessible-bus icon (from BusArrival) | "Seats available" matters |
| S6 | Low-battery mode (auto below 20%) | Long trips, old phones |
| S7 | Sharer auto-notification on arrival (Web Push to family who opted in; iOS needs an installed PWA) | Families want the ping, not a link to watch |
| S8 | Recent trips list | Repeat trips |

### Later (post-1.0)
- Malay and Tamil UI. Dialect-friendly voice (Hokkien/Cantonese via pre-recorded clips; TTS doesn't support them).
- Voice input for search.
- Weather/rain heads-up (NEA data via data.gov.sg) with a "bring umbrella" prompt and covered-walkway preference.
- Rest stops, toilets and benches along the walk.
- Calendar-style reminders for regular appointments (clinic days).
- Live MRT arrival if LTA publishes it (an MOT reply in Jan 2026 discussed this as a proposal only).

---

## 5. Distribution
- Installable PWA on **Cloudflare Pages**, owner's account, `*.pages.dev` first, with an optional custom domain later.
- An "Add to Home screen" helper page with OS-specific pictures, which family can walk the senior through.
- No app stores for 1.0. A TWA (Play Store wrapper) is possible later.

## 6. Compliance
| Area | Commitments |
|---|---|
| **PDPA** | Location is processed on-device. It goes to the server only (a) as start/end coordinates for routing (not logged) and (b) during an explicit share, held in the DO memory/storage only for the share's lifetime, then deleted. No accounts, no analytics with location, and a plain-language privacy page in zh/en. Worker logs must not record coordinates |
| **OneMap** | Visible attribution on every map, and use per the OneMap Terms of Use. Respect rate limits (cache, debounce search to ≥ 300 ms). The token stays server-side |
| **LTA DataMall** | Singapore Open Data Licence + API Terms of Service. Attribution "Contains information from LTA DataMall" on the About page. Respect rate limits through caching |
| Accessibility | Target WCAG 2.2 AA (AAA contrast for instructions) |

## 7. Open questions for the owner (with recommended defaults)
| # | Question | Default |
|---|---|---|
| Q1 | Languages for 1.0? | 简体中文 (default) + English. Malay/Tamil later |
| Q2 | OneMap account and LTA DataMall key must be registered with **your** email; can you register both? | Yes. You register, and paste the credentials into Cloudflare Worker secrets (we give exact steps). Until then, M1 builds against recorded fixtures |
| Q3 | Host on your Cloudflare account? | Yes. Pages + Worker + DO, Free plan to start |
| Q4 | App domain? | `howtogo.pages.dev` (or similar) for now; custom domain optional later |
| Q5 | How long does a share link live? | Ends at arrival + 30 min, hard cap 4 h; the sharer can stop it any time |
| Q6 | Default route preference? | Least walking |
| Q7 | Accept that guidance needs the screen on (a PWA limit)? | Yes. Keep the screen on with a dimmed pocket view. A native app is the only fix |
| Q8 | Taxi fallback: which app? | Generic: show address big + open Grab if installed (deep link ⚠) + the CDG Zig website. No booking inside our app |

## 8. Plan
See `docs/requirements/ROADMAP.md`: M0 creative run → M1 foundation → M2 guided trip → M3 SG transit smarts → M4 share and safety → M5 1.0 hardening. **About 36–42 h total (M0 3 h + M1–M5 33–39 h) if run straight through**, excluding owner waits (credential registration, real-phone walk test).

Sources consulted: LTA DataMall dynamic datasets page (Facilities Maintenance listing); LTA "An Inclusive Public Transport System"; MOT parliamentary reply on real-time train arrival data (Jan 2026); third-party OneMap wrappers (onemapsgapi R package; an MCP OneMap service) for routing parameters.
