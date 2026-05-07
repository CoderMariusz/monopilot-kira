import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');
const eventsModulePath = resolve(repoRoot, 'packages/outbox/src/events.enum.ts');
const codeownersPath = resolve(repoRoot, 'CODEOWNERS');
const expectedCanonicalEvents = [
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
  // T-039 — canary upgrade orchestration (extends the foundation 12-event list)
  'tenant.migration.run',
  'tenant.migration.run.failed',
  'tenant.cohort.advanced',
] as const;

type EventsModule = {
  EventType: Record<string, string>;
  LegacyEventAlias: Record<string, string>;
  ALL_EVENTS: readonly string[];
  ALL_EVENT_ALIASES: Readonly<Record<string, string>>;
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
  it('exports exactly the canonical foundation event values without duplicates', async () => {
    const { ALL_EVENTS, EventType } = await loadEventsModule();

    expect(ALL_EVENTS).toEqual(expectedCanonicalEvents);
    expect(Object.values(EventType)).toEqual(expectedCanonicalEvents);
    expect(new Set(ALL_EVENTS).size).toBe(ALL_EVENTS.length);
  });

  it('keeps all canonical event values in the locked lowercase dotted format', async () => {
    const { ALL_EVENTS } = await loadEventsModule();

    for (const eventType of ALL_EVENTS) {
      expect(eventType).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
    }
  });

  it('uses fg.* as the only canonical finished-good lifecycle prefix', async () => {
    const { ALL_EVENTS, EventType } = await loadEventsModule();

    expect(EventType.FG_CREATED).toBe('fg.created');
    expect(EventType.FG_ALLERGENS_CHANGED).toBe('fg.allergens_changed');
    expect(EventType.FG_INTERMEDIATE_CODE_CHANGED).toBe('fg.intermediate_code_changed');

    expect(ALL_EVENTS).toContain('fg.created');
    expect(ALL_EVENTS).toContain('fg.allergens_changed');
    expect(ALL_EVENTS).toContain('fg.intermediate_code_changed');
    expect(Object.values(EventType).some((eventType) => eventType.startsWith('fa.'))).toBe(false);
    expect(Object.values(EventType).some((eventType) => eventType.startsWith('product.'))).toBe(false);
    expect(ALL_EVENTS.some((eventType) => eventType.startsWith('fa.'))).toBe(false);
    expect(ALL_EVENTS).not.toContain('fa.created');
    expect(ALL_EVENTS).not.toContain('fa.allergens_changed');
    expect(ALL_EVENTS).not.toContain('fa.intermediate_code_changed');
    expect(ALL_EVENTS.some((eventType) => eventType.startsWith('product.'))).toBe(false);
  });

  it('keeps fa.* only as explicit migration aliases that normalize to fg.*', async () => {
    const { ALL_EVENT_ALIASES, LegacyEventAlias, normalizeEventType } = await loadEventsModule();

    expect(LegacyEventAlias).toEqual({
      'fa.created': 'fg.created',
      'fa.allergens_changed': 'fg.allergens_changed',
      'fa.intermediate_code_changed': 'fg.intermediate_code_changed',
    });
    expect(ALL_EVENT_ALIASES).toEqual(LegacyEventAlias);

    expect(normalizeEventType('fa.created')).toBe('fg.created');
    expect(normalizeEventType('fa.allergens_changed')).toBe('fg.allergens_changed');
    expect(normalizeEventType('fa.intermediate_code_changed')).toBe('fg.intermediate_code_changed');
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

  it('locks events.enum.ts behind architect review in CODEOWNERS', () => {
    expect(existsSync(codeownersPath), 'CODEOWNERS must exist at the repository root').toBe(true);

    const codeowners = readFileSync(codeownersPath, 'utf8');
    expect(codeowners).toMatch(
      /^\s*\/?packages\/outbox\/src\/events\.enum\.ts\s+.*(?:@[^\s/]*architect[^\s]*|architect)/im,
    );
  });
});
