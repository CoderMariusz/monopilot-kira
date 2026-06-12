# Reversibility Audit — MonoPilot Kira
**Date:** 2026-06-12  
**Scope:** All mutating surfaces across all shipped modules — actions, scanner routes, warehouse routes  
**Commit ref:** f26d46da (main, wave 7 closed)  
**Method:** static read of source code — no runtime execution

---

## §1 Executive Summary

**Total distinct mutating operations inventoried: 87**

Grouping by correctability posture today:

| Posture | Count | Notes |
|---|---|---|
| Correctable (EDIT-IN-PLACE while draft/unreferenced) | 19 | Master data, draft documents |
| Correctable (VOID/CANCEL — document not yet acted on) | 14 | PO/TO/WO/SO cancel paths exist |
| Partially correctable (TO cancel while in-transit, with partial-receive block) | 1 | cancelInTransitTransferOrder exists but refuses if any dest LP created |
| NOT correctable — ledger rows, no reversal | 30 | Consumption, output, waste, GRN receipt, stock moves, WO events, LP state history |
| NOT correctable — QA hold status changes (release is one-way) | 4 | quality_holds released → no un-release |
| NOT correctable — Shipping (SO shipped, BOL signed) | 5 | No return/reversal path |
| NOT correctable — NPD / Technical (released to factory, factory spec approval) | 6 | No recall/revert of factory release |
| Cosmetic / low-blast-radius (notes, names, dates on drafts) | 8 | Safe EDIT-IN-PLACE |

**Summary finding:** ~30 posted ledger operations are currently uncorrectable. The most operationally dangerous gaps are:
1. Consumption records (wo_material_consumption) — no counter-entry path
2. Output registrations (wo_outputs + output LP) — no void/storno path
3. Waste records (wo_waste_log) — no void path
4. GRN receipt lines (grn_items + created LP) — no cancellation/return path
5. TO partially-received state — cancel blocked but no reverse-receive path

---

## §2 Mutation Matrix by Module

### 2.1 Planning — Purchase Orders
**Source:** `/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| createPurchaseOrder | purchase_orders, purchase_order_lines | audit_log row | EDIT-IN-PLACE while draft | Draft is fully editable — no blocking references until grn_items link | S | No |
| transitionPurchaseOrderStatus → cancelled | purchase_orders.status | audit_log | VOID/CANCEL exists — state machine allows draft→cancelled, sent→cancelled, confirmed→cancelled, partially_received→cancelled | Existing cancel path works; needs reason_code field + header correction (supplier swap, delivery date) before 'sent' | S | Permission flag |
| transitionPurchaseOrderStatus → received | purchase_orders.status | none further | NOT CORRECTABLE once received (terminal state) | COUNTER-ENTRY: return GRN pattern (grn source_type='return') already modelled in schema | M | Owner decision: correction window |
| **GAP: no updatePurchaseOrder action** | — | — | Header fields (supplier, delivery date, currency) CANNOT be changed after creation | EDIT-IN-PLACE for draft/sent/confirmed, blocked once partially_received | S | No |
| **GAP: no addLine / deleteLine / updateLine actions** | — | — | PO lines are immutable post-creation | EDIT-IN-PLACE for draft; void line (qty→0) for sent | S | No |

### 2.2 Planning — Transfer Orders
**Source:** `/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts` (lines 269–723)

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| createTransferOrder | transfer_orders, transfer_order_lines | audit_log | EDIT-IN-PLACE while draft | Draft editable; no blocking references | S | No |
| transitionTransferOrderStatus draft→in_transit (ship) | license_plates.quantity (decrement), lp_state_history (shipped), stock_moves (transfer), transfer_order_line_lps | LP quantity locked | VOID/CANCEL exists: cancelInTransitTransferOrder restores source LPs and deletes un-received line_lp rows | GUARDED-CASCADE: partial-receive block at lines 595–601 is correct but there is no path to reverse already-received dest LPs | L | Owner decision: whether to allow partial reversal |
| transitionTransferOrderStatus in_transit→received | license_plates (new dest LP created, status=available), lp_state_history, stock_moves | Dest LP now pickable | NOT CORRECTABLE once received | COUNTER-ENTRY: create return-TO; dest LP depleted + source LP re-credited via adjustment stock_move | L | Owner decision |
| transitionTransferOrderStatus in_transit→cancelled (partial receive block) | Nothing if any dest_lp_id exists | — | REFUSED by server (correct) | Need a GUARDED-CASCADE reverse-receive: void dest LPs + re-credit source | L | Owner decision |
| **GAP: no TO header/line edit actions** | — | — | TO lines cannot be amended after creation | EDIT-IN-PLACE for draft only | S | No |

### 2.3 Planning — Work Orders (DRAFT / RELEASED)
**Source:** `/apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| createWorkOrder | work_orders, wo_materials, wo_operations | wo_status_history | EDIT-IN-PLACE — DRAFT editable | No edit action exists; only create + release + cancel | S | No |
| releaseWorkOrder | work_orders.status DRAFT→RELEASED, wo_status_history, uom_snapshot | Releases to scanner | VOID/CANCEL: cancelWo exists (RELEASED→CANCELLED) with reason_code | Existing cancel path works; need DRAFT edit action for planned qty/product/line | S | No |
| **GAP: no updateWorkOrder for DRAFT** | — | — | Cannot fix wrong product_id, planned_quantity, line assignment while still DRAFT | EDIT-IN-PLACE: allow changes to all fields while status=DRAFT | S | No |

