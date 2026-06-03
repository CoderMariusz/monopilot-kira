-- Migration 074: 02-settings W5 Codex P2 fixes — reference write path.
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.2, §8.1; ADR-028.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- Two fixes for the broken WRITE/add-edit path on /settings/processes +
-- /settings/partners (and, subsystem-wide, every schema-driven reference table):
--
--   FINDING 1(a) — universal schema rows invisible to app_user.
--     reference_schemas L1 baseline rows are seeded with org_id IS NULL (T-093).
--     The 038 SELECT policy is `using (org_id = app.current_org_id())` under
--     FORCE RLS, so `NULL = app.current_org_id()` is NULL (never true) and
--     app_user can read NO universal schema rows at all. The write-validation
--     schema lookup (actions/reference/upsert.ts:loadGeneratedSchema) therefore
--     resolves 0 columns and returns 'reference schema is not configured'.
--     Fix: widen the SELECT policy to also expose universal (org_id IS NULL)
--     rows. INSERT/UPDATE/DELETE stay org-scoped — app_user may READ but never
--     mutate universal L1 schemas (tenant-isolation for writes preserved).
--
--   FINDING 2 — reference.processes.process_code schema column missing.
--     Migration 073 seeded reference.processes with only name + category. The
--     data rows + UI rely on process_code (the row identifier). On a fresh
--     deploy (seeds/*.sql skipped) the column is absent. Seed it idempotently to
--     match the T-093 definition (packages/db/seeds/reference-schemas.sql:118).

-- ============================================================
-- 1. FINDING 1(a): allow app_user to SELECT universal schema rows.
--    SELECT widens to include org_id IS NULL; writes stay org-scoped.
-- ============================================================
drop policy if exists reference_schemas_org_context_select on public.reference_schemas;
create policy reference_schemas_org_context_select
  on public.reference_schemas
  for select
  to app_user
  using (org_id = app.current_org_id() or org_id is null);

-- ============================================================
-- 2. FINDING 2: idempotently seed reference.processes.process_code (L1 universal).
--    Shape mirrors T-093 (text, required, unique).
-- ============================================================
do $$
begin
  insert into public.reference_schemas (
    org_id, table_code, column_code, data_type, tier, storage,
    dropdown_source, required_for_done, validation_json, presentation_json
  )
  select null::uuid, 'reference.processes', 'process_code', 'text', 'L1', 'ext_jsonb',
         null::text, true,
         '{"required":true,"unique":true}'::jsonb,
         '{"label":"Process code","editable_by":["admin"]}'::jsonb
  where not exists (
    select 1 from public.reference_schemas existing
    where existing.org_id is null
      and existing.table_code = 'reference.processes'
      and existing.column_code = 'process_code'
  );
end $$;
