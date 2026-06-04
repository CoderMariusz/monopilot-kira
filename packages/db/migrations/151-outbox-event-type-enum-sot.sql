-- Migration 151: outbox event_type CHECK — regenerate from the AUTHORITATIVE enum.
-- Human decision (side-car foundation audit
-- `_meta/runs/sidecar/reports/foundation-audit.md`): make
-- `packages/outbox/src/events.enum.ts` the single source of truth for outbox
-- event types and derive the DB CHECK from it.
--
-- Why this exists: three vocabularies had silently desynced —
--   (a) the TS enum (events.enum.ts),
--   (b) the DB CHECK `outbox_events_event_type_check` (migration 147 = 82 events),
--   (c) the strings actually emitted by shipped Server Actions.
-- 24 event types were EMITTED by shipped code (and would be stored) but were
-- ABSENT from migration 147's CHECK, so those inserts failed the constraint; and
-- the cron worker's `normalizeEventType` threw on legacy `fa.*` rows the DB held,
-- producing a head-of-line poison-pill that blocked the whole outbox queue.
--
-- This migration recreates the CHECK as the FULL enum-derived union:
--   DB_EVENT_TYPES = (canonical EventType values) ∪ (LegacyEventAlias keys)
-- It is a STRICT SUPERSET of migration 147 (no event is ever dropped) and is
-- kept in lockstep with the enum by the drift gate
-- `packages/outbox/src/__tests__/check-drift.test.ts`.
--
-- Idempotent: drop-if-exists + recreate.
-- Wave0 lock: org_id business scope; outbox is org-scoped via app.current_org_id().

alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'audit.recorded',
      'bom.initial_version_created',
      'bom.version_submitted',
      'brief.completed_for_project',
      'brief.converted',
      'brief.created',
      'compliance_doc.deleted',
      'compliance_doc.expired',
      'compliance_doc.expiring',
      'compliance_doc.uploaded',
      'd365.cache.refreshed',
      'fa.allergens_changed',
      'fa.built',
      'fa.built_reset',
      'fa.cascade',
      'fa.core_closed',
      'fa.created',
      'fa.deleted',
      'fa.dept_closed',
      'fa.dept_reopened',
      'fa.edit',
      'fa.intermediate_code_changed',
      'fa.recipe_changed',
      'fa.template_applied',
      'fg.allergens_changed',
      'fg.bom.released',
      'fg.created',
      'fg.edit',
      'fg.intermediate_code_changed',
      'fg.release_blocked',
      'fg.released_to_factory',
      'formulation.locked',
      'formulation.submitted_for_trial',
      'lp.received',
      'manufacturing_operations.created',
      'manufacturing_operations.deactivated',
      'manufacturing_operations.reset_to_seed',
      'manufacturing_operations.updated',
      'npd.allergens.bulk_rebuild_completed',
      'npd.builder.released_records_created',
      'npd.fg_candidate_mapped',
      'npd.gate.advanced',
      'npd.gate.approved',
      'npd.gate.reverted',
      'npd.project.brief_mapped',
      'npd.project.created',
      'npd.project.legacy_stages_closed',
      'npd.project.release_requested',
      'onboarding.first_wo_recorded',
      'onboarding.step.advance',
      'onboarding.step.back',
      'onboarding.step.jump',
      'onboarding.step.restart',
      'onboarding.step.skip',
      'org.created',
      'org.mfa_enrollment.forced',
      'org.security_policy.updated',
      'quality.recorded',
      'reference.allergens_added_by_process.bulk_changed',
      'reference.allergens_by_rm.bulk_changed',
      'reference.csv.committed',
      'reference.row.soft_deleted',
      'reference.row.upserted',
      'risk.created',
      'role.assigned',
      'rule.deployed',
      'settings.core_flag.updated',
      'settings.dept_override.updated',
      'settings.ip_allowlist.changed',
      'settings.line.upserted',
      'settings.location.imported',
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.module.disabled',
      'settings.module.enabled',
      'settings.module.toggled',
      'settings.notification_channel_updated',
      'settings.notification_digest_updated',
      'settings.notification_rule_updated',
      'settings.org.created',
      'settings.org.updated',
      'settings.reference.row_updated',
      'settings.role.assigned',
      'settings.rule.deployed',
      'settings.rule_variant.updated',
      'settings.schema.migration_requested',
      'settings.scim.token_created',
      'settings.sso.config_changed',
      'settings.upgrade.completed',
      'settings.upgrade.promoted',
      'settings.upgrade.rolled_back',
      'settings.upgrade.scheduled',
      'settings.user.accepted',
      'settings.user.deactivated',
      'settings.user.invitation_resent',
      'settings.user.invited',
      'settings.warehouse.deactivated',
      'shipment.created',
      'technical.factory_spec.approved',
      'tenant.cohort.advanced',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'unit_of_measure.conversion_created',
      'unit_of_measure.created',
      'unit_of_measure.soft_deleted',
      'user.invited',
      'wo.ready'
    )
  );
