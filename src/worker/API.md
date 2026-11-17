# 怎么去? Worker API (v1, M3/M4 additions)

Base: same origin as the PWA. D-10: ONE Worker (`howtogo`) serves the PWA from Workers Static Assets (`src/web/dist`, SPA fallback, headers from `src/web/public/_headers`) and runs Worker code only for `/api/*` (`run_worker_first`). The PWA calls relative `/api/...` (`VITE_API_BASE` empty).
All responses are JSON (`application/json; charset=utf-8`) unless noted.

## Common rules
- **Errors:** `{"error":{"code":"<machine_code>","message":"<plain sentence>"}}`. Messages are plain English; the PWA should map `code` to its own zh/en text.
- **Upstream failure** (OneMap/LTA down, timeout after 8 s, non-2xx, bad JSON, token renewal failed): `502 {"error":{"code":"upstream_unavailable",...}}`. Upstream bodies are never forwarded.
- **Not configured** (secret missing): `503 not_configured`.
- **CORS:** only origins in `ALLOWED_ORIGINS` get `Access-Control-Allow-Origin`. A request carrying any other `Origin` gets `403 origin_not_allowed`. Requests without `Origin` (same-origin GET, curl) are allowed.
- **Singapore bbox** (all coordinate inputs): lat 1.13–1.48, lng 103.59–104.10 → otherwise `400 out_of_bounds`.
- `X-Cache: HIT|MISS` tells whether the Worker cache answered.
- **Rate limits (M1 AC 20, M4 AC 47):** per IP, sliding window, kept in each isolate's memory (so the effective limit is per IP per isolate). Over the limit → `429 {"error":{"code":"rate_limited",...}}` with `Retry-After: <seconds>`. IPs are hashed with a random per-isolate salt, never logged, and forgotten when the window passes. Requests without `CF-Connecting-IP` (local dev) are not limited.

  | Endpoint | Limit |
  |---|---|
  | `/api/search`, `/api/route`, `/api/revgeocode`, `/api/bus-arrival`, `/api/alerts`, `/api/lifts` (shared bucket) | 60 / min |
  | `POST /api/share` | 10 / hour |
  | `GET /api/share/:id` (viewer polling) | 1 per 5 s per share |
  | `POST /api/setup` | 5 / hour |
  | `GET /api/setup/:code` (counted for unknown codes too) | 30 / hour |
  | `PUT`/`DELETE /api/share/:id`, `/live` WebSocket, `/api/health` | not IP-limited (owner writes have the per-share 3 s limit; `help` bypasses it, D-7) |
- Other codes: `400 invalid_*` / `missing_query`, `404 not_found`, `405 method_not_allowed`, `413 payload_too_large` (bodies > 4 KB; `POST /api/setup` allows the 4096-byte ciphertext in base64url, ≈ 5.5 KB), `500 internal_error`.

## GET /api/health
`{"ok":true,"fixtureMode":true|false}`, `Cache-Control: no-store`, not rate-limited. `fixtureMode` is true when `FIXTURE_MODE=1`; the PWA then shows the "示范路线 / Sample routes" banner on Home, Search results and Route options.

## GET /api/search?q=
OneMap elastic search (token sent when available). `q` 1–100 chars. Cached 24 h per lower-cased, whitespace-collapsed query (`Cache-Control: private, max-age=86400`).
```json
{"results":[{"name":"Bishan MRT Station","address":"17 Bishan Place Bishan MRT Station Singapore 579842","postal":"579842","lat":1.351018,"lng":103.850057}]}
```
- `name`: BUILDING, else "BLK ROAD", else SEARCHVAL; title-cased, keeping MRT/LRT/HDB and codes like (NS17).
- `postal`: 6 digits or `""`. Deduped on name+postal; max 10.