### 2.4 Production — WO Execution Lifecycle
**Sources:** `/apps/web/lib/production/start-wo.ts`, `complete-cancel-wo.ts`, `pause-resume-wo.ts`, route handlers under `/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| startWo (RELEASED→IN_PROGRESS) | wo_executions, wo_events | Scanner now accepts this WO | VOID/CANCEL: cancelWo available | Cancel works; consider reason_code requirement | S | No |
| pauseWo / resumeWo | wo_executions.status, wo_events | — | Forward-fix only | No reversal needed (no inventory impact) | — | — |
| completeWo (IN_PROGRESS→COMPLETED) | wo_executions.status, wo_events, oee_snapshots | OEE written | NOT CORRECTABLE | GUARDED-CASCADE: re-open WO → uncomplete (complex; oee_snapshot already written) | L | Owner decision: re-open policy |
| cancelWo (any→CANCELLED) | wo_executions.status=cancelled, wo_events | Outbox event emitted; reservations noted but NOT released in current code | VOID only — cancelling an in-progress WO does not reverse consumption or output | GUARDED-CASCADE: cancel should check for recorded outputs + consumption; propose blocked if outputs exist unless overridden | M | Permission flag: production.wo.force_cancel_with_outputs |
| closeWo (COMPLETED→CLOSED) | wo_executions.status=closed, wo_events | Terminal | NOT CORRECTABLE | Re-open policy decision | L | Owner decision |

### 2.5 Production — Output Registration (scanner + desktop)
**Sources:**  
- Scanner POST: `/apps/web/app/api/production/scanner/wos/[id]/output/route.ts`  
- Desktop POST: `/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/outputs/route.ts`  
- Service: `/apps/web/lib/production/output/register-output.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| registerOutput | wo_outputs (INSERT), license_plates (new LP, status=received), lp_state_history (genesis), outbox event production.output.recorded | LP enters stock at received/pending; batch number generated (unique-per-year V-PROD-24) | NOT CORRECTABLE — no void/storno action exists | COUNTER-ENTRY: insert wo_outputs row with qty_kg = -(original qty), reason_code, e-sign; set original LP to 'quarantine'; GUARDED by: LP must not be in status consumed/shipped/allocated | M | Owner decision: e-sign required? time window? |
| **Owner priority item from brief** | | | **"Wrong output registration (qty/batch/expiry/product)"** | Above counter-entry covers qty/batch; wrong product requires void+re-register (different product_id = separate LP genealogy) | M | e-sign; BRCGS 7y retention |

