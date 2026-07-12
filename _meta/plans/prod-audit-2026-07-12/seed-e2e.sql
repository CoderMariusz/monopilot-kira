-- Prod-audit E2E verification seed — org Apex 22 (0002). Idempotent, all rows prefixed E2E-A-*.
-- Re-runnable: deletes prior E2E-A-* fixture, then re-inserts. Rollback: run the DELETE block alone.
-- Anchors: FG0014=0ff4bd63-7ca2-4a44-908c-de52e9fd32cc, FG0015=5aeb13b3-ffe6-4608-bdbe-bf8ce46ad0cd,
--   WIP=604fa9b9-d4b3-4580-8659-7861845929fa, ING-FLOUR=37b6315e-bc85-489d-afb9-b2f376066dee,
--   flower2=12ed3a25-2549-4d33-aeaf-01dea1b8f7ca, admin=31fe18af-43f7-4c05-a078-db23a9a5bd3e,
--   Main Factory site=7b72b4af-48d5-4da2-a3fe-d191d9e6ec19 line=948c099f-8054-49ae-99a1-dd5bb9410cd4,
--   Main Warehouse=783bf255-efd8-48fe-9cc4-7a870859624f.
\set org '00000000-0000-0000-0000-000000000002'
\set admin '31fe18af-43f7-4c05-a078-db23a9a5bd3e'
begin;

-- ---- idempotent cleanup of prior fixture ----
create temp table _wo as
  select id from public.work_orders where org_id=:'org' and wo_number like 'E2E-A-%';
delete from public.wo_outputs where org_id=:'org' and (wo_id in (select id from _wo) or batch_number like 'E2E-A-%');
delete from public.wo_material_consumption where org_id=:'org' and wo_id in (select id from _wo);
delete from public.wo_materials where org_id=:'org' and wo_id in (select id from _wo);
delete from public.wo_events where org_id=:'org' and wo_id in (select id from _wo);
delete from public.wo_executions where org_id=:'org' and wo_id in (select id from _wo);
delete from public.wo_dependencies where org_id=:'org' and (parent_wo_id in (select id from _wo) or child_wo_id in (select id from _wo));
delete from public.quality_holds where org_id=:'org' and (reference_text like 'E2E-A-%'
  or reference_id in (select id from public.license_plates where org_id=:'org' and lp_number like 'E2E-A-%'));
delete from public.license_plates where org_id=:'org' and lp_number like 'E2E-A-%';
delete from public.work_orders where org_id=:'org' and id in (select id from _wo);
delete from public.suppliers where org_id=:'org' and code like 'E2E-A-%';
delete from public.supplier_specs where org_id=:'org' and supplier_code like 'E2E-A-%';

-- ============ SC1 — C4 yield gate (complete blocked at low consumption) ============
insert into public.work_orders (id, org_id, wo_number, product_id, active_bom_header_id, production_line_id, site_id,
  status, started_at, planned_quantity, uom, priority, source_of_demand, item_type_at_creation, disposition_policy,
  is_rework, over_production_flagged, released_to_warehouse, schema_version, created_at, updated_at)
values ('a0000001-0000-4000-8000-000000000001', :'org', 'E2E-A-C4-YIELD', '0ff4bd63-7ca2-4a44-908c-de52e9fd32cc',
  'cdc8a9a7-9100-4e0f-9915-496566acdca4', '948c099f-8054-49ae-99a1-dd5bb9410cd4', '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19',
  'IN_PROGRESS', now(), 100, 'kg', 'normal', 'manual', 'fg', 'to_stock', false, false, false, 1, now(), now());
insert into public.wo_outputs (id, org_id, wo_id, product_id, output_type, qty_kg, uom, qa_status, batch_number,
  transaction_id, ext_jsonb, schema_version, registered_at, created_at, updated_at)
values ('a0000001-0000-4000-8000-0000000000f1', :'org', 'a0000001-0000-4000-8000-000000000001',
  '0ff4bd63-7ca2-4a44-908c-de52e9fd32cc', 'primary', 3.000, 'kg', 'PENDING', 'E2E-A-C4-OUT',
  gen_random_uuid(), '{}'::jsonb, 1, now(), now(), now());

-- ============ SC2 — C3 (WIP->FG release gate) + C5 (chain-delete guard) ============
insert into public.work_orders (id, org_id, wo_number, product_id, active_bom_header_id, production_line_id, site_id,
  status, planned_quantity, uom, priority, source_of_demand, item_type_at_creation, disposition_policy,
  is_rework, over_production_flagged, released_to_warehouse, schema_version, created_at, updated_at)
