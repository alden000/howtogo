# Deploying 怎么去? (owner's machine)

Two Workers on the owner's Cloudflare account (M5 AC 30, OQ4), both from `src/worker/wrangler.toml`:

| Worker | Config | URL | Data |
|---|---|---|---|
| `howtogo-preview` | top level | https://howtogo-preview.genixm.workers.dev | `FIXTURE_MODE="1"`: sample routes + "示范路线 / Sample routes" banner |
| `howtogo` | `[env.production]` | https://howtogo.wwweeeiii.com (custom domain); https://howtogo.genixm.workers.dev redirects HTML pages there (not `/t/*`, not `/api/*`) | live only: `FIXTURE_MODE="0"`. Without the secrets the API answers 503 and the app says "暂时无法查路线 / Can't find routes right now", never sample routes |

The top level is the preview on purpose: a bare `wrangler deploy` can never reach production.
`account_id` is pinned in `wrangler.toml`, because wrangler sees two accounts on this machine.

All commands run in **Git Bash** from the repo root unless a `cd` is shown. Agents never run the deploy, secret or rollback commands: the owner does.

## 0. Once per machine
```bash
npm ci
cd src/worker && npx wrangler login && npx wrangler whoami && cd ../..
```
`whoami` must list the account `bda70e28e71059956f5f02287522bb66`.

## 1. Once: the preview's own KV namespace
Production uses `howtogo-TOKEN_KV`, which already exists. The preview needs its own:
```bash
cd src/worker
npx wrangler kv namespace create howtogo-preview-TOKEN_KV
```
Paste the printed id into `wrangler.toml` at the top-level `[[kv_namespaces]]`, replacing `REPLACE_WITH_PREVIEW_KV_ID`.
Then run `npm run embed:config -w @howtogo/worker` (this regenerates `wrangler.embed.toml`) and commit both files.
`deploy:preview` refuses to run while the placeholder is there.

## 2. Secrets (owner only; values never in chat, logs or the repo)
Production. Each command prompts for the value:
```bash
cd src/worker
npx wrangler secret put ONEMAP_EMAIL --env production
npx wrangler secret put ONEMAP_PASSWORD --env production
npx wrangler secret put LTA_ACCOUNT_KEY --env production
# optional: unlocks GET /api/stats (anonymous error counts); use a random value of 16+ characters
npx wrangler secret put STATS_TOKEN --env production
```
The preview needs none of these while it is in fixture mode. The preview reads the same names without `--env production`.

### 2a. Optional: Claude smart search (1.1)
Without this secret the AI layer is simply off (`/api/health` → `"ai":"off"`); the alias table still works.
1. Get a key: sign in at console.anthropic.com → **API keys** → **Create key** (name it e.g. `howtogo-production`).
   Set a monthly spend limit there (Settings → Limits) as a second guard.
2. Store it (prompts for the value; never paste it into chat, a file or a commit):
   ```bash
   cd src/worker
   npx.cmd wrangler secret put ANTHROPIC_API_KEY --env production
   ```
3. Check: `/api/health` on production shows `"ai":"on"`.

Cost guards in the Worker: Claude is asked only when OneMap + aliases find fewer than 2 places; answers are
cached 30 days per query; 20 rewrites per client per hour; `AI_DAILY_CAP` (wrangler.toml `[vars]`, default
`"300"` in both environments since 1.1 (Director ruling 2026-11-19), `"0"` = off) caps calls per Singapore day.
Rough cost: about US$0.01 per uncached rewrite (`claude-opus-5-5`, effort low), so the cap bounds the worst
day at about US$3. KV note: each uncached rewrite writes 2 KV keys (cache + day counter). The Workers Free
plan allows 1,000 KV writes/day in total; the default 300 stays inside it (keep it at 400 or less on Free; the
OneMap token uses a few writes too). Raise it only on a paid plan.
To turn the AI off quickly: `npx.cmd wrangler secret delete ANTHROPIC_API_KEY --env production`, or set
`AI_DAILY_CAP = "0"` and redeploy.

