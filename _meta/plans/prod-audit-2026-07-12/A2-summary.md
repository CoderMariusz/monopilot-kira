# Wave A2 — WO lifecycle & release gating — implementation summary

**Worktree:** `fix/A2-wo-lifecycle`  
**Date:** 2026-07-12  
**Gates:** touched vitest **42/42 PASS** (`upstream-wip-dependency-gate`, `start-wo.upstream-wip-gate`, `wo-state-machine.timestamps`, `complete-cancel-wo`, `evaluate-closed-production-strict`, `releaseWorkOrder`, `submit-for-trial`). No `'use server'` export shape changes → full build not required.

---

## C3 (P0) — WIP→FG dependency not enforced

**Repro:** Parent FG WO released/started/completed while prerequisite WIP child remained `DRAFT` (`factory_release_incomplete` on WIP release). `wo_dependencies` did not gate FG transitions.

**Root cause:** No shared choke-point read of `wo_dependencies` at release/start/complete. FG lifecycle proceeded independently of upstream WIP state/output.

**Fix locations:**
- `apps/web/lib/planning/upstream-wip-dependency-gate.ts` — shared gate (`release` blocks `DRAFT`/`CANCELLED`; `start`/`complete` require production-ready status + `produced_quantity ≥ required_qty`).
- `apps/web/app/.../planning/work-orders/_actions/releaseWorkOrder.ts` — `assertUpstreamWipReady(..., 'release')`.
- `apps/web/lib/production/start-wo.ts` — `assertUpstreamWipReady(..., 'start')`.
- `apps/web/lib/production/complete-cancel-wo.ts` — `assertUpstreamWipReady(..., 'complete')`.
- `apps/web/lib/production/shared.ts` — `upstream_wip_not_ready` error + HTTP 409 map.

**Tests:**
- `apps/web/lib/planning/__tests__/upstream-wip-dependency-gate.test.ts`
- `apps/web/lib/production/__tests__/start-wo.upstream-wip-gate.test.ts`
- `apps/web/app/.../planning/work-orders/_actions/releaseWorkOrder.test.ts` (upstream block case)

---

## C4 (P0) — WO completed at ~2.6% consumption (yield gate advisory)

**Repro:** 3 kg output registered; ~2.6% material consumed; completion allowed despite out-of-tolerance yield.

**Root cause:** `completeWo` only checked primary-output presence (`qty_kg > 0`). No enforcement of consumption-vs-output tolerance band; override path existed but tolerance failure did not enter it.

**Fix locations:**
- `apps/web/lib/production/evaluate-closed-production-strict.ts` — SQL evaluator (2% default band vs BOM/operation yield).
- `apps/web/lib/production/complete-cancel-wo.ts` — blocks with `closed_production_strict_failed` / `consumption_yield_out_of_tolerance` unless taxonomy override + `production.wo.override_yield`; audit + outbox on override.

**Tests:** `apps/web/lib/production/__tests__/complete-cancel-wo.test.ts` — rejects low consumption without override; allows with `material_shortage` override.

---

## S5 — failed WIP release not surfaced

**Repro:** WIP release returned `factory_release_incomplete` (missing `factory_spec`); UI showed nothing.

**Root cause:** Action returned typed error but without actionable `message`; list view only mapped `missing[]` when `factoryReleaseIncomplete` labels present.

**Fix locations:**
- `releaseWorkOrder.ts` — `factory_release_incomplete` now includes explicit `message` (“generate/complete factory spec in Technical…”).
- `wo-list-view.tsx` — prefers `result.message` for `factory_release_incomplete` and surfaces `upstream_wip_not_ready.message` inline (`role="alert"`).
- `production/work-orders/[id]/release/route.ts` — passes `message` in JSON error body.

**Tests:** `releaseWorkOrder.test.ts` (message on incomplete); existing `work-orders.test.tsx` UI case retained.

---

## S8 — `started_at` / `completed_at` stay NULL

**Repro:** After Start/Complete, `work_orders.started_at` and `completed_at` remained NULL.

**Root cause:** `wo_state_machine.applyTransition` mirrored status onto `work_orders` but did not stamp timestamp columns (only `wo_executions` got verb timestamps).

**Fix location:** `apps/web/lib/production/wo-state-machine.ts` — `WORK_ORDER_VERB_TIMESTAMP` maps `start→started_at`, `complete→completed_at` (same txn, `pg_catalog.now()`).

**Tests:** `apps/web/lib/production/__tests__/wo-state-machine.timestamps.test.ts` — asserts `work_orders` UPDATE includes timestamp columns for start/complete.

---

## S19 — Submit for trial `VERSION_NOT_LOCKED` despite locked version

**Repro:** NPD “Submit for trial” returned `VERSION_NOT_LOCKED` while DB showed version locked; UI showed no error.

