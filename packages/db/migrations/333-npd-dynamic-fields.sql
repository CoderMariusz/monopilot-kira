-- Migration 333: NPD dynamic departments and fields.
--
-- Design lane only: creates the dynamic per-org department/field schema, adds a
-- nullable primary department affiliation to npd_projects, and backfills starter
-- config from the current Reference.DeptColumns metadata. It does not replace the
-- current UI, pipeline actions, or gate checklist copy flow.
--
-- Wave0 lock: org_id business scope (not tenant_id); RLS via app.current_org_id().
-- The actual org table in this repository is public.organizations.

create table if not exists public.npd_departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  display_order int not null default 0,
  active bool not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code),
  unique (id, org_id)
);

create table if not exists public.npd_field_catalog (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  label text not null,
  data_type text not null,
  validation_json jsonb,
  help_text text,
  active bool not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code),
  unique (id, org_id),
  constraint npd_field_catalog_data_type_check
    check (data_type in ('text', 'number', 'integer', 'boolean', 'date', 'datetime', 'dropdown', 'formula', 'json'))
);

create table if not exists public.npd_department_field (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.npd_departments(id) on delete cascade,
  field_id uuid not null references public.npd_field_catalog(id) on delete cascade,
  required bool not null default false,
  visible bool not null default true,
  stage_code text,
  display_order int not null default 0,
  unique (org_id, department_id, field_id),
  constraint npd_department_field_stage_code_check
    check (stage_code is null or stage_code in ('brief', 'recipe', 'packaging', 'trial', 'sensory', 'pilot', 'approval', 'handoff'))
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'npd_department_field_department_org_fkey'
       and conrelid = 'public.npd_department_field'::regclass
  ) then
    alter table public.npd_department_field
      add constraint npd_department_field_department_org_fkey
      foreign key (department_id, org_id)
      references public.npd_departments(id, org_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'npd_department_field_field_org_fkey'
       and conrelid = 'public.npd_department_field'::regclass
  ) then
    alter table public.npd_department_field
      add constraint npd_department_field_field_org_fkey
      foreign key (field_id, org_id)
      references public.npd_field_catalog(id, org_id)
      on delete cascade;
  end if;
end
$$;

-- npd_projects has no department relationship today. Add a nullable primary
-- affiliation FK rather than a link table because the product requirement is
-- singular ("projects carry a department affiliation") and no current schema
-- implies many-to-many department ownership.
alter table public.npd_projects
  add column if not exists department_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'npd_projects_department_org_fkey'
       and conrelid = 'public.npd_projects'::regclass
  ) then
    alter table public.npd_projects
      add constraint npd_projects_department_org_fkey
      foreign key (department_id, org_id)
      references public.npd_departments(id, org_id);
  end if;
end
$$;

create index if not exists npd_departments_org_active_order_idx
  on public.npd_departments (org_id, active, display_order, code);

create index if not exists npd_field_catalog_org_active_code_idx
  on public.npd_field_catalog (org_id, active, code);

create index if not exists npd_department_field_org_dept_order_idx
  on public.npd_department_field (org_id, department_id, visible, display_order);

create index if not exists npd_department_field_org_stage_idx
  on public.npd_department_field (org_id, stage_code, department_id)
  where stage_code is not null;

create index if not exists npd_projects_org_department_idx
  on public.npd_projects (org_id, department_id)
  where department_id is not null;

alter table public.npd_departments enable row level security;
alter table public.npd_departments force row level security;

drop policy if exists npd_departments_org_context on public.npd_departments;
create policy npd_departments_org_context
  on public.npd_departments
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.npd_field_catalog enable row level security;
alter table public.npd_field_catalog force row level security;

drop policy if exists npd_field_catalog_org_context on public.npd_field_catalog;
create policy npd_field_catalog_org_context
  on public.npd_field_catalog
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.npd_department_field enable row level security;
alter table public.npd_department_field force row level security;

