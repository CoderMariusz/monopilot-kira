# Warehouse - tester how-to guide

> Per-module tester guide for the WAREHOUSE flow as implemented today. Routes are
> written without the `[locale]` prefix; use `/<locale>/...` in the browser, for
> example `/en/warehouse/license-plates`.
>
> Warehouse is split across desktop Server Actions, scanner JSON routes and one
> Quality scanner route. Desktop location CRUD is owned by Settings, not the
> Warehouse route group; Warehouse locations are read-only and link to Settings
> for edits.

---

### 1. Function inventory

| Action | What it does | Where (page/route; scanner vs desktop) | Data source (table) | Reverse/correction (how to undo, or 'none — flag') |
|---|---|---|---|---|
| `listScannerPurchaseOrders` (`receive-po.ts`, surfaced by `pos/route.ts`) | Lists open PO headers for scanner receiving. | Scanner: `GET /api/warehouse/scanner/pos`, `/scanner/receive-po` | reads `purchase_orders`, `suppliers`, `purchase_order_lines`, `grn_items` | Read-only. |
| `getScannerPurchaseOrder` (`receive-po.ts`, surfaced by `pos/[id]/route.ts`) | Loads one open PO and its lines with already-received quantity. | Scanner: `GET /api/warehouse/scanner/pos/[id]`, `/scanner/receive-po/[poId]` | reads `purchase_orders`, `suppliers`, `purchase_order_lines`, `items`, `grn_items` | Read-only. |
| `receiveScannerPoLine` (`receive-po.ts`, surfaced by `receive-line/route.ts`) | Receives PO line stock: creates/reuses a draft GRN, inserts GRN line, creates LP, writes LP history/outbox/audit, optional QC inspection, and rolls PO status. | Scanner: `POST /api/warehouse/scanner/receive-line`, `/scanner/receive-po/[poId]/[lineId]` | writes `grns`, `grn_items`, `license_plates`, `lp_state_history`, `outbox_events`, `quality_inspections`, `purchase_orders`, `scanner_audit_log`; reads `purchase_order_lines`, `purchase_orders`, `items`, `warehouses`, `locations`, `tenant_variations` | `cancelGrnLine`; guard: receipt line must not already be cancelled, LP must still match receipt qty, have no reservations, children or consumption. |
| `create LP from PO receipt` (`receive-po.ts`) | Mints a `received` / `qa_status='pending'` LP for the received quantity. | Scanner receive transaction, not a standalone screen. | writes `license_plates` | Cancel its GRN line with `cancelGrnLine` while cancellable; otherwise direct stock-adjust. |
| `create LP from positive count variance` (`count-actions.ts`) | Mints an adjustment LP when an approved count line has positive variance. | Desktop: `/warehouse/counts/[id]` | writes `license_plates`, `stock_adjustments`, `stock_moves`, `lp_state_history` | none — flag; apply an opposite adjustment if wrong. |
| `create LP from direct increase` (`direct-adjust-actions.ts`) | Mints an adjustment LP for one-off found stock. | Desktop: `/warehouse/adjustments/new` | writes `license_plates`, `stock_adjustments`, `stock_moves`, `lp_state_history` | none — flag; use a decrease adjustment with e-sign and supervisor countersignature. |
| `split LP` (`lp-detail.client.tsx`) | [NOT FOUND in code] UI reserves a split action slot, but no live split action/route was found. | Desktop: `/warehouse/license-plates/[lpId]` action button is deferred/disabled | none | none — flag. |
| `merge LP` (`lp-detail.client.tsx`) | [NOT FOUND in code] UI reserves a merge action slot, but no live merge action/route was found. | Desktop: `/warehouse/license-plates/[lpId]` action button is deferred/disabled | none | none — flag. |
| `moveScannerLp` putaway (`movement.ts`, surfaced by `putaway/route.ts`) | Moves an LP to a location and promotes `received -> available` on putaway. | Scanner: `POST /api/warehouse/scanner/putaway`, `/scanner/putaway` | writes `stock_moves`, `license_plates`, `lp_state_history`, `scanner_audit_log`; reads `license_plates`, `locations` | Move LP again; no cancel of the movement row. |
| `suggestPutawayLocations` (`movement.ts`, surfaced by `putaway/suggest/route.ts`) | Suggests destination locations by same-product, empty and default-location ranking. | Scanner: `GET /api/warehouse/scanner/putaway/suggest` | reads `license_plates`, `locations` | Read-only. |
| `moveScannerLp` transfer (`movement.ts`, surfaced by `move/route.ts`) | Moves an LP between locations without changing quantity or LP state. | Scanner: `POST /api/warehouse/scanner/move`, `/scanner/move-lp` | writes `stock_moves`, `license_plates`, `scanner_audit_log`; reads `license_plates`, `locations` | Move LP again; no cancel of the movement row. |
| `createStockMove` (`stock-move-actions.ts`) | Desktop LP move: inserts a transfer stock move and updates LP location. | Desktop: `/warehouse/license-plates/[lpId]` move modal | writes `stock_moves`, `license_plates`; reads `license_plates`, `locations` | Move LP again; no cancel action found. |
| `listStockMoves` (`stock-move-actions.ts`) | Lists unified movement ledger from explicit stock moves plus LP state history. | Desktop: `/warehouse/movements` | reads `stock_moves`, `lp_state_history`, `license_plates`, `locations` | Read-only. |
| `pickScannerLp` (`movement.ts`, surfaced by `pick/route.ts`) | Stages a QA-released LP for a WO material as `move_type='issue'`; quantity is not deducted. | Scanner: `POST /api/warehouse/scanner/pick`, `/scanner/pick` | writes `stock_moves`, `license_plates`, `scanner_audit_log`; reads `work_orders`, `wo_executions`, `wo_materials`, `production_lines`, `license_plates`, `locations` | Move LP again or consume/reverse through Production; no pick cancel action found. |
| `listPickWorkOrders` (`movement.ts`, surfaced by `pick/wos/route.ts`) | Lists released/in-progress WOs and material lines for scanner picking. | Scanner: `GET /api/warehouse/scanner/pick/wos` | reads `work_orders`, `wo_executions`, `items`, `production_lines`, `wo_materials` | Read-only. |
| `listFefoLps` (`movement.ts`, surfaced by `pick/lps/route.ts`) | Lists FEFO LP candidates for a material product/UoM. | Scanner: `GET /api/warehouse/scanner/pick/lps` | reads `v_inventory_available`, `locations` | Read-only. |
| `getScannerLpDetail` (`movement.ts`, surfaced by `lp/route.ts`) | Looks up LP details, available qty, location, parent and child LPs. | Scanner: `GET /api/warehouse/scanner/lp`, `/scanner/lp-info` | reads `license_plates`, `items`, `locations`, `warehouses`, `stock_moves` | Read-only. |
| `GET location lookup` (`location/route.ts`) | Looks up a scanned location by code/barcode/UUID. | Scanner: `GET /api/warehouse/scanner/location` | reads `locations`, `warehouses` | Read-only. |
| `POST /api/quality/scanner/inspect` (`inspect/route.ts`) | Records LP QC decision: pass/release, fail/reject, or hold with quality hold rows. | Scanner: `/scanner/qc` via `POST /api/quality/scanner/inspect` | writes `quality_inspections`, `license_plates`, `quality_holds`, `quality_hold_items`, `outbox_events`, `scanner_audit_log`; reads `license_plates` | Desktop QA/hold flows; no scanner undo route found. |
| `listGrns` (`grn-actions.ts`) | Lists GRN headers with filters. | Desktop: `/warehouse/grns` | reads `grns`, `suppliers`, `warehouses` | Read-only. |
| `getGrnDetail` (`grn-actions.ts`) | Loads GRN header, receipt lines, created LP links and cancellation flags. | Desktop: `/warehouse/grns/[grnId]` | reads `grns`, `grn_items`, `items`, `license_plates`, `suppliers`, `warehouses` | Read-only; line correction via `cancelGrnLine`. |
| `releaseLpQa` (`lp-qa-actions.ts`) | Releases/rejects pending receiving QC; release can promote `received -> available`, reject can block. | Desktop: `/warehouse/grns/[grnId]` | writes `license_plates`, `lp_state_history`, `outbox_events` | One-way pending-only decision; no unrelease action found. |
| `cancelGrnLine` (`receipt-corrections-actions.ts`) | Cancels one receipt line, returns the LP, zeroes qty/reserved qty, and records audit/history. | Desktop: `/warehouse/grns/[grnId]` | writes `license_plates`, `grn_items`, `lp_state_history`, `audit_events`; reads `wo_material_consumption`, child `license_plates` | This is the PO receipt reverse path. |
| `updateLpMetadata` (`receipt-corrections-actions.ts`) | Corrects LP expiry and batch metadata. | Desktop: `/warehouse/license-plates/[lpId]` and GRN correction surfaces | writes `license_plates`, `lp_state_history`, `audit_events` | Edit again; refused for terminal/returned LPs. |
| `listLPs` (`lp-actions.ts`) | Lists license plates by status, QA status, warehouse/site and search. | Desktop: `/warehouse/license-plates` | reads `license_plates`, `items`, `locations`, `warehouses` | Read-only. |
| `getLpDetail` (`lp-actions.ts`) | Loads one LP, children, LP history and stock moves. | Desktop: `/warehouse/license-plates/[lpId]` | reads `license_plates`, `items`, `locations`, `warehouses`, `work_orders`, `lp_state_history`, `stock_moves` | Read-only; actions on detail handle move/block/reserve/metadata. |
| `blockLp` (`lp-detail-actions.ts`) | Creates a quality hold and sets LP status/QA status to blocked/on_hold. | Desktop: `/warehouse/license-plates/[lpId]`, expiry block modal | writes `quality_holds`, `quality_hold_items`, `license_plates`, `lp_state_history`, `outbox_events` | `unblockLp` when the hold can be released. |
| `unblockLp` (`lp-detail-actions.ts`) | Releases the active LP hold through Quality and returns LP to available/released. | Desktop: `/warehouse/license-plates/[lpId]` | writes through `releaseHoldFromWarehouseLpUnblock` to Quality/Warehouse hold state | Re-block with `blockLp`. |
| `listOpenWorkOrdersForLpReserve` (`lp-detail-actions.ts`) | Lists open WOs for manual LP reservation picker. | Desktop: `/warehouse/license-plates/[lpId]` reserve modal | reads `work_orders`, `items` | Read-only. |
| `reserveLp` (`lp-detail-actions.ts`) | Manually reserves part/all of a released LP for a WO. | Desktop: `/warehouse/license-plates/[lpId]` | writes `license_plates`, `lp_state_history`; reads `work_orders` | `releaseReservation`. |
| `listReservations` (`reservation-actions.ts`) | Lists LP hard-lock reservations. | Desktop: `/warehouse/reservations` | reads `license_plates`, `work_orders`, `items` | Read-only. |
| `releaseReservation` (`reservation-actions.ts`) | Clears reserved qty and WO link; `reserved` LP returns to `available`. | Desktop: `/warehouse/reservations` | writes `license_plates`, `lp_state_history` | Reserve again with `reserveLp` or planning release flow. |
| `getInventoryByProduct` (`inventory-actions.ts`) | Aggregates active LP stock by product. | Desktop: `/warehouse/inventory` | reads `license_plates`, `items` | Read-only. |
| `getInventoryByLocation` (`inventory-actions.ts`) | Aggregates active LP stock by location/warehouse. | Desktop: `/warehouse/inventory` | reads `license_plates`, `locations`, `warehouses` | Read-only. |
| `getInventoryByBatch` (`inventory-actions.ts`) | Aggregates active LP stock by product and batch. | Desktop: `/warehouse/inventory` | reads `license_plates`, `items` | Read-only. |
| `getExpiryDashboard` (`expiry-actions.ts`) | Lists LPs expired or expiring within 30 days, split into red/amber tiers. | Desktop: `/warehouse/expiry` | reads `license_plates`, `items`, `locations`, `warehouses`, `warehouse_storage_settings` | Read-only; use `blockLp` or adjustment for action. |
| `traceGenealogy` (`genealogy-actions.ts`) | Traces LP ancestors/self/descendants using genealogy and parent links. | Desktop: `/warehouse/genealogy` | reads `license_plates`, `lp_genealogy` via `queryGenealogy` | Read-only. |
| `listLocations` (`location-read-actions.ts`) | Lists org-scoped location options joined to warehouse labels. | Desktop: `/warehouse/locations`, LP move modal, adjustment form | reads `locations`, `warehouses` | Read-only. |
| `upsertLocation` (`actions/infra/location.ts`) | Settings-owned create/update location action. | Desktop Settings: `/settings/infra/locations`; Warehouse links there | writes `locations`, `outbox_events` | Edit again; delete if no child locations. |
| `deleteLocation` (`actions/infra/location.ts`) | Settings-owned location delete action. | Desktop Settings: `/settings/infra/locations`; Warehouse links there | deletes `locations`, writes `outbox_events` | Recreate with `upsertLocation`; delete is blocked when children exist. |
| `importLocationCsvAction` (`import-location-csv.ts`) | Imports location hierarchy rows from CSV. | Desktop Settings: `/settings/infra/locations` | writes `locations` | Delete/edit imported locations in Settings. |
| `createCountSession` (`count-actions.ts`) | Creates a stock count session and snapshot lines for warehouse on-hand. | Desktop: `/warehouse/counts` | writes `count_sessions`, `count_lines`; reads `warehouses`, `license_plates`, `locations`, `items` | none — flag; no cancel action found in exported actions. |
| `listCountSessions` (`count-actions.ts`) | Lists count sessions with line and variance counts. | Desktop: `/warehouse/counts` | reads `count_sessions`, `count_lines`, `warehouses` | Read-only. |
| `getCountSession` (`count-actions.ts`) | Loads one count session and its count lines. | Desktop: `/warehouse/counts/[id]` | reads `count_sessions`, `count_lines`, `locations`, `items`, `license_plates` | Read-only. |
| `recordCount` (`count-actions.ts`) | Records blind counted quantity, batch and expiry metadata on a count line. | Desktop: `/warehouse/counts/[id]` | writes `count_lines` metadata; reads current on-hand from `license_plates` | Recount before approve/apply. |
| `approveAndApplyVariance` (`count-actions.ts`) | E-signs and applies count variance: positive mints LP, negative drains FEFO LPs, and writes adjustment/move/audit rows. | Desktop: `/warehouse/counts/[id]` | writes `license_plates`, `stock_adjustments`, `stock_moves`, `lp_state_history`, count metadata/audit; reads `count_lines`, `license_plates`, `unit_of_measure` | none — flag; apply an opposite adjustment if wrong. |
| `searchAdjustItems` (`adjust-form-actions.ts`) | Searches items for direct stock-adjust form. | Desktop: `/warehouse/adjustments/new` | reads `items` | Read-only. |
| `getDirectAdjustFormContext` (`adjust-form-actions.ts`) | Loads form context for direct adjustment. | Desktop: `/warehouse/adjustments/new` | reads context needed by adjustment page | Read-only. |
| `searchEligibleSupervisors` (`adjust-form-actions.ts`) | Finds second-person supervisors who can countersign stock decreases. | Desktop: `/warehouse/adjustments/new` | reads `users`, `user_roles`, `roles`, `role_permissions`, `user_pins` | Read-only. |
| `listDecreaseLps` (`adjust-form-actions.ts`) | Lists available LPs for a direct decrease; FEFO auto is the default when blank. | Desktop: `/warehouse/adjustments/new` | reads `license_plates`, `items`, `locations` | Read-only. |
| `applyDirectAdjustment` (`direct-adjust-actions.ts`) | Applies direct stock increase/decrease under e-sign; decreases need distinct supervisor PIN. | Desktop: `/warehouse/adjustments/new` | writes `license_plates`, `stock_adjustments`, `stock_moves`, `lp_state_history`; reads `license_plates`, `warehouses`, `locations`, `user_pins`, RBAC tables | none — flag; apply an opposite signed adjustment if wrong. |

