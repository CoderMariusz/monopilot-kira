# 08-PRODUCTION atomic-task gold-standard upgrade — 2026-05-14

Source PRD: `docs/prd/08-PRODUCTION-PRD.md` v3.1.1
Prototype index: `_meta/prototype-labels/prototype-index-production.json`
Translation notes: `_meta/prototype-labels/translation-notes-production.md`
Parity policy: `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`
Gold-standard exemplars studied: `_meta/atomic-tasks/01-npd/tasks/T-001.json`, `T-052.json`, `T-061.json`; `_meta/atomic-tasks/02-settings/tasks/T-001.json`, `T-041.json`.

## Counts

- Tasks on disk: **55** (T-001..T-055). Manifest task_count: **55** (unchanged).
- Tasks re-authored to gold standard in this pass: **16** — T-001, T-041, T-042, T-043, T-044, T-045, T-046, T-047, T-048, T-049, T-050, T-051, T-052, T-053, T-054, T-055.
- Tasks already at gold standard prior to this pass: **39** — T-002..T-040 (confirmed by spot survey across schema/migrations, runtime APIs, rule registry, seeds, shift actions).
- T3-ui tasks with `prototype_match: true` + `prototype_index_entry` + `ui_evidence_policy`: **6** — T-046, T-047, T-048, T-049, T-050, T-051.
- T4-e2e tasks with `ui_evidence_policy` attached: **4** — T-052, T-053, T-054, T-055.

## Validation

`python3 _meta/atomic-tasks/08-production/_validate.py` → **PASS: 55 tasks validated** (atomicity gate ≤4 AC, kira_dev pipeline, RED→GREEN→REVIEW→CLOSEOUT checkpoint policy, T3-ui parity-anchor presence, no forbidden top-level keys, no placeholder strings, dependencies in `T-XXX` form, priority within [50..150]).

## Top 3 corrections / red flags resolved

1. **Wave-Next bulk `parent_feature` rolled up everything to "08-PRODUCTION full module readiness".** Re-mapped T-001 + T-041..T-055 to their PRD §7 Epic sub-modules: E1 Execution Core (T-001), E5 INTEGRATIONS stage 2 (T-041, T-042, T-051), E6 Dashboard+OEE (T-044, T-045, T-046), E7 Allergen Gate (T-043, T-048), E2/E3 Consumption+Output+Genealogy (T-047), E3/E4/E6 Waste+Downtime+OEE (T-049), E4/E6 Shifts+LineDetail+Settings (T-050). T4-e2e closeouts now bucket under "08-PROD end-to-end evidence", "scanner contract evidence", "exception evidence", "operations closeout evidence".

2. **UI tasks (T-046..T-051) were missing required parity-policy fields.** Added `prototype_match: true`, `prototype_index_entry` (comma-joined labels straight from `prototype-index-production.json`), `ui_evidence_policy` pointing at `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`, `frontend-design` skill, and `screenshots_or_artifacts` + `playwright_traces_or_artifacts` closeout requirements. Prototype `file:lines` anchors are now in the prompt header (Prototype: …) for each UI task and reference only canonical `prototypes/design/Monopilot Design System/production/*.jsx` (legacy `prototypes/production/*.jsx` not used).

3. **Several Wave-Next prompts elided production red-lines.** Re-introduced explicit per-task contracts: T-001 (D365 sync/Built never admits factory use, no Production-owned release enum, no newer BOM/spec selection); T-041 (D365 delivery state must not mutate `wo_executions`/release/`active_bom_header_id`/`active_factory_spec_id`; no synchronous inline D365 calls); T-043 (`segregation_required` hard-block unbypassable, server-side PIN verification, snapshot preserved after gate clears); T-045 (no Production-owned D365 secrets, BL-PROD-04 `prod_oee_targets` windowing); T-048 (segregation hard-block surfaced as disabled UI Alert, photo-required step block, PIN never in DOM); T-051 (DLQ rows never deleted, raw D365 credentials never displayed).

## Dependency edges computed (for the 16 re-authored tasks)

