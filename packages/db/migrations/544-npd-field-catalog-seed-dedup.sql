-- Migration 544: keep the corrected migration-543 semantic normalization and
-- stop the new-organization NPD seed from emitting Runs_Per_Week alongside the
-- canonical runs_per_week brief/costing field.
--
-- The application reads public.npd_projects.runs_per_week and uses the
-- runs_per_week catalog key. Existing legacy rows are merged only after every
-- known FK reference has been repointed.

-- Fail closed if a later schema added a catalog FK this migration does not know
-- how to repoint.
do $$
declare
  v_unhandled_fks text;
begin
  select string_agg(
           format('%s on %s', c.conname, c.conrelid::regclass),
           ', '
           order by c.conrelid::regclass::text, c.conname
         )
    into v_unhandled_fks
    from pg_constraint c
   where c.contype = 'f'
     and c.confrelid = 'public.npd_field_catalog'::regclass
     and c.conrelid <> 'public.npd_department_field'::regclass;

  if v_unhandled_fks is not null then
    raise exception
      'migration 544 cannot merge NPD catalog rows; unhandled foreign keys: %',
      v_unhandled_fks;
  end if;
end
$$;

-- Merge the product-decided legacy pair. The canonical row wins; its metadata
-- is preserved. If only the legacy row exists, rename it in place so its id and
-- every FK remain stable.
do $$
declare
  r record;
  v_links_repointed integer := 0;
  v_duplicate_links_removed integer := 0;
  v_auto_sources_repointed integer := 0;
  v_catalog_rows_removed integer := 0;
  v_catalog_rows_renamed integer := 0;
  v_project_keys_moved integer := 0;
  v_count integer;
begin
  for r in
    select legacy.org_id,
           legacy.id as legacy_id,
           legacy.active as legacy_active,
           survivor.id as survivor_id
      from public.npd_field_catalog legacy
      join public.npd_field_catalog survivor
        on survivor.org_id = legacy.org_id
       and survivor.code = 'runs_per_week'
     where legacy.code = 'Runs_Per_Week'
     order by legacy.org_id, legacy.id
  loop
    -- Preserve active state without ever having two active semantic variants in
    -- the same statement under the migration-543 index.
    if r.legacy_active then
      update public.npd_field_catalog
         set active = false
       where id = r.legacy_id;

      update public.npd_field_catalog
         set active = true
       where id = r.survivor_id;
    end if;

    update public.npd_department_field df
       set field_id = r.survivor_id
     where df.org_id = r.org_id
       and df.field_id = r.legacy_id
       and not exists (
         select 1
           from public.npd_department_field existing
          where existing.org_id = df.org_id
            and existing.department_id = df.department_id
            and existing.field_id = r.survivor_id
       );
    get diagnostics v_count = row_count;
    v_links_repointed := v_links_repointed + v_count;

    delete from public.npd_department_field
     where org_id = r.org_id
       and field_id = r.legacy_id;
    get diagnostics v_count = row_count;
    v_duplicate_links_removed := v_duplicate_links_removed + v_count;

    update public.npd_field_catalog
       set auto_source_field = 'runs_per_week'
     where org_id = r.org_id
       and auto_source_field = 'Runs_Per_Week';
    get diagnostics v_count = row_count;
    v_auto_sources_repointed := v_auto_sources_repointed + v_count;

    if exists (
      select 1
        from public.npd_department_field
       where org_id = r.org_id
         and field_id = r.legacy_id
    ) then
      raise exception
        'migration 544 refused to delete referenced npd_field_catalog row %',
        r.legacy_id;
    end if;

    delete from public.npd_field_catalog
     where id = r.legacy_id;
    get diagnostics v_count = row_count;
    v_catalog_rows_removed := v_catalog_rows_removed + v_count;
  end loop;

  update public.npd_field_catalog legacy
     set code = 'runs_per_week'
   where legacy.code = 'Runs_Per_Week'
     and not exists (
       select 1
         from public.npd_field_catalog survivor
        where survivor.org_id = legacy.org_id
          and survivor.code = 'runs_per_week'
     );
  get diagnostics v_catalog_rows_renamed = row_count;

  update public.npd_field_catalog
     set auto_source_field = 'runs_per_week'
   where auto_source_field = 'Runs_Per_Week';
  get diagnostics v_count = row_count;
  v_auto_sources_repointed := v_auto_sources_repointed + v_count;

  -- field_values predates the typed brief columns. Preserve an existing
  -- canonical value if both JSON keys somehow exist.
  update public.npd_projects
     set field_values =
           (field_values - 'Runs_Per_Week')
           || case
                when field_values ? 'runs_per_week' then '{}'::jsonb
                else jsonb_build_object(
                  'runs_per_week',
                  field_values -> 'Runs_Per_Week'
                )
              end
   where field_values ? 'Runs_Per_Week';
  get diagnostics v_project_keys_moved = row_count;

  if exists (
    select 1
      from (
        select regexp_replace(lower(trim(code)), '[^a-z0-9]+', '', 'g')
                 as normalized_code
          from public.npd_field_catalog
         group by org_id,
                  regexp_replace(lower(trim(code)), '[^a-z0-9]+', '', 'g')
        having count(*) > 1
      ) collisions
     where collisions.normalized_code = 'runsperweek'
  ) then
    raise exception
      'migration 544 left a runs_per_week semantic duplicate in npd_field_catalog';
  end if;

  raise notice
    'migration 544 catalog merge: links_repointed=%, duplicate_links_removed=%, auto_sources_repointed=%, catalog_rows_removed=%, catalog_rows_renamed=%, project_keys_moved=%',
    v_links_repointed,
    v_duplicate_links_removed,
    v_auto_sources_repointed,
    v_catalog_rows_removed,
    v_catalog_rows_renamed,
    v_project_keys_moved;
