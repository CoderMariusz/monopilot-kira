-- T-036: NPD allergen reference schemas + EU14 seed.
-- Wave0 lock: org_id is the business scope (not tenant_id); RLS uses app.current_org_id().
-- PRD: docs/prd/01-NPD-PRD.md §8.2, §8.3, §8.4.

create schema if not exists "Reference";

create table if not exists "Reference"."Allergens" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  allergen_code text not null,
  allergen_name text not null,
  display_name text not null,
  regulatory_framework text not null,
  seed_source text,
  display_name_pl text,
  display_name_uk text,
  display_name_ro text,
  marker text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint reference_allergens_pk primary key (org_id, allergen_code),
  constraint reference_allergens_regulatory_framework_check
    check (regulatory_framework in ('EU_FIC_1169_2011', 'US_FALCPA', 'UK_FIR', 'custom')),
  constraint reference_allergens_seed_source_check
    check (seed_source is null or seed_source in ('EU14_default', 'org_added'))
);

create index if not exists reference_allergens_org_idx
  on "Reference"."Allergens" (org_id);

create table if not exists "Reference"."Allergens_by_RM" (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ingredient_codes text not null,
  allergen_code text not null,
  confidence text not null,
  source text not null,
  last_verified date,
  created_at timestamptz not null default pg_catalog.now(),
  constraint reference_allergens_by_rm_allergen_fk
    foreign key (org_id, allergen_code)
    references "Reference"."Allergens" (org_id, allergen_code)
    on update cascade
    on delete restrict,
  constraint reference_allergens_by_rm_confidence_check
    check (confidence in ('confirmed', 'may_contain', 'trace')),
  constraint reference_allergens_by_rm_source_check
    check (source in ('supplier_spec', 'manual', 'lab_test')),
  constraint reference_allergens_by_rm_org_ingredient_allergen_unique
    unique (org_id, ingredient_codes, allergen_code)
);

create index if not exists reference_allergens_by_rm_org_idx
  on "Reference"."Allergens_by_RM" (org_id);

create index if not exists reference_allergens_by_rm_ingredient_idx
  on "Reference"."Allergens_by_RM" (org_id, ingredient_codes);

create table if not exists "Reference"."Allergens_added_by_Process" (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  process_name text not null,
  allergen_code text not null,
  confidence text not null,
  recipe_condition text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint reference_allergens_added_by_process_allergen_fk
    foreign key (org_id, allergen_code)
    references "Reference"."Allergens" (org_id, allergen_code)
    on update cascade
    on delete restrict,
  constraint reference_allergens_added_by_process_confidence_check
    check (confidence in ('confirmed', 'conditional'))
);

create index if not exists reference_allergens_added_by_process_org_idx
  on "Reference"."Allergens_added_by_Process" (org_id);

create index if not exists reference_allergens_added_by_process_process_idx
  on "Reference"."Allergens_added_by_Process" (org_id, process_name);

alter table "Reference"."Allergens" enable row level security;
alter table "Reference"."Allergens" force row level security;
alter table "Reference"."Allergens_by_RM" enable row level security;
alter table "Reference"."Allergens_by_RM" force row level security;
alter table "Reference"."Allergens_added_by_Process" enable row level security;
alter table "Reference"."Allergens_added_by_Process" force row level security;

drop policy if exists "Allergens_org_context_select" on "Reference"."Allergens";
create policy "Allergens_org_context_select"
  on "Reference"."Allergens"
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists "Allergens_org_context_insert" on "Reference"."Allergens";
create policy "Allergens_org_context_insert"
  on "Reference"."Allergens"
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists "Allergens_org_context_update" on "Reference"."Allergens";
create policy "Allergens_org_context_update"
  on "Reference"."Allergens"
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists "Allergens_org_context_delete" on "Reference"."Allergens";
create policy "Allergens_org_context_delete"
  on "Reference"."Allergens"
  for delete
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists "Allergens_by_RM_org_context_select" on "Reference"."Allergens_by_RM";
create policy "Allergens_by_RM_org_context_select"
  on "Reference"."Allergens_by_RM"
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists "Allergens_by_RM_org_context_insert" on "Reference"."Allergens_by_RM";
create policy "Allergens_by_RM_org_context_insert"
  on "Reference"."Allergens_by_RM"
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists "Allergens_by_RM_org_context_update" on "Reference"."Allergens_by_RM";
create policy "Allergens_by_RM_org_context_update"
  on "Reference"."Allergens_by_RM"
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists "Allergens_by_RM_org_context_delete" on "Reference"."Allergens_by_RM";
create policy "Allergens_by_RM_org_context_delete"
  on "Reference"."Allergens_by_RM"
  for delete
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists "Allergens_added_by_Process_org_context_select" on "Reference"."Allergens_added_by_Process";
create policy "Allergens_added_by_Process_org_context_select"
  on "Reference"."Allergens_added_by_Process"
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists "Allergens_added_by_Process_org_context_insert" on "Reference"."Allergens_added_by_Process";
create policy "Allergens_added_by_Process_org_context_insert"
  on "Reference"."Allergens_added_by_Process"
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists "Allergens_added_by_Process_org_context_update" on "Reference"."Allergens_added_by_Process";
create policy "Allergens_added_by_Process_org_context_update"
  on "Reference"."Allergens_added_by_Process"
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists "Allergens_added_by_Process_org_context_delete" on "Reference"."Allergens_added_by_Process";
create policy "Allergens_added_by_Process_org_context_delete"
  on "Reference"."Allergens_added_by_Process"
  for delete
  to app_user
  using (org_id = app.current_org_id());

