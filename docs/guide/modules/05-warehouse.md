# Warehouse / Inventory — License Plates / GRN / putaway / FEFO pick / genealogy / counts (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. The module spans **two
> surfaces** plus a shared lib layer: the **desktop** Warehouse screens under
> `…/(modules)/warehouse/**` (LPs, GRNs, inventory, locations, movements,
> reservations, expiry, genealogy, counts, inbound, print history) and the
> **scanner** PWA warehouse flows served by route handlers under
> `apps/web/app/api/warehouse/scanner/**`. The shop-floor write logic lives in
> `apps/web/lib/warehouse/**` (`scanner/receive-po.ts`, `scanner/movement.ts`,
> `genealogy.ts`, `lp-create.ts`), which the scanner routes and the desktop
> Server Actions both call.
>
> 05-warehouse is the **canonical owner** of the **License Plate** (`license_plates`)
> — the universal lot/quantity unit consumed by 08-production, shipped by
> 11-shipping and held by 09-quality — plus `grns`/`grn_items`, `stock_moves`,
> `count_sessions`/`count_lines`/`stock_adjustments`, `lp_state_history`,
> `lp_genealogy` and `locations`. It **consumes** 09-quality's hold path (a manual
> LP block opens a real `quality_holds` row) and **shares the receive transaction**
> with Purchasing — a PO line is *received* into a GRN line that mints an LP.
>
> Routes are written without the `[locale]` prefix. Last reviewed against the
> uncommitted working tree (W9 putaway/move/pick + destination-location, R3 receipt
> corrections + LP-metadata, mig-318 stock-count adjustments, W11 direct
> stock-adjustment + mig-328 reason-CHECK/approver).

---

## a. Overview

The Warehouse module turns received goods into **trackable, FEFO-consumable stock**
and keeps the physical world and the ledger in sync. The atom is the **License
Plate (LP)** — one pallet/lot of one item, with a quantity, batch, expiry, location,
`status` (where it is in its lifecycle) and `qa_status` (whether QA has cleared it).
Stock is **received** (PO receipt mints an LP born `received`/`qa pending`),
**QA-released** (→ `available`, FEFO-consumable), **putaway** to a storage location,
**moved** between locations, **reserved** for a work order, **picked** (issued to a
production line), **consumed** by production (08-production decrements the LP), or
**shipped** (11-shipping). Mistakes are reversible at the receipt level
(**cancel the GRN line** → LP `returned`; **correct LP metadata** in place) and the
ledger is reconciled by **stock counts** (cycle/full/spot) whose variance is applied
under a **CFR-21 e-signature** as a real `stock_adjustments` + `stock_moves` entry.
A one-off LP-level **direct stock adjustment** (`/warehouse/adjustments/new`) covers
the same `stock_adjustments`/`stock_moves` write without a count session — an
operator adds found stock (mints a QA-hold LP) or removes damaged/expired stock
(supervisor-countersigned, FEFO-drained).

The pickability rule is enforced once, in the **`v_inventory_available` view**
(mig 191): a row is only consumable/pickable when `status='available'` **and**
`qa_status='released'`, minus `reserved_qty`, ordered `expiry_date asc nulls last`
(FEFO). Every consume/pick/count read funnels through it, so a single QA flip or a
hold makes stock appear/disappear everywhere at once.

The desktop reads/writes are page-local Server Actions in
`warehouse/_actions/*` (`lp-actions.ts`, `grn-actions.ts`, `inventory-actions.ts`,
`expiry-actions.ts`, `genealogy-actions.ts`, `stock-move-actions.ts`,
`location-read-actions.ts`, `reservation-actions.ts`, `lp-qa-actions.ts`,
`receipt-corrections-actions.ts`) plus `license-plates/[lpId]/_actions/lp-detail-actions.ts`
and `counts/_actions/count-actions.ts`. The scanner write logic is
`lib/warehouse/scanner/receive-po.ts` (receive) and `lib/warehouse/scanner/movement.ts`
(putaway/move/pick + LP/FEFO lookups), reached through the route handlers in
`app/api/warehouse/scanner/**`.

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission checked
> server-side **inside** the action: desktop actions return a typed
> `{ ok:false, reason:'forbidden' }` (never a 500); scanner routes are gated by the
> **scanner PIN session** (`requireScannerSession`) and the inventory-write routes
> additionally re-check `warehouse.stock.move`. All LP qty maths are NUMERIC-exact
> (micro-bigint / decimal strings straight to `NUMERIC`, never a JS float).

### License-plate reads — `warehouse/_actions/lp-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listLPs({status?,qaStatus?,search?,warehouseId?,siteId?,limit?})` | LP list with available-qty (`quantity - reserved_qty`); filterable by status/qa/warehouse/site + free-text on LP#/batch/item code/name. | reads `license_plates`, `items`, `locations`, `warehouses` | `warehouse.inventory.read` | — (read) |
| `getLpDetail(lpId)` | Full LP detail: header (origin, GRN/WO links, reserved-for-WO, parent LP), **child LPs**, the **state-history ledger** (`lp_state_history`), and the LP's **stock moves**. | reads `license_plates`, `items`, `locations`, `warehouses`, `work_orders`, `lp_state_history`, `stock_moves` | `warehouse.inventory.read` | — (read) |

### Goods receipt (GRN) reads — `warehouse/_actions/grn-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `listGrns({status?,sourceType?,search?,limit?})` | GRN list (status + source-type tabs, search on GRN#/supplier). | reads `grns`, `suppliers`, `warehouses` | `warehouse.inventory.read` | — (read) |
| `getGrnDetail(grnId)` | GRN header + receipt lines (ordered/received qty, batch/expiry, the minted LP + its `qa_status`, the **R3 cancellation flag** `cancelled` + reason) + the LPs created on this GRN. | reads `grns`, `grn_items`, `items`, `license_plates`, `suppliers`, `warehouses` | `warehouse.inventory.read` | line-level via `cancelGrnLine` |