> **Set the secrets BEFORE the first `npm run deploy:prod`.** The production Worker deployed on 2026-11-18 came from
> the old single-Worker config (`FIXTURE_MODE="1"`). The new production config is live-only. If the secrets are
> missing, every route search answers 503 until they are set. That is correct behaviour (no fake data), but it
> is not a useful state for users.

## 3. Deploy the preview, then smoke it
```bash
npm run deploy:preview
npm run smoke:deploy -- https://howtogo-preview.genixm.workers.dev
```
- `deploy:preview` (scripts/deploy.mjs) does three things: it checks the KV id, runs the release build (`VITE_API_BASE=""`, same origin), then runs `wrangler deploy -c wrangler.toml --env=`. Static assets are uploaded with the Worker, and only `/assets/*` (hashed, immutable) bypass the Worker.
- If the assets upload fails on some network, use `npm run deploy:preview -- --embed`. It embeds the build in the Worker bundle (`wrangler.embed.toml`, entry `src/index.embed.ts`).
- `-- --dry-run` builds and bundles only. Nothing is uploaded.
- `smoke:deploy` checks, without secrets:
  - `/`: 200, no-cache, CSP, security headers;
  - `/version.json` and the `/api/health` version;
  - hashed assets: immutable;
  - a missing chunk: 404;
  - `sw.js` and the manifest: no-cache;
  - manifest fields and icons;
  - `/api/health` shape;
  - `/t/<random>`: the family page, noindex, no-referrer; `/api/share/<random>` → 404;
  - `/setup`: no-referrer;
  - `/android`: the page; `latest.json` → the APK it names: headers, size and SHA-256 (SKIP when none is staged).

  Exit 0 = PASS.

## 4. Deploy production, then smoke it
```bash
npm run deploy:prod
npm run smoke:deploy -- https://howtogo.wwweeeiii.com --expect-live
npm run smoke:live -- https://howtogo.wwweeeiii.com
```
- `smoke:live` exit codes: 0 PASS, 1 FAIL, 2 BLOCKED (fixture mode or missing credentials; BLOCKED is not FAIL). It exits cleanly on Windows too (no crash code after BLOCKED).
- LTA (Director ruling, QA-55): `/api/health` `lta: key` or `lta: proxy` both count as live.
  - `lta: proxy` (the `LTA_PROXY` service binding, no `LTA_ACCOUNT_KEY`): bus arrival must PASS through the proxy. Alerts and lifts answer 503 `not_configured`; the script prints them as `WARN … SKIP not_configured`, which is not a FAIL.
  - `lta: none`: BLOCKED.
  - Setting `LTA_ACCOUNT_KEY` later turns alerts and lifts on; they are then checked like the rest.
  - It makes at most 20 requests, at least 300 ms apart.
  - It prints no tokens, no response bodies, and no coordinates except the fixed public test points.
  - `--json` writes `qa/.out/smoke-live.json`.
- 1.0.0 is tagged only after `smoke:live` PASS on production (OQ9): live OneMap (search, routes, revgeocode) and bus arrival PASS. WARN lines for alerts/lifts under `lta: proxy` do not hold the tag.

