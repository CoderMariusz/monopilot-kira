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

type ReferencingRow = {
  table_code: string;
  column_code: string;
  row_key: string;
  reference_value: string;
};

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  permissions: Set<Permission>;
  rows: Map<string, ReferenceRow>;
  schemaReferences: Array<{ table_code: string; column_code: string; dropdown_source: string }>;
  referencingRows: ReferencingRow[];
  refreshes: Array<{ orgId: string; tableCode: string }>;
  auditEntries: Array<{ action: string; resource_id: string; after_state: unknown }>;
  outboxEntries: Array<{ event_type: string; aggregate_id: string; payload: unknown }>;
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

function makeRowMapKey(tableCode: string, rowKey: string): string {
  return `${tableCode}:${rowKey}`;
}

function defaultRow(seedRow: Partial<ReferenceRow> | undefined): ReferenceRow {
  return {
    org_id: ORG_ID,
    table_code: TABLE_CODE,
    row_key: ROW_KEY,
    row_data: { pack_size: '20x30cm', is_active: 'true' },
    version: 3,
    is_active: true,
    display_order: 10,
    ...seedRow,
  };
}

function makeClient(
  options: {
    permissions?: Permission[];
    seedRow?: Partial<ReferenceRow>;
    schemaReferences?: Array<{ table_code: string; column_code: string; dropdown_source: string }>;
    referencingRows?: ReferencingRow[];
  } = {},
): FakeClient {
  const seed = defaultRow(options.seedRow);

  const client: FakeClient = {
    calls: [],
    permissions: new Set<Permission>(options.permissions ?? ['settings.reference.view', 'settings.reference.edit']),
    rows: new Map([[makeRowMapKey(seed.table_code, seed.row_key), seed]]),
    schemaReferences: options.schemaReferences ?? [
      { table_code: 'product_specs', column_code: 'pack_size', dropdown_source: TABLE_CODE },
    ],
    referencingRows: options.referencingRows ?? [
      { table_code: 'product_specs', column_code: 'pack_size', row_key: 'PS-1', reference_value: ROW_KEY },
      { table_code: 'product_specs', column_code: 'pack_size', row_key: 'PS-2', reference_value: ROW_KEY },
    ],
    refreshes: [],
    auditEntries: [],
    outboxEntries: [],
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
          const sourceTable = String(params.find((p) => typeof p === 'string' && p === TABLE_CODE) ?? TABLE_CODE);
          const refs = client.schemaReferences.filter((row) => row.dropdown_source === sourceTable);
          return {
            rows: refs.map((row) => ({
              table_code: row.table_code,
              column_code: row.column_code,
              dropdown_source: row.dropdown_source,
            })) as never[],
            rowCount: refs.length,
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

      if (normalized.startsWith('insert into public.audit_log')) {
        const action = String(params[2] ?? '');
        const resourceId = String(params[3] ?? '');
        const afterRaw = params[5];
        const after = typeof afterRaw === 'string' ? safeJsonParse(afterRaw) : afterRaw;
        client.auditEntries.push({ action, resource_id: resourceId, after_state: after });
        return { rows: [{ id: client.auditEntries.length }] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.outbox_events')) {
        const eventType = String(params[1] ?? '');
        const aggregateId = String(params[3] ?? '');
        const payloadRaw = params[4];
        const payload = typeof payloadRaw === 'string' ? safeJsonParse(payloadRaw) : payloadRaw;
        client.outboxEntries.push({ event_type: eventType, aggregate_id: aggregateId, payload });
        return { rows: [{ id: client.outboxEntries.length }] as never[], rowCount: 1 };
      }

      if (normalized.includes('count(') && normalized.includes('from public.reference_tables')) {
        const referencedTable = String(params[0] ?? '');
        const referencedColumn = String(params[1] ?? '');
        const referenceValue = String(params[2] ?? '');
        const count = client.referencingRows.filter(
          (row) =>
            row.table_code === referencedTable &&
            row.column_code === referencedColumn &&
            row.reference_value === referenceValue,
        ).length;
        return { rows: [{ active_count: count }] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('select') && normalized.includes('from public.reference_tables')) {
        const tableCode = String(params.find((p) => p === TABLE_CODE) ?? TABLE_CODE);
        const key = String(params.find((p) => p === ROW_KEY) ?? ROW_KEY);
        const row = client.rows.get(makeRowMapKey(tableCode, key));
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
          row_data: typeof rowData === 'string' ? safeJsonParse(rowData) as Record<string, unknown> : (rowData as Record<string, unknown>),
          version: 1,
          is_active: true,
          display_order: Number(displayOrder ?? 0),
        };
        client.rows.set(makeRowMapKey(row.table_code, row.row_key), row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('update public.reference_tables')) {
        const versionParams = params.filter((p): p is number => typeof p === 'number' && Number.isInteger(p) && p >= 1);
        const expectedVersion = versionParams[versionParams.length - 1];
        const tableCode = String(params.find((p) => p === TABLE_CODE) ?? TABLE_CODE);
        const key = String(params.find((p) => p === ROW_KEY) ?? ROW_KEY);
        const row = client.rows.get(makeRowMapKey(tableCode, key));
        if (!row) return { rows: [], rowCount: 0 };
        if (expectedVersion !== undefined && row.version !== expectedVersion) return { rows: [], rowCount: 0 };

        const rowDataParam = params.find((p) => p && typeof p === 'object' && !Array.isArray(p)) as Record<string, unknown> | undefined;
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

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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

  it('upsertReferenceRow returns the latest row on VERSION_CONFLICT and emits audit_log + outbox on success', async () => {
    const upsertReferenceRow = await loadAction<
      (input: { tableCode: string; rowKey: string; rowData: Record<string, unknown>; expectedVersion: number }) =>
        Promise<{
          ok: boolean;
          error?: string;
          data?: { version: number; rowData?: Record<string, unknown> };
          latest?: { version: number; rowKey: string; rowData: Record<string, unknown>; isActive: boolean };
        }>
    >('upsert.ts', 'upsertReferenceRow', () => import(`${__dirname}/upsert.ts`) as Promise<Record<string, unknown>>);

    const conflict = await upsertReferenceRow({
      tableCode: TABLE_CODE,
      rowKey: ROW_KEY,
      rowData: { pack_size: '25x35cm', is_active: 'true' },
      expectedVersion: 99,
    });
    expect(conflict).toMatchObject({ ok: false, error: 'VERSION_CONFLICT' });
    expect(conflict.latest, 'VERSION_CONFLICT must include the latest persisted row per T-021 AC').toBeTruthy();
    expect(conflict.latest?.version).toBe(3);
    expect(conflict.latest?.rowKey).toBe(ROW_KEY);
    expect(conflict.latest?.rowData).toEqual({ pack_size: '20x30cm', is_active: 'true' });
    expect(conflict.latest?.isActive).toBe(true);
    expect(currentClient.refreshes, 'stale optimistic-lock writes must not refresh dropdown materialized views').toHaveLength(0);
    expect(currentClient.auditEntries, 'VERSION_CONFLICT must not write audit_log entries').toHaveLength(0);
    expect(currentClient.outboxEntries, 'VERSION_CONFLICT must not enqueue outbox events').toHaveLength(0);

    const result = await upsertReferenceRow({
      tableCode: TABLE_CODE,
      rowKey: ROW_KEY,
      rowData: { pack_size: '25x35cm', is_active: 'true' },
      expectedVersion: 3,
    });

    expect(result).toMatchObject({ ok: true, data: { version: 4 } });
    expect(currentClient.calls.some((call) => call.sql.toLowerCase().includes('from public.reference_schemas'))).toBe(true);
    expect(currentClient.refreshes).toEqual([{ orgId: ORG_ID, tableCode: TABLE_CODE }]);
    expect(currentClient.auditEntries, 'successful upsert must record audit_log').toHaveLength(1);
    expect(currentClient.auditEntries[0]?.action).toBe('reference.row.upsert');
    expect(currentClient.outboxEntries, 'successful upsert must enqueue outbox event').toHaveLength(1);
    expect(currentClient.outboxEntries[0]?.event_type).toBe('reference.row.upserted');
  });

  it('softDelete returns REFERENCED_BY_SCHEMA warning and proceeds (V-SET-22: warning, not blocker); FK count is computed from real reference_tables data', async () => {
    currentClient = makeClient({ permissions: ['settings.reference.view'] });
    const softDeleteReferenceRow = await loadAction<
      (input: { tableCode: string; rowKey: string; expectedVersion: number }) => Promise<{
        ok: boolean;
        error?: string;
        warning?: { code: string; references?: Array<{ tableCode: string; columnCode: string; activeRows: number }> };
        data?: { tableCode: string; rowKey: string; isActive: boolean };
      }>
    >('soft-delete.ts', 'softDeleteReferenceRow', () => import(`${__dirname}/soft-delete.ts`) as Promise<Record<string, unknown>>);

    await expect(softDeleteReferenceRow({ tableCode: TABLE_CODE, rowKey: ROW_KEY, expectedVersion: 3 })).resolves.toMatchObject({
      ok: false,
      error: 'forbidden',
    });
    expect(currentClient.rows.get(makeRowMapKey(TABLE_CODE, ROW_KEY))?.is_active).toBe(true);

    currentClient.permissions.add('settings.reference.edit');
    const result = await softDeleteReferenceRow({ tableCode: TABLE_CODE, rowKey: ROW_KEY, expectedVersion: 3 });

    expect(result).toMatchObject({ ok: true, warning: { code: 'REFERENCED_BY_SCHEMA' } });
    expect(result.data?.isActive).toBe(false);
    expect(result.warning?.references).toEqual([
      { tableCode: 'product_specs', columnCode: 'pack_size', activeRows: 2 },
    ]);
    expect(currentClient.rows.get(makeRowMapKey(TABLE_CODE, ROW_KEY))?.is_active).toBe(false);
    expect(currentClient.refreshes).toEqual([{ orgId: ORG_ID, tableCode: TABLE_CODE }]);
    expect(currentClient.auditEntries, 'soft-delete must record audit_log').toHaveLength(1);
    expect(currentClient.auditEntries[0]?.action).toBe('reference.row.soft_delete');
    expect(currentClient.outboxEntries, 'soft-delete must enqueue outbox event').toHaveLength(1);
    expect(currentClient.outboxEntries[0]?.event_type).toBe('reference.row.soft_deleted');
    expect(
      currentClient.calls.some(
        (call) =>
          call.sql.replace(/\s+/g, ' ').toLowerCase().includes('count(') &&
          call.sql.replace(/\s+/g, ' ').toLowerCase().includes('from public.reference_tables') &&
          call.params.map(String).includes(ROW_KEY),
      ),
      'FK reference count must query reference_tables for the actual row_key — no hardcoded zero',
    ).toBe(true);
  });

  it('softDelete with no schema references returns no warning and still emits audit + outbox', async () => {
    currentClient = makeClient({ schemaReferences: [], referencingRows: [] });
    const softDeleteReferenceRow = await loadAction<
      (input: { tableCode: string; rowKey: string; expectedVersion: number }) => Promise<{
        ok: boolean;
        warning?: { code: string };
        data?: { isActive: boolean };
      }>
    >('soft-delete.ts', 'softDeleteReferenceRow', () => import(`${__dirname}/soft-delete.ts`) as Promise<Record<string, unknown>>);

    const result = await softDeleteReferenceRow({ tableCode: TABLE_CODE, rowKey: ROW_KEY, expectedVersion: 3 });
    expect(result).toMatchObject({ ok: true, data: { isActive: false } });
    expect(result.warning, 'no schema reference → no warning').toBeUndefined();
    expect(currentClient.auditEntries).toHaveLength(1);
    expect(currentClient.outboxEntries).toHaveLength(1);
  });
});