### Inventory / expiry / movements / locations reads — `warehouse/_actions/*`

| Action (file) | What it does | Reads | Gate |
|---|---|---|---|
| `getInventoryByProduct` / `getInventoryByLocation` / `getInventoryByBatch` (`inventory-actions.ts`) | Three roll-ups of on-hand stock (excludes terminal LP statuses `consumed/shipped/destroyed/merged/returned`); each splits **total** vs **pickable** (`status='available' AND qa_status='released'`) qty + LP count + earliest expiry. | `license_plates`, `items`, `locations`, `warehouses` | `warehouse.inventory.read` |
| `getExpiryDashboard` (`expiry-actions.ts`) | Red/amber expiry tiers for non-terminal LPs expiring within 30 days; the red/amber threshold is the per-warehouse `warehouse_storage_settings.expiry_warning_days` (default 7). | `license_plates`, `items`, `locations`, `warehouses`, `warehouse_storage_settings` | `warehouse.inventory.read` |
| `listStockMoves({moveType?,limit?})` (`stock-move-actions.ts`) | **Unified movement ledger** (WH-006): UNION of the explicit `stock_moves` ledger (putaway/transfer/issue/adjustment) **and** `lp_state_history` transitions (receive/production/consume/putaway promotion) normalized to one shape, so receipts/consumes are no longer invisible on the Movements screen. | `stock_moves`, `lp_state_history`, `license_plates`, `locations` | `warehouse.inventory.read` | 
| `listLocations({warehouseId?,search?,limit?})` (`location-read-actions.ts`) | Org-scoped location list (joined to warehouses) for the Locations tree + the LP **Move** destination picker. | `locations`, `warehouses` | `warehouse.inventory.read` |
| `traceGenealogy(lpId)` (`genealogy-actions.ts` → `lib/warehouse/genealogy.ts` `queryGenealogy`) | Full ancestor + self + descendant LP chain via `parent_lp_id` **and** `lp_genealogy` edges; depth-capped 20 each way, cycle-proof. | `license_plates`, `lp_genealogy`, `items` | `warehouse.inventory.read` | — (read) |

### Stock move (putaway/transfer) — `warehouse/_actions/stock-move-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `createStockMove({lpId,toLocationId,reason?,clientOpId})` | Desktop LP relocation. Row-locks the LP (`for update`), refuses terminal `consumed/destroyed/shipped` (`immovable_status`) or an LP locked by another user in the last 5 min (`locked`); validates the destination; inserts a `move_type='transfer'` `stock_moves` row (idempotent on `(org_id, transaction_id)` seeded from `clientOpId`) and updates `license_plates.location_id`. | writes `stock_moves`, `license_plates` | `warehouse.stock.move` | another move back |

### Reservations — `warehouse/_actions/reservation-actions.ts` + `lp-detail-actions.ts`

| Action (file) | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `listReservations` (`reservation-actions.ts`) | LPs with `reserved_qty>0` or a `reserved_for_wo_id` (the reservations screen). | reads `license_plates`, `work_orders`, `items` | `warehouse.inventory.read` | — (read) |
| `reserveLp(lpId, woId, qty)` (`lp-detail-actions.ts`) | Reserve qty of an `available/reserved`, QA-`released` LP for an **open** WO. Validates qty ≤ available; bumps `reserved_qty`, sets `reserved_for_wo_id` + `status='reserved'`; writes LP history. Refuses a non-released LP (`lp_not_released`) or one already reserved for a different WO. | writes `license_plates`, `lp_state_history` | `warehouse.lp.reserve` | `releaseReservation` |
| `releaseReservation({lpId,reason})` (`reservation-actions.ts`) | Zero `reserved_qty`, clear `reserved_for_wo_id`, flip `reserved → available`. Refuses terminal LPs (`not_releasable_status`) or another user's lock. | writes `license_plates`, `lp_state_history` | `warehouse.lp.reserve` | `reserveLp` again |
| `listOpenWorkOrdersForLpReserve(search?, limit?)` (`lp-detail-actions.ts`) | Open-WO picker (`DRAFT/RELEASED/IN_PROGRESS/ON_HOLD`) for the reserve modal. | reads `work_orders`, `items` | `warehouse.lp.reserve` | — (read) |

### LP QA / hold (block-unblock) — `lp-qa-actions.ts` + `lp-detail-actions.ts`

| Action (file) | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `releaseLpQa({lpId,decision,note?})` (`lp-qa-actions.ts`) | QA-gate a **pending** received LP: `released` auto-promotes `received→available` (FEFO-consumable without a separate putaway); `rejected` → `received→blocked` (a later putaway can never promote it). Writes LP history + emits `warehouse.lp.transitioned`. | writes `license_plates`, `lp_state_history`, `outbox_events` | `warehouse.grn.receive` | one-way (`pending`-only) |
| `blockLp(lpId, reason)` (`lp-detail-actions.ts`) | Quarantine an LP: opens a real **`quality_holds`** row (+ `quality_hold_items`), flips LP `status='blocked', qa_status='on_hold'`, writes LP history, emits `quality.hold.created`. Refuses terminal/already-blocked. | writes `quality_holds`, `quality_hold_items`, `license_plates`, `lp_state_history`, `outbox_events` | `warehouse.lp.block` | `unblockLp` |
| `unblockLp(lpId, reason)` (`lp-detail-actions.ts`) | Release the LP's hold by delegating to **09-quality** `releaseHoldFromWarehouseLpUnblock` (the canonical hold-release path); LP returns to `available`/`released`. | writes quality hold + LP tables (quality-owned path) | (quality hold-release perm, inside the delegate) | `blockLp` |

