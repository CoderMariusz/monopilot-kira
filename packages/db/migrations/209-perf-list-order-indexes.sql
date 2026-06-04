-- Migration 209: performance — corrective list/ORDER BY indexes
-- Scope: ADDITIVE indexes only. No table/column/RLS/grant/trigger changes.
--        Same inputs -> same outputs; behaviour-neutral.
--
-- Audited migrations 001-192 against the wired Server Actions. The schema is
-- broadly well-indexed (org_id-leading composites per MON-t1-schema). This
-- migration closes the two measurable gaps where a hot list/dashboard query
-- runs WHERE org_id = app.current_org_id() ... ORDER BY <col> with no covering
-- index, forcing a Seq Scan + top-N sort.
--
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside the migration runner's
-- per-file transaction (T-054 runner wraps each file in BEGIN/COMMIT). We use
-- plain CREATE INDEX IF NOT EXISTS — idempotent and safe to re-run. These tables
-- are small enough that the brief ACCESS EXCLUSIVE build lock is acceptable;
-- if a future table grows hot, rebuild CONCURRENTLY out-of-band.

-- ── 1. npd_projects — NPD pipeline list landing page ──────────────────────────
-- Server Action: apps/web/app/(npd)/pipeline/_actions/list-projects.ts
--   select ... from public.npd_projects p
--    where p.org_id = app.current_org_id() [ + optional gate/owner/prio/search ]
--    order by p.created_at desc, p.code desc
-- Existing org-leading indexes: (org_id, code) UNIQUE, (org_id, product_code) —
-- neither serves the created_at sort. Before: Seq Scan 50k rows + top-N heapsort
-- (~1644 shared buffers, ~13.7 ms). After: Index Scan + Incremental Sort
-- (~14 buffers, ~0.08 ms). created_at is NOT NULL, so default DESC (NULLS FIRST)
-- ordering matches the query's `created_at desc` exactly.
create index if not exists npd_projects_org_created_idx
  on public.npd_projects (org_id, created_at desc);

-- ── 2. d365_sync_jobs — Technical dashboard "latest sync status" widget ───────
-- Server Action: apps/web/app/[locale]/(app)/(modules)/technical/_actions/dashboard-kpis.ts
--   select status from public.d365_sync_jobs
--    where org_id = app.current_org_id()
--    order by scheduled_at desc nulls last, created_at desc
--    limit 1
-- Existing (org_id, status, scheduled_at) cannot satisfy the sort because `status`
-- sits between org_id and scheduled_at. The query orders DESC NULLS LAST, so the
-- index MUST also be DESC NULLS LAST for the planner to use it as a presorted key
-- (a plain DESC index is rejected — verified via EXPLAIN). Before: Seq Scan 50k
-- rows + top-N heapsort (~962 buffers, ~7.2 ms). After: Index Scan + Incremental
-- Sort (~10 buffers, ~0.03 ms).
create index if not exists d365_sync_jobs_org_scheduled_idx
  on public.d365_sync_jobs (org_id, scheduled_at desc nulls last);
