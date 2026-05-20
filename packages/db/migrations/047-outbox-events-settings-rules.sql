-- Migration 045 — Wave 4 Settings + Rules outbox event types
-- Adds three event types required by the Settings Server Actions and the
-- rules CI deploy script:
--   - settings.schema.migration_requested  (T-023 V-SET-03 L1 promotion queue)
--   - settings.rule.deployed               (T-026 rules-deploy CLI audit emit)
--   - rule.deployed                        (T-026 rules-deploy CLI canonical name)
--
-- These are listed in §6.7 / §7.3 of docs/prd/02-SETTINGS-PRD.md and need to be
-- accepted by the outbox CHECK so the transactional emit does not 23514.
-- Existing event types from 003-outbox.sql + 023-outbox-events-extension.sql
-- are preserved verbatim.

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
      -- 3 from T-039 (023-outbox-events-extension.sql)
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'tenant.cohort.advanced',
      -- 3 new (Wave 4 settings + rules)
      'settings.schema.migration_requested',
      'settings.rule.deployed',
      'rule.deployed',
      -- T-029 infrastructure CRUD Server Action events
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.line.upserted',
      'settings.warehouse.deactivated'
    )
  );

COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
  IS 'Wave4: adds settings schema/rule events plus T-029 infrastructure CRUD mutation events.';
