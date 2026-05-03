# 06 Scanner P1 — Wave Next-3 Hardening Closeout

Date: 2026-05-03
Repo: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
Scope: docs/meta/prototype-index/task readiness only; no application implementation.

## Decisions applied

- Canonical scanner-prefixed ambiguous labels: `scanner_settings_screen`, `scanner_devices_screen`.
- First-class MVP surfaces: `pin_setup_screen`, `pin_change_screen`, `camera_scanner`.
- First-class user-visible done labels: TO, putaway, move, split, pick, consume, output, co-product, waste, QA done screens.
- UI evidence policy: 390x844 screenshot plus Playwright trace in every UI closeout.
- Cross-module dependency metadata added for Settings, Warehouse, Planning, Production, and Quality contracts.

## Files hardened

- `docs/prd/06-SCANNER-P1-PRD.md`
- `prototypes/design/06-SCANNER-P1-UX.md`
- `_meta/prototype-labels/prototype-index-scanner.json`
- `_meta/prototype-labels/master-index.json`
- `_meta/prototype-labels/translation-notes-scanner.md`
- `_meta/atomic-tasks/06-scanner-p1/manifest.json`
- `_meta/atomic-tasks/06-scanner-p1/coverage.md`
- `_meta/atomic-tasks/06-scanner-p1/tasks/T-001.json`..`T-048.json`

## Prototype/index results

- Scanner prototype index now has 55 unique labels.
- Master index is aligned with all 55 scanner labels.
- Removed scanner-index/master-index mismatch for settings/devices by using scanner-prefixed canonical labels.
- Translation notes no longer state stale 41-component count or that PIN setup/change and camera scanner are missing.

## Task results

- Task count increased from 41 to 48 to cover the missing SC-E5 closeout:
  - `T-042` production scanner output/co-product/waste APIs
  - `T-043` quality scanner pending/inspect APIs
  - `T-044` SCN-082 output UI + `output_done_screen`
  - `T-045` SCN-083 co-product UI + `coproduct_done_screen`
  - `T-046` SCN-084 waste UI + `waste_done_screen`
  - `T-047` SCN-070/071/072/073 QA UI + `qa_done_screen`
  - `T-048` scanner mobile evidence and route-label closeout harness
- Existing tasks were hardened with explicit `cross_module_dependencies` and UI evidence metadata where applicable.
- Coverage file is now a real PRD/UX/prototype/task matrix rather than a structural placeholder.

## Validation

Commands run:

```bash
cd /Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/06-scanner-p1
python3 _validate.py

cd /Users/mariuszkrawczyk/Projects/monopilot-kira
python3 - <<'PY'
import json, pathlib
root=pathlib.Path('/Users/mariuszkrawczyk/Projects/monopilot-kira')
for rel in ['_meta/prototype-labels/prototype-index-scanner.json','_meta/prototype-labels/master-index.json','_meta/atomic-tasks/06-scanner-p1/manifest.json']:
    json.loads((root/rel).read_text())
print('JSON OK')
PY

git diff --check
```

Results:

- Scanner task validator: `Tasks validated: 48/48` and `ALL PASS`.
- JSON parse check: `JSON OK`.
- `git diff --check`: OK.

## Readiness verdict

Scanner P1 docs/meta/prototype/task readiness is now estimated at 95%+ for Wave Next-3 ACP intake. Remaining work is application implementation and eventual optional literal `data-prototype-label` markers if the prototype JSX is rebuilt; those are outside this hardening scope.
