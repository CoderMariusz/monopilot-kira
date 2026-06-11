-- Migration 286: universal reference_schemas for /settings/reference (W9-L5 FIX 1)
--
-- Root cause (2026-06-11 live clickthrough §1): the four universal reference
-- tables on /settings/reference (allergens_reference, uom_reference,
-- currency_reference, country_iso_reference) had NO reference_schemas rows —
-- only processes/partners were seeded (migrations 073/074). The upsert Server
-- Action (apps/web/actions/reference/upsert.ts) hard-fails with
-- `invalid_input` ("reference schema is not configured") when zero schema
-- columns resolve, so EVERY save on those tables (incl. the EU-14 allergen
-- list) was rejected and the tables were unfillable.
--
-- This migration seeds the SCHEMA columns only — no data rows. Universal L1
-- rows use org_id IS NULL (T-093 convention, same as migration 073); the
-- schema table_code uses the `reference.<code>` namespace which the upsert
-- action resolves from the bare code the UI passes.
--
-- NOTE data_type: reference_schemas has CHECK (data_type in
-- ('text','number','date','enum','formula','relation')) — no 'boolean'.
-- Boolean-ish flags (is_enabled/is_active) are seeded as 'text'; the upsert
-- validator accepts boolean values for text columns and the reference UI
-- renders `is_*` column codes as switches.
--
-- Wave0 lock: org_id (NULL = universal), RLS untouched. Idempotent via
-- NOT EXISTS guards.

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
      -- ── allergens_reference (EU-14 + org custom; see migration 161 note) ──
      (null::uuid, 'reference.allergens_reference', 'allergen_code', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true,"pattern":"^[A-Z0-9_\\-]{2,32}$"}',
        '{"label":"Allergen code","editable_by":["admin"]}'),
      (null::uuid, 'reference.allergens_reference', 'display_name', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true}',
        '{"label":"Display name","editable_by":["admin"]}'),
      (null::uuid, 'reference.allergens_reference', 'eu_disclosure_text', 'text', 'L1', 'ext_jsonb', null::text, false,
        '{"required":false}',
        '{"label":"EU disclosure text","editable_by":["admin"]}'),
      (null::uuid, 'reference.allergens_reference', 'risk_level', 'enum', 'L1', 'ext_jsonb', null::text, false,
        '{"required":false,"enum_values":["major","moderate","low"]}',
        '{"label":"Risk level","editable_by":["admin"]}'),
      (null::uuid, 'reference.allergens_reference', 'is_enabled', 'text', 'L1', 'ext_jsonb', null::text, false,
        '{"required":false}',
        '{"label":"Enabled","editable_by":["admin"]}'),

      -- ── uom_reference ──────────────────────────────────────────────────────
      (null::uuid, 'reference.uom_reference', 'code', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true,"pattern":"^[A-Za-z0-9_\\-]{1,16}$"}',
        '{"label":"Code","editable_by":["admin"]}'),
      (null::uuid, 'reference.uom_reference', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true}',
        '{"label":"Name","editable_by":["admin"]}'),
      (null::uuid, 'reference.uom_reference', 'is_active', 'text', 'L1', 'ext_jsonb', null::text, false,
        '{"required":false}',
        '{"label":"Active","editable_by":["admin"]}'),

      -- ── currency_reference ─────────────────────────────────────────────────
      (null::uuid, 'reference.currency_reference', 'code', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true,"pattern":"^[A-Z]{3}$"}',
        '{"label":"Code","editable_by":["admin"]}'),
      (null::uuid, 'reference.currency_reference', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true}',
        '{"label":"Name","editable_by":["admin"]}'),
      (null::uuid, 'reference.currency_reference', 'is_active', 'text', 'L1', 'ext_jsonb', null::text, false,
        '{"required":false}',
        '{"label":"Active","editable_by":["admin"]}'),

      -- ── country_iso_reference ──────────────────────────────────────────────
      (null::uuid, 'reference.country_iso_reference', 'code', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true,"pattern":"^[A-Z]{2,3}$"}',
        '{"label":"Code","editable_by":["admin"]}'),
      (null::uuid, 'reference.country_iso_reference', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
        '{"required":true}',
        '{"label":"Name","editable_by":["admin"]}'),
      (null::uuid, 'reference.country_iso_reference', 'is_active', 'text', 'L1', 'ext_jsonb', null::text, false,
        '{"required":false}',
        '{"label":"Active","editable_by":["admin"]}')
  ) as v(org_id, table_code, column_code, data_type, tier, storage,
         dropdown_source, required_for_done, validation_json, presentation_json)
  where not exists (
    select 1 from public.reference_schemas existing
    where existing.org_id is null
      and existing.table_code = v.table_code
      and existing.column_code = v.column_code
  );
end $$;
