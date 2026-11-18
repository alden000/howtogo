# 怎么去? release gate (web / PWA)

One command, from the repo root: **`qa/gate.sh`** (≈ 3–4 min). Terse per-step lines, then `GATE PASS` or `GATE FAIL — failing steps: …`.
Logs go to `qa/.out/logs/<step>.log`. QA-only dependencies live in `qa/package.json` (not in the root workspace). Install them once with `npm ci --prefix qa`.

The gate is **read-only for `src/`**:
- Builds go to `qa/.out/dist` (A) and `qa/.out/dist-b` (B = A plus `VITE_FLAGS=qa-b`, used only for the SW-update test).
- Playwright runs with `updateSnapshots: 'none'`, so it compares baselines and never writes them.

`SKIP=lighthouse,qa-e2e qa/gate.sh` skips steps. A skipped step counts as not passed.

## Checklist

| # | Step (`gate.sh` name) | What it proves | Pass rule | AC |
|---|---|---|---|---|
| 1 | `deps` | `npm ci` equivalent, without touching `node_modules`: `npm ls --all` is clean, `package-lock.json` is unchanged, and the qa tree is complete | exit 0 | – |
| 2 | `typecheck` | `tsc --noEmit` for shared, worker, web and the SW. `en: typeof zh` plus typed `t()` keys make a missing i18n key a type error | 0 errors | 8 |
| 3 | `unit` | vitest for shared, web and worker. Worker tests run in workerd: token renewal and 401 retry, validation, caching keys, log redaction, fixture mode, rate limit | all pass | 15–18, 20, 21, 29, 30, 32 |
| 4 | `i18n` | zh/en key parity and no empty strings (`present.test.ts`, "AC 8") | pass | 8 |
| 5 | `build` | Production build A and B. **M5 AC 3 budgets** (gzip, `src/web/scripts/budget.mjs`): JS that `index.html` loads for Home ≤ 100 KB; all app JS excl. MapLibre and the viewer ≤ 250 KB; family viewer ≤ 60 KB; app CSS (inlined) ≤ 30 KB; MapLibre a separate chunk never referenced by `index.html`. An overrun prints the chunk names and sizes | budget held | 46; M5 3 |
| 6 | `static-pwa` | Manifest: name `怎么去?`, short_name, `start_url` `/`, `scope` `/`, `display: standalone`, colours, 192/512/maskable icons present in dist, only allow-listed keys. SW: placeholders replaced, precache files exist, exactly one shell JS, no MapLibre precached, only `install/activate/fetch/message` listeners, no push/sync/periodicSync/backgroundFetch/showNotification. App APIs are listed against an allow-list (getUserMedia, push, bluetooth fail) | no FAIL lines | 1, 2 |
| 6b | `platform-api` | **M2 AC 37 (D-4).** `scripts/platform-grep.mjs` fails on `navigator.geolocation`, `speechSynthesis`, `navigator.wakeLock`, `navigator.vibrate` or `Notification` in `src/web/src` or `src/shared/src` outside `src/web/src/platform/` (comments stripped), and checks the six haptic names `tick, confirm, attention, getoff, arrive, gentle` | 0 findings | M2 37 |
| 7 | `secrets` | Scans `src/` (excl. node_modules) and `dist/` for JWTs, private keys, AWS/Google keys, Bearer literals, credential assignments with real-looking values, and e-mails outside `example.com` / `howtogo.local`. Also checks `wrangler.toml` has no credentials in `[vars]` (placeholders only) and that no `.dev.vars` / `.env` is tracked. Reviewed test dummies are allow-listed in the script. The `TOKEN_KV` namespace id in `wrangler.toml` is allow-listed by exact value (Director: a KV id is not a secret); any other real-looking id still fails | 0 findings | 14 |
| 8 | `dev-e2e` | Developer suite `src/web/e2e` (52 tests, incl. 36 screenshot baselines) against the **release build served by `vite preview` on :4183** (`QA_DEV_PORT`; 4173 is left to other worktrees on this host) (release-artifact smoke) | all pass | 5–7, 9, 10, 22–28, 35, 36 |
| 9 | `qa-e2e` | QA suite `qa/tests` (preview on :4184, `QA_PORT`; plus the real Worker under `wrangler dev --local --env test` on 127.0.0.1:18797, `QA_WORKER_PORT`, serving the same build, share TTL 40 s, `QA_SHARE_TTL_S`): `m3.spec.ts` (M3 transit smarts, one test per AC — demo mode with the AC 39 scenarios `?scn=bus:…,alerts:…,lifts:…`, live mode with `/api` answered by Playwright for 502/no-fare/request budget, Playwright clock for polling, missed bus, in-trip disruption and recovery; parity matrix zh/en, recents, upgrade, axe on H1 banner/H3/H4/H5/LTA and offer sheets), `m4.spec.ts` (M4 share & safety — senior UI in demo mode with recorded `window.open`/Web Share; **two-browser** live tests app → Worker → family page `/t/:id` incl. paused/help/arrived/ended/expired/not-found, socket-blocked polling, headers/OG/CSP, D-7 help bypass, caregiver setup box round trip; Help/H10/taxi/contacts/delete-all; axe on H7/H8/H9/H10/`/setup`), `m2.spec.ts` (M2 guided trip, one test per AC — demo platform + shared simulator, recording stubs for speech/vibrate/wake lock/Notification/visibility, Playwright clock for the 20 s / 45 s / 10 min / ETA + 2 h rules, entry-point matrix, axe + 200 % on H5/H6/H6b/G1/H11/G2/G3/H12/H9/H10), `ac.spec.ts` (one test per AC), `pwa.spec.ts` (manifest, Chrome installability verdict, offline cold start, two-build SW update) and `matrix.spec.ts` (every screen and sheet × zh/en × light/dark × 100/150/200 % × 390/720/1440: layout, 56 px + 8 px gap, labels + testids, axe WCAG 2.1 AA, attribution) | all pass | 1–13, 19–28, 31, 33–44, 47; M3 + M4 (see `qa/reports/0.3.0-m34.md`) |
| 10 | `lighthouse` | Lighthouse 12 mobile (simulated slow 4G, 4× CPU) on `/`, `/about`, `/settings`, `/t/<id>` (release build; `LH_PATHS` overrides; `/privacy` and `/route` join in the M5 UI round). Medians of 3. HTML and JSON reports go to `qa/.out/lighthouse/` | **M5 AC 1/2:** perf ≥ 90, a11y ≥ 95, best practices ≥ 90, SEO ≥ 90 (not judged on `/t/*`: noindex by design); LCP ≤ 2.5 s and TBT ≤ 200 ms on `/`; CLS ≤ 0.05 everywhere | 45; M5 1, 2 |
| 11 | `artifact` | A deterministic zip of `dist/` with its SHA-256: `qa/reports/howtogo-web-<ver>-dist.zip` + `.sha256`. The zip itself is git-ignored | written | – |

