# Wave 9 — Production output & QA handshake integrity (summary)

Branch: `fix/wave9-production-qa`. No migrations added.

## Bug 1 — Caller-supplied output LP validation + quantity increment

**Root cause:** `registerOutput` accepted `lp_id` from the caller, posted a receipt `stock_moves` row, but only validated LP location implicitly and never incremented `license_plates.quantity` for supplied LPs.

**Fix:** Before any `wo_outputs` write, `validateAndLockSuppliedOutputLp` `SELECT … FOR UPDATE` locks the LP and enforces matching `product_id`, site, UoM, `status='received'`, `qa_status='pending'`, WO ownership, and non-terminal status. After the receipt move, `incrementSuppliedOutputLpQuantity` adds the output qty (SQL `numeric`).

**Tests:** `lib/production/output/__tests__/register-output-supplied-lp.test.ts` — wrong product rejected; consumed LP rejected; UoM mismatch rejected; quantity increment asserted.

## Bug 2 — Genealogy net consumed qty per parent

**Root cause:** `loadConsumedLpIds` grouped consumption rows without netting reversals; every parent received genealogy `qty` equal to the full output quantity.

**Fix:** `loadConsumedLpContributions` sums `qty_consumed` per `lp_id` (including negative reversal rows), excludes net ≤ 0 parents, and writes `lp_genealogy.qty` from each parent's net contribution.

**Tests:** `lib/production/output/__tests__/register-output-genealogy-net-consumed.test.ts` — fully reversed parent excluded; per-parent qty equals net consumed, not total output.

## Bug 3 — WO output inspection pass must transition `wo_outputs.qa_status`

**Root cause:** `submitInspectionDecision` for `wo_output` + `pass` called `releaseLpQaForContext` only, leaving `wo_outputs.qa_status` at `PENDING`.

**Fix:** New production-owned `transitionWoOutputQaForContext` (`lib/production/output/transition-output-qa.ts`) atomically sets `wo_outputs.qa_status` to `PASSED`/`FAILED` and applies the linked LP QA/lifecycle side-effect. Quality calls this helper; `releaseWoOutputQa` delegates to the same core.

**Tests:** `lib/production/output/__tests__/transition-output-qa.test.ts`; updated `quality/_actions/__tests__/inspection-actions.test.ts` wo_output pass case asserts `wo_outputs` update + LP release in one flow.

## Bug 4 — Hold dedup scoped to originating event

**Root cause:** `createCcpDeviationHoldIfMissing` and `createInspectionHoldIfMissing` treated any active hold on `(reference_type, reference_id)` as satisfying a new safety event.

**Fix:** Existence checks now require matching `reason_free_text` — CCP holds include `monitoring_log_id`; inspection holds include `inspectionId`. Unrelated holds on the same WO/LP no longer suppress new event holds.

**Tests:** `quality/__tests__/haccp-actions.test.ts` — unrelated WO hold does not block new CCP hold; `quality/_actions/__tests__/inspection-actions.test.ts` — unrelated LP hold does not block new inspection hold; S2 idempotency tests updated for same-event reason matching.

## Gates

```text
pnpm --filter web exec tsc --noEmit  # clean
pnpm exec vitest run (6 touched test files from apps/web)  # 65 passed
```

## Fix round 1

Adversarial Codex review follow-up on `fix/wave9-production-qa`.

### Bug 2 — genealogy double-count across multiple outputs

**Fix:** `allocateGenealogyContributionsForOutput` allocates each parent's net consumed proportionally to this output's share of total WO output, subtracts genealogy already attributed to prior child LPs, caps by remaining parent qty and (for mass UoMs) this output qty. Genealogy edges label qty with the parent **consumption** UoM; mismatched consumption/output UoM is rejected.

**Tests:** `register-output-genealogy-net-consumed.test.ts` — two-output regression (100 kg parent, two 50 kg outputs → summed edges = 100).

### Bug 1 — supplied-LP site/warehouse validation

**Fix:** `validateAndLockSuppliedOutputLp` now locks and validates `warehouse_id` + `site_id`; rejects null site on site-scoped WOs and warehouse mismatch vs the WO output destination; stock moves use the locked LP's `site_id`. `wo_id` null remains allowed for internal reuse; non-null conflicting `wo_id` is rejected.

**Tests:** `register-output-supplied-lp.test.ts` — warehouse mismatch, null site, different-WO rejection, null-`wo_id` reuse allowed, stock move uses locked LP site.

### Bug 3 — hold-active path commits PASSED without LP release

**Fix:** `transitionWoOutputQaForContext` checks `assertNoActiveHoldForLp` **before** writing `wo_outputs.qa_status`; active hold returns `{ ok: false, reason: 'quality_hold_active' }` with no partial commit.

**Tests:** `transition-output-qa.test.ts` — active hold leaves output `PENDING` and skips LP update.

### Canonical ownership — Quality hold/release → production API

**Fix:** `applyWoOutputHoldForContext` + `restoreWoOutputsAfterWoHoldReleaseForContext` in `transition-output-qa.ts`; `hold-actions.ts` routes WO hold create/release through these (W3 snapshot/restore semantics unchanged).

**Tests:** `transition-output-qa.test.ts` — snapshot/restore hold helpers.

### Gates (fix round 1)

```text
pnpm --filter web exec tsc --noEmit  # clean
pnpm --filter web exec vitest run lib/production/output/__tests__/*.test.ts quality/__tests__/haccp-actions.test.ts quality/_actions/__tests__/inspection-actions.test.ts  # 69 passed
```

## Fix round 2

Codex re-review follow-up — remaining Bug 2 genealogy gaps.

### WO-level genealogy serialization

**Fix:** `allocateGenealogyContributionsForOutput` now acquires `pg_advisory_xact_lock(hashtext(woId || '::genealogy'))` before reading `already_attributed` or inserting edges, serializing ALL output registrations for a WO (not per output type). The `least(...remaining...)` cap is enforced under this lock as an atomic invariant.

**Tests:** `register-output-genealogy-net-consumed.test.ts` — WO-level lock assertion; different-output-type cap (primary 30 kg + by_product 70 kg against 50 kg parent net → summed edges = 50). `register-output-genealogy.pg.test.ts` — concurrent different-output-type registration on real Postgres.

### Mixed parent-consumption UoM rejection

**Fix:** Before allocation, query parents with `count(distinct mc.uom) > 1` and throw `uom_mismatch`. The `parent_net` CTE also requires `count(distinct mc.uom) = 1` — no silent `sum(qty)` under `min(uom)`.

**Tests:** mock mixed-UoM rejection; `register-output-genealogy.pg.test.ts` mixed kg+lb rejection + PREPARE smoke on production CTE SQL.

### Gates (fix round 2)

```text
pnpm --filter web exec tsc --noEmit  # clean
pnpm --filter web exec vitest run lib/production/output/__tests__/register-output-genealogy-net-consumed.test.ts lib/production/output/__tests__/register-output-genealogy.pg.test.ts  # green
```

