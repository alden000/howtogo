# 怎么去? — Roadmap

PM · 2026-11-17 · Estimates are wall-clock hours "if run straight through". They exclude owner waits (decisions, credential registration, a real-phone walk test), fix rounds beyond one, and usage-limit pauses.

| M | Name | Est. | Depends on |
|---|---|---|---|
| M0 | Creative run | ~3 h (parallel with kickoff) | Brief |
| M1 | Foundation | 6–8 h | M0 sign-off (UI round); engine round can start before |
| M2 | Guided trip | 7–8 h | M1 |
| M3 | SG transit smarts | 6–7 h | M1 (parallel with M2 for engine work) |
| M4 | Share & safety | 6–7 h | M2 |
| M5 | 1.0 hardening & launch (web) | 5–6 h | M2–M4 |
| M6 | Android app (Capacitor) | 6–8 h | M2 (can start after M2, parallel with M3–M5); release after M5 |
| | **Total** | **~39–47 h** (+ M0 3 h) | |

---

## M0 — Creative run (in progress, parallel)
- **Goal:** owner signs off the look and feel before any production UI.
- **Scope:**
  - brand idea;
  - logo (3+ concepts);
  - tokens (colour light/dark incl. MRT line colours, type scale for base ≥ 20 px, spacing, 56 px targets);
  - motion and reduce-motion;
  - voice-copy rules in zh/en;
  - an interactive prototype of Home → Search → Routes → Guided trip → Get-off alert → Share view.
- **Exit:** owner sign-off; `creative/STYLE-GUIDE.md` has M1 frames (see M1 "Creative frames needed").

## M1 — Foundation
- **Goal:** a real, installable PWA that finds real routes A→B on OneMap data and shows them on a map.
- **Scope:**
  - PWA shell (manifest, service worker, install, in-app history/Back);
  - zh/en i18n;
  - font-size control and dark/light;
  - Worker proxy with OneMap token auto-renew and caching;
  - search;
  - "use my location" with reverse geocode;
  - route list (≤ 3, least walking);
  - route detail steps;
  - MapLibre map with OneMap tiles and attribution;
  - Report button;
  - Playwright test kit;
  - deployed preview on Cloudflare Pages.
- **Exit:** all Must ACs in `M1-foundation.md` pass in the gate (Playwright + Lighthouse PWA installable). Deployed preview URL works on a real phone.

## M2 — Guided trip
- **Goal:** the owner's core ask: step-by-step, visual + voice, follow-me, from start to arrival.
- **Scope:**
  - guided trip state machine (pure, unit-tested): walk → wait → ride → alight → transfer → arrive;
  - auto-advance by position;
  - stops-left countdown;
  - **get-off alert** (voice + vibration + full-screen);
  - voice zh/en with repeat;
  - follow-me heading-up and recentre;
  - Wake Lock and pocket view;
  - off-route detection and auto re-route;
  - offline active trip (itinerary + corridor tiles);
  - GPS-replay test harness.
- **Exit:**
  - scripted GPS replays of 3 real SG routes (bus-only, MRT with transfer, mixed) pass end to end in headless Chromium;
  - one real-phone walk (owner or family) completes a short trip.

## M3 — SG transit smarts
- **Goal:** live Singapore data that seniors actually need.
- **Scope:**
  - real-time bus arrival at the boarding stop (BusArrival v3), seat load and WAB icons;
  - MRT disruption banner and re-route offer (TrainServiceAlerts);
  - lift-maintenance warning and lift-friendly preference (Facilities Maintenance);
  - **multi-stop A→B→…→n** (chained segments, ≤ 5 stops);
  - fewest-transfers / fastest preferences;
  - transfer guidance copy;
  - fare estimate + concession note (if the OneMap fare field is confirmed);
  - MRT exit hint (if a data source is found).
- **Exit:** ACs pass against recorded LTA fixtures and against the live API with the owner's key.

## M4 — Share & safety
- **Goal:** family can see the trip live, and the senior always has a way out.
- **Scope:**
  - Durable Object trip relay;
  - share link via Web Share or WhatsApp;
  - viewer page with position, step and ETA, and an "Arrived ✔" state;
  - auto-expiry;
  - stop sharing;
  - optional Web Push on arrival;
  - saved places and one-tap **回家 Take me home**;
  - **Help** (call family, show-my-location card, show-address-to-taxi card, taxi hand-off);
  - caregiver setup by link/QR;
  - recent trips.
- **Exit:**
  - a two-browser Playwright test (sharer + viewer) shows live updates, arrival and expiry;
  - the privacy review shows no coordinates in logs.

## M5 — 1.0 hardening & launch
- **Goal:** fast, frugal, accessible, and live on the owner's domain.
- **Scope:**
  - perf budget (first load ≤ 2.5 s on a mid Android over 4G; JS ≤ 300 KB gz excl. map);
  - battery (low-battery mode, GPS throttling);
  - a11y audit (axe + manual screen reader, 200% zoom);
  - Lighthouse ≥ 90 on all categories;
  - SW update path;
  - PDPA privacy page and About/attribution;
  - "Add to Home screen" helper;
  - production deploy plus custom domain if wanted;
  - field test with 1–2 seniors.
- **Exit:** release gate green; owner field-test sign-off; 1.0 tagged.

## M6 — Android app (Capacitor)
Added 2026-11-17 at the owner's request (director-log D-4/D-5).
- **Goal:** guidance keeps working with the screen off or the phone locked, in a pocket or bag.
- **Scope:**
  - a Capacitor Android shell around the same web build (`src/android`);
  - a native `platform` adapter implementation (the web UI already calls location, speech, wake-lock, vibration and notifications through one interface):
    - location via a foreground service (type `location`) only while a trip is active, with an ongoing "Trip in progress" notification (Stop button);
    - native TTS for voice cues when locked;
    - high-priority lock-screen notifications plus vibration for "get off at the next stop" / "get off now" / "off route";
    - share-my-trip updates continue in the background;
  - permissions: foreground location; `POST_NOTIFICATIONS`; FGS location. Avoid `ACCESS_BACKGROUND_LOCATION` if the FGS-while-in-use pattern suffices (Director to confirm with a spike);
  - System Back follows the in-app page stack (process §7); predictive back on;
  - release signing, versionCode ranges (release N, test ≥ N+10, hotfix N+1), R8 off or keep rules plus a release smoke test;
  - battery: GPS interval adapts to the leg (walk 2 s, bus/MRT 5–10 s, near alight 2 s); Samsung/OEM battery-optimisation guidance screen;
  - distribution: sideload APK only (owner ruling D-6: no Play Store).
- **Testability:** an emulator with a mocked GPS route (adb `emu geo fix` script) and the screen locked; then a real-device walk/bus test with the owner's phone under the device rules.
- **Exit:** a locked-screen bus trip on a real phone gives voice and lock-screen "get off next stop" at the right stop; the release APK passes the gate; no battery drain above budget (≤ 8%/h during guidance).
- **Later:** an iOS app via the same Capacitor shell (needs a Mac or cloud macOS, plus TestFlight).
