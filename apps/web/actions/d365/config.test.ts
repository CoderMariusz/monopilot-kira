import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
const REDACTED_SECRET = '[REDACTED]';

const { _runWithOrgContext } = vi.hoisted(() => ({
  _runWithOrgContext: vi.fn(),
}));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

type QueryCall = { sql: string; params: readonly unknown[] };
type AuditRow = { action: string; resource_type: string; after_state: unknown };
type ReferenceRow = {
  org_id: string;
  table_code: string;
  row_key: string;
  row_data: Record<string, unknown>;
  is_active: boolean;
};

type FakeClient = {
  calls: QueryCall[];
  referenceRows: ReferenceRow[];
  auditRows: AuditRow[];
  hasD365Permission: boolean;
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: T[]; rowCount: number }>;
};

const allowedConstants = new Map<string, string>([
  ['PRODUCTIONSITEID', 'FNOR'],
  ['APPROVERPERSONNELNUMBER', 'APX100048'],
  ['CONSUMPTIONWAREHOUSEID', 'ApexDG'],
  ['PRODUCTGROUPID', 'FinGoods'],
  ['COSTINGOPERATIONRESOURCEID', 'APXProd01'],
]);

function makeClient(options: { hasD365Permission?: boolean } = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    referenceRows: Array.from(allowedConstants, ([rowKey, value]) => ({
      org_id: ORG_ID,
      table_code: 'd365_constants',
      row_key: rowKey,
      row_data: { value },
      is_active: true,
    })),
    auditRows: [],
    hasD365Permission: options.hasD365Permission ?? true,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      const paramsText = params.map(String).join(' ').toLowerCase();

      if (normalized.includes('from public.user_roles')) {
        const asksD365Permission = paramsText.includes('settings.d365') || normalized.includes('settings.d365');
        const hasPermissionJoin = normalized.includes('role_permissions');
        const allowed = asksD365Permission && hasPermissionJoin && client.hasD365Permission;
        return { rows: (allowed ? [{ ok: true }] : []) as never[], rowCount: allowed ? 1 : 0 };
      }

      if (normalized.includes('from public.reference_tables')) {
        const tableCode = String(params.find((p) => p === 'd365_constants') ?? 'd365_constants');
        const rowKey = params.find((p) => typeof p === 'string' && allowedConstants.has(p));
        const rows = client.referenceRows.filter(
          (row) => row.table_code === tableCode && (rowKey ? row.row_key === rowKey : true) && row.is_active,
        );
        return { rows: rows as never[], rowCount: rows.length };
      }

      if (normalized.startsWith('insert into public.reference_tables') || normalized.startsWith('update public.reference_tables')) {
        const tableCode = String(params.find((p) => p === 'd365_constants') ?? '');
        const rowKey = String(params.find((p) => typeof p === 'string' && allowedConstants.has(p)) ?? '');
        const rowData = params.find((p) => p && typeof p === 'object' && !Array.isArray(p)) as Record<string, unknown> | undefined;
        if (tableCode && rowKey && rowData) {
          const existing = client.referenceRows.find((row) => row.table_code === tableCode && row.row_key === rowKey);
          if (existing) existing.row_data = rowData;
          else client.referenceRows.push({ org_id: ORG_ID, table_code: tableCode, row_key: rowKey, row_data: rowData, is_active: true });
        }
        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.audit_log') || normalized.startsWith('insert into public.audit_events')) {
        const action = String(params.find((p) => typeof p === 'string' && p.includes('d365')) ?? 'd365_connection_test');
        const afterRaw = params[params.length - 1];
        client.auditRows.push({
          action,
          resource_type: normalized.includes('audit_events') ? 'audit_events' : 'audit_log',
          after_state: typeof afterRaw === 'string' ? safeJsonParse(afterRaw) : afterRaw,
        });
        return { rows: [{ id: `audit-${client.auditRows.length}` }] as never[], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function safeJsonParse(value: string): unknown {
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
  vi.unstubAllGlobals();
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
      expect.fail(`D365 RED contract: ${moduleLabel} must export ${exportName} Server Action`);
    }
    return action as T;
  } catch (error) {
    expect.fail(
      `D365 RED contract: ${moduleLabel} must be implemented and export ${exportName}; got ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function importD365Module(modulePath: string): Promise<Record<string, unknown>> {
  const absoluteModulePath = `${__dirname}/${modulePath.replace(/^\.\//, '')}`;
  return import(absoluteModulePath) as Promise<Record<string, unknown>>;
}

describe('D365 constants and connection Server Actions (T-030 RED)', () => {
  it('setD365Constant rejects keys outside the five P1 D365 constants whitelist', async () => {
    const setD365Constant = await loadAction<
      (input: { key: string; value: string }) => Promise<{ ok: boolean; error?: string }>
    >('set-constant.ts', 'setD365Constant', () => importD365Module('./set-constant.js'));

    const result = await setD365Constant({ key: 'CUSTOMERACCOUNTIDMAP', value: '{"customer":"C-001"}' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_constant');
    expect(
      currentClient.calls.filter((call) =>
        /insert into public\.reference_tables|update public\.reference_tables/i.test(call.sql),
      ),
      'non-whitelisted D365 constants must not be persisted to reference_tables',
    ).toHaveLength(0);
  });

  it('setD365Constant updates an existing whitelisted constant without referencing nonexistent columns', async () => {
    const setD365Constant = await loadAction<
      (input: { key: string; value: string }) => Promise<{ ok: boolean; error?: string }>
    >('set-constant.ts', 'setD365Constant', () => importD365Module('./set-constant.js'));

    const result = await setD365Constant({ key: 'PRODUCTIONSITEID', value: 'FNOR-2' });

    expect(result.ok).toBe(true);
    const updateSql = currentClient.calls.find((call) => /update public\.reference_tables/i.test(call.sql))?.sql ?? '';
    expect(updateSql, 'reference_tables migration 041 has no updated_by column').not.toMatch(/updated_by/i);
  });

  it('testD365Connection performs HTTPS GET to $metadata with OAuth bearer and writes an audit row', async () => {
    const fetchMock = vi.fn(async () => new Response('<edmx:Edmx />', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const testD365Connection = await loadAction<
      (input: { baseUrl: string; oauthBearer: string }) => Promise<{ ok: boolean; error?: string }>
    >('test-connection.ts', 'testD365Connection', () => importD365Module('./test-connection.js'));

    const result = await testD365Connection({ baseUrl: 'https://d365.example.test', oauthBearer: REDACTED_SECRET });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://d365.example.test/$metadata',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: `Bearer ${REDACTED_SECRET}` }),
      }),
    );
    expect(currentClient.auditRows.some((row) => row.action.includes('d365_connection_test'))).toBe(true);
  });

  it('testD365Connection writes an audit row when the metadata endpoint is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unreachable', { status: 503 })),
    );
    const testD365Connection = await loadAction<
      (input: { baseUrl: string; oauthBearer: string }) => Promise<{ ok: boolean; error?: string }>
    >('test-connection.ts', 'testD365Connection', () => importD365Module('./test-connection.js'));

    const result = await testD365Connection({ baseUrl: 'https://d365.example.test', oauthBearer: REDACTED_SECRET });

    expect(result).toEqual({ ok: false, error: 'connection_failed' });
    const auditRow = currentClient.auditRows.find((row) => row.action.includes('d365_connection_test'));
    expect(auditRow, 'failed connection tests must write audit_log').toBeDefined();
    expect(JSON.stringify(auditRow), 'audit row must not include OAuth bearer plaintext').not.toContain(REDACTED_SECRET);
    expect(JSON.stringify(auditRow?.after_state)).toContain('failed');
  });

  it('rotateD365Secret returns vault_unconfigured until a real vault stores the secret', async () => {
    const rotateD365Secret = await loadAction<
      (input: { clientId: string; clientSecret: string }) => Promise<{ ok: boolean; error?: string; data?: { vaultKey?: string } }>
    >('rotate-secret.ts', 'rotateD365Secret', () => importD365Module('./rotate-secret.js'));

    const result = await rotateD365Secret({ clientId: 'd365-service-client', clientSecret: REDACTED_SECRET });

    expect(result).toEqual({ ok: false, error: 'vault_unconfigured' });
    const persistedParams = JSON.stringify(currentClient.calls.map((call) => call.params));
    const persistedSql = currentClient.calls.map((call) => call.sql).join('\n');
    expect(persistedParams, 'plaintext D365 service account secret must never be sent to DB writes').not.toContain(REDACTED_SECRET);
    expect(persistedSql, 'reference_tables migration 041 has no updated_by column').not.toMatch(/updated_by/i);
    expect(currentClient.auditRows.some((row) => JSON.stringify(row).includes(REDACTED_SECRET))).toBe(false);
    expect(
      currentClient.calls.filter((call) => /insert into public\.reference_tables|insert into public\.audit_log/i.test(call.sql)),
      'vault-unconfigured rotations must not persist fake secret refs or success audit rows',
    ).toHaveLength(0);
  });
});
