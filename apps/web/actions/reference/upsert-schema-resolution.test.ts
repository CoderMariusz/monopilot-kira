import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression for the W5 Codex P2 finding: the WRITE/add-edit path on
 * /settings/processes + /settings/partners returned 'reference schema is not
 * configured' because loadGeneratedSchema (actions/reference/upsert.ts) could
 * not resolve the seeded reference_schemas rows:
 *
 *   (a) universal L1 schemas are seeded with org_id IS NULL but the lookup only
 *       matched org_id = app.current_org_id();
 *   (b) data rows use a bare table_code ('processes') while the schema rows live
 *       under 'reference.processes'.
 *
 * This fake client is SQL-faithful for the schema lookup: it honours
 * `table_code = any($1)`, the `(org_id = current or org_id is null)` predicate,
 * and `distinct on (column_code)` org-override preference — so a passing test
 * proves the *query shape*, not just a permissive stub.
 */

const ORG_ID = '00000000-0000-0000-0000-000000000002';
const OTHER_ORG_ID = '00000000-0000-0000-0000-000000000009';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';

type SchemaSeed = {
  org_id: string | null;
  table_code: string;
  column_code: string;
  data_type: string;
  required_for_done: boolean;
  validation_json: Record<string, unknown>;
};

// Mirrors the universal (org_id IS NULL) reference.processes schema as seeded by
// migration 074 + T-093 (packages/db/seeds/reference-schemas.sql:118-120).
const UNIVERSAL_PROCESSES_SCHEMA: SchemaSeed[] = [
  { org_id: null, table_code: 'reference.processes', column_code: 'process_code', data_type: 'text', required_for_done: true, validation_json: { required: true, unique: true } },
  { org_id: null, table_code: 'reference.processes', column_code: 'name', data_type: 'text', required_for_done: true, validation_json: { required: true } },
  { org_id: null, table_code: 'reference.processes', column_code: 'category', data_type: 'enum', required_for_done: false, validation_json: { required: false, enum_values: ['preparation', 'processing', 'packaging', 'quality', 'logistics'] } },
  { org_id: null, table_code: 'reference.processes', column_code: 'cost_mode', data_type: 'enum', required_for_done: true, validation_json: { required: true, enum_values: ['per_hour', 'per_run'] } },
  { org_id: null, table_code: 'reference.processes', column_code: 'cost_rate', data_type: 'number', required_for_done: false, validation_json: { required: false, min: 0, scale: 2 } },
  { org_id: null, table_code: 'reference.processes', column_code: 'currency', data_type: 'text', required_for_done: true, validation_json: { required: true, pattern: '^[A-Z]{3}$' } },
];

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

const { _runWithOrgContext } = vi.hoisted(() => ({ _runWithOrgContext: vi.fn() }));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));
vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

function makeClient(opts: { orgId?: string; schema?: SchemaSeed[]; existingRows?: ReferenceRow[] } = {}) {
  const orgId = opts.orgId ?? ORG_ID;
  const schema = opts.schema ?? UNIVERSAL_PROCESSES_SCHEMA;
  const rows = new Map<string, ReferenceRow>();
  for (const r of opts.existingRows ?? []) rows.set(`${r.table_code}:${r.row_key}`, r);

  const calls: QueryCall[] = [];
  const refreshes: Array<{ orgId: string; tableCode: string }> = [];

  const client = {
    calls,
    refreshes,
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      // permission grant — always allow edit
      if (norm.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }

      // loadGeneratedSchema — SQL-faithful resolution
      if (norm.includes('from public.reference_schemas')) {
        const tableCodes = (params[0] as string[]) ?? [];
        const matched = schema.filter(
          (s) => tableCodes.includes(s.table_code) && (s.org_id === orgId || s.org_id === null),
        );
        // distinct on (column_code) order by column_code, org_id nulls last
        const byColumn = new Map<string, SchemaSeed>();
        for (const s of [...matched].sort((a, b) => {
          if (a.column_code !== b.column_code) return a.column_code < b.column_code ? -1 : 1;
          // org-scoped (non-null) before null
          if (a.org_id === b.org_id) return 0;
          return a.org_id === null ? 1 : -1;
        })) {
          if (!byColumn.has(s.column_code)) byColumn.set(s.column_code, s);
        }
        const resolved = [...byColumn.values()].map((s) => ({
          column_code: s.column_code,
          data_type: s.data_type,
          required_for_done: s.required_for_done,
          validation_json: s.validation_json,
        }));
        return { rows: resolved as never[], rowCount: resolved.length };
      }

      if (norm.includes('app.refresh_reference_table_mv')) {
        refreshes.push({ orgId: String(params[0]), tableCode: String(params[1]) });
        return { rows: [] as never[], rowCount: 1 };
      }
      if (norm.startsWith('insert into public.audit_log') || norm.startsWith('insert into public.outbox_events')) {
        return { rows: [{ id: 1 }] as never[], rowCount: 1 };
      }

      // getExistingRow
      if (norm.startsWith('select') && norm.includes('from public.reference_tables')) {
        const tc = String(params[0]);
        const rk = String(params[1]);
        const row = rows.get(`${tc}:${rk}`);
        return { rows: (row ? [row] : []) as never[], rowCount: row ? 1 : 0 };
      }

      if (norm.startsWith('insert into public.reference_tables')) {
        const [pOrg, tc, rk, rowData, displayOrder] = params;
        const row: ReferenceRow = {
          org_id: String(pOrg),
          table_code: String(tc),
          row_key: String(rk),
          row_data: rowData as Record<string, unknown>,
          version: 1,
          is_active: true,
          display_order: Number(displayOrder ?? 0),
        };
        rows.set(`${row.table_code}:${row.row_key}`, row);
        return { rows: [row] as never[], rowCount: 1 };
      }

      return { rows: [] as never[], rowCount: 0 };
    },
  };
  return client;
}

