-- Migration 421 — NPD department-owned stage assignment + hard delete cascades.
--
-- D2/D4: stage_code moves from field assignment to department. Deleting a
-- department or field must remove its catalog rows, stored dynamic FG values,
-- and legacy checklist dependencies in the current org context.

alter table public.npd_departments
  add column if not exists stage_code text not null default 'brief';

alter table public.npd_departments
  alter column stage_code set default 'brief';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'npd_departments_stage_code_check'
       and conrelid = 'public.npd_departments'::regclass
  ) then
    alter table public.npd_departments
      add constraint npd_departments_stage_code_check
      check (stage_code in (
        'brief', 'recipe', 'packaging', 'costing_nutrition', 'trial',
        'sensory', 'pilot', 'approval', 'handoff'
      ));
  end if;
end
$$;

-- Backfill dept.stage_code from the legacy assignment-level column. Guarded +
-- dynamic: on a RE-RUN the source column is already dropped (below), so the
-- statement must not even be parsed then.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'npd_department_field'
       and column_name = 'stage_code'
  ) then
    execute $sql$
      with ranked_stage as (
        select department_id,
               stage_code,
               row_number() over (
                 partition by department_id
                 order by count(*) desc, stage_code
               ) as rn
          from public.npd_department_field
         where stage_code is not null
           and stage_code in (
             'brief', 'recipe', 'packaging', 'costing_nutrition', 'trial',
             'sensory', 'pilot', 'approval', 'handoff'
           )
         group by department_id, stage_code
      )
      update public.npd_departments d
         set stage_code = ranked_stage.stage_code
        from ranked_stage
       where ranked_stage.department_id = d.id
         and ranked_stage.rn = 1
    $sql$;
  end if;
end
$$;

update public.npd_departments
   set stage_code = 'brief'
 where stage_code is null
    or stage_code not in (
      'brief', 'recipe', 'packaging', 'costing_nutrition', 'trial',
      'sensory', 'pilot', 'approval', 'handoff'
    );

alter table public.npd_departments
  alter column stage_code set not null;

drop index if exists public.npd_department_field_org_stage_idx;

alter table public.npd_department_field
  drop constraint if exists npd_department_field_stage_code_check,
  drop column if exists stage_code;

create index if not exists npd_departments_org_stage_order_idx
  on public.npd_departments (org_id, stage_code, active, display_order, code);

create or replace function public.npd_delete_field(p_field_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_org_id uuid := app.current_org_id();
  v_field_code text;
  v_column_name text;
begin
  if v_org_id is null then
    raise exception 'npd_delete_field requires app.current_org_id()';
  end if;

  select code
    into v_field_code
    from public.npd_field_catalog
   where id = p_field_id
     and org_id = v_org_id;

  if v_field_code is null then
    return;
  end if;

  v_column_name := lower(regexp_replace(regexp_replace(v_field_code, '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[^a-zA-Z0-9]+', '_', 'g'));
  v_column_name := btrim(v_column_name, '_');

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'fg_npd_ext'
       and column_name = v_column_name
       and is_nullable = 'YES'
  ) then
    execute format('update public.fg_npd_ext set %I = null, updated_at = now() where org_id = $1', v_column_name)
      using v_org_id;
  end if;

  delete from public.npd_department_field
   where field_id = p_field_id
     and org_id = v_org_id;

  delete from public.npd_field_catalog
   where id = p_field_id
     and org_id = v_org_id;
end;
$fn$;

create or replace function public.npd_delete_department(p_department_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_org_id uuid := app.current_org_id();
  v_dept_code text;
  v_dept_slug text;
  v_field record;
  v_column_name text;
begin
  if v_org_id is null then
    raise exception 'npd_delete_department requires app.current_org_id()';
  end if;

  select code
    into v_dept_code
    from public.npd_departments
   where id = p_department_id
     and org_id = v_org_id;

  if v_dept_code is null then
    return;
  end if;

  for v_field in
    select f.code
      from public.npd_department_field df
      join public.npd_field_catalog f
        on f.id = df.field_id
       and f.org_id = df.org_id
     where df.department_id = p_department_id
       and df.org_id = v_org_id
  loop
    v_column_name := lower(regexp_replace(regexp_replace(v_field.code, '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[^a-zA-Z0-9]+', '_', 'g'));
    v_column_name := btrim(v_column_name, '_');

    if exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'fg_npd_ext'
         and column_name = v_column_name
         and is_nullable = 'YES'
    ) then
      execute format('update public.fg_npd_ext set %I = null, updated_at = now() where org_id = $1', v_column_name)
        using v_org_id;
    end if;
  end loop;

  v_dept_slug := lower(regexp_replace(regexp_replace(v_dept_code, '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[^a-zA-Z0-9]+', '_', 'g'));
  v_dept_slug := btrim(v_dept_slug, '_');

  for v_column_name in
    select unnest(array['closed_' || v_dept_slug, 'done_' || v_dept_slug])
  loop
    if exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'fg_npd_ext'
         and column_name = v_column_name
         and is_nullable = 'YES'
    ) then
      execute format('update public.fg_npd_ext set %I = null, updated_at = now() where org_id = $1', v_column_name)
        using v_org_id;
    end if;
  end loop;

  update public.npd_projects
     set department_id = null
   where department_id = p_department_id
     and org_id = v_org_id;

  delete from public.gate_checklist_items
   where org_id = v_org_id
     and (
       item_text ilike ('Done_' || v_dept_code || ':%')
       or item_text ilike ('Done ' || v_dept_code || ':%')
       or item_text ilike ('%' || v_dept_code || ' department NPD data closed%')
     );

  delete from "Reference"."GateChecklistTemplates"
   where org_id = v_org_id
     and (
       item_text ilike ('Done_' || v_dept_code || ':%')
       or item_text ilike ('Done ' || v_dept_code || ':%')
       or item_text ilike ('%' || v_dept_code || ' department NPD data closed%')
     );

  delete from public.npd_department_field
   where department_id = p_department_id
     and org_id = v_org_id;

  delete from public.npd_departments
   where id = p_department_id
     and org_id = v_org_id;
end;
$fn$;

grant execute on function public.npd_delete_department(uuid) to app_user;
grant execute on function public.npd_delete_field(uuid) to app_user;

grant delete on public.npd_departments to app_user;
grant delete on public.npd_department_field to app_user;
grant delete on public.npd_field_catalog to app_user;
grant update on public.fg_npd_ext to app_user;
grant update on public.npd_projects to app_user;
grant delete on public.gate_checklist_items to app_user;
grant delete on "Reference"."GateChecklistTemplates" to app_user;

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
    set label = excluded.label,
        data_type = excluded.data_type,
        validation_json = excluded.validation_json,
        active = true;

  insert into public.npd_department_field
    (org_id, department_id, field_id, required, visible, display_order)
  select dc.org_id, d.id, f.id, dc.required_for_done, true, coalesce(dc.display_order, 0)
    from "Reference"."DeptColumns" dc
    join public.npd_departments   d on d.org_id = dc.org_id and d.code = dc.dept_code
    join public.npd_field_catalog f on f.org_id = dc.org_id and f.code = dc.column_key
   where dc.org_id = v_org
     and dc.dept_code <> 'System'
     and dc.column_key not like 'Done\_%' escape '\'
     and dc.column_key <> 'Benchmark'
     and dc.column_key <> 'Number_of_Cases'
  on conflict (org_id, department_id, field_id) do update
    set required = excluded.required,
        visible = excluded.visible,
        display_order = excluded.display_order;

  return new;
end;
$fn$;