### 2. User how-to

1. Receive a PO into stock — scanner path
   1. Open `/scanner/receive-po`.
   2. On **Receive PO**, scan or type a PO number; the list comes from `GET /api/warehouse/scanner/pos` (`pos/route.ts`).
   3. Open the PO, pick the line, then enter **Batch / serial**, **Best before**, optional **Destination location**, and **Quantity**.
   4. Tap **Receive**. `POST /api/warehouse/scanner/receive-line` calls `receiveScannerPoLine` (`receive-po.ts`), creates the GRN line and LP, and rolls the PO to `partially_received` or `received`.
   5. If the org requires GRN QC, the result carries `qcInspectionRequired=true` and an inspection id; otherwise the LP still starts with `qa_status='pending'`.

2. Receive a PO into stock — desktop path
   1. No desktop receive action was found in Warehouse. Desktop `/warehouse/grns` is a read/correction surface for receipts created by the scanner receive transaction.
   2. After scanner receipt, go to `/warehouse/grns`.
   3. Search **Search GRN#, supplier…**, open the GRN, then verify **Receipt lines**, **LP created**, **Print labels**, **Record temp**, and **Release QC** where applicable.
   4. To correct a wrong receipt, use **Cancel receipt…** on the line; the modal button is **Cancel receipt** and calls `cancelGrnLine` (`receipt-corrections-actions.ts`).