## GET /api/route
`?start=lat,lng&end=lat,lng&date=MM-DD-YYYY&time=HH:MM:SS&mode=TRANSIT|BUS|RAIL&maxWalkDistance=<0..5000>&numItineraries=<1..5>`
- `date`/`time` default to now in Singapore time; `mode` defaults to TRANSIT; `numItineraries` to 3; `maxWalkDistance` omitted if absent.
- Proxies OneMap `api/public/routingsvc/route?routeType=pt&...` and returns the **raw OneMap JSON body unchanged** (the shared engine normalises it). Note: OneMap may answer 200 with an error object (e.g. no route); that is passed through too.
- Cached 2 min (`max-age=120`) keyed on coords rounded to 4 dp (~11 m), date, time truncated to the minute, mode, maxWalkDistance, numItineraries.
- Errors: `invalid_coordinates`, `out_of_bounds`, `invalid_date`, `invalid_time`, `invalid_mode`, `invalid_max_walk`, `invalid_num_itineraries`.

## GET /api/revgeocode?lat=&lng=
OneMap revgeocode (`buffer=50&addressType=All`); the location is rounded to 5 dp before it is sent and cached (1 h, `max-age=3600`).
```json
{"name":"Bishan Community Club","address":"51 Bishan Street 13 Bishan Community Club Singapore 579799","postal":"579799"}
```
Prefers the nearest entry with a building name. `404 not_found` when nothing is within 50 m.

## GET /api/bus-arrival?stop=<5 digits>[&service=<no>]
LTA DataMall BusArrival v3. Upstream cached 20 s per stop; `etaMin` is recomputed on every request.
```json
{"stop":"53009","fetchedAt":"2026-11-17T06:00:00.000Z","services":[
  {"no":"162","operator":"SBST","next":[{"etaMin":4,"load":"SEA","wheelchair":true,"deck":"double","monitored":true,"lat":1.3502,"lng":103.8487}]}
]}
```
- `monitored` (M3 AC 4): `true` when LTA's `Monitored` is 1 (time from the bus's GPS → "Live"); `false` when 0 or missing (time from the timetable → "约 / about", hollow dot, never "Live").
- `etaMin` = floor((EstimatedArrival − now)/60 s), never below 0. **0 means "Arr"** (arriving).
- `load`: SEA (seats available) / SDA (standing available) / LSD (limited standing); `SEA` if LTA leaves it blank.
- `wheelchair`: `Feature == "WAB"`. `deck`: SD→single, DD→double, BD→bendy.
- `lat`/`lng` only when LTA reports a real position (not 0.0).
- `fetchedAt`: when the Worker fetched LTA (show "updated x s ago").
- Services sorted numerically (13, 162, 410W). Empty slots are dropped, so `next` has 0–3 entries.

## GET /api/alerts
LTA `TrainServiceAlerts` (API guide v6.11 §2.11), cached 60 s.
```json
{"status":"disrupted","minor":false,
 "lines":[{"line":"NEL","direction":"Punggol","stations":["NE1","NE3"],"freePublicBus":["NE1","NE3"],"freeBusIslandWide":false,
           "freeShuttle":["NE1"],"shuttleDirection":"Punggol"}],
 "messages":[{"text":"1710hrs: NEL - No train service ...","createdAt":"2026-11-17T17:10:28+08:00"}]}
```
- `status` is `disrupted` if LTA Status = 2 or any segment is affected, otherwise `normal`.
- `minor` (M3 AC 24): `true` when `status` is `normal` but LTA published a message (minor delay, planned works) → quiet info line on Home, no banner.
- `line` is upper-cased (`NSL`, `EWL`, `NEL`, `CCL`, `DTL`, `TEL`, `BPL`, `STL`, `PTL`). `stations`, `freePublicBus`, `freeShuttle` are station codes only: LTA's `|` (interchange) and `;` (shuttle area) delimiters and `*` marks are flattened, duplicates removed. Map codes to zh names with the shared data table.
- `freeBusIslandWide`: LTA said "Free bus service island wide" instead of listing stations.
- `shuttleDirection`: `Both`, a terminus name, or `""`.
- `messages[].createdAt` is ISO with `+08:00`, or `null` if LTA's date is unreadable. Key dismissals on it.
- Robust to LTA's Jan 2026 "minor revisions": `value` as an array and single objects instead of arrays are accepted.

