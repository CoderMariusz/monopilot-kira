# Purchasing - tester how-to guide

> Per-module tester guide for the PURCHASING flow as implemented today. Routes are
> written without the `[locale]` prefix; use `/<locale>/...` in the browser, for
> example `/en/planning/purchase-orders`.
>
> Purchasing is not a single route group in this checkout. The live flow spans:
> supplier master and PO/TO origination in Planning, PO receipt into GRNs in
> Warehouse and the scanner PWA, and receipt/transfer corrections on the GRN/TO
> detail screens. The requested `apps/web/app/[locale]/(app)/(modules)/purchasing`
> and `.../(modules)/inventory` directories do not exist in this tree.

---

### Section 1: Function Inventory

| Action | What it does | Page / Route | DB table(s) touched | Reverse / correction path | Draft-only? |
|---|---|---|---|---|---|
| `listSuppliers` (actions.ts) | Lists suppliers with status/search filters. | `/planning/suppliers` | reads `suppliers` | Read-only. | No |
| `getSupplier` (actions.ts) | Loads one supplier detail. | `/planning/suppliers/[id]` | reads `suppliers` | Read-only. | No |
| `createSupplier` (actions.ts) | Creates a supplier master record. | `/planning/suppliers?new=1` | writes `suppliers`, `audit_events` | Soft-delete/status change through `transitionSupplierStatus`; no hard delete. | No |
| `transitionSupplierStatus` (actions.ts) | Moves supplier between `active`, `inactive`, `blocked`. | `/planning/suppliers/[id]` | writes `suppliers`, `audit_events` | Transition back to `active`; preserves history. | No |
| `listPurchaseOrders` (actions.ts) | Lists PO headers, archive window and supplier labels. | `/planning/purchase-orders` | reads `purchase_orders`, `suppliers`, `org_document_settings` | Read-only. | No |
| `getPurchaseOrder` (actions.ts) | Loads PO header and lines with non-cancelled GRN received qty. | `/planning/purchase-orders/[id]` | reads `purchase_orders`, `purchase_order_lines`, `items`, `suppliers`, `grns`, `grn_items` | Read-only. | No |
| `createPurchaseOrder` (actions.ts) | Creates PO header and lines; auto-numbers when blank. | `/planning/purchase-orders?new=1` | writes `purchase_orders`, `purchase_order_lines`, `audit_events`, reads `org_document_settings` | Cancel with `transitionPurchaseOrderStatus(...,'cancelled')` before active receipts; edit while draft. | No |
| `updatePurchaseOrder` (actions.ts) | Edits supplier, expected delivery, currency and notes. | `/planning/purchase-orders/[id]` | writes `purchase_orders`, `audit_events`; reads `suppliers` when supplier changes | Edit again while `draft`; server guard requires `status='draft'`. | Yes |
| `addPurchaseOrderLine` (actions.ts) | Appends one PO line and assigns next `line_no`. | `/planning/purchase-orders/[id]` | writes `purchase_order_lines`, `audit_events`; reads `purchase_orders`, `items` | `deletePurchaseOrderLine`; server guard requires `status='draft'`. | Yes |
| `updatePurchaseOrderLine` (actions.ts) | Edits line qty, UoM and unit price. | `/planning/purchase-orders/[id]` | writes `purchase_order_lines`, `audit_events`; reads `purchase_orders`, `purchase_order_lines` | Edit again or delete while `draft`; server guard requires `status='draft'`. | Yes |
| `deletePurchaseOrderLine` (actions.ts) | Deletes one PO line and renumbers remaining lines. | `/planning/purchase-orders/[id]` | deletes/writes `purchase_order_lines`, writes `audit_events`; reads `purchase_orders` | `addPurchaseOrderLine`; refused for the last line (`last_line`) and non-draft POs. | Yes |
| `reopenPurchaseOrder` (actions.ts) | Moves `sent -> draft` if no GRN rows exist. | `/planning/purchase-orders/[id]` | writes `purchase_orders`, `audit_events`; reads `grn_items`, `grns`, `purchase_order_lines` | Forward again with Submit; refused unless state is `sent` and no receipt rows exist (`po_has_receipts`). | No |
| `transitionPurchaseOrderStatus` (actions.ts) | Applies PO status machine: `draft -> sent`, `sent -> draft/confirmed`, `confirmed -> partially_received/received`, cancel paths. | `/planning/purchase-orders/[id]` | writes `purchase_orders`, `audit_events`; reads `grn_items`, `grns`, `purchase_order_lines` for cancel guard | Cancel is terminal; active receipts block cancel (`po_has_receipts`). Receipt mistakes reverse at GRN-line level. | No |
| `listPoSuppliers` (po-form-data.ts) | Active suppliers for the PO supplier select. | `/planning/purchase-orders`, `/planning/purchase-orders/[id]` | reads `suppliers` via `listSuppliers` | Read-only. | No |
| `searchPoItems` (po-form-data.ts) | Item picker for purchasable physical goods. | PO create/edit line modals | reads `items` via `searchItems` | Read-only. | No |
| `listPoUnits` (po-form-data.ts) | Active UoM options for PO lines. | PO create/edit line modals | reads `unit_of_measure` | Read-only. | No |
| `listPurchaseOrderLineCounts` (po-form-data.ts) | Counts PO lines for the list. | `/planning/purchase-orders` | reads `purchase_order_lines` | Read-only. | No |
| `createExportJob` (create-export-job.ts) | Exports filtered PO list as CSV and logs export job. | `/planning/purchase-orders` | reads via `listPurchaseOrders`, `purchase_order_lines`; writes `import_export_jobs` | Export-only; no reverse. | No |
| `validatePoImport` (import-po.ts) | Dry-runs PO CSV rows. | PO import hub/action seam | reads `suppliers`, `items`, `unit_of_measure` | Validation only. | No |
| `commitPoImport` (import-po.ts) | Creates draft POs from valid import rows and logs import job. | PO import hub/action seam | writes `purchase_orders`, `purchase_order_lines`, `import_export_jobs`, `audit_events`; reads suppliers/items/UoM/existing POs | Cancel each created PO while allowed; imported POs are draft. | No |
| `listScannerPurchaseOrders` (receive-po.ts) | Lists open POs for scanner receiving. | `GET /api/warehouse/scanner/pos`, `/scanner/receive-po` | reads `purchase_orders`, `suppliers`, `purchase_order_lines`, `grn_items` | Read-only. | No |
| `getScannerPurchaseOrder` (receive-po.ts) | Loads one open PO and lines for scanner receiving. | `GET /api/warehouse/scanner/pos/[id]`, `/scanner/receive-po/[poId]` | reads `purchase_orders`, `suppliers`, `purchase_order_lines`, `items`, `grn_items` | Read-only. | No |
| `receiveScannerPoLine` (receive-po.ts) | Receives a PO line: creates/uses draft day-GRN, inserts GRN line, mints LP, writes LP history/outbox/audit, optional QC inspection, and rolls PO status. | `POST /api/warehouse/scanner/receive-line`, `/scanner/receive-po/[poId]/[lineId]` | writes `grns`, `grn_items`, `license_plates`, `lp_state_history`, `outbox_events`, `quality_inspections`, `purchase_orders`, `scanner_audit_log`; reads `purchase_order_lines`, `purchase_orders`, `items`, `warehouses`, `locations`, `tenant_variations` | `cancelGrnLine`; guard: LP must be cancellable, receipt line not already cancelled. | No |
| `listGrns` (grn-actions.ts) | Lists GRN headers. | `/warehouse/grns` | reads `grns`, `suppliers`, `warehouses` | Read-only. | No |
| `getGrnDetail` (grn-actions.ts) | Loads GRN header, lines, LP links and cancellation flags. | `/warehouse/grns/[grnId]` | reads `grns`, `grn_items`, `items`, `license_plates`, `suppliers`, `warehouses` | Read-only; line correction via `cancelGrnLine`. | No |
| `releaseLpQa` (lp-qa-actions.ts) | QA releases/rejects a pending received LP; release promotes `received -> available`, reject promotes `received -> blocked`. | `/warehouse/grns/[grnId]` | writes `license_plates`, `lp_state_history`, `outbox_events` | One-way pending-only decision; no built unrelease action. | No |
| `cancelGrnLine` (receipt-corrections-actions.ts) | Cancels one GRN line, voids its LP to `returned`, zero qty/reserved qty, and records audit/history. | `/warehouse/grns/[grnId]` | writes `license_plates`, `grn_items`, `lp_state_history`, `audit_events`; reads `wo_material_consumption`, child `license_plates` | This is the PO receipt reverse path; guard: line not already cancelled, LP `received|available`, QA `pending|released`, no reserved qty, LP qty equals receipt qty, no children/consumption. | No |
| `updateLpMetadata` (receipt-corrections-actions.ts) | Corrects LP expiry/batch metadata. | License plate correction surface; referenced from GRN/LP flows | writes `license_plates`, `lp_state_history`, `audit_events` | Edit again; refused for terminal/returned LPs. | No |
| `listTransferOrders` (actions.ts) | Lists TO headers with archive window. | `/planning/transfer-orders` | reads `transfer_orders`, `org_document_settings` | Read-only. | No |
| `getTransferOrder` (actions.ts) | Loads TO header and lines including received destination LP links. | `/planning/transfer-orders/[id]` | reads `transfer_orders`, `transfer_order_lines`, `items`, `transfer_order_line_lps`, `license_plates` | Read-only. | No |
| `createTransferOrder` (actions.ts) | Creates TO header and lines; auto-numbers when blank. | `/planning/transfer-orders?new=1` | writes `transfer_orders`, `transfer_order_lines`, `audit_events`, reads `org_document_settings` | Cancel while draft; edit while draft. | No |
| `updateTransferOrder` (actions.ts) | Edits source/destination warehouses, scheduled date, notes. | `/planning/transfer-orders/[id]` | writes `transfer_orders`, `audit_events`; reads `warehouses` | Edit again while `draft`; server guard requires `status='draft'`. | Yes |
| `addTransferOrderLine` (actions.ts) | Appends TO line. | `/planning/transfer-orders/[id]` | writes `transfer_order_lines`, `audit_events`; reads `transfer_orders`, `items` | `deleteTransferOrderLine`; server guard requires `status='draft'`. | Yes |
| `updateTransferOrderLine` (actions.ts) | Edits TO line quantity/UoM. | `/planning/transfer-orders/[id]` | writes `transfer_order_lines`, `audit_events`; reads `transfer_orders`, `transfer_order_lines` | Edit again or delete while `draft`; server guard requires `status='draft'`. | Yes |
| `deleteTransferOrderLine` (actions.ts) | Deletes TO line and renumbers. | `/planning/transfer-orders/[id]` | deletes/writes `transfer_order_lines`, writes `audit_events`; reads `transfer_orders`, `transfer_order_lines` | `addTransferOrderLine`; refused for final line (`last_line`) and non-draft TOs. | Yes |
| `transitionTransferOrderStatus` (actions.ts) | Applies TO status machine. `draft -> in_transit` ships FEFO source LPs; `in_transit/partially_received -> received` mints destination LPs; cancel can restore unreceived in-transit picks. | `/planning/transfer-orders/[id]` | writes `transfer_orders`, `transfer_order_line_lps`, `license_plates`, `lp_state_history`, `stock_moves`, `audit_events`; reads source/dest LPs and TO lines | Cancel direct is refused if destination LPs already exist; reverse received lines first with `reverseToReceiveLine`. | No |
| `listTransferWarehouses` (to-form-data.ts) | Warehouse options for TO from/to selects. | `/planning/transfer-orders`, `/planning/transfer-orders/[id]` | reads `warehouses` | Read-only. | No |
| `listTransferOrderLineCounts` (to-form-data.ts) | Counts TO lines for the list. | `/planning/transfer-orders` | reads `transfer_order_lines` | Read-only. | No |
| `listTransferUnits` (to-form-data.ts) | Active UoM options for TO lines. | TO create/edit line modals | reads `unit_of_measure` | Read-only. | No |
| `searchTransferItems` (to-form-data.ts) | Item picker for transfer lines. | TO create/edit line modals | reads `items` | Read-only. | No |
| `validateToImport` (import-to.ts) | Dry-runs TO import rows. | TO import action seam | reads `warehouses`, `items`, `unit_of_measure` | Validation only. | No |
| `commitToImport` (import-to.ts) | Creates draft TOs from valid import rows and logs import job. | TO import action seam | writes `transfer_orders`, `transfer_order_lines`, `import_export_jobs`, `audit_events`; reads warehouses/items/UoM/existing TOs | Cancel/edit each created TO while draft. | No |
| `canReverseTransferReceipt` (reverse-receive.ts) | Server probe for whether to enable Reverse receipt. | `/planning/transfer-orders/[id]` | reads `user_roles`, `roles`, `role_permissions` | Read-only. | No |
| `reverseToReceiveLine` (reverse-receive.ts) | Reverses one received TO line under e-sign: returns source qty, voids destination LP, deletes link, rerolls TO status. | `/planning/transfer-orders/[id]` | writes `license_plates`, `transfer_order_line_lps`, `lp_state_history`, `stock_moves`, `transfer_orders`, `audit_events`, `outbox_events`, `e_sign_log`; reads allocations/shipments/consumption blockers | This is the TO receive reverse path; guard: full destination LP qty only, no reserved/allocated/shipped/consumed blockers, e-sign required. | No |
| `consumeTransferReceiveReversalEvent` (reverse-receive.ts) | No-op consumer acknowledgement for the reversal outbox contract. | Outbox/event consumer seam | reads event payload only | Not user-triggered; returns handled true/false. | No |

