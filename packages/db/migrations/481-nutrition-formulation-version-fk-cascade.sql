-- 481-nutrition-formulation-version-fk-cascade.sql
-- Wave 16 Bug 3 (N-45): nutrition_profiles, nutrition_allergens, and nutri_score_results
-- stored formulation_version_id as a bare UUID (migration 086) with no FK, while
-- formulation_versions CASCADE-delete via formulations (migration 093). Deleting a
-- version left orphaned nutrition rows forever.
--
-- CRITICAL: existing orphans MUST be removed before FK creation or ADD CONSTRAINT fails.
-- This migration is additive + idempotent (guarded DO blocks) and dry-run-safe on live.

-- ---------------------------------------------------------------------------
-- 1. Delete orphaned nutrition rows (formulation_version_id points at nothing)
-- ---------------------------------------------------------------------------
delete from public.nutrition_profiles profile_row
 where profile_row.formulation_version_id is not null
   and not exists (
     select 1
     from public.formulation_versions version_row
     where version_row.id = profile_row.formulation_version_id
   );

delete from public.nutrition_allergens allergen_row
 where allergen_row.formulation_version_id is not null
   and not exists (
     select 1
     from public.formulation_versions version_row
     where version_row.id = allergen_row.formulation_version_id
   );

delete from public.nutri_score_results score_row
 where score_row.formulation_version_id is not null
   and not exists (
     select 1
     from public.formulation_versions version_row
     where version_row.id = score_row.formulation_version_id
   );

-- ---------------------------------------------------------------------------
-- 2. Pre-flight: refuse FK add if any orphans remain (re-run safety)
-- ---------------------------------------------------------------------------
do $$
declare
  orphan_count bigint;
begin
  select count(*) into orphan_count
  from (
    select profile_row.formulation_version_id as version_id
    from public.nutrition_profiles profile_row
    where profile_row.formulation_version_id is not null
    union all
    select allergen_row.formulation_version_id
    from public.nutrition_allergens allergen_row
    where allergen_row.formulation_version_id is not null
    union all
    select score_row.formulation_version_id
    from public.nutri_score_results score_row
    where score_row.formulation_version_id is not null
  ) orphan_union
  left join public.formulation_versions version_row
    on version_row.id = orphan_union.version_id
  where version_row.id is null;

  if orphan_count > 0 then
    raise exception
      'nutrition formulation_version_id orphan pre-flight failed: % row(s) remain',
      orphan_count
      using errcode = '23514';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Add ON DELETE CASCADE FKs (nullable column — NULL rows unaffected)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'nutrition_profiles_formulation_version_id_fkey'
      and constraint_row.conrelid = 'public.nutrition_profiles'::regclass
  ) then
    alter table public.nutrition_profiles
      add constraint nutrition_profiles_formulation_version_id_fkey
      foreign key (formulation_version_id)
      references public.formulation_versions (id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'nutrition_allergens_formulation_version_id_fkey'
      and constraint_row.conrelid = 'public.nutrition_allergens'::regclass
  ) then
    alter table public.nutrition_allergens
      add constraint nutrition_allergens_formulation_version_id_fkey
      foreign key (formulation_version_id)
      references public.formulation_versions (id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'nutri_score_results_formulation_version_id_fkey'
      and constraint_row.conrelid = 'public.nutri_score_results'::regclass
  ) then
    alter table public.nutri_score_results
      add constraint nutri_score_results_formulation_version_id_fkey
      foreign key (formulation_version_id)
      references public.formulation_versions (id)
      on delete cascade;
  end if;
end $$;