## GET /api/lifts
LTA `v2/FacilitiesMaintenance` (API guide v6.11 §2.23: ad hoc lift maintenance in MRT stations), cached **5 min** (`max-age=300`). Same error rules as the other LTA routes (`503 not_configured` without a key, `502 upstream_unavailable`, no upstream body).
```json
{"fetchedAt":"2026-11-17T06:00:00.000Z",
 "lifts":[{"line":"NEL","station":"NE12","stationName":"Serangoon","liftId":"B1L01","desc":"Exit B Street level - Concourse"}]}
```
- One entry per lift under maintenance **now**. The v2 API has no start/end dates (only the retired v1 had them).
- `station`: station code (rows without a valid code are dropped). `stationName`: LTA's English name; the PWA should show the zh name from its own table by code.
- `liftId`: optional in LTA's data → `null` when absent. `desc`: LTA's `LiftDesc` (exit/level text, English).
- `fetchedAt`: when the Worker fetched LTA. M3 AC 31: the "lifts OK" fact needs `fetchedAt` < 15 min old.
- Sorted by station code (numeric-aware), then lift id; duplicates removed.

## Live trip sharing
One Durable Object per share id. The id is 12 base62 characters (~71 bits). The owner token is 32 random bytes in base64url, and only its SHA-256 hash is stored.
Lifetime: `SHARE_TTL_HOURS` (default **4**, clamped to 1–24). When the owner reports `arrived`, the share **auto-ends 30 min later** (alarm at `min(expiresAt, arrivedAt+30 min)`). Switching back to another status cancels that.
**Test-only TTL (M4 OQ6):** `SHARE_TEST_TTL_SECONDS` (whole seconds, 1–86400) replaces the lifetime **only** when `ENVIRONMENT = "test"`, which is set solely in `wrangler.toml` `[env.test]` (`wrangler dev --local --env test`, 90 s). `test/config.test.ts` fails if either appears outside `[env.test]`.

