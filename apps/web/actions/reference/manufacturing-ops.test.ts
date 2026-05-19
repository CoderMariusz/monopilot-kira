import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';

type Permission =
  | 'manufacturing_operations.view'
  | 'manufacturing_operations.edit'
  | 'manufacturing_operations.create'
  | 'manufacturing_operations.delete'
  | 'manufacturing_operations.reorder';

type ManufacturingOperation = {
  id: string;
  org_id: string;
  operation_name: string;
  process_suffix: string;
  description: string | null;
  operation_seq: number;
  industry_code: 'bakery' | 'pharma' | 'fmcg' | 'generic' | 'custom';
  is_active: boolean;
  marker: 'ORG-CONFIG';
};

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  permissions: Set<Permission>;
  rows: Map<string, ManufacturingOperation>;
  referencedNames: Set<string>;
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: T[]; rowCount: number }>;
};

const { _runWithOrgContext, _revalidatePath } = vi.hoisted(() => ({
  _runWithOrgContext: vi.fn(),
  _revalidatePath: vi.fn(),
}));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

vi.mock('next/cache', () => ({
  revalidatePath: _revalidatePath,
}));

function seedRows(): ManufacturingOperation[] {
  return [
    makeOperation({ id: 'op-mix', operation_name: 'Mix', process_suffix: 'MX', description: 'Mixing', operation_seq: 1, industry_code: 'bakery' }),
    makeOperation({ id: 'op-knead', operation_name: 'Knead', process_suffix: 'KN', description: 'Kneading dough', operation_seq: 2, industry_code: 'bakery' }),
    makeOperation({ id: 'op-proof', operation_name: 'Proof', process_suffix: 'PR', description: 'Proofing/bulk fermentation', operation_seq: 3, industry_code: 'bakery' }),
    makeOperation({ id: 'op-bake', operation_name: 'Bake', process_suffix: 'BK', description: 'Baking in oven', operation_seq: 4, industry_code: 'bakery' }),
  ];
}

