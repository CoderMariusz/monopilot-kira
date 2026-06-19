# Golden Flow — Product Creation to Shipment (end-to-end)

> The single "happy path" through MonoPilot Kira: how an item becomes a product, gets a
> recipe and a factory spec, gets planned, received, produced, QA-released and shipped.
>
> Every step below cites a **route** the user clicks and the **server action / file** that
> runs the write. Anything that is a stub or partial is marked **⚠️ PARTIAL** / **🔴 STUB**.
> App = `apps/web` (Next.js App Router, Server Actions). DB = Supabase Postgres, org-scoped
> via `withOrgContext` + RLS `app.current_org_id()`. Shared receive/production logic lives
> under `apps/web/lib/**`.
>
> Routes are written without the route-group folders — e.g. `/technical/items` is the file
> `apps/web/app/[locale]/(app)/(modules)/technical/items/page.tsx`.
>
> Last reviewed against `HEAD` `4cf0a48c` plus the **uncommitted working tree** (W11-R4
> reversals, E6 MRP convert + forecasts, E3 CCP monitoring, E-IO PO export, scanner
> de-mock). Where a feature is uncommitted that is noted inline.

---

## 0. Two product worlds (read this first)

There are **two** master tables and they are NOT the same thing:

| Table | Owner | Holds | Created via |
|---|---|---|---|
| `public.items` | 03-technical | The canonical item master — `rm`, `ingredient`, `intermediate`, `fg`, `co_product`, `byproduct`, `packaging`. BOMs/WOs/LPs reference THIS. | Technical → Items wizard, or NPD factory-release |
| `public.product` | 01-npd | The 69-col NPD "FA / product" aggregate (Stage-Gate workspace, formulation, costing). | NPD product/brief wizard |

`item_type` enum: `rm, ingredient, intermediate, fg, co_product, byproduct, packaging`
(`apps/web/.../technical/items/_actions/shared.ts:35`).
`items.status` lifecycle: `draft → active → deprecated`, plus `blocked`
(`shared.ts:36`).

The NPD `product` becomes a canonical `fg` **item** only when the NPD project is *released
to factory* (step 2). Until then it lives only in the NPD world.

---

## 1. Item creation (Technical)

**Route:** `/technical/items`
`apps/web/app/[locale]/(app)/(modules)/technical/items/page.tsx`

**Click:** header CTA **"+ New item"** (`NewItemButton`, gated on `technical.items.create`)
→ opens the multi-step **item create wizard**
(`items/_components/item-create-wizard.tsx`).

**Create action:** `createItem(...)`
`items/_actions/create-item.ts`
- Gated on `technical.items.create`; runs inside `withOrgContext` (RLS).
- `INSERT INTO public.items (...)` — item_code, item_type, name, status, base/secondary
  UoM, GS1, weight mode + catch-weight tolerance, shelf life, **pack hierarchy**
  (`output_uom, net_qty_per_each, each_per_box, boxes_per_pallet`), optional `cost_per_kg`
  (writes the cost ledger via `cost/_actions/write-cost-ledger`).
- Writes an `audit_log` row (`item.created`); unique `(org_id, item_code)`.

**Draft → active:** `transitionItemStatus(...)`
`items/_actions/transition-item-status.ts`
- Gated on `technical.items.edit`. Allowed moves: `draft→active` (Activate),
  `active→deprecated` (Deprecate), `deprecated→active` (Reactivate). Nothing returns to
  `draft`; `blocked` is owned by `deactivateItem` (`items/_actions/deactivate-item.ts`).
- **Activation gate:** `draft→active` is rejected unless `uom_base` is a canonical UoM
  (migration 267 list) — stops legacy free-text units leaking into BOMs/planning.

**Detail / data tabs:** `/technical/items/[item_code]` — overview, allergens, nutrition,
supplier specs (`items/[item_code]/page.tsx` + `_actions/*`).

**Bulk CSV import:** `/technical/items/import` (preview + commit) —
`items/import/_actions/preview-import.ts` + `commit-import.ts`. *(This is items-only and is
separate from the settings Import/Export hub in step 6 / gaps.)*

---

## 2. NPD → product acceptance / release

