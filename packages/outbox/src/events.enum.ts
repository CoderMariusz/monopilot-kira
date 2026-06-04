/**
 * Outbox event type — SINGLE SOURCE OF TRUTH.
 *
 * This enum is AUTHORITATIVE (human decision, side-car foundation audit
 * `_meta/runs/sidecar/reports/foundation-audit.md`). Every event type that the
 * application emits into `public.outbox_events`, AND every event type stored by
 * the DB CHECK constraint `outbox_events_event_type_check`, MUST appear here —
 * either as a canonical `EventType` member or as a `LegacyEventAlias` key that
 * normalizes to a canonical member.
 *
 * Invariants (enforced by the drift gate test, `__tests__/check-drift.test.ts`):
 *   - The set of DB-permitted strings = (canonical values) ∪ (alias keys) =
 *     `DB_EVENT_TYPES`.
 *   - The latest migration's CHECK constraint string set === `DB_EVENT_TYPES`.
 *     So the enum and the DB CHECK can never silently desync again.
 *   - `normalizeEventType` NEVER throws for any string the code emits or the DB
 *     stores — it resolves legacy `fa.*` aliases to their `fg.*` canonical and
 *     passes through every canonical value unchanged.
 *
 * Naming policy:
 *   - `fg.*` is the canonical finished-good lifecycle prefix going forward.
 *   - The four legacy `fa.*` strings that have a `fg.*` equivalent are kept ONLY
 *     as `LegacyEventAlias` entries (the DB historically stored them).
 *   - The remaining `fa.*` strings (built, cascade, core_closed, deleted, …) have
 *     NO `fg.*` equivalent and are stored verbatim by shipped code + the DB, so
 *     they remain canonical members until a dedicated rename migration retires
 *     them. Dropping them here would make `normalizeEventType` throw on rows the
 *     DB already holds (the poison-pill class this change fixes).
 */
