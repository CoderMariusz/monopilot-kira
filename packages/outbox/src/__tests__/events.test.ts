import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');
const eventsModulePath = resolve(repoRoot, 'packages/outbox/src/events.enum.ts');
const codeownersPath = resolve(repoRoot, 'CODEOWNERS');
const expectedSettingsEvents = [
  'settings.org.created',
  'settings.org.updated',
  'settings.user.invited',
  'settings.user.accepted',
  'settings.user.deactivated',
  'settings.role.assigned',
  'settings.module.toggled',
  'settings.reference.row_updated',
  'settings.schema.migration_requested',
  'settings.rule.deployed',
  'settings.notification_rule_updated',
  'settings.notification_channel_updated',
  'settings.notification_digest_updated',
  'settings.sso.config_changed',
  'settings.scim.token_created',
] as const;

// Canonical events that MUST be present in the authoritative enum. This is a
// representative coverage subset (the full set is enforced against the DB CHECK
// by check-drift.test.ts), spanning the foundation, settings, NPD and the
// legacy fa.* lifecycle strings the DB still stores.
const expectedCanonicalEvents = [
  'org.created',
  'user.invited',
  'role.assigned',
  'audit.recorded',
  'brief.created',
  'fg.created',
  'fg.allergens_changed',
  'fg.intermediate_code_changed',
  'fg.edit',
  'fg.release_blocked',
  'fg.released_to_factory',
  'risk.created',
  'compliance_doc.uploaded',
  'compliance_doc.deleted',
  'compliance_doc.expiring',
  'compliance_doc.expired',
  'bom.initial_version_created',
  'fg.bom.released',
  'bom.version_submitted',
  'lp.received',
  'wo.ready',
  'quality.recorded',
  'shipment.created',
  // Legacy fa.* lifecycle strings with NO fg.* equivalent — emitted by shipped
  // code and stored by the DB, so they remain canonical enum members.
  'fa.built',
  'fa.cascade',
  'fa.core_closed',
  'fa.deleted',
  'fa.dept_closed',
  'fa.recipe_changed',
  'fa.template_applied',
  // T-039 — canary upgrade orchestration
  'tenant.migration.run',
  'tenant.migration.run.failed',
  'tenant.cohort.advanced',
  // T-003 — settings outbox events
  ...expectedSettingsEvents,
  'reference.allergens_by_rm.bulk_changed',
  'reference.allergens_added_by_process.bulk_changed',
  'npd.allergens.bulk_rebuild_completed',
  'npd.fg_candidate_mapped',
  'npd.gate.advanced',
  'npd.gate.approved',
  'npd.gate.reverted',
] as const;

type EventsModule = {
  EventType: Record<string, string>;
  LegacyEventAlias: Record<string, string>;
  ALL_EVENTS: readonly string[];
  ALL_EVENT_ALIASES: Readonly<Record<string, string>>;
  ALL_SETTINGS_EVENTS: readonly string[];
  DB_EVENT_TYPES: readonly string[];
  normalizeEventType: (input: string) => string;
};

async function loadEventsModule(): Promise<EventsModule> {
  expect(
    existsSync(eventsModulePath),
    'packages/outbox/src/events.enum.ts must exist as the single event type source of truth',
  ).toBe(true);

  return (await import(eventsModulePath)) as EventsModule;
}

