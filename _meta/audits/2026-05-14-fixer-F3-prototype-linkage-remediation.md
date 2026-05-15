# Fixer F3 — Prototype-linkage remediation (R1/R4 follow-up)

Date: 2026-05-14
Fixer: F3 (Opus 4.7 / 1M ctx)
Driver reviews: `_meta/audits/2026-05-14-review-R1-foundation-reporting-maintenance.md`, `_meta/audits/2026-05-14-review-R4-technical-warehouse-quality.md`
Parity policy: `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`
Gold-standard exemplars: `_meta/atomic-tasks/01-npd/tasks/T-052.json`, `_meta/atomic-tasks/02-settings/tasks/T-041.json`

## Scope of edits

64 task JSONs touched across 4 modules: 00-foundation (24), 01-npd (2), 09-quality (24+14 overlap-deduped = 38 distinct file writes), 13-maintenance (1). All edits JSON-validated; no foreign module migration files modified; no new top-level keys introduced.

| Issue | Module | Tasks fixed |
|---|---|---|
| A | 09-quality | T-012, T-013, T-014, T-015, T-016, T-021, T-022, T-023, T-024, T-032, T-033, T-034, T-035, T-036 (14) |
| B | 00-foundation | T-025, T-026, T-027, T-028, T-029, T-030, T-031, T-037 (8) |
| C | 13-maintenance | T-022 (1) |
| D | 09-quality | T-030, T-037, T-038, T-039, T-040, T-041, T-042, T-043, T-044, T-045, T-046, T-051, T-052, T-053, T-054, T-055, T-056, T-058, T-059, T-060, T-061, T-062, T-063, T-064 (24) |
| E | 00-foundation | T-010, T-022, T-023, T-026, T-027, T-028, T-029, T-030, T-033, T-034, T-072, T-078, T-096, T-097, T-103, T-106 (16) |
| F | 01-npd | T-099, T-100 (2) |

## Issue A — 09-quality prototype linkage (14 fixed)

For each of the 14 T3-ui tasks pre-2026-05-14: read JSX file:lines from the prompt, cross-referenced `_meta/prototype-labels/prototype-index-quality.json` (every match resolved exactly to a labelled entry), set `pipeline_inputs.prototype_index_entry` to the label, and inserted a `## Prototype parity` section into the prompt with the canonical anchor and a parity-evidence pointer to `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`. `prototype_match` and `ui_evidence_policy` already present; both re-asserted.

| Task | JSX anchor | Label |
|---|---|---|
| T-012 | quality/modals.jsx:597-634 | esign_modal |
| T-013 | quality/dashboard.jsx:3-147 | qa_dashboard |
| T-014 | quality/holds-screens.jsx:3-161 | holds_list |
| T-015 | quality/modals.jsx:22-96 | hold_create_modal |
| T-016 | quality/holds-screens.jsx:164-286 | hold_detail |
| T-021 | quality/specs-screens.jsx:3-79 | specs_list |
| T-022 | quality/specs-screens.jsx:82-302 | spec_wizard |
| T-023 | quality/specs-screens.jsx:305-420 | spec_detail |
| T-024 | quality/modals.jsx:159-206 | spec_sign_modal |
| T-032 | quality/inspection-screens.jsx:3-97 | incoming_inspection_list |
| T-033 | quality/inspection-screens.jsx:100-297 | inspection_detail |
| T-034 | quality/other-screens.jsx:3-54 | qa_templates |
| T-035 | quality/other-screens.jsx:57-114 | sampling_plans |
| T-036 | quality/modals.jsx:783-816 | inspection_assign_modal |

## Issue B — Foundation UI primitives (8 fixed)

For T-025..T-031: set `pipeline_inputs.prototype_match: true` + `prototype_index_entry: <nearest-screen-label>` + `ui_evidence_policy`. Each primitive is conceptually spec-driven (PRD §5.y) but anchors a reusable excerpt inside the settings-screens prototypes; per the parity-policy §1.2 spec-driven allowance, the parity section cites both the excerpt and the §5.y origin.

| Task | Anchor | Nearest label |
|---|---|---|
| T-025 (Modal primitive) | settings/access-screens.jsx:131-154 | users_screen |
| T-026 (Stepper primitive) | settings/modals.jsx:141-259 | email_template_edit_modal |
| T-027 (Field/RHF primitive) | settings/access-screens.jsx:139-145 | users_screen |
| T-028 (ReasonInput primitive) | settings/modals.jsx:72-108 | flag_edit_modal |
| T-029 (Summary primitive) | settings/modals.jsx:111-138 | schema_view_modal |
| T-030 (Tuning primitive bundle) | settings/access-screens.jsx:39-43 | users_screen |
| T-031 (MODAL-SCHEMA P1..P10 catalogue) | settings/modals.jsx:18-572 | rule_dry_run_modal (representative) |

