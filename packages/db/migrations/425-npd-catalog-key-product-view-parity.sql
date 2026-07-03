-- Migration 425 — NPD catalog keys must match public.product view columns.
--
-- Fully re-entrant: Vercel/MCP may re-run pre-applied migrations. This repair is
-- intentionally cross-org and runs in migration/superuser context without org RLS
-- filters.

do $$
declare
  r record;
begin
  for r in
    select *
      from (values
        ('resource_requirement'::text, 'Staffing'::text, 'staffing'::text),
        ('equipment_setup'::text, 'Dieset'::text, 'dieset'::text)
      ) as mapping(old_key, new_code, new_key)
  loop
    -- If both legacy and corrected catalog rows exist for an org, preserve the
    -- corrected row and move non-conflicting department links onto it.
    update public.npd_department_field df
       set field_id = survivor.id
      from public.npd_field_catalog legacy
      join public.npd_field_catalog survivor
        on survivor.org_id = legacy.org_id
       and lower(survivor.code) = r.new_key
     where df.org_id = legacy.org_id
       and df.field_id = legacy.id
       and lower(legacy.code) = r.old_key
       and not exists (
         select 1
           from public.npd_department_field existing
          where existing.org_id = df.org_id
            and existing.department_id = df.department_id
            and existing.field_id = survivor.id
       );

    delete from public.npd_department_field df
     using public.npd_field_catalog legacy
     where df.org_id = legacy.org_id
       and df.field_id = legacy.id
       and lower(legacy.code) = r.old_key
       and exists (
         select 1
           from public.npd_field_catalog survivor
          where survivor.org_id = legacy.org_id
            and lower(survivor.code) = r.new_key
       );

    update public.npd_field_catalog legacy
       set active = false
     where lower(legacy.code) = r.old_key
       and exists (
         select 1
           from public.npd_field_catalog survivor
          where survivor.org_id = legacy.org_id
            and lower(survivor.code) = r.new_key
       );

    update public.npd_field_catalog legacy
       set code = r.new_code
     where lower(legacy.code) = r.old_key
       and not exists (
         select 1
           from public.npd_field_catalog survivor
          where survivor.org_id = legacy.org_id
            and lower(survivor.code) = r.new_key
       );
  end loop;
end
$$;

update public.npd_projects
   set field_values = (field_values - 'resource_requirement')
                    || jsonb_build_object('staffing', field_values->'resource_requirement')
 where field_values ? 'resource_requirement';

update public.npd_projects
   set field_values = (field_values - 'equipment_setup')
                    || jsonb_build_object('dieset', field_values->'equipment_setup')
 where field_values ? 'equipment_setup';

do $$
declare
  r record;
begin
  for r in
    select *
      from (values
        ('Resource_Requirement'::text, 'Staffing'::text),
        ('Equipment_Setup'::text, 'Dieset'::text)
      ) as mapping(old_code, new_code)
  loop
    update "Reference"."DeptColumns" old_dc
       set column_key = r.new_code
     where lower(old_dc.column_key) = lower(r.old_code)
       and not exists (
         select 1
           from "Reference"."DeptColumns" new_dc
          where new_dc.org_id = old_dc.org_id
            and new_dc.dept_code = old_dc.dept_code
            and lower(new_dc.column_key) = lower(r.new_code)
       );

    delete from "Reference"."DeptColumns" old_dc
     where lower(old_dc.column_key) = lower(r.old_code)
       and exists (
         select 1
           from "Reference"."DeptColumns" new_dc
          where new_dc.org_id = old_dc.org_id
            and new_dc.dept_code = old_dc.dept_code
            and lower(new_dc.column_key) = lower(r.new_code)
       );
  end loop;
end
$$;

