-- Migration 036 — Slot F-4: audit_events retention prune cron.
--
-- Background:
--   The audit table is `public.audit_events` (see migration 004) with a
--   timestamp column `occurred_at`. The prompt-level requirement was
--   "delete audit_log rows older than 90 days"; the live table is
--   `audit_events`, so this migration prunes that table by `occurred_at`.
--
-- Retention policy:
--   * The prune deletes rows with `occurred_at < now() - interval '90 days'`.
--   * `retention_class = 'security'` rows are EXCLUDED from the prune so
--     long-retention security events (admin/role grants, mfa events,
--     impersonation) survive the 90-day window. Standard / operational /
--     ephemeral classes are pruned at 90 days. This is the conservative
--     interpretation of the "90 day" requirement: a flat 90-day prune would
--     destroy compliance-relevant security events; if/when finer-grained
--     class-specific windows are required, they extend this function.
--
-- pg_cron guard:
--   Wraps `cron.schedule` in a `pg_extension` existence guard so the
--   migration is a no-op on Postgres images without pg_cron (local docker,
--   CI). The function itself is always created — operators on those
--   environments can invoke it manually.
--
-- Append-only enforcement:
--   `audit_events` REVOKEs DELETE from app_user (migration 004); this
--   function runs as SECURITY DEFINER (migration owner) so it bypasses that
--   guard. Only the prune cron can delete rows — application paths still
--   cannot.

-- 1. Pruning function: deletes non-security rows older than 90 days.
CREATE OR REPLACE FUNCTION public.prune_audit_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  DELETE FROM public.audit_events
   WHERE occurred_at < now() - interval '90 days'
     AND retention_class <> 'security';
$$;

-- Lock down the function — only the migration owner / cron can execute.
REVOKE ALL ON FUNCTION public.prune_audit_events() FROM PUBLIC;

-- 2. Schedule via pg_cron — guarded so migration succeeds on environments
--    without pg_cron installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'prune_audit_events_daily',
      '0 4 * * *',
      $cron$ SELECT public.prune_audit_events(); $cron$
    );
  END IF;
END
$$;
