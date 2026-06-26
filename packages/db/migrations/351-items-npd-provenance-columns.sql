-- Migration 351: add NPD provenance columns to public.items.
-- The NPD->Technical BOM generator (materialize-npd-bom.ts) now stamps the production FG
-- item with its NPD origin so the PRODUCTION_CODE_CONFLICT guard can tell "this project's
-- FG-002" from a different project's / a non-NPD FG-002 with the same derived code.
-- Without these columns the generator's items INSERT + conflict SELECT threw 42703 and
-- broke every handoff promote. Additive, nullable, idempotent. app_user already has full
-- DML on items. Wave0: org_id RLS unchanged.
alter table public.items
  add column if not exists origin_module text,
  add column if not exists npd_project_id uuid;

create index if not exists idx_items_npd_project
  on public.items (org_id, npd_project_id)
  where npd_project_id is not null;