export enum EventType {
  AUDIT_RECORDED = 'audit.recorded',
  BOM_INITIAL_VERSION_CREATED = 'bom.initial_version_created',
  BOM_VERSION_SUBMITTED = 'bom.version_submitted',
  BRIEF_COMPLETED_FOR_PROJECT = 'brief.completed_for_project',
  BRIEF_CONVERTED = 'brief.converted',
  BRIEF_CREATED = 'brief.created',
  CATCH_WEIGHT_VARIANCE_EXCEEDED = 'catch_weight.variance_exceeded',
  COMPLIANCE_DOC_DELETED = 'compliance_doc.deleted',
  COMPLIANCE_DOC_EXPIRED = 'compliance_doc.expired',
  COMPLIANCE_DOC_EXPIRING = 'compliance_doc.expiring',
  COMPLIANCE_DOC_UPLOADED = 'compliance_doc.uploaded',
  D365_CACHE_REFRESHED = 'd365.cache.refreshed',
  FA_BUILT = 'fa.built',
  FA_BUILT_RESET = 'fa.built_reset',
  FA_CASCADE = 'fa.cascade',
  FA_CORE_CLOSED = 'fa.core_closed',
  FA_DELETED = 'fa.deleted',
  FA_DEPT_CLOSED = 'fa.dept_closed',
  FA_DEPT_REOPENED = 'fa.dept_reopened',
  FA_RECIPE_CHANGED = 'fa.recipe_changed',
  FA_TEMPLATE_APPLIED = 'fa.template_applied',
  FG_ALLERGENS_CHANGED = 'fg.allergens_changed',
  FG_BOM_RELEASED = 'fg.bom.released',
  FG_CREATED = 'fg.created',
  FG_EDIT = 'fg.edit',
  FG_INTERMEDIATE_CODE_CHANGED = 'fg.intermediate_code_changed',
  FG_RELEASE_BLOCKED = 'fg.release_blocked',
  FG_RELEASED_TO_FACTORY = 'fg.released_to_factory',
  FORMULATION_LOCKED = 'formulation.locked',
  FORMULATION_SUBMITTED_FOR_TRIAL = 'formulation.submitted_for_trial',
  LP_RECEIVED = 'lp.received',
  MANUFACTURING_OPERATIONS_CREATED = 'manufacturing_operations.created',
  MANUFACTURING_OPERATIONS_DEACTIVATED = 'manufacturing_operations.deactivated',
  MANUFACTURING_OPERATIONS_RESET_TO_SEED = 'manufacturing_operations.reset_to_seed',
  MANUFACTURING_OPERATIONS_UPDATED = 'manufacturing_operations.updated',
  NPD_ALLERGENS_BULK_REBUILD_COMPLETED = 'npd.allergens.bulk_rebuild_completed',
  NPD_BUILDER_RELEASED_RECORDS_CREATED = 'npd.builder.released_records_created',
  NPD_FG_CANDIDATE_MAPPED = 'npd.fg_candidate_mapped',
  NPD_GATE_ADVANCED = 'npd.gate.advanced',
  NPD_GATE_APPROVED = 'npd.gate.approved',
  NPD_GATE_REVERTED = 'npd.gate.reverted',
  NPD_PROJECT_BRIEF_MAPPED = 'npd.project.brief_mapped',
  NPD_PROJECT_CREATED = 'npd.project.created',
  NPD_PROJECT_LEGACY_STAGES_CLOSED = 'npd.project.legacy_stages_closed',
  NPD_PROJECT_RELEASE_REQUESTED = 'npd.project.release_requested',
  ONBOARDING_FIRST_WO_RECORDED = 'onboarding.first_wo_recorded',
  QUALITY_ATP_SWAB_FAILED = 'quality.atp_swab_failed',
  ONBOARDING_STEP_ADVANCE = 'onboarding.step.advance',
  ONBOARDING_STEP_BACK = 'onboarding.step.back',
  ONBOARDING_STEP_JUMP = 'onboarding.step.jump',
  ONBOARDING_STEP_RESTART = 'onboarding.step.restart',
  ONBOARDING_STEP_SKIP = 'onboarding.step.skip',
  ORG_CREATED = 'org.created',
  ORG_MFA_ENROLLMENT_FORCED = 'org.mfa_enrollment.forced',
  ORG_SECURITY_POLICY_UPDATED = 'org.security_policy.updated',
  // 08-production lifecycle + waste/downtime/changeover/OEE events (PRD 08-PRODUCTION §6/§12/§13;
  // canonical event table in the MON-domain-production skill). 08 is the sole emitter of these.
  PRODUCTION_ALLERGEN_CHANGEOVER_VALIDATED = 'production.allergen_changeover.validated',
  PRODUCTION_CHANGEOVER_SIGNED = 'production.changeover.signed',
  PRODUCTION_CONSUME_BLOCKED = 'production.consume.blocked',
  PRODUCTION_CONSUME_COMPLETED = 'production.consume.completed',
  PRODUCTION_DOWNTIME_RECORDED = 'production.downtime.recorded',
  PRODUCTION_OEE_SNAPSHOT = 'production.oee.snapshot',
  PRODUCTION_OUTPUT_RECORDED = 'production.output.recorded',
  PRODUCTION_WASTE_RECORDED = 'production.waste.recorded',
  PRODUCTION_WO_CLOSED = 'production.wo.closed',
  PRODUCTION_WO_COMPLETED = 'production.wo.completed',
  PRODUCTION_WO_STARTED = 'production.wo.started',
  QUALITY_RECORDED = 'quality.recorded',
  REFERENCE_ALLERGENS_ADDED_BY_PROCESS_BULK_CHANGED = 'reference.allergens_added_by_process.bulk_changed',
  REFERENCE_ALLERGENS_BY_RM_BULK_CHANGED = 'reference.allergens_by_rm.bulk_changed',
  REFERENCE_CSV_COMMITTED = 'reference.csv.committed',
  REFERENCE_ROW_SOFT_DELETED = 'reference.row.soft_deleted',
  REFERENCE_ROW_UPSERTED = 'reference.row.upserted',
  RISK_CREATED = 'risk.created',
  ROLE_ASSIGNED = 'role.assigned',
  RULE_DEPLOYED = 'rule.deployed',
  SETTINGS_CORE_FLAG_UPDATED = 'settings.core_flag.updated',
  SETTINGS_D365_SYNC_UPDATED = 'settings.d365_sync.updated',
  SETTINGS_DEPT_OVERRIDE_UPDATED = 'settings.dept_override.updated',
  SETTINGS_IP_ALLOWLIST_CHANGED = 'settings.ip_allowlist.changed',
  SETTINGS_LINE_UPSERTED = 'settings.line.upserted',
  SETTINGS_LOCATION_DELETED = 'settings.location.deleted',
  SETTINGS_LOCATION_IMPORTED = 'settings.location.imported',
  SETTINGS_LOCATION_UPSERTED = 'settings.location.upserted',
  SETTINGS_MACHINE_UPSERTED = 'settings.machine.upserted',
  SETTINGS_MODULE_DISABLED = 'settings.module.disabled',
  SETTINGS_MODULE_ENABLED = 'settings.module.enabled',
  SETTINGS_MODULE_TOGGLED = 'settings.module.toggled',
  SETTINGS_NOTIFICATION_CHANNEL_UPDATED = 'settings.notification_channel_updated',
  SETTINGS_NOTIFICATION_DIGEST_UPDATED = 'settings.notification_digest_updated',
  SETTINGS_NOTIFICATION_RULE_UPDATED = 'settings.notification_rule_updated',
  SETTINGS_ORG_CREATED = 'settings.org.created',
  SETTINGS_ORG_UPDATED = 'settings.org.updated',
  SETTINGS_REFERENCE_ROW_UPDATED = 'settings.reference.row_updated',
  SETTINGS_ROLE_ASSIGNED = 'settings.role.assigned',
  SETTINGS_RULE_VARIANT_UPDATED = 'settings.rule_variant.updated',
  SETTINGS_RULE_DEPLOYED = 'settings.rule.deployed',
  SETTINGS_SCHEMA_MIGRATION_REQUESTED = 'settings.schema.migration_requested',
  SETTINGS_SCIM_TOKEN_CREATED = 'settings.scim.token_created',
  SETTINGS_SSO_CONFIG_CHANGED = 'settings.sso.config_changed',
  SETTINGS_UPGRADE_COMPLETED = 'settings.upgrade.completed',
  SETTINGS_UPGRADE_PROMOTED = 'settings.upgrade.promoted',
  SETTINGS_UPGRADE_ROLLED_BACK = 'settings.upgrade.rolled_back',
  SETTINGS_UPGRADE_SCHEDULED = 'settings.upgrade.scheduled',
  SETTINGS_USER_ACCEPTED = 'settings.user.accepted',
  SETTINGS_USER_DEACTIVATED = 'settings.user.deactivated',
  SETTINGS_USER_INVITATION_RESENT = 'settings.user.invitation_resent',
  SETTINGS_USER_INVITED = 'settings.user.invited',
  SETTINGS_WAREHOUSE_DEACTIVATED = 'settings.warehouse.deactivated',
  SHIPMENT_CREATED = 'shipment.created',
  TECHNICAL_FACTORY_SPEC_APPROVED = 'technical.factory_spec.approved',
  TENANT_COHORT_ADVANCED = 'tenant.cohort.advanced',
  TENANT_MIGRATION_RUN = 'tenant.migration.run',
  TENANT_MIGRATION_RUN_FAILED = 'tenant.migration.run.failed',
  UNIT_OF_MEASURE_CONVERSION_CREATED = 'unit_of_measure.conversion_created',
  UNIT_OF_MEASURE_CREATED = 'unit_of_measure.created',
  UNIT_OF_MEASURE_SOFT_DELETED = 'unit_of_measure.soft_deleted',
  USER_INVITED = 'user.invited',
  // 05-warehouse LP lifecycle events (PRD 05-WAREHOUSE §7.6, §11.4; producer prefix warehouse.*).
  // 05-warehouse is the sole emitter. Consumers: 08-production, 06-scanner, 09-quality,
  // 10-finance (FIFO/WAC valuation), 11-shipping, 12-reporting, 15-OEE.
  WAREHOUSE_LP_RECEIVED = 'warehouse.lp.received',
  WAREHOUSE_LP_TRANSITIONED = 'warehouse.lp.transitioned',
  WAREHOUSE_MATERIAL_CONSUMED = 'warehouse.material.consumed',
  WAREHOUSE_LP_SHIPPED = 'warehouse.lp.shipped',
  WO_READY = 'wo.ready',
}