### Section 2: User How-To (Tester Walkthroughs)

1. Create a supplier
   1. Go to `/planning/suppliers`.
   2. Click **New supplier**.
   3. Fill **Supplier code \***, **Name \***, **Currency (ISO-4217) \***, **Default lead time (days) \*** and **Status \***. Optional fields are **Email**, **Phone (E.164)**, **Country (ISO-3166)** and **Notes**.
   4. Click **Create supplier**. The action is `createSupplier` (actions.ts). The new row starts in the selected `active`, `inactive` or `blocked` state.
   5. To soft-delete or restore, open `/planning/suppliers/[id]` and use **Deactivate (soft)**, **Block** or **Activate**. The action is `transitionSupplierStatus` (actions.ts).

2. Create a PO, add lines and submit
   1. Go to `/planning/purchase-orders` or open `/planning/purchase-orders?new=1`.
   2. Click **Create PO**.
   3. In **Create purchase order**, leave **PO number** blank for auto-numbering or enter one manually. Pick **Supplier**, optionally set **Expected delivery**, **Currency** and **Notes**.
   4. Under **Lines**, click **+ Add line**. Use **+ Add item** / **Search items**, set **Qty**, **UoM** and **Unit price**. Repeat for additional lines.
   5. Click **Create PO**. The PO is created as `draft` by `createPurchaseOrder` (actions.ts).
   6. Open the PO detail. While it is draft, **Edit order**, **+ Add line**, **Edit** and **Delete** are available and call the draft-only edit actions (actions.ts).
   7. In the **Status** panel, click **Submit** to move `draft -> sent`. From `sent`, testers can click **Reopen to draft**, **Confirm** or **Cancel PO**. From `confirmed`, the UI also exposes **Mark partially received** and **Mark received**, but normal stock receiving should use the scanner/GRN path below because those PO buttons only change PO status.