create or replace function public.seed_dept_columns_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, "Reference"
as $$
declare
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
begin
  if new.id = v_apex_org_id then
    return new;
  end if;

  if not exists (
    select 1
      from information_schema.tables
     where table_schema = 'Reference'
       and table_name = 'DeptColumns'
  ) then
    return new;
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'Reference'
       and table_name = 'DeptColumns'
       and column_name = 'blocking_rule'
  ) then
    return new;
  end if;

  insert into "Reference"."DeptColumns"
    (org_id, dept_code, column_key, field_type, is_required, validation_dsl,
     dropdown_source, blocking_rule, required_for_done, display_order, marker, schema_version)
  select
    new.id,
    dept_code,
    case lower(column_key)
      when 'resource_requirement' then 'Staffing'
      when 'equipment_setup' then 'Dieset'
      else column_key
    end,
    field_type,
    is_required,
    validation_dsl,
    dropdown_source,
    blocking_rule,
    required_for_done,
    display_order,
    marker,
    schema_version
  from "Reference"."DeptColumns"
  where org_id = v_apex_org_id
  on conflict (org_id, dept_code, column_key) do nothing;

  return new;
end;
$$;

create or replace function public.seed_npd_dynamic_catalog_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_org uuid := new.id;
begin
  insert into public.npd_departments (org_id, code, name, stage_code, display_order, active)
  select dc.org_id,
         dc.dept_code,
         dc.dept_code,
         case lower(dc.dept_code)
           when 'core'        then 'brief'
           when 'planning'    then 'recipe'
           when 'commercial'  then 'approval'
           when 'production'  then 'pilot'
           when 'technical'   then 'recipe'
           when 'mrp'         then 'packaging'
           when 'procurement' then 'packaging'
           else 'brief'
         end,
         min(coalesce(dc.display_order, 0)),
         true
    from "Reference"."DeptColumns" dc
   where dc.org_id = v_org
     and dc.dept_code <> 'System'
     and dc.dept_code is not null
     and btrim(dc.dept_code) <> ''
   group by dc.org_id, dc.dept_code
  on conflict (org_id, code) do update
    set name = excluded.name,
        stage_code = excluded.stage_code,
        display_order = excluded.display_order,
        active = true;

  insert into public.npd_field_catalog (org_id, code, label, data_type, validation_json, help_text, active)
  select distinct on (dc.org_id, mapped.code)
         dc.org_id,
         mapped.code,
         replace(initcap(replace(mapped.code, '_', ' ')), ' Mrp ', ' MRP ') as label,
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
    cross join lateral (
      select case lower(dc.column_key)
        when 'resource_requirement' then 'Staffing'
        when 'equipment_setup' then 'Dieset'
        else dc.column_key
      end as code
    ) mapped
   where dc.org_id = v_org
     and dc.dept_code <> 'System'
     and dc.column_key is not null
     and btrim(dc.column_key) <> ''
     and dc.column_key not like 'Done\_%' escape '\'
     and mapped.code <> 'Benchmark'
     and mapped.code <> 'Number_of_Cases'
   order by dc.org_id, mapped.code, coalesce(dc.display_order, 0)
  on conflict (org_id, code) do update
    set label = excluded.label,
        data_type = excluded.data_type,
        validation_json = excluded.validation_json,
        active = true;

  insert into public.npd_department_field
    (org_id, department_id, field_id, required, visible, display_order)
  select dc.org_id, d.id, f.id, dc.required_for_done, true, coalesce(dc.display_order, 0)
    from "Reference"."DeptColumns" dc
    cross join lateral (
      select case lower(dc.column_key)
        when 'resource_requirement' then 'Staffing'
        when 'equipment_setup' then 'Dieset'
        else dc.column_key
      end as code
    ) mapped
    join public.npd_departments d on d.org_id = dc.org_id and d.code = dc.dept_code
    join public.npd_field_catalog f on f.org_id = dc.org_id and f.code = mapped.code
   where dc.org_id = v_org
     and dc.dept_code <> 'System'
     and dc.column_key not like 'Done\_%' escape '\'
     and mapped.code <> 'Benchmark'
     and mapped.code <> 'Number_of_Cases'
  on conflict (org_id, department_id, field_id) do update
    set required = excluded.required,
        visible = excluded.visible,
        display_order = excluded.display_order;

  return new;
end;
$fn$;
