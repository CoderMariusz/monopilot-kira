import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
const TABLE_CODE = 'pack_sizes';
const ROW_KEY = '20x30cm';

type Permission = 'settings.reference.view' | 'settings.reference.edit' | 'settings.reference.import';

type ReferenceRow = {
  org_id: string;
  table_code: string;
  row_key: string;
  row_data: Record<string, unknown>;
  version: number;
  is_active: boolean;
  display_order: number;
};

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  permissions: Set<Permission>;
  rows: Map<string, ReferenceRow>;
  refreshes: Array<{ orgId: string; tableCode: string }>;
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: T[]; rowCount: number }>;
};

const { _runWithOrgContext } = vi.hoisted(() => ({
  _runWithOrgContext: vi.fn(),
}));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

function rowKey(tableCode = TABLE_CODE, rowKey = ROW_KEY): string {
  return `${tableCode}:${rowKey}`;
}

function makeClient(options: { permissions?: Permission[]; seedRow?: Partial<ReferenceRow> } = {}): FakeClient {
  const seed: ReferenceRow = {
    org_id: ORG_ID,
    table_code: TABLE_CODE,
    row_key: ROW_KEY,
    row_data: { pack_size: '20x30cm', is_active: 'true' },
    version: 3,
    is_active: true,
    display_order: 10,
    ...options.seedRow,
  };

  const client: FakeClient = {
    calls: [],
    permissions: new Set<Permission>(options.permissions ?? ['settings.reference.view', 'settings.reference.edit']),
    rows: new Map([[rowKey(seed.table_code, seed.row_key), seed]]),
    refreshes: [],
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      const paramsText = params.map(String).join(' ');

      if (normalized.includes('from public.user_roles')) {
        const permission = (['settings.reference.view', 'settings.reference.edit', 'settings.reference.import'] as Permission[]).find(
          (candidate) => normalized.includes(candidate) || paramsText.includes(candidate),
        );
        const isPermissionJoin = normalized.includes('role_permissions');
        const allowed = Boolean(permission && isPermissionJoin && client.permissions.has(permission));
        return { rows: (allowed ? [{ ok: true }] : []) as never[], rowCount: allowed ? 1 : 0 };
      }

      if (normalized.includes('from public.reference_schemas')) {
        if (normalized.includes('dropdown_source')) {
          return {
            rows: [
              {
                table_code: 'product_specs',
                column_code: 'pack_size',
                dropdown_source: TABLE_CODE,
                referencing_active_rows: 2,
              },
            ] as never[],
            rowCount: 1,
          };
        }
        return {
          rows: [
            { column_code: 'pack_size', data_type: 'text', required_for_done: true, is_required: true, required: true },
            { column_code: 'is_active', data_type: 'enum', enum_values: ['true', 'false'], required_for_done: true, is_required: true, required: true },
          ] as never[],
          rowCount: 2,
        };
      }

      if (normalized.includes('app.refresh_reference_table_mv')) {
        client.refreshes.push({ orgId: String(params[0]), tableCode: String(params[1]) });
        return { rows: [{ refresh_reference_table_mv: true }] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('select') && normalized.includes('from public.reference_tables')) {
        const tableCode = String(params.find((p) => p === TABLE_CODE) ?? TABLE_CODE);
        const key = String(params.find((p) => p === ROW_KEY) ?? ROW_KEY);
        const row = client.rows.get(rowKey(tableCode, key));
        const activeOnly = normalized.includes('is_active = true') || normalized.includes('is_active=true');
        const visible = row && (!activeOnly || row.is_active);
        return { rows: (visible ? [row] : []) as never[], rowCount: visible ? 1 : 0 };
      }

      if (normalized.startsWith('insert into public.reference_tables')) {
        const [orgId, tableCode, key, rowData, displayOrder] = params;
        const row: ReferenceRow = {
          org_id: String(orgId),
          table_code: String(tableCode),
          row_key: String(key),
          row_data: typeof rowData === 'string' ? JSON.parse(rowData) : (rowData as Record<string, unknown>),
          version: 1,
          is_active: true,
          display_order: Number(displayOrder ?? 0),
        };
        client.rows.set(rowKey(row.table_code, row.row_key), row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('update public.reference_tables')) {
        const expectedVersion = params.find((p) => p === 3 || p === 99);
        const tableCode = String(params.find((p) => p === TABLE_CODE) ?? TABLE_CODE);
        const key = String(params.find((p) => p === ROW_KEY) ?? ROW_KEY);
        const row = client.rows.get(rowKey(tableCode, key));
        if (!row) return { rows: [], rowCount: 0 };
        if (expectedVersion !== undefined && row.version !== expectedVersion) return { rows: [], rowCount: 0 };

        const rowDataParam = params.find((p) => typeof p === 'object' && p !== null && !Array.isArray(p)) as Record<string, unknown> | undefined;
        if (rowDataParam) {
          const changed = JSON.stringify(row.row_data) !== JSON.stringify(rowDataParam);
          row.row_data = rowDataParam;
          if (changed) row.version += 1;
        }
        if (normalized.includes('is_active = false') || normalized.includes('is_active=false')) row.is_active = false;
        return { rows: [row] as never[], rowCount: 1 };
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
      expect.fail(`Reference CRUD RED contract: ${moduleLabel} must export ${exportName} Server Action`);
    }
    return action as T;
  } catch (error) {
    expect.fail(
      `Reference CRUD RED contract: ${moduleLabel} must be implemented and export ${exportName}; got ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

describe('reference table CRUD Server Actions (T-021 RED)', () => {
  it('list/get enforce settings.reference.view via permission grants, not role-code shortcuts', async () => {
    currentClient = makeClient({ permissions: [] });
    const listReferenceRows = await loadAction<(input: { tableCode: string }) => Promise<{ ok: boolean; error?: string }>>(
      'list.ts',
      'listReferenceRows',
      () => import(`${__dirname}/list.ts`) as Promise<Record<string, unknown>>,
    );
    const getReferenceRow = await loadAction<
      (input: { tableCode: string; rowKey: string }) => Promise<{ ok: boolean; error?: string }>
    >('get.ts', 'getReferenceRow', () => import(`${__dirname}/get.ts`) as Promise<Record<string, unknown>>);

    await expect(listReferenceRows({ tableCode: TABLE_CODE })).resolves.toMatchObject({ ok: false, error: 'forbidden' });
    await expect(getReferenceRow({ tableCode: TABLE_CODE, rowKey: ROW_KEY })).resolves.toMatchObject({ ok: false, error: 'forbidden' });
    expect(currentClient.calls.some((call) => call.sql.toLowerCase().includes('role_permissions'))).toBe(true);
    expect(currentClient.calls.some((call) => call.params.map(String).includes('settings.reference.view'))).toBe(true);
  });

  it('upsert validates generated reference_schemas, raises VERSION_CONFLICT, and refreshes the reference MV only after a successful row_data change', async () => {
    const upsertReferenceRow = await loadAction<
      (input: { tableCode: string; rowKey: string; rowData: Record<string, unknown>; expectedVersion: number }) => Promise<{ ok: boolean; error?: string; data?: { version: number } }>
    >('upsert.ts', 'upsertReferenceRow', () => import(`${__dirname}/upsert.ts`) as Promise<Record<string, unknown>>);

    await expect(
      upsertReferenceRow({ tableCode: TABLE_CODE, rowKey: ROW_KEY, rowData: { pack_size: '25x35cm', is_active: 'true' }, expectedVersion: 99 }),
    ).resolves.toMatchObject({ ok: false, error: 'VERSION_CONFLICT' });
    expect(currentClient.refreshes, 'stale optimistic-lock writes must not refresh dropdown materialized views').toHaveLength(0);

    const result = await upsertReferenceRow({
      tableCode: TABLE_CODE,
      rowKey: ROW_KEY,
      rowData: { pack_size: '25x35cm', is_active: 'true' },
      expectedVersion: 3,
    });

    expect(result).toMatchObject({ ok: true, data: { version: 4 } });
    expect(currentClient.calls.some((call) => call.sql.toLowerCase().includes('from public.reference_schemas'))).toBe(true);
    expect(currentClient.refreshes).toEqual([{ orgId: ORG_ID, tableCode: TABLE_CODE }]);
  });

  it('soft delete requires settings.reference.edit and surfaces V-SET-22 FK warnings while refreshing the reference MV on mutation', async () => {
    currentClient = makeClient({ permissions: ['settings.reference.view'] });
    const softDeleteReferenceRow = await loadAction<
      (input: { tableCode: string; rowKey: string; expectedVersion: number; confirmReferenced?: boolean }) => Promise<{ ok: boolean; error?: string; warning?: { code: string } }>
    >('soft-delete.ts', 'softDeleteReferenceRow', () => import(`${__dirname}/soft-delete.ts`) as Promise<Record<string, unknown>>);

    await expect(softDeleteReferenceRow({ tableCode: TABLE_CODE, rowKey: ROW_KEY, expectedVersion: 3 })).resolves.toMatchObject({
      ok: false,
      error: 'forbidden',
    });
    expect(currentClient.rows.get(rowKey())?.is_active).toBe(true);

    currentClient.permissions.add('settings.reference.edit');
    const result = await softDeleteReferenceRow({ tableCode: TABLE_CODE, rowKey: ROW_KEY, expectedVersion: 3, confirmReferenced: true });

    expect(result).toMatchObject({ ok: true, warning: { code: 'FK_REFERENCE_WARNING' } });
    expect(currentClient.rows.get(rowKey())?.is_active).toBe(false);
    expect(currentClient.refreshes).toEqual([{ orgId: ORG_ID, tableCode: TABLE_CODE }]);
  });
});