**Blast radius if wrong:** FOOD-SAFETY (allergen profile snapshot attached to batch; wrong product_id could mean wrong allergen trace); STOCK INTEGRITY (LP in inventory with wrong product); MONEY (costing ledger downstream); GMP/BRCGS traceability.

### 2.6 Production — Consumption (scanner)
**Source:** `/apps/web/app/api/production/scanner/wos/[id]/consume/route.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| consume (POST) | wo_material_consumption (INSERT, ledger), license_plates.quantity (decremented), wo_materials.consumed_qty (incremented), scanner_audit_log | LP quantity reduced; FEFO flag recorded; over-consumption locked until approved | NOT CORRECTABLE — no reversal action | COUNTER-ENTRY: insert wo_material_consumption row with negated qty; restore LP quantity; re-decrement wo_materials.consumed_qty; LP must still be in same WO context (not yet in another WO consumption) | M | Owner decision: correction window, e-sign |
| **Owner priority item** | | | **"Wrong consume (qty/LP)"** | Counter-entry covers qty; wrong LP requires: (a) reverse-consume original LP, (b) consume correct LP | M | FEFO-adherence re-check on new LP |

**Blast radius:** STOCK INTEGRITY (LP balance wrong); GMP (FEFO audit trail corrupted); FOOD-SAFETY if allergen-different LP was consumed.

### 2.7 Production — Waste Recording (scanner + desktop)
**Source:** `/apps/web/lib/production/waste/record-waste.ts`, `/apps/web/app/api/production/scanner/wos/[id]/waste/route.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| recordWaste | wo_waste_log (INSERT, ledger), outbox production.waste.recorded | Feeds OEE/yield calculations; finance loss ledger | NOT CORRECTABLE — no void | COUNTER-ENTRY: insert wo_waste_log row with negated qty_kg, same category_id, reason_code | S | Owner decision: correction role, window |
| **Owner priority item** | | | **"Waste wrong"** | Counter-entry as above | S | — |

### 2.8 Warehouse — GRN Receipt (scanner)
**Source:** `/apps/web/lib/warehouse/scanner/receive-po.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| receiveScannerPoLine | grn_items (INSERT), license_plates (new LP, status=received), lp_state_history (genesis), purchase_orders.status updated | LP in stock; PO status rolled up | NOT CORRECTABLE — no GRN cancel/void action | VOID: cancel the grn_item row (status='cancelled') + set LP to 'returned' + insert lp_state_history reversal + decrement PO line received_qty + re-roll PO status. Guarded: LP must not have been put-away/consumed | M | Owner decision: over-receive window, QA inspection already opened? |
| **Owner priority items** | | | **"Receive wrong (qty/expiry/location)"** | qty: cancel line + new line with correct qty; expiry: LP update (no stock impact, just metadata); location: LP location update (already possible via putaway move) | S–M | — |
| **"Wrong supplier on a PO"** | — | — | purchase_orders.supplier_id cannot be changed after creation; supplier_id flows into grn.supplier_id | EDIT-IN-PLACE: allow supplier change while status=draft only | S | No |

### 2.9 Warehouse — Stock Moves (scanner: putaway, move, pick)
**Source:** `/apps/web/lib/warehouse/scanner/movement.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| moveScannerLp (putaway / transfer) | stock_moves (INSERT), license_plates.location_id (updated), lp_state_history (received→available on putaway) | LP available for FEFO pick | Partially correctable: moving to wrong location can be corrected by doing another move (no writes are immutable here) | FORWARD-FIX: do another putaway/move to correct location — this already works | S | No |
| pickScannerLp | stock_moves (INSERT, move_type=issue), license_plates.location_id | LP staged for production | FORWARD-FIX: move it back via putaway | S | No |