## 4a. Releasing the Android APK (M6 AC 39)
No R2 bucket (Director ruling): the signed APK is a **static asset of the Worker**, served at
`/android/howtogo-<versionName>.apk` (+ `.sha256`). `src/android/release-history.json` (committed) lists every
release; its last entry is `/android/latest.json` (the app's update check) and the `/android` page.
```bash
# 1. build → 2. verify → 3. stage, in one command (signing env from the key files, never written anywhere)
npm run android:release
# 4. deploy (re-stages the APK into the fresh web build), 5. smoke (downloads the APK, compares the SHA-256)
npm run deploy:prod
npm run smoke:deploy -- https://howtogo.wwweeeiii.com --expect-live
```
- `android:release` = web release build → cap sync → Gradle → `scripts/android/verify-release.sh` (must say ALL PASS)
  → `npm run android:stage -- <apk>` (`scripts/android/stage-apk.mjs`). Stage reads versionName/versionCode from the
  APK itself, refuses an unsigned APK, an APK over **25 MiB** (the static-assets per-file limit) or a versionCode
  not above the history, then:
  - appends `{versionName, versionCode, date, size, sha256, path}` to `release-history.json` (**commit it**);
  - keeps the APK in `src/android/releases/` (gitignored: APKs never enter git);
  - copies APK + `.sha256` into `src/web/dist/android/`.
- `STAGE=0 npm run android:release` builds and verifies only. An APK built elsewhere: `npm run android:stage -- <path>`.
  The same version again with other bytes needs `-- --replace`, and only if that version was never deployed.
- `deploy:prod` runs `stage-apk.mjs --restage` after its web build. If the history names a release whose APK is not in
  `src/android/releases/` on this machine, it warns and deploys anyway: `/android` then says "download not available"
  and the app shows no update notice. Stage the APK first.
- Headers (Worker, `src/worker/src/android.ts`): the APK `application/vnd.android.package-archive`,
  `Content-Disposition: attachment`, `public, max-age=31536000, immutable` (the name carries the version);
  `latest.json` `public, max-age=300`. A staged file whose size differs from the history entry is not offered.
- The APK never enters the PWA precache (the SW list is built from the bundle; the SW ignores `/android*`), the app
  itself (`sync.mjs` drops `public/android`) or the `--embed` variant (no APK there: the page says "not available").
- `smoke:deploy` prints `SKIP android release: none staged` when `latest.json` is 404; that is not a FAIL.

## 5. Rollback
```bash
cd src/worker
npx wrangler deployments list --env production    # or without --env for the preview
npx wrangler rollback --env production             # back to the previous version
```
Then run `smoke:deploy` again against the same URL.

## 6. Rotating the OneMap password or the LTA key
1. Change the password or key at OneMap / LTA DataMall.
2. Run `npx wrangler secret put ONEMAP_PASSWORD --env production` (or `LTA_ACCOUNT_KEY`).
   - A new secret creates a new Worker version at once. No redeploy is needed.
   - The cached OneMap token in KV renews on its own on the next 401.
3. Run `npm run smoke:live -- https://howtogo.wwweeeiii.com`.

## 7. Anonymous error counts (M5 §I)
```bash
curl -s -H "Authorization: Bearer <STATS_TOKEN>" "https://howtogo.wwweeeiii.com/api/stats?days=7"
```
- Without the right token, the endpoint answers 404.
- Rows are day × version × code × screen → count.
- Rows older than 90 days are deleted automatically.
- No IP, no location, no text.

## Notes
- **Cloudflare Web Analytics** on the `wwweeeiii.com` zone auto-injects `static.cloudflareinsights.com/beacon.min.js` into HTML.
  - Our CSP blocks it on purpose: no third-party scripts (M5 non-goals, AC 25). The only effect is a console error.
  - To silence it, the owner can turn off automatic injection for `howtogo.wwweeeiii.com` in the dashboard: Analytics & Logs → Web Analytics → the site → Manage → disable "Automatic setup" for this hostname, or exclude the hostname.
- **LTA_PROXY** service binding (both Workers): this reuses the owner's `whereisthebus-lta-proxy` for bus arrivals when `LTA_ACCOUNT_KEY` is unset. `wrangler deploy` fails if that Worker does not exist on the account. Remove the binding blocks in `wrangler.toml` in that case.
- **Durable Objects:** each Worker has its own `TripShare`, `SetupBox` and `Stats` (migrations `v1`–`v3`).
  - The first `deploy:prod` from the new config applies `v3` (`Stats`) to the existing `howtogo` Worker.
  - Shares sent from the preview stay on the preview.
- **Headers:**
  - Every response except the hashed `/assets/*` goes through the Worker (`run_worker_first = ["/*", "!/assets/*"]`), so HTML gets a per-origin CSP that allows its own `wss:` for live sharing.
  - `[assets] not_found_handling = "none"`: the Worker serves `index.html` for page paths itself, so a missing chunk is a real 404 (AC 18).
