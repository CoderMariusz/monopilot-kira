# Wave A4 — Implementation summary (2026-07-12)

Worktree: `monopilot-worktrees/A4` (branch `fix/A4`). **No migration used** (next free = 486).

## Verification

```text
$ cd apps/web && pnpm exec vitest run \
    lib/procurement/resolve-item-supplier.test.ts \
    lib/production/__tests__/consume-material-core.test.ts \
    lib/warehouse/receive-po-line-core.test.ts \
    app/[locale]/(app)/(modules)/planning/_actions/mrp-compute.test.ts \
    app/[locale]/(app)/(modules)/planning/_actions/mrp.test.ts \
    app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/receive-po-line.test.ts

PASS (121) FAIL (0)
```

`pnpm --filter web exec tsc --noEmit` — **not clean in this worktree** (symlinked `node_modules` from main checkout missing transitive types for `pg`, `zod`, etc.). Touched-unit scope is green above.

`pnpm --filter web run build` — **blocked by worktree env**: Turbopack rejects symlinked `apps/web/node_modules` pointing outside the worktree root. No `'use server'` export shape changed; new logic is internal to existing actions.

---

## S11 (P1) — Draft WIP counted as open supply

**Root cause:** `runMrp` used one `OPEN_WO_STATUSES` list (`DRAFT`, `RELEASED`, `IN_PROGRESS`) for both dependent demand and `schedule_outputs` production supply. Draft WOs are not schedulable/releasable WIP, so their projected output inflated `openSupply` and understated net requirements.

**Fix location:** `apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts` — split into `OPEN_WO_DEMAND_STATUSES` (unchanged) vs `SCHEDULABLE_WO_SUPPLY_STATUSES` (`RELEASED`, `IN_PROGRESS` only) on the `schedule_outputs` read.

**Repro:** Create a draft WO with `schedule_outputs.disposition='to_stock'` for item X. Run MRP before fix → `openSupply` includes draft output; after fix → draft output excluded, net requirement higher.

**Test:** `mrp.test.ts` — `does not count draft WIP schedule_outputs as open supply (S11)`.

---

## S12 (P1) — Planned order date in the past

**Root cause:** Time-phased suggestions used bucket Monday as `dueDate` even when that Monday was before “today”, and `persistPlannedOrders` could persist unstopped `release_date`/`due_date` values. Lead-time back-calculation could land release dates in the past when the shortage bucket start was earlier in the ISO week.

**Fix location:**
- `mrp-compute.ts` — `buildSuggestedAction`: floor `dueDate` at `todayIso`; clamp `releaseDate` to today + set `isLate` when lead time exceeds time-to-bucket (existing expedite path tightened).
- `mrp.ts` — `persistPlannedOrders`: floor `due_date` and `release_date` at run `today` before insert.

**Repro:** Run MRP mid-week with a shortage in the current bucket and lead time longer than days-since-Monday → before fix, `release_date` could be 3–6 days ago; after fix → `release_date = today`, `isLate`/expedite notes set.

**Test:** `mrp-compute.test.ts` — `clamps release to today and flags expedite when lead time exceeds time-to-bucket (S12)`.

---

## S13 (P1) — Auto-PO “no supplier” despite linked supplier / open PO

**Root cause:** MRP planned orders only carried `reorder_thresholds.preferred_supplier_id`. Manual PO creation resolves suppliers via open `supplier_specs` links and supplier-scoped item search (`po-form-data.ts` / `searchItems`); materials with an active spec or recent open PO but no threshold row got `supplier_id = null` → convert skipped as `missing supplier`.

**Fix location:**
- **New** `apps/web/lib/procurement/resolve-item-supplier.ts` — shared resolution (open PO history → `supplier_specs`).
- `mrp.ts` — `persistPlannedOrders` calls resolver for buy suggestions before insert.

**Repro:** Item with confirmed open PO for supplier S but no `reorder_thresholds` row → MRP persist → before fix `supplier_id` null; after fix `supplier_id = S`.

**Test:** `resolve-item-supplier.test.ts`; `mrp.test.ts` — `resolves buy planned-order supplier from open PO history when threshold is unset (S13)`.

### NEW SQL — open PO supplier (PREPARE-check)

```sql
select distinct on (l.item_id)
       l.item_id::text as item_id,
       po.supplier_id::text as supplier_id
  from public.purchase_order_lines l
  join public.purchase_orders po
    on po.id = l.po_id
   and po.org_id = app.current_org_id()
   and po.status = any($2::text[])
 where l.org_id = app.current_org_id()
   and l.item_id = any($1::uuid[])
 order by l.item_id, po.updated_at desc nulls last, po.created_at desc nulls last
```

### NEW SQL — supplier_specs fallback (PREPARE-check)

```sql
select distinct on (ss.item_id)
       ss.item_id::text as item_id,
       s.id::text as supplier_id
  from public.supplier_specs ss
  join public.suppliers s
    on s.org_id = ss.org_id
   and s.code = ss.supplier_code
 where ss.org_id = app.current_org_id()
   and ss.item_id = any($1::uuid[])
   and ss.lifecycle_status = 'active'
   and ss.review_status = 'approved'
 order by ss.item_id, ss.effective_from desc nulls last, ss.updated_at desc nulls last
```

