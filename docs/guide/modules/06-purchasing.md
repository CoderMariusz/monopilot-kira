# Purchasing — PO → GRN / supplier deliveries (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…`; nothing is invented. The module spans **two route groups**: the
> **Purchase Order** screens live in **Planning** (`/planning/purchase-orders`,
> `…/(modules)/planning/purchase-orders/`) and the **goods-receipt (GRN) / supplier
> delivery** screens live in **Warehouse** (`/warehouse/grns`, plus the scanner
> `/scanner/receive-po` PWA flow). The two halves share one master object — a PO
> line is *received* into a GRN line, which mints a License Plate (LP).
>
> Routes are written without the `[locale]` prefix. Last reviewed against the
> uncommitted working tree (W11-R1 PO draft edit, E-IO export/import, R3 receipt
> corrections).

---

## a. Overview

The Purchasing module turns a planned purchase into stock on hand. A buyer raises a
**Purchase Order** (header + lines: supplier, items, quantities, prices, expected
date), walks it through a server-enforced status machine (`draft → sent → confirmed
→ partially_received → received`, or `cancelled`), and the warehouse **receives**
deliveries against the open PO lines. Each receipt books a **GRN** (Goods Received
Note) line and mints a **License Plate** — born `qa_status='pending'` (never
auto-consumable) — through one shared transaction used by both the desktop and the
scanner. Mistakes are reversible: a wrong receipt is undone by **cancelling the GRN
line** (which voids the LP), and a draft PO is fully editable (lines added/edited/
deleted, header amended) until it is sent.

The PO write/read actions live in
`planning/purchase-orders/_actions/actions.ts`; the shared receive transaction is
`apps/web/lib/warehouse/scanner/receive-po.ts` (`receiveScannerPoLine`); receipt
corrections are `warehouse/_actions/receipt-corrections-actions.ts`.

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission checked
> server-side **inside** the action (a missing permission returns
> `{ ok:false, error:'forbidden' }`, never a 500). Scanner receive is gated by the
> **scanner PIN session** (`requireScannerSession`), not the RBAC permission family.

### Purchase Order actions — `planning/purchase-orders/_actions/actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listPurchaseOrders({status,q,limit,archived})` | List POs (status tab + search on PO number / supplier code; optional archived tab). Joins received-qty Σ from non-cancelled GRN items. | reads `purchase_orders`, `suppliers`, `org_document_settings`, `grn_items`, `grns` | RLS-scoped read (no dedicated read perm — a denied user just sees an empty org-scoped list) | — (read) |
| `getPurchaseOrder(id)` | Header + lines for the detail screen; each line carries `receivedQty` = Σ non-cancelled `grn_items.received_qty`. | reads `purchase_orders`, `purchase_order_lines`, `items`, `suppliers`, `grns`, `grn_items` | RLS-scoped read | — (read) |
| `createPurchaseOrder(input)` | Insert PO header (`status` default `draft`) + ≥1 line. Auto-generates a per-org `po_number` via `nextDocumentNumber` when none supplied (with a 23505 retry). | writes `purchase_orders`, `purchase_order_lines`, `audit_events` (`planning.purchase_order.created`) | `npd.planning.write` | Cancel via `transitionPurchaseOrderStatus(...,'cancelled')` |
| `updatePurchaseOrder({id,supplierId?,expectedDelivery?,currency?,notes?})` | Amend the PO header. **Draft-only** (row-locked `for update`; non-draft → `invalid_state`). | writes `purchase_orders`, `audit_events` (`planning.purchase_order.updated`) | `npd.planning.write` | (Is itself the amend path; revert by editing again while draft) |
| `addPurchaseOrderLine({poId,itemId,qty,uom,unitPrice})` | Append a line (auto `line_no = max+1`, savepoint-retried on 23505). **Draft-only.** Item must be in-org. | writes `purchase_order_lines`, `audit_events` (`planning.purchase_order.line_added`) | `npd.planning.write` | `deletePurchaseOrderLine` |
| `updatePurchaseOrderLine({poId,lineId,qty?,uom?,unitPrice?})` | Edit a line's qty / UoM / unit price. **Draft-only.** | writes `purchase_order_lines`, `audit_events` (`planning.purchase_order.line_updated`) | `npd.planning.write` | Edit again, or delete |
| `deletePurchaseOrderLine({poId,lineId})` | Delete a line and renumber the rest. **Draft-only.** Refuses the **last** line → error `last_line`. | writes/deletes `purchase_order_lines`, `audit_events` (`planning.purchase_order.line_deleted`) | `npd.planning.write` | `addPurchaseOrderLine` |
| `transitionPurchaseOrderStatus(id,status)` | Move the PO along the legal state machine `PO_TRANSITIONS` (re-validated server-side). Terminal `received` / `cancelled` have no successors. | writes `purchase_orders`, `audit_events` (`planning.purchase_order.status_changed`) | `npd.planning.write` | Forward-only + `cancelled`. No "uncancel" / "un-receive" of the **header**; the receipt itself is reversed at GRN-line level. `partially_received`/`received` are normally written by the receive transaction, not the button. |