3. Put away an LP to a storage location
   1. Open `/scanner/putaway`.
   2. Scan the LP; the LP lookup is `GET /api/warehouse/scanner/lp` (`lp/route.ts`).
   3. Use suggestions from `GET /api/warehouse/scanner/putaway/suggest` or scan a destination location via `GET /api/warehouse/scanner/location`.
   4. Confirm putaway. `POST /api/warehouse/scanner/putaway` writes a putaway stock move and, when the LP is still `received`, promotes it to `available`.

4. Move an LP between locations
   1. Scanner path: open `/scanner/move-lp`, scan the LP, scan the destination location, optionally enter a reason, then submit. `POST /api/warehouse/scanner/move` calls `moveScannerLp` (`movement.ts`).
   2. Desktop path: open `/warehouse/license-plates/[lpId]`, click **Move**, choose destination **Location**, enter optional **Reason**, and submit. The modal calls `createStockMove` (`stock-move-actions.ts`).
   3. Verify the new row under `/warehouse/movements`.

5. Pick for a WO or SO
   1. WO scanner path exists. Open `/scanner/pick`.
   2. Select/search a released or in-progress WO from `GET /api/warehouse/scanner/pick/wos`.
   3. Choose a material line; FEFO LP candidates come from `GET /api/warehouse/scanner/pick/lps`.
   4. Scan the LP and staging destination, then submit. `POST /api/warehouse/scanner/pick` writes an `issue` stock move and updates the LP location; it refuses LPs whose QA status is not `released`.
   5. SO pick was not found in Warehouse code. Shipping owns SO allocation/pick surfaces; mark Warehouse SO pick as `[NOT FOUND in code]`.