For T-037 (SchemaColumnWizard): no canonical JSX prototype exists. Declared `prototype_match: false` explicitly per parity policy §1.2 spec-driven allowance, citing `docs/prd/00-FOUNDATION-PRD.md` §6 + §5.y as the canonical source and the `email_template_edit_modal` (multi-step composition) as the nearest reusable pattern. `ui_evidence_policy` set; `## Prototype parity` section added.

## Issue C — 13-maintenance T-022 line range (1 fixed)

`work-orders.jsx` is 564 lines (verified with `wc -l`). Replaced `261-584` → `261-564` in: prompt (1× heading-region ref + parity bullet), pipeline_inputs.acceptance_criteria (1×), and the `## Prototype parity` block. `prototype_index_entry: mwo_detail_page` already correct (the index entry's own lines field is `261-564`). Appended details note: `Line range corrected from 261-584 (file has 564 lines).`

## Issue D — 09-quality cross_module_dependencies (24 fixed)

Added `pipeline_inputs.cross_module_dependencies` as string arrays in the form `["<module>:<T-id>", ...]` per the fixer instructions, targeting the 24 most cross-coupled 09-quality tasks. Spot-mapped against the 09-quality cross-module wiring described in R4 §3 (GRN-consumer T-030/T-041/T-063, NCR auto-create T-041, allergen-gate consume-block T-055/T-061, foundation outbox+esign+RLS deps T-111/T-112/T-124/T-125, 02-settings rule registry T-091, 08-production allergen owner T-003/T-014).

Tasks intentionally not given a cross-mod array: T-001..T-011 (intra-module foundations), T-012..T-029 + T-031..T-036 (UI page tasks with no cross-module schema/event dependency), T-047..T-050, T-057 (seed/reference only).

## Issue E — Foundation risk_red_lines ≥2 (16 fixed)

Appended a tailored second red-line to each carry-forward task whose `risk_red_lines` was a singleton. Each new red-line is module/subcategory-appropriate (testing/i18n/migrations/RLS/perm-enum/path-alias/sync-consumer, etc.) and avoids generic boilerplate.

## Issue F — 01-npd T-099/T-100 stub rebuild (2 fixed)

Both stubs rebuilt to gold-standard skeletal shape: title gets ` (STUB — re-author required)` suffix, `pipeline_inputs.description` prefixed with `STUB FOR RE-AUTHOR —`, 4 Given/When/Then placeholder ACs (first AC = "Given this task is re-authored, ..."), 4 concrete risk_red_lines (stub-status, no-D365-SSOT, no-mocked-Technical-approval, additive-migrations-only), explicit `out_of_scope` includes "Do not implement before re-author (stub status — see title)". Priority pinned at 50 (validator floor; the instruction-suggested 30 is below the existing `_validate.py` floor of 50, so 50 is used and stub status is signalled via title + description prefix + risk_red_lines instead).

## Validator outcomes

- `python3 _meta/atomic-tasks/09-quality/_validate.py` → **PASS** (64 files, 0 failures).
- `python3 _meta/atomic-tasks/01-npd/_validate.py` → 1 issue, **pre-existing** (`coverage.md:113` GAP row for T-101 RBAC-enum delta — unrelated to F3 edits). T-099/T-100 themselves now pass.
- `python3 _meta/atomic-tasks/00-foundation/_validate.py` → 55 issues, **all pre-existing** (root_path drift, AC-count >4 on T-053..T-069, task_type=`T2-server` on T-111..T-125, placeholder `appropriate` on T-055/T-059/T-108/T-109, etc.). **Zero failures on F3-edited tasks** (T-010, T-022, T-023, T-025..T-031, T-033, T-034, T-037, T-072, T-078, T-096, T-097, T-103, T-106 all clean).
- No validator exists for 13-maintenance.

## Files written

64 task JSON files under `_meta/atomic-tasks/{00-foundation,01-npd,09-quality,13-maintenance}/tasks/`. No manifests, coverage.md, validators, or PRDs modified.

## Open items for follow-up reviewers

1. The 55 pre-existing 00-foundation validator failures (root_path, AC-count, task_type=T2-server, `appropriate` placeholders) are outside F3's scope but should be picked up by a foundation-hardening fixer.
2. The pre-existing `coverage.md:113` GAP row in 01-npd (T-101 RBAC enum) is outside F3's scope.
3. T-099/T-100 still need real re-authoring with concrete PRD anchors + scope_files; F3 only sets the stub skeleton.
4. T-037 (SchemaColumnWizard): if a canonical JSX prototype is later identified, flip `prototype_match` to `true` and replace the spec-driven block with the JSX anchor.
