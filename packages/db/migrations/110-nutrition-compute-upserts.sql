-- T-072: Nutrition compute Server Action UPSERT keys.
-- PRD: docs/prd/01-NPD-PRD.md §17.11.2.
-- Wave0 lock: org_id business scope; RLS remains app.current_org_id().
--
-- Canonical nutrition tables are owned by T-069 (migration 086). This migration
-- only adds idempotent conflict targets needed by the T-072 compute action.

alter table public.nutrition_profiles
  drop constraint if exists nutrition_profiles_org_product_version_nutrient_unique;

alter table public.nutrition_profiles
  add constraint nutrition_profiles_org_product_version_nutrient_unique
  unique nulls not distinct (org_id, product_code, formulation_version_id, nutrient_code);

alter table public.nutri_score_results
  drop constraint if exists nutri_score_results_org_product_version_unique;

alter table public.nutri_score_results
  add constraint nutri_score_results_org_product_version_unique
  unique nulls not distinct (org_id, product_code, formulation_version_id);

alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_profiles force row level security;
alter table public.nutri_score_results enable row level security;
alter table public.nutri_score_results force row level security;

drop policy if exists nutrition_profiles_org_context on public.nutrition_profiles;
create policy nutrition_profiles_org_context
  on public.nutrition_profiles
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists nutri_score_results_org_context on public.nutri_score_results;
create policy nutri_score_results_org_context
  on public.nutri_score_results
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.nutrition_profiles from public;
revoke all on public.nutrition_profiles from app_user;
grant select, insert, update, delete on public.nutrition_profiles to app_user;

revoke all on public.nutri_score_results from public;
revoke all on public.nutri_score_results from app_user;
grant select, insert, update, delete on public.nutri_score_results to app_user;
