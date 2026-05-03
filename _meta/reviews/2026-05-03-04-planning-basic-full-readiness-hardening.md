# 04 Planning Basic — Full Readiness Hardening Report

Date: 2026-05-03
Scope: full `04-PLANNING-BASIC` docs/meta/prototype/task readiness, including already accepted release read-model consumer contract.

## Verdict

Planning Basic is now at 95%+ docs/meta/prototype/task readiness for ACP handoff.

## What changed

- Expanded coverage from the prior release-contract slice to the full Planning Basic module.
- Replaced stale PRD `[NO-PROTOTYPE-YET]` / `[NO-UX-YET]` P1 blockers with one of:
  - indexed prototype label,
  - composed/inline prototype posture,
  - spec-driven ACP task,
  - explicit non-P1/deferred diagnostic posture.
- Added Planning prototype-index labels for prototype components that already existed but were not indexed:
  - `po_bulk_import_modal`
  - `receive_to_modal`
  - `plan_supplier_list`
  - `plan_supplier_detail`
  - `supplier_form_modal`
  - `deactivate_supplier_modal`
- Mirrored the Planning labels into `_meta/prototype-labels/master-index.json` with `module=planning`.
- Rebuilt `_meta/atomic-tasks/04-planning-basic/coverage.md` as a full-module coverage table.
- Hardened all existing 45 Planning tasks for ACP readiness:
  - removed misleading `parallel_safe_with` metadata;
  - added `cross_module_dependencies` where module contracts are consumed;
  - added UI screenshot/artifact and Playwright trace closeout requirements to T3-ui tasks;
  - patched supplier/material-demand UI tasks with prototype posture.
- Added ACP-shaped T3-ui tasks T-046..T-065 to close missing Planning UI/prototype/spec-driven surfaces:
  - TO list/detail/create/LP picker/ship-receive;
  - WO list/detail/create/cascade/gantt/DAG/reservations/sequencing/settings;
  - PO bulk import;
  - D365 trigger;
  - destructive/hard-lock confirmations;
  - spec-driven allergen override and workflow dry-run.

## Validation

Commands run:

```bash
cd /Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/04-planning-basic
python3 _validate.py

cd /Users/mariuszkrawczyk/Projects/monopilot-kira
python3 - <<'PY'
import json, pathlib
root=pathlib.Path('/Users/mariuszkrawczyk/Projects/monopilot-kira')
idx=json.loads((root/'_meta/prototype-labels/prototype-index-planning.json').read_text())
master=json.loads((root/'_meta/prototype-labels/master-index.json').read_text())
labels=[e['label'] for e in idx['entries']]
mlabels={e['label'] for e in master if e.get('module')=='planning'}
print('planning index entries',len(labels),'unique',len(set(labels)))
print('missing from master',sorted(set(labels)-mlabels))
print('duplicate labels',sorted([x for x in set(labels) if labels.count(x)>1]))
PY

git diff --check
```

Results:

- `_validate.py`: PASS — 65 task files inspected, 0 failures.
- Planning prototype index: 39 entries / 39 unique labels.
- Master index: no Planning labels missing.
- Duplicate Planning labels: none.
- `git diff --check`: OK.
- PRD stale blocker search for `NO-PROTOTYPE-YET|NO-UX-YET|PROTO-GAP|TODO`: 0 matches in `04-PLANNING-BASIC-PRD.md`.

## Remaining questions / non-blockers

- None blocking 95%+ Planning Basic readiness.
- Non-P1 diagnostics remain explicitly deferred by PRD posture, especially true WO spreadsheet bulk edit and ScannerQueuePreview diagnostic.
- Implementation agents must still respect cross-module contracts for Warehouse, Scanner, Settings, NPD, Technical, and D365 adapter metadata; this hardening did not implement app code.
