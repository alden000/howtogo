# Handover: Director state for a fresh session

Read this first, then `docs/process/director-log.md` (all rulings), `docs/requirements/ROADMAP.md`, and the end of `docs/process/dev-log.md`.

The team process is the owner's `app-dev-team` skill. It isn't in the repo; ask the owner to attach it again.

## Where things stand (2026-11-17 evening)

| Stage | State |
|---|---|
| M0 Creative | Done. Logo B (去 seal). STYLE-GUIDE v1.3. Prototype: creative/prototype/ |
| M1 Foundation | Released (0.1.x) |
| M2 Guided trip | Released 0.2.0 to the preview. Owner phone test pending (script in M2-guided-trip.md) |
| M3 + M4 | Built and merged into the session branch with Creative's review fixes, **before the QA gate**. **Next:** fresh QA gate (qa/ suite + new M3/M4 ACs; run on a quiet host), then one batched fix round, then deploy. Deferred to M5 per Creative: lift-friendly ranking, bus-routes-only re-query, Contact Picker, auto-share, save-as-place, chip lastgone/notrunning. Web Push dropped |
| M5 Hardening | Spec written (M5-hardening-launch.md), not started |
| M6 Android | Round 1 merged. Signed release APK built (com.wwweeeiii.howtogo, versionCode 20000). Not yet run on a device |

## Hosting: action needed first

- 2026-11-17 late: `TOKEN_KV` was created on the owner's account (`howtogo-TOKEN_KV`, id `1e514bcf1539494db863191de13f5d3c`), and the id is in both wrangler configs, so step 1 below is done. The cloud session's proxy token still pointed at raus-ums, so nothing was deployed. Development now moves to the owner's local machine (nnie): deploy from there with wrangler logged in to the owner's account.

- The owner wants the app **only** on their own Cloudflare account, the one that holds `wwweeeiii.com`, at **https://howtogo.wwweeeiii.com**. Don't use the old `raus-ums` account.
- The owner saved a Cloudflare API token for that account as an environment network secret. A claude.ai Cloudflare connector bound to the old account was overriding it. The owner is reconnecting or disconnecting that connector, so a new session should pick up the right account. Check with `curl https://api.cloudflare.com/client/v4/accounts`: the account must **not** be the one whose workers.dev subdomain is `raus-ums`.
- Steps:
  1. `npx wrangler kv namespace create TOKEN_KV` → put the id in **both** `src/worker/wrangler.toml` and `src/worker/wrangler.preview.toml`.
  2. `npm run deploy:preview`, with `CLOUDFLARE_API_TOKEN=proxy-injected` and `CLOUDFLARE_ACCOUNT_ID` set. Static-assets upload fails behind the proxy (JWT overwritten), so the preview config embeds the assets.
  3. Attach the custom domain `howtogo.wwweeeiii.com` to the Worker. Use the API (`PUT /accounts/:id/workers/domains`), or the owner adds it in the dashboard.
  4. Smoke-test at phone width.
  5. Ask the owner before deleting the old raus-ums Worker `howtogo` and KV `TOKEN_KV`.
- `ALLOWED_ORIGINS` and the CSP already include the custom domain and `https://localhost` (Capacitor).

## LTA key reuse (owner decision)
- Bus arrival reuses the owner's existing Worker `whereisthebus-lta-proxy` (same Genixm account) through the service binding `LTA_PROXY`, so its key isn't needed here. Deploys fail in an account without that Worker.
- Train alerts and lifts still need the raw key: ask via the secure form, `wrangler secret put LTA_ACCOUNT_KEY`. Until then they return `not_configured`.

## Still pending from the owner

- OneMap account and LTA DataMall key. They go in as Wrangler secrets; then set `FIXTURE_MODE="0"`. Never paste keys in chat.
- Privacy contact for About.
- Phone tests: M2 walk + bus test; the M6 APK sideload test script is in the dev-log.

## Owner holds

- The Android signing keystore + passwords, delivered once on 2026-11-17. It is not in the repo. Ask the owner for it to sign future releases.

## Rules (from the owner)

- Push only to `claude/elderly-routing-pwa-app-hdhvge`.
- No legality or morality commentary.
- Never share the owner's personal details with external services.
- Accept recommended defaults (D-6); ask only for owner-only decisions.
- Parallelise; more tokens are OK (D-9).
