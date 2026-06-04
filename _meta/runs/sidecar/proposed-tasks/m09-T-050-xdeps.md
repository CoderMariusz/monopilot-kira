# PROPOSED REFINEMENT — 09-quality T-050 missing cross-module dependencies

**Type:** edit existing task (not a new task). **Priority:** MED. **Finding:** Q-1.

## Problem
`_meta/atomic-tasks/09-quality/tasks/T-050.json` (allergen_changeover_validations FK + lab_results ATP extension) has `cross_module_dependencies: null`, but its migration `0143_lab_results_atp_extension.sql`:
- `ALTER TABLE lab_results ADD COLUMN ...` — `lab_results` is **canonically owned by 03-TECHNICAL §10.4**. If 03-TECH base table is absent at migration time, this fails or silently creates a wrong-shaped table.
- creates FK to `allergen_changeover_validations` — **producer side is 08-PROD §9.8 E7** (allergen changeover gate). 09 stores ATP result + dual-sign; it must not own/duplicate the producer contract.

## Proposed change
Add to `pipeline_inputs.cross_module_dependencies`:
```json
[
  {"module": "03-technical", "task_id": "<lab_results base schema task>",
   "reason": "lab_results is canonically owned by 03-TECH §10.4; T-050 only ALTERs it (ATP/threshold cols). Base table must exist first."},
  {"module": "08-production", "task_id": "<E7 allergen_changeover_validations task>",
   "reason": "allergen_changeover_validations producer is 08-PROD §9.8 E7; 09 stores ATP result + dual-sign only (consumer)."}
]
```
Resolve the exact 03-TECH / 08-PROD task IDs from their manifests during consolidation.

## Acceptance of refinement
- T-050 wave-placement is AFTER 03-TECH lab_results + 08-PROD E7.
- Migration uses `ADD COLUMN IF NOT EXISTS` (already in PRD §6.3) and does NOT recreate lab_results.