**Note:** stock_moves rows are append-only (no DELETE, status only in ('completed','cancelled')). A cancellation of a stock_move is modelled (status='cancelled') but no cancel action is implemented — all existing inserts use status='completed' hardcoded.

### 2.10 Transfer Order — Receive at Destination (desktop)
Covered in §2.2 above.

### 2.11 Quality — Holds
**Source:** `/apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| createHold | quality_holds, quality_hold_items, license_plates.qa_status=on_hold | Blocks consumption/output via holdsGuard | Partially: hold can be released | VOID/CANCEL: hold can be released (releaseHold action) | S | e-sign (release_signature_hash) |
| releaseHold | quality_holds.hold_status=released, quality_hold_items, license_plates.qa_status=released | LP re-enters FEFO | NOT CORRECTABLE — release is terminal; no un-release | COUNTER-ENTRY: new hold required; original release immutable (BRCGS audit requirement) | S | Owner decision: dual-sign on release |
| **wo_outputs.qa_status updates (output-qa-actions.ts)** | wo_outputs.qa_status | QA gate for WO completion | EDIT: status can be changed from PENDING→PASSED/FAILED, but FAILED→no undo | Owner decision: allow reversion with reason | S | Permission; e-sign |

### 2.12 Quality — Inspections
**Source:** `/apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| createInspection | quality_inspections | — | EDIT-IN-PLACE while pending | — | S | No |
| decidInspection (pass/fail) | quality_inspections.status, license_plates.qa_status | LP available or held | Limited: no un-decide once decided | COUNTER-ENTRY: new superseding inspection with audit trail | M | Owner decision; e-sign |

### 2.13 Quality — NCRs
| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| createNcr | ncr_reports | — | EDIT-IN-PLACE while open | — | S | No |
| closeNcr | ncr_reports.status=closed | — | NOT CORRECTABLE — no re-open | Owner decision: allow re-open by QA manager | S | Permission |

### 2.14 Shipping — Sales Orders
**Source:** `/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| createSalesOrder | sales_orders, sales_order_lines | — | EDIT-IN-PLACE while draft | — | S | No |
| transitionSalesOrderStatus → cancelled | sales_orders.status | inventory_allocations release | VOID/CANCEL: exists (state machine allows → cancelled from most states except delivered) | allocateInventory reverse (deallocate) not yet implemented | M | Permission |
| allocateInventory | inventory_allocations, license_plates.reserved_qty | LP reserved | COUNTER-ENTRY: deallocate; allocation cancel path exists in status machine | M | No |
| ship (manifested→shipped) | sales_orders.shippedAt, license_plates.status=shipped | Terminal stock event | NOT CORRECTABLE | COUNTER-ENTRY: return (GRN source_type='return') with GUARDED-CASCADE — modelled in schema but no action | L | Owner decision: RMA process |
| **Owner priority item: "wrong item line on SO"** | — | — | SO lines: no delete/update actions | EDIT-IN-PLACE for draft; void line for confirmed | S | No |

### 2.15 NPD — Factory Release
**Source:** `/apps/web/app/(npd)/builder/_actions/release-npd-project-to-factory.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| releaseNpdProjectToFactory | factory_specs.status→released_to_factory, factory_release_status | Work orders can be created against this product | NOT CORRECTABLE — no recall action | Owner decision: supersede with new factory spec version (versioning exists but 'recall' verb missing) | M | Owner decision |
| NPD gate approvals | gate_approvals | — | revertGate action exists in `/apps/web/app/(npd)/pipeline/_actions/revert-gate.ts` | EDIT-IN-PLACE via revert | S | Permission |

