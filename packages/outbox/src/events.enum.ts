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
}

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
