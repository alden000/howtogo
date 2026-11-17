# 怎么去? Worker API (v1)

Base: same origin as the PWA (`/api/*`, via a Worker route or Pages Function), or the Worker's own domain.
All responses are JSON (`application/json; charset=utf-8`) unless noted.

## Common rules
- **Errors:** `{"error":{"code":"<machine_code>","message":"<plain sentence>"}}`. Messages are plain English; the PWA should map `code` to its own zh/en text.
- **Upstream failure** (OneMap/LTA down, timeout after 10 s, non-2xx, bad JSON, token renewal failed): `502 {"error":{"code":"upstream_unavailable",...}}`. Upstream bodies are never forwarded.
- **Not configured** (secret missing): `503 not_configured`.
- **CORS:** only origins in `ALLOWED_ORIGINS` get `Access-Control-Allow-Origin`. A request carrying any other `Origin` gets `403 origin_not_allowed`. Requests without `Origin` (same-origin GET, curl) are allowed.
- **Singapore bbox** (all coordinate inputs): lat 1.13–1.48, lng 103.59–104.10 → otherwise `400 out_of_bounds`.
- `X-Cache: HIT|MISS` tells whether the Worker cache answered.
- Other codes: `400 invalid_*` / `missing_query`, `404 not_found`, `405 method_not_allowed`, `413 payload_too_large` (bodies > 4 KB), `500 internal_error`.

## GET /api/search?q=
OneMap elastic search (token sent when available). `q` 1–100 chars. Cached 1 day per lower-cased, whitespace-collapsed query.
```json
{"results":[{"name":"Bishan MRT Station","address":"17 Bishan Place Bishan MRT Station Singapore 579842","postal":"579842","lat":1.351018,"lng":103.850057}]}
```
- `name`: BUILDING, else "BLK ROAD", else SEARCHVAL; title-cased, keeping MRT/LRT/HDB and codes like (NS17).
- `postal`: 6 digits or `""`. Deduped on name+postal; max 10.

## GET /api/route
`?start=lat,lng&end=lat,lng&date=MM-DD-YYYY&time=HH:MM:SS&mode=TRANSIT|BUS|RAIL&maxWalkDistance=<0..5000>&numItineraries=<1..5>`
- `date`/`time` default to now in Singapore time; `mode` defaults to TRANSIT; `numItineraries` to 3; `maxWalkDistance` omitted if absent.
- Proxies OneMap `api/public/routingsvc/route?routeType=pt&...` and returns the **raw OneMap JSON body unchanged** (the shared engine normalises it). Note: OneMap may answer 200 with an error object (e.g. no route); that is passed through too.
- Cached 60 s keyed on coords rounded to 4 dp (~11 m), date, time truncated to the minute, mode, maxWalkDistance, numItineraries.
- Errors: `invalid_coordinates`, `out_of_bounds`, `invalid_date`, `invalid_time`, `invalid_mode`, `invalid_max_walk`, `invalid_num_itineraries`.

## GET /api/revgeocode?lat=&lng=
OneMap revgeocode (`buffer=50&addressType=All`); the location is rounded to 4 dp before it is sent and cached (1 day).
```json
{"name":"Bishan Community Club","address":"51 Bishan Street 13 Bishan Community Club Singapore 579799","postal":"579799"}
```
Prefers the nearest entry with a building name. `404 not_found` when nothing is within 50 m.

## GET /api/bus-arrival?stop=<5 digits>[&service=<no>]
LTA DataMall BusArrival v3. Upstream cached 20 s per stop; `etaMin` is recomputed on every request.
```json
{"stop":"53009","fetchedAt":"2026-11-17T06:00:00.000Z","services":[
  {"no":"162","operator":"SBST","next":[{"etaMin":4,"load":"SEA","wheelchair":true,"deck":"double","lat":1.3502,"lng":103.8487}]}
]}
```
- `etaMin` = floor((EstimatedArrival − now)/60 s), never below 0. **0 means "Arr"** (arriving).
- `load`: SEA (seats available) / SDA (standing available) / LSD (limited standing); `SEA` if LTA leaves it blank.
- `wheelchair`: `Feature == "WAB"`. `deck`: SD→single, DD→double, BD→bendy.
- `lat`/`lng` only when LTA reports a real position (not 0.0).
- `fetchedAt`: when the Worker fetched LTA (show "updated x s ago").
- Services sorted numerically (13, 162, 410W). Empty slots are dropped, so `next` has 0–3 entries.

