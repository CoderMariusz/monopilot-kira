-- Migration 370 — seed the dynamic NPD catalog (npd_departments + npd_field_catalog +
-- npd_department_field) from the live "Reference"."DeptColumns" so the FA/FG detail can render
-- dynamically (feature A3, NPD-DYN). Root cause of the empty catalog: migration 333 originally
-- backfilled these tables, but the 2026-06-25 onboarding wipe (mig 339) re-seeded only
-- public.reference_schemas and left npd_departments / npd_field_catalog / npd_department_field
-- empty for org 00000000-0000-0000-0000-000000000002 (its DeptColumns survived: 74 rows).
--
-- This re-runs migration 333's backfill logic, idempotently, scoped to that org, sourcing the
-- REAL DeptColumns data (NOT the hardcoded fallback). FK order is mandatory: departments first,
-- then field catalog, then the dept->field links. data_type mapping + the Done_/Benchmark
-- (mig 241) / Number_of_Cases (mig 367) exclusions are copied verbatim from migration 333.
-- Safe to re-run: every write uses ON CONFLICT DO UPDATE on the real unique keys.
--
-- NOTE (follow-up): brand-new orgs with empty DeptColumns are NOT seeded by this migration and
-- there is no org-insert trigger that copies the catalog — that gap is tracked separately.

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000002';
begin

  -- STEP 1: departments (must precede catalog + links — FK target)
  insert into public.npd_departments (org_id, code, name, display_order, active)
  select dc.org_id, dc.dept_code, dc.dept_code, min(coalesce(dc.display_order, 0)), true
    from "Reference"."DeptColumns" dc
   where dc.org_id = v_org
     and dc.dept_code <> 'System'
     and dc.dept_code is not null
     and btrim(dc.dept_code) <> ''
   group by dc.org_id, dc.dept_code
  on conflict (org_id, code) do update
    set name = excluded.name, display_order = excluded.display_order, active = true;

  -- STEP 2: field catalog (one row per (org, column_key); data_type mapping per mig 333)
  insert into public.npd_field_catalog (org_id, code, label, data_type, validation_json, help_text, active)
  select distinct on (dc.org_id, dc.column_key)
         dc.org_id,
         dc.column_key,
         replace(initcap(replace(dc.column_key, '_', ' ')), ' Mrp ', ' MRP ') as label,
         case
           when dc.dropdown_source is not null and btrim(dc.dropdown_source) <> '' then 'dropdown'
           when coalesce(dc.data_type, dc.field_type) = 'string'   then 'text'
           when coalesce(dc.data_type, dc.field_type) = 'enum'     then 'dropdown'
           when coalesce(dc.data_type, dc.field_type) = 'integer'  then 'integer'
           when coalesce(dc.data_type, dc.field_type) = 'datetime' then 'datetime'
           when coalesce(dc.data_type, dc.field_type) = 'boolean'  then 'boolean'
           when coalesce(dc.data_type, dc.field_type) = 'date'     then 'date'
           when coalesce(dc.data_type, dc.field_type) = 'number'   then 'number'
           when coalesce(dc.data_type, dc.field_type) = 'formula'  then 'formula'
           else 'text'
         end as data_type,
         dc.validation_dsl as validation_json,
         null as help_text,
         true as active
    from "Reference"."DeptColumns" dc
   where dc.org_id = v_org
     and dc.dept_code <> 'System'
     and dc.column_key is not null
     and btrim(dc.column_key) <> ''
     and dc.column_key not like 'Done\_%' escape '\'
     and dc.column_key <> 'Benchmark'
     and dc.column_key <> 'Number_of_Cases'
   order by dc.org_id, dc.column_key, coalesce(dc.display_order, 0)
  on conflict (org_id, code) do update
    set label = excluded.label, data_type = excluded.data_type,
        validation_json = excluded.validation_json, active = true;

  -- STEP 3: dept->field links (stage_code mapping per mig 333; inner-joins skip excluded fields)
  insert into public.npd_department_field
    (org_id, department_id, field_id, required, visible, stage_code, display_order)
  select dc.org_id, d.id, f.id, dc.required_for_done, true,
         case lower(dc.dept_code)
           when 'core'        then 'brief'
           when 'planning'    then 'recipe'
           when 'commercial'  then 'approval'
           when 'production'  then 'pilot'
           when 'technical'   then 'recipe'
           when 'mrp'         then 'packaging'
           when 'procurement' then 'packaging'
           else null
         end as stage_code,
         coalesce(dc.display_order, 0)
    from "Reference"."DeptColumns" dc
    join public.npd_departments   d on d.org_id = dc.org_id and d.code = dc.dept_code
    join public.npd_field_catalog f on f.org_id = dc.org_id and f.code = dc.column_key
   where dc.org_id = v_org
     and dc.dept_code <> 'System'
     and dc.column_key not like 'Done\_%' escape '\'
     and dc.column_key <> 'Benchmark'
     and dc.column_key <> 'Number_of_Cases'
  on conflict (org_id, department_id, field_id) do update
    set required = excluded.required, visible = excluded.visible,
        stage_code = excluded.stage_code, display_order = excluded.display_order;

end
$$;