function makeOperation(overrides: Partial<ManufacturingOperation>): ManufacturingOperation {
  return {
    id: 'op-generated',
    org_id: ORG_ID,
    operation_name: 'Mix',
    process_suffix: 'MX',
    description: null,
    operation_seq: 1,
    industry_code: 'bakery',
    is_active: true,
    marker: 'ORG-CONFIG',
    ...overrides,
  } as ManufacturingOperation;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function usesDedicatedManufacturingOpsTable(call: QueryCall): boolean {
  const sql = normalizeSql(call.sql);
  return sql.includes('reference.manufacturingoperations') || sql.includes('manufacturing_operations');
}

function stringParam(params: readonly unknown[], value: string): boolean {
  return params.map(String).includes(value);
}

function makeClient(options: { permissions?: Permission[]; referencedNames?: string[] } = {}): FakeClient {
  const rows = new Map(seedRows().map((row) => [row.id, row]));
  const client: FakeClient = {
    calls: [],
    permissions: new Set<Permission>(
      options.permissions ?? [
        'manufacturing_operations.view',
        'manufacturing_operations.edit',
        'manufacturing_operations.create',
        'manufacturing_operations.delete',
        'manufacturing_operations.reorder',
      ],
    ),
    rows,
    referencedNames: new Set(options.referencedNames ?? ['Mix']),
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('reference_tables')) {
        throw new Error('Manufacturing Operations must use the dedicated Reference.ManufacturingOperations store, not generic reference_tables');
      }

      if (normalized.includes('from public.user_roles')) {
        const permission = Array.from(client.permissions).find((candidate) => normalized.includes(candidate) || stringParam(params, candidate));
        const allowed = Boolean(permission && normalized.includes('role_permissions') && client.permissions.has(permission));
        return { rows: (allowed ? [{ ok: true }] : []) as never[], rowCount: allowed ? 1 : 0 };
      }

      if (normalized.includes('template_operation') || normalized.includes('manufacturing_operation_')) {
        const referencedName = params.map(String).find((param) => client.referencedNames.has(param));
        const count = referencedName ? 2 : 0;
        return { rows: (count > 0 ? [{ active_fa_count: count, template_count: count }] : []) as never[], rowCount: count > 0 ? 1 : 0 };
      }

      if (!usesDedicatedManufacturingOpsTable({ sql, params })) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.startsWith('select')) {
        const industry = params.map(String).find((param) => ['bakery', 'pharma', 'fmcg', 'generic', 'custom'].includes(param));
        const onlyActive = normalized.includes('is_active = true') || normalized.includes('is_active=true');
        const selected = Array.from(client.rows.values())
          .filter((row) => !industry || row.industry_code === industry)
          .filter((row) => !onlyActive || row.is_active)
          .sort((a, b) => a.operation_seq - b.operation_seq);
        return { rows: selected as never[], rowCount: selected.length };
      }

      if (normalized.startsWith('insert')) {
        const operationName = params.map(String).find((param) => /^[A-Za-z0-9 ]{1,50}$/.test(param) && !['ORG-CONFIG', ORG_ID].includes(param)) ?? 'Created';
        const processSuffix = params.map(String).find((param) => /^[A-Z0-9]{2,4}$/.test(param) && param !== 'ORG-CONFIG') ?? 'CR';
        const industry = (params.map(String).find((param) => ['bakery', 'pharma', 'fmcg', 'generic', 'custom'].includes(param)) ?? 'custom') as ManufacturingOperation['industry_code'];
        const seq = Number(params.find((param) => typeof param === 'number') ?? 99);
        const inserted = makeOperation({
          id: `op-${processSuffix.toLowerCase()}`,
          operation_name: operationName,
          process_suffix: processSuffix,
          description: params.map(String).find((param) => param.includes('Custom')) ?? null,
          operation_seq: seq,
          industry_code: industry,
        });
        client.rows.set(inserted.id, inserted);
        return { rows: [inserted] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('update')) {
        if (normalized.includes('operation_seq')) {
          for (const [id, row] of Array.from(client.rows.entries())) {
            const idx = params.indexOf(id);
            if (idx >= 0) row.operation_seq = Number(params[idx + 1]);
          }
          return { rows: Array.from(client.rows.values()) as never[], rowCount: client.rows.size };
        }
        const id = params.map(String).find((param) => client.rows.has(param));
        const row = id ? client.rows.get(id) : undefined;
        if (!row) return { rows: [], rowCount: 0 };
        if (params.includes(false) || normalized.includes('is_active = false') || normalized.includes('is_active=false')) row.is_active = false;
        const description = params.map(String).find((param) => param.includes('updated') || param.includes('inactive'));
        if (description) row.description = description;
        return { rows: [row] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('delete')) {
        client.rows.clear();
        return { rows: [], rowCount: 4 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
  );
});

async function loadAction<T extends (...args: never[]) => unknown>(
  moduleLabel: string,
  exportName: string,
  importer: () => Promise<Record<string, unknown>>,
): Promise<T> {
  try {
    const mod = await importer();
    const action = mod[exportName];
    if (typeof action !== 'function') {
      expect.fail(`Manufacturing Operations RED contract: ${moduleLabel} must export ${exportName} Server Action`);
    }
    return action as T;
  } catch (error) {
    expect.fail(
      `Manufacturing Operations RED contract: ${moduleLabel} must be implemented and export ${exportName}; got ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

describe('Reference.ManufacturingOperations Server Actions (T-038 RED)', () => {
  it('creates only valid dedicated-table ORG-CONFIG rows and enforces suffix/name/industry validation', async () => {
    const createManufacturingOperation = await loadAction<
      (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: ManufacturingOperation }>
    >('manufacturing-ops/create.ts', 'createManufacturingOperation', () => import(`${__dirname}/manufacturing-ops/create.ts`) as Promise<Record<string, unknown>>);

    await expect(
      createManufacturingOperation({ operationName: 'Blend', processSuffix: 'mx', operationSeq: 5, industryCode: 'custom', isActive: true }),
    ).resolves.toMatchObject({ ok: false, error: 'invalid_input' });
    expect(currentClient.calls, 'invalid suffix must fail before any DB write').toHaveLength(0);

    const result = await createManufacturingOperation({
      operationName: 'Blend',
      processSuffix: 'BL',
      description: 'Custom blending step',
      operationSeq: 5,
      industryCode: 'custom',
      isActive: true,
    });

    expect(result).toMatchObject({ ok: true, data: { operation_name: 'Blend', process_suffix: 'BL', operation_seq: 5, industry_code: 'custom', marker: 'ORG-CONFIG' } });
    expect(currentClient.calls.some(usesDedicatedManufacturingOpsTable)).toBe(true);
    expect(currentClient.calls.some((call) => normalizeSql(call.sql).includes('reference_tables'))).toBe(false);
    expect(currentClient.calls.some((call) => call.sql.includes('ORG-CONFIG') || stringParam(call.params, 'ORG-CONFIG'))).toBe(true);
  });

  it('updates mutable fields only and rejects attempts to change immutable suffix or operation name', async () => {
    const updateManufacturingOperation = await loadAction<
      (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: ManufacturingOperation }>
    >('manufacturing-ops/update.ts', 'updateManufacturingOperation', () => import(`${__dirname}/manufacturing-ops/update.ts`) as Promise<Record<string, unknown>>);

    await expect(updateManufacturingOperation({ id: 'op-mix', operationName: 'Blend', processSuffix: 'BL', operationSeq: 6 })).resolves.toMatchObject({
      ok: false,
      error: 'immutable_field',
    });
    expect(currentClient.rows.get('op-mix')).toMatchObject({ operation_name: 'Mix', process_suffix: 'MX' });

    const result = await updateManufacturingOperation({ id: 'op-mix', description: 'updated mixing step', operationSeq: 6, industryCode: 'bakery', isActive: true });
    expect(result).toMatchObject({ ok: true, data: { id: 'op-mix', operation_name: 'Mix', process_suffix: 'MX', description: 'updated mixing step' } });
    expect(currentClient.calls.filter((call) => normalizeSql(call.sql).startsWith('update')).every(usesDedicatedManufacturingOpsTable)).toBe(true);
  });

  it('deactivate blocks referenced operations and otherwise returns the required V-SET-MFG-06 warning while soft-deleting', async () => {
    const deactivateManufacturingOperation = await loadAction<
      (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; warning?: { code: string }; data?: ManufacturingOperation }>
    >('manufacturing-ops/deactivate.ts', 'deactivateManufacturingOperation', () => import(`${__dirname}/manufacturing-ops/deactivate.ts`) as Promise<Record<string, unknown>>);

    await expect(deactivateManufacturingOperation({ id: 'op-mix' })).resolves.toMatchObject({
      ok: false,
      error: 'operation_referenced',
      warning: { code: 'OPERATION_REFERENCED' },
    });
    expect(currentClient.rows.get('op-mix')?.is_active).toBe(true);

    const result = await deactivateManufacturingOperation({ id: 'op-bake', confirmDeactivateWarning: true });
    expect(result).toMatchObject({ ok: true, warning: { code: 'DEACTIVATE_WARNING' }, data: { id: 'op-bake', is_active: false } });
    expect(currentClient.rows.get('op-bake')?.is_active).toBe(false);
  });

  it('bulk reorders operation_seq with a seq-1 invariant and reset-to-seed replaces rows with the exact industry baseline', async () => {
    const reorderManufacturingOperations = await loadAction<
      (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: ManufacturingOperation[] }>
    >('manufacturing-ops/reorder.ts', 'reorderManufacturingOperations', () => import(`${__dirname}/manufacturing-ops/reorder.ts`) as Promise<Record<string, unknown>>);
    const resetManufacturingOperationsToSeed = await loadAction<
      (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: ManufacturingOperation[] }>
    >('manufacturing-ops/reset-to-seed.ts', 'resetManufacturingOperationsToSeed', () =>
      import(`${__dirname}/manufacturing-ops/reset-to-seed.ts`) as Promise<Record<string, unknown>>,
    );

    await expect(
      reorderManufacturingOperations({ items: [{ id: 'op-mix', operationSeq: 2 }, { id: 'op-bake', operationSeq: 3 }] }),
    ).resolves.toMatchObject({ ok: false, error: 'invalid_input' });

    await expect(
      reorderManufacturingOperations({ items: [{ id: 'op-bake', operationSeq: 1 }, { id: 'op-mix', operationSeq: 2 }] }),
    ).resolves.toMatchObject({ ok: true });
    expect(currentClient.rows.get('op-bake')?.operation_seq).toBe(1);
    expect(currentClient.rows.get('op-mix')?.operation_seq).toBe(2);

    const reset = await resetManufacturingOperationsToSeed({ industryCode: 'pharma', confirmReset: true });
    expect(reset).toMatchObject({
      ok: true,
      data: [
        { operation_seq: 1, operation_name: 'Synthesis', process_suffix: 'SY', description: 'Chemical synthesis', industry_code: 'pharma', marker: 'ORG-CONFIG', is_active: true },
        { operation_seq: 2, operation_name: 'Separation', process_suffix: 'SE', description: 'Separation/chromatography', industry_code: 'pharma', marker: 'ORG-CONFIG', is_active: true },
        { operation_seq: 3, operation_name: 'Crystallization', process_suffix: 'CZ', description: 'Crystallization', industry_code: 'pharma', marker: 'ORG-CONFIG', is_active: true },
        { operation_seq: 4, operation_name: 'Drying', process_suffix: 'DR', description: 'Drying/lyophilization', industry_code: 'pharma', marker: 'ORG-CONFIG', is_active: true },
      ],
    });
  });
});
