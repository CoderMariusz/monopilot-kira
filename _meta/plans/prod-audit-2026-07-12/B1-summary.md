# Wave B1 — Implementation summary (2026-07-12)

## Repro (owner round-2 audit)

| ID | Repro | Fix |
|----|-------|-----|
| B1a | Parent FG WO qty 10.500→12.750 kg resnapshotted parent `wo_materials` WIP line to 10.710 kg but child WIP WO `planned_quantity` + `wo_dependencies.required_qty` stayed 8.820; `qty_entered` showed stale "7 box" | Chain sync after parent qty resnapshot; reconcile/clear `qty_entered` on base edit |
| B1b | Date picker 15 Jul → stored/displayed 14 Jul 23:00 UTC (local-midnight `toISOString`) | Civil date → UTC midnight choke point |
| B1c | MRP previous-runs "Date" column showed `horizon_start` | Show `created_at` as run date; separate horizon column |
| B1d | Dashboard "Run MRP" → `/scheduler` | Route → `/planning/mrp` |
| B1e | Consumption list stale after desktop consume | `revalidateLocalized` on successful `recordDesktopConsumption` (A3 S4 pattern) |

## Root causes

### B1a — chain desync on parent edit
- **Cause:** `updateWorkOrder` resnapshotted parent `wo_materials` when `plannedQuantity` changed but never updated downstream WIP WOs linked via `wo_dependencies`, nor `wo_dependencies.required_qty`. Child WOs were only sized at chain create time (`create-work-order-chain.ts`).
- **Cause (qty_entered):** Parent edit updated `planned_quantity` only; `qty_entered` / `qty_entered_uom` left from original box entry.
- **Fix:** Shared `propagateParentWoChainQuantities()` in `apps/web/lib/planning/wo-chain-qty-sync.ts` — same txn, after parent resnapshot. Blocks with `chain_child_not_editable` when child status ∉ {DRAFT, RELEASED}. `reconcileQtyEnteredOnBaseEdit()` updates or clears entered qty.

### B1b — scheduled date off-by-one
- **Cause:** `edit-wo-modal.tsx` / `create-wo-modal.tsx` used `new Date(date + 'T00:00:00').toISOString()` (local timezone midnight → UTC shift). Display used `iso.slice(0,10)` which is correct only for UTC-midnight instants.
- **Fix:** `civilDateToUtcIso()` / `utcIsoToCivilDate()` in `apps/web/lib/planning/civil-date.ts` — persist `YYYY-MM-DDT00:00:00.000Z`, display UTC calendar date.

### B1c — MRP runs list mislabeled date
- **Cause:** `mrp-view.tsx` Previous runs table rendered `run.horizonStart` in the column labeled "Date".
- **Fix:** Run date column uses `run.createdAt` (already returned by `listMrpRuns`); added horizon column for `horizonStart`.

### B1d — dashboard quick link
- **Cause:** `dashboard/page.tsx` `QUICK_ACTIONS` had `runMrp` → `/scheduler`.
- **Fix:** → `/planning/mrp`.

### B1e — consumption list not refreshed
- **Cause:** `recordDesktopConsumption` committed successfully but did not revalidate RSC routes (unlike `reverseConsumption` in `corrections-actions.ts`).
- **Fix:** After successful non-replay consume, `revalidateLocalized('/production', 'page')` + `revalidateLocalized(\`/production/wos/${woId}\`, 'page')`.

## Diff locations

| File | Finding |
|------|---------|
| `apps/web/lib/planning/civil-date.ts` | B1b shared civil-date helpers |
| `apps/web/lib/planning/civil-date.test.ts` | B1b test |
| `apps/web/lib/planning/wo-chain-qty-sync.ts` | B1a chain propagation + qty_entered reconcile |
| `apps/web/lib/planning/wo-chain-qty-sync.test.ts` | B1a tests |
| `apps/web/app/.../planning/work-orders/_actions/update-work-order.ts` | B1a integration + qty_entered columns on UPDATE |
| `apps/web/app/.../planning/work-orders/_actions/shared.ts` | `chain_child_not_editable` error |
| `apps/web/app/.../planning/work-orders/_components/edit-wo-modal.tsx` | B1b civil date |
| `apps/web/app/.../planning/work-orders/_components/create-wo-modal.tsx` | B1b civil date |
| `apps/web/app/.../planning/mrp/_components/mrp-view.tsx` | B1c run date vs horizon columns |
| `apps/web/app/.../planning/mrp/page.tsx` | B1c i18n keys |
| `apps/web/app/.../dashboard/page.tsx` | B1d route |
| `apps/web/app/.../production/_actions/consume-material-actions.ts` | B1e revalidate |
| `apps/web/i18n/{en,pl,ro,uk}.json` | B1c column labels |
| Tests: `update-work-order.test.ts`, `wo-edit.test.tsx`, `mrp.test.tsx`, `mrp.test.ts`, `dashboard.test.tsx`, `consume-material-actions.test.ts` | Per-finding coverage |

**No new migration** (next free = 487 unchanged).

## NEW raw SQL (verbatim)

### Chain edge load + child lock (`wo-chain-qty-sync.ts`)

