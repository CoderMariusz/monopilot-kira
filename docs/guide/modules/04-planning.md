# Planning — MRP / forecasts / suppliers / PO·TO·WO origination + document numbering (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. The module is the
> **origination** half of the supply chain: it raises the documents
> (Purchase Orders, Transfer Orders, Work Orders), nets demand against supply
> (MRP), captures independent demand (forecasts), curates the **supplier master**,
> and configures **document numbering / archiving**. It does **not** receive goods
> (that is Warehouse — see `06-purchasing.md`), execute WOs (Production —
> `08-production.md`), or finite-capacity-schedule them (the **Scheduler** lives
> in 07-planning-ext and has its own guide — only cross-referenced here).
>
> All Planning screens live in one route group:
> `…/(modules)/planning/…` → `/planning/{mrp,forecasts,reorder-thresholds,
> suppliers,purchase-orders,transfer-orders,work-orders,schedule,carriers,import}`.
> Routes are written without the `[locale]` prefix. Last reviewed against the
> uncommitted working tree (E6 MRP loop, E9 freight/scorecard, R4 transfer-receive
> reversal, E-IO import/export).

---

## a. Overview

Planning answers two questions and produces three documents.

**"What do we need?"** — the **MRP** screen (`/planning/mrp`) runs a read-first net
of on-hand stock + open supply against open work-order demand **and** independent
**demand forecasts**, per item, in the item's base UoM, exact to micro-units (no JS
floats). Each shortfall produces a **suggested action** (BUY / MAKE) and, when the
run is **saved**, a `mrp_planned_orders` row that can be **converted** straight into
a draft PO or WO. The netting universe is shaped by two config screens:
**reorder thresholds** (`/planning/reorder-thresholds`, per-item min/reorder-lot +
preferred supplier) and **demand forecasts** (`/planning/forecasts`, an editable
ISO-week grid of independent demand).

**"Who do we buy from?"** — the **supplier master** (`/planning/suppliers`) is a
soft-delete registry (`active / inactive / blocked`) with a per-supplier lead time
and an **E9 scorecard** (on-time %, qty variance, NCR counts) computed from real PO
receipts and quality NCRs.

**The three documents** — Purchase Orders, Transfer Orders and Work Orders are all
**created here** and walked through a server-enforced status machine. Each gets a
per-org document number from the shared **`nextDocumentNumber`** engine
(prefix + date part + zero-padded sequence), configured in **Settings → Documents**.
A PO orders material from a supplier; a TO moves real stock between warehouses
(ship picks FEFO LPs, receive mints destination LPs); a WO snapshots the active BOM
+ routing + factory spec and, on **release**, becomes the object Production executes.

Mistakes are reversible at the **draft** edge (W11-R1: header + lines fully editable
until the document leaves draft) and, for transfers, at the **received** edge
(R4: `reverseToReceiveLine` voids a received destination LP under CFR-21 e-sign).

The action layer lives in `planning/_actions/*` (MRP, forecasts, thresholds,
dashboard, freight) plus the per-document sub-folders
`planning/{purchase-orders,transfer-orders,work-orders,suppliers}/_actions/*`;
the shared procurement primitives (zod schemas, write-permission helper, audit
writer) are `planning/_actions/procurement-shared.ts`; document numbering is
`apps/web/lib/documents/numbering.ts`.

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission checked
> server-side **inside** the action (a missing permission returns a typed
> `{ ok:false, error:'forbidden' }`, never a 500). The PO **receive** half and the
> PO core write actions are documented in `06-purchasing.md`; only their
> create/transition signatures are repeated here because Planning is where they
> originate.

