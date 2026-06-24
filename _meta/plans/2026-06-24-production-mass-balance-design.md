# Production Mass-Balance / Yield / Leftover-Reweigh-Return — Gap Report + Target Design (2026-06-24)

Owner = 08-production (`wo_outputs`, `wo_material_consumption`, `wo_materials`). The entire owner-desired
loop is UNBUILT today. All findings adversarially verified `holds:true` against the live tree. Next mig = **335**.

## 1. CURRENT BEHAVIOR (evidence)
**Scenario A — consume 50kg, register 100kg output:** `registerOutput` validates ONLY qty>0 (V-PROD-03,
`register-output.ts:433-436`), a SOFT catch-weight warning (only weight_mode='catch', vs item.nominal_weight,
never blocks, `:467-500/:173-205`), WO-state, and quality-hold. It NEVER reads consumed input
(`loadConsumedLpIds:267-285` selects lp_id for genealogy only, not qty_consumed). → 100kg passes silently,
no alert/block. Desktop+scanner routes just forward. The over-consume gate exists only on CONSUME
(`consume-material-actions.ts:336-397`, vs BOM required_qty — opposite direction).

**Scenario B — consume 100kg, produce 20kg @ yield 90%, close:** consume decrements LP verbatim (no yield
divisor); `required_qty` = BOM-qty × planned, never output/yield. Complete = existence yield gate only. Close
(`close-wo.ts:48-140`) = e-sign + state transition + outbox, ZERO inventory logic. **→ 0kg returns to
available; the full 100kg stays consumed; LP sits at quantity=0/consumed.** No reweigh on move/putaway
(`MoveInput` has no weight field; difference silently ignored). Only return path = manual e-signed
`reverseConsumption` (full row, operator-picked). grep `reweigh|mass.?balance|expected_consumption|
return_to_stock|yield_loss` = ZERO hits.

**Yield lives but unread:** `bom_headers.yield_pct` (mig 090:16), `wo_operations.expected_yield_percent/actual_yield`
(176:260-262), `work_orders.yield_percent` GENERATED after-the-fact (176:67-75). None feed consume/output/close.

## 2. GAPS
1. No over-production / insufficient-input guard (output never references consumed input).
2. Expected consumption never computed as output/yield% (yield stored-but-unread).
3. No yield-based auto-release of un-used component on close (0kg returns, not ~78kg).
4. No reweigh-on-move/putaway (no `needs_reweigh` flag; physical-vs-record diff silently ignored).
5. No remainder-to-WO reconciliation (the ~3kg delta never auto-booked back).
6. Only de-consume = `reverseConsumption` (manual/e-signed/full-row — wrong shape for auto partial release).

## 3. TARGET DESIGN (ride the signed counter-entry rails from mig 293/297)
Mass identity per WO per component: `sum(wo_material_consumption.qty_consumed) == LP decrements that stuck`;
`expected = output_qty / (yield/100)`; `release = posted_consumption − expected` (when >0). Leftover credited
back to LP (status stays `available`, flagged `needs_reweigh`); scanner reweigh sets true weight; shrink delta
`(release − reweighed)` re-booked to WO. Net ledger balanced.

**Yield source (do NOT add a field — exists):** precedence `wo_operations.expected_yield_percent` → snapshot
`bom_headers.yield_pct` → 100%. Fix: `createWorkOrder.ts:179-211` snapshots yield (today born NULL).

**Schema (mig 335):** `wo_materials.yield_pct numeric(6,3) DEFAULT 100 CHECK(>0,<=100)` + `released_qty`;
reuse `wo_material_consumption.correction_of_id` (mig 297) for signed release rows + new reason codes
`yield_release`/`reweigh_shrink`; `license_plates.needs_reweigh bool + reweigh_origin_wo_id + reweigh_expected_qty`
(KEEP status='available' so it stays in v_inventory_available — gate the flag, not the status); new
`lp_reweigh_events(org_id,lp_id,wo_id,expected_qty,actual_qty,delta_qty,performed_by,performed_at,client_op_id)`.
All org_id/RLS app.current_org_id()/grant app_user/audit.

**Services:**
- **S3 output mass-balance alert** — `register-output.ts:440-458`: read net consumed for the WO's component(s),
  gross-up output by yield, two-tier (soft warn flag on outbox like `:598`; hard block above tenant
  `massbalance_threshold_pct`), both default 0=OFF. Advisory at output time (consume/output interleave).
- **S2 consume** — leave verbatim; only snapshot yield at WO creation.
- **S4 close auto-release** — `close-wo.ts:115-119` INSIDE the e-sign withOrgContext txn: per material
  `expected=consumed/(yield/100)`, `release=consumed−expected`; signed negative `wo_material_consumption`
  (`yield_release`); credit LP quantity + set `needs_reweigh`; `wo_materials.released_qty+=`. Reuse
  `restoreLicensePlate`/`lpRestoreTargetState` (corrections-actions.ts:686-701,681-684).
- **S5 scanner reweigh-on-move** — `movement.ts:67-73` add `reweighActualQty?`; `:117-210` select reweigh flags;
  `:430-474` on `needs_reweigh`+weight → set quantity, clear flag, insert `lp_reweigh_events`, call reconcile;
  `reweigh_required` typed return forces the prompt. move/putaway screens render weight field (reuse output
  screen's enterWeight). Prototype-parity gate.
- **S6 remainder-to-WO reconcile** — `delta=expected−actual`; `delta>0` (shrink) → positive `wo_material_consumption`
  (`reweigh_shrink`) + `released_qty-=delta`; `delta<0` → extra release. Same move txn, idempotent via client_op_id.

**Worked example (owner's numbers):** consume 100/produce 20/yield 90% → close: expected 22.22, release 77.78
(LP→77.78, needs_reweigh). Scanner reweigh 75 → delta 2.78 booked to WO. Net consumed = 25.00 ≈ true input;
75 returns to available. Balanced.

## 4. SLICES (ordered; S4+S6 = money-critical, separate /kira:review each)
S1 [schema mig 335] → S2 [yield snapshot createWorkOrder] → S3 [output alert, low-risk, ship first] →
S4 [close auto-release, HIGHEST RISK atomicity] → S5 [scanner reweigh UI+service] → S6 [remainder reconcile,
HIGH RISK ledger] → S7 [tests: unit + db:test net-consume invariant + E2E walk]. RED-first; capture real output.

## 5. OPEN OWNER DECISIONS (recommended defaults in parens — proceeding on these unless overridden)
- (a) Release on **close only** (recommended; complete is reversible) vs also on complete.
- (b) Multi-LP source release order = **FEFO-reverse** (newest-consumed credited first) — confirm.
- (c) Output mass-balance alert default = **warn-only** (threshold opt-in) vs hard-block.
