# HUNT — Production execution + WO lifecycle (hunt-fable)

Area: `lib/production/**`, `production/_actions/**`, WO consume/output/complete/cancel/close, corrections, mass-balance.
Method: read real code, traced flows, verified against dedupe (C001–C120 + LEDGER W1–W8). Every finding below has file:line + concrete failure scenario and is distinct from the canonical list.

| ID | Sev | file:line | one-line | why not in C001-C120 |
|----|-----|-----------|----------|-----------------------|
| NEW-P01 | P1 | complete-cancel-wo.ts:510-528 | `cancelWo` (completed→cancelled) reverses output WAC with NO `isWacExcluded` guard and applies fallback reversals — corrupts WAC for un-costed / no-snapshot outputs | C085/C087 fixed the *register/void* WAC paths; the cancel-completed reversal is a separate sibling caller that never got the guard |
| NEW-P02 | P1 | complete-cancel-wo.ts:477-588 | `cancelWo` (completed→cancelled) force-destroys output LPs with no `hasLpConsumptionOrChildren` guard and no void-first gate — zeroes inventory already consumed/repacked downstream, orphaning genealogy | The void-first gate (449-461) only runs for in_progress/paused; `voidWoOutput` has the children guard, cancel does not. Not a browser-audit finding |
| NEW-P03 | P2 | evaluate-closed-production-strict.ts:66-75 + register-output.ts:633-640 | Strict-close tolerance gate + mass-balance gate hardcode `c.uom = 'kg'`; a WO with zero kg-denominated consumption is *permanently blocked* from completion (needs supervisor override every time), while mass-balance silently passes | Distinct from C063 (WO UoM display). This is a completion-gate correctness/UoM defect in the strict evaluator |
| NEW-P03b | P3 | pause-resume-wo.ts:168-181 | `resumeWo` accepts negative `actualDurationMin` → `ended_at < started_at`; uncaught 23514/negative `duration_min` | Not covered by C079/C080 (downtime/complete happy path) |

---

## NEW-P01 — cancelWo double-/mis-reverses WAC on completed cancellation (P1)

`complete-cancel-wo.ts:508-528`. When a **completed** WO is cancelled, for every live output LP it does:

```ts
const wacReversal = computeWacReversalDelta({ extJsonb: output.ext_jsonb,
  fallbackQtyKg: output.qty_kg, fallbackValue: output.fallback_wac_value });
if (wacReversal.source === 'fallback') console.warn(...);
await upsertWac(ctx.client, { ... deltaQtyKg: wacReversal.deltaQtyKg, deltaValue: wacReversal.deltaValue ... });
```

The reversal is applied **unconditionally**. Contrast the sibling `voidWoOutput` (`corrections-actions.ts:1041-1059`) which guards:
`if (!isWacExcluded(original.ext_jsonb))` **and** only applies when `wacReversal.source === 'snapshot'` (fallback is skipped with a warn). `cancelWo` has neither guard.

Failure scenario (inputs → wrong result):
- Register a primary output whose lines were **un-costed** → `resolveOutputWacContribution` returns `excluded:'un_costed'`, ext_jsonb carries `wac_excluded` and **no** `wac_qty_kg` snapshot → **no WAC credit was ever booked**.
- Complete the WO, then cancel it. `computeWacReversalDelta` finds no snapshot → `source:'fallback'` → reverses `qty_kg * cost_per_kg`.
- `upsertWac` **subtracts** qty+value from `item_wac_state` that were never added → WAC average cost skewed, `total_qty_kg`/`total_value` can be driven toward/below zero (clamp masks it but the average is now wrong for that item).

Even for costed-but-no-snapshot outputs, the fallback basis (`cost_per_kg` standard cost) differs from the WAC-average value that was actually credited, so the reversal is quantitatively wrong. Root-cause fix: mirror `voidWoOutput` — skip when `isWacExcluded`, and skip/guard the `fallback` source.

## NEW-P02 — cancelWo destroys downstream-consumed / repacked output LPs (P1)

`complete-cancel-wo.ts:477-588`. The completed-branch selects affected output LPs with only `lp.status not in ('destroyed','consumed')` (491-497), then unconditionally sets `status='destroyed', quantity=0, reserved_qty=0` (577-587). It never checks whether the LP has been **partially consumed** downstream or has **child LPs** (genealogy repack/merge).

The void-first safety gate `loadLiveOutputLps` (449-461) that forces operators to void outputs before cancelling only runs for `in_progress`/`paused` — **not** for `completed`. And `voidWoOutput` enforces exactly this via `hasLpConsumptionOrChildren` (`corrections-actions.ts:332-351, 979`), which cancel bypasses.

Failure scenario:
- WO-A completes, output LP-X (100 kg) released to `available`.
- WO-B consumes 40 kg of LP-X → LP-X now `available`, quantity 60. A `wo_material_consumption` row and `lp_genealogy` edge reference LP-X.
- WO-A is cancelled (recall). Cancel selects LP-X (status `available`, not destroyed/consumed) and sets quantity=0, status=`destroyed`.
- Result: 60 kg of legitimate live inventory vanishes; LP-X's consumption ledger + genealogy now reference a destroyed parent; downstream WO-B's traceability is orphaned. No children/consumption guard fired.

## NEW-P03 — completion gates ignore non-kg consumption (P2)

`evaluate-closed-production-strict.ts:66-75` sums `sum(c.qty_consumed) where c.uom = 'kg'` only; `register-output.ts:637-640` (mass-balance) does the same. Genealogy allocation in the same output file explicitly handles `kg/g/lb`, so this is an internal inconsistency.

Failure scenario (a WO whose materials are all consumed in a non-kg UoM, e.g. `each`/`g`/`L`):
- `posted_consumption_kg` = 0.
- In `evaluateClosedProductionStrict`, `within_tolerance` requires `posted_consumption_kg > 0` → evaluates **false**.
- In `completeWo` (`complete-cancel-wo.ts:200-202`): `consumptionWithinTolerance = strictGate.within_tolerance !== false` → **false** → `yieldGateGreen=false` even with a green primary output.
- Every such completion is forced through `production.wo.override_yield` + CFR-21 e-sign (231-273) — a legitimate, perfectly-balanced non-kg WO can **never** complete normally.
- Meanwhile the mass-balance over-production warn/block (`evaluateMassBalanceGate`) returns `undefined` for the same WO (posted_consumption_kg==='0', line 664) — so over-production is silently un-flagged. The two gates disagree on the same non-kg WO.

Fix: convert consumption to kg via the UoM helper (as WAC/genealogy already do) instead of filtering `uom='kg'`.

## NEW-P03b — resumeWo accepts negative actualDurationMin (P3)

`pause-resume-wo.ts:168-181`. `actualDurationMin` is passed straight into `make_interval(mins => $2)` with no `>= 0` validation. A negative value sets `ended_at < started_at`; the generated `duration_min` column (or its CHECK) then yields a negative/invalid duration — an uncaught error propagating out of the txn rather than a clean `invalid_input`. Low severity (operator-correction field), but trivially guarded.

---

### Notes / non-findings (verified NOT bugs, to save re-hunting)
- `debitWac(siteId:null)` on consume vs `upsertWac(siteId:wo.site_id)` on output looked like a WAC site-split, but `item_wac_state` conflict key is `(org_id, item_id, currency_id)` — site_id is a non-key attribute (upsert-wac.ts:141-142), same row is hit/locked. Not a bug.
- `reverseConsumption` ordering (all ok:false gates before first write, throw-on-post-write-failure) is correct.
- `closeWo` / `completeWo` e-sign-before-transition atomicity (throw-to-rollback) is correct.