values
 ('a0000002-0000-4000-8000-000000000002', :'org', 'E2E-A-C5-FG', '5aeb13b3-ffe6-4608-bdbe-bf8ce46ad0cd',
  '7cfbd0f0-2ec1-4c69-a637-9363de5cdd17', '948c099f-8054-49ae-99a1-dd5bb9410cd4', '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19',
  'DRAFT', 50, 'kg', 'normal', 'manual', 'fg', 'to_stock', false, false, false, 1, now(), now()),
 ('a0000002-0000-4000-8000-000000000003', :'org', 'E2E-A-C5-WIP', '604fa9b9-d4b3-4580-8659-7861845929fa',
  null, '948c099f-8054-49ae-99a1-dd5bb9410cd4', '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19',
  'DRAFT', 50, 'kg', 'normal', 'manual', 'intermediate', 'to_stock', false, false, false, 1, now(), now());
insert into public.wo_dependencies (id, org_id, parent_wo_id, child_wo_id, required_qty, created_at)
values ('a0000002-0000-4000-8000-0000000000d1', :'org',
  'a0000002-0000-4000-8000-000000000002', 'a0000002-0000-4000-8000-000000000003', 50, now());

-- ============ SC3 — C1/C2/N2 (consume held LP -> quality-hold message) ============
insert into public.work_orders (id, org_id, wo_number, product_id, active_bom_header_id, production_line_id, site_id,
  status, started_at, planned_quantity, uom, priority, source_of_demand, item_type_at_creation, disposition_policy,
  is_rework, over_production_flagged, released_to_warehouse, schema_version, created_at, updated_at)
values ('a0000003-0000-4000-8000-000000000004', :'org', 'E2E-A-HOLD-CONSUME', '0ff4bd63-7ca2-4a44-908c-de52e9fd32cc',
  'cdc8a9a7-9100-4e0f-9915-496566acdca4', '948c099f-8054-49ae-99a1-dd5bb9410cd4', '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19',
  'IN_PROGRESS', now(), 100, 'kg', 'normal', 'manual', 'fg', 'to_stock', false, false, false, 1, now(), now());
insert into public.wo_materials (id, org_id, wo_id, product_id, material_name, required_qty, consumed_qty, reserved_qty,
  uom, sequence, material_source, created_at, updated_at)
values ('a0000003-0000-4000-8000-0000000000a1', :'org', 'a0000003-0000-4000-8000-000000000004',
  '37b6315e-bc85-489d-afb9-b2f376066dee', 'Wheat Flour', 20, 0, 0, 'kg', 1, 'stock', now(), now());
-- the ONLY eligible ING-FLOUR LP for this scenario, then put it on hold
insert into public.license_plates (id, org_id, warehouse_id, lp_number, product_id, quantity, reserved_qty, uom,
  status, qa_status, origin, batch_number, created_at, updated_at)
values ('a0000003-0000-4000-8000-0000000000b1', :'org', '783bf255-efd8-48fe-9cc4-7a870859624f', 'E2E-A-HOLD-LP',
  '37b6315e-bc85-489d-afb9-b2f376066dee', 40, 0, 'kg', 'available', 'on_hold', 'grn', 'E2E-A-HOLD-BATCH', now(), now());
insert into public.quality_holds (id, org_id, reference_type, reference_id, priority, hold_status, created_by, created_at, updated_at)
values ('a0000003-0000-4000-8000-0000000000c1', :'org', 'lp', 'a0000003-0000-4000-8000-0000000000b1',
  'high', 'open', :'admin', now(), now());

-- ============ SC4 — S8 (started_at/completed_at set on start/complete) ============
insert into public.work_orders (id, org_id, wo_number, product_id, active_bom_header_id, active_factory_spec_id, production_line_id, site_id,
  status, planned_quantity, uom, priority, source_of_demand, item_type_at_creation, disposition_policy,
  is_rework, over_production_flagged, released_to_warehouse, schema_version, created_at, updated_at)
select
  'a0000004-0000-4000-8000-000000000006',
  :'org',
  'E2E-A-S8-TIMESTAMPS',
  '5aeb13b3-ffe6-4608-bdbe-bf8ce46ad0cd',
  coalesce(
    (select bh.id
       from public.bom_headers bh
      where bh.org_id = :'org'
        and bh.item_id = '5aeb13b3-ffe6-4608-bdbe-bf8ce46ad0cd'::uuid
        and bh.status = 'active'
      order by bh.version desc
      limit 1),
    '7cfbd0f0-2ec1-4c69-a637-9363de5cdd17'::uuid
  ),
  (select fs.id
     from public.factory_specs fs
    where fs.org_id = :'org'
      and fs.fg_item_id = '5aeb13b3-ffe6-4608-bdbe-bf8ce46ad0cd'::uuid
      and fs.status in ('approved_for_factory', 'released_to_factory')
    order by fs.version desc
    limit 1),
  '948c099f-8054-49ae-99a1-dd5bb9410cd4',
  '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19',
  'RELEASED',
  50,
  'kg',
  'normal',
  'manual',
  'fg',
  'to_stock',
  false,
  false,
  false,
  1,
  now(),
  now();

