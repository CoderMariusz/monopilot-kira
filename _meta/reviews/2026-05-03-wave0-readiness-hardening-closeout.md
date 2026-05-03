# Wave 0 Readiness Hardening Closeout

Date: 2026-05-03
Repo: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
Base before this wave: `ae0be5a178fdf6cbd3b7a167fbfd13cba06b6332`
Scope: docs/meta/atomic-task hardening only; no application implementation.

## Inputs

- User answers locked in `_meta/decisions/2026-05-03-wave0-readiness-answers.md`.
- Real ACP task/import shape documented in `_meta/reviews/2026-05-03-acp-real-task-shape.md` from `/Users/mariuszkrawczyk/Projects/agent-control-plane`.

## Locked decisions applied

- Business/RLS scope uses `org_id`.
- Finished Good / `FG` is canonical; legacy FA is compatibility alias only.
- Foundation owns cross-module contracts for shared BOM SSOT, factory_spec/internal_product_spec, authorization policies, and D365 optional integration posture.
- RLS must use a safe non-spoofable org-context pattern.
- Brief completion creates/links NPD Project; FG/Product code is selected at G3.
- D365 is optional import/export/integration and never release/source-of-truth.
- Settings Quality placeholder uses existing flags permission model.
- Pending Invitations and Global Import/Export need backend lifecycle/job tasks in Phase 1.
- T-122 authorization policy work is split into schema/seed, helpers/actions/preflight, and UI.
- NPD T-097 is canonical release model; Technical T-081 is adapter only.
- Initial factory_spec after NPD Builder is `in_review`.
- NPD Builder output is visible/pending, not factory-usable until Technical approval.
- G4 NPD closure and Technical factory_spec/BOM approval are separate gates.
- Quality owns NCR/lab lifecycle; Technical produces/consumes contracts/read models.
- Supplier specs are Phase 1.
- Technical sensory contract/task is added.
- Technical no-prototype MVP surfaces must be represented as spec-driven tasks with screenshots/traces.
- ACP task prompts should be rich/self-contained; local dependencies must remain local `T-XXX`, cross-module blockers live in separate metadata/prompt.
- Lower priority value means sooner.
- Exactly one atomic task type per task.
- UI closeout requires screenshots/artifacts and Playwright trace/artifacts where applicable.

## Changes by module

### 00 Foundation

Task count: 46 -> 52.

Key changes:
- `docs/prd/00-FOUNDATION-PRD.md` updated to v4.3 Wave0 posture.
- Coverage/manifest updated.
- Rewrote/hardened T-003, T-004, T-005, T-006, T-007, T-014, T-032, T-040.
- Added:
  - T-047 — final domain amendment.
  - T-048 — domain glossary lock.
  - T-049 — shared BOM SSOT skeleton contract.
  - T-050 — authorization policy foundation.
  - T-051 — D365 posture contract.
  - T-052 — manifest/coverage/readiness patch.
- Normalized priorities to the approved convention.
- Removed misleading parallel-safe conflicts.

### 01 NPD

Task count: 98 -> 100.

Key changes:
- T-033 hardened so Brief completion is Brief -> Project; `convertBriefToFa` is compatibility wrapper only and cannot create FG/Product before G3.
- T-035 hardened so Brief completion no longer asks for FG/FA code; G3 owns FG code/mapping.
- T-056 hardened with final G0-G4 evidence matrix and prototype-superseding final decisions.
- T-071/T-076/T-078 aligned to Technical-owned sensory and N/A/not_required policy unless org policy requires it.
- T-092/T-093 hardened around shared BOM SSOT and migration/backfill checklist.
- T-094 hardened as terminology/UI gate, not physical DB/route mass rename.
- T-095 hardened as spec-driven G3 Create/Map FG flow.
- T-096/T-097/T-098 cleaned to one task type each and true release/E2E semantics.
- Added:
  - T-099 — Trial/Pilot/Handoff/Packaging evidence model + gate integration.
  - T-100 — BOM/formulation version traceability read model.

### 02 Settings

Task count: 123 -> 127.