### 2.16 Technical — BOM / Items / Routings
**Source:** `/apps/web/app/[locale]/(app)/(modules)/technical/`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| BOM line create/delete/update | bom_lines | Referenced by WOs at release | EDIT-IN-PLACE: line-actions.ts has create/update/delete for draft BOMs; active BOMs cannot be edited (require new version) | Existing versioning pattern is correct | S | No |
| Factory spec approval chain | factory_specs.status, approval_chain | Blocks/allows WO release | Approval chain is clickable end-to-end; no rollback of 'approved_for_factory' | GUARDED-CASCADE: recall factory spec (status back to draft) if no WOs in RELEASED/IN_PROGRESS reference it | M | Permission; e-sign |
| Item creation/update | items | Referenced by WOs, BOMs, LPs | EDIT-IN-PLACE: full item edit exists; changes propagate on next WO creation | Existing EDIT-IN-PLACE is correct | S | No |

### 2.17 Maintenance — MWOs
**Source:** `/apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts`

| Action | Writes | Downstream effects | Today's correctability | Proposed mechanism | Effort | Decision-gated |
|---|---|---|---|---|---|---|
| createMwo | maintenance_work_orders | — | EDIT-IN-PLACE while open | — | S | No |
| completeMwo | maintenance_work_orders.status=completed | spare_parts_stock deduction (if implemented) | NOT CORRECTABLE | FORWARD-FIX: re-open action needed | S | No |

---

## §3 Reusable Primitives and a Shared Correction Framework

### 3.1 Existing building blocks

1. **`lp_state_history`** (schema: `/packages/db/schema/warehouse-waveb.ts` lines 29–79): append-only LP transition ledger. Every LP state change should go through here. `reason_code` + `reason_text` columns exist. `transaction_id` unique prevents double-reversals. Already used by putaway (movement.ts lines 793–824) and TO ship/receive/cancel.

2. **`stock_moves`** (schema: `/packages/db/schema/warehouse-waveb.ts` lines 203–263): 8 move types including `adjustment` and `return`. `adjustment` allows negative qty. `reason_code` + `approved_by` columns exist. All correction stock events should route through here.

3. **`wo_material_consumption`** (schema: `/packages/db/schema/production-execution.ts` lines 119–173): append-only ledger. `over_consumption_flag` + `over_consumption_reason_code` already pattern a correction approval chain. Counter-entry rows are natural here (negative qty_consumed).

4. **`e_sign_log`** (schema: `/packages/db/schema/e-sign.ts`): HMAC-signed intent + subject_hash + nonce. Already used by quality hold release (`release_signature_hash` in quality_holds). Can be required for any high-blast-radius correction.

5. **`audit_log`** (schema: `/packages/db/schema/audit-log.ts`): `before_state` / `after_state` jsonb, `retention_class`. All correction actions must write here.

6. **`outbox_events`**: All corrections that cross module boundaries should emit events (e.g. `production.output.voided`, `warehouse.grn.line_cancelled`).

7. **`reason_code` pattern**: Already present in wo_material_consumption (`over_consumption_reason_code`), lp_state_history (`reason_code`), quality_holds, stock_moves. The reason-code taxonomy needs extension for correction verbs.

8. **`scanner_audit_log`**: Idempotent replay via `client_op_id`. Any scanner-facing correction action must also have idempotency.

### 3.2 One shared correction framework proposal

Every posted-ledger correction should follow this atomic pattern:

```
correctLedgerEntry(ctx, {
  entityType,     // 'output' | 'consumption' | 'waste' | 'grn_line' | ...
  originalId,     // UUID of the entry being corrected
  reason,         // { code: string; text: string }
  eSign?,         // optional e-sign payload if policy requires
  guardFn,        // async function checking downstream references (blast radius guard)
})
```

Internally: verify original entry belongs to org; call guardFn; insert counter-row (or update metadata-only fields if no stock impact); write lp_state_history if LP affected; write stock_moves 'adjustment' if qty affected; write audit_log; write outbox event; commit.

The framework lives in a new file: `/apps/web/lib/corrections/correct-ledger-entry.ts`

---

