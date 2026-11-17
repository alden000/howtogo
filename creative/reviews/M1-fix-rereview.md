# Creative re-review — M1 batched fix round (wt-m1ui, read-only)

**Verdict: APPROVED WITH FIXES** (1 Medium, 2 Low remaining). Fixes #1–#22 are verified in the code and in the baselines (H1 light, dark and 200 %; H2 results-200 and empty; H3 two-100 and 200; H4 mrt; F6 settings dark and 200 %; F1 lang; F4 offline). No regressions apart from the items below.

## Verified
- #1 / logo B: `SealSvg` is the favicon geometry (#9A3412 rx96, #FBF5EC w64 strokes, #FFD23F dot, `seal-dot` pulse). public/favicon.svg, favicon-32, apple-touch-icon, icon-192/512 and maskable-192/512 are byte-identical to creative/logo/final. The manifest lists any and maskable at 192 and 512, and index.html links them. In dark mode the seal sits well: there is no light tile.
- #2 live note hidden. #3: the 200 % bar fits one row. #4: titles are ink. #5: H2 empty uses the §6b panel, left-aligned. #6: the From icon sits beside its text at 200 %. #8: row tiles are hidden at 200 %. #9: the search button is 2 lines, not 3. #11–13 are fixed. The MRT direction shows only when a headsign exists, which is an honest fallback, and the fixture has none. #14 has curly quotes. #15–22 are in app.css.

## Rulings on the deviations
- **#7 (`.tx:has(+ .val)` scoping): ACCEPTED.** Scoping to rows that show a value is right, and the long value-less label must wrap. But it exposes a new problem (R1).
- **#10 (ghost copy in a closed shadow root): ACCEPTED.** It is inert, aria-hidden, keeps the router instant and gives tests no duplicate testids. That is better than my rule. One fidelity gap remains (R2).

## Remaining
| # | Sev | Where | Issue | Exact fix |
|---|---|---|---|---|
| R1 | Med | F6 rows at 150/200 % · app.css `.row .val` | The value is squeezed into a ~80px column and `overflow-wrap:anywhere` breaks it mid-word: "Toa / Payoh / Centr / al" (M1-F6-settings-light-200-zh). | Add: `:root[data-text-size="xlarge"] .row:has(.val),:root[data-text-size="xxlarge"] .row:has(.val){flex-wrap:wrap}` `:root[data-text-size="xlarge"] .row .tx:has(+ .val),:root[data-text-size="xxlarge"] .row .tx:has(+ .val){flex:1 1 auto;max-width:none}` `:root[data-text-size="xlarge"] .row .val,:root[data-text-size="xxlarge"] .row .val{order:3;flex:1 0 100%;text-align:left;overflow-wrap:normal;padding-left:38px}`. The value then goes on its own line under the label, and the chevron stays on row 1. Re-record F6-settings-200. |
| R2 | Low | Exit ghost · `ui/ghost.ts` | Inside a shadow root, `:root[...] X` rules never match. During the 280ms exit, the ghost loses the 150/200 % rules (wordmark text, magnifier and row tiles come back, so the frame jumps), the dark `.btn-primary` shadow, and the `.rm` rules. Tokens still inherit, so the colours are fine. | In `styles()`, use `css.join('\n').replace(/:root\b/g,'.groot')`. In `ghost()`, wrap the copy: `const w=document.createElement('div'); w.className='groot '+document.documentElement.className; for (const a of ['data-theme','data-text-size']) { const v=document.documentElement.getAttribute(a); if (v) w.setAttribute(a,v); } w.appendChild(copy); root.appendChild(w);` |
| R3 | Low | Copy · `i18n/ui.ts not_set` | "没有设" reads as clipped. | zh `not_set: "还没设置"` |

Not re-checked: exit motion on a real device (owed with real-device QA). Still worth doing: unstub fonts for one 100 % zh baseline per frame.