3. Receive a PO via scanner
   1. Log into the scanner and open `/scanner/receive-po`.
   2. On **Receive PO**, use **Scan PO number** (`PO-XXXX or type...`) or tap an open PO. The list comes from `listScannerPurchaseOrders` (receive-po.ts) through `GET /api/warehouse/scanner/pos`.
   3. On `/scanner/receive-po/[poId]`, choose a PO line.
   4. On `/scanner/receive-po/[poId]/[lineId]`, fill **Batch / serial**, **Best before**, optional **Destination location**, and **Quantity**.
   5. Click **Receive**. The route `POST /api/warehouse/scanner/receive-line` calls `receiveScannerPoLine` (receive-po.ts), creates the GRN line and LP, and rolls the PO to `partially_received` or `received`.
   6. If the receipt exceeds ordered quantity but stays within 10%, the UI shows **Over-receive**. The server hard-caps received total at 110% of ordered (`over_receive_cap`). If QC inspection is required, the UI shows **QC inspection required** and the LP stays pending.
   7. After success, use **Print label** if available, **Next PO line**, or **Back to PO list**.

4. Receive a PO via desktop / GRN
   1. There is no separate desktop GRN receive form in the files scanned. Desktop `/warehouse/grns` is a read/correction surface for receipts created by the scanner/shared receive transaction.
   2. To inspect the receipt, go to `/warehouse/grns`, search by **Search GRN#, supplier...**, then open the GRN number.
   3. On `/warehouse/grns/[grnId]`, use **Receipt lines**, **LP created**, **Print labels**, **Record temp** and **Release QC** as applicable. `releaseLpQa` (lp-qa-actions.ts) moves a pending LP to `available/released` or `blocked/rejected`.
   4. For an actual desktop receipt test today, drive the scanner receive route first, then verify the created GRN and LP on the desktop GRN detail.