/**
 * Locked settings event group (T-003). Subset of `EventType` — referenced by the
 * settings module sign-off contract.
 */
export const ALL_SETTINGS_EVENTS = [
  EventType.SETTINGS_ORG_CREATED,
  EventType.SETTINGS_ORG_UPDATED,
  EventType.SETTINGS_USER_INVITED,
  EventType.SETTINGS_USER_ACCEPTED,
  EventType.SETTINGS_USER_DEACTIVATED,
  EventType.SETTINGS_ROLE_ASSIGNED,
  EventType.SETTINGS_MODULE_TOGGLED,
  EventType.SETTINGS_REFERENCE_ROW_UPDATED,
  EventType.SETTINGS_SCHEMA_MIGRATION_REQUESTED,
  EventType.SETTINGS_RULE_DEPLOYED,
  EventType.SETTINGS_NOTIFICATION_RULE_UPDATED,
  EventType.SETTINGS_NOTIFICATION_CHANNEL_UPDATED,
  EventType.SETTINGS_NOTIFICATION_DIGEST_UPDATED,
  EventType.SETTINGS_SSO_CONFIG_CHANGED,
  EventType.SETTINGS_SCIM_TOKEN_CREATED,
] as const;

/**
 * Locked 08-production event group. Subset of `EventType` — the canonical
 * production lifecycle + waste/downtime/changeover/OEE vocabulary that
 * 08-production (and ONLY 08-production) emits. Referenced by the production
 * module sign-off contract; 15-OEE is a read-only consumer of `production.oee.snapshot`.
 */
