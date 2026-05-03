# 05 Warehouse — Wave Next-3 Hardening Report

Date: 2026-05-03
Repo: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
Scope: docs/meta/prototype-label/task readiness only; no product app implementation.

## Applied decisions

Source: `_meta/decisions/2026-05-03-next-modules-warehouse-scanner-planning-production-decisions.md`.

| Decision | Applied outcome |
|---|---|
| WH-008 destination required | PRD and task language now state destination is required for every split output row. T-017/T-048/T-055 assert required destination validation. |
| WH-109 Shelf Life Rules CRUD Phase 1 | PRD §12.5 and §16.6 now treat WH-109 as P1 CRUD/read contract. UX WH-109 added. Prototype labels `shelf_life_rules_admin_page` and `shelf_life_rule_edit_modal` added/planned. T-052/T-056 cover UI and contracts. |
| M-12 canonical label | PRD §12.6/§16.6 now maps M-12 to `use_by_override_modal`. Prototype index marks it canonical. JSX has a literal marker. |
| WH-015 / WH-017 first-class labels | Prototype indexes include `available_lp_picker` and `wo_reservations_panel`; tasks require first-class production markers and surfaces. |
| data-prototype-label markers | Added literal markers to touched prototype JSX for `lp_list_page available_lp_picker`, `reservations_list_page wo_reservations_panel`, `grn_from_po_wizard`, `lp_split_modal`, and `use_by_override_modal`. Index has marker policy for new labels. |

## Files hardened

- `05-WAREHOUSE-PRD.md`
- `design/05-WAREHOUSE-UX.md`
- `design/Monopilot Design System/warehouse/lp-screens.jsx`
- `design/Monopilot Design System/warehouse/movement-screens.jsx`
- `design/Monopilot Design System/warehouse/modals.jsx`
- `_meta/prototype-labels/prototype-index-warehouse.json`
- `_meta/prototype-labels/master-index.json`
- `_meta/atomic-tasks/05-warehouse/manifest.json`
- `_meta/atomic-tasks/05-warehouse/coverage.md`
- `_meta/atomic-tasks/05-warehouse/tasks/T-001.json`..`T-057.json`

## Atomic-task hardening

Before this pass, Warehouse had 47 backend/schema/API tasks and structural manifest/coverage only.

After this pass:
- 57 tasks total.
- Added T3 UI/prototype parity tasks:
  - T-048 LP core UI
  - T-049 GRN UI
  - T-050 stock movements/adjustment UI
  - T-051 FEFO/reservations picker + WO panel UI
  - T-052 expiry + Shelf Life Rules UI
  - T-053 dashboard/inventory/locations/settings UI
  - T-054 labels + genealogy UI
- Added T4 readiness/test tasks:
  - T-055 Warehouse E2E critical path tests
  - T-056 cross-module contract tests
  - T-057 readiness/prototype-label guard
- Existing tasks now carry `pipeline_inputs.cross_module_dependencies` metadata.
- T-017 now explicitly blocks missing destination on split output rows.
- T-008/T-052/T-056 cover WH-109 Phase 1 CRUD/read contract.
- T-037/T-052 cover canonical M-12 `use_by_override_modal`.

## Coverage/readiness status

`_meta/atomic-tasks/05-warehouse/coverage.md` is now a full PRD/UX/prototype/task coverage table rather than a placeholder. It maps:
- PRD §5-§16 areas;
- UX WH-001..WH-020 + WH-109;
- modal surfaces M-05..M-15;
- prototype labels;
- task IDs T-001..T-057;
- accepted P2/P3 non-blockers.

Readiness estimate after hardening: 95%+ for docs/meta/task/prototype-label readiness before ACP import. This is not a claim that app implementation exists.

## Validation

Commands run:

```bash
cd /Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/05-warehouse
python3 _validate.py

cd /Users/mariuszkrawczyk/Projects/monopilot-kira
python3 - <<'PY'
import json, pathlib
root=pathlib.Path('/Users/mariuszkrawczyk/Projects/monopilot-kira')
for path in ['_meta/prototype-labels/prototype-index-warehouse.json','_meta/prototype-labels/master-index.json','_meta/atomic-tasks/05-warehouse/manifest.json']:
    json.loads((root/path).read_text())
PY
git diff --check
```

Results:
- Warehouse validator: PASS — `PASS: 57 tasks, manifest + coverage.md OK`.
- Prototype/master JSON parsing: PASS.
- `git diff --check`: PASS.

## Remaining questions

No Wave Next-3 blocking Warehouse readiness questions remain after the user decisions. PRD OQ1-OQ8 remain implementation/P2 design questions and are not blockers for readiness/import planning.