5. Correct / cancel a received GRN line
   1. Go to `/warehouse/grns/[grnId]`.
   2. On a non-cancelled receipt line, click **Cancel receipt...**.
   3. In **Cancel receipt line {line}**, choose **Reason**: **Entry error**, **Wrong quantity**, **Wrong batch / lot**, **Wrong product** or **Other**. Add **Note** if needed.
   4. Click **Cancel receipt**. The action is `cancelGrnLine` (receipt-corrections-actions.ts).
   5. Expected result: the line is badged **Cancelled**, the LP is set to `returned` with quantity `0`, and the line no longer contributes to PO received quantity. If the LP has moved, been reserved/consumed, or has children, the action returns `lp_not_cancellable` and testers must use a stock adjustment instead.

6. Create and receive a Transfer Order (TO)
   1. Go to `/planning/transfer-orders` or open `/planning/transfer-orders?new=1`.
   2. Click **Create TO**.
   3. In **Create transfer order**, leave **TO number** blank for auto-numbering or enter one manually. Pick **From warehouse** and **To warehouse**; they must differ. Optionally fill **Scheduled date** and **Notes**.
   4. Under **TO lines**, click **Add line**, use **Select product** / **Search products**, set **Qty** and **UoM**, then click **Save & Plan**. The action is `createTransferOrder` (actions.ts), and the new TO is `draft`.
   5. Open `/planning/transfer-orders/[id]`. Draft TOs expose **Edit order**, **+ Add line**, **Edit** and **Delete**.
   6. In **Status actions**, click **Ship** to move `draft -> in_transit`. This calls `transitionTransferOrderStatus` (actions.ts), FEFO-picks released source LPs, decrements source quantities and writes transfer stock moves.
   7. Click **Receive** to move `in_transit -> received`. The same action mints destination LPs at the destination warehouse default location and links them to the TO lines.
   8. To correct a received TO line, click **Reverse receipt...**, choose **Reason**, enter **E-sign PIN or account password**, then click **Reverse receipt**. The action is `reverseToReceiveLine` (reverse-receive.ts).