export const ALL_PRODUCTION_EVENTS = [
  EventType.PRODUCTION_WO_STARTED,
  EventType.PRODUCTION_WO_COMPLETED,
  EventType.PRODUCTION_WO_CLOSED,
  EventType.PRODUCTION_OUTPUT_RECORDED,
  EventType.PRODUCTION_WASTE_RECORDED,
  EventType.PRODUCTION_DOWNTIME_RECORDED,
  EventType.PRODUCTION_CONSUME_COMPLETED,
  EventType.PRODUCTION_CONSUME_BLOCKED,
  EventType.PRODUCTION_CHANGEOVER_SIGNED,
  EventType.PRODUCTION_ALLERGEN_CHANGEOVER_VALIDATED,
  EventType.PRODUCTION_OEE_SNAPSHOT,
] as const;

/**
 * Locked 05-warehouse event group. Subset of `EventType` — the canonical License Plate (LP)
 * lifecycle vocabulary that 05-warehouse (and ONLY 05-warehouse) emits. warehouse.material.consumed
 * is emitted ONLY after the 09-quality T-064 consume gate passes. Referenced by the warehouse
 * module sign-off contract.
 */
export const ALL_WAREHOUSE_EVENTS = [
  EventType.WAREHOUSE_LP_RECEIVED,
  EventType.WAREHOUSE_LP_TRANSITIONED,
  EventType.WAREHOUSE_MATERIAL_CONSUMED,
  EventType.WAREHOUSE_LP_SHIPPED,
] as const;

/**
 * Legacy `fa.*` event strings that the DB historically stored and that shipped
 * code still emits. Each normalizes to its canonical `fg.*` member. These keys
 * are part of the DB-permitted set (`DB_EVENT_TYPES`) but are NOT canonical enum
 * members — `normalizeEventType` rewrites them on the way through the worker.
 */
export const LegacyEventAlias = {
  'fa.created': EventType.FG_CREATED,
  'fa.allergens_changed': EventType.FG_ALLERGENS_CHANGED,
  'fa.intermediate_code_changed': EventType.FG_INTERMEDIATE_CODE_CHANGED,
  'fa.edit': EventType.FG_EDIT,
} as const;

export const ALL_EVENTS = Object.values(EventType) as readonly EventType[];

export const ALL_EVENT_ALIASES = LegacyEventAlias;

/**
 * Every string the DB CHECK constraint must permit: the canonical enum values
 * PLUS the legacy alias keys (which are stored verbatim by older rows + code).
 * The drift gate asserts the latest migration's CHECK string set === this set.
 */
export const DB_EVENT_TYPES: readonly string[] = [
  ...ALL_EVENTS,
  ...(Object.keys(LegacyEventAlias) as readonly string[]),
];

const canonicalEvents = new Set<string>(ALL_EVENTS);

export function normalizeEventType(input: string): EventType {
  if (canonicalEvents.has(input)) {
    return input as EventType;
  }

  if (input in LegacyEventAlias) {
    return LegacyEventAlias[input as keyof typeof LegacyEventAlias];
  }

  throw new Error(`Unknown event type: ${input}`);
}