- T-001 → no deps; parallel_safe_with T-002..T-010.
- T-041 → T-009, T-010, T-019; parallel_safe_with T-042..T-045.
- T-042 → T-010, T-041; parallel_safe_with T-043..T-045.
- T-043 → T-001, T-006, T-007, T-014, T-016; parallel_safe_with T-041, T-042, T-044, T-045.
- T-044 → T-003, T-004, T-005, T-008, T-038; parallel_safe_with T-041..T-045 (excluding self).
- T-045 → T-012, T-013, T-014, T-035; parallel_safe_with T-041..T-044.
- T-046 → T-001, T-016, T-021, T-044; parallel_safe_with T-047..T-051.
- T-047 → T-023, T-027, T-028, T-029, T-030, T-031, T-032, T-033, T-046; parallel_safe_with T-048..T-051.
- T-048 → T-043, T-046; parallel_safe_with T-047, T-049..T-051.
- T-049 → T-036, T-037, T-044, T-045; parallel_safe_with T-046..T-048, T-050, T-051.
- T-050 → T-039, T-040, T-044, T-045, T-046; parallel_safe_with T-047..T-049, T-051.
- T-051 → T-042; parallel_safe_with T-046..T-050.
- T-052 → T-016, T-019, T-023, T-028, T-041, T-046, T-047; parallel_safe_with T-053..T-055.
- T-053 → T-023, T-028, T-030, T-047; parallel_safe_with T-052, T-054, T-055.
- T-054 → T-001, T-024, T-034, T-043, T-046, T-048; parallel_safe_with T-052, T-053, T-055.
- T-055 → T-036, T-040, T-042, T-044, T-049, T-050, T-051; parallel_safe_with T-052..T-054.

Cross-module `cross_module_dependencies` retained / re-asserted for: 01-NPD T-097 (canonical release read model), 03-TECHNICAL T-080/T-081 (factory_spec+BOM approval, adapter), 04-PLANNING-BASIC T-001 (WO snapshot), 02-SETTINGS T-020/T-122/T-126/T-127 (machine/line registry, settings/seed contract, RBAC helpers, D365 connection), 06-SCANNER-P1 external scanner contract, 05-WAREHOUSE external warehouse contract, 09-QUALITY external quality contract, 07-PLANNING-EXT external changeover_matrix.

## Production-module red lines preserved across the pass

- WO is materialized from Planning snapshot with canonical `active_bom_header_id` + `active_factory_spec_id`; never auto-selects newer BOM/spec at START.
- Consumption / output via 05-WAREHOUSE LP API; genealogy writes mandatory; FEFO deviation flagged.
- Status transitions append-only via `wo_events` and outbox events.
- Weight-mode (fixed / catch) decisions flow into output rows; tolerance enforced soft P1.
- Lot / expiry / SSCC traceability mandatory (`batch_number` unique per tenant+year V-PROD-24).
- D365 push is async outbox + DLQ side-effect only; never source-of-truth for release or runtime admission.
- Allergen gate `segregation_required` is unbypassable in Production.
- BRCGS Issue 10 digital signatures (PIN + server hash verification) required on allergen sign-off, shift sign-off, override paths; 7-year retention.

## Files changed

- `_meta/atomic-tasks/08-production/tasks/T-001.json`
- `_meta/atomic-tasks/08-production/tasks/T-041.json`
- `_meta/atomic-tasks/08-production/tasks/T-042.json`
- `_meta/atomic-tasks/08-production/tasks/T-043.json`
- `_meta/atomic-tasks/08-production/tasks/T-044.json`
- `_meta/atomic-tasks/08-production/tasks/T-045.json`
- `_meta/atomic-tasks/08-production/tasks/T-046.json`
- `_meta/atomic-tasks/08-production/tasks/T-047.json`
- `_meta/atomic-tasks/08-production/tasks/T-048.json`
- `_meta/atomic-tasks/08-production/tasks/T-049.json`
- `_meta/atomic-tasks/08-production/tasks/T-050.json`
- `_meta/atomic-tasks/08-production/tasks/T-051.json`
- `_meta/atomic-tasks/08-production/tasks/T-052.json`
- `_meta/atomic-tasks/08-production/tasks/T-053.json`
- `_meta/atomic-tasks/08-production/tasks/T-054.json`
- `_meta/atomic-tasks/08-production/tasks/T-055.json`
- `_meta/atomic-tasks/08-production/coverage.md` (appended `## Coverage rows (gold-standard re-author 2026-05-14)` section)

`manifest.json` unchanged (task_count remains 55).
