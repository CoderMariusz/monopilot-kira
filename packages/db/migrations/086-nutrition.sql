-- T-069: 01-NPD-h nutrition schema.
-- PRD: docs/prd/01-NPD-PRD.md §17.11.2.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create schema if not exists "Reference";

create table if not exists "Reference"."Nutrients" (
  nutrient_code text primary key,
  display_name text not null,
  unit text not null,
  display_order integer not null,
  regulation text not null,
  constraint reference_nutrients_display_order_unique unique (display_order),
  constraint reference_nutrients_code_nonempty_check
    check (length(pg_catalog.btrim(nutrient_code)) > 0)
);

insert into "Reference"."Nutrients"
  (nutrient_code, display_name, unit, display_order, regulation)
values
  ('energy_kj', 'Energy', 'kJ', 1, 'EU FIC 1169/2011'),
  ('fat_g', 'Fat', 'g', 2, 'EU FIC 1169/2011'),
  ('saturates_g', 'Saturates', 'g', 3, 'EU FIC 1169/2011'),
  ('carbs_g', 'Carbohydrate', 'g', 4, 'EU FIC 1169/2011'),
  ('sugars_g', 'Sugars', 'g', 5, 'EU FIC 1169/2011'),
  ('protein_g', 'Protein', 'g', 6, 'EU FIC 1169/2011'),
  ('salt_g', 'Salt', 'g', 7, 'EU FIC 1169/2011')
on conflict (nutrient_code) do update
  set display_name = excluded.display_name,
      unit = excluded.unit,
      display_order = excluded.display_order,
      regulation = excluded.regulation;

create table if not exists public.nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_code text not null references public.product(product_code) on delete cascade,
  formulation_version_id uuid,
  nutrient_code text not null references "Reference"."Nutrients"(nutrient_code) on update cascade,
  per_100g_value numeric not null,
  per_portion_value numeric not null,
  computed_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,
  constraint nutrition_profiles_nonnegative_values_check
    check (per_100g_value >= 0 and per_portion_value >= 0)
);

create table if not exists public.nutrition_allergens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_code text not null references public.product(product_code) on delete cascade,
  formulation_version_id uuid,
  allergen_code text not null,
  presence text not null,
  audited_at timestamptz not null default pg_catalog.now(),
  audited_by_user uuid references public.users(id),
  schema_version integer not null default 1,
  constraint nutrition_allergens_presence_check
    check (presence in ('contains', 'may_contain', 'free_from', 'unknown')),
  constraint nutrition_allergens_org_product_allergen_unique
    unique nulls not distinct (org_id, product_code, formulation_version_id, allergen_code)
);

create table if not exists public.nutri_score_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_code text not null references public.product(product_code) on delete cascade,
  formulation_version_id uuid,
  grade text not null,
  computed_score integer not null,
  computed_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,
  constraint nutri_score_results_grade_check
    check (grade in ('A', 'B', 'C', 'D', 'E'))
);

alter table public.nutri_score_results
  drop constraint if exists nutri_score_results_org_product_computed_unique;

alter table public.nutri_score_results
  add constraint nutri_score_results_org_product_computed_unique
  unique nulls not distinct (org_id, product_code, formulation_version_id, computed_at);

create index if not exists nutrition_profiles_org_product_idx
  on public.nutrition_profiles (org_id, product_code);

create index if not exists nutrition_profiles_product_nutrient_idx
  on public.nutrition_profiles (product_code, nutrient_code);

create index if not exists nutrition_allergens_org_product_idx
  on public.nutrition_allergens (org_id, product_code);

create index if not exists nutri_score_results_org_product_computed_idx
  on public.nutri_score_results (org_id, product_code, computed_at desc);

alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_profiles force row level security;

drop policy if exists nutrition_profiles_org_context on public.nutrition_profiles;
create policy nutrition_profiles_org_context
  on public.nutrition_profiles
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.nutrition_allergens enable row level security;
alter table public.nutrition_allergens force row level security;

drop policy if exists nutrition_allergens_org_context on public.nutrition_allergens;
create policy nutrition_allergens_org_context
  on public.nutrition_allergens
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.nutri_score_results enable row level security;
alter table public.nutri_score_results force row level security;

drop policy if exists nutri_score_results_org_context on public.nutri_score_results;
create policy nutri_score_results_org_context
  on public.nutri_score_results
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on "Reference"."Nutrients" from public;
grant usage on schema "Reference" to app_user;
grant select on "Reference"."Nutrients" to app_user;

revoke all on public.nutrition_profiles from public;
revoke all on public.nutrition_profiles from app_user;
grant select, insert, update, delete on public.nutrition_profiles to app_user;

revoke all on public.nutrition_allergens from public;
revoke all on public.nutrition_allergens from app_user;
grant select, insert, update, delete on public.nutrition_allergens to app_user;

revoke all on public.nutri_score_results from public;
revoke all on public.nutri_score_results from app_user;
grant select, insert, update, delete on public.nutri_score_results to app_user;
