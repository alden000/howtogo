# 怎么去? (Zěnme qù? — "How to go?") — Project brief

**Owner's ask (2026-11-17, verbatim summary):**
- A simplified, end-to-end public-transport routing **PWA for elderly users in Singapore**.
- Step-by-step guide from point A to B, and optionally via more stops (A → B → … → n), "similar to Google Maps".
- **Real-time step-by-step instructions, visual AND audible** (voice guidance).
- Routing and map layer: explore **OneMap** (Singapore Land Authority) APIs.
- Full creative run: aesthetically pleasing, polished, "fit for winning best-app awards".
- **Follow-me mode** (map follows the user, heading-up, auto-advances steps).
- **Share my trip, real-time**: share current position and ETA with family via a link.
- Team is asked to suggest anything missed.

## Platform spike results (Director, 2026-11-17)
| API | Result without credentials | Notes |
|---|---|---|
| OneMap search `api/common/elastic/search` | 200, results returned (+ "token missing" warning) | Usable; still proxy it so a token can be added |
| OneMap routing `api/public/routingsvc/route` (routeType=pt) | **401** | Needs OneMap account token. Token is issued from email+password via `api/auth/post/getToken`, **expires every 3 days** → must live server-side and auto-renew |
| OneMap reverse geocode `api/public/revgeocode` | **401** | Needs token |
| OneMap tiles `maps/tiles/Default/{z}/{x}/{y}.png` | 200 | Public. Styles: Default, Night, Grey, Original, LandLot. OneMap attribution required |
| LTA DataMall BusArrival v3 | 404 without `AccountKey` | Free key on request; real-time bus arrival is a strong elderly feature ("Bus 162 comes in 4 min") |
| Cloudflare API | Account reachable from this session | Candidate hosting: Pages (PWA) + Worker (API proxy holding OneMap/LTA secrets) + Durable Object (live trip sharing) |

**Conclusion:** a thin server (Cloudflare Worker) is required: it holds the OneMap credentials and auto-renews the token, holds the LTA key, adds caching, and runs the live "share my trip" relay. The PWA never sees any secret.

## Constraints / principles
- Users are 60–90 years old: large type (base ≥ 20px), high contrast, 56px+ targets, one primary action per screen, no gestures required (every gesture has a button), forgiving input, voice output, very little reading.
- Languages to consider: Chinese (Simplified) primary per app name, English; Malay/Tamil later.
- Privacy: location only used on-device and in an explicit, time-limited share. No accounts required.
- Mobile web first (Android Chrome + iOS Safari), installable PWA, works offline for a saved trip once started.