### MRP — `planning/_actions/mrp.ts` (+ pure core `mrp-compute.ts`)

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `runMrp({persist?})` | Net **on-hand − reserved + open supply − demand** per planned item (`rm/ingredient/intermediate/packaging/fg`), in base UoM, exact micro-unit bigints. Demand = open `wo_materials` remainder **+** `demand_forecasts` for the run horizon (independent). Supply = open-PO line remainder **+** `schedule_outputs` (to-stock, with a self-supply anti-join). Thresholds drive below-min severity + reorder lots + due dates. **`persist:true`** writes one `mrp_runs` header + one `mrp_requirements` row/item (idempotent upsert) + `mrp_planned_orders` suggestions + a `planning.mrp.completed` outbox event. | reads `items`, `v_inventory_available`, `wo_materials`, `work_orders`, `demand_forecasts`, `purchase_order_lines`, `grn_items`, `grns`, `schedule_outputs`, `reorder_thresholds`, `suppliers`; writes (persist) `mrp_runs`, `mrp_requirements`, `mrp_planned_orders`, `outbox_events` | read: `scheduler.run.read`; persist also requires `npd.planning.write` | — (re-running upserts the same run keys; planned orders delete-and-reinsert) |
| `listMrpRuns()` | Recent persisted runs (newest 20) for the "Previous runs" panel. | reads `mrp_runs` | `scheduler.run.read` | — (read) |
| `getMrpRunRequirements(runId)` | The per-item requirement ledger of one persisted run (item-labelled). | reads `mrp_requirements`, `items` | `scheduler.run.read` | — (read) |
| `convertPlannedToPo(ids[])` | Convert `suggested`/`firm` **buy** planned orders → draft PO(s), grouped by supplier (delegates to `createPurchaseOrder`). Marks each `released` with `released_order_id`. Skips rows missing supplier / over-precision / already converted. | reads `mrp_planned_orders`, `items`; writes `mrp_planned_orders` (release) + PO tables via create | `planning.mrp.convert` **and** `npd.planning.write` | `cancelPlannedOrder` (while not yet received) / cancel the created draft PO |
| `convertPlannedToWo(ids[])` | Convert **make** planned orders → draft WO(s) (requires an `active` BOM for the item; delegates to `createWorkOrder`). Marks each `released`. | reads `mrp_planned_orders`, `items`, `bom_headers`; writes `mrp_planned_orders` + WO tables via create | `planning.mrp.convert` **and** `npd.planning.write` | `cancelPlannedOrder` / cancel the created draft WO |
| `cancelPlannedOrder(id)` | Cancel one planned order (`suggested/firm/released`) → `release_status='cancelled'`; refused if its linked PO/TO is `partially_received`/`received` or linked WO is `COMPLETED`/`CLOSED` (`invalid_state`). | reads/writes `mrp_planned_orders`; reads `purchase_orders`, `transfer_orders`, `work_orders`; writes `audit_events` (`planning.mrp_planned_order.cancelled`) | `planning.mrp.convert` **and** `npd.planning.write` | — (re-run MRP to regenerate suggestions) |

### Demand forecasts — `planning/_actions/forecasts.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listForecasts(weeks?)` | The editable grid: forward ISO-week window (default 12, max 52) × every forecast-eligible item (`fg/intermediate`) with a cell in-window, cells keyed by ISO-week. | reads `demand_forecasts`, `items` | `scheduler.run.read` | — (read) |
| `upsertForecast({itemId,isoWeek,qty})` | Create-or-update ONE cell (unique `(org,item,iso_week)`). Qty entered in the item's **output** UoM, converted to **base** via `lib/uom` only (→ `uom_conversion_unavailable` if pack factors missing). `source='manual'`. | writes `demand_forecasts`, `audit_events` (`planning.demand_forecast.upserted`) | `planning.forecast.manage` | `deleteForecast`, or upsert again |
| `deleteForecast(id)` | Remove one cell. | deletes `demand_forecasts`; writes `audit_events` (`planning.demand_forecast.deleted`) | `planning.forecast.manage` | re-add via `upsertForecast` |
| `copyForecastWeek({fromWeek,toWeek})` | Clone every cell of `fromWeek` into `toWeek` (non-destructive — `ON CONFLICT DO NOTHING`). | writes `demand_forecasts` | `planning.forecast.manage` | delete the copied cells |
| `importForecastCsv({rows})` | Bulk upsert from parsed CSV (item **CODE** + ISO-week + qty in output UoM; ≤2000 rows). Bad rows collected, not fatal; `source='import'`. | reads `items`; writes `demand_forecasts`, `audit_events` | `planning.forecast.manage` | delete imported cells |
| `searchForecastItems(input?)` | Item picker restricted to forecast-eligible types (`fg/intermediate`). | reads `items` | RLS-scoped | — (read) |

### Reorder thresholds — `planning/_actions/reorder-thresholds.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listReorderThresholds()` | All configured thresholds, item-code sorted, joined to the preferred supplier (code/name + lead time). | reads `reorder_thresholds`, `items`, `suppliers` | `scheduler.run.read` | — (read) |
| `upsertReorderThreshold({itemId,minQty,reorderQty,preferredSupplierId?})` | Create-or-update one item's floor (unique `(org,item)`). Item must be an MRP-planned type; supplier (soft FK) validated in-org. | writes `reorder_thresholds`, `audit_events` (`planning.reorder_threshold.upserted`) | `npd.planning.write` | `deleteReorderThreshold`, or upsert again |
| `deleteReorderThreshold(id)` | Remove one threshold. | deletes `reorder_thresholds`; writes `audit_events` | `npd.planning.write` | re-add via upsert |
| `searchThresholdItems(input?)` | Item picker restricted to `rm/ingredient/intermediate/packaging`. | reads `items` | RLS-scoped | — (read) |
| `listThresholdSuppliers()` | Active suppliers + lead times for the preferred-supplier select (delegates to `listSuppliers`). | reads `suppliers` | RLS-scoped | — (read) |