6. Run a cycle count and approve it
   1. Go to `/warehouse/counts`.
   2. Click **New count session** / **Nowa inwentaryzacja**.
   3. In **New count session** / **Nowa inwentaryzacja**, choose **Warehouse** / **Magazyn** and **Count type** / **Typ liczenia**. Pick **Cycle count** / **Liczenie cykliczne**.
   4. Click **Create session** / **Utwórz**. The page routes to `/warehouse/counts/[id]`.
   5. On **Blind count** / **Liczenie w ciemno**, enter **Counted qty** / **Policzona ilość** and click **Record count** / **Zapisz liczenie**.
   6. Open **Variance review** / **Przegląd różnic** and click **Approve & apply** / **Zatwierdź i zastosuj**.
   7. In **Approve & apply variance** enter **Account password** / **Hasło konta** and submit. Positive variance creates a new LP; negative variance reduces FEFO stock.

7. Adjust stock on an LP (direct adjust)
   1. Go to `/warehouse/adjustments/new`.
   2. In **Stock adjustment** / **Korekta stanu**, choose **Location** / **Lokalizacja** and **Item** / **Pozycja**.
   3. Pick **Direction** / **Kierunek**: **Increase** / **Zwiększ** creates a new LP; **Decrease** / **Zmniejsz** reduces existing stock.
   4. Enter **Quantity** / **Ilość**, **Unit** / **Jednostka**, and **Reason code** / **Kod przyczyny**. For **Other** / **Inne**, fill **Reason note** / **Uzasadnienie**.
   5. For decreases, optionally choose **Specific pallet (LP)** / **Konkretna paleta (LP)**; leaving **FEFO (auto)** uses earliest expiry first.
   6. Enter **Your electronic signature** / **Twój podpis elektroniczny**. For decreases, select **Supervisor** / **Przełożony** and enter **Supervisor PIN** / **PIN przełożonego**.
   7. Click **Apply adjustment** / **Zastosuj korektę**. `applyDirectAdjustment` writes stock adjustment, movement and LP history rows.

