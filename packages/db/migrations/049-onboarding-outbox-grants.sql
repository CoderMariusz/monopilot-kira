-- Migration 049: onboarding Server Action outbox events + app_user grants
-- Context: SET-001..006 onboarding actions emit onboarding.step.* and
-- onboarding.first_wo_recorded through public.outbox_events inside the
-- app_user RLS transaction. Earlier outbox migrations created the table and
-- policy but did not grant table/sequence privileges to app_user or include
-- onboarding event types in the CHECK constraint, causing fail-closed
-- persistence during Preview runtime smoke.

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
      -- Wave 4 settings + rules (047-outbox-events-settings-rules.sql)
      'settings.schema.migration_requested',
      'settings.rule.deployed',
      'rule.deployed',
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.line.upserted',
      'settings.warehouse.deactivated',
      -- SET-001..006 onboarding Server Actions (apps/web/actions/onboarding/advance.ts)
      'onboarding.step.advance',
      'onboarding.step.back',
      'onboarding.step.skip',
      'onboarding.step.jump',
      'onboarding.step.restart',
      'onboarding.first_wo_recorded'
    )
  );

COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
  IS 'Adds SET-001..006 onboarding transition events while preserving prior outbox event types.';

REVOKE ALL ON public.outbox_events FROM PUBLIC;
GRANT SELECT, INSERT ON public.outbox_events TO app_user;
GRANT USAGE, SELECT ON SEQUENCE public.outbox_events_id_seq TO app_user;

-- The onboarding Server Actions call mutateOnboarding(), which authorizes via
-- settings.onboarding.complete. Keep both RBAC storage variants in sync because
-- older Wave tasks read roles.permissions JSONB while newer tasks normalize
-- through role_permissions.
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, 'settings.onboarding.complete'
FROM public.roles r
WHERE r.code IN ('org.access.admin', 'org.platform.admin')
   OR r.slug IN ('org.access.admin', 'org.platform.admin')
ON CONFLICT DO NOTHING;

UPDATE public.roles r
SET permissions = CASE
  WHEN coalesce(r.permissions, '[]'::jsonb) ? 'settings.onboarding.complete'
    THEN coalesce(r.permissions, '[]'::jsonb)
  ELSE coalesce(r.permissions, '[]'::jsonb) || to_jsonb('settings.onboarding.complete'::text)
END
WHERE r.code IN ('org.access.admin', 'org.platform.admin')
   OR r.slug IN ('org.access.admin', 'org.platform.admin');
