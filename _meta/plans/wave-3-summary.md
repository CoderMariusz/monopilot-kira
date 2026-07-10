# Wave 3 — lifecycle / integrity fixes (summary)

## Bug 1 — materialize-npd-bom bypasses BOM state machine

**Root cause:** `createActiveNpdBom` flipped `draft → active` with a bare UPDATE (no `status = 'draft'` guard) and self-set `approved_by`, skipping `technical_approved`.

**Fix:** After line insert + V-TEC guards, transition `draft → technical_approved` (recording `approved_by` / `approved_at` — NPD promote is the approval step), then call canonical `publishBomVersion` with `skipPermissionCheck: true` (RBAC already enforced upstream). Added `skipPermissionCheck` to `PublishBomVersionParams` for trusted in-txn callers.

**Tests:** Updated `materialize-npd-bom.test.ts` — guard defaults for publish path; supersede/activate ordering now asserts `technical_approved` before `active`.

---

## Bug 2 — update-bom-yield mutates ACTIVE header in place

**Root cause:** Any `active` `bom_header` could have `yield_pct` rewritten post-handoff.

**Fix:** Allow in-place yield only on `draft` / `technical_approved`, or on `active` NPD handoff BOMs where `handoff_checklists.promote_to_production_date IS NULL` (generate → yield-prompt window). Otherwise return `active_bom_requires_eco`.

**Tests:** New `update-bom-yield.test.ts` — handoff window allowed; post-promote refused; draft allowed.

---

## Bug 3 — releaseWorkOrder heal-write persists despite refusal

**Root cause:** Heal `UPDATE` ran before pack-hierarchy / factory-release gates; `return { ok: false }` committed via `withOrgContext`.

**Fix:** `SELECT` preflight (same coalesce logic) → evaluate gates → only then heal + release `UPDATE`s.

**Tests:** `releaseWorkOrder.test.ts` — new case asserts gate refusal issues zero `UPDATE public.work_orders`.

---

## Bug 4 — G3 approve jumps stages

**Root cause:** `approvalTargetStage` always returned `'approval'` for G3; blockers used `nextStage(current)` not the real target; stale comment contradicted `updateProjectStage`.

**Fix:** `approvalTargetStage` only returns `'approval'` when `current_stage === 'pilot'` (adjacent). Blockers computed for that target. `assertAdjacentStage` enforced before stage write. G3 e-sign from earlier G3 substages records approval but does not advance.

**Tests:** `gate-machine-honesty.test.ts` — packaging G3 approve stays on packaging; pilot G3 approve advances to approval.

---

## Bug 5 — formulation lifecycle inverted / dead state

**Choice (a):** `submitForTrial` transitions `draft → submitted_for_trial` (consistent with e2e `npd-formulation-lifecycle.spec.ts`, UI state badge, and `lock-version.ts` which already accepts `submitted_for_trial → locked`).

**Root cause:** `submitForTrial` required `locked` and never wrote `submitted_for_trial`.

**Fix:** Gate on `draft` (reject `locked` / non-draft); `UPDATE formulation_versions SET state = 'submitted_for_trial'` after trial seed.

**Tests:** `submit-for-trial.test.ts`, `lifecycle.test.ts` — flow is now draft → submitted_for_trial → locked.

---

## Bug 6 — hold release blanket-resets qa_status

**Root cause:** WO hold create set all outputs `ON_HOLD` without snapshot; release set all `PENDING`.

**Fix:** On WO hold create, snapshot prior `qa_status` per output into `quality_holds.ext_jsonb.wo_output_qa_snapshots`. On release, restore per-output prior values; unsnapped outputs still fall back to `PENDING`.

**Tests:** `hold-actions.test.ts` — create snapshots + release restores `PASSED` for `out-1`.

---

## Gates

- `pnpm --filter web exec tsc --noEmit` — clean
- Vitest (96 tests across touched files) — all green

## Fix round 1

Adversarial review verdict: **fail** — three required changes.

### 1. Bug 2 — post-Promote yield prompt window

**Finding:** `updateBomYield` allowed in-place edits only while `promote_to_production_date IS NULL`, but `promoteToProduction` stamps that date before returning `yieldPromptRequired`, so the normal Promote → yield-prompt path was blocked.

**Fix:** Narrow the active-NPD handoff correction window to `promote_to_production_date IS NULL` **or** `yield_pct IS NULL` (unset yield is why the prompt fires). Once yield is saved, further edits require ECO.

**Tests:** `update-bom-yield.test.ts` — post-promote unset-yield allowed; promoted BOM with yield set refused.

### 2. Bug 6 — holds on new outputs + overlapping release

**Finding:** WO hold create only snapshotted existing outputs; outputs registered during an open hold stayed `PENDING`. Releasing one of two overlapping WO holds restored snapshots even while the other hold remained open.

**Fix:**
- `register-output.ts`, `start-wo.ts`, `register-disassembly-output.ts` — set `qa_status` to `ON_HOLD` on insert when `v_active_holds` has an open WO hold.
- `hold-actions.ts` release — restore per-output `qa_status` only when no other open WO hold covers the same WO (`hold_id <> releasing hold`).

**Tests:** `register-output-wo-hold-inheritance.test.ts` (create-during-hold); `hold-actions.test.ts` overlapping WO holds keeps outputs `ON_HOLD`.

### 3. Bug 5 — org-scoped state transition + affected-row check

**Finding:** `submitForTrial` updated `formulation_versions` by `id` only (no explicit `org_id`) and did not verify a row was updated, allowing trial/audit/outbox to commit without the state write.

**Fix:** `UPDATE … FROM formulations f` with `f.org_id = app.current_org_id()`, `RETURNING fv.id`, throw on zero rows so the transaction rolls back.

**Tests:** `submit-for-trial.test.ts` — SQL org filter + zero-row transition returns `persistence_failed` without audit/outbox writes.

### Gates (fix round)

- `pnpm --filter web exec tsc --noEmit` — clean
- Vitest (22 tests across touched fix files) — all green