### Section 3: Reverse / Correction Map

#### PO

| State | Allowed operations | How to trigger | Result |
|---|---|---|---|
| `draft` | Edit header, add/edit/delete lines, Submit, Cancel PO | **Edit order**, **+ Add line**, **Edit**, **Delete**, **Submit**, **Cancel PO** on `/planning/purchase-orders/[id]` | Draft edits mutate PO tables. Submit sets `sent`. Cancel sets terminal `cancelled`. |
| `sent` | Reopen, Confirm, Cancel PO | **Reopen to draft**, **Confirm**, **Cancel PO** | Reopen sets `draft` only if no GRN rows exist. Confirm sets `confirmed`. Cancel sets terminal `cancelled` if no active receipts. |
| `confirmed` | Mark partially received, Mark received, Cancel PO; real receiving via scanner | **Mark partially received**, **Mark received**, **Cancel PO**, or scanner **Receive** | Status buttons only mutate PO status. Scanner receive creates GRN/LP and rolls status. Cancel is blocked when active receipts exist. |
| `partially_received` | Mark received, Cancel PO if no active receipts | **Mark received**, **Cancel PO** | Received is terminal. Cancel is blocked if active GRN receipts exist; cancel GRN lines first. |
| `received` | None on PO header | None | Terminal; reverse receipt lines at GRN-line level. |
| `cancelled` | None | None | Terminal; create a new PO if cancelled by mistake. |

#### PO line

| State | Allowed operations | How to trigger | Result |
|---|---|---|---|
| PO `draft` | Add, edit, delete | **+ Add line**, **Edit**, **Delete** | Writes `purchase_order_lines`; delete renumbers lines and refuses the last line. |
| PO not `draft` | View only | Detail table | Server edit actions return `invalid_state`; use sent->draft reopen if eligible. |
| Received line | Correct receipt, not PO line | **Cancel receipt...** on GRN detail | Cancels the GRN line and voids the LP; PO received qty rollup drops cancelled line. |

#### GRN

