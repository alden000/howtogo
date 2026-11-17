# Director log

## 2026-11-17 — Kickoff
- Project: 怎么去? — elderly-friendly SG public-transport routing PWA. Repo `alden000/howtogo`, branch `claude/elderly-routing-pwa-app-hdhvge`.
- Spike done (see docs/00-brief.md): OneMap routing & reverse geocode need a token (3-day expiry) → server-side Worker required. Tiles + search public. LTA DataMall needs key.
- Ruling D-1: Architecture = static PWA + Cloudflare Worker (secrets, token renewal, caching) + Durable Object for live trip sharing. Pending user confirmation.
- Ruling D-2: Run kickoff research/plan (PM) and creative run (Creative) in parallel to save ~2–3 h; both are pre-code and cheap to revise. User signs off both before any production code.

## 2026-11-17 — Owner authorises parallel development
- Owner: "Develop this project in parallel using agents." Logged as authorisation to start code work before the plan/design sign-off, for work that does not depend on the design.
- Ruling D-3: Stack = npm workspaces monorepo. `src/shared` (TS types + pure engine), `src/worker` (Cloudflare Worker + Durable Object, vitest), `src/web` (Vite + Preact + TypeScript PWA, MapLibre GL JS with OneMap raster tiles, Playwright). The UI round starts only after Creative delivers tokens and frames.
- Parallel tracks: Dev-A Worker backend (worktree), Dev-B shared engine (worktree), while PM and Creative finish. Merge order: shared → worker → web.

## 2026-11-17 — Screen-off guidance / APK question
- Owner asked whether a PWA wrapped in an APK can guide with the screen off. Answer: a TWA (Bubblewrap) cannot (it is Chrome; geolocation stops when hidden). A Capacitor shell can (location foreground service, native TTS, lock-screen alerts).
- Ruling D-4: The web UI must put location, speech, wake-lock, vibration and notifications behind one `platform` adapter interface (web implementation now; Capacitor implementation later). Recommended an optional "Android app" milestone after M2 — awaiting the owner's yes.
- 2026-11-17 Ruling D-5: Owner said yes → M6 Android app (Capacitor) added to ROADMAP, 6–8 h, can start after M2 in parallel with M3–M5.
