# 2026-05-03 — Decision Patch Closeout

Repo: `/tmp/monopilot-kira-current`
Base commit: `cef4b4b403f475f5a6c6ce5d2add26d733f893c9`

## Scope

Applied PO decisions from the 2026-05-03 Hermes session to the first three module docs/tasks:

- 01-NPD
- 02-SETTINGS
- 03-TECHNICAL

No application implementation code was changed.

## Decision document added

Created:

- `_meta/decisions/2026-05-03-flow-d365-settings-technical-decisions.md`

It records:

- Stage-Gate G0-G4 as canonical MVP NPD flow.
- Brief creates project; project creates/maps FG.
- After all department closures + approval, NPD Builder generates WIP + FG + validated BOM/product records.
- D365 is optional integration/export/import, not canonical or superior system.
- Trial/Pilot/Handoff/Packaging are part of NPD, not deprecated.
- Sensory belongs to Technical.
- Settings canonical prototype path is `design/Monopilot Design System/settings/*.jsx`.
- Global Import/Export, Roles & Permissions and Pending Invitations are in Settings scope.
- Supplier specs are Phase 1.
- Lab results are Quality-owned read model for Technical.

## 01-NPD updates

Updated:

- `01-NPD-PRD.md`
- `_meta/atomic-tasks/01-npd/coverage.md`
- `_meta/atomic-tasks/01-npd/tasks/T-044.json`
- `_meta/atomic-tasks/01-npd/tasks/T-047.json`
- `_meta/atomic-tasks/01-npd/tasks/T-071.json`
- `_meta/atomic-tasks/01-npd/tasks/T-076.json`
- `_meta/atomic-tasks/01-npd/tasks/T-079.json`
- `_meta/atomic-tasks/01-npd/tasks/T-087.json`
- `_meta/atomic-tasks/01-npd/tasks/T-092.json`
- `_meta/atomic-tasks/01-npd/tasks/T-093.json`
- `_meta/atomic-tasks/01-npd/tasks/T-094.json`

Key changes:

- Added NPD flow amendment.
- Replaced deprecated legacy-stage language: Trial/Pilot/Handoff/Packaging return to NPD.
- Sensory NPD tasks are now Technical-owned/deferred/cross-module rather than NPD BUILD.
- BOM SSOT / FG rename tasks are blocked by decision/PRD amendment instead of claiming non-existing PRD refs.
- D365 export/build tasks now state D365 is optional integration only.
- V18 high risk built/export blocker was added to D365 build/export-related tasks.

## 02-SETTINGS updates

Updated/created:

- `02-SETTINGS-PRD.md`
- `design/02-SETTINGS-UX.md`
- `_meta/atomic-tasks/02-settings/coverage.md`
- `_meta/atomic-tasks/02-settings/manifest.json`
- `_meta/atomic-tasks/02-settings/tasks/T-020.json`
- `_meta/atomic-tasks/02-settings/tasks/T-026.json`
- `_meta/atomic-tasks/02-settings/tasks/T-041.json` .. `T-046.json`
- `_meta/atomic-tasks/02-settings/tasks/T-059.json`
- `_meta/atomic-tasks/02-settings/tasks/T-084.json`
- `_meta/atomic-tasks/02-settings/tasks/T-085.json`
- `_meta/atomic-tasks/02-settings/tasks/T-096.json` .. `T-102.json`
- `_meta/atomic-tasks/02-settings/tasks/T-117.json`
- `_meta/atomic-tasks/02-settings/tasks/T-118.json`
- `_meta/atomic-tasks/02-settings/tasks/T-119.json` (new Pending Invitations)
- `_meta/atomic-tasks/02-settings/tasks/T-120.json` (new Roles & Permissions)
- `_meta/atomic-tasks/02-settings/tasks/T-121.json` (new Global Import / Export)

Key changes:

- Added Settings PO amendment.
- Manifest task count is now 121.
- Added missing Phase 1 Settings tasks for Pending Invitations, Roles & Permissions and Global Import/Export.
- Onboarding T-041..T-046 now points to proper onboarding flow source/pattern constraints.
- T-096..T-102 no longer misuse adjacent/wrong prototypes as 1:1 source; they are spec-driven where exact prototype is missing, with prototype element reuse where available.
- Fixed easy dependency/reference issues:
  - T-020 D365 backend pre-flight dependency.
  - T-026 wrong rules schema stub reference.
  - T-084 depends on T-097.
  - T-085 depends on T-096.
- T-117/T-118 remain in Settings.

## 03-TECHNICAL updates

Updated/created:

- `03-TECHNICAL-PRD.md`
- `design/03-TECHNICAL-UX.md`
- `_meta/atomic-tasks/03-technical/tasks/T-001.json`
- `_meta/atomic-tasks/03-technical/tasks/T-016.json`
- `_meta/atomic-tasks/03-technical/tasks/T-020.json`
- `_meta/atomic-tasks/03-technical/tasks/T-024.json`
- `_meta/atomic-tasks/03-technical/tasks/T-028.json`
- `_meta/atomic-tasks/03-technical/tasks/T-032.json` .. `T-063.json`
- `_meta/atomic-tasks/03-technical/tasks/T-068.json`
- `_meta/atomic-tasks/03-technical/tasks/T-072.json` (new supplier_specs Phase 1 gap/docs task)

Key changes:

- Added Technical PRD amendment with handoff/ownership/D365/supplier/lab decisions.
- Added UX red-line: prototype legacy names must be translated to PRD v3.2 terms:
  - FA/fa/Factory Article → FG/fg
  - PR-code → WIP/intermediate
  - process_stage/process_code → manufacturing_operation_name
- Added naming red-lines to all 32 Technical T3-ui tasks.
- Fixed task issues:
  - T-001 no brittle “23 columns” AC.
  - T-016 points to T-041 for BOM Generator modal and includes NPD Builder handoff.
  - T-020 lab results are Quality-owned read/bridge; correct T-067 ref.
  - T-024 requires join to items for item_type.
  - T-028 D365 import/export only, authorized overwrite only; correct T-059 ref.
  - T-050/T-058/T-060 clarified partial/spec taxonomy issues.
  - T-055/T-056/T-057/T-059/T-068 D365 language updated to optional integration/no silent canonical overwrite.
- Added T-072 as supplier_specs Phase 1 API/UI upload-view-review brief.

## Verification

Ran validation from repo root:

- Parsed all JSON task files in:
  - `_meta/atomic-tasks/01-npd/tasks` — 94 files
  - `_meta/atomic-tasks/02-settings/tasks` — 121 files
  - `_meta/atomic-tasks/03-technical/tasks` — 72 files
- Checked required ACP/kira_dev task fields.
- Checked manifests for modules that have manifests:
  - 01-npd: manifest task_count 94, disk 94
  - 02-settings: manifest task_count 121, disk 121
- Ran `git diff --check` successfully.

## Remaining open clarifications

1. Final user-facing naming still needs explicit lock: FA vs FG vs Product in UI language.
2. BOM SSOT still needs final architecture lock: NPD Builder vs Technical BOM vs D365 import/export boundaries.
3. Specs taxonomy needs PO confirmation:
   - supplier_spec
   - customer_spec
   - internal_product_spec / factory_spec
4. PO/TO implications still need final modelling:
   - PO should not silently update supplier_spec/cost_per_kg; likely records actuals and triggers review.
   - TO should not change Technical master spec; likely affects inventory/location/lot genealogy/shelf-life remaining.
   - RM usability validation should check approved supplier/material/spec/allergen/QC/cost status before BOM use.

## Important note

The working directory is intentionally not committed. Review with:

```bash
cd /tmp/monopilot-kira-current
git status --short
git diff --stat
git diff --check
```
