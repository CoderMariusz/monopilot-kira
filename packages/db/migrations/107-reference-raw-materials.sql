-- Migration 103: T-065 canonical raw-material master (nutrition source).
-- PRD: docs/prd/01-NPD-PRD.md §17.11.1 ("Reference.RawMaterials … seeds") +
--      §17.11.2 ("Weighted sum from Reference.RawMaterials.nutrition_per_100g").
--
-- WHY THIS MIGRATION EXISTS (T-065 rework, Codex finding #1):
-- The PRD names `Reference.RawMaterials.nutrition_per_100g` as the canonical
-- per-RM nutrition source for the formulation weighted-sum, but no prior
-- migration provisioned it (only `Reference.Nutrients` codes from mig 086).
-- Without this table `recomputeAndCache` could never populate `nutrition_json`.
-- This migration adds the minimal canonical source so the live nutrition
-- weighted-sum (PRD §17.11.1) has real data to read, keyed by `rm_code`.
--
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create schema if not exists "Reference";

create table if not exists "Reference"."RawMaterials" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  rm_code text not null,
  display_name text not null,
  -- Per-100g nutrient values keyed by Reference.Nutrients.nutrient_code.
  -- JSONB of { nutrient_code: numeric-as-string }. Empty {} when unknown.
  nutrition_per_100g jsonb not null default '{}'::jsonb,
  -- EU-14 allergen codes inherited by any ingredient referencing this RM.
  allergens_inherited text[] not null default '{}'::text[],
  created_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,
  constraint reference_raw_materials_pkey primary key (org_id, rm_code),
  constraint reference_raw_materials_rm_code_nonempty_check
    check (length(pg_catalog.btrim(rm_code)) > 0)
);

create index if not exists reference_raw_materials_org_idx
  on "Reference"."RawMaterials" (org_id);

alter table "Reference"."RawMaterials" enable row level security;
alter table "Reference"."RawMaterials" force row level security;

drop policy if exists reference_raw_materials_org_context on "Reference"."RawMaterials";
create policy reference_raw_materials_org_context
  on "Reference"."RawMaterials"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

grant usage on schema "Reference" to app_user;
revoke all on "Reference"."RawMaterials" from public;
revoke all on "Reference"."RawMaterials" from app_user;
grant select, insert, update, delete on "Reference"."RawMaterials" to app_user;