### PO read helpers — `planning/purchase-orders/_actions/po-form-data.ts`

| Action | What it does | Reads | Gate |
|---|---|---|---|
| `listPoSuppliers()` | Active suppliers for the create-PO supplier `<Select>` (delegates to `planning/suppliers` `listSuppliers`). | `suppliers` | RLS-scoped |
| `searchPoItems(input)` | Item picker for PO lines; widens the default item search to ALL purchasable types (`rm, ingredient, intermediate, co_product, byproduct, packaging` — packaging is orderable). | `items` | RLS-scoped |
| `listPoUnits()` | Active UoM options for the line UoM dropdown, from `public.unit_of_measure` (admin-added units appear). | `unit_of_measure` | RLS-scoped |
| `listPurchaseOrderLineCounts()` | Per-PO line count for the list "Lines" column. | `purchase_order_lines` | RLS-scoped |

### PO export / import — `create-export-job.ts`, `import-po.ts`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `createExportJob({status?,q?,supplierId?,archived?})` | **E-IO** — CSV export of the *current filtered* PO list (re-runs `listPurchaseOrders` + `listPurchaseOrderLineCounts`; human-readable, supplier **code**, no UUIDs). Logs a `kind='export'` ledger row that surfaces in Settings → Import/Export. | reads `purchase_orders` (via list); writes `import_export_jobs` (`kind='export', target='purchase_orders', status='completed'`) | `npd.planning.write` | — (read/export only) |
| `validatePoImport(rows)` | Dry-run validate import rows against suppliers / active items / UoM (per-row, per-column errors; date-not-in-past check). | reads `suppliers`, `items`, `unit_of_measure`, `purchase_orders` | `npd.planning.write` | — (validation) |
| `commitPoImport(rows,{mode})` | Bulk-create POs from rows grouped by `(supplier_code, external_ref)`; `all_or_nothing` vs `skip_invalid`. Skips rows whose `external_ref` already exists as a `po_number`. Delegates each group to `createPurchaseOrder`. | writes `purchase_orders`, `purchase_order_lines` (via create) + `import_export_jobs` (`kind='import'`) + audit | `npd.planning.write` | Cancel each created PO (draft) individually |

### Goods receipt / supplier delivery — shared receive + warehouse actions

