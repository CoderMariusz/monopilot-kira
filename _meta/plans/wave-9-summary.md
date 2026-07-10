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