> "Pełen flow od akceptacji projektu": in this product, **acceptance = the NPD project
> clearing Stage-Gate G4 and being *released to factory*.** That release is what mints the
> canonical `fg` item + an active shared BOM + an approved factory spec — i.e. it makes the
> product *manufacturable*. There is no separate "accept" button; acceptance is the sum of
> the gate approvals plus the handoff promotion.

**NPD pipeline:** `/pipeline` → project → `/pipeline/[projectId]`
`apps/web/app/[locale]/(app)/(npd)/pipeline/...`
Stages (each its own sub-route): brief · formulation · nutrition · sensory · trial · pilot ·
packaging · costing · **gate** · **approval** · **handoff**.

**Create project:** `createProject(...)`
`apps/web/app/(npd)/pipeline/_actions/create-project.ts`.

### Stage-Gate (G0–G4)

**Route:** `/pipeline/[projectId]/gate`

- **Advance one stage:** `advanceProjectGate(...)`
  `apps/web/app/(npd)/pipeline/_actions/advance-project-gate.ts`
  - Stage-native: walks `STAGE_ORDER` one operational stage at a time.
  - **Entering `packaging` (the G3 boundary)** auto-creates the **FG candidate**
    (`createFgCandidate`) — the first time the project gets a real product handle.
  - **`approval → handoff`** requires a valid **G4 e-signature**
    (`assertG4ESignForHandoff`). `launched` is the terminal stage; re-advancing returns
    `ALREADY_CLOSED` (409).
- **Approve / reject a gate:** `approveProjectGate(...)`
  `apps/web/app/(npd)/pipeline/_actions/approve-project-gate.ts`
  - Gated on `npd.gate.approve`; writes a gate-approval row, CFR-21 e-sign
    (`npd.gate.approved|rejected`), emits the `GATE_APPROVED_EVENT`.
  - `revert-gate.ts` reverses a gate decision.

### Release to factory (the acceptance moment)

**Route:** `/pipeline/[projectId]/handoff` → footer **"✓ Promote to production BOM"**

**Action:** `promoteToProduction(...)`
`apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/handoff/_actions/promote-to-production.ts`
1. RBAC `npd.handoff.promote` + the handoff checklist must be **complete** (≥1 item, all
   checked) → else `checklist_incomplete`.
2. **Reuses** the real factory-release flow `releaseNpdProjectToFactory(...)`
   (`apps/web/app/(npd)/builder/_actions/release-npd-project-to-factory.ts`) — it runs its
   own G4 / FG-candidate / active-BOM / factory-spec **preflight**, upserts
   `factory_release_status` (`release_status='released_to_factory'`), and emits
   `fg.released_to_factory`.
3. If the preflight blocks, `promoteToProduction` **does not fake a BOM** — it returns
   `release_blocked` honestly and leaves the handoff un-promoted.
4. On success: stamps `handoff_checklists.bom_verification_status='promoted'` +
   `promote_to_production_date` + audit `npd.handoff.promoted`.

**What acceptance unlocks:** a canonical `fg` item, an **active** shared BOM, and an
**approved/released** factory spec — the three things `releaseWorkOrder` (step 6) demands
before a WO can leave DRAFT.

---

## 3. BOM (bill of materials)

**Route:** `/technical/bom`
`apps/web/app/[locale]/(app)/(modules)/technical/bom/page.tsx`
**Click:** **"+ New BOM"** (gated on `technical.bom.create`) → FG picker → BOM detail.

Shared **BOM SSOT** = `bom_headers` + `bom_lines` (+ `bom_co_products`, snapshots).
Version state machine: `draft → technical_approved → active` (prior active → `superseded`).

| Step | Action | File |
|---|---|---|
| Create draft header | `createBomDraft(...)` | `bom/_actions/create-draft.ts` |
| Add / edit / remove lines (multi-line) | line actions | `bom/_actions/line-actions.ts` |
| Approve `draft\|in_review → technical_approved` | `approveBom(...)` | `bom/_actions/workflow.ts` |
| Publish `technical_approved → active` | `publishBom(...)` | `bom/_actions/workflow.ts` |

- `approveBom` re-validates **cycle-freeness** (V-TEC-13) and **RM usability** (V-TEC-14)
  at approve time; stamps `approved_by/approved_at`.
- `publishBom` **supersedes** the prior active version for that product in the **same
  transaction** (atomic), then emits `fg.bom.released` to the outbox. Rollback = re-publish
  a prior version.
