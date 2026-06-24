# Shipping — SO → allocate → pick → pack → ship → BOL/POD + reversals (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. The module is a **single
> route group** — the desktop **Sales Order** screens live at
> `/shipping` (`…/(modules)/shipping/`, list + `[soId]` detail) and the
> **Shipment / pack / ship** screens live at `/shipping/shipments`
> (`…/shipping/shipments/`, list + `[shipmentId]` pack screen). There is no
> scanner half for shipping. Settings for the module's override / RMA reason
> codes live under `/settings/ship-override-reasons`.
>
> A **Sales Order** (SO) is the master object; it walks a server-enforced
> 12-state lifecycle. **Allocation** reserves real **License Plate** (LP) stock
> through the canonical `inventory_allocations` table; **packing** mints
> **boxes** (each with a GS1 **SSCC-18**) on a **Shipment** child object; the
> shipment is **sealed → shipped**, a **BOL** (SHA-256-hashed) is generated, and
> a **POD** (proof of delivery) is recorded. Mistakes are reversible:
> **cancelShipment**, **unpackShipment**, and **voidPod** each take a CFR-21
> e-signature and post audit + outbox events.
>
> Routes are written without the `[locale]` prefix. Last reviewed against the
> working tree (so-actions 12-state machine, pack/SSCC, ship/BOL/POD, and the
> W11 shipping reversibility actions).

---

## a. Overview

The Shipping module turns a customer order into shipped, proven-delivered stock.
A user raises a **Sales Order** (header: customer, requested date, notes; lines:
finished-goods item, qty, UoM), walks it through a **12-state** server-enforced
status machine (`draft → confirmed → allocated → partially_picked → picked →
partially_packed → packed → manifested → shipped → partially_delivered →
delivered`, plus `cancelled`), and ships against it.

The pipeline is two object families joined by the LP:

- **Allocation** (`allocateSalesOrder`) walks each SO line FEFO over `available`
  + `qa_status='released'` License Plates, inserts canonical
  **`inventory_allocations`** rows, and bumps each LP's `reserved_qty` (a soft
  reservation — the LP isn't decremented, just reserved). `deallocateSalesOrder`
  is the exact inverse.
- **Packing** (`createShipment` → `packLpIntoBox` → `sealShipment`) creates a
  **Shipment** child of the SO, mints **boxes** (`shipment_boxes`, each with a
  server-generated **SSCC-18**), and records which LP went into which box
  (`shipment_box_contents`). **Shipping** (`shipShipment`) flips the LPs to
  `status='shipped'`, emits `warehouse.lp.shipped`, and rolls the SO to
  `shipped`. **BOL** (`generateBol`) hashes a bill-of-lading payload with
  **SHA-256** and stamps carrier/tracking on the shipment. **POD** (`recordPod`)
  marks the shipment `delivered` and — when it's the SO's last open shipment —
  rolls the SO to `delivered`.

**Pick** is *not* a separate write action in the implemented layer: the
`allocated → partially_picked → picked` transitions are plain
`transitionSalesOrderStatus` status moves (there is no pick-list / wave executor
— see *Known gaps*).

Mistakes are reversible (W11 shipping reversibility, `cancelShipment.ts`):

- **`cancelShipment`** — release the shipment's allocations + LP reservations,
  un-ship any shipped LPs (`shipped → available`), set the shipment `cancelled`,
  and **recompute** the parent SO status from the remaining shipments.
- **`unpackShipment`** — soft-delete the boxes + contents and roll the shipment
  `packed`/`manifested → packing`.
- **`voidPod`** — un-deliver a shipment (`delivered → shipped`, clear
  `delivered_at` / signed-BOL), guarded by a **downstream-financial-record**
  check (refuses if an invoice/payment references the shipment or SO).

All three reversals require a **CFR-21 e-signature** (`signEvent`), write an
`audit_events` row, and emit an outbox event.

The SO write/read actions live in `shipping/_actions/so-actions.ts`; the
create-SO read helpers in `so-form-data.ts`; pack/SSCC in `pack-actions.ts`;
ship/BOL/POD in `ship-actions.ts`; the three reversals in `cancelShipment.ts`;
the override/RMA reason-code admin in
`settings/ship-override-reasons/_actions/shipping-overrides.ts`.

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission checked
> server-side **inside** the action (a missing permission returns a typed
> `forbidden` / `{ok:false,error:'forbidden'}`, never a 500). All actions run
> inside `withOrgContext` (RLS: `org_id = app.current_org_id()`); no
> service-role bypass, no mocks. The `hasPermission` helper grants via either a
> `role_permissions` row **or** the legacy `roles.permissions` jsonb array.

