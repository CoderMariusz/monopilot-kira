# PROPOSED TASK STUB — Technical Sensory Evaluation UI (orphaned deferral)

> Proposal only. Not added to any manifest/STATUS.
> Addresses finding F-3 (Sensory UI has no owning task anywhere).

## Problem (evidence)
- 01-npd deferred BOTH `T-071` (Sensory schema) and `T-076` (Sensory **UI**) to 03-technical
  (`_meta/atomic-tasks/01-npd/STATUS.md` lines 85, 90 — "canonical owner = 03-technical").
- 03-technical owns the schema/contract via `T-084` but it **explicitly excludes UI**:
  *"Include schema/API contract and tests only; no UI/prototype implementation."*
  (`_meta/atomic-tasks/03-technical/tasks/T-084.json`).
- `_meta/plans/EXECUTION-PLAN.md` line 205 confirms npd `T-076` is typed `docs`/`plan` (deferral marker, not impl).
- → No module has an impl task for the Sensory evaluation UI; it will silently never be built.

## Proposed scope (03-technical)
- New 03-technical UI task: Sensory Evaluation screen(s) consuming the `T-084` read model
  (required / pending / pass / fail / hold states), org-scoped via `withOrgContext`, prototype parity against
  the technical UX prototype, real Supabase data.
- Surface the read model to NPD (read-only badge per `T-084` contract — do NOT move gate ownership into Technical).

## Acceptance
- Prototype parity (literal JSX anchor) + real-data + 4 UI states; consumes T-084 only (no new sensory write path).

## Risk tier: high (UI parity gate). Opus impl-ui + Codex review.
## Cross-module: 01-npd is the read consumer; canonical owner stays 03-technical (per T-071/T-076 deferral).
## Blocked by: 03-technical T-084 (schema/contract) — must land first.