- **Clone-on-write red-line:** approved/active BOM *content* is never mutated — only the
  status column moves (migration-090 immutability trigger).
- **Co-products / disassembly:** `bom_co_products` carry co/by-product outputs; a WO
  materializes one `wo_outputs` row per output type at start (step 8).

History / diff / snapshots: `bom/_actions/history.ts`, `diff-action.ts`,
`/technical/boms/snapshots`.

---

## 4. Factory spec release (the Technical approval bundle)

**Route:** `/technical/factory-specs`
`apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/page.tsx`
`factory_specs.status`: `draft → in_review → approved_for_factory → released_to_factory`
(+ `superseded`, `archived`).

| Step | Action | File |
|---|---|---|
| Create spec | `createFactorySpec(...)` | `factory-specs/actions/create-factory-spec.ts` |
| Submit for review (`draft→in_review`) | `submitFactorySpecForReview(...)` | `factory-specs/actions/factory-spec-flow.ts` |
| Link a BOM version to the spec | `linkFactorySpecBom(...)` | `factory-specs/actions/factory-spec-flow.ts` |
| **Approve the bundle** (spec **+** BOM together) | `approveReleaseBundle(...)` | `apps/web/lib/technical/release-bundle-service.ts` |

**Bundle approval (the key gate):** the factory_spec and its **specific BOM version** are
approved **TOGETHER or NOT AT ALL** (atomic) — driven from the **Release bundle panel**
(`factory-specs/_components/release-bundle-panel.client.tsx`):
- Gated on `technical.product_spec.approve` + `technical.bom.approve`; CFR-21 e-sign intent
  `tech.fa.release`.
- In ONE txn: spec → `approved_for_factory`, BOM `draft|in_review → technical_approved`
  (or stays `active`), emits **`technical.factory_spec.approved`** to the outbox, and the
  NPD adapter closes the release loop (`factory_release_status`).
- **Clone-on-write:** editing a *released* bundle clones a new draft version; the released
  record stays immutable (migration-165 trigger + `factory-spec-release-guards.ts`).

### NEW — Recall (W11-R4 reversibility)

**Action:** `recallFactorySpec(...)`
`factory-specs/_actions/recall-spec.ts`
- Gated on `technical.factory_spec.recall`. Moves a `released_to_factory` spec **back to
  `draft`**, clearing `approved_by/at` + `released_by/at`.
- **Blocked** if any WO with `status in (RELEASED, IN_PROGRESS)` references it
  (`active_factory_spec_id`) — returns the blocking WO numbers.
- Audited as `technical.factory_spec.recalled`. *(R4 e-sign is a documented TODO.)*

---

## 5. Routings / manufacturing ops (brief)

**Route:** `/technical/routings`
`apps/web/app/[locale]/(app)/(modules)/technical/routings/page.tsx`
- `createRouting(...)` → routing header at `status='draft'`
  (`routings/_actions/create-routing.ts`), with zero-or-more operations.
- `approveRouting(...)` (`routings/_actions/approve-routing.ts`): `draft → approved`, then
  on activation **supersedes** the prior active routing (`status='superseded'`,
  `effective_to=today`).
- `cost-preview.ts` previews labour/machine cost per op.
- The **active** routing is snapshotted into `wo_operations` at WO create (step 6).

---

## 6. Planning — POs, TOs, WOs, MRP, forecasts

**Module routes:** `/planning/...`
`apps/web/app/[locale]/(app)/(modules)/planning/...`
Write gate for procurement = `npd.planning.write` (`hasPlanningWritePermission`,
`planning/_actions/procurement-shared.ts`).

### Purchase Orders (procurement)
**Route:** `/planning/purchase-orders` (detail `/[id]`) — `purchase-orders/page.tsx`
- `createPurchaseOrder(...)` etc. — `purchase-orders/_actions/actions.ts`. PO status:
  `draft → sent → confirmed → partially_received → received` (+ `cancelled`); server-side
  state machine `PO_TRANSITIONS`.
- **NEW — Export (E-IO, uncommitted):** `createExportJob(...)`
  `purchase-orders/_actions/create-export-job.ts` — CSV export of the *same* filtered list
  the screen shows (human-readable, no UUIDs), logs an `import_export_jobs` row. Export-only.