### Substitutions (documented)
- **Lighthouse "PWA installable".** Lighthouse ≥ 12 removed the PWA category, so `pwa.spec.ts` replaces it with:
  - Chrome's own verdict, `Page.getInstallabilityErrors` over CDP, which must be empty;
  - manifest fetch and field checks;
  - SW registration and control;
  - an offline cold start in a new tab, plus an offline deep path.

  Note: current Chrome has relaxed install criteria and reports no error even without icons. Step 6 enforces the icons.
- **"Install prompt shown"** (AC 3) can't be observed headless. It is deferred to the real-device pass.
- **Two-build SW update** (AC 4). A tiny static server inside `pwa.spec.ts` switches its root from dist A to dist B on one origin.
- **150 % × 200 % browser zoom** (AC 9) is emulated as 150 % app text at half the CSS viewport (1440 → 720 × 450). The 390 px phone is checked at 200 % app text (`xxlarge`).
- **Fault states** (error, 429, no route, outside SG) need a fault switch, and the mock API has none. The tests run the app in **live mode** with `/api/*` answered by Playwright, using the shared fixtures for good answers.

- **Two-browser share tests** (M4) use the documented test Worker (`wrangler dev --local --env test`, M4 OQ6), started by `qa/playwright.config.ts`. It runs locally in workerd and never talks to Cloudflare (`WRANGLER_SEND_METRICS=false`); state goes to `qa/.out/wrangler-state`. Each test context sends its own RFC 5737 test IP in `CF-Connecting-IP` so the Worker's per-IP limits (10 share creates/h) apply per test.

### Not covered by the gate (manual / deferred)
- Live OneMap and LTA: `npm run smoke:live` needs the owner's credentials, and the Worker is not deployed.
- Real devices: an Android Chrome install (prompt, icon, standalone, Back gesture) and iOS Safari (Add to Home Screen, standalone, safe areas). Also VoiceOver and TalkBack passes on Home → Route detail (deferred to M5 if no device).
- Cloudflare Pages HTTPS and headers (AC 1, first half). This needs the preview deploy.

### Rules
- Never run Playwright with `--update-snapshots` in the gate. Baselines change only in a Developer round, and Creative reviews them.
- A new manifest key, SW event or permission-bearing API needs Director approval plus an allow-list edit in `scripts/static-pwa.mjs`.
- A new secret-scan allow-list entry needs QA review (the comment in `scripts/secret-scan.mjs`).
