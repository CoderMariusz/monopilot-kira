# 04 Planning + 08 Production factory release read-model contract audit

Date: 2026-05-03
Scope: docs/meta/prototype/task-readiness only; no app implementation.

## Canonical contract audited

Planning and Production must consume the canonical factory release read model owned by 01-NPD T-097 and transitioned/adapted by 03-TECHNICAL T-080/T-081:

- factory-usable statuses: `approved_for_factory`, `released_to_factory`
- blocked/non-usable statuses: `pending_npd_release`, `pending_technical_approval`, `blocked`
- required active IDs: `active_bom_header_id`, `active_factory_spec_id`
- D365 import/export/preload/`Built`/sync states are optional integration metadata only and are not source-of-truth.

## Files patched

- `docs/prd/04-PLANNING-BASIC-PRD.md`
  - Added Planning consumer contract.
  - Added WO snapshot fields for active BOM/spec/release metadata.
  - Replaced ad-hoc latest active BOM selection with canonical read-model selection.
  - Patched cascade pseudocode to resolve every node through active release rows.
- `docs/prd/08-PRODUCTION-PRD.md`
  - Added Production runtime consumer contract.
  - Added START preflight requirement and consumption validation reference.
  - Clarified that Production does not release/select BOM/spec and D365 push is a side effect only.
- `_meta/prototype-labels/prototype-index-planning.json`
  - Added translation notes for WO create, cascade preview, draft review, D365 trigger, WO list and WO detail.
- `_meta/prototype-labels/prototype-index-production.json`
  - Added runtime guard notes for start/list/detail/dashboard/line detail.
  - Marked stale `release_wo_modal` entry as deprecated because JSX already removed the modal from Production scope.
- `_meta/atomic-tasks/04-planning-basic/*`
  - Created minimal ACP-ready manifest, coverage, and T-001 task.
- `_meta/atomic-tasks/08-production/*`
  - Created minimal ACP-ready manifest, coverage, and T-001 task.

## Prototype existence audit

Planning:
- Index entries: 33, unique labels: 33.
- All referenced prototype files exist.
- Relevant factory-release surfaces exist in index/prototypes: `wo_create_wizard`, `cascade_preview_modal`, `draft_wo_review_modal`, `d365_trigger_confirm_modal`, `plan_wo_list`, `plan_wo_detail`.
- JSX uses PascalCase component names (for example `WOCreateModal`, `CascadePreviewModal`, `DraftWOReviewModal`, `PlanWOList`, `PlanWODetail`) while prototype index uses snake_case semantic labels. This is a naming-convention mismatch, not a missing-file issue.

Production:
- Index entries: 33, unique labels: 33.
- All referenced prototype files exist.
- Relevant runtime surfaces exist in index/prototypes: `start_wo_modal`, `wo_list`, `wo_detail`, `production_dashboard`, `line_detail`.
- `release_wo_modal` is intentionally deprecated/stale: `production/modals.jsx` lines 3-8 state ReleaseWoModal was removed as Production scope hallucination and belongs to Planning. The index now marks this label deprecated instead of treating it as an implementable Production modal.
- JSX uses PascalCase/non-prefixed component names (for example `StartWoModal`, `WOList`, `WODetail`, `Dashboard`, `LineDetail`) while prototype index uses snake_case semantic labels. This is a naming-convention mismatch, not a missing-file issue.

## Task readiness

Created minimal ACP-ready decompositions because no 04/08 atomic task folders existed.

- 04 Planning: `_meta/atomic-tasks/04-planning-basic/tasks/T-001.json`
  - One task type: `T2-api`.
  - Includes required ACP `pipeline_inputs.root_path`, `description`, `details`, `scope_files`, `acceptance_criteria`, `test_strategy`, `risk_red_lines`, `skills`, `checkpoint_policy`.
  - Cross-module dependencies reference 01-NPD T-097 and 03-TECH T-080/T-081.
- 08 Production: `_meta/atomic-tasks/08-production/tasks/T-001.json`
  - One task type: `T2-api`.
  - Includes required ACP metadata and cross-module dependencies on 01-NPD T-097, 03-TECH T-080/T-081, and 04 Planning T-001.

JSON validation passed for both prototype indexes, manifests, and task JSONs.

## Questions / blockers

1. Confirm whether the canonical read-model column is named exactly `release_status` in implementation, or whether T-097 will expose another field name for the same status. PRDs now say `release_status` / equivalent canonical status.
2. Decide whether future prototype-index regeneration should remove deprecated `release_wo_modal` entirely or keep it as an archived anti-regression trace.
3. Full 04/08 module decomposition remains outside this patch; only the release-read-model contract slice now has ACP-ready tasks.