**Root cause:** **Inverted gate** in `submit-for-trial.ts` — `if (row.state === 'locked') return VERSION_NOT_LOCKED` rejected the only valid state. UI (`formulation-editor.tsx`) already requires `locked` before enabling submit.

**Fix locations:**
- `submit-for-trial.ts` — requires `locked`; resolves current locked version in-txn (requested id if locked, else latest locked for project); transitions `locked → submitted_for_trial`; draft/unlocked → `VERSION_NOT_LOCKED` (with existence check vs `not_found`).
- `formulation-editor.tsx` — already maps `VERSION_NOT_LOCKED` → inline `role="alert"` (`submit-error` testid).

**Tests:** `submit-for-trial.test.ts` — locked success, draft rejection, stale versionId resolves to locked row.

---

## File inventory (this wave)

| File | Bugs |
|------|------|
| `upstream-wip-dependency-gate.ts` | C3 |
| `evaluate-closed-production-strict.ts` | C4 |
| `complete-cancel-wo.ts` | C3, C4 |
| `start-wo.ts` | C3 |
| `wo-state-machine.ts` | S8 |
| `releaseWorkOrder.ts` + `shared.ts` + `wo-list-view.tsx` | C3, S5 |
| `submit-for-trial.ts` | S19 |
| `production/.../release/route.ts` | S5 |

---

## Corrections (Codex cross-review, 2026-07-12)

Five accepted defects from the A2 cross-review pass:

| # | Severity | Defect | Fix |
|---|----------|--------|-----|
| 1 | BLOCKER | C4 zero-consumption fail-open — `posted_consumption_kg <= 0` OR-ed into `within_tolerance`, letting positive output + ~0% consumption complete without override | `evaluate-closed-production-strict.ts`: `within_tolerance` is true only when output > 0, consumption > 0, yield > 0, and consumption is inside the NUMERIC band |
| 2 | BLOCKER | C4 override lacked CFR-21 e-sign — permission + taxonomy code only | `complete-cancel-wo.ts`: override path requires `overridePin` + `overrideEsignReason`; `signEvent` with intent `prod.wo.yield_override` in the same txn; signature id on transition context + outbox. Route accepts optional e-sign fields |
| 3 | BLOCKER | S19 cross-formulation corruption — stale-ID fallback resolved latest locked version by `project_id` | `submit-for-trial.ts`: fallback scoped to `requested.formulation_id` version chain only |
| 4 | BLOCKER | `applyTransition` partial commit — post-mutation errors returned `persistence_failed`, committing `wo_events`/`wo_executions` without `work_orders` mirror | `wo-state-machine.ts`: post-validation persistence errors throw (23505 idempotent replay still short-circuits) |
| 5 | SHOULD-FIX | C3 dependency qty compared as JS `Number`; gate read `work_orders.produced_quantity` (completion-only) | `upstream-wip-dependency-gate.ts`: sufficiency + status blocking computed in SQL NUMERIC from `sum(wo_outputs.qty_kg)`; incremental posted output counts while WIP is `IN_PROGRESS` |

**Added/updated tests:** `evaluate-closed-production-strict.test.ts` (zero-consumption blocked), `complete-cancel-wo.test.ts` (e-sign required on override), `submit-for-trial.test.ts` (formulation-scoped fallback), `wo-state-machine.timestamps.test.ts` (mirror failure throws), `upstream-wip-dependency-gate.test.ts` (posted output semantics).

### Second correction pass (2026-07-12)

Two blockers remained after re-check; fixed in working tree only:

| # | Severity | Defect | Fix |
|---|----------|--------|-----|
| 6 | BLOCKER | S19 fallback SQL invalid on real Postgres — `ORDER BY fv.version_no` inside UNION branch; `ORDER BY rv.rank` without `rv.rank` in GROUP BY | `submit-for-trial.ts`: lateral subquery for latest locked version per requested formulation; `rv.rank` added to GROUP BY |
| 7 | BLOCKER | S19 RSC build — `export type SubmitForTrialResult` in `'use server'` module | Moved to `submit-for-trial-types.ts`; server action imports type only |
| 8 | BLOCKER | `applyTransition` catch treated any `23505` as idempotent replay | `wo-state-machine.ts`: replay short-circuit only on `wo_events_transaction_id_unique`; other `23505` throws for rollback |

**Verification:** touched vitest **10/10 PASS** (`submit-for-trial` 5, `wo-state-machine.timestamps` 5); `tsc` clean on touched files. `pnpm --filter web run build` blocked in worktree (Turbopack symlink to parent `node_modules`); RSC gate satisfied — `submit-for-trial.ts` exports only `async function submitForTrial`; type moved to `submit-for-trial-types.ts`. S19 gate SQL: lateral subquery + `rv.rank` in GROUP BY (valid PG shape; live PREPARE not run — no local Postgres).
