-- Migration 386 — close the NEW-ORG NPD-catalog seeding gap (tracked in mig 370 line 14-15).
--
-- PROBLEM: mig 095 installs trg_seed_dept_columns (AFTER INSERT ON public.organizations) which
-- copies the Apex template's "Reference"."DeptColumns" into every brand-new org. But NOTHING then
-- builds the DYNAMIC catalog (public.npd_departments + npd_field_catalog + npd_department_field)
-- that the NPD FA/FG forms + dept-close gate actually read (mig 370 backfilled it ONCE for the
-- Apex org only). So a brand-new org gets DeptColumns but an EMPTY dynamic catalog ->
-- Settings>NPD Fields is blank, every dept tab renders zero fields, and is_all_required_filled
-- returns true for every dept (no required-field enforcement). CONFIRMED HIGH gap.
--
-- FIX: a second AFTER INSERT trigger that re-runs mig 370's proven 3-step backfill scoped to the
-- new org, sourcing the DeptColumns that trg_seed_dept_columns just populated in the same txn.
-- Trigger-fire order is alphabetical by name within the same event: 'trg_seed_dept_columns' sorts
-- BEFORE 'trg_seed_npd_dynamic_catalog' ('d' < 'n'), so DeptColumns is fully seeded before we read
-- it. The 3 steps + data_type mapping + Done_/Benchmark/Number_of_Cases exclusions are copied
-- VERBATIM from mig 370 (only v_org := NEW.id changes). All writes are ON CONFLICT DO UPDATE so a
-- re-fire / re-run is idempotent. FK order (departments -> catalog -> links) is mandatory.

create or replace function public.seed_npd_dynamic_catalog_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_org uuid := new.id;
begin
  -- STEP 1: departments (FK target — must precede catalog + links)
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

  -- STEP 2: field catalog (one row per (org, column_key); data_type mapping per mig 370/333)
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

  -- STEP 3: dept->field links (stage_code mapping per mig 370/333; inner-joins skip excluded fields)
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

  return new;
end;
$fn$;

drop trigger if exists trg_seed_npd_dynamic_catalog on public.organizations;
create trigger trg_seed_npd_dynamic_catalog
  after insert on public.organizations
  for each row
  execute function public.seed_npd_dynamic_catalog_on_org_insert();

-- Defensive backfill: any EXISTING org that already has DeptColumns but an empty dynamic catalog
-- (e.g. created between mig 370 and now) gets seeded once here. Idempotent (ON CONFLICT DO UPDATE).
-- The Apex org -002 is already seeded by mig 370; this is a no-op for it.
do $bf$
declare
  v_org record;
begin
  for v_org in
    select o.id
      from public.organizations o
     where exists (select 1 from "Reference"."DeptColumns" dc where dc.org_id = o.id)
       and not exists (select 1 from public.npd_departments d where d.org_id = o.id)
  loop
    -- reuse the same 3-step seed by temporarily standing in for a NEW row
    perform 1;
    insert into public.npd_departments (org_id, code, name, display_order, active)
    select dc.org_id, dc.dept_code, dc.dept_code, min(coalesce(dc.display_order, 0)), true
      from "Reference"."DeptColumns" dc
     where dc.org_id = v_org.id and dc.dept_code <> 'System'
       and dc.dept_code is not null and btrim(dc.dept_code) <> ''
     group by dc.org_id, dc.dept_code
    on conflict (org_id, code) do update
      set name = excluded.name, display_order = excluded.display_order, active = true;

    insert into public.npd_field_catalog (org_id, code, label, data_type, validation_json, help_text, active)
    select distinct on (dc.org_id, dc.column_key)
           dc.org_id, dc.column_key,
           replace(initcap(replace(dc.column_key, '_', ' ')), ' Mrp ', ' MRP '),
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
           end,
           dc.validation_dsl, null, true
      from "Reference"."DeptColumns" dc
     where dc.org_id = v_org.id and dc.dept_code <> 'System'
       and dc.column_key is not null and btrim(dc.column_key) <> ''
       and dc.column_key not like 'Done\_%' escape '\'
       and dc.column_key <> 'Benchmark' and dc.column_key <> 'Number_of_Cases'
     order by dc.org_id, dc.column_key, coalesce(dc.display_order, 0)
    on conflict (org_id, code) do update
      set label = excluded.label, data_type = excluded.data_type,
          validation_json = excluded.validation_json, active = true;

    insert into public.npd_department_field
      (org_id, department_id, field_id, required, visible, stage_code, display_order)
    select dc.org_id, d.id, f.id, dc.required_for_done, true,
           case lower(dc.dept_code)
             when 'core' then 'brief' when 'planning' then 'recipe'
             when 'commercial' then 'approval' when 'production' then 'pilot'
             when 'technical' then 'recipe' when 'mrp' then 'packaging'
             when 'procurement' then 'packaging' else null end,
           coalesce(dc.display_order, 0)
      from "Reference"."DeptColumns" dc
      join public.npd_departments   d on d.org_id = dc.org_id and d.code = dc.dept_code
      join public.npd_field_catalog f on f.org_id = dc.org_id and f.code = dc.column_key
     where dc.org_id = v_org.id and dc.dept_code <> 'System'
       and dc.column_key not like 'Done\_%' escape '\'
       and dc.column_key <> 'Benchmark' and dc.column_key <> 'Number_of_Cases'
    on conflict (org_id, department_id, field_id) do update
      set required = excluded.required, visible = excluded.visible,
          stage_code = excluded.stage_code, display_order = excluded.display_order;
  end loop;
end
$bf$;