end
$$;

-- The latest definition comes from migration 427. Map the legacy DeptColumns
-- key to the application-owned snake_case key at the catalog boundary. This is
-- applied in both the catalog insert and department-field link query.
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

  insert into public.npd_field_catalog
    (org_id, code, label, data_type, validation_json, help_text, active)
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
        when 'runs_per_week' then 'runs_per_week'
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
  select dc.org_id,
         d.id,
         f.id,
         dc.required_for_done,
         true,
         coalesce(dc.display_order, 0)
    from "Reference"."DeptColumns" dc
    cross join lateral (
      select case lower(dc.column_key)
        when 'resource_requirement' then 'Staffing'
        when 'equipment_setup' then 'Dieset'
        when 'runs_per_week' then 'runs_per_week'
        else dc.column_key
      end as code
    ) mapped
    join public.npd_departments d
      on d.org_id = dc.org_id
     and d.code = dc.dept_code
    join public.npd_field_catalog f
      on f.org_id = dc.org_id
     and f.code = mapped.code
   where dc.org_id = v_org
     and dc.dept_code <> 'System'
     and dc.column_key not like 'Done\_%' escape '\'
     and mapped.code <> 'Benchmark'
     and mapped.code <> 'Number_of_Cases'
  on conflict (org_id, department_id, field_id) do update
    set required = excluded.required,
        visible = excluded.visible,
        display_order = excluded.display_order;

  perform public.seed_npd_brief_unit_fields(v_org);

  return new;
end;
$fn$;

-- Behavioral post-check. The organization INSERT and its complete trigger
-- cascade execute inside a PL/pgSQL subtransaction, then an expected marker
-- exception rolls every seeded row back. The tenant fixture is deleted after
-- rollback.
do $$
declare
  v_tenant_id uuid := gen_random_uuid();
  v_org_id uuid := gen_random_uuid();
  v_marker text := 'MIG544_EXPECTED_ORG_ROLLBACK';
  v_catalog_rows integer := 0;
  v_code_collision_groups integer := 0;
  v_label_collision_groups integer := 0;
  v_count integer;
begin
  insert into public.tenants (id, name, data_plane_url)
  values (
    v_tenant_id,
    'Migration 544 post-check ' || v_tenant_id::text,
    'https://local.invalid'
  );

  begin
    insert into public.organizations (id, tenant_id, name, industry_code)
    values (
      v_org_id,
      v_tenant_id,
      'Migration 544 post-check',
      'bakery'
    );

    if not exists (
      select 1
        from public.organizations
       where id = v_org_id
    ) then
      raise exception 'migration 544 post-check did not create organization %', v_org_id;
    end if;

    select count(*)
      into v_catalog_rows
      from public.npd_field_catalog
     where org_id = v_org_id;

    if v_catalog_rows = 0 then
      raise exception
        'migration 544 post-check organization % created no NPD catalog rows',
        v_org_id;
    end if;

    select count(*)
      into v_code_collision_groups
      from (
        select regexp_replace(lower(trim(code)), '[^a-z0-9]+', '', 'g')
          from public.npd_field_catalog
         where org_id = v_org_id
         group by regexp_replace(lower(trim(code)), '[^a-z0-9]+', '', 'g')
        having count(*) > 1
      ) collisions;

    select count(*)
      into v_label_collision_groups
      from (
        select regexp_replace(lower(trim(label)), '[^a-z0-9]+', '', 'g')
          from public.npd_field_catalog
         where org_id = v_org_id
         group by regexp_replace(lower(trim(label)), '[^a-z0-9]+', '', 'g')
        having count(*) > 1
      ) collisions;

    if v_code_collision_groups <> 0 or v_label_collision_groups <> 0 then
      raise exception
        'migration 544 post-check found semantic collisions for organization %: code_groups=%, label_groups=%',
        v_org_id,
        v_code_collision_groups,
        v_label_collision_groups;
    end if;

    raise exception using
      errcode = 'P0001',
      message = v_marker;
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> v_marker then
        raise;
      end if;
  end;

  if exists (
    select 1
      from public.organizations
     where id = v_org_id
  ) or exists (
    select 1
      from public.npd_field_catalog
     where org_id = v_org_id
  ) then
    raise exception
      'migration 544 post-check failed to roll back organization % and its catalog',
      v_org_id;
  end if;

  delete from public.tenants
   where id = v_tenant_id;
  get diagnostics v_count = row_count;

  if v_count <> 1 then
    raise exception
      'migration 544 post-check deleted % tenant rows instead of 1',
      v_count;
  end if;

  raise notice
    'migration 544 post-check passed: organization % created with % catalog rows, code_collision_groups=%, label_collision_groups=%; organization cascade rolled back and tenant fixture deleted',
    v_org_id,
    v_catalog_rows,
    v_code_collision_groups,
    v_label_collision_groups;
end
$$;