## GET /api/alerts
LTA `TrainServiceAlerts`, cached 60 s.
```json
{"status":"disrupted",
 "lines":[{"line":"NEL","direction":"Punggol","stations":["NE1","NE3"],"freePublicBus":["NE1","NE3"],"freeShuttle":["NE1"]}],
 "messages":[{"text":"1710hrs: NEL - No train service ...","createdAt":"2026-11-17T17:10:28+08:00"}]}
```
`status` is `disrupted` if LTA Status = 2 or any segment is affected, otherwise `normal`.

## Live trip sharing
One Durable Object per share id. The id is 12 base62 characters (~71 bits). The owner token is 32 random bytes in base64url, and only its SHA-256 hash is stored.
Lifetime: `SHARE_TTL_HOURS` (default **4**, clamped to 1–24). When the owner reports `arrived`, the share **auto-ends 30 min later** (alarm at `min(expiresAt, arrivedAt+30 min)`). Switching back to another status cancels that.

### POST /api/share
Body `{"destName":"Bishan MRT Station","lang":"zh"}`. `destName` is 1–120 chars. `lang` is a code like `zh`, `en` or `zh-SG` and defaults to `zh`.
→ `201 {"id":"aB3dE5fG7hJ9","ownerToken":"<43 chars>","viewPath":"/t/aB3dE5fG7hJ9","expiresAt":"2026-11-17T10:00:00.000Z"}`
Keep `ownerToken` on the device only; it is never shown again.

### PUT /api/share/:id   (Authorization: Bearer <ownerToken>)
Body `{"lat":1.35,"lng":103.82,"acc":12,"heading":90,"speed":1.2,"etaISO":"2026-11-17T07:30:00Z","stepText":"Take bus 162","status":"travelling","updatedAt":1763359200000}`
- `status`: `travelling | arrived | paused | help`. `heading` 0–360, `speed` m/s, `stepText` ≤ 280 chars. These fields and `etaISO` are optional or null.
- `updatedAt`: epoch ms or ISO, capped at server time. → `204`.
- `429 rate_limited` + `Retry-After` (seconds) if the last accepted write was < 3 s ago. The client should keep only the latest fix and resend it.
- `401 unauthorized` (missing token), `403 forbidden` (wrong token), `400 out_of_bounds|invalid_*`, `404 share_not_found`, `410 share_ended|share_expired`.

### GET /api/share/:id
→ `200 {"destName","lang","status","lat","lng","acc","heading","etaISO","stepText","updatedAt","expiresAt"}` (`Cache-Control: no-store`).
`status` is `waiting` until the first PUT, and position fields are `null` then. `speed` is never exposed.
`404 share_not_found` (unknown, or already deleted after expiry), `410 share_ended` / `410 share_expired`.

### GET /api/share/:id/live   (WebSocket)
Upgrade to a WebSocket. Without `Upgrade: websocket` the response is `426`. Viewers are read-only, and sending `ping` gets `pong`. At most 50 viewers per share (`429 too_many_viewers`).
Server messages:
- `{"type":"state","state":<same object as GET>}`: sent on connect and after every accepted PUT.
- On end (DELETE or arrival auto-end): `{"type":"state","state":{...,"status":"ended","lat":null,...}}`, then close 1000 "ended".
- On expiry: `{"type":"expired"}`, then close 1000.
Reconnect with backoff. If the reconnect gets 404 or 410, show "trip ended". No SSE fallback yet.

### DELETE /api/share/:id   (Authorization: Bearer <ownerToken>)
→ `204`. The position is deleted immediately. A tombstone without coordinates is kept so viewers get `410 share_ended`, and the alarm deletes all storage at `expiresAt`.

## Privacy
No coordinates, tokens, credentials or IPs are logged. Logs carry only an event name, the upstream path and the status. Share state lives only in its Durable Object and is deleted at end or expiry.
