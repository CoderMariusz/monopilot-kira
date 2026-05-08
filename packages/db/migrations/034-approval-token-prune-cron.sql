-- Migration 034 — Slot F-4: prune cron for consumed_approval_tokens.
--
-- Problem:
--   Migration 033 installed `public.consumed_approval_tokens` to defeat
--   replay of approval tokens, but did not provide a sweep. Token TTL is
--   5 minutes; rows older than 30 days are vestigial and should be pruned
--   so the table stays bounded over the lifetime of the deployment.
--
-- Strategy:
--   * Define `public.prune_consumed_approval_tokens()` — a small DELETE.
--   * Schedule it daily at 03:00 UTC via pg_cron.
--   * Wrap the schedule in a `pg_extension` guard so the migration is a
--     no-op on environments without pg_cron (e.g. local docker-compose or
--     CI Postgres images that don't ship pg_cron). The function itself is
--     always created, so operators on those environments can still invoke
--     it manually (or via their own scheduler).
--
-- Index rationale:
--   The (org_id, consumed_at) index from 033 covers the prune predicate
--   (consumed_at < cutoff) — the planner picks the index even though the
--   DELETE doesn't restrict by org_id, because consumed_at is the trailing
--   key on a small table. No new index needed.

-- 1. Pruning function: deletes tokens older than 30 days.
CREATE OR REPLACE FUNCTION public.prune_consumed_approval_tokens()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  DELETE FROM public.consumed_approval_tokens
   WHERE consumed_at < now() - interval '30 days';
$$;

-- Lock down the function — only the migration owner can grant execute. We do
-- NOT grant execute to app_user; the prune is a control-plane job.
REVOKE ALL ON FUNCTION public.prune_consumed_approval_tokens() FROM PUBLIC;

-- 2. Schedule via pg_cron — guarded so the migration succeeds on environments
--    without pg_cron installed (the schedule is then operator-installed when
--    the extension is added later).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- cron.schedule is idempotent on (jobname): re-running this migration
    -- replaces the prior schedule entry with the same jobname rather than
    -- creating duplicates.
    PERFORM cron.schedule(
      'prune_consumed_approval_tokens_daily',
      '0 3 * * *',
      $cron$ SELECT public.prune_consumed_approval_tokens(); $cron$
    );
  END IF;
END
$$;