| Action (file) | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `receiveScannerPoLine(client,session,input)` (`lib/warehouse/scanner/receive-po.ts`) | **The one receive transaction** (desktop + scanner share it). For an open PO line (`sent`/`confirmed`/`partially_received`): get-or-create today's draft GRN, insert `grn_items`, mint the LP (`status='received', qa_status='pending'`), write LP genesis, emit `warehouse.lp.received`, roll up PO status to `partially_received`/`received`, and — if `feature_flags->require_grn_qc_inspection` is ON — open a pending `quality_inspections`. **Over-receive cap = 110% of ordered → `over_receive_cap` (409).** Idempotent on `client_op_id`. | writes `grns`, `grn_items`, `license_plates`, `lp_state_history`, `outbox_events`, `quality_inspections`, `purchase_orders` (rollup), `scanner_audit_log` | Scanner PIN session (`requireScannerSession`) — NOT an RBAC permission | `cancelGrnLine` (below) |
| `listScannerPurchaseOrders` / `getScannerPurchaseOrder` (same file) | Scanner reads: open POs (statuses `sent`/`confirmed`/`partially_received`) + a single PO's lines with received-qty rollup. | reads `purchase_orders`, `suppliers`, `purchase_order_lines`, `items`, `grn_items` | Scanner PIN session | — (read) |
| `cancelGrnLine({grnItemId,reasonCode,note?})` (`warehouse/_actions/receipt-corrections-actions.ts`) | **R3 receipt correction** — cancel one GRN receipt line. Voids its LP (`status='returned', quantity=0`), stamps `cancelled_at`/reason on the GRN item, writes LP history + audit. Refuses if the LP has moved/reserved/consumed or has children (`lp_not_cancellable`) or is already cancelled. **No e-sign** (receiving corrections are lower-stakes). | writes `license_plates`, `grn_items`, `lp_state_history`, `audit_events` (`warehouse.receipt.corrected`) | `warehouse.receipt.correct` (admin / supervisor tier per SoD seed — not the base receiver) | This *is* the reverse of a receive |
| `updateLpMetadata({lpId,expiryDate?,batchNumber?,reasonCode,note})` (same file) | **R3 metadata correction** — fix a received LP's expiry / batch (wrong best-before keyed at receipt). Blocked on terminal/returned LPs. | writes `license_plates`, `lp_state_history`, `audit_events` (`warehouse.lp.metadata_corrected`) | `warehouse.receipt.correct` | Edit again (audited each time) |
| `releaseLpQa({lpId,decision,note?})` (`warehouse/_actions/lp-qa-actions.ts`) | QA-gate a received LP: `released` auto-promotes `received→available` (FEFO-consumable); `rejected` → `received→blocked`. Pending-only. | writes `license_plates`, `lp_state_history`, `outbox_events` (`warehouse.lp.transitioned`) | `warehouse.grn.receive` | Decision is one-way (`pending`-only); rejected stock can't later be promoted |
| `listGrns` / `getGrnDetail` (`warehouse/_actions/grn-actions.ts`) | GRN list + detail (header facts + receipt lines + created LP link). | reads `grns`, `grn_items`, `suppliers`, `warehouses`, `license_plates` | `WAREHOUSE_READ_PERMISSION` | — (read) |
| `submitConditionCheck(...)` (`quality/_actions/cold-chain-actions.ts`, wired via `cold-chain-adapter.ts`) | **E2B** delivery-condition (cold-chain) temperature check on a GRN line; out-of-range routes a quality hold. | writes cold-chain + hold tables (quality-owned) | `quality.coldchain.record` | (hold release in Quality) |
| `printLabel({entityType:'lp',...})` (Settings → printers, wired via the GRN detail) | Print the LP label for a received line. | writes print-job tables | `settings.org.update` | — |

**Action count inventoried: 22** (8 PO write/transition, 4 PO read helpers, 3 export/import, 7 receive/GRN/correction/QA/cold-chain/print). The PO core is the 8 in `actions.ts`.

---

## c. State machine

### Purchase Order lifecycle (`PO_TRANSITIONS`, `actions.ts:685-692`)

```
 draft ──────► sent ──────► confirmed ─┬─► partially_received ──► received
   │             │              │       │                          (terminal)
   │             │              │       └─► received (terminal)
   └─► cancelled └─► cancelled  └─► cancelled
        (terminal)
```

| State | Legal next states | Who writes it | Notes |
|---|---|---|---|
| `draft` | `sent`, `cancelled` | buyer (button) | **Only state where the PO is editable** — `update*`/`add*`/`delete*PurchaseOrderLine` all hard-require `status='draft'`. |
| `sent` | `confirmed`, `cancelled` | buyer (button) | "Sent to supplier." |
| `confirmed` | `partially_received`, `received`, `cancelled` | buyer (button) **or** the receive txn | Receiving may flip it directly. |
| `partially_received` | `received`, `cancelled` | usually the **receive transaction** (`rollupPurchaseOrderStatus`) | Set when some but not all lines are fully received. |
| `received` | — (terminal) | receive txn / button | All lines received (`Σ received ≥ ordered` for every line). |
| `cancelled` | — (terminal) | buyer (button) | No "uncancel." |