### Transfer Orders (inter-location/site)
**Route:** `/planning/transfer-orders` — `transfer-orders/_actions/actions.ts`
(+ `reverse-receive.ts` for the W11 TO-receive reversal).

### Work Orders
**Route:** `/planning/work-orders` (detail `/[id]`) — `work-orders/page.tsx`
- **Create:** `createWorkOrder(...)` — `work-orders/_actions/createWorkOrder.ts`
  - Requires the FG to have an **active BOM** + factory_spec in
    `(approved_for_factory, released_to_factory)`.
  - Snapshots `uom_snapshot` + materializes `wo_materials` from the active BOM, and
    `wo_operations` from the active routing, at create time. Qty entered in the output unit
    is converted to base via `lib/uom`. *(This conversion is the "WO conversion preview".)*
- **Release (B9 gate):** `releaseWorkOrder(...)` — `work-orders/_actions/releaseWorkOrder.ts`
  - `DRAFT → RELEASED` only. Self-heals `active_bom_header_id` + `active_factory_spec_id`
    from the FG; if either is still missing → **`factory_release_incomplete`** (this is the
    "release blocked until spec released" gate). Writes `wo_status_history`.
- **Draft edit (W11-R1):** `update-work-order.ts` allows editing a DRAFT WO before release.

### MRP
**Route:** `/planning/mrp` — actions in `planning/_actions/mrp.ts`
- **`runMrp({ persist })`** — read gate `scheduler.run.read`; nets demand vs supply
  (`wo_materials` remaining, `v_inventory_available`, open-PO remainder,
  `schedule_outputs`, `reorder_thresholds` + supplier lead time). With `persist:true` it
  writes an `mrp_runs` header, `mrp_requirements`, and **`mrp_planned_orders`** (suggested),
  then emits `planning.mrp.completed`. *(The file's top docstring still says planned orders
  aren't written — that is stale; `persistPlannedOrders` (mrp.ts:461) writes them.)*
- **NEW — convert suggestions (E6, uncommitted):**
  `convertPlannedToPo(plannedOrderIds)` and `convertPlannedToWo(plannedOrderIds)`
  (`mrp.ts:731` / `:802`) — gated on `planning.mrp.convert` **and** `npd.planning.write`;
  call the real `createPurchaseOrder` / `createWorkOrder`, then mark the planned orders
  `release_status='released'` with `released_order_id`.

### Forecasts (NEW, uncommitted)
**Route:** `/planning/forecasts` — `planning/_actions/forecasts.ts`
- Editable demand grid (`demand_forecasts`, mig-302 unique `(org, item, iso_week)`); writes
  gate on `planning.forecast.manage`. `upsertForecast` / `deleteForecast` / copy-forward.
  Only forecast-eligible item types (FG-ish) carry independent demand; components derive
  from the BOM explosion.

---

## 7. Warehouse — receive, GRN, License Plates, put-away, FEFO

> The PO-receive write is **one shared function** used by both the desktop and scanner
> paths: `apps/web/lib/warehouse/scanner/receive-po.ts` (`receivePoLine`). It is invoked
> through the scanner API route `apps/web/app/api/warehouse/scanner/receive-line/route.ts`.

**Receive a PO line** → in one transaction `receivePoLine` (`receive-po.ts`):
1. `INSERT public.grns` (+ `grn_items`) — auto `grn_number`, links PO + supplier + warehouse.
2. `INSERT public.license_plates` — the **LP** (lot/qty unit), born
   `status='received', qa_status='pending'` at the destination location
   (`toLocationId` or the warehouse default), with batch / best-before / shelf-life snapshot.
3. Writes the LP genesis row (genealogy root).
4. Rolls up PO status (`partially_received` / `received`); flags `overReceived`.
5. **GRN-QC → QA hold (reworded today):** the LP is **always** born `qa_status='pending'`
   — it is **never auto-released**. When the tenant flag
   `feature_flags->require_grn_qc_inspection` is ON, `receivePoLine` *additionally* opens a
   pending **quality inspection** for the LP (`requiresGrnQcInspection` →
   `insertQcInspectionForLp`). Either way the stock is **not consumable** until QA releases
   it (step 9) — the `qa_status='pending'` LP is excluded from FEFO consumable candidates.

**Scanner receive flow (UI):** `/scanner/receive-po` → `[poId]` → `[lineId]`
(`apps/web/app/[locale]/(scanner)/scanner/receive-po/...`).

**Put-away / move LP:** `/warehouse/movements` (and `/scanner/putaway`, `/scanner/move`) →
`createStockMove(...)` `warehouse/_actions/stock-move-actions.ts` — writes a `stock_moves`
row and re-homes the LP's `location_id`.

**FEFO:** inventory reads order by expiry via `v_inventory_available` (mig-191); items with
no shelf life sort last (`NULLS LAST`). Consumable-candidate query lives in
`production/_actions/consume-material-actions.ts:listConsumableLps`
(`status='available' AND qa_status='released'`, minus reserved).

Other warehouse screens (real, read/write): `/warehouse/grns`, `/license-plates`,
`/inventory`, `/expiry`, `/reservations`, `/genealogy`, `/locations`.

---

## 8. Production — start, consume, output, waste, reversibility, CCP

**Module routes:** `/production/...`
`apps/web/app/[locale]/(app)/(modules)/production/...`
Canonical owner of `wo_outputs`, `wo_waste_log`, `downtime_events`, OEE snapshots.

### Start WO
`startWo(...)` — `apps/web/lib/production/start-wo.ts`
- `RELEASED → IN_PROGRESS`. **Freezes the BOM** (`createBomSnapshot`, idempotent per
  `org/wo/bom_header`) and materializes `wo_outputs` from `schedule_outputs` (one row per
  output type: fg / co_product / by_product).
- **Food-safety gate:** if the WO's `allergen_profile_snapshot.segregation_required` is
  true, **START is hard-blocked**.

### Consume material (FEFO LP pick)
`recordDesktopConsumption(...)` — `production/_actions/consume-material-actions.ts`
(scanner equiv via `app/api/production/scanner/wos/[id]/consume/route.ts`)
- Picks from FEFO-ordered consumable LPs (`listConsumableLps`).
- **LP safety gate** (`lib/production/lp-safety-guard.ts:assertLpConsumableForProduction`):
  rejects `lp_not_released` (not `qa_status='released'`), staleness, and delegates **active
  quality holds** to the T-064 `holdsGuard` (`lib/production/holds-guard.ts`) → on a hold
  match returns `quality_hold_active` (409) and emits `production.consume.blocked`.
- **Two-tier over-consumption gate** (same txn): a **warn** band, and an **approve** band
  at `feature_flags->overconsume_threshold_pct` that **blocks** (supervisor approval
  required) above the limit. Updates `wo_materials.consumed_qty` + decrements the LP.

### Register output (catch-weight)
`registerOutput(...)` — `apps/web/lib/production/output/register-output.ts`
(scanner via `app/api/production/scanner/wos/[id]/output/route.ts`)
- INSERTs into `wo_outputs` (batch-unique-per-year V-PROD-24) and mints an **output LP**
  born `status='received', qa_status='pending'` (finished stock also starts on QA hold).
- **Catch-weight:** when `weight_mode='catch'`, persists `catch_weight_details` from the
  per-unit kg array and computes ±tolerance variance vs nominal.
- **Genealogy link:** new output LP `parent_lp_id` = the **first consumed LP**; **all**
  consumed LPs recorded in `ext_jsonb.consumed_lp_ids` (no junction table yet). Emits
  `PRODUCTION_OUTPUT_RECORDED_EVENT`.

### Waste
`recordWaste(...)` — `apps/web/lib/production/waste/record-waste.ts` → `wo_waste_log`
(waste is **always kg**).

### Reversibility (W11 R2 / R3 / R4 — landed this wave)
`production/_actions/corrections-actions.ts`:
- **`voidWoOutput(...)`** (R2) — voids a `wo_outputs` row, e-sign intent
  `production.output.void`, **storno** counter-entry; the output LP is taken to a
  non-`consumed` voided state so it never pollutes consumption.
- **`voidWasteEntry(...)`** (R2) — voids a `wo_waste_log` entry with a counter-entry.
- **`reverseConsumption(...)`** (R3) — e-sign intent `production.consumption.reverse`;
  restores `wo_materials.consumed_qty` and the LP quantity. *(No dedicated reverse event in
  the `production.*` outbox family — audited as `consumption_reversed`.)*

### NEW — CCP monitoring (E3, uncommitted)
**Route:** `/quality/ccp-monitoring`
`apps/web/app/[locale]/(app)/(modules)/quality/ccp-monitoring/page.tsx`
- Board of CCPs with the latest reading + IN/OUT-of-limit badge; **"+ Record reading"**.
- Uses the reviewed HACCP backend `quality/_actions/haccp-actions.ts`
  (`listCcps`, `listMonitoringLog`, **`recordMonitoring`**). An out-of-limit reading raises
  a **CCP deviation → auto-NCR** (`ccp_deviation`, `breach_ncr_id`).
- ⚠️ PARTIAL: the prototype's filter bar / timeline chart / full readings table are a
  documented deferral — this is the minimal E3 slice.

---

## 9. Quality — holds, NCR, specs, inspections, HACCP/CCP gates

**Module routes:** `/quality/...`
`apps/web/app/[locale]/(app)/(modules)/quality/...`

| Area | Route | Action file |
|---|---|---|
| Holds (place / release) | `/quality/holds` | `_actions/hold-actions.ts` |
| NCR workflow | `/quality/ncrs` | `_actions/ncr-actions.ts` |
| Specifications + spec wizard | `/quality/specifications` | `_actions/spec-actions.ts` |
| Inspections (incl. GRN-QC from step 7) | `/quality/inspections` | `_actions/inspection-actions.ts` |
| HACCP / CCP (incl. step-8 monitoring) | `/quality/ccp-monitoring` | `_actions/haccp-actions.ts` |

**Where quality gates the golden path:**
- **GRN-QC** holds received stock on `qa_status='pending'` until a QA release
  (`warehouse/_actions/lp-qa-actions.ts`), which flips the LP to `qa_status='released'` and
  makes it FEFO-consumable.
- **Consume gate (T-064):** active holds + non-released LPs block consumption in step 8.
- **CCP breach:** out-of-limit monitoring → deviation + auto-NCR.
- **Allergen segregation:** blocks WO START (step 8) when the snapshot requires segregation.

---

## 10. Shipment — SO, allocation, pick/pack/ship

> 🔴 **STUB — read carefully.** The **server actions exist and write real data**, but the
> `/shipping` **page is a skeleton landing card** (it only shows a record count). There is
> no SO list / allocation / pick / pack UI wired to these actions yet.

**Page (stub):** `/shipping`
`apps/web/app/[locale]/(app)/(modules)/shipping/page.tsx` — renders
`ModuleDataPanel` with a `getModuleCount('shipment')` count. No SO grid.

**Actions (real):** `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts`
- `createSalesOrder(...)` — SO header + lines.
- `transitionSalesOrderStatus(...)` — server-side state machine `LEGAL_TRANSITIONS`:
  `draft → confirmed → allocated → partially_picked → picked → partially_packed → packed →
  shipped` (+ `cancelled`). Gates: `ship.so.create` / `ship.so.confirm` / `ship.so.cancel`.
- Allocation: confirming reserves `inventory_allocations`; cancelling
  `deallocateSalesOrderInContext(...)` releases LP holds (`InsufficientStockError` when
  short).

⚠️ PARTIAL: pick/pack/ship statuses are modelled in the transition table, but
**SSCC-18 pack labels, BOL/POD generation, and carriers are not yet implemented** as
actions in this file.

---

## Diagram — the whole golden flow

### Mermaid (renders on GitHub)

```mermaid
flowchart TD
    subgraph TECH["03-Technical / 01-NPD"]
        I["Item created<br/>public.items (draft)<br/>createItem"]
        I -->|transitionItemStatus| IA["Item active"]
        NPD["NPD project<br/>public.product"]
        NPD -->|advanceProjectGate G0-G4<br/>approveProjectGate (e-sign G4)| GATE["G4 passed"]
        GATE -->|promoteToProduction →<br/>releaseNpdProjectToFactory| FGITEM["Canonical fg item<br/>+ factory_release_status"]
        BOM["BOM draft<br/>bom_headers/lines<br/>createBomDraft"]
        BOM -->|approveBom / publishBom| BOMA["BOM active<br/>(fg.bom.released)"]
        FS["factory_spec draft"]
        FS -->|submit + linkFactorySpecBom| FSR["spec in_review"]
        FSR -->|approveReleaseBundle (e-sign)<br/>spec+BOM atomic| FSAP["spec approved_for_factory<br/>technical.factory_spec.approved"]
        BOMA -.bundled with.- FSAP
        FSAP -.recallFactorySpec R4.-> FS
    end

    subgraph PLAN["04/07-Planning"]
        MRP["runMrp → mrp_planned_orders<br/>(+ forecasts demand_forecasts)"]
        MRP -->|convertPlannedToPo / ToWo| PO
        PO["PO draft → sent<br/>createPurchaseOrder"]
        WO["WO draft<br/>createWorkOrder<br/>(snapshots wo_materials + wo_operations)"]
        WO -->|releaseWorkOrder<br/>needs active BOM + approved spec| WOR["WO RELEASED"]
    end

    subgraph WH["05-Warehouse"]
        GRN["receivePoLine →<br/>GRN + grn_items"]
        LP["License Plate<br/>status=received, qa_status=pending"]
        GRN --> LP
        LP -->|createStockMove| PUT["Put-away (location_id)"]
        LP -->|require_grn_qc_inspection| QHOLD["QA inspection (pending)"]
    end

    subgraph PROD["08-Production"]
        START["startWo<br/>freeze BOM snapshot<br/>materialize wo_outputs"]
        CONS["recordDesktopConsumption<br/>FEFO LP pick · holds/LP gate<br/>over-consume 2-tier"]
        OUT["registerOutput (catch-weight)<br/>wo_outputs + output LP"]
        WASTE["recordWaste → wo_waste_log (kg)"]
        START --> CONS --> OUT --> WASTE
        OUT -.voidWoOutput / reverseConsumption R2/R3.-> CONS
        CCP["CCP monitoring<br/>recordMonitoring → auto-NCR"]
    end

    subgraph QA["09-Quality"]
        REL["QA release LP<br/>qa_status=released (FEFO-consumable)"]
    end

    subgraph SHIP["11-Shipping (actions real, page STUB)"]
        SO["SO draft → confirmed → allocated<br/>createSalesOrder / transitionSalesOrderStatus<br/>inventory_allocations"]
        SHP["picked → packed → shipped"]
        SO --> SHP
    end

    IA --> BOM
    FGITEM --> BOM
    FGITEM --> FS
    BOMA --> WO
    FSAP --> WO
    PO --> GRN
    QHOLD --> REL
    LP --> REL
    REL --> CONS
    WOR --> START
    OUT --> REL
    REL --> SO

    %% data objects threading genealogy
    LP -. parent_lp_id .-> OUT
    OUT -. consumed_lp_ids[] .-> CONS
    OUT -. shipped LP .-> SO
```

### ASCII fallback

```
  ITEM (public.items, createItem) --draft→active (transitionItemStatus)--> ACTIVE ITEM
                                                                              |
  NPD project (public.product) --gate G0..G4 (advance/approveProjectGate, e-sign G4)--+
        |                                                                             |
        +-- promoteToProduction → releaseNpdProjectToFactory --> CANONICAL fg ITEM ---+
                                                                              |
                                            v---------------------------------+
                            BOM (bom_headers/lines) --approveBom→publishBom--> BOM ACTIVE  (fg.bom.released)
                            FACTORY_SPEC --submit+linkBom--> in_review                 |
                                   \                                                   |
                                    +-- approveReleaseBundle (spec+BOM ATOMIC, e-sign) +--> SPEC approved_for_factory
                                                                                       |     (technical.factory_spec.approved)
                                                                                       |     [recallFactorySpec R4 → back to draft]
        MRP (runMrp → mrp_planned_orders)  + FORECASTS (demand_forecasts)              |
                |                                                                      |
   convertPlannedToPo / convertPlannedToWo                                             |
                |                                                                      v
                +--> PO (createPurchaseOrder) ----> RECEIVE (receivePoLine) ==> GRN + LICENSE PLATE
                |                                       LP: status=received, qa_status=PENDING
                |                                            |               (require_grn_qc_inspection → QA inspection)
                +--> WO (createWorkOrder, snapshots wo_materials+wo_operations)        |
                          |                                  put-away (createStockMove) v
                   releaseWorkOrder  (needs active BOM + approved spec) --> WO RELEASED |
                          |                                                             |
                          v                                       QA release LP (qa_status=RELEASED, FEFO-consumable)
                     startWo (freeze BOM snapshot, materialize wo_outputs)             |
                          |                                                            |
                     recordDesktopConsumption  <---- FEFO consume RELEASED LP ---------+
                       (LP/holds gate T-064, 2-tier over-consume)
                          |          ^  reverseConsumption (R3)
                          v          |
                     registerOutput (catch-weight) → wo_outputs + OUTPUT LP
                          |          ^  voidWoOutput (R2, storno)
                          |          \---- genealogy: parent_lp_id = first consumed LP
                          |                            consumed_lp_ids[] = all consumed LPs
                          v
                     recordWaste → wo_waste_log (kg)
                          |
   (output LP) QA release → SO (createSalesOrder) → confirmed → allocated (inventory_allocations)
                          → picked → packed → shipped   [ACTIONS REAL · /shipping PAGE = STUB]

  Data objects threading the chain:
     item  →  bom_headers/bom_lines  →  wo_materials (BOM snapshot)  →  consume
     item  →  schedule_outputs       →  wo_outputs  →  output LP  →  SO / inventory_allocations
     LP genealogy: license_plates.parent_lp_id + ext_jsonb.consumed_lp_ids  (traceGenealogy)
```

---

## WHERE IT BREAKS / GAPS (grounded)

### ✅ Fully working (action + UI + real Supabase)
- **Items**: list/create/edit/deactivate/transition + detail tabs + CSV import
  (`technical/items/_actions/*`).
- **BOM**: draft → technical_approved → active, supersede, snapshots
  (`technical/bom/_actions/workflow.ts`).
- **Factory specs**: create → submit → link BOM → bundle approve (atomic, e-sign) → recall
  (`release-bundle-service.ts`, `recall-spec.ts`).
- **NPD Stage-Gate + release**: advance/approve gates + `promoteToProduction`
  (`(npd)/pipeline/_actions/*`, `handoff/_actions/promote-to-production.ts`).
- **Planning**: PO/TO/WO create + WO release gate + draft edit; MRP run+persist; **MRP
  convert** and **forecasts** (uncommitted but wired) (`planning/_actions/*`,
  `work-orders/_actions/*`).
- **Warehouse receive**: GRN + LP + put-away + FEFO, both desktop and scanner share
  `lib/warehouse/scanner/receive-po.ts`.
- **Production**: start / consume (FEFO + gates) / output (catch-weight) / waste +
  reversibility (void output/waste, reverse consumption).
- **Quality**: holds, NCR, specs, inspections, HACCP; **CCP monitoring** page (uncommitted).

### ⚠️ PARTIAL
- **CCP monitoring (E3)**: board + record-reading work; the prototype's filter bar,
  timeline chart and full readings table are a **documented deferral**
  (`quality/ccp-monitoring/page.tsx:7-11`).
- **MRP docstring drift**: `mrp.ts` header still claims `mrp_planned_orders` isn't written;
  `persistPlannedOrders` (`mrp.ts:461`) *does* write them — the convert path depends on it.
- **Genealogy model**: a single `parent_lp_id` per LP; multi-parent consumption is stored
  in `ext_jsonb.consumed_lp_ids` (no `lp_genealogy` junction table yet —
  `register-output.ts:280-282`).
- **Scanner line→site**: WO `production_line_id` / op `site_id` are nullable day-1; line
  keys are resolved uuid↔code through `production_lines` and may be null on legacy rows
  (`lib/production/start-wo.ts:53,155-160`). Carried as a known data-hygiene gap.
- **Settings Import/Export hub**: master-data + settings-entity **import** is rendered with
  `featureAvailable={false}` (disabled) — only **export** is live
  (`settings/import-export/page.tsx:322,348`; the dry-run button fail-closes when the
  caller lacks the permission). *(This is the central hub; the items-only CSV import in
  step 1 is separate and live.)*

### 🔴 STUB
- **Shipping page**: `/shipping` is a skeleton landing card (record count only). The SO /
  allocation / pick / pack / ship actions in `shipping/_actions/so-actions.ts` are real and
  write data, but **no UI is wired to them**, and **SSCC-18 labels / BOL / POD / carriers
  are not implemented** in that action file.
- **`apps/worker`**: the outbox-consumer / cron worker app referenced by the event flow
  (`fg.bom.released`, `technical.factory_spec.approved`, `production.*`,
  `planning.mrp.completed`) is written to `outbox_events` but **does not exist yet** as a
  running consumer (per `MON-project-overview`) — events are persisted, not dispatched.
```