revoke all on schema "Reference" from public;
grant usage on schema "Reference" to app_user;

revoke all on "Reference"."Allergens" from public;
revoke all on "Reference"."Allergens_by_RM" from public;
revoke all on "Reference"."Allergens_added_by_Process" from public;
grant select, insert, update, delete on "Reference"."Allergens" to app_user;
grant select, insert, update, delete on "Reference"."Allergens_by_RM" to app_user;
grant select, insert, update, delete on "Reference"."Allergens_added_by_Process" to app_user;

create or replace function public.seed_allergens_eu14_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into "Reference"."Allergens" (
    org_id,
    allergen_code,
    allergen_name,
    display_name,
    regulatory_framework,
    seed_source,
    display_name_pl,
    display_name_uk,
    display_name_ro,
    marker
  )
  values
    (p_org_id, 'gluten', 'Cereals containing gluten', 'Gluten', 'EU_FIC_1169_2011', 'EU14_default', 'Gluten', 'Глютен', 'Gluten', '[UNIVERSAL]'),
    (p_org_id, 'crustaceans', 'Crustaceans', 'Crustaceans', 'EU_FIC_1169_2011', 'EU14_default', 'Skorupiaki', 'Ракоподібні', 'Crustacee', '[UNIVERSAL]'),
    (p_org_id, 'eggs', 'Eggs', 'Eggs', 'EU_FIC_1169_2011', 'EU14_default', 'Jaja', 'Яйця', 'Ouă', '[UNIVERSAL]'),
    (p_org_id, 'fish', 'Fish', 'Fish', 'EU_FIC_1169_2011', 'EU14_default', 'Ryby', 'Риба', 'Pește', '[UNIVERSAL]'),
    (p_org_id, 'peanuts', 'Peanuts', 'Peanuts', 'EU_FIC_1169_2011', 'EU14_default', 'Orzeszki ziemne', 'Арахіс', 'Arahide', '[UNIVERSAL]'),
    (p_org_id, 'soybeans', 'Soybeans', 'Soybeans', 'EU_FIC_1169_2011', 'EU14_default', 'Soja', 'Соя', 'Soia', '[UNIVERSAL]'),
    (p_org_id, 'milk', 'Milk', 'Milk', 'EU_FIC_1169_2011', 'EU14_default', 'Mleko', 'Молоко', 'Lapte', '[UNIVERSAL]'),
    (p_org_id, 'nuts', 'Nuts', 'Nuts', 'EU_FIC_1169_2011', 'EU14_default', 'Orzechy', 'Горіхи', 'Fructe cu coajă lemnoasă', '[UNIVERSAL]'),
    (p_org_id, 'celery', 'Celery', 'Celery', 'EU_FIC_1169_2011', 'EU14_default', 'Seler', 'Селера', 'Țelină', '[UNIVERSAL]'),
    (p_org_id, 'mustard', 'Mustard', 'Mustard', 'EU_FIC_1169_2011', 'EU14_default', 'Gorczyca', 'Гірчиця', 'Muștar', '[UNIVERSAL]'),
    (p_org_id, 'sesame', 'Sesame seeds', 'Sesame', 'EU_FIC_1169_2011', 'EU14_default', 'Sezam', 'Кунжут', 'Susan', '[UNIVERSAL]'),
    (p_org_id, 'sulphites', 'Sulphur dioxide and sulphites', 'Sulphites', 'EU_FIC_1169_2011', 'EU14_default', 'Dwutlenek siarki i siarczyny', 'Діоксид сірки та сульфіти', 'Dioxid de sulf și sulfiți', '[UNIVERSAL]'),
    (p_org_id, 'lupin', 'Lupin', 'Lupin', 'EU_FIC_1169_2011', 'EU14_default', 'Łubin', 'Люпин', 'Lupin', '[UNIVERSAL]'),
    (p_org_id, 'molluscs', 'Molluscs', 'Molluscs', 'EU_FIC_1169_2011', 'EU14_default', 'Mięczaki', 'Moluște', 'Moluște', '[UNIVERSAL]')
  on conflict (org_id, allergen_code) do update
    set allergen_name = excluded.allergen_name,
        display_name = excluded.display_name,
        regulatory_framework = excluded.regulatory_framework,
        seed_source = excluded.seed_source,
        display_name_pl = excluded.display_name_pl,
        display_name_uk = excluded.display_name_uk,
        display_name_ro = excluded.display_name_ro,
        marker = excluded.marker;
end;
$$;

revoke all on function public.seed_allergens_eu14_for_org(uuid) from public;
revoke all on function public.seed_allergens_eu14_for_org(uuid) from app_user;

create or replace function public.seed_allergens_eu14_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_allergens_eu14_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_allergens_eu14_on_org_insert() from public;
revoke all on function public.seed_allergens_eu14_on_org_insert() from app_user;

drop trigger if exists seed_allergens_eu14_after_org_insert on public.organizations;
create trigger seed_allergens_eu14_after_org_insert
  after insert on public.organizations
  for each row
  execute function public.seed_allergens_eu14_on_org_insert();

do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_allergens_eu14_for_org(v_org.id);
  end loop;
end
$$;