The state machine is enforced **twice**: the detail UI only renders legal buttons
(`po-detail-view.tsx` `TRANSITIONS`), and `transitionPurchaseOrderStatus`
re-validates against `PO_TRANSITIONS` so a forged/stale request can't apply an
illegal jump. The two terminal states have **no successors** — a wrong *receipt* is
corrected at the **GRN-line** level (below), not by mutating the PO header.

### GRN / GRN-line lifecycle

- **GRN header status** (`grns.status`): `draft → completed`, plus `cancelled`. The
  receive transaction always books onto today's **draft** day-GRN
  (`getOrCreateOpenGrn`); a draft GRN's lines still count toward PO received-qty.
- **GRN line** (`grn_items`): created on receive (active), then one-way to
  **cancelled** via `cancelGrnLine` (stamps `cancelled_at` / `cancellation_reason_code`).
  Cancelled lines are excluded from every received-qty rollup
  (`… and gi.cancelled_at is null`).
- **License Plate** (the receipt artifact): born `status='received',
  qa_status='pending'` → QA `releaseLpQa` promotes `received→available`
  (`released`) or `received→blocked` (`rejected`) → `cancelGrnLine` takes a still-
  cancellable LP to `status='returned', quantity=0`. An LP that has already
  moved / reserved / been consumed / has children is **not** cancellable.

**Legality summary:** receive is legal only while the PO is `sent`/`confirmed`/
`partially_received` (`OPEN_PO_STATUSES`); PO-line edits are legal only while
`draft`; GRN-line cancel is legal only while the LP is `received|available` +
`qa_status pending|released`, reserved-qty 0, qty unchanged, no consumption/children.

<!-- screenshot: planning/purchase-orders list (status tabs + Create PO) -->
<!-- screenshot: planning/purchase-orders/[id] detail (lines + status transitions panel) -->

---

## d. User how-tos

> Button labels are i18n keys; the literal English copy comes from the
> `Planning.purchaseOrders.*` / warehouse `grnDetail.*` bundles. The data-testids in
> parentheses are the stable anchors in the component code.

### (i) Create a PO and add lines

1. Go to **Planning → Purchase Orders** (`/planning/purchase-orders`).
2. Click the primary **"+ Create PO"** button top-right (`po-list-create`). (Deep
   link `?new=1` opens the modal automatically.)
3. In the create modal (`create-po-modal.tsx`):
   - **PO number** — optional; leave blank and the server auto-generates a per-org
     number.
   - **Supplier** — pick from the real supplier master (`listPoSuppliers`; required).
   - **Expected delivery**, **Currency** (default EUR), **Notes** — optional.
   - **Lines** — click **Add line**, use the item picker (`searchPoItems`, searches
     `public.items`), set **Qty** (>0, ≤3 dp), pick the **UoM** from the dropdown
     (real `unit_of_measure`, never free text), set **Unit price** (≥0, ≤4 dp).
     Add as many lines as needed (1–200). At least one line is required.
4. **Submit** → `createPurchaseOrder`. The PO is created in `draft`.

### (ii) Send / confirm it

1. Open the PO (click its number / **View** in the list, → `/planning/purchase-orders/[id]`).
2. The right-hand **Status** panel (`po-detail-transitions`) shows only the legal
   buttons for the current state:
   - From **draft**: **Send** (→ `sent`) or **Cancel**.
   - From **sent**: **Confirm** (→ `confirmed`) or **Cancel**.
   - From **confirmed**: **Receive (partial)**, **Receive**, or **Cancel**.
   - From **partially_received**: **Receive**.
3. Click the action; a confirm prompt appears, then `transitionPurchaseOrderStatus`
   runs. In normal operation you don't click "Receive" manually — receiving goods
   (below) rolls the status forward for you. The button exists for back-office
   bookkeeping.

