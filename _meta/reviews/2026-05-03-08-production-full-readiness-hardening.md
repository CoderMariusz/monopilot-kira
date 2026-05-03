# 08 Production full readiness hardening report

Date: 2026-05-03
Scope: docs/meta/prototype/task readiness for full `08-PRODUCTION`, beyond the earlier release-read-model slice. No application implementation was performed.

## Inputs read

- `_meta/decisions/2026-05-03-wave0-readiness-answers.md`
- `_meta/decisions/2026-05-03-next-modules-warehouse-scanner-planning-production-decisions.md`
- `_meta/reviews/2026-05-03-next-modules-04-05-06-08-readiness-report.md`
- `_meta/reviews/2026-05-03-04-08-factory-release-contract-audit.md`
- `docs/prd/08-PRODUCTION-PRD.md`
- `prototypes/design/08-PRODUCTION-UX.md`
- `_meta/prototype-labels/prototype-index-production.json`
- `_meta/prototype-labels/master-index.json`
- `_meta/prototype-labels/translation-notes-production.md`
- `_meta/atomic-tasks/08-production/*`

## What changed

### PRD / UX

- Kept and extended the canonical release-read-model contract:
  - Production consumes only approved/released WO snapshots with `active_bom_header_id` and `active_factory_spec_id`.
  - D365 `Built` / sync / export / preload is metadata/side-effect only, never factory source-of-truth.
  - Production does not select latest active BOM/spec and does not own release/readying.
- Patched PRD traceability table:
  - `release_wo_modal` is now `DEPRECATED`, not OK.
  - `start_wo_modal` explicitly shows approved active BOM/spec readiness and blocks on typed release blockers.
- Patched UX key concepts and MODAL-01 Start WO fields with a factory-release readiness block and D365 non-SoT warning.

### Prototype labels / translation notes

- Hardened `_meta/prototype-labels/prototype-index-production.json`:
  - `release_wo_modal` marked as deprecated trace, lines `3-8`, translation time `0`.
  - Removed active dependencies on `release_wo_modal` from dashboard/list/card labels.
  - Added Wave Next notes for `start_wo_modal`, `wo_detail`, `changeover_gate_modal`, `oee_target_edit_modal`, `tweaks_panel`.
  - Added readiness metadata stating 95%+ docs/meta/prototype/task posture and screenshot/trace policy.
- Hardened `_meta/prototype-labels/master-index.json` for the production labels with the same deprecation/removal semantics.
- Updated `_meta/prototype-labels/translation-notes-production.md`:
  - Header now reflects Wave Next hardening.
  - `release_wo_modal` section rewritten as DO NOT IMPLEMENT / deprecated anti-regression trace.
  - `start_wo_modal` notes now require canonical release blockers and active BOM/spec IDs.

### Atomic tasks / coverage

- Expanded `_meta/atomic-tasks/08-production` from the existing 40-task backend-heavy set to 55 ACP-shaped tasks:
  - `T-041` D365 outbox dispatcher + anti-corruption adapter.
  - `T-042` D365 DLQ management APIs.
  - `T-043` allergen changeover endpoints and START gate evaluator.
  - `T-044` OEE snapshots + line SSE/event aggregation.
  - `T-045` production settings/OEE target/taxonomy actions.
  - `T-046`..`T-051` T3-ui parity tasks for every Production screen/modal group with prototype paths, labels, screenshot and Playwright trace requirements.
  - `T-052`..`T-055` T4-e2e evidence tasks for happy path, scanner-linked contracts, exception gates, and operations closeout.
- Rewrote `_meta/atomic-tasks/08-production/coverage.md` as a full-module readiness table mapping PRD/UX/prototype surfaces to T-XXX tasks.
- Updated `_meta/atomic-tasks/08-production/manifest.json` to include all 55 tasks.

## Validation

Commands run:

```bash
cd /Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/08-production
python3 _validate.py
# PASS: 55 tasks validated

python3 -m json.tool ../../prototype-labels/prototype-index-production.json >/dev/null
python3 -m json.tool ../../prototype-labels/master-index.json >/dev/null
```

## Readiness verdict

08-PRODUCTION is now at ~95%+ docs/meta/prototype/task readiness for ACP import/execution.

Rationale:

- Full PRD/UX/prototype traceability exists for all P1 Production screens and modals.
- Deprecated `release_wo_modal` is explicitly non-implementable and retained only as an anti-regression trace.
- T3-ui and T4-e2e tasks require screenshot/artifact and Playwright trace/artifact evidence.
- Local dependencies are `T-XXX`; cross-module dependencies are in `pipeline_inputs.cross_module_dependencies` where relevant.
- The canonical release-read-model contract is consistently present across PRD, UX, prototype labels and tasks.

## Remaining questions / blockers

1. 09-QUALITY exact task IDs are not available in the current scope. Production tasks reference Quality as a typed external cross-module contract for QA holds, inspection requests, ATP/sign-off policy; replace with concrete T-XXX IDs after Quality decomposition is finalized.
2. `tweaks_panel` remains an internal/devtools prototype-only surface. It is hidden by default behind `production.tweaks_panel.enabled` and is explicitly not a P1 readiness blocker; Product should later decide remove vs migrate to 02-SETTINGS user preferences.
3. Future prototype-index regeneration should archive/remove `release_wo_modal` entirely once downstream consumers no longer need the anti-regression trace.