### Receipt corrections (R3) — `warehouse/_actions/receipt-corrections-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse direction |
|---|---|---|---|---|
| `cancelGrnLine({grnItemId,reasonCode,note?})` | **Cancel one GRN receipt line.** Voids its LP (`status='returned', quantity=0, reserved_qty=0`), stamps `cancelled_at`/reason on `grn_items`, writes LP history + audit `warehouse.receipt.corrected`. Refuses if the LP isn't `received|available` + `qa pending|released`, has reserved qty, qty ≠ received_qty, has children or any consumption (`lp_not_cancellable`), or is already cancelled. **No e-sign.** `reasonCode ∈ {entry_error, wrong_quantity, wrong_batch, wrong_product, other}`. | reads `grn_items`, `license_plates`, `wo_material_consumption`; writes `license_plates`, `grn_items`, `lp_state_history`, `audit_events` | `warehouse.receipt.correct` | **is** the reverse of a receive (shared with Purchasing) |
| `updateLpMetadata({lpId,expiryDate?,batchNumber?,reasonCode,note})` | **Fix a received LP's expiry / batch in place** (mis-keyed best-before). Blocked on terminal/`returned` LPs (`lp_not_editable`). Writes LP history (`metadata_corrected`) + audit `warehouse.lp.metadata_corrected`. | reads/writes `license_plates`, `lp_state_history`, `audit_events` | `warehouse.receipt.correct` | edit again (audited each time) |

### Stock counts + variance (mig 318) — `warehouse/counts/_actions/count-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `createCountSession({warehouseId,countType})` | Open a count session (`count_type ∈ {cycle, full, spot}`, status `open`). | writes `count_sessions` | `warehouse.stock.adjust` | — (cancel session out-of-band) |
| `listCountSessions` / `getCountSession(sessionId)` | List sessions / one session with its lines (line/counted/variance counts + Σ\|variance\|). | reads `count_sessions`, `count_lines`, `warehouses`, `locations`, `items`, `license_plates` | `warehouse.stock.adjust` | — (read) |
| `recordCount({sessionId,locationId,itemId,lpId?,countedQty,batchNumber?,expiryDate?})` | Record a counted qty for a (location, item, LP) slot. Reads live system qty from `v_inventory_available`, computes `variance = counted − system` (NUMERIC-exact), upserts a `count_lines` row (`status='counted'`); optional batch/expiry stashed as an audit metadata row for an increase-LP. | reads `v_inventory_available`; writes `count_lines`, `audit_events` | `warehouse.stock.adjust` | re-count (re-upsert) |
| `approveAndApplyVariance({countLineId,signature})` | **Apply the variance** under a **CFR-21 e-signature** (`signEvent`, intent `warehouse.stock.adjust`, PIN/password). Re-reads live on-hand and **refuses if stock moved since counting** (`stock_changed_recount_required`); recomputes variance. **Increase** → mints a new `available/released` adjustment LP (origin `adjustment`); **decrease** → FEFO-drains existing LPs (`stock_count_shrinkage`, an LP hitting 0 → `destroyed`). Writes `stock_adjustments` + signed `stock_moves` (`move_type='adjustment'`) + audit, marks the line `applied`. | reads `v_inventory_available`, `license_plates`, `items`; writes `e_sign_log`, `license_plates`, `lp_state_history`, `stock_adjustments`, `stock_moves`, `count_lines`, `audit_events` | `warehouse.stock.adjust` + e-sign | counter-count + re-apply (no one-click undo) |

### Direct stock adjustment (mig 328) — `warehouse/_actions/direct-adjust-actions.ts` + `adjustments/_actions/adjust-form-actions.ts`

> A one-off, **LP-level** add/remove that books a real `stock_adjustments` +
> `stock_moves(move_type='adjustment')` entry **without a count session** — the
> non-cycle-count sibling of `approveAndApplyVariance`. Lives at
> `/warehouse/adjustments/new` (`adjustments/new/page.tsx`, RBAC-gated server-side by
> `getDirectAdjustFormContext` → `warehouse.stock.adjust`), realising the warehouse
> M-03 stock-move modal (`prototypes/design/Monopilot Design System/warehouse/modals.jsx:396-499`).
> The single mutation is `applyDirectAdjustment`; the form's reads are three additive
> lookups in `adjust-form-actions.ts`. All qty maths are NUMERIC-exact (`toMicro`/
> `microToDecimal`, never a JS float).