---

## S14 (P2) — Received LP `status=available` with `qa_status=pending`

**Finding:** **Real inconsistency — fixed.**

**Root cause:** `receive-po-line-core.ts` `insertLicensePlate` created new GRN LPs as `status='available', qa_status='pending'`, while `v_inventory_available` (mig 191) requires `status='available' AND qa_status='released'`. LPs were invisible to FEFO/MRP on-hand but displayed as “available” on LP rows. Migration 282 intended `received` until QA release.

**Fix location:** `apps/web/lib/warehouse/receive-po-line-core.ts` — insert with `status='received'`; removed premature `insertLpAutoPutaway` (`received→available`) on receipt.

**Evidence:** `v_inventory_available` already excludes pending QA; fix aligns persisted `license_plates.status` with lifecycle. QA release / putaway paths still promote to `available` when `qa_status='released'`.

**Test:** `receive-po-line-core.test.ts` — `creates received LPs as status received with qa pending (S14)`; updated `receive-po-line.test.ts` / `receive-po.test.ts` expectations.

**No new SQL** (INSERT value change only).

---

## N2 (P2) — Hold masked as insufficient stock on consume

**Root cause:** When FEFO found no row in `v_inventory_available` (holds excluded), `resolveConsumptionLp` returned `lp_unavailable` without checking whether stock existed on hold. `assertLpConsumableForProduction` also checked `status !== 'available'` before `holdsGuard`, masking holds on non-available rows. UI mapped `lp_unavailable` → “insufficient free stock”.

**Fix location:**
- `consume-material-core.ts` — `findHeldConsumableLpId` after empty FEFO; return `quality_hold_active` when held stock would satisfy qty.
- `lp-safety-guard.ts` — run `holdsGuard` before generic `lp_unavailable` status gate.
- `production/wos/[id]/page.tsx` — hold error copy: “Material on quality hold — release the hold to consume.”

**Repro:** Only LP for a component is on active quality hold → consume → before fix: “insufficient free stock”; after fix: hold message / `quality_hold_active`.

**Test:** `consume-material-core.test.ts` — `resolveConsumptionLp hold messaging (N2)`.

### NEW SQL — held-stock probe (PREPARE-check)

```sql
select lp.id::text as lp_id
  from public.license_plates lp
 where lp.org_id = app.current_org_id()
   and lp.product_id = any($1::uuid[])
   and lp.uom = $2
   and lp.qa_status = 'released'
   and lp.status = 'available'
   and lp.quantity - $3::numeric >= lp.reserved_qty
   and exists (
     select 1
       from public.v_active_holds h
      where h.org_id = lp.org_id
        and (
          (h.reference_type = 'lp' and h.reference_id = lp.id)
          or (
            h.reference_type = 'batch'
            and h.reference_text is not null
            and lower(trim(h.reference_text)) in (
              nullif(lower(trim(lp.batch_number)), ''),
              nullif(lower(trim(lp.supplier_batch_number)), '')
            )
          )
        )
   )
 order by lp.expiry_date asc nulls last, lp.lp_number asc
 limit 1
```

---

## Files touched

| File | Findings |
|------|----------|
| `planning/_actions/mrp.ts` | S11, S12, S13 |
| `planning/_actions/mrp-compute.ts` | S12 (comment S11) |
| `lib/procurement/resolve-item-supplier.ts` | S13 (new) |
| `lib/warehouse/receive-po-line-core.ts` | S14 |
| `lib/production/consume-material-core.ts` | N2 |
| `lib/production/lp-safety-guard.ts` | N2 |
| `production/wos/[id]/page.tsx` | N2 (message) |
| + paired `*.test.ts` for each |

## Not done / ambiguities

- Full `next build` not run in worktree (symlink Turbopack limitation); orchestrator should run build gate on assembled tree.
- `insertLpAutoPutaway` helper left in `receive-po-line-core.ts` but no longer called on receipt (dead code; safe to delete in a follow-up).
- `scanner/receive-po.test.ts` has pre-existing `unknown_currency` failures unrelated to this wave (18 failures when included); not modified for behavior.

---

## Corrections pass (Codex cross-review — S13, S14, N2)

### S13 — Blocked suppliers + canonical supplier_specs.supplier_id FK

**Finding confirmed:** Open-PO and supplier_spec resolution did not filter `suppliers.status = 'blocked'`; supplier_specs joined only via legacy `supplier_code`.

**Fix:** `resolve-item-supplier.ts` — all tiers join `suppliers` with `status <> 'blocked'`; specs resolve via `coalesce(s_by_id, s_by_code)` on canonical `supplier_id` with code fallback for null FK rows. `fetchNonBlockedSupplierIds` + `pickProcurementSupplierId(..., eligibleSupplierIds)` in `mrp.ts` skips blocked preferred suppliers.

**Test:** `resolve-item-supplier.test.ts` — blocked open-PO skipped → active supplier_spec; blocked preferred → open-PO fallback.

