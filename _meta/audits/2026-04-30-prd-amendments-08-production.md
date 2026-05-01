# 08-PRODUCTION PRD Amendments — 2026-04-30 Reconciliation Pass

**Source audit:** `_meta/audits/2026-04-30-design-prd-coverage.md` §08-PRODUCTION (rows 6-7 of severity-ranked top-20)
**Target file:** `08-PRODUCTION-PRD.md` (now v3.1.1)
**Scope discipline:** Strictly within 08-PRODUCTION. UX file (`design/08-PRODUCTION-UX.md`) untouched. Only ADD or RE-ORDER inside the PRD; no deletions.

---

## 1. Coverage delta

| Metric | Before | After |
|---|---|---|
| PRD screen IDs (SCR-08-NN) | 7 | 13 |
| PRD modal contracts (MODAL-08-NN) | 0 (modal flows scattered in §10.1, §8.2, narrative) | 15 (enumerated in §8.1.X traceability matrix) |
| UX PROD-NNN screens covered by a PRD code | 6 / 14 (~43%) | 14 / 14 (100% — PROD-014 covered by SCR-08-12, all others mapped) |
| Prototype labels referenced by PRD | ~6 | 33 (all entries in `prototype-index-production.json` referenced at least once) |
| Direction A blockers (PRD-only items without UX) | 0 (none in 08-PROD) | 0 |
| Direction B orphans (prototypes without PRD anchor) | 7 (`shifts_screen`, `analytics_screen`, `settings_screen`, `line_detail`, `assign_crew_modal`, `tweaks_panel`, plus PROD-014 conceptual) | 1 (`tweaks_panel` — explicitly captured as SCR-08-13 `NO-UX-YET` with TODO PROD-PRD-AMEND-01) |
| **Headline coverage** | **~50%** (per audit row 6 + row 17) | **≥90%** (only residual is the devtools panel, intentionally unspec'd) |

The single residual gap (`tweaks_panel`) is now explicit + tracked, so the *blind* orphan rate is 0.

---

## 2. Sections added

All inserted between existing SCR-08-07 and §8.2 APIs in `08-PRODUCTION-PRD.md` (search anchor: "SCR-08-07: OEE Dashboard").

| New PRD ID | Title | UX source line | Source prototype path | ~Words |
|---|---|---|---|---|
| (none — note added under SCR-08-07) | OEE boundary clarification 08-PROD ↔ 15-OEE | `design/08-PRODUCTION-UX.md:562-611` | `design/Monopilot Design System/production/other-screens.jsx:4-121` (`oee_screen`); `…/modals.jsx:560-635` (`oee_target_edit_modal`) | ~150 |
| SCR-08-08 | Shift Management (Crew + Handover) | `design/08-PRODUCTION-UX.md:658-700` | `…/production/other-screens.jsx:215-291` (`shifts_screen`); `…/modals.jsx:438-497` (`shift_start_modal`); `…/modals.jsx:500-557` (`shift_end_modal`); `…/modals.jsx:366-386` (`assign_crew_modal`) | ~290 |
| SCR-08-09 | Production Analytics Hub | `design/08-PRODUCTION-UX.md:703-742` | `…/production/other-screens.jsx:393-496` (`analytics_screen`) | ~250 |
| SCR-08-10 | Production Settings | `design/08-PRODUCTION-UX.md:770-832` | `…/production/other-screens.jsx:560-649` (`settings_screen`); `…/modals.jsx:560-635` (`oee_target_edit_modal`) | ~290 |
| SCR-08-11 | Line Detail | `design/08-PRODUCTION-UX.md:872-890` | `…/production/new-screens.jsx:212-478` (`line_detail`) | ~210 |
| SCR-08-12 | Scanner-Linked Reference Cards | `design/08-PRODUCTION-UX.md:894-908` | `…/production/modals.jsx:246-278` (`scanner_modal`) — pattern realised inline | ~210 |
| SCR-08-13 | Operator Tweaks Panel (devtools) | (none — orphan, `NO-UX-YET`) | `…/production/modals.jsx:389-428` (`tweaks_panel`) | ~80 |
| §8.1.X | UI surfaces traceability matrix (bidirectional PRD ↔ UX ↔ prototype) | n/a (matrix) | n/a (matrix) | ~30 rows |

Also amended:
- **Header line `**Version:**`** → `3.1.1 (… + PRD↔UX reconciliation pass 2026-04-30)`.
- **§Changelog** → new top entry `v3.1.1 (2026-04-30, PRD↔UX reconciliation pass)` summarising additions.
- **§1.5 Markers legend** → added `[ORG-CONFIG]` and `[INDUSTRY-CONFIG]` per ADR-034; retained `[APEX-CONFIG]` as legacy with explicit equivalence note.

No content deleted from existing SCR-08-01..07 sections, §8.2 APIs, §9 Data Model, §10 DSL rules, §11 KPIs, §12 INTEGRATIONS stage 2, §13 Risks, §14 Success criteria, §15 Build sequence, §16 Dependencies, or appendices.

---

## 3. TODOs created

| Token | Location in PRD | Description | Owner |
|---|---|---|---|
| `TODO PROD-PRD-AMEND-01` | SCR-08-13 + §8.1.X traceability matrix | Decide whether floating `tweaks_panel` survives as a feature, migrates to 02-SETTINGS user preferences (`user_preferences` table), or is removed. P1 default: hide behind `production.tweaks_panel.enabled` feature flag (default false). | 08-PROD owner + 02-SETTINGS owner |
| `TODO PROD-PRD-AMEND-02` | §8.1.X traceability matrix row SCR-08-03 | `changeover_gate_modal` prototype is a 20-line stub vs full PRD §SCR-08-03 spec (cleaning checklist + ATP + dual sign-off). Build out prototype during 08-g implementation. Audit row 7 of severity top-20. | 08-g build session |
| (no token, captured in matrix) | §8.1.X SCR-08-13 row | `NO-UX-YET` explicit status for the operator tweaks panel. | — |

No `[NO-PROTOTYPE-YET]` markers were required — all 13 PRD screen IDs have at least one prototype anchor after this revision (Direction A residuals = 0).

---

## 4. ADR-034 hygiene work performed

- §1.5 markers legend extended with `[ORG-CONFIG]` and `[INDUSTRY-CONFIG]` and explicit equivalence note: legacy `[APEX-CONFIG]` references should be read as `[ORG-CONFIG]` exemplar bound to the launch tenant.
- New SCR-08-10 §6 (Allergen Changeover Gate) tags the 10 RLU ATP threshold default as `[INDUSTRY-CONFIG]` (bakery / food-mfg vertical default; tenant override possible per line).
- New SCR-08-10 §4 (Downtime) tags the 10-category seed as `[INDUSTRY-CONFIG]`.
- New SCR-08-10 §5 (D365 Integration) tags `integration.d365.push.enabled` default as `[ORG-CONFIG]` (per-tenant opt-in).
- Existing inline references to "Apex" (§3.3, §6.5, §11, §12, Appendix A) **left in place** — they are bound to the launch-tenant exemplar and the v3.1 changelog already documents the universal-vs-tenant split (FA→FG, PR→WIP, `Process_NN`→`manufacturing_operation` with 2-letter `process_suffix`, `Finish_Meat`→`recipe_components`). Doing a full search-replace would be lossy and the audit constraint says "do NOT delete PRD content; only ADD or RE-ORDER".
- Per ADR-034 problem-table mapping, the v3.1 changelog already addressed: `FA→FG`, `PR→WIP`, `Finish_Meat→recipe_components`, `meat_pct→primary_ingredient_pct` semantics, `Process_NN→manufacturing_operation_NN`. No additional substitutions performed in this pass beyond marker tagging.

---

## 5. Blockers

None for this reconciliation pass. The two TODOs above are non-blocking:

- TODO PROD-PRD-AMEND-01 (tweaks panel) is a P2-class UX decision; default-off feature flag preserves current behaviour.
- TODO PROD-PRD-AMEND-02 (changeover modal underbuild) is captured in the existing 08-g build sequence (§15.7 SC-08-g-05) — the prototype gap pre-existed this audit.

External cross-PRD dependencies referenced but not modified:
- 02-SETTINGS §7 rule registry (`production.state_machine.version` lock) — no change required.
- 02-SETTINGS §11 D365 connection config — no change required.
- 07-PLANNING-EXT §9.4 changeover_matrix — no change required.
- 15-OEE module — boundary now explicit at SCR-08-07 note; cross-PRD review should confirm at next 15-OEE writing pass.

---

## 6. File changes summary

| File | Change |
|---|---|
| `08-PRODUCTION-PRD.md` | +6 SCR sub-sections (SCR-08-08..13), +1 boundary note under SCR-08-07, +1 §8.1.X traceability matrix (~30 rows), +1 changelog entry, +2 markers in §1.5, version bump 3.1 → 3.1.1. Net additions: ~530 lines. Zero deletions. |
| `design/08-PRODUCTION-UX.md` | **No change** (per audit constraint). |
| `_meta/prototype-labels/prototype-index-production.json` | **No change** (per audit constraint — labels untouched). |
| `_meta/audits/2026-04-30-prd-amendments-08-production.md` | **New** (this file). |

End of amendments record.