let currentClient: ReturnType<typeof makeClient>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 't', client: currentClient }),
  );
});

async function loadUpsert() {
  const mod = (await import(`${__dirname}/upsert.ts`)) as Record<string, unknown>;
  return mod.upsertReferenceRow as (input: unknown) => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>;
}

describe('upsertReferenceRow schema resolution (W5 P2 fix)', () => {
  it('resolves universal reference.<code> schema from the bare data table_code and validates required columns', async () => {
    currentClient = makeClient({ orgId: ORG_ID });
    _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 't', client: currentClient }),
    );
    const upsertReferenceRow = await loadUpsert();

    // Missing required process_code must now be CAUGHT by validation
    // (proves the schema was resolved — previously it returned
    // 'reference schema is not configured' because 0 columns were found).
    const missingCode = await upsertReferenceRow({
      tableCode: 'processes',
      rowKey: 'BLENDING',
      rowData: { name: 'Ingredient blending', category: 'preparation', cost_mode: 'per_hour', currency: 'EUR' },
    });
    expect(missingCode).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(missingCode.message).toBe('process_code is required');
    expect(missingCode.message).not.toBe('reference schema is not configured');

    // The lookup must have queried with BOTH bare + namespaced table_code.
    const schemaCall = currentClient.calls.find((c) => c.sql.toLowerCase().includes('from public.reference_schemas'));
    expect(schemaCall, 'schema lookup must run').toBeTruthy();
    expect(schemaCall?.params[0]).toEqual(expect.arrayContaining(['processes', 'reference.processes']));
  });

  it('inserts a processes row when all required schema columns are present', async () => {
    currentClient = makeClient({ orgId: ORG_ID });
    _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 't', client: currentClient }),
    );
    const upsertReferenceRow = await loadUpsert();

    const ok = await upsertReferenceRow({
      tableCode: 'processes',
      rowKey: 'BLENDING',
      rowData: { process_code: 'BLENDING', name: 'Ingredient blending', category: 'preparation', cost_mode: 'per_hour', cost_rate: '12.50', currency: 'EUR' },
    });
    expect(ok).toMatchObject({ ok: true });
    expect(currentClient.refreshes).toEqual([{ orgId: ORG_ID, tableCode: 'processes' }]);
  });

  it('universal schema resolves for a DIFFERENT org too (org_id IS NULL is visible to every org)', async () => {
    currentClient = makeClient({ orgId: OTHER_ORG_ID });
    _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: OTHER_ORG_ID, sessionToken: 't', client: currentClient }),
    );
    const upsertReferenceRow = await loadUpsert();

    const missingCode = await upsertReferenceRow({
      tableCode: 'processes',
      rowKey: 'COOLING',
      rowData: { name: 'Cooling', cost_mode: 'per_hour', currency: 'EUR' },
    });
    // Schema found (universal) → validation fires on the missing required col,
    // NOT the 'not configured' fallback.
    expect(missingCode).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(missingCode.message).toBe('process_code is required');
  });

  it('validates process costing mode, exact two-decimal rate, and ISO-style currency before insert', async () => {
    const upsertReferenceRow = await loadUpsert();

    await expect(upsertReferenceRow({
      tableCode: 'processes',
      rowKey: 'BADMODE',
      rowData: { process_code: 'BADMODE', name: 'Bad mode', category: 'preparation', cost_mode: 'hourly', cost_rate: '1.00', currency: 'EUR' },
    })).resolves.toMatchObject({ ok: false, error: 'invalid_input', message: 'cost_mode has invalid enum value' });

    await expect(upsertReferenceRow({
      tableCode: 'processes',
      rowKey: 'BADRATE',
      rowData: { process_code: 'BADRATE', name: 'Bad rate', category: 'preparation', cost_mode: 'per_hour', cost_rate: '1.999', currency: 'EUR' },
    })).resolves.toMatchObject({ ok: false, error: 'invalid_input', message: 'cost_rate has invalid number value' });

    await expect(upsertReferenceRow({
      tableCode: 'processes',
      rowKey: 'BADCURRENCY',
      rowData: { process_code: 'BADCURRENCY', name: 'Bad currency', category: 'preparation', cost_mode: 'per_run', cost_rate: '30.00', currency: 'EURO' },
    })).resolves.toMatchObject({ ok: false, error: 'invalid_input', message: 'currency has invalid text value' });
  });
});