### Suppliers — `planning/suppliers/_actions/actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listSuppliers({status?,q?,limit?})` | Supplier list (status tab + code/name search; ≤200). | reads `suppliers` | RLS-scoped | — (read) |
| `getSupplier(id)` | One supplier (header + contact jsonb + lead time + status). | reads `suppliers` | RLS-scoped | — (read) |
| `createSupplier(input)` | Insert a supplier (`code`, `name`, contact, currency, lead time, status default `active`). `23505` → `already_exists`. | writes `suppliers`, `audit_events` (`planning.supplier.created`) | `npd.planning.write` | `transitionSupplierStatus(...,'inactive'\|'blocked')` (soft-delete only — no hard delete) |
| `transitionSupplierStatus(id,status)` | Move between `active / inactive / blocked` (soft-delete model; history preserved). | writes `suppliers`, `audit_events` (`planning.supplier.status_changed`) | `npd.planning.write` | transition back |

### Supplier scorecard + freight (E9) — `planning/_actions/freight-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `getSupplierScorecard(supplierId)` | On-time % + avg qty-variance % + NCR counts + last 10 POs, from real `grn_items` receipts vs `purchase_order_lines` and `ncr_reports`. Missing-relation (pre-mig) → honest empty card. | reads `suppliers`, `purchase_orders`, `purchase_order_lines`, `grn_items`, `grns`, `ncr_reports` | RLS-scoped read | — (read) |
| `listCarriers()` / `upsertCarrier(input)` | Freight carrier master (code/name/mode/contact). **Working-stub** lane (owned by the freight backend lane; will be swapped same-signature). | reads/writes `carriers`, `audit_events` | read RLS; write `freight.manage` | edit again |
| `listTransportLanes(carrierId?)` / `upsertTransportLane(input)` | Carrier transport lanes (origin/destination/mode/cost). Same stub status. | reads/writes `transport_lanes`, `carriers`, `audit_events` | read RLS; write `freight.manage` | edit again |

### Purchase Orders — `planning/purchase-orders/_actions/*` (create/transition origination; receive half in `06-purchasing.md`)

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `createPurchaseOrder(input)` | Insert PO header (`draft`) + ≥1 line; auto `po_number` via `nextDocumentNumber('po')` with a 23505 retry. | writes `purchase_orders`, `purchase_order_lines`, `audit_events` (`planning.purchase_order.created`) | `npd.planning.write` | Cancel via `transitionPurchaseOrderStatus(...,'cancelled')` |
| `updatePurchaseOrder` / `addPurchaseOrderLine` / `updatePurchaseOrderLine` / `deletePurchaseOrderLine` | **Draft-only** header + line edits (delete refuses the **last** line → `last_line`). | writes `purchase_orders` / `purchase_order_lines`, `audit_events` | `npd.planning.write` | inverse edit (add↔delete) while draft |
| `transitionPurchaseOrderStatus(id,status)` | Walk `PO_TRANSITIONS` (`draft→sent→confirmed→partially_received→received`, `cancelled`). Terminal states have no successors. | writes `purchase_orders`, `audit_events` (`planning.purchase_order.status_changed`) | `npd.planning.write` | forward-only + `cancelled`; receipt reversed at GRN-line level (Warehouse) |
| `validatePoImport` / `commitPoImport` (`import-po.ts`) | **E-IO** bulk-create POs from rows grouped by `(supplier_code, external_ref)`; `all_or_nothing` vs `skip_invalid`; skips refs already a `po_number`. | reads `suppliers`, `items`, `unit_of_measure`, `purchase_orders`; writes PO tables + `import_export_jobs` | `npd.planning.write` | cancel each created draft PO |
| `createExportJob(input?)` (`create-export-job.ts`) | CSV export of the current filtered PO list (supplier **code**, no UUIDs); logs an `import_export_jobs` ledger row. | reads via `listPurchaseOrders`; writes `import_export_jobs` | `npd.planning.write` (`TODO(E-IO): dedicated io.export.run`) | — (export only) |
| `canImportPurchaseOrders()` (`import/_actions/can-import-po.ts`) | Server-side gate probe for the import hub page (renders wizard vs denied without trusting a client flag). | reads RBAC | resolves `npd.planning.write` | — (read) |