## §4 Proposed Implementation Waves

### Wave R1 — Low-hanging fruit (S-effort, no e-sign, master data + drafts) — 2 Claude + 1 Codex
**Goal:** Fix all EDIT-IN-PLACE gaps for draft documents.

**Codex tasks (3–5 files each):**
- R1-C1: `updatePurchaseOrder` + `updatePurchaseOrderLine` + `deletePoLine` + `addPoLine` — writes: purchase_orders, purchase_order_lines + audit_log. Gate: status must be draft/sent. Files: actions.ts, po-form-data.ts + 1 migration for correct PK constraints.
- R1-C2: `updateTransferOrder` + `updateToLine` — same pattern as R1-C1 for TOs. Files: TO actions.ts, to-form-data.ts.
- R1-C3: `updateWorkOrder` for DRAFT WOs — allow product_id, planned_quantity, line, machine changes. Files: createWorkOrder.ts (split to create + update), shared.ts.

**Claude tasks:**
- R1-CL1: UI for PO header edit modal + line editor (EDIT-IN-PLACE on detail page, draft guard).
- R1-CL2: UI for WO edit modal on DRAFT status.

### Wave R2 — Counter-entry framework + waste/output voids (M-effort) — 2 Claude + 2 Codex
**Goal:** Void wrong output registrations and wrong waste entries.

**Codex tasks:**
- R2-C1: `correct-ledger-entry.ts` framework (lib/corrections/) — shared service, no UI. Files: correct-ledger-entry.ts + reason-codes migration.
- R2-C2: `voidWoOutput` action — inserts counter-entry wo_outputs row with negative qty, sets original LP to quarantine, emits production.output.voided outbox event, writes audit_log. Guard: LP status not consumed/shipped/allocated. Files: output/void-output.ts, route handler.
- R2-C3: `voidWasteEntry` action — inserts counter-entry wo_waste_log row. No LP impact. Files: waste/void-waste.ts, route handler.
- R2-C4: Migration for correction columns: `correction_of_id uuid references wo_outputs(id)`, same for wo_waste_log, wo_material_consumption.

**Claude tasks:**
- R2-CL1: Output void UI — "Void output" button on WO detail outputs tab, reason picker, e-sign prompt (if policy ON).
- R2-CL2: Waste void UI on WO waste tab.

### Wave R3 — Consumption reversal + GRN correction (M-effort) — 2 Claude + 3 Codex
**Goal:** Reverse wrong consumption; correct received GRN lines.

**Codex tasks:**
- R3-C1: `reverseConsumption` scanner API endpoint + service — counter wo_material_consumption, restore LP quantity, decrement wo_materials.consumed_qty, write stock_moves 'adjustment', write lp_state_history. Files: consume/reverse-consume.ts, route.ts.
- R3-C2: `cancelGrnLine` action — sets grn_item to cancelled, LP to returned, lp_state_history row, re-rolls PO status. Guard: LP must be in received/available status (not consumed/shipped). Files: warehouse/cancel-grn-line.ts, route.ts.
- R3-C3: `updateLpMetadata` action — allow correction of expiry_date, batch_number on a just-received LP (metadata only, no qty impact). Guarded: LP in received/available. Audit trail only. Files: warehouse/update-lp-metadata.ts.

**Claude tasks:**
- R3-CL1: Scanner UI for consume reversal (new scanner action tile or long-press on recent consumption).
- R3-CL2: Desktop GRN line cancel UI + LP metadata correction panel.

### Wave R4 — TO receive reversal + SO line corrections + factory spec recall (L-effort) — 2 Claude + 2 Codex
**Goal:** Higher complexity reversals requiring owner policy decisions.

**Codex tasks:**
- R4-C1: `reverseToReceiveLine` action — requires owner decision on correction scope. If approved: void dest LP (quarantine), credit source LP, reverse lp_state_history + stock_moves. Files: transfer-orders/reverse-receive.ts.
- R4-C2: `recallFactorySpec` action — revert factory_spec.status from released→draft when no WOs in RELEASED/IN_PROGRESS reference it. Files: factory-specs/recall-spec.ts.

