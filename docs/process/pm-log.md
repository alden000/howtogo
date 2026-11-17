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
