import { beforeEach, describe, expect, it, vi } from 'vitest';

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

type RuntimeParseSuccess = { success: true; data: Record<string, unknown> };
type RuntimeParseFailure = { success: false; error: { issues: Array<{ path: Array<string | number>; message?: string }> } };
type RuntimeParseResult = RuntimeParseSuccess | RuntimeParseFailure;

type RuntimeSchema = {
  safeParse: (value: unknown) => RuntimeParseResult;
};

function isFailure(result: RuntimeParseResult): result is RuntimeParseFailure {
  return result.success === false;
}

type ZodRuntimeModule = {
  getZodRuntimeSchema: (input: {
    orgId: string;
    tableCode: string;
    schemaVersion: number;
    loadColumns: (scope: { orgId: string; tableCode: string; schemaVersion: number }) => Promise<RuntimeColumn[]>;
  }) => Promise<RuntimeSchema>;
  clearZodRuntimeSchemaCache?: () => void;
};

async function loadZodRuntimeModule(): Promise<ZodRuntimeModule> {
  const modulePath = './zod-runtime';
  try {
    const mod = (await import(modulePath)) as Partial<ZodRuntimeModule>;
    if (typeof mod.getZodRuntimeSchema !== 'function') {
      throw new Error('getZodRuntimeSchema export is required');
    }
    return mod as ZodRuntimeModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Cannot find module') || !message.includes('zod-runtime')) {
      throw error;
    }

    // RED bootstrap: the production module does not exist yet in this worktree.
    // Return a deliberately non-compliant sentinel so the tests fail as behavior
    // assertions instead of a Vitest module-load error. GREEN must replace this
    // by creating apps/web/lib/schema/zod-runtime.ts with the real export.
    return {
      async getZodRuntimeSchema(input) {
        await input.loadColumns({
          orgId: input.orgId,
          tableCode: input.tableCode,
          schemaVersion: input.schemaVersion,
        });
        return {
          safeParse(value) {
            return { success: true, data: value as Record<string, unknown> };
          },
        };
      },
      clearZodRuntimeSchemaCache() {
        // no-op sentinel: cache behavior intentionally absent for RED.
      },
    };
  }
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

describe('getZodRuntimeSchema', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await loadZodRuntimeModule();
    mod.clearZodRuntimeSchemaCache?.();
  });

  it('caches repeat calls by org_id + table_code + schema_version without reloading columns', async () => {
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

  it('honors regex validation_json when compiling text columns', async () => {
    const mod = await loadZodRuntimeModule();
    const loadColumns = vi.fn(async () => [
      column({
        column_code: 'batch_code',
        data_type: 'text',
        validation_json: { regex: '^BATCH-[0-9]{3}$' },
      }),
    ]);

    const schema = await mod.getZodRuntimeSchema({ orgId: ORG_A, tableCode: 'batch_records', schemaVersion: 8, loadColumns });

    expect(schema.safeParse({ batch_code: 'BATCH-123' }).success).toBe(true);
    const invalid = schema.safeParse({ batch_code: 'batch-123' });
    expect(invalid.success).toBe(false);
    if (isFailure(invalid)) {
      expect(invalid.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['batch_code'] })]),
      );
    }
  });

  it('excludes deprecated columns from the generated schema', async () => {
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

    const withDeprecatedPayload = schema.safeParse({ active_code: 'A-100', legacy_score: 'not-a-number' });
    expect(withDeprecatedPayload.success).toBe(true);
    if (withDeprecatedPayload.success) {
      expect(withDeprecatedPayload.data).not.toHaveProperty('legacy_score');
    }
  });
});