### 3. Reverse / correction map

| Entity | Undo / correction path | Allowed state |
|---|---|---|
| LP | Move again with scanner `/api/warehouse/scanner/move` or desktop `createStockMove`; block with `blockLp`; unblock with `unblockLp`; reserve with `reserveLp`; release reservation with `releaseReservation`; correct batch/expiry with `updateLpMetadata`. | Moves refuse consumed/destroyed/shipped scanner LPs; desktop move refuses consumed/destroyed/shipped. Metadata edit refuses consumed/shipped/merged/destroyed/returned. Block refuses terminal LPs and already-held LPs. Reserve requires non-terminal, not blocked, QA `released`, enough available qty and an open WO. |
| GRN line | `cancelGrnLine` voids the created LP to `returned`, sets LP qty/reserved qty to zero, and marks `grn_items.cancelled_at`. | Line not already cancelled; has LP; LP status is `received` or `available`; QA is `pending` or `released`; LP reserved qty is zero; LP qty equals received qty; no child LPs or WO consumption. |
| Movement | No movement cancel action found. Correct by moving the LP again or applying a signed stock adjustment when quantity is wrong. | Any movable LP accepted by `moveScannerLp` / `createStockMove`; immutable movement rows remain as audit history. |
| Cycle count | Before approval, use **Recount** / **Policz ponownie** and run `recordCount` again. After `approveAndApplyVariance`, no reverse action was found; apply an opposite signed adjustment if needed. | Recount while line is not applied. Apply once under e-sign via `approveAndApplyVariance`. |
| Adjustment | No adjustment cancel action found. Correct with a new signed direct adjustment in the opposite direction. | `applyDirectAdjustment` is idempotent by `clientOpId`; increase must not specify an LP; decrease needs available QA-released stock and a distinct supervisor PIN. |