describe('outbox event type source of truth', () => {
  it('exports the canonical foundation, settings and legacy event values without duplicates', async () => {
    const { ALL_EVENTS, EventType } = await loadEventsModule();

    // ENUM-AUTHORITATIVE: ALL_EVENTS is the canonical superset. It MUST contain
    // every expected canonical event (exact full-set equality is enforced
    // against the DB CHECK by check-drift.test.ts).
    for (const eventType of expectedCanonicalEvents) {
      expect(ALL_EVENTS, `missing canonical event ${eventType}`).toContain(eventType);
      expect(Object.values(EventType)).toContain(eventType);
    }
    expect(new Set(ALL_EVENTS).size).toBe(ALL_EVENTS.length);
  });

  it('exports the locked settings event group with valid unique strings', async () => {
    const { ALL_EVENTS, ALL_SETTINGS_EVENTS, EventType } = await loadEventsModule();

    expect(ALL_SETTINGS_EVENTS).toEqual(expectedSettingsEvents);
    expect(new Set(ALL_SETTINGS_EVENTS).size).toBe(ALL_SETTINGS_EVENTS.length);

    for (const eventType of ALL_SETTINGS_EVENTS) {
      expect(eventType).toMatch(/^settings\.[a-z_]+(?:\.[a-z_]+)?$/);
      expect(ALL_EVENTS).toContain(eventType);
      expect(Object.values(EventType)).toContain(eventType);
    }
  });

  it('keeps all canonical event values in the locked lowercase dotted format', async () => {
    const { ALL_EVENTS } = await loadEventsModule();

    // Lowercase dotted segments; digits permitted (e.g. d365.cache.refreshed),
    // which the DB CHECK has stored since migration 147.
    for (const eventType of ALL_EVENTS) {
      expect(eventType).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/);
    }
  });

  it('uses fg.* as the canonical finished-good lifecycle prefix and keeps aliased fa.* OUT of the enum', async () => {
    const { ALL_EVENTS, EventType } = await loadEventsModule();

    // fg.* is the canonical lifecycle prefix going forward.
    expect(EventType.FG_CREATED).toBe('fg.created');
    expect(EventType.FG_ALLERGENS_CHANGED).toBe('fg.allergens_changed');
    expect(EventType.FG_INTERMEDIATE_CODE_CHANGED).toBe('fg.intermediate_code_changed');
    expect(EventType.FG_EDIT).toBe('fg.edit');

    expect(ALL_EVENTS).toContain('fg.created');
    expect(ALL_EVENTS).toContain('fg.allergens_changed');
    expect(ALL_EVENTS).toContain('fg.intermediate_code_changed');
    expect(ALL_EVENTS).toContain('fg.edit');

    // The four fa.* strings that HAVE an fg.* equivalent are aliases only — they
    // must NOT appear as canonical enum members.
    expect(ALL_EVENTS).not.toContain('fa.created');
    expect(ALL_EVENTS).not.toContain('fa.allergens_changed');
    expect(ALL_EVENTS).not.toContain('fa.intermediate_code_changed');
    expect(ALL_EVENTS).not.toContain('fa.edit');

    // No product.* events exist in either form.
    expect(Object.values(EventType).some((eventType) => eventType.startsWith('product.'))).toBe(false);
    expect(ALL_EVENTS.some((eventType) => eventType.startsWith('product.'))).toBe(false);
  });

  it('keeps the legacy fa.* lifecycle strings (no fg.* equivalent) as canonical members the DB stores', async () => {
    const { ALL_EVENTS } = await loadEventsModule();

    // These fa.* events are emitted by shipped code and stored by the DB CHECK;
    // they MUST be canonical so normalizeEventType never throws on them (the
    // poison-pill class). They have no fg.* rename target yet.
    for (const ev of [
      'fa.built',
      'fa.built_reset',
      'fa.cascade',
      'fa.core_closed',
      'fa.deleted',
      'fa.dept_closed',
      'fa.dept_reopened',
      'fa.recipe_changed',
      'fa.template_applied',
    ]) {
      expect(ALL_EVENTS, `legacy fa.* event ${ev} must be a canonical member`).toContain(ev);
    }
  });

  it('keeps fa.* only as explicit migration aliases that normalize to fg.*', async () => {
    const { ALL_EVENT_ALIASES, LegacyEventAlias, normalizeEventType } = await loadEventsModule();

    expect(LegacyEventAlias).toEqual({
      'fa.created': 'fg.created',
      'fa.allergens_changed': 'fg.allergens_changed',
      'fa.intermediate_code_changed': 'fg.intermediate_code_changed',
      'fa.edit': 'fg.edit',
    });
    expect(ALL_EVENT_ALIASES).toEqual(LegacyEventAlias);

    expect(normalizeEventType('fa.created')).toBe('fg.created');
    expect(normalizeEventType('fa.allergens_changed')).toBe('fg.allergens_changed');
    expect(normalizeEventType('fa.intermediate_code_changed')).toBe('fg.intermediate_code_changed');
    expect(normalizeEventType('fa.edit')).toBe('fg.edit');
  });

  it('normalizes canonical values unchanged and rejects unknown free-form strings', async () => {
    const { ALL_EVENTS, normalizeEventType } = await loadEventsModule();

    for (const eventType of ALL_EVENTS) {
      expect(normalizeEventType(eventType)).toBe(eventType);
    }

    expect(() => normalizeEventType('fa.unknown')).toThrow(/unknown|unsupported|invalid/i);
    expect(() => normalizeEventType('product.created')).toThrow(/unknown|unsupported|invalid/i);
    expect(() => normalizeEventType('fg.deleted')).toThrow(/unknown|unsupported|invalid/i);
  });

  it('never throws for any event the code emits or the DB stores (regression: the 32 previously-throwing events)', async () => {
    const { normalizeEventType, DB_EVENT_TYPES } = await loadEventsModule();

    // Every string the DB CHECK permits must resolve cleanly — this is the
    // poison-pill guarantee. Includes the formerly-unknown legacy + new events.
    for (const ev of DB_EVENT_TYPES) {
      expect(() => normalizeEventType(ev), `normalizeEventType threw on ${ev}`).not.toThrow();
    }

    // Spot-check a sample of events that used to throw before this change:
    // legacy fa.* aliases, non-aliased legacy fa.*, and brand-new emitted events.
    const previouslyThrowing = [
      'fa.created',
      'fa.edit',
      'fa.built',
      'fa.cascade',
      'fa.core_closed',
      'manufacturing_operations.created',
      'reference.row.upserted',
      'unit_of_measure.created',
      'settings.upgrade.scheduled',
      'org.security_policy.updated',
      'settings.location.imported',
    ];
    for (const ev of previouslyThrowing) {
      expect(() => normalizeEventType(ev), `normalizeEventType threw on ${ev}`).not.toThrow();
    }
  });

  it('exposes DB_EVENT_TYPES = canonical values ∪ legacy alias keys (the DB CHECK contract)', async () => {
    const { ALL_EVENTS, LegacyEventAlias, DB_EVENT_TYPES } = await loadEventsModule();

    const expected = new Set<string>([...ALL_EVENTS, ...Object.keys(LegacyEventAlias)]);
    expect(new Set(DB_EVENT_TYPES)).toEqual(expected);
    expect(DB_EVENT_TYPES.length).toBe(expected.size);
  });

  it('locks events.enum.ts behind architect review in CODEOWNERS', () => {
    expect(existsSync(codeownersPath), 'CODEOWNERS must exist at the repository root').toBe(true);

    const codeowners = readFileSync(codeownersPath, 'utf8');
    expect(codeowners).toMatch(
      /^\s*\/?packages\/outbox\/src\/events\.enum\.ts\s+.*(?:@[^\s/]*architect[^\s]*|architect)/im,
    );
  });
});