-- ============ SC5 — S13 (auto-PO/MRP picks active supplier, not blocked) ============
insert into public.suppliers (id, org_id, code, name, contact_jsonb, currency, lead_time_days, status, created_at, updated_at)
values
 ('a0000005-0000-4000-8000-000000000007', :'org', 'E2E-A-SUP-BLOCKED', 'E2E Blocked Supplier', '{}'::jsonb, 'GBP', 7, 'blocked', now(), now()),
 ('a0000005-0000-4000-8000-000000000008', :'org', 'E2E-A-SUP-ACTIVE',  'E2E Active Supplier',  '{}'::jsonb, 'GBP', 5, 'active',  now(), now());
insert into public.supplier_specs (id, org_id, item_id, supplier_code, supplier_status, spec_version, effective_from,
  lifecycle_status, review_status, cost_review_blocked, spec_review_blocked, declared_attrs, certificate_refs, uploaded_at, created_at, updated_at)
values ('a0000005-0000-4000-8000-0000000000e1', :'org', '12ed3a25-2549-4d33-aeaf-01dea1b8f7ca', 'E2E-A-SUP-ACTIVE',
  'approved', 1, now(), 'active', 'approved', false, false, '{}'::jsonb, '[]'::jsonb, now(), now(), now());

-- ============ SC6 — S14 (received/pending LP -> QA pass -> available) ============
insert into public.license_plates (id, org_id, warehouse_id, lp_number, product_id, quantity, reserved_qty, uom,
  status, qa_status, origin, batch_number, created_at, updated_at)
values ('a0000006-0000-4000-8000-000000000009', :'org', '783bf255-efd8-48fe-9cc4-7a870859624f', 'E2E-A-S14-QA-LP',
  '37b6315e-bc85-489d-afb9-b2f376066dee', 25, 0, 'kg', 'received', 'pending', 'grn', 'E2E-A-S14-BATCH', now(), now());

-- ============ SC7 — N1 (production summary shows 7.8, not 8) ============
insert into public.work_orders (id, org_id, wo_number, product_id, active_bom_header_id, production_line_id, site_id,
  status, started_at, planned_quantity, uom, priority, source_of_demand, item_type_at_creation, disposition_policy,
  is_rework, over_production_flagged, released_to_warehouse, schema_version, created_at, updated_at)
values ('a0000007-0000-4000-8000-00000000000a', :'org', 'E2E-A-N1-DISPLAY', '0ff4bd63-7ca2-4a44-908c-de52e9fd32cc',
  'cdc8a9a7-9100-4e0f-9915-496566acdca4', '948c099f-8054-49ae-99a1-dd5bb9410cd4', '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19',
  'IN_PROGRESS', now(), 300, 'kg', 'normal', 'manual', 'fg', 'to_stock', false, false, false, 1, now(), now());
insert into public.wo_outputs (id, org_id, wo_id, product_id, output_type, qty_kg, uom, qa_status, batch_number,
  transaction_id, ext_jsonb, schema_version, registered_at, created_at, updated_at)
values ('a0000007-0000-4000-8000-0000000000f7', :'org', 'a0000007-0000-4000-8000-00000000000a',
  '0ff4bd63-7ca2-4a44-908c-de52e9fd32cc', 'primary', 7.800, 'kg', 'PENDING', 'E2E-A-N1-OUT',
  gen_random_uuid(), '{}'::jsonb, 1, now(), now(), now());

-- ---- execution sessions so the production UI exposes Start/Complete/Pause/Consume ----
-- (the wo-detail action bar is gated on a wo_executions session, not just work_orders.status)
insert into public.wo_executions (id, org_id, wo_id, status, started_at, site_id, version, ext_jsonb, schema_version, created_at, updated_at, created_by)
values
 ('a0000001-0000-4000-8000-0000000000e1', :'org', 'a0000001-0000-4000-8000-000000000001', 'in_progress', now(), '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19', 0, '{}'::jsonb, 1, now(), now(), :'admin'),
 ('a0000003-0000-4000-8000-0000000000e1', :'org', 'a0000003-0000-4000-8000-000000000004', 'in_progress', now(), '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19', 0, '{}'::jsonb, 1, now(), now(), :'admin'),
 ('a0000007-0000-4000-8000-0000000000e1', :'org', 'a0000007-0000-4000-8000-00000000000a', 'in_progress', now(), '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19', 0, '{}'::jsonb, 1, now(), now(), :'admin');

