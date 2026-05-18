export enum EventType {
  ORG_CREATED = 'org.created',
  USER_INVITED = 'user.invited',
  ROLE_ASSIGNED = 'role.assigned',
  AUDIT_RECORDED = 'audit.recorded',
  BRIEF_CREATED = 'brief.created',
  FG_CREATED = 'fg.created',
  FG_ALLERGENS_CHANGED = 'fg.allergens_changed',
  FG_INTERMEDIATE_CODE_CHANGED = 'fg.intermediate_code_changed',
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
  SETTINGS_SSO_CONFIG_CHANGED = 'settings.sso.config_changed',
  SETTINGS_SCIM_TOKEN_CREATED = 'settings.scim.token_created',
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