### (iii) Register a delivery / receive goods

**Scanner (the normal path):**

1. Log into the scanner with your **PIN** (`/scanner/login`), pick site / line / shift.
2. Home → **Receive (PO)** tile → `/scanner/receive-po` (real open-PO list).
3. Tap the PO → `…/[poId]` (its lines + ordered/received/remaining).
4. Tap a line → `…/[poId]/[lineId]` (`receive-po-item-screen.tsx`):
   - Optional **Batch** number and **Best before** date.
   - Optional **destination location** — scan/type a location code (Enter resolves
     it); blank = the warehouse's default location.
   - Enter the **Qty** on the keypad (defaults to the remaining qty). Over the
     remaining shows an amber over-receive warning; the server hard-caps at **110%**
     of ordered (a higher qty is refused).
   - Tap **Receive** (`L.receive`). On success you see the new **LP number**, and a
     **"QC hold"** info banner if Require-GRN-QC is on. You can then **Print label**,
     receive the **Next line**, or go **Back to list**.

**Desktop:** there is no separate desktop "receive" form — the desktop GRN screens
(`/warehouse/grns`, `…/[grnId]`) are where you *view* the receipts and the created
LPs, and where you **QA-release** an LP (the **Release** row-action on the GRN detail
→ `releaseLpQa`, flipping the LP to `available` so it becomes FEFO-consumable). The
write path (`receiveScannerPoLine`) is shared, but the operator-facing receive UI is
the scanner.

<!-- screenshot: scanner/receive-po/[poId]/[lineId] receive screen (qty keypad + batch/best-before) -->
<!-- screenshot: warehouse/grns/[grnId] detail (receipt lines + QA release + cancel row-action) -->

### (iv) Cancel / correct a wrong receipt (deregister a delivery)

1. Open the GRN that holds the bad line: **Warehouse → GRNs** (`/warehouse/grns`) →
   the GRN → `…/[grnId]`.
2. On the receipt-lines table, the still-active line shows a **Cancel** row-action
   (`grnDetail.cancelLine.rowAction`) — visible only if the GRN isn't cancelled and
   you hold **`warehouse.receipt.correct`**.
3. The cancel modal (`grn-line-cancel-modal.client.tsx`) asks for a **reason code**
   (`entry_error / wrong_quantity / wrong_batch / wrong_product / other`) and an
   optional note. Submit (red **Cancel line** button) → `cancelGrnLine`.
4. The LP for that line is voided (`status='returned', qty 0`) and the line drops out
   of the PO received-qty rollup. If the LP has already moved / been reserved or
   consumed / has children, the action refuses with **"use a stock adjustment
   instead"** (`lp_not_cancellable`).
5. **Wrong batch/expiry only?** Don't cancel — use the LP **metadata correction**
   (`updateLpMetadata`) from the License-Plate screen to fix expiry/batch in place
   (audited, same `warehouse.receipt.correct` gate).

### (v) Reopen a draft / amend

A PO is fully editable **only while `draft`** (before you Send it):

1. Open the draft PO (`/planning/purchase-orders/[id]`). An **Edit order**
   button (`po-edit-order`) appears in the header for drafts.
2. **Amend the header** — **Edit order** opens the edit modal (supplier / expected
   date / currency / notes) → `updatePurchaseOrder`.