### Transfer Orders — `planning/transfer-orders/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `createTransferOrder(input)` | Insert TO header (`draft`) + ≥1 line; auto `to_number` via `nextDocumentNumber('to')` + 23505 retry. | writes `transfer_orders`, `transfer_order_lines`, `audit_events` (`planning.transfer_order.created`) | `npd.planning.write` | Cancel via `transitionTransferOrderStatus(...,'cancelled')` |
| `updateTransferOrder` / `addTransferOrderLine` / `updateTransferOrderLine` / `deleteTransferOrderLine` | **Draft-only** header + line edits (warehouse-in-org checks; from≠to; last line refused → `last_line`; dense line renumber). | writes `transfer_orders` / `transfer_order_lines`, `audit_events` | `npd.planning.write` | inverse edit while draft |
| `transitionTransferOrderStatus(id,status)` | Walk `TO_TRANSITIONS` (`draft→in_transit→received`, `cancelled`). **`in_transit` SHIPS real stock** (FEFO-pick `available`+`released` LPs at the source, validate-first, decrement, `transfer_order_line_lps` link, `stock_moves`). **`received` mints destination LPs** (`available`, parent = source LP, QA carried). Cancel of an in-transit TO with already-**received** dest LPs is refused (`partially_received`). | reads/writes `transfer_orders`, `transfer_order_lines`, `transfer_order_line_lps`, `license_plates`, `lp_state_history`, `stock_moves`, `audit_events` | `npd.planning.write` | `cancelled` (un-received lines only); received lines → `reverseToReceiveLine` |
| `reverseToReceiveLine(input)` (`reverse-receive.ts`) | **R4** — reverse one received TO line: void the destination LP (`returned`, qty 0), credit the source LP back, re-roll TO status (`in_transit`/`partially_received`). **CFR-21 e-sign**. Refused if the dest LP is reserved / allocated / shipped / consumed (`lp_active`). | reads/writes `license_plates`, `transfer_order_line_lps`, `lp_state_history`, `stock_moves`, `transfer_orders`, `audit_events`, `e_sign_log`; emits `warehouse.lp.transitioned` | `warehouse.transfer.correct` + e-sign | **is** the reverse of a TO receive |
| `canReverseTransferReceipt()` | Server probe gating the "Reverse receipt" affordance on TO detail. | reads RBAC | resolves `warehouse.transfer.correct` | — (read) |
| `validateToImport` / `commitToImport` (`import-to.ts`) | **E-IO** bulk-create TOs grouped by `external_ref`; skips refs already a `to_number`. | reads `warehouses`, `items`, `unit_of_measure`; writes TO tables + `import_export_jobs` | `npd.planning.write` | cancel each created draft TO |

### Work Orders (Planning side) — `planning/work-orders/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `createWorkOrder(input)` | Insert WO header (`DRAFT`) for an FG; auto `wo_number` via `nextDocumentNumber('wo')` + 23505 retry. **Snapshots** the active BOM → `wo_materials` (qty × planned, 3-dp round), the active routing → `wo_operations`, the primary `schedule_outputs` row, and resolves the active BOM header + approved factory spec onto the header (so Production's release preflight passes). Returns a `warning` when no active BOM / no approved spec. | reads `items`, `bom_headers`, `bom_lines`, `routings`, `routing_operations`, `factory_specs`; writes `work_orders`, `wo_materials`, `wo_operations`, `schedule_outputs`, `wo_status_history` | `npd.planning.write` | `cancelWo` in Production (no Planning-side cancel) |
| `updateWorkOrder(input)` | **Draft-only** edit (product / planned qty / schedule / line / machine / notes). A product or qty change **re-snapshots** `wo_materials` + `wo_operations` and re-resolves BOM/spec. | reads `items`, `bom_headers`, `routings`, `production_lines`, `machines`, `factory_specs`; writes `work_orders`, `wo_materials`, `wo_operations`, `wo_status_history` | `npd.planning.write` | edit again while draft |
| `releaseWorkOrder({id})` | **`DRAFT → RELEASED`** (the planning→production handoff). Self-heals `active_bom_header_id` / `active_factory_spec_id` / `uom_snapshot` from the FG if missing; **blocks** with `factory_release_incomplete {missing:[active_bom\|factory_spec]}` when either is absent. **O-2 (2026-06-25):** also blocks with `pack_hierarchy_incomplete` when the FG's `output_uom` is `each`/`box` but the pack factors (`net_qty_per_each` + `each_per_box`) are unset — the error tells the planner to complete the item master in Technical first. | reads/writes `work_orders`, `bom_headers`, `factory_specs`, `items`; writes `wo_status_history` | `npd.planning.write` | no "un-release"; the WO proceeds to Production (`cancelWo` there) |
| `listPlanningWorkOrders` / `getPlanningWorkOrder` | WO list (status tab + search + archive window from `org_document_settings`) and detail bundle (materials / operations / schedules / dependencies / status history). | reads `work_orders`, `wo_executions`, `wo_materials`, `wo_operations`, `schedule_outputs`, `wo_dependencies`, `wo_status_history`, `org_document_settings` | RLS-scoped read | — (read) |
| `searchFgProducts` / `listProductionResources` (`wo-form-data.ts`) | FG picker for create-WO + production-line / machine options. | reads `items`, `production_lines`, `machines` | RLS-scoped | — (read) |
| `validateWoImport` / `commitWoImport` (`import-wo.ts`) | **E-IO** bulk-create WOs grouped by `external_ref` (FG code + qty + UoM → `createWorkOrder`); skips refs already imported. | reads `items`, `unit_of_measure`, `production_lines`, `bom_headers`, `work_orders`; writes WO tables + `import_export_jobs` | `npd.planning.write` | cancel each created draft WO in Production |

### Document numbering + dashboard + shared

