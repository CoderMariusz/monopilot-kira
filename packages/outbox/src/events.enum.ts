export enum EventType {
  ORG_CREATED = 'org.created',
  USER_INVITED = 'user.invited',
  ROLE_ASSIGNED = 'role.assigned',
  AUDIT_RECORDED = 'audit.recorded',
  BRIEF_CREATED = 'brief.created',
  FG_CREATED = 'fg.created',
  FG_ALLERGENS_CHANGED = 'fg.allergens_changed',
  FG_INTERMEDIATE_CODE_CHANGED = 'fg.intermediate_code_changed',
  RISK_CREATED = 'risk.created',
  COMPLIANCE_DOC_UPLOADED = 'compliance_doc.uploaded',
  COMPLIANCE_DOC_DELETED = 'compliance_doc.deleted',
  COMPLIANCE_DOC_EXPIRING = 'compliance_doc.expiring',
  COMPLIANCE_DOC_EXPIRED = 'compliance_doc.expired',
  BOM_INITIAL_VERSION_CREATED = 'bom.initial_version_created',
  FG_BOM_RELEASED = 'fg.bom.released',
  BOM_VERSION_SUBMITTED = 'bom.version_submitted',
  LP_RECEIVED = 'lp.received',
  WO_READY = 'wo.ready',
  QUALITY_RECORDED = 'quality.recorded',
  SHIPMENT_CREATED = 'shipment.created',
  // T-039 — canary upgrade orchestration
  TENANT_MIGRATION_RUN = 'tenant.migration.run',
  TENANT_MIGRATION_RUN_FAILED = 'tenant.migration.run.failed',
  TENANT_COHORT_ADVANCED = 'tenant.cohort.advanced',

  // T-003 — settings outbox events
  SETTINGS_ORG_CREATED = 'settings.org.created',
  SETTINGS_ORG_UPDATED = 'settings.org.updated',
  SETTINGS_USER_INVITED = 'settings.user.invited',
  SETTINGS_USER_ACCEPTED = 'settings.user.accepted',
  SETTINGS_USER_DEACTIVATED = 'settings.user.deactivated',
  SETTINGS_ROLE_ASSIGNED = 'settings.role.assigned',
  SETTINGS_MODULE_TOGGLED = 'settings.module.toggled',
  SETTINGS_REFERENCE_ROW_UPDATED = 'settings.reference.row_updated',
  SETTINGS_SCHEMA_MIGRATION_REQUESTED = 'settings.schema.migration_requested',
  SETTINGS_RULE_DEPLOYED = 'settings.rule.deployed',
  SETTINGS_NOTIFICATION_RULE_UPDATED = 'settings.notification_rule_updated',
  SETTINGS_NOTIFICATION_CHANNEL_UPDATED = 'settings.notification_channel_updated',
  SETTINGS_NOTIFICATION_DIGEST_UPDATED = 'settings.notification_digest_updated',
  SETTINGS_SSO_CONFIG_CHANGED = 'settings.sso.config_changed',
  SETTINGS_SCIM_TOKEN_CREATED = 'settings.scim.token_created',
  REFERENCE_ALLERGENS_BY_RM_BULK_CHANGED = 'reference.allergens_by_rm.bulk_changed',
  REFERENCE_ALLERGENS_ADDED_BY_PROCESS_BULK_CHANGED = 'reference.allergens_added_by_process.bulk_changed',
  NPD_ALLERGENS_BULK_REBUILD_COMPLETED = 'npd.allergens.bulk_rebuild_completed',
  NPD_FG_CANDIDATE_MAPPED = 'npd.fg_candidate_mapped',
  NPD_GATE_ADVANCED = 'npd.gate.advanced',
  NPD_GATE_APPROVED = 'npd.gate.approved',
  NPD_GATE_REVERTED = 'npd.gate.reverted',
}

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

export const LegacyEventAlias = {
  'fa.created': EventType.FG_CREATED,
  'fa.allergens_changed': EventType.FG_ALLERGENS_CHANGED,
  'fa.intermediate_code_changed': EventType.FG_INTERMEDIATE_CODE_CHANGED,
} as const;

export const ALL_EVENTS = Object.values(EventType) as readonly EventType[];

export const ALL_EVENT_ALIASES = LegacyEventAlias;

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
