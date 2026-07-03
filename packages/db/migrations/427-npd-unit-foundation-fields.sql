-- Migration 427 — NPD unit foundations (W1-L4): brief volume/runs + packaging waste_pct.
--
-- Owner rulings (2026-07-03):
--   D25/D30 — costing needs numeric weekly_volume_packs + runs_per_week on npd_projects;
--             expected_volume (free text) stays untouched for legacy commentary.
--   D19/D20 — packaging component quantities are declared per FULL BOX (UI copy only here).
--   D41     — waste_pct is the costing loss factor per packaging component; scrap_pct
--             (mig 393) remains the WO-consumption inflation concern — do NOT conflate.
--
-- Wave0 lock: org_id business scope; RLS via app.current_org_id(). Fully re-entrant.

-- ── 1. npd_projects brief numerics (D25/D30) ───────────────────────────────────
alter table public.npd_projects
  add column if not exists weekly_volume_packs numeric(14, 3),
  add column if not exists runs_per_week numeric(8, 2);

comment on column public.npd_projects.weekly_volume_packs is
  'Brief gate (D25/D30): planned weekly output in packs; feeds costing setup amortisation. Distinct from free-text expected_volume.';

comment on column public.npd_projects.runs_per_week is
  'Brief gate (D25/D30): production runs per week; feeds costing setup amortisation (setup ÷ runs ÷ weekly volume).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_projects_weekly_volume_packs_nonneg'
       and conrelid = 'public.npd_projects'::regclass
  ) then
    alter table public.npd_projects
      add constraint npd_projects_weekly_volume_packs_nonneg
      check (weekly_volume_packs is null or weekly_volume_packs >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_projects_runs_per_week_nonneg'
       and conrelid = 'public.npd_projects'::regclass
  ) then
    alter table public.npd_projects
      add constraint npd_projects_runs_per_week_nonneg
      check (runs_per_week is null or runs_per_week >= 0);
  end if;
end $$;

-- ── 2. packaging_components costing waste (D41) ────────────────────────────────
alter table public.packaging_components
  add column if not exists waste_pct numeric(6, 3) not null default 0;

comment on column public.packaging_components.waste_pct is
  'Costing loss factor (% of component qty lost during packing). Separate from scrap_pct (WO consumption inflation, mig 393). Owner D41, 2026-07-03.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'packaging_components_waste_pct_range'
       and conrelid = 'public.packaging_components'::regclass
  ) then
    alter table public.packaging_components
      add constraint packaging_components_waste_pct_range
      check (waste_pct >= 0 and waste_pct <= 100);
  end if;
end $$;

-- Guarded backfill: existing rows get 0 (NOT NULL default already applied on add).
update public.packaging_components
   set waste_pct = 0
 where waste_pct is null;

-- ── 3. Brief field catalog (Core / brief stage, required gate) ─────────────────
insert into public.npd_field_catalog
  (org_id, code, label, data_type, validation_json, help_text, active)
select o.id,
       v.code,
       v.label,
       v.data_type,
       v.validation_json,
       v.help_text,
       true
  from public.organizations o
 cross join (
   values
     ('weekly_volume_packs'::text, 'Weekly volume (packs/week)'::text, 'number'::text,
      '{"minimum":0}'::jsonb,
      'Numeric weekly output in packs for costing setup amortisation (D25).'::text),
     ('runs_per_week', 'Runs per week', 'number',
      '{"minimum":0}'::jsonb,
      'Production runs per week for costing setup amortisation (D30).'::text)
 ) as v(code, label, data_type, validation_json, help_text)
on conflict (org_id, code) do update
  set label = excluded.label,
      data_type = excluded.data_type,
      validation_json = excluded.validation_json,
      help_text = excluded.help_text,
      active = true;

insert into public.npd_department_field
  (org_id, department_id, field_id, required, visible, display_order)
select d.org_id,
       d.id,
       f.id,
       true,
       true,
       v.display_order
  from public.npd_departments d
  join public.npd_field_catalog f
    on f.org_id = d.org_id
 cross join (
   values
     ('weekly_volume_packs'::text, 78::integer),
     ('runs_per_week', 79)
 ) as v(code, display_order)
 where d.code = 'Core'
   and d.stage_code = 'brief'
   and f.code = v.code
on conflict (org_id, department_id, field_id) do update
  set required = excluded.required,
      visible = excluded.visible,
      display_order = excluded.display_order;

-- ── 4. New-org seed hook — append brief unit fields after dynamic catalog seed ─
create or replace function public.seed_npd_brief_unit_fields(p_org uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  insert into public.npd_field_catalog
    (org_id, code, label, data_type, validation_json, help_text, active)
  values
    (p_org, 'weekly_volume_packs', 'Weekly volume (packs/week)', 'number',
     '{"minimum":0}'::jsonb,
     'Numeric weekly output in packs for costing setup amortisation (D25).', true),
    (p_org, 'runs_per_week', 'Runs per week', 'number',
     '{"minimum":0}'::jsonb,
     'Production runs per week for costing setup amortisation (D30).', true)
  on conflict (org_id, code) do update
    set label = excluded.label,
        data_type = excluded.data_type,
        validation_json = excluded.validation_json,
        help_text = excluded.help_text,
        active = true;

  insert into public.npd_department_field
    (org_id, department_id, field_id, required, visible, display_order)
  select d.org_id, d.id, f.id, true, true, v.display_order
    from public.npd_departments d
    join public.npd_field_catalog f on f.org_id = d.org_id
   cross join (
     values
       ('weekly_volume_packs'::text, 78::integer),
       ('runs_per_week', 79)
   ) as v(code, display_order)
   where d.org_id = p_org
     and d.code = 'Core'
     and d.stage_code = 'brief'
     and f.code = v.code
  on conflict (org_id, department_id, field_id) do update
    set required = excluded.required,
        visible = excluded.visible,
        display_order = excluded.display_order;
end;
$fn$;

-- Extend the org-insert catalog seeder (mig 421) to include brief unit fields.
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

  perform public.seed_npd_brief_unit_fields(v_org);

  return new;
end;
$fn$;
