-- T-A.7-003 — session_org_contexts janitor (TTL + GC) — Wave A.7 HIGH residual closeout
--
-- Rationale:
--   apps/web/lib/auth/with-org-context.ts performs a best-effort
--   `delete from app.session_org_contexts where session_token = $1` in its
--   `finally` block AFTER the COMMIT has already succeeded. If that delete
--   fails (network blip, owner-pool exhaustion, process crash, etc.) the
--   row is leaked: the wrapped Server Action committed normally, but the
--   `app.session_org_contexts` row stays around forever. With no TTL or GC,
--   that table accumulates orphans indefinitely.
--
-- Mitigation:
--   1. Ensure every row carries a `created_at` timestamp (already the case
--      since 002-rls-baseline.sql, but we re-state with `IF NOT EXISTS` so
--      this migration is safe to run on any historical schema state).
--   2. Add an index on `created_at` so the janitor can range-scan efficiently
--      without a seq-scan over the full table.
--   3. Provide a SECURITY DEFINER function `app.gc_session_org_contexts()`
--      that operators wire up to a cron / scheduled job.
--
-- Expected operational wiring (NOT performed by this migration):
--   - Cadence: every 5 minutes.
--   - Default TTL: 600 seconds (10 minutes).
--     This is intentionally LONGER than any reasonable Server Action timeout
--     (Next.js Server Actions are bounded well below 60s in production).
--     A 10-minute floor guarantees we never race a still-executing happy-path
--     transaction; a leaked orphan only becomes collectable well after the
--     originating request has completed (success OR failure).
--   - Example crontab entry:
--       */5 * * * *  psql "$DATABASE_URL_OWNER" -c "select app.gc_session_org_contexts()"
--
-- Privilege model:
--   The function is SECURITY DEFINER (executes with owner privileges) but is
--   NOT granted to `app_user` — only operators / cron with owner credentials
--   may invoke it. The app code path never needs to call it directly.
--
-- Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT
--   EXISTS / CREATE OR REPLACE FUNCTION are all safe to re-run.

-- 1. Ensure created_at exists (defensive — should already exist since 002).
alter table app.session_org_contexts
  add column if not exists created_at timestamptz not null default pg_catalog.now();

-- 2. Index for janitor range scans on (created_at).
create index if not exists session_org_contexts_created_at_idx
  on app.session_org_contexts (created_at);

-- 3. Janitor function: delete rows older than `p_max_age_seconds`, return count.
--
-- Notes:
--   - SECURITY DEFINER + `set search_path = pg_catalog` hardens against
--     search-path injection (see Postgres docs §5.11.6).
--   - The interval arithmetic uses `make_interval(secs => ...)` instead of
--     `p_max_age_seconds * interval '1 second'` to keep the search_path
--     restricted to pg_catalog (avoids any text-based interval cast that
--     could resolve through a shadowed operator).
create or replace function app.gc_session_org_contexts(p_max_age_seconds int default 600)
returns int
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deleted int;
begin
  delete from app.session_org_contexts
   where created_at < pg_catalog.now() - make_interval(secs => p_max_age_seconds);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Lock down: revoke from public (anybody) and ensure app_user cannot invoke it
-- directly. Only owner/cron credentials should ever run this.
revoke all on function app.gc_session_org_contexts(int) from public;
revoke all on function app.gc_session_org_contexts(int) from app_user;

comment on function app.gc_session_org_contexts(int) is
  'GC orphan rows from app.session_org_contexts older than p_max_age_seconds (default 600). '
  'Operators wire this to a 5-minute cron with owner credentials. See migration 031.';