Key changes:
- Fixed Settings validator failures.
- T-020 dependency cycle removed; it now consumes authorization helpers instead of circular dependency.
- T-041..T-046 onboarding tasks now include literal prototype parity language.
- T-118 uses existing flags permission model instead of undefined `settings.quality.*`.
- T-119 now depends on backend lifecycle task.
- T-121 now depends on backend import/export jobs/capability registry.
- T-122 split:
  - T-122 schema/seed.
  - T-126 helpers/actions/preflight blockers.
  - T-127 UI.
- Added:
  - T-124 — Pending Invitations lifecycle backend list/resend/revoke.
  - T-125 — Global Import/Export backend jobs/capability registry.
  - T-126 — authorization policy helpers/actions/preflight blockers.
  - T-127 — Authorization Policies screen SET-011b.

### 03 Technical

Task count: 83 -> 90.

Key changes:
- `docs/prd/03-TECHNICAL-PRD.md` hardened around factory_specs, supplier_specs, NCR/outbox, Quality-owned lab read model, Technical adapter semantics.
- `prototypes/design/03-TECHNICAL-UX.md` updated for Wave0 UI readiness/no-prototype treatment.
- T-020 lab results bridge clarified toward Quality-owned read model / write bridge only through Quality permission/service.
- T-060 aligned to factory_specs instead of generic reference_tables.specifications.
- T-072/T-075 supplier_specs Phase 1 strengthened.
- T-080 hardened with real factory_spec+BOM approval dependencies/cross-module blockers.
- T-081 hardened as adapter to NPD T-097 canonical release model.
- T-083 UI red-line/evidence expectations strengthened.
- Added/updated T-084..T-090 for Wave0 blockers including no-prototype MVP screens and Technical sensory ownership.
- Coverage updated for T-084..T-090.

## Real ACP shape checked

Observed ACP `TaskCreate` accepts only:
- `title`
- `prompt`
- `labels`
- `priority`
- `max_attempts`
- `pipeline_name`
- `pipeline_inputs`

For `kira_dev`, ACP requires canonical metadata in `pipeline_inputs`:
- `description`
- `details`
- `scope_files`
- `acceptance_criteria`
- `test_strategy`
- `risk_red_lines`
- `skills`
- `checkpoint_policy`

Backlog import stores rows as `draft`/`queued`, assigns ACP `TASK-xxxxx`, sets `expansion_status=not_required`, and resolves `project_id` by exact `pipeline_inputs.root_path`.

## Validation run

Commands:

```bash
cd /Users/mariuszkrawczyk/Projects/monopilot-kira
for d in _meta/atomic-tasks/00-foundation _meta/atomic-tasks/01-npd _meta/atomic-tasks/02-settings _meta/atomic-tasks/03-technical; do (cd $d && python3 _validate.py); done
```

Results:
- 00 Foundation: `VALIDATION PASS — 52 tasks, 52 unique deliverables.`
- 01 NPD: `PASS: 100 task files validated, coverage.md clean`
- 02 Settings: `[validate] PASS — 0 failures`
- 03 Technical: `PASS: all checks green.`

Additional custom validation:
- manifest counts match disk counts for all four modules.
- no top-level ACP shape violations.
- no forbidden/mixed task types.
- priorities normalized to `{50,80,100,120,150}`.
- local dependencies use local `T-XXX` and resolve in-module.

Counts:
- 00-foundation: 52 / 52 / 52
- 01-npd: 100 / 100 / 100
- 02-settings: 127 / 127 / 127
- 03-technical: 90 / 90 / 90

`git diff --check`: OK.

## Readiness verdict after Wave0 hardening

Modules 00-03 are now much closer to the requested 95%+ task readiness target for ACP draft import and staged execution. The remaining cross-program caveat is outside 00-03: downstream 04 Planning and 08 Production should be patched so WO planning/execution consumes only released/approved factory read-model records before claiming full product-to-factory E2E readiness across the whole program.

## Recommended next steps

1. Review diff manually.
2. Commit Wave0 hardening once accepted.
3. Patch downstream 04 Planning / 08 Production consumer contracts.
4. Import as ACP draft only.
5. Promote a small first implementation wave, not the entire backlog.
