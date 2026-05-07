-- Migration 023 — T-039: extend outbox_events_event_type_check constraint
-- Adds three tenant-canary-upgrade event types required by T-039 Server Actions:
--   - tenant.migration.run         (recordMigrationRun success)
--   - tenant.migration.run.failed  (recordMigrationRun failure)
--   - tenant.cohort.advanced       (advanceCohort emits one per advanced tenant)
--
-- The original 12-event CHECK from 003-outbox.sql is preserved; this migration
-- replaces it with a broader 15-event CHECK. SQLSTATE 23514 still gates unknown
-- event_type values (validated by AC2 #3 in T-039 RED).
--
-- Note: T-039 does NOT auto-seed the org.platform.admin role on org INSERT.
-- The role is system-scoped and granted out-of-band per task spec; tests seed
-- it manually via owner connection (matches T-014 RED-test pattern).

ALTER TABLE public.outbox_events
  DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;

ALTER TABLE public.outbox_events
  ADD CONSTRAINT outbox_events_event_type_check CHECK (
    event_type IN (
      -- 12 original (003-outbox.sql)
      'org.created',
      'user.invited',
      'role.assigned',
      'audit.recorded',
      'brief.created',
      'fg.created',
      'fg.allergens_changed',
      'fg.intermediate_code_changed',
      'lp.received',
      'wo.ready',
      'quality.recorded',
      'shipment.created',
      -- 3 new (T-039)
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'tenant.cohort.advanced'
    )
  );

COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
  IS 'T-039: extends 003-outbox.sql 12-event CHECK with tenant.migration.run, tenant.migration.run.failed, tenant.cohort.advanced.';