drop policy if exists npd_department_field_org_context on public.npd_department_field;
create policy npd_department_field_org_context
  on public.npd_department_field
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.npd_departments from public;
revoke all on public.npd_departments from app_user;
grant select, insert, update, delete on public.npd_departments to app_user;

revoke all on public.npd_field_catalog from public;
revoke all on public.npd_field_catalog from app_user;
grant select, insert, update, delete on public.npd_field_catalog to app_user;

revoke all on public.npd_department_field from public;
revoke all on public.npd_department_field from app_user;
grant select, insert, update, delete on public.npd_department_field to app_user;

-- Backfill departments from the current runtime metadata. If an org has no
-- DeptColumns rows, seed the default seven departments discovered in the hardcoded
-- FA/gate code paths.
with fallback_departments(code, name, display_order) as (
  values
    ('Core', 'Core', 10),
    ('Planning', 'Planning', 20),
    ('Commercial', 'Commercial', 30),
    ('Production', 'Production', 40),
    ('Technical', 'Technical', 50),
    ('MRP', 'MRP', 60),
    ('Procurement', 'Procurement', 70)
),
dept_source as (
  select distinct
         dc.org_id,
         dc.dept_code as code,
         dc.dept_code as name,
         min(coalesce(dc.display_order, 0)) over (partition by dc.org_id, dc.dept_code) as display_order
    from "Reference"."DeptColumns" dc
   where dc.dept_code <> 'System'
     and dc.dept_code is not null
     and btrim(dc.dept_code) <> ''
  union all
  select o.id, fd.code, fd.name, fd.display_order
    from public.organizations o
    cross join fallback_departments fd
   where not exists (
     select 1
       from "Reference"."DeptColumns" dc
      where dc.org_id = o.id
        and dc.dept_code <> 'System'
   )
)
insert into public.npd_departments (org_id, code, name, display_order, active)
select org_id, code, name, display_order, true
  from dept_source
on conflict (org_id, code) do update
  set name = excluded.name,
      display_order = excluded.display_order,
      active = true;