| Action (file) | What it does | Reads / writes | Gate |
|---|---|---|---|
| `nextDocumentNumber(client,orgId,docType,now)` (`lib/documents/numbering.ts`) | Atomic per-org per-type sequence bump (`UPDATE … set next_seq = next_seq + 1 RETURNING next_seq-1`); composes `prefix[-datePart]-padded(seq)`. Seeds default settings (`PO/TO/WO`, `YYYYMM`, padding 4, archive 30d) on first use. | reads/writes `org_document_settings` | n/a (called inside a gated create) |
| `readOrgDocumentSettings()` / `updateOrgDocumentSettings(input)` (`settings/_actions/documents.ts`) | Read / edit the PO·TO·WO numbering format (prefix / date part / padding) + `archive_after_days`. **(Lives in the Settings module, surfaced as Settings → Documents.)** | reads/writes `org_document_settings` | read `settings.org.read`; write `settings.infra.update` |
| `getPlanningDashboard()` (`_actions/dashboard-data.ts`) | The Planning home KPIs (open WOs / WOs today / open POs / open TOs) + WO past-start alerts + overdue PO/TO alerts + a 7-day schedule strip — all real, org-scoped. | reads `work_orders`, `purchase_orders`, `transfer_orders` | `scheduler.run.read` |
| `listOrgUnits(client)` / `searchPoItems` / `listPoUnits` / `listTransferUnits` / `uom-dropdown.ts` | UoM + item picker seams for the PO/TO line dropdowns (real `unit_of_measure`; admin-added units appear — never a hardcoded list). | reads `unit_of_measure`, `items` | RLS-scoped |

**Action count inventoried: 41** — 6 MRP, 6 forecasts, 5 thresholds, 4 suppliers,
3 supplier-scorecard/freight, 7 PO origination/import/export/gate, 7 TO
origination/reversal/import, 6 WO origination/release/import + form-data, plus the
document-numbering engine + Settings config + dashboard + UoM seams. The origination
core is `createPurchaseOrder` / `createTransferOrder` / `createWorkOrder` +
`runMrp` + the three status-machine transitions.

---

## c. State machines

### MRP run lifecycle (read-first; only `persist` writes)

```
 runMrp({persist:false})  ──►  on-screen result only (nothing saved)
 runMrp({persist:true})   ──►  mrp_runs(status='completed')
                                 ├─ mrp_requirements   (one row / netted item; upsert)
                                 └─ mrp_planned_orders (release_status='suggested')
                                          │  convertPlannedToPo / convertPlannedToWo
                                          ▼
                                    release_status='released' (released_order_id → PO/WO)
                                          │  cancelPlannedOrder
                                          ▼
                                    release_status='cancelled'
```

- A persisted run is **never re-opened**: re-running `runMrp` upserts the same
  `(run_id,item_id,bucket_date,bom_level)` requirement rows and **delete-and-reinserts**
  the `suggested` planned orders, so reruns don't duplicate.
- `mrp_runs.demand_source` flips `manual → forecast` whenever any
  `demand_forecasts` contribution fed the netting; `mrp_requirements.source_type`
  is `independent` for forecast-driven items, else `dependent`.
- A planned order is **not cancellable** once its linked PO/TO is
  `partially_received`/`received` or its linked WO is `COMPLETED`/`CLOSED`.

### Purchase Order lifecycle (`PO_TRANSITIONS`, `purchase-orders/_actions/actions.ts:685`)

```
 draft ──► sent ──► confirmed ─┬─► partially_received ──► received  (terminal)
   │         │          │      └─► received (terminal)
   └─► cancelled (and from sent / confirmed / partially_received)
```

Editable **only while `draft`**. `partially_received`/`received` are normally written
by the **receive** transaction (Warehouse), not the button. No "reopen to draft", no
"un-receive" of the header. Full detail + the receive half: `06-purchasing.md`.

### Transfer Order lifecycle (`TO_TRANSITIONS`, `transfer-orders/_actions/actions.ts:667`)

```
 draft ──ship──► in_transit ──receive──► received  (terminal)
   │                │   │                    ▲
   │                │   └──► partially_received ──► received
   │                │            │ (after a per-line receipt reversal)
   └─► cancelled    └─► cancelled (un-received lines only)
```

| State | Legal next | Stock effect | Notes |
|---|---|---|---|
| `draft` | `in_transit`, `cancelled` | — | the only editable state |
| `in_transit` | `received`, `cancelled` | **ship** picks FEFO `available`+`released` LPs at the source, decrements them (full depletion → `shipped`), records picks in `transfer_order_line_lps` | validate-first: short source stock → `insufficient_stock`, nothing written |
| `partially_received` | `received`, `cancelled` | reached only after `reverseToReceiveLine` un-receives a line | re-rolled by the reversal action |
| `received` | — (terminal) | **receive** mints destination LPs (`available`, parent = source LP, QA carried — an internal transfer is **not** re-quarantined) | reverse a received line via `reverseToReceiveLine` (R4) |
| `cancelled` | — (terminal) | restores source LPs for **un-received** lines only | cancel is **refused** if any dest LP is already received (`partially_received`) — reverse those first |

### Work Order lifecycle — Planning's portion only

```
 (createWorkOrder)         (updateWorkOrder, draft-only re-snapshot)
        │                            │
        ▼                            ▼
      DRAFT ───────── releaseWorkOrder ──────► RELEASED ──► (Production owns the rest)
        │  factory_release_incomplete {missing} blocks release until
        │  an active BOM + an approved/released factory spec exist
        └─ no Planning-side cancel; the WO is cancelled in Production
```

