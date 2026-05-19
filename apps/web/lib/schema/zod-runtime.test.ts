import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

type RuntimeColumn = {
  org_id: string;
  table_code: string;
  column_code: string;
  data_type: 'text' | 'number' | 'date' | 'enum' | 'formula' | 'relation';
  required_for_done: boolean;
  validation_json?: Record<string, unknown> | null;
  presentation_json?: Record<string, unknown> | null;
  schema_version: number;
  deprecated_at?: string | null;
};

type ZodRuntimeModule = typeof import('./zod-runtime.js');

async function loadZodRuntimeModule(): Promise<ZodRuntimeModule> {
  return (await import('./zod-runtime.js')) as ZodRuntimeModule;
}

function column(overrides: Partial<RuntimeColumn>): RuntimeColumn {
  return {
    org_id: ORG_A,
    table_code: 'batch_records',
    column_code: 'name',
    data_type: 'text',
    required_for_done: true,
    validation_json: {},
    presentation_json: {},
    schema_version: 7,
    deprecated_at: null,
    ...overrides,
  };
}

describe('getZodRuntimeSchema (real zod schemas, T-024)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await loadZodRuntimeModule();
    mod.clearZodRuntimeSchemaCache();
  });

  it('caches repeat calls by (org_id, table_code, schema_version) without reloading columns', async () => {
    const mod = await loadZodRuntimeModule();
    const loadColumns = vi.fn(async ({ orgId, tableCode, schemaVersion }) => [
      column({ org_id: orgId, table_code: tableCode, schema_version: schemaVersion, column_code: 'row_name' }),
    ]);

    const first = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 7, loadColumns });
    const repeat = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 7, loadColumns });
    const otherTable = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'quality_records', schemaVersion: 7, loadColumns });
    const otherOrg = await mod.getZodRuntimeSchema({ orgId: ORG_B, tableCode: 'batch_records', schemaVersion: 7, loadColumns });

    expect(repeat).toBe(first);
    expect(otherTable).not.toBe(first);
    expect(otherOrg).not.toBe(first);
    expect(loadColumns).toHaveBeenCalledTimes(3);
  });

  it('cache invalidates when schema_version bumps for the same (org_id, table_code)', async () => {
    const mod = await loadZodRuntimeModule();
    const loadColumns = vi.fn(async ({ schemaVersion }) => [
      column({ column_code: 'name', schema_version: schemaVersion }),
    ]);

    const v7 = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 7, loadColumns });
    const v8 = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 8, loadColumns });

    expect(v7).not.toBe(v8);
    expect(loadColumns).toHaveBeenCalledTimes(2);

    // invalidate v7 and v8 explicitly — a third call rebuilds
    mod.invalidateZodRuntimeSchemaCache({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 8 });
    const v8b = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 8, loadColumns });
    expect(v8b).not.toBe(v8);
    expect(loadColumns).toHaveBeenCalledTimes(3);
  });

  it('produces a real Zod schema instance (has parse + safeParse + extend)', async () => {
    const mod = await loadZodRuntimeModule();
    const loadColumns = vi.fn(async () => [
      column({ column_code: 'name', data_type: 'text', required_for_done: true }),
    ]);

    const schema = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 7, loadColumns });

    expect(schema).toBeInstanceOf(z.ZodType);
    expect(typeof schema.safeParse).toBe('function');
    expect(typeof schema.parse).toBe('function');
  });

  it('honors regex from validation_json: ^[A-Z]{3}$ rejects "abc" and accepts "ABC"', async () => {
    const mod = await loadZodRuntimeModule();
    const loadColumns = vi.fn(async () => [
      column({
        column_code: 'tag_code',
        data_type: 'text',
        validation_json: { regex: '^[A-Z]{3}$' },
      }),
    ]);

    const schema = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 8, loadColumns });

    expect(schema.safeParse({ tag_code: 'ABC' }).success).toBe(true);
    const invalid = schema.safeParse({ tag_code: 'abc' });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.some((issue) => issue.path[0] === 'tag_code')).toBe(true);
    }
  });

  it('excludes deprecated columns from the generated schema (V-SET-05)', async () => {
    const mod = await loadZodRuntimeModule();
    const loadColumns = vi.fn(async () => [
      column({ column_code: 'active_code', data_type: 'text', required_for_done: true }),
      column({
        column_code: 'legacy_score',
        data_type: 'number',
        required_for_done: true,
        deprecated_at: '2026-05-19T00:00:00.000Z',
      }),
    ]);

    const schema = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 9, loadColumns });

    const withoutDeprecated = schema.safeParse({ active_code: 'A-100' });
    expect(withoutDeprecated.success).toBe(true);

    // Even submitting a value of wrong type for the deprecated column must be ignored
    const withDeprecatedPayload = schema.safeParse({ active_code: 'A-100', legacy_score: 'not-a-number' });
    expect(withDeprecatedPayload.success).toBe(true);
    if (withDeprecatedPayload.success) {
      expect(withDeprecatedPayload.data).not.toHaveProperty('legacy_score');
    }
  });

  it('range validation: number column min/max are enforced', async () => {
    const mod = await loadZodRuntimeModule();
    const loadColumns = vi.fn(async () => [
      column({
        column_code: 'pct',
        data_type: 'number',
        validation_json: { range: { min: 0, max: 100 } },
      }),
    ]);

    const schema = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 9, loadColumns });
    expect(schema.safeParse({ pct: 50 }).success).toBe(true);
    expect(schema.safeParse({ pct: -1 }).success).toBe(false);
    expect(schema.safeParse({ pct: 101 }).success).toBe(false);
  });

  it('required_for_done=false makes the field optional (accepts missing key)', async () => {
    const mod = await loadZodRuntimeModule();
    const loadColumns = vi.fn(async () => [
      column({ column_code: 'mandatory', data_type: 'text', required_for_done: true }),
      column({ column_code: 'optional', data_type: 'text', required_for_done: false }),
    ]);

    const schema = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 9, loadColumns });

    expect(schema.safeParse({ mandatory: 'x' }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });
});