| State | Allowed operations | How to trigger | Result |
|---|---|---|---|
| `draft` | View lines, release/reject LP QA, print labels, record temp, cancel individual lines | `/warehouse/grns/[grnId]` actions | Line/LP operations update related LP or quality/correction tables. |
| `completed` | View lines | `/warehouse/grns/[grnId]` | No complete action was found to create this state from the UI/action files. |
| `cancelled` | View only | `/warehouse/grns/[grnId]` | Header-level cancel action was not found; line cancel affordances are hidden for cancelled GRNs. |

#### GRN line

| State | Allowed operations | How to trigger | Result |
|---|---|---|---|
| Active line with cancellable LP | Cancel receipt line | **Cancel receipt...** -> **Cancel receipt** | `grn_items.cancelled_at` is set; LP goes `returned`, qty `0`; audit/history written. |
| Already cancelled | None | Detail row badge **Cancelled** | Cancel affordance hidden; action would return `already_cancelled`. |
| LP moved/reserved/consumed/has children or qty mismatch | No line cancel | **Cancel receipt...** returns error | `lp_not_cancellable`; use stock adjustment or downstream correction. |

#### TO

| State | Allowed operations | How to trigger | Result |
|---|---|---|---|
| `draft` | Edit header/lines, Ship, Cancel | **Edit order**, **+ Add line**, **Edit**, **Delete**, **Ship**, **Cancel** | Ship FEFO-picks source LPs and sets `in_transit`; cancel is terminal. |
| `in_transit` | Receive, Cancel if no destination LPs exist | **Receive**, **Cancel** | Receive mints destination LPs and sets `received`. Cancel restores unreceived source picks. |
| `partially_received` | Receive remainder, Cancel only after received LPs are reversed | **Receive**, **Cancel** | Cancel refuses when destination LPs still exist. |
| `received` | Reverse individual received lines | **Reverse receipt...** | `reverseToReceiveLine` voids destination LP, credits source LP and rerolls status. |
| `cancelled` | None | None | Terminal. |

#### Supplier

| State | Allowed operations | How to trigger | Result |
|---|---|---|---|
| `active` | Deactivate or block | **Deactivate (soft)**, **Block** on `/planning/suppliers/[id]` | Supplier remains in history; active-only PO selector no longer lists inactive/blocked suppliers. |
| `inactive` | Activate or block | **Activate**, **Block** | Status changes back to active or blocked. |
| `blocked` | Activate or deactivate | **Activate**, **Deactivate (soft)** | Status changes; history preserved. |

### Section 4: Known Gaps / Not Yet Built

- No `apps/web/app/[locale]/(app)/(modules)/purchasing/**` route/action files exist in this checkout; Purchasing is implemented through Planning, Warehouse and scanner routes.
- No `apps/web/app/[locale]/(app)/(modules)/inventory/**/_actions/*grn*` or `*receive*` files exist in this checkout; GRN actions live under Warehouse.
- Desktop PO **Mark partially received** / **Mark received** buttons are status-only. `transitionPurchaseOrderStatus` (actions.ts) updates `purchase_orders.status` and does not create `grns`, `grn_items` or `license_plates`; use scanner receive for real stock booking.
- GRN list item counts are wired but not populated: `grns/page.tsx` passes `itemCounts={{}}` at line 110, so the **Items** column renders an em dash even when receipt lines exist.
- No whole-GRN complete/post/cancel action was found. The source search found no `completeGrn`/`postGrn`; the GRN detail supports per-line cancellation only.
- PO list known no-source prototype regions are intentionally dropped: page comments state "no KPI strip / bulk toolbar / D365-drift - no backing data in the reviewed actions" in `purchase-orders/page.tsx`.
- PO list date filter, bulk import and pagination are not built in the list UI; `po-list-view.tsx` comments say they are dropped because no backing action/data source exists.
- PO export uses planning write permission as a temporary gate; `create-export-job.ts` has `TODO(E-IO): dedicated io.export.run permission`.
- Supplier list/detail prototype regions are dropped: comments cite no backing columns/reads for D365/products/PO columns on `suppliers/page.tsx`, `supplier-list-view.tsx` and `supplier-detail-view.tsx`.
- Transfer Order list/detail prototype regions are dropped: comments cite no-source filter selects/KPI strip and no backing LP breakdown/status history/progress bars in `transfer-orders/page.tsx` and `transfer-orders/[id]/page.tsx`.
- Scanner-side correction actions were not found for GRN line cancel or TO receive reverse; current correction actions are desktop Server Actions.