**Claude tasks:**
- R4-CL1: TO detail "reverse received line" UI with dual-sign modal.
- R4-CL2: Factory spec recall button (technical module).

---

## §5 Open Questions for the Owner (Static Analysis Cannot Decide)

**Q1 — Correction permission family:** Should corrections require a separate role (e.g. `production.output.correct`, `warehouse.grn.correct`) or inherit from the existing write roles? This determines whether a line supervisor can self-correct or must escalate.

**Q2 — E-sign requirement:** Which corrections must carry an electronic signature (21 CFR Part 11 / BRCGS)? Minimum proposal: output void, consumption reversal, QA release reversal. Is waste void included?

**Q3 — Time window policy:** Should corrections be blocked after a time window (e.g. 24 hours, WO closed, period-closed)? This determines whether a "period close" concept is needed or corrections are always open.

**Q4 — Posted-immutability for financial reporting:** The finance module (migration 292) is early-stage. Once P&L is computed from wo_outputs and wo_waste_log, corrections must also update the financial ledger. Is a double-entry approach acceptable or is a restatement model preferred?

**Q5 — Receive-wrong-supplier:** When a PO is already received and the wrong supplier is on record, is the correction cosmetic (update supplier_id on existing records) or does it require a full GRN cancellation + re-receipt? This affects tax document validity.

**Q6 — TO partial-receive reverse:** The current code (transfer-orders/actions.ts lines 584–650) explicitly blocks cancel of a partially-received TO with the note "noted as a FOLLOW-UP". Is the expected behaviour: (a) always refuse cancel and force full receive + return-TO, or (b) allow reverse-receive of already-received lines with supervisor approval?

**Q7 — Scanner corrections UX:** Should consumption reversals be doable from the scanner (barcode-driven: scan the original consumption audit log entry?) or only from the desktop?

**Q8 — Output void blast radius when LP is already QA-released/allocated:** If an output LP has already been QA-released and reserved for a sales order, voiding the output should also deallocate the SO line and un-release the QA. Is this cascade acceptable or should void be blocked in this state (requiring shipment return instead)?

---

## Appendix A — Key File Paths Referenced

| Module | Key files |
|---|---|
| Production execution schema | `/packages/db/schema/production-execution.ts` |
| WO schema | `/packages/db/schema/work-orders.ts` |
| LP / GRN / stock_moves schema | `/packages/db/schema/warehouse-lp.ts`, `/packages/db/schema/warehouse-waveb.ts` |
| Quality holds schema | `/packages/db/schema/quality.ts` |
| Shipping schema | `/packages/db/schema/shipping.ts` |
| Consume route | `/apps/web/app/api/production/scanner/wos/[id]/consume/route.ts` |
| Output route | `/apps/web/app/api/production/scanner/wos/[id]/output/route.ts` |
| Output service | `/apps/web/lib/production/output/register-output.ts` |
| Waste service | `/apps/web/lib/production/waste/record-waste.ts` |
| GRN receive service | `/apps/web/lib/warehouse/scanner/receive-po.ts` |
| Warehouse movement service | `/apps/web/lib/warehouse/scanner/movement.ts` |
| TO actions (ship + receive + cancel) | `/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts` |
| PO actions | `/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts` |
| WO cancel service | `/apps/web/lib/production/complete-cancel-wo.ts` |
| WO release action | `/apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/releaseWorkOrder.ts` |
| QA holds action | `/apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts` |
| SO actions | `/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts` |
| e-sign schema | `/packages/db/schema/e-sign.ts` |
| Audit log schema | `/packages/db/schema/audit-log.ts` |
| WO waste log schema | `/packages/db/schema/production/wo-waste-log.ts` |