-- Backfill a per-org field catalog. Reference.DeptColumns is preferred so each
-- existing org receives the field set it already runs with, including later Core
-- additions. The literal catalog covers orgs that have no DeptColumns rows yet.
with fallback_fields(dept_code, code, data_type, validation_json, required, display_order) as (
  values
    ('Core', 'Product_Code', 'text', null::jsonb, false, 1),
    ('Core', 'Product_Name', 'text', '{"minLength":1}'::jsonb, true, 2),
    ('Core', 'Pack_Size', 'dropdown', null::jsonb, true, 3),
    ('Core', 'Number_of_Cases', 'number', '{"minimum":0}'::jsonb, true, 4),
    ('Core', 'Recipe_Components', 'text', null::jsonb, true, 5),
    ('Core', 'Ingredient_Codes', 'text', null::jsonb, false, 6),
    ('Core', 'Template', 'dropdown', null::jsonb, false, 7),
    ('Core', 'Closed_Core', 'dropdown', null::jsonb, false, 80),
    ('Core', 'Volume', 'number', '{"minimum":0}'::jsonb, false, 71),
    ('Core', 'Dev_Code', 'text', null::jsonb, false, 72),
    ('Core', 'Weight', 'number', '{"minimum":0}'::jsonb, false, 73),
    ('Core', 'Packs_Per_Case', 'integer', '{"minimum":0}'::jsonb, false, 74),
    ('Core', 'Benchmark', 'text', null::jsonb, false, 75),
    ('Core', 'Price_Brief', 'number', '{"minimum":0}'::jsonb, false, 76),
    ('Core', 'Comments', 'text', null::jsonb, false, 77),
    ('Planning', 'Primary_Ingredient_Pct', 'number', '{"minimum":0,"maximum":100}'::jsonb, true, 9),
    ('Planning', 'Runs_Per_Week', 'number', '{"minimum":0}'::jsonb, true, 10),
    ('Planning', 'Date_Code_Per_Week', 'text', null::jsonb, true, 11),
    ('Planning', 'Closed_Planning', 'dropdown', null::jsonb, false, 12),
    ('Commercial', 'Launch_Date', 'date', null::jsonb, true, 13),
    ('Commercial', 'Department_Number', 'text', null::jsonb, true, 14),
    ('Commercial', 'Article_Number', 'text', null::jsonb, true, 15),
    ('Commercial', 'Bar_Codes', 'text', null::jsonb, true, 16),
    ('Commercial', 'Cases_Per_Week_W1', 'number', '{"minimum":0}'::jsonb, true, 17),
    ('Commercial', 'Cases_Per_Week_W2', 'number', '{"minimum":0}'::jsonb, true, 18),
    ('Commercial', 'Cases_Per_Week_W3', 'number', '{"minimum":0}'::jsonb, true, 19),
    ('Commercial', 'Closed_Commercial', 'dropdown', null::jsonb, false, 20),
    ('Production', 'Manufacturing_Operation_1', 'dropdown', null::jsonb, false, 21),
    ('Production', 'Operation_Yield_1', 'number', '{"minimum":0,"maximum":100}'::jsonb, false, 22),
    ('Production', 'Manufacturing_Operation_2', 'dropdown', null::jsonb, false, 23),
    ('Production', 'Operation_Yield_2', 'number', '{"minimum":0,"maximum":100}'::jsonb, false, 24),
    ('Production', 'Manufacturing_Operation_3', 'dropdown', null::jsonb, false, 25),
    ('Production', 'Operation_Yield_3', 'number', '{"minimum":0,"maximum":100}'::jsonb, false, 26),
    ('Production', 'Manufacturing_Operation_4', 'dropdown', null::jsonb, false, 27),
    ('Production', 'Operation_Yield_4', 'number', '{"minimum":0,"maximum":100}'::jsonb, false, 28),
    ('Production', 'Line', 'dropdown', null::jsonb, true, 29),
    ('Production', 'Equipment_Setup', 'dropdown', null::jsonb, false, 30),
    ('Production', 'Yield_Line', 'number', '{"minimum":0}'::jsonb, true, 31),
    ('Production', 'Resource_Requirement', 'text', null::jsonb, false, 32),
    ('Production', 'Rate', 'number', '{"minimum":0}'::jsonb, true, 33),
    ('Production', 'Intermediate_Code_P1', 'text', null::jsonb, false, 34),
    ('Production', 'Intermediate_Code_P2', 'text', null::jsonb, false, 35),
    ('Production', 'Intermediate_Code_P3', 'text', null::jsonb, false, 36),
    ('Production', 'Intermediate_Code_P4', 'text', null::jsonb, false, 37),
    ('Production', 'Intermediate_Code_Final', 'text', null::jsonb, false, 38),
    ('Production', 'Closed_Production', 'dropdown', null::jsonb, false, 39),
    ('Technical', 'Shelf_Life', 'text', null::jsonb, true, 40),
    ('Technical', 'Closed_Technical', 'dropdown', null::jsonb, false, 41),
    ('MRP', 'Box', 'text', null::jsonb, true, 42),
    ('MRP', 'Top_Label', 'text', null::jsonb, true, 43),
    ('MRP', 'Bottom_Label', 'text', null::jsonb, false, 44),
    ('MRP', 'Web', 'text', null::jsonb, false, 45),
    ('MRP', 'MRP_Box', 'text', null::jsonb, true, 46),
    ('MRP', 'MRP_Labels', 'text', null::jsonb, true, 47),
    ('MRP', 'MRP_Films', 'text', null::jsonb, true, 48),
    ('MRP', 'MRP_Sleeves', 'text', null::jsonb, false, 49),
    ('MRP', 'MRP_Cartons', 'text', null::jsonb, false, 50),
    ('MRP', 'Tara_Weight', 'number', '{"minimum":0}'::jsonb, true, 51),
    ('MRP', 'Pallet_Stacking_Plan', 'text', null::jsonb, true, 52),
    ('MRP', 'Box_Dimensions', 'text', null::jsonb, true, 53),
    ('MRP', 'Closed_MRP', 'dropdown', null::jsonb, false, 54),
    ('Procurement', 'Price', 'number', '{"minimum":0}'::jsonb, true, 55),
    ('Procurement', 'Lead_Time', 'number', '{"minimum":0}'::jsonb, true, 56),
    ('Procurement', 'Supplier', 'text', null::jsonb, true, 57),
    ('Procurement', 'Proc_Shelf_Life', 'number', '{"minimum":0}'::jsonb, true, 58),
    ('Procurement', 'Closed_Procurement', 'dropdown', null::jsonb, false, 59)
),
field_source as (
  select
      dc.org_id,
      dc.dept_code,
      dc.column_key as code,
      case
        when dc.dropdown_source is not null and btrim(dc.dropdown_source) <> '' then 'dropdown'
        when coalesce(dc.data_type, dc.field_type) = 'string' then 'text'
        when coalesce(dc.data_type, dc.field_type) = 'enum' then 'dropdown'
        when coalesce(dc.data_type, dc.field_type) = 'integer' then 'integer'
        when coalesce(dc.data_type, dc.field_type) = 'datetime' then 'datetime'
        when coalesce(dc.data_type, dc.field_type) = 'boolean' then 'boolean'
        when coalesce(dc.data_type, dc.field_type) = 'date' then 'date'
        when coalesce(dc.data_type, dc.field_type) = 'number' then 'number'
        when coalesce(dc.data_type, dc.field_type) = 'formula' then 'formula'
        else 'text'
      end as data_type,
      dc.validation_dsl as validation_json,
      dc.required_for_done as required,
      coalesce(dc.display_order, 0) as display_order
    from "Reference"."DeptColumns" dc
   where dc.dept_code <> 'System'
     and dc.dept_code is not null
     and btrim(dc.dept_code) <> ''
     and dc.column_key is not null
     and btrim(dc.column_key) <> ''
     and dc.column_key not like 'Done\_%' escape '\'
  union all
  select o.id, ff.dept_code, ff.code, ff.data_type, ff.validation_json, ff.required, ff.display_order
    from public.organizations o
    cross join fallback_fields ff
   where not exists (
     select 1
       from "Reference"."DeptColumns" dc
      where dc.org_id = o.id
        and dc.dept_code <> 'System'
   )
),
deduped_fields as (
  select distinct on (org_id, code)
         org_id,
         code,
         replace(initcap(replace(code, '_', ' ')), ' Mrp ', ' MRP ') as label,
         data_type,
         validation_json
    from field_source
   order by org_id, code, display_order
)
insert into public.npd_field_catalog
  (org_id, code, label, data_type, validation_json, help_text, active)
