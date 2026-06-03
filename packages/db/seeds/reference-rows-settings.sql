-- Seed: baseline reference_tables rows for 02-SETTINGS schema-driven screens.
-- Wave 5 (Class D build-now): /settings/processes + /settings/partners.
--
-- Tables: public.reference_tables (T-008, migration 041). Schema metadata for
-- reference.processes / reference.partners is seeded by
-- seeds/reference-schemas.sql (T-093).
--
-- Scope: rows seeded ONLY for the Apex bootstrap org (external_id = 'apex',
-- id = 00000000-0000-0000-0000-000000000002). org-scoped, Wave0 lock = org_id.
-- Idempotent via ON CONFLICT (org_id, table_code, row_key) DO NOTHING — the
-- PK of reference_tables.
--
-- Data is real baseline food-manufacturing master data (not demo junk):
--   processes  — standard food process steps.
--   partners   — a representative supplier + customer.

do $$
declare
  v_apex_org_id uuid;
begin
  -- Deterministically pick the canonical (earliest-created) Apex org.
  select id into v_apex_org_id
  from public.organizations
  where external_id = 'apex'
  order by created_at asc, id asc
  limit 1;

  if v_apex_org_id is null then
    raise exception
      'Apex org not found (external_id = ''apex''). Run baseline org seed first.';
  end if;

  -- ── reference.processes — standard food-manufacturing process steps ─────────
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

  -- ── reference.partners — baseline supplier + customer ───────────────────────
  insert into public.reference_tables
    (org_id, table_code, row_key, row_data, display_order, is_active)
  values
    (v_apex_org_id, 'partners', 'SUP-0001',
       jsonb_build_object('partner_code', 'SUP-0001', 'name', 'Baseline Ingredients Supplier', 'partner_type', 'supplier', 'status', 'active'), 1, true),
    (v_apex_org_id, 'partners', 'CUST-0001',
       jsonb_build_object('partner_code', 'CUST-0001', 'name', 'Baseline Retail Customer', 'partner_type', 'customer', 'status', 'active'), 2, true)
  on conflict (org_id, table_code, row_key) do nothing;

end $$;