### Sales Order — `shipping/_actions/so-actions.ts`

| Action | What it does | Reads / writes | Gate (`ship.*`) | Reverse / correction |
|---|---|---|---|---|
| `listSalesOrders({status?,search?})` | SO list (status tab + search on SO number / customer name / customer code; line count + Σ line total; cap 200). | reads `sales_orders`, `sales_order_lines`, `customers` | `ship.dashboard.view` | — (read) |
| `getSalesOrder(id)` | Header + lines for the detail screen; each line carries `allocated_qty` + a derived `allocation_status` (`unallocated`/`partially_allocated`/`allocated`). | reads `sales_orders`, `sales_order_lines`, `items`, `customers` | `ship.dashboard.view` | — (read) |
| `createSalesOrder({customer_id,requested_date?,notes?,lines[]})` | Insert SO header (`status='draft'`, `order_number` via `next_sales_order_document_number`) + ≥1 line. Per-line `unit_price_gbp` resolved by `resolveSalesLinePrice` (item `list_price_gbp` fallback; per-customer price list is a stub). Refuses zero lines / unknown item. | writes `sales_orders`, `sales_order_lines` | `ship.so.create` | Cancel via `transitionSalesOrderStatus(...,'cancelled')` |
| `transitionSalesOrderStatus(id,newStatus)` | Move the SO along `LEGAL_TRANSITIONS` (re-validated server-side). `cancelled` first deallocates. Covers the manual `confirm` / `pick` / `pack` / `manifest` / `cancel` moves. Permission depends on target (`confirm→ship.so.confirm`, `cancel→ship.so.cancel`, else `ship.so.create`). | writes `sales_orders` (+ allocation/LP release on cancel) | per-target (see *State machine*) | Mostly forward-only; `cancel` is the terminal escape |
| `allocateSalesOrder(id)` | `confirmed → allocated`. For each line, FEFO-walk `license_plates` (`available`+`released`, `qty-reserved>0`, `order by expiry asc nulls last` with `for update`), insert `inventory_allocations` rows, bump LP `reserved_qty`, set line `quantity_allocated`. Hard-fails `INSUFFICIENT_STOCK` (with needed/available) if any line can't be fully covered. | reads `sales_order_lines`, `license_plates`; writes `inventory_allocations`, `license_plates` (reserved_qty), `sales_order_lines`, `sales_orders` | `ship.so.create` *(reuses create — no granular `ship.so.allocate` exists; see gaps)* | `deallocateSalesOrder` |
| `deallocateSalesOrder(soId)` | Release every `allocated` allocation for the SO: `inventory_allocations.status='released'`, decrement LP `reserved_qty` (floored at 0), zero `quantity_allocated`, roll SO back to `confirmed`. | writes `inventory_allocations`, `license_plates`, `sales_order_lines`, `sales_orders` | `ship.so.create` | `allocateSalesOrder` |

### SO read helpers — `shipping/_actions/so-form-data.ts` + `sales-line-price.ts`

| Action | What it does | Reads | Gate |
|---|---|---|---|
| `listSoCustomers()` | Active customers for the create-SO customer `<Select>` (real `public.customers`, active, code-sorted, cap 200). Deny-safe `[]` on failure. | `customers` | RLS-scoped (no perm check) |
| `searchSoItems(input)` | Item picker for SO lines, restricted to **fg** (a SO ships finished goods). Delegates to NPD `searchItems`. | `items` | RLS-scoped |
| `getSoCapabilities()` | Advisory RBAC probe for the SO-detail buttons (`canAllocate=ship.so.create`, `canConfirm=ship.so.confirm`, `canCancel=ship.so.cancel`). Deny-safe all-false. | `user_roles`, `role_permissions`, `roles` | RLS-scoped |
| `resolveSalesLinePrice(item,opts)` (`sales-line-price.ts`, pure helper — not a Server Action) | Returns the SO line unit price. Currently `item.list_price_gbp ?? 0`; `opts.customerId` is **reserved** for a future per-customer price list. | — | — |

