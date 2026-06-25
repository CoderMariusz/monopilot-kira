-- mig-339: re-seed reference_schemas after the clean-slate DB wipe (owner-blocked 2026-06-25)
-- The onboarding wipe (kept user+org+RBAC only) deleted EVERY public.reference_schemas row,
-- so every schema-driven reference create failed with "reference schema is not configured"
-- (e.g. Add process step → reference.processes). reference_schemas holds COLUMN DEFINITIONS
-- (universal, org_id IS NULL), not data — so re-seeding is safe and does NOT restore demo rows.
-- This consolidates the schema-column seeds from migrations 073/074/269/276/286 (the only five
-- that seed reference_schemas; table_codes: processes, partners, allergens/uom/currency/country).
-- Idempotent via NOT EXISTS. Applied live to khjvkhzwfzuwzrusgobp on 2026-06-25 + verified.
-- DO NOT EDIT after apply (checksum gate).

insert into public.reference_schemas (
  org_id, table_code, column_code, data_type, tier, storage,
  dropdown_source, required_for_done, validation_json, presentation_json
)
select v.org_id, v.table_code, v.column_code, v.data_type, v.tier, v.storage,
       v.dropdown_source, v.required_for_done, v.validation_json::jsonb, v.presentation_json::jsonb
from (
  values
    -- ── reference.processes (073 name/category, 074 process_code, 269 costing, 276 staffing) ──
    (null::uuid, 'reference.processes', 'process_code', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true,"unique":true}', '{"label":"Process code","editable_by":["admin"]}'),
    (null::uuid, 'reference.processes', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true}', '{"label":"Name","editable_by":["admin","production_manager"]}'),
    (null::uuid, 'reference.processes', 'category', 'enum', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false,"enum_values":["preparation","processing","packaging","quality","logistics"]}',
      '{"label":"Category","editable_by":["admin","production_manager"]}'),
    (null::uuid, 'reference.processes', 'cost_mode', 'enum', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true,"enum_values":["per_hour","per_run"]}',
      '{"label":"Cost mode","editable_by":["admin","production_manager"]}'),
    (null::uuid, 'reference.processes', 'cost_rate', 'number', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false,"min":0,"scale":2}', '{"label":"Rate","editable_by":["admin","production_manager"]}'),
    (null::uuid, 'reference.processes', 'currency', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true,"pattern":"^[A-Z]{3}$","default":"EUR"}',
      '{"label":"Currency","editable_by":["admin","production_manager"]}'),
    (null::uuid, 'reference.processes', 'machine_id', 'text', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false}', '{"label":"Machine (code/id)","editable_by":["admin","production_manager"]}'),
    (null::uuid, 'reference.processes', 'staffing_count', 'number', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false,"min":0,"scale":0}', '{"label":"Staffing","editable_by":["admin","production_manager"]}'),
    (null::uuid, 'reference.processes', 'setup_cost', 'number', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false,"min":0,"scale":2}', '{"label":"Setup cost","editable_by":["admin","production_manager"]}'),

    -- ── reference.partners (073) ──
    (null::uuid, 'reference.partners', 'partner_code', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true,"unique":true}', '{"label":"Partner code","editable_by":["admin"]}'),
    (null::uuid, 'reference.partners', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true}', '{"label":"Name","editable_by":["admin"]}'),
    (null::uuid, 'reference.partners', 'partner_type', 'enum', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true,"enum_values":["supplier","customer","both"]}', '{"label":"Type","editable_by":["admin"]}'),
    (null::uuid, 'reference.partners', 'status', 'enum', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true,"enum_values":["active","inactive"]}', '{"label":"Status","editable_by":["admin"]}'),

    -- ── reference.allergens_reference (286) ──
    (null::uuid, 'reference.allergens_reference', 'allergen_code', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true,"pattern":"^[A-Z0-9_\\-]{2,32}$"}', '{"label":"Allergen code","editable_by":["admin"]}'),
    (null::uuid, 'reference.allergens_reference', 'display_name', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true}', '{"label":"Display name","editable_by":["admin"]}'),
    (null::uuid, 'reference.allergens_reference', 'eu_disclosure_text', 'text', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false}', '{"label":"EU disclosure text","editable_by":["admin"]}'),
    (null::uuid, 'reference.allergens_reference', 'risk_level', 'enum', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false,"enum_values":["major","moderate","low"]}', '{"label":"Risk level","editable_by":["admin"]}'),
    (null::uuid, 'reference.allergens_reference', 'is_enabled', 'text', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false}', '{"label":"Enabled","editable_by":["admin"]}'),

    -- ── reference.uom_reference (286) ──
    (null::uuid, 'reference.uom_reference', 'code', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true,"pattern":"^[A-Za-z0-9_\\-]{1,16}$"}', '{"label":"Code","editable_by":["admin"]}'),
    (null::uuid, 'reference.uom_reference', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true}', '{"label":"Name","editable_by":["admin"]}'),
    (null::uuid, 'reference.uom_reference', 'is_active', 'text', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false}', '{"label":"Active","editable_by":["admin"]}'),

    -- ── reference.currency_reference (286) ──
    (null::uuid, 'reference.currency_reference', 'code', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true,"pattern":"^[A-Z]{3}$"}', '{"label":"Code","editable_by":["admin"]}'),
    (null::uuid, 'reference.currency_reference', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true}', '{"label":"Name","editable_by":["admin"]}'),
    (null::uuid, 'reference.currency_reference', 'is_active', 'text', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false}', '{"label":"Active","editable_by":["admin"]}'),

    -- ── reference.country_iso_reference (286) ──
    (null::uuid, 'reference.country_iso_reference', 'code', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true,"pattern":"^[A-Z]{2,3}$"}', '{"label":"Code","editable_by":["admin"]}'),
    (null::uuid, 'reference.country_iso_reference', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
      '{"required":true}', '{"label":"Name","editable_by":["admin"]}'),
    (null::uuid, 'reference.country_iso_reference', 'is_active', 'text', 'L1', 'ext_jsonb', null::text, false,
      '{"required":false}', '{"label":"Active","editable_by":["admin"]}')
) as v(org_id, table_code, column_code, data_type, tier, storage,
       dropdown_source, required_for_done, validation_json, presentation_json)
where not exists (
  select 1 from public.reference_schemas existing
  where existing.org_id is null
    and existing.table_code = v.table_code
    and existing.column_code = v.column_code
);