```sql
select dep.child_wo_id::text as child_wo_id,
       child.status as child_status,
       child.product_id::text as child_product_id,
       dep.material_link::text as material_link,
       wm.required_qty::text as material_required_qty
  from public.wo_dependencies dep
  join public.work_orders child
    on child.org_id = dep.org_id
   and child.id = dep.child_wo_id
  left join public.wo_materials wm
    on wm.org_id = dep.org_id
   and wm.id = dep.material_link
 where dep.org_id = app.current_org_id()
   and dep.parent_wo_id = $1::uuid
 order by child.wo_number
 for update of child
```

### Child WO planned qty update

```sql
update public.work_orders
   set planned_quantity = $2::numeric,
       updated_by = $3::uuid,
       updated_at = now()
 where org_id = app.current_org_id()
   and id = $1::uuid
   and status in ('DRAFT', 'RELEASED')
returning id
```

### Dependency required_qty sync

```sql
update public.wo_dependencies
   set required_qty = $3::numeric
 where org_id = app.current_org_id()
   and parent_wo_id = $1::uuid
   and child_wo_id = $2::uuid
```

### Child schedule_outputs sync

```sql
update public.schedule_outputs
   set expected_qty = $2::numeric,
       updated_at = now()
 where org_id = app.current_org_id()
   and planned_wo_id = $1::uuid
```

### Parent fetch extended for qty_entered (`update-work-order.ts`)

```sql
select id, status, site_id::text as site_id, product_id, planned_quantity::text as planned_quantity,
       scheduled_start_time, production_line_id, ext_jsonb->>'notes' as notes,
       qty_entered::text as qty_entered, qty_entered_uom
  from public.work_orders
 where org_id = app.current_org_id()
   and id = $1::uuid
 limit 1
 for update
```

### Parent UPDATE qty_entered reconciliation (`update-work-order.ts`)

```sql
qty_entered = case
  when $16::boolean then $17::numeric
  else wo.qty_entered
end,
qty_entered_uom = case
  when $16::boolean then $18::text
  else wo.qty_entered_uom
end,
```

## Verification gates

```text
pnpm --filter web exec tsc --noEmit   → exit 0
pnpm exec vitest run (default)      → PASS (108) — civil-date, wo-chain-qty-sync, update-work-order, mrp.test.ts, consume-material-actions
pnpm exec vitest run (ui config)    → PASS (33) — mrp.test.tsx, dashboard.test.tsx, wo-edit.test.tsx
```

No `'use server'` export shape changes → full build not required for this wave.

## Corrections (Codex review pass 2 — 2026-07-12)

### Root cause confirmed
- Parent `resnapshotWorkOrder` DELETEs `wo_materials` before `propagateParentWoChainQuantities` runs. `wo_dependencies.material_link` FK is `ON DELETE SET NULL`, so propagation saw `material_link = NULL` and skipped the edge — child stayed at stale qty (10.500→12.750 left child at 8.820).
- Child editability was checked after parent WO/schedule_output/materials writes; `return { ok: false }` committed partial state under `withOrgContext`.
- Chain propagation interleaved validation + mutation across edges; first child could mutate before a later `IN_PROGRESS` child failed.

### Fix
1. **`loadAndLockParentChainEdges`** — lock `child` + `dep` and capture `link_product_id` / `link_bom_item_id` from the linked parent material **before** parent delete.
2. **`preflightParentChainEdges`** — validate all child statuses (+ per_box pack hierarchy) **before** any parent mutation in `updateWorkOrder`.
3. **`propagateParentWoChainQuantities`** — two-phase: preflight all edges, load new parent materials post-resnapshot, **relink** `wo_dependencies.material_link` to the matching new parent row, then update child WO / dependency / schedule_output / child resnapshot. Post-write failures throw `ChainQtySyncRollbackError` to roll back.

### NEW raw SQL (corrections)

#### Edge load with material identity (before parent delete)

```sql
select dep.child_wo_id::text as child_wo_id,
       child.status as child_status,
       child.product_id::text as child_product_id,
       wm.product_id::text as link_product_id,
       wm.bom_item_id::text as link_bom_item_id
  from public.wo_dependencies dep
  join public.work_orders child
    on child.org_id = dep.org_id
   and child.id = dep.child_wo_id
  left join public.wo_materials wm
    on wm.org_id = dep.org_id
   and wm.id = dep.material_link
 where dep.org_id = app.current_org_id()
   and dep.parent_wo_id = $1::uuid
 order by child.wo_number
 for update of child, dep
```

#### Parent materials load (after resnapshot, for relink)

```sql
select id::text as id,
       product_id::text as product_id,
       bom_item_id::text as bom_item_id,
       required_qty::text as required_qty
  from public.wo_materials
 where org_id = app.current_org_id()
   and wo_id = $1::uuid
```

#### Dependency relink + required_qty sync

```sql
update public.wo_dependencies
   set material_link = $4::uuid,
       required_qty = $3::numeric
 where org_id = app.current_org_id()
   and parent_wo_id = $1::uuid
   and child_wo_id = $2::uuid
```

## Ambiguities resolved

- Child WIP resnapshot after qty propagation: yes — child materials/operations rebuilt when child `planned_quantity` changes (same SQL shape as parent resnapshot).
- Civil date storage: UTC midnight of picked calendar day (matches `wo-import-actions.ts` / pilot WO pattern), not org-local wall time.
- MRP list: kept both run timestamp and horizon; did not remove horizon data.
