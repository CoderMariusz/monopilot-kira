# NPD pipeline core — static bug review

## Findings

### P1 — G4 approval bypasses the stage-gate validation path

**Evidence:** [approve-project-gate.ts:142](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/approve-project-gate.ts:142), [advance-project-gate.ts:207](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/advance-project-gate.ts:207)

`approveProjectGate` directly changes an `approval` project to `handoff` after running only `getBlockers()`. It does not run `evaluateStageGate()`, which is the path that checks required departmental fields and records an authorized soft-gate override.

Consequently, a user can approve G4 and enter handoff while required Approval-stage fields are missing, without supplying an override note or producing the corresponding override audit. The source comment says approval is only a checkpoint and no longer auto-advances, but lines 142–152 still perform the transition.

Suggested fix: make G4 approval record the signed checkpoint only. Require the separate `advanceProjectGate(approval → handoff)` transaction to perform validation and stage movement.

---

### P1 — Reverted or subsequently rejected gates can reuse obsolete approvals

**Evidence:** [gate-helpers.ts:242](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:242), [gate-helpers.ts:266](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:266), [revert-npd-gate.ts:51](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/revert-npd-gate.ts:51)

Both e-sign guards accept any historical signed `approved` row for the project and gate. They do not select the latest decision or bind the approval to a lifecycle revision. `revertNpdGate` moves the project backward but does not invalidate or supersede prior approvals.

Failure scenario:

1. G3/G4 is approved.
2. The project is reverted and its recipe, costing, packaging, or other inputs change.
3. The project returns to the checkpoint.
4. The old approval still satisfies `assertG3ESignForApproval` or `assertG4ESignForHandoff`, even if a newer rejection exists.

This defeats the purpose of re-approval after rework.

Suggested fix: introduce a gate-attempt/revision identifier and bind approvals to it, or at minimum require that the latest approval decision for the current gate is `approved` and newer than the most recent revert/relevant mutation.

---

### P1 — Project deletion cascades through progressed lifecycle data instead of returning `HAS_DEPENDENTS`

**Evidence:** [delete-project.ts:20](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/delete-project.ts:20), [232-npd-packaging-components.sql:9](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/232-npd-packaging-components.sql:9), [233-npd-trial-batches.sql:9](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/233-npd-trial-batches.sql:9), [234-npd-pilot-runs.sql:10](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/234-npd-pilot-runs.sql:10), [235-npd-handoff-checklists.sql:11](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/235-npd-handoff-checklists.sql:11)

The action explicitly expects downstream formulation/packaging/trial data to cause an FK violation and return `HAS_DEPENDENTS`. The database ground truth instead declares cascading deletion for formulations, packaging components, trial batches, pilot runs, and handoff checklists.

Deleting a progressed project therefore silently destroys its development and handoff history instead of hitting the intended guard.

Suggested fix: enforce the lifecycle rule in the database—use restrictive FKs for records that must prevent deletion—or explicitly probe for dependents under the locked project row before deletion. Prefer soft deletion/archive for progressed projects.

---

### P2 — Deletion leaves approval audit rows detached and normally emits no deletion event

**Evidence:** [085-npd-projects-and-gates.sql:60](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/085-npd-projects-and-gates.sql:60), [delete-project.ts:60](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/delete-project.ts:60), [events.enum.ts:79](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/outbox/src/events.enum.ts:79)

Deleting a project sets `gate_approvals.project_id` to `NULL`; the approval table contains no immutable project code or deletion tombstone. Meanwhile, the action acknowledges that `npd.project.deleted` is absent from the outbox allow-list, catches the failed insert, and commits deletion anyway.

The surviving approval/e-sign records thus lose their project linkage, while downstream consumers receive no deletion event that could preserve or reconcile the association.

Suggested fix: admit the canonical deletion event before emitting it, make event creation atomic with deletion, and retain a durable project identifier on approval history or a project tombstone.

## CLEAN areas verified

- Forward stage movement uses adjacency validation and cannot request an arbitrary skipped stage.
- `advanceProjectGate`, approval, and gate revert lock the project row with `FOR UPDATE`, serializing concurrent lifecycle changes for one project.
- Checklist toggles lock the individual checklist row, preventing concurrent lost updates to the same item.
- Approval inserts occur while the project lock is held, preventing simultaneous approval actions from racing the project stage.
- Handoff checklist seeding is idempotent through the `(org_id, project_id)` uniqueness constraint.
- Project, approval, checklist, and transition queries reviewed were scoped through `app.current_org_id()`.
- Launched projects are rejected by the normal forward-advance action.
- I did not re-report the excluded G3 approval stage-jump defect.

## Not covered

- NPD formulation internals, costing algorithms, sensory calculations, packaging storage behavior, and production handoff internals except where directly involved in lifecycle transitions.
- Browser/UI parity, accessibility, translations, and client optimistic-state behavior.
- Live Supabase trigger inspection or migration execution.
- Runtime tests; this was a read-only static review, so no test suites or database commands were run.
