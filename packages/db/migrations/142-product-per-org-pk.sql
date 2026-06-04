-- Migration 142: 01-NPD — product PRIMARY KEY becomes per-org.
-- PRD/decision: multi-tenant fix — public.product PK moves from the GLOBAL
-- (product_code) to the PER-ORG (org_id, product_code) so two organizations can
-- share a product_code. All 14 FKs that reference product(product_code) become
-- composite (org_id, code_col) -> product(org_id, product_code).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS unchanged
-- (app.current_org_id()). product.org_id is already NOT NULL, so it is a valid
-- leading PK column.
--
-- ON DELETE semantics are PRESERVED for every FK except formulations (see note).
--
-- ──────────────────────────────────────────────────────────────────────────
-- formulations SET-NULL decision
-- ──────────────────────────────────────────────────────────────────────────
-- formulations_product_code_fkey was ON DELETE SET NULL on the single column
-- product_code. A COMPOSITE SET NULL would null BOTH (org_id, product_code).
-- formulations.org_id is NOT NULL, so a composite SET NULL would FAIL at delete
-- time (null in a NOT NULL column). product is SOFT-DELETED only (migration 132:
-- product.deleted_at; the fa view filters deleted_at is null) and never hard
-- deleted, so the cascade action is effectively unreachable. We therefore use
-- ON DELETE NO ACTION for formulations — the safe, integrity-preserving choice
-- that keeps org_id intact. (product_code stays nullable on formulations.)
-- ──────────────────────────────────────────────────────────────────────────
-- NOTE: the migration runner (scripts/migrate.ts) wraps each file in its own
-- transaction, so this file must NOT open/close one itself.

-- 1. Drop all 14 FKs that depend on product_pkey's unique index.
alter table public.prod_detail                   drop constraint if exists prod_detail_product_code_fkey;
alter table public.npd_projects                  drop constraint if exists npd_projects_product_code_fkey;
alter table public.nutrition_profiles            drop constraint if exists nutrition_profiles_product_code_fkey;
alter table public.nutrition_allergens           drop constraint if exists nutrition_allergens_product_code_fkey;
alter table public.nutri_score_results           drop constraint if exists nutri_score_results_product_code_fkey;
alter table public.costing_breakdowns            drop constraint if exists costing_breakdowns_product_code_fkey;
alter table public.risks                         drop constraint if exists risks_product_code_fkey;
alter table public.compliance_docs               drop constraint if exists compliance_docs_product_code_fkey;
alter table public.formulations                  drop constraint if exists formulations_product_code_fkey;
alter table public.fa_allergen_overrides         drop constraint if exists fa_allergen_overrides_product_code_fkey;
alter table public.fa_builder_outputs            drop constraint if exists fa_builder_outputs_product_code_fkey;
alter table public.allergen_cascade_rebuild_jobs drop constraint if exists allergen_cascade_rebuild_jobs_product_code_fkey;
alter table public.bom_headers                   drop constraint if exists bom_headers_product_id_fkey;
alter table public.factory_release_status        drop constraint if exists factory_release_status_product_code_fkey;

-- 2. Swap the primary key: global (product_code) -> per-org (org_id, product_code).
alter table public.product drop constraint if exists product_pkey;
alter table public.product add  constraint product_pkey primary key (org_id, product_code);

-- 3. Supporting indexes on referencing tables that lack a usable plain leading
--    (org_id, code_col) btree index for the composite FK. The other 11 tables
--    already have one (verified against the live catalog).
create index if not exists npd_projects_org_product_code_idx
  on public.npd_projects (org_id, product_code);
create index if not exists formulations_org_product_code_idx
  on public.formulations (org_id, product_code);
create index if not exists factory_release_status_org_product_code_idx
  on public.factory_release_status (org_id, product_code);

-- 4. Re-add each FK as composite, preserving its original ON DELETE behavior.
alter table public.prod_detail
  add constraint prod_detail_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete cascade;

alter table public.npd_projects
  add constraint npd_projects_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code);  -- NO ACTION (preserved)

alter table public.nutrition_profiles
  add constraint nutrition_profiles_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete cascade;

alter table public.nutrition_allergens
  add constraint nutrition_allergens_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete cascade;

alter table public.nutri_score_results
  add constraint nutri_score_results_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete cascade;

alter table public.costing_breakdowns
  add constraint costing_breakdowns_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete cascade;

alter table public.risks
  add constraint risks_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete cascade;

alter table public.compliance_docs
  add constraint compliance_docs_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete cascade;

-- formulations: ON DELETE NO ACTION (NOT set null) — org_id is NOT NULL; see header note.
alter table public.formulations
  add constraint formulations_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete no action;

alter table public.fa_allergen_overrides
  add constraint fa_allergen_overrides_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete cascade;

alter table public.fa_builder_outputs
  add constraint fa_builder_outputs_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete cascade;

alter table public.allergen_cascade_rebuild_jobs
  add constraint allergen_cascade_rebuild_jobs_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete cascade;

-- bom_headers: column is product_id (references product_code); composite (org_id, product_id).
alter table public.bom_headers
  add constraint bom_headers_product_id_fkey
  foreign key (org_id, product_id) references public.product (org_id, product_code) on delete restrict;

alter table public.factory_release_status
  add constraint factory_release_status_product_code_fkey
  foreign key (org_id, product_code) references public.product (org_id, product_code) on delete restrict;
