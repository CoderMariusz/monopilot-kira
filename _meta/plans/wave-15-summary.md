# Wave 15 — Technical lifecycle bug fixes (2026-07-10 hunt h3)

Branch: `fix/wave15-technical-lifecycle`. Theme: clone-on-write + supersession lineage; `FOR UPDATE` / advisory locks for approval/recall races.

## Bug 1 (N-20, P1) — released-BOM clone loses lineage / duplicate forks

**Root cause:** `createBomDraft` inserted a new header without `supersedes_bom_header_id` and without reusing an in-flight child; `bom-edit-dialog` forked via `createBomDraft` alone.

**Fix:**
- Added `callBomRequestVersionEdit` wrapper (`apps/web/lib/technical/bom-request-version-edit.ts`) around DB `bom_request_version_edit` (mig 168).
- `createBomDraft` accepts optional `sourceBomHeaderId`: calls canonical helper, replaces lines/co-products on the returned draft (idempotent per source).
- New `ensureBomVersionEditDraft` action for add-component on released BOMs (fork once → `addBomLine`).
- `bom-edit-dialog` passes `sourceBomHeaderId` on save-version; released add-component uses ensure + append.

**Tests:** `create-draft.version-edit.unit.test.ts` — lineage via helper, same draft on concurrent fork, `ensureBomVersionEditDraft` idempotency.

**Migration:** none (reused mig 168).

---

## Bug 2 (N-21, P1) — routing approval races operation replacement

**Root cause:** `updateRouting` / `approveRouting` read routing status without row lock; operation replace and approve could interleave.

**Fix:** `SELECT … FOR UPDATE` on `public.routings routing` at start of both actions; status re-checked under lock before child replace / transition.

**Tests:** `routing-locks.unit.test.ts` — lock before delete/insert ops; lock before approve; refuse non-draft under lock.

**Migration:** none.

---

## Bug 3 (N-22, P1) — active WIP definitions versioned in place

**Root cause:** `saveWipDefinition` bumped `version` and updated the same row + replaced ingredients/processes.

**Fix:**
- Migration **478** — `supersedes_wip_definition_id` + unique index narrowed to `status = 'active'` only (allows draft successors with same name).
- Active + content change → `INSERT` new row with lineage; prior row untouched. Draft edits remain in-place.

**Tests:** `wip-definition-clone-on-write.unit.test.ts` — insert with `supersedes_wip_definition_id`, no `UPDATE` on active row.

**Migration:** `478-wip-definition-clone-on-write-lineage.sql` (additive).

---

## Bug 4 (N-23, P1) — factory-spec recall races WO creation

**Root cause:** Recall locked spec row only; WO bind (`releaseWorkOrder` healing `active_factory_spec_id`) could slip between unlocked WO check and draft flip.

**Fix:** Shared `acquireFactorySpecProductBindLock` (`pg_advisory_xact_lock` per org+FG item) in `recall-factory-spec-core` (after spec `FOR UPDATE`, before WO re-check) and `releaseWorkOrder` (after WO `FOR UPDATE`, before bind).

**Tests:** `recall-factory-spec-core.test.ts` — advisory lock before WO query; `releaseWorkOrder.test.ts` — lock before heal UPDATE.

**Migration:** none.

---

## Bug 5 (N-46, P2) — where-used reports non-active BOM usage

**Root cause:** `listWhereUsed` joined all `bom_headers` and `DISTINCT ON` picked highest version regardless of status.

**Fix:** Added `ph.status = 'active'` filter (current-usage semantics).

**Tests:** `where-used-and-portfolio-cost.test.ts` — SQL contains active-only predicate.

**Migration:** none.

---

## Bug 6 (N-47, P2) — item_type mutable after typed dependencies

**Root cause:** `updateItem` allowed `item_type` changes on active/referenced items.

**Fix:** Reject `item_type` change when status is `active` or item is referenced by BOM / factory_spec / work_orders (`item_type_immutable` error). UI label maps updated.

**Tests:** `update-item.unit.test.ts` — active FG + BOM reference blocks type change.

**Migration:** none.

---

## Verification

```text
pnpm --filter web exec vitest run <7 wave-15 test files>  → 35/35 passed
pnpm --filter web exec tsc --noEmit                        → exit 0
pnpm --filter web run build                                → exit 0
```

## Fix round 1

DB-layer concurrency enforcement for adversarial review findings (N-20, N-22, N-23, N-47) plus RSC build blocker.

**Migrations:**
- **479** `479-bom-request-version-edit-concurrency-lock.sql` — per-(org, product) advisory xact lock in `bom_request_version_edit` with in-flight child recheck and unique_violation fallback.
- **480** `480-items-item-type-immutable-trigger.sql` — `items_is_item_type_mutable` + advisory-lock triggers on `items`, `bom_headers`, `bom_lines`, `factory_specs`, `work_orders`.
- **478** (amended, unmerged) — org-composite `supersedes_wip_definition_id` FK.

**App fixes:**
- Moved `EnsureBomVersionEditDraftResult` to non-server `shared.ts` (RSC build).
- `createBomDraft`: source/product identity check + `FOR UPDATE` on returned draft before child replacement.
- WIP clone-on-write: draft successor → archive predecessor → activate successor under row lock.
- `fetchEligibleFactorySpecUnderBindLock` shared by create-WO and update-WO (same protocol as recall/release).
- `updateItem` maps DB trigger `23514` to `item_type_immutable`.

**New pg tests:** `bom-request-version-edit-concurrency.pg.test.ts`, `factory-spec-bind-concurrency.pg.test.ts`, `update-item-type-freeze.pg.test.ts`, `wip-definition-supersession.pg.test.ts` (skip without `DATABASE_URL`).