### 4. Known gaps / not-yet-built

- Desktop receive PO is [NOT FOUND in code]. The live receive writer is scanner `POST /api/warehouse/scanner/receive-line` calling `receiveScannerPoLine` (`receive-line/route.ts`, `receive-po.ts`); `/warehouse/grns` only lists/details/corrects GRNs via `listGrns` and `getGrnDetail` (`grn-actions.ts`).
- LP split is [NOT FOUND in code]. The LP detail component says "split / merge / destroy remain deferred" at `license-plates/[lpId]/_components/lp-detail.client.tsx:529`.
- LP merge is [NOT FOUND in code]. The same deferred action group is in `license-plates/[lpId]/_components/lp-detail.client.tsx:529`.
- Destroy LP is referenced by the LP detail action order tests but no live destroy action was found; the UI comment at `license-plates/[lpId]/_components/lp-detail.client.tsx:529` marks it deferred.
- SO pick is [NOT FOUND in Warehouse code]. Warehouse scanner pick only targets WOs through `pick/wos/route.ts` and `pick/route.ts`; SO picking belongs to Shipping if/when built.
- Warehouse-owned location CRUD is [NOT FOUND in code]. Warehouse `/warehouse/locations` is read-only and its labels say edits live in Settings; actual CRUD is `upsertLocation` / `deleteLocation` in `apps/web/actions/infra/location.ts`.
- No whole-GRN complete/post/cancel action was found. GRN correction is per-line through `cancelGrnLine` (`receipt-corrections-actions.ts`).
- `releaseLpQa` is one-way for pending LPs; no unrelease/reopen-QC action was found (`lp-qa-actions.ts`).
- Stock movement cancellation is [NOT FOUND in code]. `listStockMoves` is read-only and `createStockMove` only creates a new transfer (`stock-move-actions.ts`).
- Cycle-count cancel/close session actions are [NOT FOUND in code]. Exported count actions are `createCountSession`, `listCountSessions`, `getCountSession`, `recordCount`, and `approveAndApplyVariance` (`count-actions.ts`).