### POST /api/share
Body `{"destName":"Bishan MRT Station","lang":"zh","senderName":"妈妈","senderPhone":"+6591234567"}`.
- `destName` 1–120 chars: the destination **name only**; no destination coordinates are accepted or stored (M4 OQ4). Help-only share: `"我在这里"`.
- `lang`: a code like `zh`, `en` or `zh-SG`, default `zh`.
- `senderName` (optional, 1–40 chars after trim): how family calls the sender. `400 invalid_sender_name`.
- `senderPhone` (optional, E.164 `+` and 7–15 digits, no spaces; the app turns SG 8 digits into `+65…`): only send it if the senior allowed it (OQ3). Shown to viewers while the share is live, removed from storage the moment it ends. `400 invalid_sender_phone`.
- `429 rate_limited` after 10 creates per IP per hour (the app's Help falls back to a plain WhatsApp/SMS text, AC 47).
→ `201 {"id":"aB3dE5fG7hJ9","ownerToken":"<43 chars>","viewPath":"/t/aB3dE5fG7hJ9","expiresAt":"2026-11-17T10:00:00.000Z"}`
Keep `ownerToken` on the device only; it is never shown again.

### PUT /api/share/:id   (Authorization: Bearer <ownerToken>)
Body `{"lat":1.35,"lng":103.82,"acc":12,"heading":90,"speed":1.2,"etaISO":"2026-11-17T07:30:00Z","stepText":"Take bus 162","status":"travelling","updatedAt":1763359200000}`
- `status`: `travelling | arrived | paused | help` (exported as `STATUSES` from `src/worker/src/share.ts` for the M4 AC 10 contract test). Anything else → `400 invalid_status`.
- **Position is optional (M4):** omit `lat`/`lng`/`acc` (or send null) for a status-only update: start before the first fix (`travelling`), `paused` from a hidden page, `help` with no fix. The last known position (and its `positionAt`) is then kept. If `lat` or `lng` is given, both plus `acc` are required.
- `heading` 0–360, `speed` m/s, `stepText` ≤ 280 chars, `etaISO`: optional or null. Send `etaISO: null` on `arrived`.
- `updatedAt`: epoch ms or ISO, capped at server time. → `204`.
- `429 rate_limited` + `Retry-After` (seconds) if the last accepted write was < 3 s ago. The client should keep only the latest fix and resend it.
- **D-7 (M4 AC 13): `status: "help"` bypasses the 3 s limit**, capped at one help write per second (`429`, `Retry-After: 1`). A help write still counts as the last write for the 3 s limit of other statuses.
- `401 unauthorized` (missing token), `403 forbidden` (wrong token), `400 out_of_bounds|invalid_*`, `404 share_not_found`, `410 share_ended|share_expired`.

### GET /api/share/:id
→ `200` (`Cache-Control: no-store`):
```json
{"destName":"陈笃生医院","lang":"zh","senderName":"妈妈","senderPhone":"+6591234567",
 "status":"help","lat":1.35,"lng":103.82,"acc":12,"heading":90,"etaISO":null,"stepText":"在 139 号巴士上",
 "updatedAt":"2026-11-17T02:12:00.000Z","positionAt":"2026-11-17T02:11:45.000Z","helpAt":"2026-11-17T02:12:00.000Z",
 "expiresAt":"2026-11-17T06:00:00.000Z"}
```
- `status`: `waiting` (no PUT yet; position fields `null`) · `travelling` · `paused` · `help` · `arrived` · `ended` (only in the WebSocket end message). `speed` is never exposed.
- `updatedAt`: time of the last update of any kind (use it for "x 分钟前更新" and the > 2 min "signal lost" state). `positionAt`: time of the last update that carried a position (`null` if none).
- `helpAt`: server time the current help started ("妈妈按了「帮忙」· 上午 10:12"); stays fixed across repeated help writes; `null` when not in help.
- `senderName` / `senderPhone`: as given at create, else `null`. Show "Call" only when `senderPhone` is non-null.
- No destination coordinates exist anywhere in the contract (OQ4).
- `404 share_not_found` (unknown, or already deleted after expiry), `410 share_ended` / `410 share_expired`, `429 rate_limited` (more than one GET per 5 s per IP for this share: poll at 15 s).

### GET /api/share/:id/live   (WebSocket)
Upgrade to a WebSocket. Without `Upgrade: websocket` the response is `426`. Viewers are read-only, and sending `ping` gets `pong`. At most 50 viewers per share (`429 too_many_viewers`).
Server messages:
- `{"type":"state","state":<same object as GET>}`: sent on connect and after every accepted PUT.
- On end (DELETE or arrival auto-end): `{"type":"state","state":{...,"status":"ended","lat":null,"senderPhone":null,...}}`, then close 1000 "ended". `senderName` and `destName` are kept so the page can say "妈妈已经停止分享".
- On expiry: `{"type":"expired"}`, then close 1000.
Reconnect with backoff. If the reconnect gets 404 or 410, show "trip ended". No SSE fallback yet.

### DELETE /api/share/:id   (Authorization: Bearer <ownerToken>)
→ `204`. The position and `senderPhone` are deleted immediately. A tombstone without coordinates or phone is kept so viewers get `410 share_ended`, and the alarm deletes all storage at `expiresAt`.

## Caregiver setup box (M4 AC 40–41, OQ1)
A one-time, 24 h store for an encrypted setup bundle. One Durable Object (`SetupBox`) per code. The Worker only ever sees ciphertext.

Client contract (family `/setup` page → senior app):
1. Encrypt the setup JSON in the browser: AES-GCM-256 with a random key and a random 12-byte IV. `ct` = **base64url without padding of `iv ‖ ciphertext‖tag`**.
2. `POST /api/setup` with body **exactly** `{"ct":"<base64url>"}` → `201 {"code":"aB3dE5fG7hJ9","expiresAt":"<ISO, now + 24 h>"}` (`Cache-Control: no-store`).
3. Share the link `https://<app>/s/<code>#k=<base64url raw key>`. The key lives only in the fragment, which browsers never send.
4. The senior app calls `GET /api/setup/<code>` → `200 {"ct":"…","expiresAt":"…"}` **once** (the ciphertext is deleted in the same step), decrypts locally, previews, saves. Fetch it only when the senior is about to import (opening the preview consumes it); keep the decrypted data in memory until Save/undo.

Errors:
- POST: `400 invalid_body` (anything other than the single `ct` field, e.g. a key, is refused), `400 invalid_ciphertext` (not base64url, padded, or under 28 bytes), `413 payload_too_large` (ciphertext over **4096 bytes** decoded), `400 invalid_json`, `429 rate_limited` (5 per IP per hour).
- GET: `410 setup_used` (already fetched), `410 setup_expired` (after 24 h), `404 setup_not_found` (unknown/malformed code, or more than 7 days after expiry), `429 rate_limited` (30 per IP per hour, unknown codes count too). Map to the AC 44 messages; a decrypt failure on the client means "链接不完整".
- Other methods: `405`.

Storage: `{box:{state,expiresAt}, ct}` only. The alarm deletes `ct` at 24 h whether used or not, keeps the content-free tombstone (`used`/`expired`) for 7 days so the app can show the right message, then deletes everything. The code and ciphertext are never logged.

## Fixture mode (AC 21, dev/QA only)
With `FIXTURE_MODE=1` (`npm run dev:fixtures -w @howtogo/worker`, i.e. `wrangler dev --var FIXTURE_MODE:1`) no credentials are needed and nothing is sent upstream. Input validation still applies. Responses carry `X-Fixture: 1` and `Cache-Control: no-store`.
- `/api/route`: one of 5 SYNTHETIC OneMap plans (3 from `@howtogo/shared/fixtures`, 2 in `src/worker/fixtures/trips.ts`): Toa Payoh → TTSH, Bishan → Raffles Place, Ang Mo Kio → TTSH, Jurong East → NUH, Bedok → Changi General Hospital. The trip whose destination (then origin) is nearest the request is picked (`X-Fixture-Trip: <name>`) and re-timed to start at the requested date/time.
- `/api/search`: the 9 fixture places, matched on name, address, postal code or Chinese alias (e.g. `陈笃生`, `樟宜`).
- `/api/revgeocode`: the nearest fixture place.
- `/api/bus-arrival`: the BusArrival v3 fixture for any stop, times moved so buses arrive in the next minutes.
- `/api/alerts`: `normal`. `/api/lifts`: SYNTHETIC outages at Bishan NS17 (Exit A), Buona Vista CC22 and Serangoon NE12.
- **Scenarios (M3 AC 39):** add `?fixture=<name>` (ignored outside fixture mode; unknown name → `400 invalid_fixture`):
  `/api/bus-arrival`: `live` (default; includes `monitored:false` and an `LSD` bus) · `empty` (every service, no times) · `not_configured` (503).
  `/api/alerts`: `normal` (default) · `minor` (Status 1 + message) · `disrupted` (NSL NS16–NS20, free bus + shuttle) · `not_configured`.
  `/api/lifts`: `outage` (default) · `none` · `not_configured`.
Never set `FIXTURE_MODE` in the production `wrangler.toml`. Without it and without credentials, route/revgeocode answer `503 not_configured`.

## Privacy
No coordinates, tokens, credentials, IPs, share ids, setup codes, ciphertext, phone numbers or names are logged. Logs carry only an event name, the upstream path and the status (checked by `test/logs.test.ts`, M1 AC 18 and M4 AC 49). Share state lives only in its Durable Object and is deleted at end or expiry; the setup ciphertext lives only in its SetupBox and is deleted on first read or at 24 h.
