# PM log

## 2026-11-17 — Kickoff research, roadmap, M1 draft
- Wrote `docs/01-research-and-plan.md`: market scan, technical approach, elderly UX principles, tiered feature list (18 Must / 8 Should / Later), compliance, and 8 owner questions with defaults.
- Wrote `docs/requirements/ROADMAP.md`: M0 creative (~3 h) → M1 Foundation 6–8 h → M2 Guided trip 7–8 h → M3 SG transit smarts 6–7 h → M4 Share & safety 6–7 h → M5 1.0 hardening 5–6 h. Total about 36–42 h.
- Wrote `docs/requirements/M1-foundation.md`: 47 ACs (Must/Should), Playwright testability, gate scope, OQ1–OQ7, frames H1–H9.
- Unverified (flagged with ⚠ in the docs):
  - OneMap routing parameter names and a possible `fare` field;
  - BusArrival v3 load/WAB fields;
  - the exact FacilitiesMaintenance path;
  - wake lock in installed iOS PWAs;
  - the Grab deep link.

  The Developer verifies each against the live API in M1/M3.
- Key risk raised: a PWA cannot guide with the screen off. The design relies on Wake Lock and a pocket view (owner Q7).

## 2026-11-17 — M2 Guided trip requirements
- Wrote `docs/requirements/M2-guided-trip.md`: 50 ACs (A entry-point parity, B live screen, C follow-me, D auto-advance, E voice, F get-off alerts, G off-route/weak GPS/offline, H platform/wake lock/pocket/battery, I multi-stop, J end/resume/arrival, K hooks), testability with the shared simulator + mocked geolocation, an owner real-phone script (~45 min), gate scope, OQ1–OQ10, missing frames.
- Estimate 8–10 h straight through (ROADMAP said 7–8 h; +1.5 h for multi-stop moved in from M3, needs Director ruling OQ1).
- Found: shell `VibratePattern` names differ from STYLE-GUIDE §3 haptics (AC 37). No M1 QA report yet, so lessons come from round logs.
- Missing Creative frames: H6b Get off now, pocket view, waypoint + multi-stop builder, resume/voice-unlock bar, manual mode, re-route failed, no-voice note.