### NEW SQL — open PO supplier with blocked filter (PREPARE-check)

```sql
select distinct on (l.item_id)
       l.item_id::text as item_id,
       po.supplier_id::text as supplier_id
  from public.purchase_order_lines l
  join public.purchase_orders po
    on po.id = l.po_id
   and po.org_id = app.current_org_id()
   and po.status = any($2::text[])
  join public.suppliers s
    on s.id = po.supplier_id
   and s.org_id = po.org_id
   and s.status <> 'blocked'
 where l.org_id = app.current_org_id()
   and l.item_id = any($1::uuid[])
 order by l.item_id, po.updated_at desc nulls last, po.created_at desc nulls last
```

### NEW SQL — supplier_specs via supplier_id FK + code fallback (PREPARE-check)

```sql
select distinct on (ss.item_id)
       ss.item_id::text as item_id,
       coalesce(s_by_id.id, s_by_code.id)::text as supplier_id
  from public.supplier_specs ss
  left join public.suppliers s_by_id
    on s_by_id.org_id = ss.org_id
   and s_by_id.id = ss.supplier_id
   and s_by_id.status <> 'blocked'
  left join public.suppliers s_by_code
    on s_by_code.org_id = ss.org_id
   and s_by_code.code = ss.supplier_code
   and ss.supplier_id is null
   and s_by_code.status <> 'blocked'
 where ss.org_id = app.current_org_id()
   and ss.item_id = any($1::uuid[])
   and ss.lifecycle_status = 'active'
   and ss.review_status = 'approved'
   and coalesce(s_by_id.id, s_by_code.id) is not null
 order by ss.item_id, ss.effective_from desc nulls last, ss.updated_at desc nulls last
```

### NEW SQL — non-blocked supplier eligibility batch (PREPARE-check)

```sql
select s.id::text as id
  from public.suppliers s
 where s.org_id = app.current_org_id()
   and s.id = any($1::uuid[])
   and s.status <> 'blocked'
```

---

### S14 — Scanner QA pass stuck at received/released (not in v_inventory_available)

**Finding confirmed:** Scanner inspect route only flipped `qa_status`; `releaseLpQaForContext` alone promoted `received→available`.

**Fix:** New shared `lib/warehouse/lp-qa-transition-core.ts` (`applyLpQaLifecycleTransition`) — atomic qa flip + `received→available` / `received→blocked` + `lp_state_history` + outbox. Used by `lp-qa-actions.ts` and `app/api/quality/scanner/inspect/route.ts`.

**Test:** `lp-qa-transition-core.test.ts`, `inspect.test.ts` — received/pending pass → available + ledger; post-transition row matches `v_inventory_available` predicates.

### NEW SQL — scanner/desktop QA lifecycle transition (PREPARE-check)

```sql
update public.license_plates
   set qa_status = $2,
       status = case
         when $2 = 'released' and status = 'received' then 'available'
         when $2 = 'rejected' and status = 'received' then 'blocked'
         else status
       end,
       updated_by = $3::uuid
 where org_id = app.current_org_id()
   and id = $1::uuid
   and app.user_can_see_site(site_id)
   and status <> all($4::text[])
returning id::text, lp_number, status, qa_status
```

### NEW SQL — QA promotion ledger (PREPARE-check)

```sql
insert into public.lp_state_history
  (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, ext_jsonb, created_by)
values
  (app.current_org_id(), $1::uuid, $2, $3, 'qa_status_changed', $4, $5::uuid, $6::jsonb, $7::uuid)
on conflict (org_id, transaction_id) do nothing
```

---

### N2 — Held probe required qa_status='released' (missed on_hold LPs)

**Finding confirmed:** `findHeldConsumableLpId` required `qa_status = 'released'`; holds set `qa_status = 'on_hold'`, so probe returned nothing → `lp_unavailable`.

**Fix:** `consume-material-core.ts` — probe admits `qa_status in ('released', 'on_hold')`; still requires `status = 'available'` and active hold match.

**Test:** `consume-material-core.test.ts` — on_hold LP under hold → `quality_hold_active` (not `lp_unavailable`).

### NEW SQL — held-stock probe (PREPARE-check, corrected)

```sql
select lp.id::text as lp_id
  from public.license_plates lp
 where lp.org_id = app.current_org_id()
   and lp.product_id = any($1::uuid[])
   and lp.uom = $2
   and lp.qa_status in ('released', 'on_hold')
   and lp.status = 'available'
   and lp.quantity - $3::numeric >= lp.reserved_qty
   and exists (
     select 1
       from public.v_active_holds h
      where h.org_id = lp.org_id
        and (
          (h.reference_type = 'lp' and h.reference_id = lp.id)
          or (
            h.reference_type = 'batch'
            and h.reference_text is not null
            and lower(trim(h.reference_text)) in (
              nullif(lower(trim(lp.batch_number)), ''),
              nullif(lower(trim(lp.supplier_batch_number)), '')
            )
          )
        )
   )
 order by lp.expiry_date asc nulls last, lp.lp_number asc
 limit 1
```