Planning owns `DRAFT → RELEASED`; everything from `in_progress` onward is the
08-production state machine (see `08-production.md`). The two terminal documents
are reversible only at their draft edge (PO/TO/WO) or — for transfers — at the
received edge via R4 e-signed reversal.

<!-- screenshot: planning/mrp results table (KPI tiles + severity badges + suggested actions + planned-orders) -->
<!-- screenshot: planning/forecasts ISO-week grid -->
<!-- screenshot: planning/transfer-orders/[id] detail (ship/receive transitions + reverse-receipt) -->

---

## d. User how-tos

> Button labels below are the literal English copy from the `Planning.*` i18n
> bundle (`apps/web/i18n/en.json`); the `data-testid`s in parentheses are the stable
> anchors in the component code. Reach every screen from the **Planning** sub-nav
> ("Planning sections" — Work orders / Purchase orders / Transfer orders / Suppliers /
> MRP / Line schedule / Reorder thresholds / Forecasts / Carriers).

### (i) Run MRP and convert shortfalls to POs / WOs

1. Go to **Planning → MRP** (`/planning/mrp`).
2. (Optional) tick **"Save this run"** (`mrp-persist-toggle`) to persist the run to
   MRP history and generate convertible planned orders. Leaving it off is a pure
   read-only "what-if" — *"Read-only analysis: nothing is saved and no orders are
   created."*
3. Click **"Run MRP"** (`mrp-run-button`). The KPI tiles fill in (**Items short**,
   **Demand coverage**, **Items analyzed**, **Total open demand**, **Below min**) and
   the results table lists each planned item with **On hand / Reserved / Open supply /
   Demand / Net position** and a **Suggested action** badge (**BUY** / **MAKE** / —).
   A red **Shortage** / amber **Below min** badge flags the gaps.
4. With a **saved** run, the **Planned orders** panel appears. Tick the rows you want
   (`mrp-planned-select-<id>`), then click **"Create PO"** (`mrp-create-po-button`)
   for buy rows or **"Create WO"** (`mrp-create-wo-button`) for make rows. Buy rows
   are grouped per supplier into draft POs; make rows need an active BOM. The feedback
   line reports how many were created / skipped.
5. **"Previous runs"** lists the persisted `mrp_runs`; expand **Details** to see that
   run's requirement ledger.

### (ii) Review / adjust a demand forecast

1. Go to **Planning → Forecasts** (`/planning/forecasts`). The grid shows the next
   12 ISO-weeks × each forecast item (FG / intermediate), in the item's base UoM.
2. **Add a product** — click **"+ Add product"**, search by code/name, pick it; a new
   row appears.
3. **Edit a cell** — type a quantity (in the item's **output** unit; the server
   converts to base) directly into the week cell; it saves on blur
   (`upsertForecast`). A bad pack hierarchy surfaces "Save failed".
4. **Roll a week forward** — **"Copy previous week"** clones last week's cells into
   the next (non-destructive) → `copyForecastWeek`.
5. **Bulk load** — **"Import CSV"** opens the paste-and-parse modal (columns: item
   code, ISO-week e.g. `2026-W25`, qty) → `importForecastCsv`; unknown items / bad
   values are skipped and counted.
6. These forecasts become **independent demand** in the next MRP run (the run is then
   attributed `demand_source='forecast'`).

### (iii) Configure a reorder threshold

1. Go to **Planning → Reorder thresholds** (`/planning/reorder-thresholds`).
2. Click **"+ Add threshold"**, pick an item (`rm/ingredient/intermediate/packaging`),
   set **Minimum quantity** and **Reorder quantity** (both base UoM; reorder 0 = "just
   top up to the minimum"), and optionally a **Preferred supplier** (its lead time
   drives the suggested due date). **Save** → `upsertReorderThreshold`.
3. The floor now drives **Below min** severity + reorder-lot suggested quantities in
   MRP — an item below its min surfaces even with zero demand/stock.

### (iv) Add / approve / block a supplier

1. Go to **Planning → Suppliers** (`/planning/suppliers`).
2. Click **"New supplier"** (`Planning.suppliers.actions.newSupplier`). In the create
   modal set **Supplier code\***, **Name\***, **Currency (ISO-4217)\***, **Default
   lead time (days)\***, and **Status** (default Active). Submit **"Create supplier"**
   → `createSupplier`. Duplicate code → "A supplier with that … already exists".
3. **Approve / retire / block** — there is **no hard delete**; from the supplier
   detail use the status control to move between **Active / Inactive / Blocked**
   (`transitionSupplierStatus`). Blocked suppliers can't be used on new POs; inactive
   are soft-deleted but kept for history.
4. **Scorecard** — open a supplier → its **scorecard** page
   (`/planning/suppliers/[id]/scorecard`) shows on-time %, avg qty-variance % and NCR
   counts from real receipts (`getSupplierScorecard`).

### (v) Raise a PO from Planning