3. **Edit lines** — the lines table shows **Add line** (`po-add-line`), and per-row
   **Edit** (`po-line-edit-*`) / **Delete** (`po-line-delete-*`):
   - Add → `addPurchaseOrderLine`; Edit → `updatePurchaseOrderLine`; Delete →
     `deletePurchaseOrderLine`.
   - Deleting the **last remaining line is refused** ("Cannot delete the last
     purchase order line", error `last_line`).
4. **There is no "reopen to draft."** Once a PO is `sent`/`confirmed`/etc. these edit
   affordances disappear and the actions return `invalid_state`. To change a sent PO
   you cancel it and raise a new one. (See *Known gaps*.)

---

## e. Data sources (Supabase tables)

PO half (read/write):

- `purchase_orders` — PO header (status, supplier, expected date, currency, notes, po_number).
- `purchase_order_lines` — PO lines (item, qty, uom, unit_price, line_no).
- `suppliers` — supplier master (read for select / code resolution; managed under `/planning/suppliers`).
- `items` — item master (PO line item resolution; read).
- `unit_of_measure` — UoM options for line dropdowns (read).
- `org_document_settings` — `archive_after_days` for the archive tab (read).
- `import_export_jobs` — export/import ledger rows (write).
- `audit_events` — every PO write (`planning.purchase_order.*`).

Receive / GRN half (read/write):

- `grns` — GRN header (day-draft, source_type='po', supplier, warehouse).
- `grn_items` — GRN receipt lines (received_qty, po_line_id, lp_id, cancellation fields).
- `license_plates` — the LP minted per receipt (status/qa_status/qty/batch/expiry/location).
- `lp_state_history` — LP genesis + QA + correction transitions.
- `outbox_events` — `warehouse.lp.received`, `warehouse.lp.transitioned`.
- `quality_inspections` — pending GRN-QC inspection when the org flag is on.
- `scanner_audit_log` — scanner receive idempotency + audit.
- `tenant_variations` — `feature_flags->require_grn_qc_inspection` (read).
- `warehouses`, `locations` — receive destination resolution (read).

---

## f. Known gaps / TODO

Grounded in the code that was read — no guesses:

1. **No dedicated PO read / IO permission.** PO list/detail rely on RLS only (no
   `planning.po.view`), and the export job reuses `npd.planning.write` with an
   explicit `TODO(E-IO): dedicated io.export.run permission`
   (`create-export-job.ts:25`). A user with the planning-write grant can also export.
2. **No "reopen to draft" and no header un-receive.** `PO_TRANSITIONS` is
   forward-only with terminal `received`/`cancelled` (`actions.ts:685`); edits are
   draft-only. Amending a sent PO means cancel + recreate. There is no reverse of the
   PO header status flip — only the GRN line is reversible.
3. **PO transition has no e-sign / approval gate.** The prototype's
   submit / pending-approval / approve / reject workflow is **not** in the backend;
   the UI maps those buttons 1:1 onto the real send/confirm/receive transitions
   (documented deviation in `po-detail-view.tsx:14-26` and `po-list-view.tsx:14-30`).
   There is no money rollup, no per-line discount, no GRN-progress/approval/D365 card
   — `getPurchaseOrder` returns header + lines only.
4. **Receive over-cap is a fixed 110%** (`receive-po.ts:271`, `cap = ordered * 110 / 100`)
   — not driven by the Settings over-receive thresholds used in production
   consumption. No per-org configurability.
5. **GRN-line cancel has no e-sign.** A deliberate decision (receiving corrections are
   lower-stakes than production e-sign), documented in
   `grn-line-cancel-modal.client.tsx:5-11`. It still requires `warehouse.receipt.correct`
   and writes an audit event, but there is no second-signer control.
6. **The desktop has no first-class "receive" form.** Operators receive via the
   scanner PWA; the desktop GRN screens are view + QA-release + correct only. There is
   no desktop equivalent of the scanner receive line screen.
7. **Bulk PO import is gated behind the import hub.** `commitPoImport` / `validatePoImport`
   exist and are real, but per the golden-flow notes the central Settings Import/Export
   **import** surface is rendered disabled (`featureAvailable={false}`); the live PO-list
   **Import** button deep-links to `/planning/import?source=po`. Verify that route is
   wired before relying on it.
8. **Supplier master is out of this module's action layer.** PO actions only *read*
   `suppliers`; create/edit of suppliers lives in `/planning/suppliers`
   (`suppliers/_actions/actions.ts`) — flagged so the reader doesn't expect supplier
   CRUD inside purchasing.

No literal `// TODO` markers were found in the PO `actions.ts` itself beyond the
export-permission one cited above; the gaps list is otherwise derived from
state-machine / capability limits observed in the code.
