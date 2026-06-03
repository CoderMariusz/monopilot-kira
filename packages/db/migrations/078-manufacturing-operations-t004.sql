-- Migration 078: T-004 Reference.ManufacturingOperations T1 schema correction.
-- PRD: docs/prd/01-NPD-PRD.md §4.5 + Appendix A.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create schema if not exists "Reference";

create table if not exists "Reference"."ManufacturingOperations" (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  operation_name text not null,
  process_suffix text not null check (process_suffix ~ '^[A-Z0-9]{2,4}$'),
  description text,
  operation_seq integer not null,
  industry_code text not null check (industry_code in ('bakery', 'pharma', 'fmcg')),
  is_active boolean not null default true,
  marker text not null default 'APEX-CONFIG',
  created_at timestamptz not null default now(),
  constraint manufacturing_operations_org_operation_name_unique unique (org_id, operation_name),
  constraint manufacturing_operations_org_process_suffix_unique unique (org_id, process_suffix)
);

alter table "Reference"."ManufacturingOperations"
  add column if not exists id uuid,
  add column if not exists org_id uuid,
  add column if not exists operation_name text,
  add column if not exists process_suffix text,
  add column if not exists description text,
  add column if not exists operation_seq integer,
  add column if not exists industry_code text,
  add column if not exists is_active boolean,
  add column if not exists marker text,
  add column if not exists created_at timestamptz;

alter table "Reference"."ManufacturingOperations"
  alter column id set default gen_random_uuid(),
  alter column operation_seq set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column marker set default 'APEX-CONFIG',
  alter column marker set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

delete from "Reference"."ManufacturingOperations" mfg
using public.organizations org
where mfg.org_id = org.id
  and mfg.marker = 'APEX-CONFIG'
  and (
    mfg.industry_code not in ('bakery', 'pharma', 'fmcg')
    or org.industry_code not in ('bakery', 'pharma', 'fmcg')
    or mfg.industry_code <> org.industry_code
  );

alter table "Reference"."ManufacturingOperations"
  alter column org_id set not null,
  alter column operation_name set not null,
  alter column process_suffix set not null,
  alter column industry_code set not null;

alter table "Reference"."ManufacturingOperations"
  drop constraint if exists manufacturing_operations_process_suffix_check;

alter table "Reference"."ManufacturingOperations"
  add constraint manufacturing_operations_process_suffix_check
  check (process_suffix ~ '^[A-Z0-9]{2,4}$') not valid;

alter table "Reference"."ManufacturingOperations"
  validate constraint manufacturing_operations_process_suffix_check;

alter table "Reference"."ManufacturingOperations"
  drop constraint if exists manufacturing_operations_industry_code_check;

alter table "Reference"."ManufacturingOperations"
  add constraint manufacturing_operations_industry_code_check
  check (industry_code in ('bakery', 'pharma', 'fmcg')) not valid;

alter table "Reference"."ManufacturingOperations"
  validate constraint manufacturing_operations_industry_code_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'manufacturing_operations_org_operation_name_unique'
      and conrelid = '"Reference"."ManufacturingOperations"'::regclass
  ) then
    alter table "Reference"."ManufacturingOperations"
      add constraint manufacturing_operations_org_operation_name_unique
      unique (org_id, operation_name);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'manufacturing_operations_org_process_suffix_unique'
      and conrelid = '"Reference"."ManufacturingOperations"'::regclass
  ) then
    alter table "Reference"."ManufacturingOperations"
      add constraint manufacturing_operations_org_process_suffix_unique
      unique (org_id, process_suffix);
  end if;
end
$$;

create index if not exists manufacturing_operations_org_industry_idx
  on "Reference"."ManufacturingOperations" (org_id, industry_code);

alter table "Reference"."ManufacturingOperations" enable row level security;
alter table "Reference"."ManufacturingOperations" force row level security;

drop policy if exists "ManufacturingOperations_org_isolation"
  on "Reference"."ManufacturingOperations";

create policy "ManufacturingOperations_org_isolation"
  on "Reference"."ManufacturingOperations"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

grant usage on schema "Reference" to app_user;
revoke all on "Reference"."ManufacturingOperations" from public;
revoke all on "Reference"."ManufacturingOperations" from app_user;
grant select, insert, update, delete on "Reference"."ManufacturingOperations" to app_user;

create or replace function public.seed_reference_data_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
begin
  if new.id = v_apex_org_id then
    return new;
  end if;

  insert into "Reference"."Departments"
    (id, org_id, code, display_name, role_description, marker, created_at)
  select gen_random_uuid(),
         new.id,
         code,
         display_name,
         role_description,
         marker,
         pg_catalog.now()
    from "Reference"."Departments"
   where org_id = v_apex_org_id
  on conflict (org_id, code) do nothing;

  if exists (
    select 1
      from information_schema.tables
     where table_schema = 'Reference'
       and table_name = 'ManufacturingOperations'
  ) then
    insert into "Reference"."ManufacturingOperations"
      (id, org_id, operation_name, process_suffix, description, operation_seq,
       industry_code, is_active, marker, created_at)
    select gen_random_uuid(),
           new.id,
           seed.operation_name,
           seed.process_suffix,
           seed.description,
           seed.operation_seq,
           seed.industry_code,
           true,
           'APEX-CONFIG',
           pg_catalog.now()
      from (
        values
          ('bakery', 'Mix', 'MX', 'Ingredient mixing stage', 1),
          ('bakery', 'Knead', 'KN', 'Dough kneading stage', 2),
          ('bakery', 'Proof', 'PR', 'Dough proofing / fermentation', 3),
          ('bakery', 'Bake', 'BK', 'Oven baking stage', 4),
          ('pharma', 'Synthesis', 'SY', 'API synthesis reaction', 1),
          ('pharma', 'Separation', 'SE', 'Phase separation / extraction', 2),
          ('pharma', 'Crystallization', 'CZ', 'Crystallization and filtration', 3),
          ('pharma', 'Drying', 'DR', 'Final drying and sizing', 4),
          ('fmcg', 'Mix', 'MX', 'Blending and mixing', 1),
          ('fmcg', 'Fill', 'FL', 'Container filling', 2),
          ('fmcg', 'Seal', 'SL', 'Container sealing / capping', 3),
          ('fmcg', 'Label', 'LB', 'Label application', 4)
      ) as seed(industry_code, operation_name, process_suffix, description, operation_seq)
      where seed.industry_code = new.industry_code
    on conflict (org_id, operation_name) do nothing;
  end if;

  return new;
end;
$$;
