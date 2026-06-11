-- Migration 278: data fix — repoint dangling product_id on mig-259 demo WOs.
--
-- Diagnosis (verified live): migration 259 inserted work_orders 'DEMO-WO-259-%'
-- with hardcoded item UUIDs (25900000-...-0004xx), but the matching
-- `insert into items ... on conflict (org_id, item_code) do nothing` was
-- skipped because items with codes FG-NPD-004 / E2E-FG-0609 already existed
-- under different ids. Result: 5 work_orders + 2 seeded wo_outputs carry
-- product_id values with NO items row. work_orders.source_reference holds the
-- item CODE, which is the repoint key. Secondary: these WOs have
-- uom_snapshot / qty_entered_uom NULL, so unit-based output entry fails with
-- 'uom_conversion_unavailable' (apps/web/lib/production/output/register-output.ts).
--
-- Idempotent: every UPDATE is guarded by a dangling-pointer NOT EXISTS check
-- (steps 1-2) or an IS NULL check (step 3); healthy WOs are never touched.
-- Wave0 lock: org_id business scope (NOT tenant_id); scoping is via the
-- wo_number pattern + org-joined item lookup, no hardcoded org uuid required.

-- (1) Repoint work_orders.product_id from source_reference (= item_code),
-- ONLY where the current product_id matches no items row at all.
update public.work_orders wo
   set product_id = i.id
  from public.items i
 where wo.wo_number like 'DEMO-WO-259-%'
   and i.org_id = wo.org_id
   and i.item_code = wo.source_reference
   and not exists (
         select 1
           from public.items cur
          where cur.id = wo.product_id
       );

-- (2) Repoint the seeded wo_outputs rows via their WO (same dangling guard;
-- only adopts the WO's product_id once that pointer is itself valid).
update public.wo_outputs o
   set product_id = wo.product_id
  from public.work_orders wo
 where wo.id = o.wo_id
   and wo.org_id = o.org_id
   and wo.wo_number like 'DEMO-WO-259-%'
   and not exists (
         select 1
           from public.items cur
          where cur.id = o.product_id
       )
   and exists (
         select 1
           from public.items tgt
          where tgt.id = wo.product_id
            and tgt.org_id = wo.org_id
       );

-- (3) Backfill uom_snapshot + qty_entered_uom where NULL for these demo WOs.
-- Shape replicates exactly what the app writes at WO creation
-- (createWorkOrder.ts dbUomSnapshot) and at the start-WO self-heal
-- (apps/web/lib/production/start-wo.ts jsonb_build_object block).
-- qty_entered_uom mirrors the item's output_uom ('base' fallback), matching
-- the work_orders_qty_entered_uom_check constraint (base|each|box).
update public.work_orders wo
   set uom_snapshot = coalesce(wo.uom_snapshot, jsonb_build_object(
         'output_uom', i.output_uom,
         'uom_base', i.uom_base,
         'net_qty_per_each', i.net_qty_per_each,
         'each_per_box', i.each_per_box,
         'boxes_per_pallet', i.boxes_per_pallet,
         'weight_mode', i.weight_mode
       )),
       qty_entered_uom = coalesce(wo.qty_entered_uom, i.output_uom, 'base')
  from public.items i
 where wo.wo_number like 'DEMO-WO-259-%'
   and i.org_id = wo.org_id
   and i.id = wo.product_id
   and (wo.uom_snapshot is null or wo.qty_entered_uom is null);