select org_id, code, label, data_type, validation_json, null, true
  from deduped_fields
on conflict (org_id, code) do update
  set label = excluded.label,
      data_type = excluded.data_type,
      validation_json = excluded.validation_json,
      active = true;

-- Backfill department-to-field assignments, preserving required_for_done as the
-- dynamic required flag and the existing display order.
with fallback_fields(dept_code, code, data_type, validation_json, required, display_order) as (
  values
    ('Core', 'Product_Code', 'text', null::jsonb, false, 1),
    ('Core', 'Product_Name', 'text', '{"minLength":1}'::jsonb, true, 2),
    ('Core', 'Pack_Size', 'dropdown', null::jsonb, true, 3),
    ('Core', 'Number_of_Cases', 'number', '{"minimum":0}'::jsonb, true, 4),
    ('Core', 'Recipe_Components', 'text', null::jsonb, true, 5),
    ('Core', 'Ingredient_Codes', 'text', null::jsonb, false, 6),
    ('Core', 'Template', 'dropdown', null::jsonb, false, 7),
    ('Core', 'Closed_Core', 'dropdown', null::jsonb, false, 80),
    ('Core', 'Volume', 'number', '{"minimum":0}'::jsonb, false, 71),
    ('Core', 'Dev_Code', 'text', null::jsonb, false, 72),
    ('Core', 'Weight', 'number', '{"minimum":0}'::jsonb, false, 73),
    ('Core', 'Packs_Per_Case', 'integer', '{"minimum":0}'::jsonb, false, 74),
    ('Core', 'Benchmark', 'text', null::jsonb, false, 75),
    ('Core', 'Price_Brief', 'number', '{"minimum":0}'::jsonb, false, 76),
    ('Core', 'Comments', 'text', null::jsonb, false, 77),
    ('Planning', 'Primary_Ingredient_Pct', 'number', '{"minimum":0,"maximum":100}'::jsonb, true, 9),
    ('Planning', 'Runs_Per_Week', 'number', '{"minimum":0}'::jsonb, true, 10),
    ('Planning', 'Date_Code_Per_Week', 'text', null::jsonb, true, 11),
    ('Planning', 'Closed_Planning', 'dropdown', null::jsonb, false, 12),
    ('Commercial', 'Launch_Date', 'date', null::jsonb, true, 13),
    ('Commercial', 'Department_Number', 'text', null::jsonb, true, 14),
    ('Commercial', 'Article_Number', 'text', null::jsonb, true, 15),
    ('Commercial', 'Bar_Codes', 'text', null::jsonb, true, 16),
    ('Commercial', 'Cases_Per_Week_W1', 'number', '{"minimum":0}'::jsonb, true, 17),
    ('Commercial', 'Cases_Per_Week_W2', 'number', '{"minimum":0}'::jsonb, true, 18),
    ('Commercial', 'Cases_Per_Week_W3', 'number', '{"minimum":0}'::jsonb, true, 19),
    ('Commercial', 'Closed_Commercial', 'dropdown', null::jsonb, false, 20),
    ('Production', 'Manufacturing_Operation_1', 'dropdown', null::jsonb, false, 21),
    ('Production', 'Operation_Yield_1', 'number', '{"minimum":0,"maximum":100}'::jsonb, false, 22),
    ('Production', 'Manufacturing_Operation_2', 'dropdown', null::jsonb, false, 23),
    ('Production', 'Operation_Yield_2', 'number', '{"minimum":0,"maximum":100}'::jsonb, false, 24),
    ('Production', 'Manufacturing_Operation_3', 'dropdown', null::jsonb, false, 25),
    ('Production', 'Operation_Yield_3', 'number', '{"minimum":0,"maximum":100}'::jsonb, false, 26),
    ('Production', 'Manufacturing_Operation_4', 'dropdown', null::jsonb, false, 27),
    ('Production', 'Operation_Yield_4', 'number', '{"minimum":0,"maximum":100}'::jsonb, false, 28),
    ('Production', 'Line', 'dropdown', null::jsonb, true, 29),
    ('Production', 'Equipment_Setup', 'dropdown', null::jsonb, false, 30),
    ('Production', 'Yield_Line', 'number', '{"minimum":0}'::jsonb, true, 31),
    ('Production', 'Resource_Requirement', 'text', null::jsonb, false, 32),
    ('Production', 'Rate', 'number', '{"minimum":0}'::jsonb, true, 33),
    ('Production', 'Intermediate_Code_P1', 'text', null::jsonb, false, 34),
    ('Production', 'Intermediate_Code_P2', 'text', null::jsonb, false, 35),
    ('Production', 'Intermediate_Code_P3', 'text', null::jsonb, false, 36),
    ('Production', 'Intermediate_Code_P4', 'text', null::jsonb, false, 37),
    ('Production', 'Intermediate_Code_Final', 'text', null::jsonb, false, 38),
    ('Production', 'Closed_Production', 'dropdown', null::jsonb, false, 39),
    ('Technical', 'Shelf_Life', 'text', null::jsonb, true, 40),
    ('Technical', 'Closed_Technical', 'dropdown', null::jsonb, false, 41),
    ('MRP', 'Box', 'text', null::jsonb, true, 42),
    ('MRP', 'Top_Label', 'text', null::jsonb, true, 43),
    ('MRP', 'Bottom_Label', 'text', null::jsonb, false, 44),
    ('MRP', 'Web', 'text', null::jsonb, false, 45),
    ('MRP', 'MRP_Box', 'text', null::jsonb, true, 46),
    ('MRP', 'MRP_Labels', 'text', null::jsonb, true, 47),
    ('MRP', 'MRP_Films', 'text', null::jsonb, true, 48),
    ('MRP', 'MRP_Sleeves', 'text', null::jsonb, false, 49),
    ('MRP', 'MRP_Cartons', 'text', null::jsonb, false, 50),
    ('MRP', 'Tara_Weight', 'number', '{"minimum":0}'::jsonb, true, 51),
    ('MRP', 'Pallet_Stacking_Plan', 'text', null::jsonb, true, 52),
    ('MRP', 'Box_Dimensions', 'text', null::jsonb, true, 53),
    ('MRP', 'Closed_MRP', 'dropdown', null::jsonb, false, 54),
    ('Procurement', 'Price', 'number', '{"minimum":0}'::jsonb, true, 55),
    ('Procurement', 'Lead_Time', 'number', '{"minimum":0}'::jsonb, true, 56),
    ('Procurement', 'Supplier', 'text', null::jsonb, true, 57),
    ('Procurement', 'Proc_Shelf_Life', 'number', '{"minimum":0}'::jsonb, true, 58),
    ('Procurement', 'Closed_Procurement', 'dropdown', null::jsonb, false, 59)
),
assignment_source as (
  select
      dc.org_id,
      dc.dept_code,
      dc.column_key as code,
      dc.required_for_done as required,
      coalesce(dc.display_order, 0) as display_order
    from "Reference"."DeptColumns" dc
   where dc.dept_code <> 'System'
     and dc.dept_code is not null
     and btrim(dc.dept_code) <> ''
     and dc.column_key is not null
     and btrim(dc.column_key) <> ''
     and dc.column_key not like 'Done\_%' escape '\'
  union all
  select o.id, ff.dept_code, ff.code, ff.required, ff.display_order
    from public.organizations o
    cross join fallback_fields ff
   where not exists (
     select 1
       from "Reference"."DeptColumns" dc
      where dc.org_id = o.id
        and dc.dept_code <> 'System'
   )
),
resolved as (
  select
      src.org_id,
      d.id as department_id,
      f.id as field_id,
      src.required,
      true as visible,
      case lower(src.dept_code)
        when 'core' then 'brief'
        when 'planning' then 'recipe'
        when 'commercial' then 'approval'
        when 'production' then 'pilot'
        when 'technical' then 'recipe'
        when 'mrp' then 'packaging'
        when 'procurement' then 'packaging'
        else null
      end as stage_code,
      src.display_order
    from assignment_source src
    join public.npd_departments d
      on d.org_id = src.org_id
     and d.code = src.dept_code
    join public.npd_field_catalog f
      on f.org_id = src.org_id
     and f.code = src.code
)
insert into public.npd_department_field
  (org_id, department_id, field_id, required, visible, stage_code, display_order)
select org_id, department_id, field_id, required, visible, stage_code, display_order
  from resolved
on conflict (org_id, department_id, field_id) do update
  set required = excluded.required,
      visible = excluded.visible,
      stage_code = excluded.stage_code,
      display_order = excluded.display_order;

comment on table public.npd_departments
  is 'Per-org dynamic NPD departments. Replaces hardcoded department lists in a follow-up runtime lane.';

comment on table public.npd_field_catalog
  is 'Per-org catalog of dynamic NPD fields available for assignment to departments.';

comment on table public.npd_department_field
  is 'Per-org assignment of catalog fields to NPD departments with required/visible/stage settings.';

comment on column public.npd_projects.department_id
  is 'Nullable primary NPD department affiliation. Chosen over a link table because npd_projects has no department relation today and current product requirement is singular.';