| Action (file) | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `applyDirectAdjustment(input)` (`_actions/direct-adjust-actions.ts`) | **The mutation.** One `withOrgContext` txn. **Increase** (no `lpId`) → mints a NEW adjustment LP born `status='available'`, **`qa_status='pending'` (QA-hold)**, origin `adjustment`. **Decrease** → warehouse-scoped, FEFO-ordered (`expiry asc nulls last`) `for update` LP selection (`direct-adjust-actions.ts:145-164`), TOCTOU-safe drain (`quantity - qty >= reserved_qty` guard, an LP hitting 0 → `destroyed`); requires a **DISTINCT supervisor** (SoD) holding `warehouse.stock.adjust` + their **PIN**. e-signs (`signEvent`, intent `warehouse.stock.adjust`, initiator PIN/password); idempotent via `pg_advisory_xact_lock(hashtextextended(clientOpId))` + a `stock_moves(org_id, transaction_id)` replay short-circuit. Reason ∈ `{found_stock, spillage_damage, expiry_write_off, data_entry_error, system_sync, other}`; passing `lpId` on an increase is refused (`use_count_session`). | reads `license_plates`, `warehouses`, `locations`, `user_pins`, `user_roles`/`roles`; writes `license_plates`, `stock_adjustments`, `stock_moves`, `lp_state_history`, `e_sign_log` | `warehouse.stock.adjust` (+ initiator e-sign; **+ distinct-supervisor PIN + grant on decrease**) | counter-adjustment + re-apply (no one-click undo) |
| `getDirectAdjustFormContext()` (`adjustments/_actions/adjust-form-actions.ts`) | Page gate — returns `{ canAdjust:true }` or `forbidden` (rendered as the denied panel; the page never trusts a client flag). | reads `user_roles`/`roles`/`role_permissions` | `warehouse.stock.adjust` | — (read) |
| `searchAdjustItems({query?})` | Item picker. Wraps the org-scoped `searchItems` but widens the fan-out to **all stocked types** (`fg/rm/ingredient/intermediate/co_product/byproduct/packaging`) — any stocked item can be adjusted. | reads `items` (RLS-pinned) | (form-gated by the page) | — (read) |
| `searchEligibleSupervisors({query?})` | Supervisor combobox for a **decrease**: org users **≠ caller** who hold `warehouse.stock.adjust` AND have an enrolled PIN (name/email match, cap 20). Advisory only — `applyDirectAdjustment` re-verifies SoD + grant + PIN in-txn. | reads `users`, `user_roles`, `roles`, `role_permissions`, `user_pins` | `warehouse.stock.adjust` | — (read) |
| `listDecreaseLps({locationId,itemId})` | Optional "specific pallet (LP)" picker for a decrease — the `available`/`released`/unreserved LPs at the location for the item, **FEFO-ordered** (mirrors the mutation's selection). | reads `license_plates` | `warehouse.stock.adjust` | — (read) |

### Scanner — receive (shared with Purchasing) — `lib/warehouse/scanner/receive-po.ts`

| Action (route) | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `listScannerPurchaseOrders` (`GET /api/warehouse/scanner/pos`) | Open POs (`sent/confirmed/partially_received`) with line + received-line counts (cancelled GRN lines excluded). | reads `purchase_orders`, `suppliers`, `purchase_order_lines`, `grn_items` | scanner session (`scanner.receive_po.list`) | — (read) |
| `getScannerPurchaseOrder` (`GET …/pos/[id]`) | One open PO's lines with ordered/received rollup. | same | scanner session (`scanner.receive_po.detail`) | — (read) |
| `receiveScannerPoLine(client,session,input)` (`POST …/receive-line`) | **The one receive transaction** (desktop + scanner share it). Row-locks the open PO line, get-or-create today's **draft day-GRN**, inserts `grn_items`, mints the LP (`status='received', qa_status='pending'`, expiry = best-before else receive-date + `items.shelf_life_days`), writes LP genesis, emits `warehouse.lp.received`, rolls the PO to `partially_received`/`received`; opens a pending `quality_inspections` when `feature_flags->require_grn_qc_inspection` is ON; honours an **optional destination location** (else default-warehouse location). **Over-receive cap = 110% of ordered → `over_receive_cap` (409).** Idempotent on `scanner_audit_log(org_id, client_op_id)`. | writes `grns`, `grn_items`, `license_plates`, `lp_state_history`, `outbox_events`, `quality_inspections`, `purchase_orders`, `scanner_audit_log` | scanner session (`scanner.receive_po`) — NOT an RBAC perm | `cancelGrnLine` |

### Scanner — putaway / move / pick + lookups — `lib/warehouse/scanner/movement.ts`

| Action (route) | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `getScannerLpDetail` (`GET …/scanner/lp`) | Scan an LP# → header + parents/children chain (for the LP-info tile). | reads `license_plates`, `items`, `locations`, `warehouses`, `stock_moves` | scanner session (`warehouse.scanner.lp.lookup`) | — (read) |
| `suggestPutawayLocations` (`GET …/scanner/putaway/suggest`) | Ranked destination suggestions for an LP: `same_product` location → `empty` → receiving/`default` (top 5). | reads `locations`, `license_plates` | scanner session (`warehouse.scanner.putaway.suggest`) | — (read) |
| `moveScannerLp(...,moveType:'putaway')` (`POST …/scanner/putaway`) | Relocate an LP and, if it's still `received`, **promote `received→available`** (the canonical putaway transition that makes received stock FEFO-visible; `qa_status` untouched, so QA-pending stock stays invisible to FEFO). Idempotent (advisory xact-lock + replay on `scanner_audit_log`). | writes `stock_moves`, `license_plates`, `lp_state_history`, `outbox_events`, `scanner_audit_log` | scanner session **+ `warehouse.stock.move`** | move again |
| `moveScannerLp(...,moveType:'transfer')` (`POST …/scanner/move`) | Pure location move (no promotion) for already-available/quarantine/blocked stock. Refuses terminal `consumed/destroyed/shipped` (`lp_not_movable`) or another user's lock. | writes `stock_moves`, `license_plates`, `scanner_audit_log` | scanner session **+ `warehouse.stock.move`** | move again |
| `pickScannerLp(...)` (`POST …/scanner/pick`) | **FEFO pick** an LP to a WO material's staging location (`move_type='issue'`, **no inventory deduction** — consume is recorded separately by 08-production). PICK-only QA gate: only `qa_status='released'` stock may be picked (`lp_not_released`); item/UoM must match the material (`lp_not_movable`). Destination = explicit location else line staging, else `destination_required` (422). | writes `stock_moves`, `license_plates` (location), `scanner_audit_log` | scanner session **+ `warehouse.stock.move`** | move/return out-of-band |
| `listPickWorkOrders` (`GET …/scanner/pick/wos`) / `listFefoLps` (`GET …/scanner/pick/lps`) | Pickable WOs (RELEASED / in_progress / paused, line-scoped) + the FEFO-ordered LP candidates for a material (`v_inventory_available`, `expiry asc nulls last`). | reads `work_orders`, `wo_executions`, `wo_materials`, `items`, `production_lines`, `v_inventory_available`, `locations` | scanner session (`warehouse.scanner.pick.wos` / `.pick.lps`) | — (read) |
| `getScannerLpDetail` via `GET …/scanner/location` | Scan/resolve a location code (validity for the move/putaway destination). | reads `locations` | scanner session (`warehouse.scanner.location.lookup`) | — (read) |

**Action count inventoried: 37** — 2 LP reads, 2 GRN reads, 5 inventory/expiry/movements/locations/genealogy reads, 1 stock move, 3 reservations (+ open-WO picker), 3 LP-QA/block/unblock, 2 receipt corrections, 5 count, 5 direct adjustment (1 mutation + 4 reads), 3 scanner receive, 6 scanner putaway/move/pick + lookups. The write core is: `receiveScannerPoLine`, `releaseLpQa`, `moveScannerLp` (putaway/transfer), `pickScannerLp`, `createStockMove`, `reserveLp`/`releaseReservation`, `blockLp`/`unblockLp`, `cancelGrnLine`/`updateLpMetadata`, `approveAndApplyVariance`, and `applyDirectAdjustment`.

> The **Inbound schedule** screen (`/warehouse/inbound`) and the **Locations tree**
> (`/warehouse/locations`) add **no new actions** — inbound reuses Purchasing/Planning's
> `listPurchaseOrders` + `listTransferOrders` (cross-referenced, see *06-purchasing.md*),
> and locations reuses `listLocations` + `listLPs`. **Print history** reuses E1's
> `listPrintJobs`.

---

## c. State machine

### License Plate lifecycle (`license_plates.status` — mig 191 CHECK + mig 294 `destroyed`)

```
                  receive (scanner/desktop, shared txn)
                            │
                            ▼
   ┌───────────────────► received ──────────────┐
   │   (qa_status='pending', not consumable)     │
   │                          │                  │
   │       releaseLpQa        │  releaseLpQa     │  putaway (moveScannerLp)
   │       'released'         │  'rejected'      │  promotes received→available
   │            ▼             ▼                  ▼
   │        available ◄── (putaway) ──     blocked ◄── blockLp (opens a hold)
   │            │  ▲           ▲   │              ▲
   │   reserveLp│  │releaseRes │   │ blockLp      │ unblockLp → available
   │            ▼  │           │   ▼              │
   │        reserved           quarantine        │
   │            │                                 │
   │       pick (issue) / consume (08-prod)       │
   │            ▼                                  │
   │        consumed (terminal)                    │
   │                                               │
   └─ cancelGrnLine ─► returned (terminal)          
         shrinkage to 0 ─► destroyed (terminal)
         ship (11-shipping) ─► shipped (terminal)
         merge ─► merged (terminal)
```

| `status` | Meaning | Set by | Notes |
|---|---|---|---|
| `received` | Just minted on GRN receipt | `receiveScannerPoLine` | Always born `qa_status='pending'` — never auto-consumable. |
| `available` | QA-cleared, putaway-able, **FEFO-consumable** | `releaseLpQa` (released) or putaway promotion | `v_inventory_available` requires `available` **and** `qa_status='released'`. |
| `reserved` | Allocated to a WO | `reserveLp` (manual) / production reserve | `reserved_qty>0`, `reserved_for_wo_id` set. |
| `blocked` | On a quality hold | `blockLp`, or `releaseLpQa('rejected')` from `received` | `qa_status='on_hold'` (block) or `rejected` (QA fail). |
| `quarantine` | Held (legacy/QA family) | quality flows | Counts as on-hand in expiry/inventory reads. |
| `consumed` | Used by production (terminal) | 08-production consume | qty → 0. |
| `shipped` | Shipped (terminal) | 11-shipping | — |
| `returned` | Receipt cancelled (terminal) | `cancelGrnLine` | qty/reserved → 0; excluded from rollups; metadata edits refused. |
| `destroyed` | Voided / shrunk to 0 (terminal) | `voidWoOutput` (08), `approveAndApplyVariance` shrinkage | qty → 0. |
| `merged` | Folded into another LP (terminal) | merge flow | — |

`qa_status` runs orthogonally: `pending → released` (QA pass / putaway-then-release)
or `pending → rejected` / `→ on_hold` (hold). **Pickability = `status='available' AND
qa_status='released'` minus `reserved_qty`** — the single rule in
`v_inventory_available`.

### GRN / GRN-line lifecycle

- **GRN header** (`grns.status`): `draft → completed` (+ `cancelled`). The receive
  txn always books onto today's **draft** day-GRN (`getOrCreateOpenGrn`); a draft
  GRN's lines still count toward PO received-qty.
- **GRN line** (`grn_items`): created active on receive → one-way to **cancelled** via
  `cancelGrnLine` (stamps `cancelled_at`/`cancellation_reason_code`, voids the LP to
  `returned`). Cancelled lines drop out of **every** received-qty rollup
  (`… and cancelled_at is null`).

### Count session lifecycle (`count_sessions.status` — mig 318)

```
 open ──► counting ──► review ──► closed
   │                              (terminal)
   └──────────────► cancelled (terminal)
```

| State | Meaning | Notes |
|---|---|---|
| `open` / `counting` / `review` | Session is being counted / reviewed | `recordCount` upserts `count_lines` (`status='counted'`); variance can be applied while `open` **or** `review`. |
| `closed` / `cancelled` | Terminal | — |

**Count line** (`count_lines.status`): `pending → counted → applied` (variance applied
with e-sign), plus `approved`/`rejected`. `approveAndApplyVariance` re-validates live
on-hand and refuses if stock changed (`stock_changed_recount_required`) — no stale
variance is ever booked.

**Legality summary:** receive is legal only while the PO is `sent`/`confirmed`/
`partially_received`; QA release is `qa_status='pending'`-only; putaway promotion fires
only from `received`; pick requires `qa_status='released'`; reserve requires
`available/reserved` + `released` + an open WO; GRN-line cancel requires the LP still
`received|available`, `qa pending|released`, reserved 0, qty unchanged, no
children/consumption; variance apply requires the session `open|review` and live
on-hand unchanged.

<!-- screenshot: warehouse/license-plates list (status/qa filters + search) -->
<!-- screenshot: warehouse/license-plates/[lpId] detail (header + state history + moves + genealogy) -->
<!-- screenshot: scanner warehouse hub (Receive / Putaway / Move LP / Pick / LP info tiles) -->

---

## d. User how-tos

> Desktop button labels are i18n keys from the warehouse bundles; scanner labels come
> from the scanner PWA bundles. The write paths cited are the actions/routes above.

### (i) Receive goods against a PO

**Scanner (the normal path):**

1. Log into the scanner with your **PIN** (`/scanner/login`); pick site / line / shift.
2. Home → **Receive (PO)** → the open-PO list (`GET …/scanner/pos`,
   `listScannerPurchaseOrders`).
3. Tap a PO → its lines (ordered / received / remaining), then tap a line.
4. Enter (optional) **Batch** and **Best before**, an optional **destination
   location** (scan/type a code; blank = the warehouse default location), and the
   **Qty** (defaults to remaining). Over-remaining shows an amber warning; the server
   hard-caps at **110% of ordered** (a higher qty → `over_receive_cap`).
5. Tap **Receive** → `POST …/receive-line` (`receiveScannerPoLine`). On success you
   get the new **LP number**, and a **"QC hold"** banner if Require-GRN-QC is on. The
   LP is born `received`/`qa pending`.

**Desktop:** there is no separate desktop receive form — `/warehouse/grns` and
`…/[grnId]` are where you **view** receipts/LPs, **QA-release** an LP, and **cancel**
a wrong line. (See *06-purchasing.md* for the full PO-side receiving overlap.)

### (ii) QA-release an LP (make it FEFO-consumable)

1. Open the GRN (`/warehouse/grns/[grnId]`) or the LP (`/warehouse/license-plates/[lpId]`).
2. On a `qa_status='pending'` LP click **Release** (QC pass) or **Reject** →
   `releaseLpQa`. **Release** flips `received→available` and `qa_status='released'`
   (now consumable / pickable); **Reject** flips `received→blocked` + `rejected`.
   Gated on `warehouse.grn.receive`; one-way.

### (iii) Putaway an LP

1. Scanner Home → **Putaway** → scan the LP (`GET …/scanner/lp`,
   `getScannerLpDetail`).
2. Accept a **suggested location** (`GET …/scanner/putaway/suggest`:
   same-product → empty → default) or scan/type your own.
3. **Confirm** → `POST …/scanner/putaway` (`moveScannerLp` putaway). The LP relocates;
   if it was still `received` it is **promoted to `available`** in the same txn (FEFO-
   visible). Requires `warehouse.stock.move`.

### (iv) Move an LP between locations

- **Scanner:** Home → **Move LP** → scan LP → scan destination → confirm →
  `POST …/scanner/move` (`moveScannerLp` transfer). Pure relocation (no promotion);
  refuses terminal LPs.
- **Desktop:** `/warehouse/license-plates/[lpId]` → **Move** → pick a destination from
  the location picker (`listLocations`) → `createStockMove`. Refuses
  `consumed/destroyed/shipped` (`immovable_status`) or an LP locked by another user.

### (v) Pick (FEFO) to a work order

1. Scanner Home → **Pick** → choose a pickable WO (`GET …/scanner/pick/wos`,
   `listPickWorkOrders`) and a material.
2. The screen shows **FEFO-ordered candidate LPs** (`GET …/scanner/pick/lps`,
   `listFefoLps`: `expiry asc nulls last`). Scan the suggested LP and a **destination
   (staging) location** (blank = the line's staging location, else `destination_required`).
3. **Pick** → `POST …/scanner/pick` (`pickScannerLp`): a `move_type='issue'` move
   (no qty deduction — consume happens later in Production). Only **QA-released** stock
   is pickable; item/UoM must match the material.

### (vi) Look up an LP + its genealogy

1. `/warehouse/license-plates` → filter/search → open `…/[lpId]` → `getLpDetail`
   (header, **child LPs**, **state-history ledger**, **stock moves**).
2. For the full lineage open the **Genealogy** view (`/warehouse/genealogy`) or the
   LP's genealogy tab → `traceGenealogy` (`queryGenealogy`): ancestors + self +
   descendants, walking both `parent_lp_id` and `lp_genealogy` edges (e.g. a production
   output LP back to the consumed input LPs). On the scanner, the **LP info** tile shows
   the parents/children chain inline.

### (vii) Run a stock count + apply variance

1. `/warehouse/counts` → **New count** → pick a **warehouse** and **type**
   (`cycle`/`full`/`spot`) → `createCountSession`. (Gated on `warehouse.stock.adjust`.)
2. Open the session (`getCountSession`) and, per slot, enter the **counted qty**
   (optional batch/expiry) → `recordCount`. The system qty is read live from
   `v_inventory_available` and the **variance** is computed and shown per line.
3. On a variance line click **Approve & apply** → enter your **e-sign PIN/password**
   (CFR-21) → `approveAndApplyVariance`. The server re-reads live on-hand
   (refuses if it changed — `stock_changed_recount_required`), then for a **positive**
   variance mints an `available/released` adjustment LP, and for a **negative** one
   FEFO-drains existing LPs (a zeroed LP → `destroyed`). It writes
   `stock_adjustments` + a signed `adjustment` `stock_moves` row and marks the line
   `applied`.

### (viii) Direct stock adjustment (no count session)

> Use this for a **one-off** found-stock / damage / write-off correction on a known
> location+item — **not** a full reconciliation. For a session-based blind count whose
> variance you review and apply, use **(vii) stock count** instead. Both write the same
> `stock_adjustments`/`stock_moves` ledger; this one skips the `count_sessions` wrapper.

1. Warehouse hub → **Adjustments** card (`/warehouse/adjustments/new`; the hub card is
   wired in `warehouse/page.tsx:71-75`). Gated on `warehouse.stock.adjust` — a holder
   without it sees an access-denied panel.
2. Pick a **location** (site + warehouse derived from it), an **item** (`searchAdjustItems`
   — any stocked type), a **direction**, a **quantity** + **UoM**, and a **reason code**
   (`found_stock / spillage_damage / expiry_write_off / data_entry_error / system_sync /
   other`; free-text required on `other`).
3. **Increase (add found stock):** optionally enter **batch / best-before**, then your
   **e-sign PIN/password** → `applyDirectAdjustment` mints a **new LP** at
   `qa_status='pending'` (a **QA-hold** — it is not FEFO-consumable until QA releases
   it, exactly like a received LP). Passing a specific LP on an increase is refused
   (`use_count_session`) — top up via a count instead.
4. **Decrease (remove damaged/expired):** optionally pin a **specific pallet (LP)**
   (`listDecreaseLps`, else the server FEFO-drains the location); then **two people sign**
   — your own e-sign PIN **and** a **distinct supervisor** (`searchEligibleSupervisors`)
   who independently holds `warehouse.stock.adjust` and enters **their** PIN. The
   supervisor cannot be you (`supervisor_self_approval`), must be enrolled
   (`supervisor_pin_not_enrolled`) and is re-checked in-txn
   (`supervisor_pin_invalid` / `_locked` / `supervisor_forbidden`). This mirrors the
   scanner over-consume / reverse-consume second-person gate. The server FEFO-drains
   `available`/`released`/unreserved LPs (an LP zeroed → `destroyed`) and refuses if
   there isn't enough unreserved stock (`insufficient_unreserved` / `insufficient_stock`).
5. On success you get the **affected LP** number. Re-submitting the same operation is a
   safe no-op (idempotent on `clientOpId`). There is no one-click undo — reverse with a
   counter-adjustment.

### (ix) Cancel / correct a wrong receipt

1. `/warehouse/grns/[grnId]` → on an active line click **Cancel** (visible only if you
   hold `warehouse.receipt.correct` and the GRN isn't cancelled).
2. Pick a **reason code** (`entry_error / wrong_quantity / wrong_batch / wrong_product
   / other`) + optional note → `cancelGrnLine`. The LP is voided to `returned` (qty 0)
   and the line drops out of the PO rollup. If the LP already moved / was reserved or
   consumed / has children, it's refused (`lp_not_cancellable`) — use a stock count
   adjustment instead. **No e-sign.**
3. **Wrong batch/expiry only?** Don't cancel — use the LP **metadata correction**
   (`updateLpMetadata`) from the LP screen to fix expiry/batch in place (audited; same
   `warehouse.receipt.correct` gate). Refused on terminal/`returned` LPs.

### (x) Block / unblock an LP (warehouse-side hold)

1. `/warehouse/license-plates/[lpId]` → **Block** → reason → `blockLp` opens a real
   `quality_holds` row and flips the LP `blocked`/`on_hold` (gated `warehouse.lp.block`).
2. **Unblock** → reason → `unblockLp` delegates to 09-quality's hold-release path; the
   LP returns to `available`/`released`. See *09-quality.md* for the hold model.

---

## e. Data sources (Supabase tables)

Core LP / receipt / movement (read/write, 05-warehouse canonical):

- `license_plates` — the LP (status/qa_status/quantity/reserved_qty/batch/expiry/best_before/location/warehouse/site/origin/parent_lp_id/grn_id/wo_id/reserved_for_wo_id/locked_by).
- `lp_state_history` — append-only LP transition ledger (genesis, QA, putaway, reserve, block, cancel, metadata, shrinkage).
- `lp_genealogy` — child↔parent LP edges (`consumed`/`derived`), traversed by `queryGenealogy`.
- `grns` / `grn_items` — GRN header (day-draft, source_type='po') + receipt lines (received_qty, po_line_id, lp_id, `cancelled_at`/reason).
- `stock_moves` — explicit move ledger (`putaway`/`transfer`/`issue`/`adjustment`; idempotent on `(org_id, transaction_id)`).
- `count_sessions` / `count_lines` / `stock_adjustments` — stock-count sessions, counted lines + variance, applied adjustments (mig 318). `stock_adjustments` is **also** written by the direct adjustment (mig 328 adds `approved_by` + a reason-code CHECK constraining `reason` to the 6 direct-adjust codes + a SoD CHECK `approved_by <> applied_by`).
- `locations` / `warehouses` — facility tree + warehouse master (read for moves, putaway, tree, default-location resolution).
- `warehouse_storage_settings` — `expiry_warning_days` per warehouse (expiry tiers).

Views / cross-module reads:

- `v_inventory_available` — **the FEFO/pickability view** (`available` + `released` minus reserved, `expiry asc nulls last`); single source for consume/pick/count system-qty.
- `v_active_holds` — active quality holds (read in `blockLp` to refuse a double-block).
- `purchase_orders` / `purchase_order_lines` / `suppliers` — PO half of the receive (read + status rollup).
- `work_orders` / `wo_executions` / `wo_materials` — reserve / pick targets (read).
- `items` — item master (item code/name, `shelf_life_days`/`shelf_life_mode`, `uom_base`; read).
- `quality_holds` / `quality_hold_items` / `quality_inspections` — block writes a hold; receive opens a GRN-QC inspection when the flag is on (09-quality-owned).
- `tenant_variations` — `feature_flags->require_grn_qc_inspection` (read).
- `print_jobs` — LP/label print history (E1; read via `listPrintJobs`).
- `users` / `user_roles` / `roles` / `role_permissions` / `user_pins` — the direct-adjustment SoD gate (read): `searchEligibleSupervisors` lists distinct PIN-enrolled `warehouse.stock.adjust` holders and `applyDirectAdjustment` re-verifies the supervisor's grant + PIN in-txn.

Governance / events:

- `e_sign_log` — CFR-21 e-sign for `approveAndApplyVariance` **and** `applyDirectAdjustment` (intent `warehouse.stock.adjust`; the direct decrease additionally verifies a distinct supervisor's PIN against `user_pins`).
- `audit_events` — receipt corrections (`warehouse.receipt.corrected`, `warehouse.lp.metadata_corrected`), stock adjustments (`warehouse.stock.adjusted`, `warehouse.stock.count_metadata_recorded`).
- `outbox_events` — `warehouse.lp.received` (receive), `warehouse.lp.transitioned` (QA release + putaway promotion), `quality.hold.created` (block).
- `scanner_audit_log` — scanner receive/putaway/move/pick idempotency + audit (`(org_id, client_op_id)`).

---

## f. Known gaps / TODO

Grounded in the code that was read — no guesses:

1. **`warehouse.receipt.correct` is NOT in the `Permission` enum.** It is seeded only
   by migrations `293-corrections-foundation.sql` / `296-corrections-hardening.sql`
   and consumed by `receipt-corrections-actions.ts`, but never declared in
   `packages/rbac/src/permissions.enum.ts` (the enum lists `warehouse.inventory.read`,
   `warehouse.stock.move/adjust`, `warehouse.grn.receive`, `warehouse.lp.*` but not
   `receipt.correct`). It is therefore invisible to the enum-lock guard and the
   Settings → Roles matrix — the same drift the production corrections have. Add it.

2. **GRN-line cancel has no e-sign.** A deliberate decision (receiving corrections are
   lower-stakes), but it means a `warehouse.receipt.correct` holder can void a receipt
   LP with only an audit row — no second-signer. Variance apply, by contrast, **does**
   require a CFR-21 e-sign.

3. **The scanner inventory-write routes borrow `warehouse.stock.move` for everything.**
   Putaway, move and **pick** all gate on the single `warehouse.stock.move` string
   (`move/route.ts`, `putaway/route.ts`, `pick/route.ts`); there is no distinct
   `warehouse.lp.pick` / `warehouse.putaway` permission, so you cannot grant pick
   without granting free-form moves.

4. **Receive over-cap is a fixed 110%** (`receive-po.ts:271`, `cap = ordered*110/100`)
   — not driven by the Settings over-receive thresholds used in production consumption.
   No per-org configurability (same gap as Purchasing).

5. **The desktop `createStockMove` is `transfer`-only and has no FEFO/putaway promotion.**
   Putaway promotion (`received→available`) lives **only** on the scanner path
   (`moveScannerLp`); a desktop `createStockMove` of a still-`received` LP relocates it
   but does **not** promote it, so desktop-only sites must QA-release to make stock
   pickable. There is no desktop pick screen at all (pick is scanner-only).

6. **`unblockLp` reaches across into 09-quality** (`releaseHoldFromWarehouseLpUnblock`)
   — a warehouse action whose permission gate lives inside the quality delegate, not in
   the warehouse RBAC family. Flagged so the reader knows the unblock permission is
   quality-owned, while `blockLp` gates on `warehouse.lp.block`.

7. **Count metadata (batch/expiry) for an increase-LP is stashed in `audit_events`,
   not a first-class column** (`count-actions.ts` `writeCountLineAdjustmentMetadata` /
   `readCountLineAdjustmentMetadata`) — read back by querying the latest
   `warehouse.stock.count_metadata_recorded` audit row for the line. A modelling
   shortcut, not a dedicated `count_lines.batch_number`/`expiry_date`.

8. **No "merge / split LP" action layer** despite the enum declaring
   `warehouse.lp.merge` / `warehouse.lp.split` and the LP status family including
   `merged`: no `mergeLp`/`splitLp` action was found in `warehouse/_actions/**` or
   `lib/warehouse/**`. The statuses/permissions exist; the operations don't (yet).

9. **Direct adjustment doesn't yet write `stock_adjustments.approved_by`.** Mig 328
   adds the first-class `approved_by` column (+ a SoD CHECK `approved_by <> applied_by`),
   but `applyDirectAdjustment`'s `insertStockAdjustment` INSERT does **not** populate it
   — the countersigning supervisor is currently persisted only in
   `stock_moves.ext_jsonb.supervisor_approved_by` (and `lp_state_history.ext`). Wiring it
   into the `stock_adjustments` row is a flagged follow-up (mig 328 header self-documents
   this). Likewise the reason-code and SoD CHECKs are `NOT VALID` (guard new rows only,
   to stay legacy-safe over old cycle-count rows). Also: there is **no distinct
   `warehouse.stock.adjust.approve` permission** — the supervisor SoD gate reuses
   `warehouse.stock.adjust` itself (same elevated grant the initiator holds), so any
   second adjuster qualifies as a supervisor.

10. **The Inbound schedule and Locations tree own no data layer of their own.** Inbound
   reuses Planning's PO + TO list actions and Locations reuses `listLocations` +
   `listLPs` (counts computed client-side, capped) — flagged so the reader doesn't look
   for `warehouse/inbound/_actions` or a `locationTree` action (there are none).

11. **`apps/worker` outbox consumer does not run.** `warehouse.lp.received` /
    `warehouse.lp.transitioned` / `quality.hold.created` are persisted to
    `outbox_events` but there is no live dispatcher (per `MON-project-overview`), so
    downstream reactions are a seam, not yet delivered.

No raw `// TODO` markers were found in the warehouse action/lib files beyond the
ownership/permission notes cited above; the gaps list is otherwise derived from
capability limits and the enum-vs-migration drift observed in the code.
