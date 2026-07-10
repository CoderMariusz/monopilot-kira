# Wave 3 — lifecycle / integrity (6 bugs)

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.

## Bug 1 (P1) — materialize-npd-bom bypasses the BOM state machine
`apps/web/app/[locale]/(app)/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts:891-899` activates a bom_header with no status precondition and self-approves (approved_by = NPD user), bypassing draft→in_review→technical_approved→active (see `technical/bom/workflow.ts:100-103`, `lib/technical/bom-publish-service.ts:120-124`). The WIP path at :1343-1347 HAS the guard.
FIX: add `and status='draft'` precondition and route activation through bom-publish-service (or replicate its exact guards) so the same invariants hold. Keep NPD promote UX working — if the service requires an approval step, the promote flow is the approval (record it properly, not as silent self-approve: use the same fields the service writes).

## Bug 2 (P1) — update-bom-yield mutates ACTIVE header in place
`(npd)/pipeline/[projectId]/handoff/_actions/update-bom-yield.ts:56-63` updates yield_pct on an ACTIVE bom_header without a new version/approval; only gated by npd.handoff.promote.
FIX: restrict the in-place update to headers still owned by the same promote session (status 'draft'/not-yet-active). For an ACTIVE header, refuse with a typed error telling the user to raise an ECO/new version. Trace callers to confirm UX still works for the normal promote path.

## Bug 3 (P1) — releaseWorkOrder heal-write persists despite refusal
`planning/work-orders/_actions/releaseWorkOrder.ts:52-121` — backfill UPDATE (active_factory_spec_id/active_bom_header_id/uom_snapshot) runs before the gates; `return {ok:false}` from gates (pack_hierarchy_incomplete / factory_release_incomplete) still commits (withOrgContext commits on non-throw return).
FIX: move the gates BEFORE the heal UPDATE (preferred) or throw a domain error to roll back. Keep the returned error shape identical for the UI.

## Bug 4 (P1) — G3 approve jumps stages
`(npd)/pipeline/_actions/approve-project-gate.ts:86-91,143-153,203-207` — approve G3 moves to 'approval' from ANY G3 stage (bypasses assertAdjacentStage); blockers computed for nextStage(current) instead of the actual target 'approval'; comment claims "no longer auto-advances" but code calls updateProjectStage.
FIX: compute blockers for the real target stage and enforce adjacency (or stop moving the stage on approve — pick whichever matches the surrounding gate model; read revert-gate/gate flow first and keep it consistent). Update the stale comment.

## Bug 5 (P1) — formulation lifecycle inverted / dead state
`formulation/_actions/submit-for-trial.ts:82` requires state==='locked' and NOTHING ever writes 'submitted_for_trial' (dead state; lock-version.ts:50,58 has a dead branch for it).
FIX: make submitForTrial actually transition draft→? per the intended model: read the UI + e2e spec expectations to determine intent, then either (a) write 'submitted_for_trial' in submitForTrial and accept it in lock-version, or (b) remove the dead state entirely and simplify. Choose the one consistent with UI copy and tests; document the choice in the summary.

## Bug 6 (P1) — hold release blanket-resets qa_status
`quality/_actions/hold-actions.ts:337-344,839-847` — creating a WO hold overwrites every output's qa_status; release resets ALL to PENDING, losing prior PASSED/FAILED (the LP path already snapshots qaStatusFrom/qaStatusTo).
FIX: on hold create, snapshot each output's prior qa_status (mirror the LP path's mechanism); on release, restore per-output prior values instead of blanket PENDING. If a snapshot column/ext_jsonb slot is needed, prefer ext_jsonb — NO new migration unless unavoidable.

## Requirements
- Read every touched file fully + grep all callers before editing. Mirror existing patterns.
- Tests per bug (vitest, existing __tests__ patterns): Bug 3 must include a test that a gate refusal leaves the WO row unchanged; Bug 6 a test that release restores PASSED.
- NO new dependencies; avoid migrations (ext_jsonb for snapshots).
- Gates: `pnpm --filter web exec tsc --noEmit` clean + touched vitest green.
- Summary per bug → `_meta/plans/wave-3-summary.md`.