### Pack / boxes / SSCC — `shipping/_actions/pack-actions.ts`

| Action | What it does | Reads / writes | Gate (`ship.*`) | Reverse / correction |
|---|---|---|---|---|
| `createShipment(soId)` | Open a **Shipment** (`status='packing'`) for an SO that is `allocated`/`partially_allocated`. Copies `customer_id` / `shipping_address_id` / `site_id` off the SO. | reads `sales_orders`; writes `shipments` | `ship.pack.close` | `cancelShipment` |
| `packLpIntoBox({shipmentId,lpId,boxId?})` | Resolve the LP (by UUID or `lp_number`/`lp_code`), verify it's allocated (`inventory_allocations.status in ('allocated','picked')`) to a line of this shipment's SO and **not already packed**, then insert a `shipment_box_contents` row. If no `boxId`, mint a new `shipment_boxes` row with a server **SSCC-18** (`generate_sscc`) + next box number. | reads `license_plates`, `shipment_box_contents`, `inventory_allocations`, `sales_order_lines`, `shipment_boxes`; writes `shipment_boxes`, `shipment_box_contents` | `ship.pack.close` | `unpackShipment` (voids all boxes) |
| `getShipment(id)` | Shipment detail: header (status, SO#, customer, box count, BOL/signed-BOL URLs, carrier/tracking, packed/shipped/delivered timestamps) + boxes with SSCC + per-box contents (LP code, item, qty). | reads `shipments`, `sales_orders`, `customers`, `shipment_boxes`, `shipment_box_contents`, `license_plates`, `items` | `ship.dashboard.view` | — (read) |
| `listShipments({status?})` | Shipment list (optional status filter, box count, customer; cap 200). | reads `shipments`, `sales_orders`, `customers`, `shipment_boxes` | `ship.dashboard.view` | — (read) |

### Ship / BOL / POD — `shipping/_actions/ship-actions.ts`

| Action | What it does | Reads / writes | Gate (`ship.*`) | Reverse / correction |
|---|---|---|---|---|
| `sealShipment(shipmentId)` | `packing → packed`. Requires ≥1 box (`no_boxes` else). Stamps `packed_at`/`packed_by`. | writes `shipments` | `ship.pack.close` | `unpackShipment` |
| `shipShipment(shipmentId)` | `packed → shipped`. Flips every packed LP to `status='shipped', reserved_qty=0`, emits one `warehouse.lp.shipped` per LP, rolls the **parent SO** to `shipped` (sets `shipped_at`). Hard-fails if not exactly all LPs updated. | reads `shipment_box_contents`, `shipment_boxes`, `license_plates`; writes `shipments`, `license_plates`, `outbox_events`, `sales_orders` | `ship.pack.close` *(NOT `ship.ship.confirm`; that perm is declared but unused — see gaps)* | `cancelShipment` |
| `generateBol({shipmentId,carrier?,serviceLevel?,trackingNumber?})` | Build a BOL payload (shipment, org, carrier, LP list, timestamp), **SHA-256** it, stamp `carrier`/`service_level`/`tracking_number`/`bol_pdf_url`(=serialized payload) on the shipment + `ext_data.bol_sha256`. Returns the hash as `bolRef`. | reads `shipment_box_contents`, `license_plates`; writes `shipments` | `ship.pack.close` | — (regenerate overwrites) |
| `recordPod({shipmentId,signedPdfUrl?})` | **The POD** (proof of delivery). `→ delivered`, stamp `delivered_at` + `bol_signed_pdf_url`. When this is the SO's **last** non-delivered shipment, roll the SO to `delivered`. | writes `shipments`, `sales_orders` | `ship.dashboard.view` *(a read-tier perm gates a delivery write — see gaps)* | `voidPod` |

### Reversals — `shipping/_actions/cancelShipment.ts`

> All three take `{shipmentId, reasonCode?, note?, signature:{password,nonce?}}`,
> **zod-validate** the input, **row-lock** the shipment + its SO `for update`,
> **CFR-21 e-sign** (`signEvent`, per-reversal intent), write an `audit_events`
> row, and emit an outbox event. Idempotent-ish: each re-checks current state and
> `cancelShipment` short-circuits `ok:true` if already cancelled.

| Action | What it does | Reads / writes | Gate (`ship.*`) | Reverse direction |
|---|---|---|---|---|
| `cancelShipment(input)` | Void a non-terminal shipment. Releases its `inventory_allocations` (`→released`, decrement LP `reserved_qty`), un-ships any `shipped` LP (`→available`, clear `source_so_id`, write `lp_state_history` + `warehouse.lp.transitioned`), sets shipment `cancelled`, then **recomputes** the SO status from remaining shipments+allocations. Blocks on terminal shipment status or SO `delivered`/`partially_delivered`/`cancelled`. e-sign intent `cancel_shipment`. | reads/writes `shipments`, `inventory_allocations`, `license_plates`, `lp_state_history`, `sales_orders`; writes `audit_events`, `outbox_events` (`shipping.so.cancelled`, `warehouse.lp.transitioned`); `e_sign_log` | `ship.so.cancel` | **is** the reverse of `createShipment`/`shipShipment` |
| `unpackShipment(input)` | Roll `packed`/`manifested → packing`. Soft-deletes (`deleted_at`) all `shipment_box_contents` + `shipment_boxes`, clears `packed_at`/`packed_by`. Blocks if already `shipped`/`delivered`/`cancelled`. e-sign intent `unpack_shipment`. | reads/writes `shipments`, `shipment_boxes`, `shipment_box_contents`; writes `audit_events`, `outbox_events` (`shipping.shipment.packed`), `e_sign_log` | `ship.pack.close` | **is** the reverse of `packLpIntoBox`/`sealShipment` |
| `voidPod(input)` | Un-deliver: `delivered → shipped`, clear `delivered_at` + `bol_signed_pdf_url`, record the void in `ext_data.voided_pod`; roll SO `delivered → shipped`. **Refuses** if a downstream financial record references the shipment/SO (`assertNoDownstreamFinancialRecords` probes `invoices/invoice_payments/payments/sales_invoices/ar_invoices/ar_payments` → `downstream_financial_record`). e-sign intent `void_pod`. | reads `information_schema` + financial tables; writes `shipments`, `sales_orders`, `audit_events`, `outbox_events` (`shipping.shipment.confirmed`), `e_sign_log` | `ship.bol.sign` | **is** the reverse of `recordPod` |

### Settings — override / RMA reason codes — `settings/ship-override-reasons/_actions/shipping-overrides.ts`

| Action | What it does | Reads / writes | Gate |
|---|---|---|---|
| `readShippingOverridesSettingsData()` / `getOverrideTypes` / `getReasonCodes` / `getRmaReasonCodes` | Read the org's shipping **override types** + their **reason codes** + **RMA reason codes** for the settings screen. | reads `shipping_override_types`, `shipping_override_reasons`, `rma_reason_codes` | RLS-scoped reads |
| `createReasonCode` / `updateReasonCode` / `deleteReasonCode` (soft `is_active=false`) | CRUD an override **reason code** (org-scoped, zod-validated). | writes `shipping_override_reasons` | `settings.org.update` | edit again / re-activate |

**Action count inventoried: 21** Server Actions — 6 SO (`so-actions.ts`) + 3 SO
read helpers (`so-form-data.ts`) + 4 pack (`pack-actions.ts`) + 4 ship/BOL/POD
(`ship-actions.ts`) + 3 reversals (`cancelShipment.ts`) + 7 settings reason-code
(`shipping-overrides.ts`) **= 27** if you count the settings reason-code admin;
the **shipping pipeline core is the 20** under `…/(modules)/shipping/_actions/*`
(`resolveSalesLinePrice` is a pure helper, not an action). RMA disposition,
holds (`ship.hold.place`/`release`), allergen/allocation overrides, and DLQ
replay are **declared permissions with no implemented action** (see gaps).

---

## c. State machine

### Sales Order lifecycle (`LEGAL_TRANSITIONS`, `so-actions.ts:116-129`)

```
 draft ─► confirmed ─► allocated ─► partially_picked ─► picked ─► partially_packed ─► packed
   │          │           │              │               │              │              │
   │          │           │              │               │              │              ▼
   │          │           │              │               │              │          manifested
   │          │           │              │               │              │              │
   │          │           │              │               │              │              ▼
   │          │           │              │               │              │           shipped ─► partially_delivered ─► delivered
   │          │           │              │               │              │              │                                (terminal)
   └─cancel───┴──cancel───┴────cancel────┴─────cancel─────┴────cancel────┴──cancel──────┘   (no cancel once shipped+)
                                                                                cancelled (terminal)
```

| State | Legal next states | Permission for the move | Who writes it | Notes |
|---|---|---|---|---|
| `draft` | `confirmed`, `cancelled` | `confirmed`→`ship.so.confirm`; `cancelled`→`ship.so.cancel` | user (button) | **Only state where the SO is editable** in spirit — though no line-edit action exists post-create (see gaps). |
| `confirmed` | `allocated`, `cancelled` | `allocated`→`ship.so.create` (via `allocateSalesOrder`); `cancelled`→`ship.so.cancel` | `allocateSalesOrder` / button | Allocation is the real path to `allocated`. |
| `allocated` | `partially_picked`, `picked`, `cancelled` | `ship.so.create` (pick is a plain transition) | `transitionSalesOrderStatus` | Pick has **no executor** — just a status move. |
| `partially_picked` | `picked`, `cancelled` | `ship.so.create` | button | — |
| `picked` | `partially_packed`, `packed`, `cancelled` | `ship.so.create` | button | Packing happens on the **Shipment**, not here; these SO moves are bookkeeping. |
| `partially_packed` | `packed`, `cancelled` | `ship.so.create` | button | — |
| `packed` | `manifested`, `cancelled` | `ship.so.create` | button | `manifested` is reachable in the machine but **no action writes it** (see gaps). |
| `manifested` | `shipped`, `cancelled` | `ship.so.create` | button | — |
| `shipped` | `partially_delivered`, `delivered` | `ship.so.create` | `shipShipment` writes `shipped`; `recordPod` writes `delivered` | No `cancel` once shipped. |
| `partially_delivered` | `delivered` | `ship.so.create` | `recordPod` / `cancelShipment` recompute | — |
| `delivered` | — (terminal) | — | `recordPod` | Reverse only via `voidPod` (shipment-level). |
| `cancelled` | — (terminal) | — | `transitionSalesOrderStatus` (deallocates first) | No "uncancel." |

The machine is enforced **twice**: the SO-detail UI renders only the legal +
permitted buttons (`so-detail-view.tsx` `allocateLegal`/`confirmLegal`/…), and
`transitionSalesOrderStatusInContext` re-validates against `LEGAL_TRANSITIONS`
server-side — an illegal jump returns `ILLEGAL_TRANSITION {from,to}`.

### Shipment lifecycle (`pack-actions.ts` `ShipmentStatus`)

```
 (createShipment)
       │
       ▼
   packing ──seal──► packed ──ship──► shipped ──recordPod──► delivered
       ▲               │  ▲             │                       │
       │      unpack ──┘  └─ unpack ────┘                       │
       │   (packed/manifested → packing)                        │
       └────────────── cancelShipment ◄── voidPod ──────────────┘
                       (→ cancelled)     (delivered → shipped)
```

| State (`shipments.status`) | Reached by | Reverse | Notes |
|---|---|---|---|
| `packing` | `createShipment` | `cancelShipment` | LPs get packed into boxes here. |
| `packed` | `sealShipment` (≥1 box) | `unpackShipment` (→`packing`) / `cancelShipment` | Stamps `packed_at`/`packed_by`. |
| `manifested` | — *(no action writes it; status exists in `ShipmentStatus` + the SO machine but the shipment never reaches it via code)* | `unpackShipment` accepts it | A reserved/aspirational state (see gaps). |
| `shipped` | `shipShipment` | `cancelShipment` (un-ships LPs) | LPs → `shipped`; SO → `shipped`. |
| `delivered` | `recordPod` | `voidPod` (→`shipped`, financial-guard) | Terminal except via `voidPod`. |
| `cancelled` | `cancelShipment` | — (terminal) | Allocations released, LPs restored, SO recomputed. |
| `exception` | — (mapping fallback for an unknown DB status) | — | Defensive only. |

**LP lifecycle through shipping:** an `available`+`released` LP is **soft-
reserved** by `allocateSalesOrder` (`reserved_qty += qty`, status unchanged) →
packed (reference only) → `shipShipment` flips it `status='shipped',
reserved_qty=0` → `cancelShipment` un-ships it back to `available` (clearing
`source_so_id`). `deallocateSalesOrder` / `cancelShipment` decrement
`reserved_qty` on release.

<!-- screenshot: shipping sales-order list (status tabs + Create SO) -->
<!-- screenshot: shipping/[soId] SO detail (lines + allocation badge + action group) -->
<!-- screenshot: shipping/shipments/[shipmentId] pack screen (scan LP + boxes + SSCC) -->
<!-- screenshot: shipping/shipments/[shipmentId] ship rail (Ship / Generate BOL / Record POD) -->

---

## d. User how-tos

> Button labels are i18n keys; literal English copy comes from the
> `Shipping.*` / shipments bundles. The `data-testid`s in parentheses are the
> stable anchors in the component code.

### (i) Create a SO and add lines

1. Go to **Shipping** (`/shipping`) — the Sales Order list.
2. Click **Create SO** (deep link `?new=1` opens the modal).
3. In the create modal (`create-so-modal.tsx`):
   - **Customer** — pick from the real customer master (`listSoCustomers`;
     required). *There is no "add new customer" here — see Known gaps.*
   - **Requested date**, **Notes** — optional.
   - **Lines** — use the item picker (`searchSoItems`, restricted to **fg**),
     set **Qty** (>0) and **UoM**. At least one line is required; the unit price
     is auto-resolved from the item list price.
4. **Submit** → `createSalesOrder`. The SO is created in `draft`.

### (ii) Confirm → allocate (reserve stock)

1. Open the SO (`/shipping/[soId]`). The action group (`so-detail-view.tsx`)
   shows only the legal + permitted buttons.
2. From **draft**: click **Confirm** (→ `confirmed`,
   `transitionSalesOrderStatus`).
3. From **confirmed**: click **Allocate** → `allocateSalesOrder`. The server
   FEFO-walks released LPs and reserves them. If stock is short you get
   **INSUFFICIENT_STOCK** (needed vs available) and nothing is reserved. The
   allocation badge flips to *Allocated* / *Partially allocated*.
4. To undo before picking: **Deallocate** (`deallocateSalesOrder`) releases the
   reservations and rolls the SO back to `confirmed`.

### (iii) Pick

Picking is a **status transition only** in the implemented layer: from
`allocated`, advancing to `partially_picked` / `picked` is a
`transitionSalesOrderStatus` move (gated by `ship.so.create`). There is no
pick-list / wave executor screen — the physical pick is assumed and the SO
status is advanced as bookkeeping (see Known gaps).

### (iv) Pack (boxes + SSCC)

1. With the SO `allocated`, click **Create shipment** (`createShipment` —
   `ship.pack.close`) from the SO detail. The shipment opens `packing`.
2. Open the shipment pack screen (`/shipping/shipments/[shipmentId]`,
   `shipment-pack-view.tsx`): **scan or type an LP** number into the LP field
   and submit → `packLpIntoBox`. The LP must be allocated to this SO and not
   already packed. A new **box** with an **SSCC-18** is minted automatically (or
   the LP joins the chosen box). Box contents + SSCC render per box.
3. When all LPs are boxed, click **Seal** → `sealShipment` (`packing → packed`;
   needs ≥1 box).

### (v) Ship + Generate BOL

1. On the **ship rail** (`shipment-ship-controls.tsx`) of a `packed` shipment,
   click **Ship shipment** → `shipShipment`. LPs flip to `shipped`, a
   `warehouse.lp.shipped` event fires per LP, and the **parent SO** rolls to
   `shipped`.
2. Click **Generate BOL** (`generate-bol-modal.tsx`) → `generateBol` — enter
   carrier / service level / tracking number. The server SHA-256-hashes the BOL
   payload and stamps it on the shipment; the rail shows the **BOL link** + hash.

### (vi) Record POD (proof of delivery)

1. On a `shipped` shipment, click **Record POD** (`record-pod-modal.tsx`) →
   `recordPod` — optionally attach the **signed BOL** URL. The shipment becomes
   `delivered` (`delivered_at` stamped). If it was the SO's last open shipment,
   the SO rolls to `delivered`.

### (vii) Reverse — cancel a shipment

1. Call `cancelShipment` with the shipment id, a **reason code**, optional note,
   and your **e-sign password** (CFR-21).
2. The action releases the shipment's allocations + LP reservations, un-ships any
   shipped LPs (`shipped → available`), sets the shipment `cancelled`, and
   **recomputes** the parent SO status from what's left. It refuses on a terminal
   shipment or an SO already `delivered`/`partially_delivered`/`cancelled`.
   *(No first-class UI button wires this yet — see Known gaps.)*

### (viii) Reverse — un-pack a shipment

1. Call `unpackShipment` (reason + e-sign) on a `packed` / `manifested`
   shipment. All boxes + contents are soft-deleted and the shipment returns to
   `packing` so you can re-pack. Refused once `shipped`/`delivered`/`cancelled`.

### (ix) Reverse — void a POD

1. Call `voidPod` (reason + e-sign) on a `delivered` shipment. It un-delivers
   (`delivered → shipped`), clears `delivered_at` + the signed BOL, and rolls the
   SO `delivered → shipped`. **Blocked** if any invoice/payment already
   references the shipment or SO (`downstream_financial_record`).

---

## e. Data sources (Supabase tables)

SO half (read/write):

- `sales_orders` — SO header (`order_number`, `status` [12-state], `customer_id`, `promised_ship_date`, `shipped_at`, `total_amount_gbp`, `ext_data.notes`, `site_id`, `shipping_address_id`).
- `sales_order_lines` — SO lines (`line_number`, `product_id`, `quantity_ordered`, `quantity_allocated`, `unit_price_gbp`, `line_total_gbp`, `ext_data.order_uom`).
- `customers` — customer master (read for the select / code resolution). `customer_contacts` / `customer_addresses` / `customer_allergen_restrictions` exist in the schema (mig 211) but aren't touched by these actions.
- `items` — FG item resolution for SO lines (read).
- `inventory_allocations` — **canonical** soft-reservation table (`sales_order_line_id`, `license_plate_id`, `quantity_allocated`, `status` `allocated|picked|released`).

Pack / ship half (read/write):

- `shipments` — Shipment header (`status`, `sales_order_id`, `customer_id`, `shipping_address_id`, `packed_at/by`, `shipped_at/by`, `delivered_at`, `carrier`, `service_level`, `tracking_number`, `bol_pdf_url`, `bol_signed_pdf_url`, `ext_data` [bol_sha256 / cancellation / unpack / voided_pod metadata]).
- `shipment_boxes` — packed boxes (`box_number`, `sscc` [SSCC-18 via `generate_sscc`], `site_id`).
- `shipment_box_contents` — LP-in-box rows (`shipment_box_id`, `sales_order_line_id`, `product_id`, `license_plate_id`, `lot_number`, `quantity`).
- `license_plates` — LP state/reservation (`reserved_qty` bumped on allocate; `status='shipped'` on ship; `source_so_id`).
- `lp_state_history` — LP transition ledger written on cancelShipment un-ship.

Governance / config:

- `e_sign_log` — CFR-21 e-signatures for the three reversals (`signEvent`).
- `audit_events` — reversal audit (`shipping.shipment.cancelled` / `.unpacked` / `shipping.pod.voided`).
- `outbox_events` — `warehouse.lp.shipped` (ship), `shipping.so.cancelled`, `shipping.shipment.packed`, `shipping.shipment.confirmed`, `warehouse.lp.transitioned`.
- `shipping_override_types`, `shipping_override_reasons`, `rma_reason_codes` — Settings reason-code reference data.
- `user_roles`, `roles`, `role_permissions` — RBAC checks.

Declared-but-unused-by-actions schema (mig 211 foundation): `waves`,
`pick_lists`, `pick_list_lines`, `bill_of_lading`, `sscc_counters` — the
implemented pipeline simplifies pick to a status move and stores the BOL on the
`shipments` row instead of `bill_of_lading` (see gaps).

---

## f. Known gaps / TODO

Grounded in the code that was read — these feed the fix backlog:

1. **No customer-create surface (being fixed).** There is **no `createCustomer`
   Server Action anywhere** in `apps/web` — `listSoCustomers` (`so-form-data.ts`)
   only *reads* `public.customers`, and there is no `/shipping/customers` route
   or customer-CRUD UI. A SO can only be raised against a customer that already
   exists in the master; seeding customers must be done out-of-band (SQL /
   import). This is the headline audit finding flagged for repair.

2. **The three reversals are not wired into any UI.** `cancelShipment`,
   `unpackShipment`, and `voidPod` are fully implemented + tested
   (`cancelShipment.test.ts`) but **no `.tsx` component imports or calls them** —
   they're reachable only programmatically. The shipment pack/ship views render
   forward controls only. Wire reversal buttons (with reason + e-sign modal) into
   the shipment detail.

3. **Pick is a status move, not an executor.** The schema has `waves` /
   `pick_lists` / `pick_list_lines` (mig 211) and the enum has
   **`ship.pick.execute`**, but no action reads them: `allocated → picked` is a
   plain `transitionSalesOrderStatus` gated on `ship.so.create`. There is no
   wave-build, no pick-list generation, and no pick confirmation. The physical
   pick is assumed.

4. **`manifested` is reachable in both state machines but no action writes it.**
   It's a valid SO target (`packed → manifested → shipped`) and a valid
   `ShipmentStatus`, and `cancelShipment`/`unpackShipment` *accept* it, but
   nothing transitions a shipment *into* it (`sealShipment` writes `packed`,
   `shipShipment` reads `packed`). It is effectively a reserved/dead state today.

5. **Permission gates don't match the declared enum 1:1 (SoD drift).**
   - `allocateSalesOrder` / `deallocateSalesOrder` / all pick/pack/manifest SO
     moves reuse **`ship.so.create`** — `so-actions.ts:113-114` notes "Migration
     212 seeds no granular `ship.so.allocate`/`deallocate` permission."
   - `shipShipment` is gated on **`ship.pack.close`**, not the declared
     **`ship.ship.confirm`** (which no implemented action reads).
   - `recordPod` (a delivery **write**) is gated on the **read-tier**
     `ship.dashboard.view` — the same perm that gates list/detail reads. Anyone
     who can view shipments can mark one delivered.
   - `voidPod` (un-deliver) is gated on `ship.bol.sign`, while `cancelShipment`
     uses `ship.so.cancel` and `unpackShipment` uses `ship.pack.close` — three
     different gates for the three reversals (intentional but worth confirming
     against the SoD matrix). Several enum perms (`ship.hold.place/release`,
     `ship.alloc.override`, `ship.allergen.override`, `ship.rma.disposition`,
     `ship.ship.confirm`, `ship.pick.execute`, `ship.dlq.replay`) are **declared
     but unread by any action**.

6. **Two divergent `customers` / `sales_orders` schemas exist (migration
   drift).** Mig **211** (the schema the runtime actions use: `customer_code`,
   `order_number`, `promised_ship_date`, 12-state status, `inventory_allocations`)
   and mig **288** (`code`, `so_number`, `requested_date`, a 5-state
   `draft/confirmed/allocated/shipped/cancelled` check, `sales_order_line_allocations`).
   The action layer targets the **211** column names; the 288 table is a parallel
   definition that does not match the code. Reconcile/retire one.

7. **No holds / allergen / allocation-override gate in the SO→ship path.** The
   domain skill (`MON-domain-shipping`) calls for an **allocation hold gate**
   (`ship.hold.place`/`release`) and **allergen segregation** checks before
   allocate/ship; none are implemented — `allocateSalesOrder` walks FEFO purely
   on `available`+`released` with no customer-allergen-restriction or hold check,
   despite `customer_allergen_restrictions` existing in the schema.

8. **BOL/POD are metadata, not documents.** `generateBol` stores the **serialized
   JSON payload string** in `bol_pdf_url` and the SHA-256 in `ext_data` — it does
   **not** render or store an actual PDF, and `bill_of_lading` (mig 211) is never
   written. `recordPod` only stores a `signedPdfUrl` string the caller supplies;
   there's no upload/storage integration and no BRCGS 7-year retention wiring
   here. The hash gives tamper-evidence but the artifact pipeline is a stub.

9. **No SO line edit after create, and no RMA flow.** Once `createSalesOrder`
   runs there is no add/edit/delete-line action (unlike Purchasing's draft-edit
   suite); amending an SO means cancel + recreate. RMA (returns) has an enum perm
   (`ship.rma.disposition`) and `rma_reason_codes` reference data but **no action
   or screen** — it's P1/unbuilt.

No raw `// TODO` markers were found in the action files beyond the
`ship.so.allocate` permission note (`so-actions.ts:113`) and the
reserved-`customerId` note (`sales-line-price.ts:5`); the rest of the gaps list is
derived from the permission-vs-enum drift, the unwired reversals, and the schema
drift observed in the code.