1. **Planning → Purchase Orders** (`/planning/purchase-orders`) → **"Create PO"**.
2. In the create modal (`create-po-modal.tsx`): leave **PO number** blank for an
   auto number; pick a **Supplier** (required); set **Expected delivery / Currency /
   Notes**; add lines with **"+ Add line"** (item picker → real `items`, **Qty** >0,
   **UoM** from the real `unit_of_measure` dropdown, **Unit price** ≥0). At least one
   line required. **"Create PO"** → `createPurchaseOrder` (PO is `draft`).
3. Walk it forward from the detail screen's status panel (**Send → Confirm**);
   receiving rolls it to received (Warehouse). Edit lines/header **only while draft**.
   *(Full PO + receive walkthrough: `06-purchasing.md`.)*

### (vi) Raise a TO (move stock between warehouses)

1. **Planning → Transfer Orders** (`/planning/transfer-orders`) → **"Create TO"**.
2. In the create modal: leave **TO number** blank for auto (e.g. `TO-202606-0007`);
   pick **From warehouse** and **To warehouse** (must differ); set the **Scheduled**
   date; add lines (item + qty + UoM). **"Save & Plan"** → `createTransferOrder`
   (`draft`).
3. From the detail screen: **ship** (`draft → in_transit`) FEFO-picks and decrements
   real source LPs; **receive** (`in_transit → received`) mints destination LPs at the
   target warehouse. A mis-received line can be undone with **Reverse receipt**
   (`reverseToReceiveLine`, requires `warehouse.transfer.correct` + e-sign).

### (vii) Raise & release a WO from Planning

1. **Planning → Work Orders** (`/planning/work-orders`) → **"Create WO"** (or the
   full-page form at `/planning/work-orders/new`).
2. Pick a **Product (finished good)** via the picker, enter the **Planned quantity**
   (+ unit), optional schedule / line / machine / notes. **"Create work order"** →
   `createWorkOrder`. The BOM, routing and primary schedule output are snapshotted now;
   a missing active BOM or approved factory spec returns a non-fatal **warning** badge
   on the list (**No BOM**).