-- ============ SC8 — S19 submit-for-trial (locked formulation costs + nutrition cache) ============
\set s19_project '21e26d40-8cf2-47d4-bfeb-9aad3fddc14c'
\set s19_version 'a7b32f4e-9980-433b-bcbf-f3da2b864fb3'

-- A DB trigger forbids mutating ingredient rows of a LOCKED version; temporarily
-- unlock for the fixture fill, re-lock right after (fixture-only, same txn).
update public.formulation_versions set state = 'draft' where id = :'s19_version'::uuid and state = 'locked';

update public.formulation_ingredients fi
   set cost_per_kg_eur = 2.5000
  from public.formulation_versions fv
  join public.formulations f on f.id = fv.formulation_id
 where fi.version_id = fv.id
   and fv.id = :'s19_version'::uuid
   and f.project_id = :'s19_project'::uuid
   and f.org_id = :'org'
   and fi.cost_per_kg_eur is null;

-- Rebalance pct to 100.000 when the locked version drifts outside the submit gate.
with locked_lines as (
  select fi.id,
         fi.qty_kg,
         sum(fi.qty_kg) over () as total_qty
    from public.formulation_ingredients fi
    join public.formulation_versions fv on fv.id = fi.version_id
    join public.formulations f on f.id = fv.formulation_id
   where fv.id = :'s19_version'::uuid
     and f.project_id = :'s19_project'::uuid
     and f.org_id = :'org'
),
pct_check as (
  select coalesce(sum(round(ll.qty_kg::numeric / nullif(ll.total_qty, 0) * 100, 3)), 0) as total_pct
    from locked_lines ll
)
update public.formulation_ingredients fi
   set pct = round(ll.qty_kg::numeric / nullif(ll.total_qty, 0) * 100, 3)
  from locked_lines ll
 cross join pct_check pc
 where fi.id = ll.id
   and (pc.total_pct < 99.99 or pc.total_pct > 100.01);

-- re-lock the version (fixture flip closed before the calc-cache guard below)
update public.formulation_versions set state = 'locked' where id = :'s19_version'::uuid and state = 'draft';

insert into public.formulation_calc_cache
  (version_id, cost_json, nutrition_json, allergen_json, computed_at)
select
  :'s19_version'::uuid,
  '{}'::jsonb,
  jsonb_build_object(
    'energy_kj', '1800',
    'fat_g', '8',
    'saturates_g', '4',
    'carbs_g', '65',
    'sugars_g', '20',
    'protein_g', '6',
    'salt_g', '0.5'
  ),
  '{}'::jsonb,
  now()
 where exists (
   select 1
     from public.formulation_versions fv
     join public.formulations f on f.id = fv.formulation_id
    where fv.id = :'s19_version'::uuid
      and f.project_id = :'s19_project'::uuid
      and f.org_id = :'org'
      and fv.state = 'locked'
 )
on conflict (version_id) do update
  set nutrition_json = excluded.nutrition_json,
      computed_at = excluded.computed_at;

commit;

-- ---- verification snapshot ----
select 'WOs' k, string_agg(wo_number||'('||status||')', ', ' order by wo_number) v
  from public.work_orders where org_id=:'org' and wo_number like 'E2E-A-%'
union all select 'held LP', lp_number||' qa='||qa_status from public.license_plates where org_id=:'org' and lp_number='E2E-A-HOLD-LP'
union all select 'S14 LP', lp_number||' '||status||'/'||qa_status from public.license_plates where org_id=:'org' and lp_number='E2E-A-S14-QA-LP'
union all select 'suppliers', string_agg(code||'('||status||')',', ') from public.suppliers where org_id=:'org' and code like 'E2E-A-%'
union all select 'S19 locked formulation',
  'null-costs='||coalesce((select count(*)::text from public.formulation_ingredients fi
     where fi.version_id = 'a7b32f4e-9980-433b-bcbf-f3da2b864fb3'::uuid and fi.cost_per_kg_eur is null),'?')
  ||' / nutrition='||case when exists (select 1 from public.formulation_calc_cache fcc
     where fcc.version_id = 'a7b32f4e-9980-433b-bcbf-f3da2b864fb3'::uuid) then 'present' else 'missing' end
  ||' / state='||coalesce((select fv.state from public.formulation_versions fv
     where fv.id = 'a7b32f4e-9980-433b-bcbf-f3da2b864fb3'::uuid),'not-found');
