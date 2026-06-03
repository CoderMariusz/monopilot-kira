-- Migration 073: 02-SETTINGS Wave 5 (Class D build-now)
-- Schema-driven reference data for /settings/processes + /settings/partners.
--
-- The reference_schemas baseline (seeds/reference-schemas.sql, T-093) is NOT
-- applied by the deploy migration runner, so the schema columns + baseline rows
-- that the settings/processes and settings/partners screens read are seeded here
-- to guarantee they reach Supabase on deploy (per the deploy-migration gotcha).
--
-- Wave0 lock: reference_tables rows are org-scoped (org_id). reference_schemas
-- universal rows use org_id IS NULL (matches the existing T-093 convention).
-- Idempotent: schema columns guarded by NOT EXISTS; reference_tables rows use
-- ON CONFLICT (org_id, table_code, row_key) DO NOTHING.

-- ============================================================
-- 1. reference_schemas universal columns (org_id IS NULL)
--    processes: extend with name + category.
--    partners:  partner_code, name, partner_type, status.
-- ============================================================
do $$
begin
  insert into public.reference_schemas (
    org_id, table_code, column_code, data_type, tier, storage,
    dropdown_source, required_for_done, validation_json, presentation_json
  )
  select v.org_id, v.table_code, v.column_code, v.data_type, v.tier, v.storage,
         v.dropdown_source, v.required_for_done, v.validation_json::jsonb, v.presentation_json::jsonb
  from (
    values
      (null::uuid, 'reference.processes', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true}',
        '{"label":"Name","editable_by":["admin","production_manager"]}'),
      (null::uuid, 'reference.processes', 'category', 'enum', 'L1', 'ext_jsonb', null::text, false,
        '{"required":false,"enum_values":["preparation","processing","packaging","quality","logistics"]}',
        '{"label":"Category","editable_by":["admin","production_manager"]}'),
      (null::uuid, 'reference.partners', 'partner_code', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true,"unique":true}',
        '{"label":"Partner code","editable_by":["admin"]}'),
      (null::uuid, 'reference.partners', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true}',
        '{"label":"Name","editable_by":["admin"]}'),
      (null::uuid, 'reference.partners', 'partner_type', 'enum', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true,"enum_values":["supplier","customer","both"]}',
        '{"label":"Type","editable_by":["admin"]}'),
      (null::uuid, 'reference.partners', 'status', 'enum', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true,"enum_values":["active","inactive"]}',
        '{"label":"Status","editable_by":["admin"]}')
  ) as v(org_id, table_code, column_code, data_type, tier, storage,
         dropdown_source, required_for_done, validation_json, presentation_json)
  where not exists (
    select 1 from public.reference_schemas existing
    where existing.org_id is null
      and existing.table_code = v.table_code
      and existing.column_code = v.column_code
  );
end $$;

-- ============================================================
-- 2. Baseline reference_tables rows for the Apex bootstrap org.
--    processes: standard food-manufacturing process steps.
--    partners:  representative supplier + customer.
-- ============================================================
do $$
declare
  v_apex_org_id uuid;
begin
  select id into v_apex_org_id
  from public.organizations
  where external_id = 'apex'
  order by created_at asc, id asc
  limit 1;

  if v_apex_org_id is null then
    raise notice 'Apex org not found — skipping settings reference baseline rows.';
    return;
  end if;

  insert into public.reference_tables
    (org_id, table_code, row_key, row_data, display_order, is_active)
  values
    (v_apex_org_id, 'processes', 'RECEIVING',
       jsonb_build_object('process_code', 'RECEIVING', 'name', 'Goods receiving', 'category', 'logistics'), 1, true),
    (v_apex_org_id, 'processes', 'MIXING',
       jsonb_build_object('process_code', 'MIXING', 'name', 'Ingredient mixing', 'category', 'preparation'), 2, true),
    (v_apex_org_id, 'processes', 'COOKING',
       jsonb_build_object('process_code', 'COOKING', 'name', 'Thermal processing / cooking', 'category', 'processing'), 3, true),
    (v_apex_org_id, 'processes', 'FILLING',
       jsonb_build_object('process_code', 'FILLING', 'name', 'Filling & dosing', 'category', 'packaging'), 4, true),
    (v_apex_org_id, 'processes', 'PACKAGING',
       jsonb_build_object('process_code', 'PACKAGING', 'name', 'Primary packaging', 'category', 'packaging'), 5, true),
    (v_apex_org_id, 'processes', 'QC_RELEASE',
       jsonb_build_object('process_code', 'QC_RELEASE', 'name', 'QC inspection & release', 'category', 'quality'), 6, true)
  on conflict (org_id, table_code, row_key) do nothing;

  insert into public.reference_tables
    (org_id, table_code, row_key, row_data, display_order, is_active)
  values
    (v_apex_org_id, 'partners', 'SUP-0001',
       jsonb_build_object('partner_code', 'SUP-0001', 'name', 'Baseline Ingredients Supplier', 'partner_type', 'supplier', 'status', 'active'), 1, true),
    (v_apex_org_id, 'partners', 'CUST-0001',
       jsonb_build_object('partner_code', 'CUST-0001', 'name', 'Baseline Retail Customer', 'partner_type', 'customer', 'status', 'active'), 2, true)
  on conflict (org_id, table_code, row_key) do nothing;
end $$;