3. **Release** — on the list/detail, the **"Release"** action
   (`Planning.workOrders.list.release`, confirm "Release work order {wo}? This commits
   it to production.") runs `releaseWorkOrder` → `DRAFT → RELEASED`. If the active BOM
   or approved/released factory spec is missing it is **blocked**
   (`factory_release_incomplete`); if the FG is packed in each/box but its pack
   hierarchy (`net_qty_per_each` / `each_per_box`) is incomplete it is **blocked**
   with `pack_hierarchy_incomplete` (O-2). A released WO is owned by Production from here.

### (viii) Configure document numbering & archiving

1. Go to **Settings → Documents** (`readOrgDocumentSettings` /
   `updateOrgDocumentSettings` — the Settings module, not Planning).
2. For each doc type (**PO / TO / WO**) set the **prefix**, **date part**
   (`none / YYYY / YYYYMM / YYYYMMDD`), **sequence padding** (3–8) and
   **archive after N days**. Save → `updateOrgDocumentSettings`
   (gated `settings.infra.update`).
3. The next created PO/TO/WO draws its number from `nextDocumentNumber`, which bumps
   `org_document_settings.next_seq` atomically and composes e.g. `PO-202606-0042`.
   The list screens' **Archive** tab uses `archive_after_days` to fold terminal
   documents past the window.

---

## e. Data sources (Supabase tables)

MRP / forecasts / thresholds (read/write):

- `mrp_runs` — persisted run header (`run_number`, `demand_source`, horizon, counts).
- `mrp_requirements` — per-item netted ledger (`gross/scheduled/projected/net`, `source_type`, `exception_type`; upsert key `(run_id,item_id,bucket_date,bom_level)`).
- `mrp_planned_orders` — BUY/MAKE suggestions (`release_status`, `released_order_id`, `supplier_id`).
- `demand_forecasts` — independent demand per `(org,item,iso_week)` in base UoM (`source` manual/import).
- `reorder_thresholds` — per-item `min_qty` / `reorder_qty` / `preferred_supplier_id`.
- `v_inventory_available` — FEFO on-hand+reserved read model (netting input; read).
- `wo_materials`, `schedule_outputs`, `purchase_order_lines`, `grn_items`, `grns` — demand / supply inputs (read).

Suppliers / freight:

- `suppliers` — supplier master (code/name/contact/currency/lead time/status).
- `carriers`, `transport_lanes` — E9 freight (working-stub lane; mig 316).
- `ncr_reports` — supplier scorecard NCR counts (read; honest-empty when absent).

Documents (read/write):

- `purchase_orders`, `purchase_order_lines` — PO header + lines.
- `transfer_orders`, `transfer_order_lines`, `transfer_order_line_lps` — TO header + lines + the ship/receive LP link (the in-transit truth).
- `work_orders`, `wo_materials`, `wo_operations`, `wo_executions`, `wo_dependencies`, `wo_status_history` — WO header + BOM/routing snapshot + status trail.
- `bom_headers`, `bom_lines`, `routings`, `routing_operations`, `factory_specs` — snapshot sources for create/release (read).
- `license_plates`, `lp_state_history`, `stock_moves` — TO ship/receive/reversal stock mutations.
- `org_document_settings` — per-org PO/TO/WO numbering format + `archive_after_days`.
- `import_export_jobs` — E-IO import/export ledger.
- `unit_of_measure`, `items`, `warehouses`, `production_lines`, `machines` — reference reads for pickers.

Governance:

- `audit_events` — every Planning write (`planning.{purchase_order,transfer_order,supplier,reorder_threshold,demand_forecast,mrp_planned_order,carrier,transport_lane}.*`, `planning.transfer_order.receive_reversed`).
- `e_sign_log` — CFR-21 e-sign for `reverseToReceiveLine` (R4 transfer-receive reversal).
- `outbox_events` — `planning.mrp.completed`, `warehouse.lp.transitioned` (transfer-receive reversal).

---

## f. Known gaps / TODO

Grounded in the code that was read — no guesses:

1. **The Planning write gate `npd.planning.write` is an NPD-family string and is
   NOT declared in the RBAC enum.** Every PO/TO/WO/supplier/threshold create checks
   `hasPlanningWritePermission` against the literal `'npd.planning.write'`
   (`_actions/procurement-shared.ts:5`), but `packages/rbac/src/permissions.enum.ts`
   has no such member (`PLANNING_MRP_RUN`, `PLANNING_MRP_CONVERT`,
   `PLANNING_FORECAST_MANAGE`, `FREIGHT_MANAGE` exist; the write gate does not). It is
   invisible to the enum-lock guard and the Settings → Roles matrix. The ownership is
   also confusing (an NPD prefix gating planning writes). Promote it to a real
   `planning.*` enum member.

2. **The read gate is `scheduler.run.read` (a 07-planning-ext permission).** MRP,
   forecasts, thresholds and the dashboard all read-gate on `scheduler.run.read`
   (the module-registry planning-basic gate), and `PLANNING_MRP_RUN`
   (`planning.mrp.run`) is declared in the enum but **never read** by `runMrp` — the
   run instead reuses `scheduler.run.read` + (for persist) `npd.planning.write`. The
   declared-but-unused `planning.mrp.run` should either gate the run or be removed.

3. **Forecast write uses `planning.forecast.manage`, but the enum ALSO has
   `scheduler.forecast.read` / `scheduler.forecast.write`.** Two parallel forecast
   permission families exist (the 04 `planning.forecast.manage` actually wired here vs
   the 07 `scheduler.forecast.*`). Reconcile so there is one owner.

4. **MRP is a single-bucket, no-BOM-explosion slice.** `runMrp` nets one bucket
   (`bucket_date = today`, `bom_level = 0`) with no multi-period horizon and no BOM
   explosion (`mrp.ts:11-14`). Documented caveats: a fully-reserved LP is invisible
   (net unaffected); an in-progress WO that already output double-counts its
   `schedule_outputs` until completion (`mrp-compute.ts:17-24`). FG shortages can
   suggest MAKE only when an active BOM exists.

5. **`convertPlannedToTo` does not exist.** `mrp_planned_orders` can be `transfer`
   typed, but only `convertPlannedToPo` / `convertPlannedToWo` are implemented — a
   transfer planned order cannot be auto-released into a TO (must be raised manually).

6. **Freight / carriers / transport lanes is a working stub.**
   `freight-actions.ts:6-11` is explicitly an interim file owned by the freight
   backend lane (same signatures to be swapped); reads tolerate a missing mig-316
   relation by returning empty. The supplier **scorecard** read is real, but the
   carrier/lane writes are placeholder until that swap.

7. **PO export reuses the planning-write permission.** `createExportJob` carries a
   `TODO(E-IO): dedicated io.export.run permission` (`create-export-job.ts:25`) and
   gates on `npd.planning.write`; the central Settings Import/Export **import** surface
   is rendered disabled and the live PO **Import** deep-links to
   `/planning/import?source=po` (verify wired). Same as noted in `06-purchasing.md`.

8. **No "un-release" of a WO and no Planning-side WO cancel.** `releaseWorkOrder` is
   one-way `DRAFT → RELEASED`; a released WO can only be cancelled in Production
   (`cancelWo`). Draft edits re-snapshot materials/operations, but once released the
   Planning edit affordances disappear (`invalid_state`).

9. **Document-numbering config lives in Settings, not Planning.** The
   `org_document_settings` editor (`settings/_actions/documents.ts`) gates on
   `settings.infra.update` / `settings.org.read`. Flagged so the reader doesn't look
   for a numbering screen under `/planning`. `nextDocumentNumber` seeds sensible
   defaults on first use, so a brand-new org gets `PO/TO/WO-YYYYMM-NNNN` automatically.

No raw `// TODO` markers were found in the MRP / suppliers / document-numbering code
beyond the export-permission one cited above; the gaps list is otherwise derived from
permission-vs-enum drift and capability limits observed in the code.
