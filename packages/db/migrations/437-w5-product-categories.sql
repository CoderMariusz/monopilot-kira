-- W5 L1: org-scoped product categories in the Reference schema.
-- Wave0 lock: org_id is the business scope; RLS uses app.current_org_id().

create schema if not exists "Reference";

create table if not exists "Reference"."ProductCategories" (
  id uuid default gen_random_uuid(),
  org_id uuid not null,
  code text not null,
  label text not null,
  is_active boolean not null default true,
  display_order int not null,
  constraint product_categories_pkey primary key (id),
  constraint product_categories_org_id_fkey
    foreign key (org_id)
    references public.organizations (id)
    on delete cascade,
  constraint product_categories_org_code_unique unique (org_id, code)
);

alter table "Reference"."ProductCategories"
  add column if not exists id uuid,
  add column if not exists org_id uuid,
  add column if not exists code text,
  add column if not exists label text,
  add column if not exists is_active boolean,
  add column if not exists display_order int;

alter table "Reference"."ProductCategories"
  alter column id set default gen_random_uuid(),
  alter column org_id set not null,
  alter column code set not null,
  alter column label set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column display_order set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'product_categories_pkey'
       and conrelid = '"Reference"."ProductCategories"'::regclass
  ) then
    alter table "Reference"."ProductCategories"
      add constraint product_categories_pkey primary key (id);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'product_categories_org_id_fkey'
       and conrelid = '"Reference"."ProductCategories"'::regclass
  ) then
    alter table "Reference"."ProductCategories"
      add constraint product_categories_org_id_fkey
      foreign key (org_id)
      references public.organizations (id)
      on delete cascade;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'product_categories_org_code_unique'
       and conrelid = '"Reference"."ProductCategories"'::regclass
  ) then
    alter table "Reference"."ProductCategories"
      add constraint product_categories_org_code_unique
      unique (org_id, code);
  end if;
end $$;

create index if not exists product_categories_org_active_order_idx
  on "Reference"."ProductCategories" (org_id, is_active, display_order);

alter table "Reference"."ProductCategories" enable row level security;
alter table "Reference"."ProductCategories" force row level security;

drop policy if exists "ProductCategories_org_context_select"
  on "Reference"."ProductCategories";
create policy "ProductCategories_org_context_select"
  on "Reference"."ProductCategories"
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists "ProductCategories_org_context_insert"
  on "Reference"."ProductCategories";
create policy "ProductCategories_org_context_insert"
  on "Reference"."ProductCategories"
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists "ProductCategories_org_context_update"
  on "Reference"."ProductCategories";
create policy "ProductCategories_org_context_update"
  on "Reference"."ProductCategories"
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on schema "Reference" from public;
grant usage on schema "Reference" to app_user;

revoke all on "Reference"."ProductCategories" from public;
revoke all on "Reference"."ProductCategories" from app_user;
grant select, insert, update on "Reference"."ProductCategories" to app_user;

create or replace function public.seed_product_categories_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into "Reference"."ProductCategories"
    (id, org_id, code, label, is_active, display_order)
  values
    (gen_random_uuid(), new.id, 'meat_cold_cut', 'Meat · Cold cut', true, 10),
    (gen_random_uuid(), new.id, 'meat_smoked', 'Meat · Smoked', true, 20),
    (gen_random_uuid(), new.id, 'meat_cured', 'Meat · Cured', true, 30),
    (gen_random_uuid(), new.id, 'meat_pate', 'Meat · Pâté', true, 40),
    (gen_random_uuid(), new.id, 'fish_smoked', 'Fish · Smoked', true, 50)
  on conflict (org_id, code) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_seed_product_categories on public.organizations;
create trigger trg_seed_product_categories
  after insert on public.organizations
  for each row
  execute function public.seed_product_categories_on_org_insert();

insert into "Reference"."ProductCategories"
  (id, org_id, code, label, is_active, display_order)
select gen_random_uuid(),
       org.id,
       seed.code,
       seed.label,
       true,
       seed.display_order
  from public.organizations org
 cross join (
   values
     ('meat_cold_cut', 'Meat · Cold cut', 10),
     ('meat_smoked', 'Meat · Smoked', 20),
     ('meat_cured', 'Meat · Cured', 30),
     ('meat_pate', 'Meat · Pâté', 40),
     ('fish_smoked', 'Fish · Smoked', 50)
 ) as seed(code, label, display_order)
on conflict (org_id, code) do nothing;

alter table public.items
  add column if not exists category_code text;
