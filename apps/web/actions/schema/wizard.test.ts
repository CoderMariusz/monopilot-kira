import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidatePath } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidatePath: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: _revalidatePath,
}));

const repoRoot = resolve(__dirname, '../../../..');
const addColumnPath = resolve(repoRoot, 'apps/web/actions/schema/add-column.ts');
const editColumnPath = resolve(repoRoot, 'apps/web/actions/schema/edit-column.ts');
const deprecateColumnPath = resolve(repoRoot, 'apps/web/actions/schema/deprecate-column.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const APPROVER_ID = '33333333-3333-4333-8333-333333333333';
const EXISTING_COLUMN_ID = '44444444-4444-4444-8444-444444444444';

type QueryCall = { sql: string; params: unknown[] };
type StoredColumn = {
  id: string;
  org_id: string | null;
  table_code: string;
  column_code: string;
  data_type: string;
  tier: 'L1' | 'L2' | 'L3' | 'L4';
  storage: string;
  schema_version: number;
  dropdown_source: string | null;
  validation_json: Record<string, unknown> | null;
  presentation_json: Record<string, unknown> | null;
  deprecated_at: string | null;
};

type StoredMigration = {
  org_id: string;
  table_code: string;
  column_code: string;
  action: string;
  tier_after: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  migration_script: string | null;
  result_notes: string | null;
};

type StoredOutbox = {
  org_id: string;
  event_type: string;
  aggregate_type: string;
  payload: Record<string, unknown>;
};

type FakeClient = {
  calls: QueryCall[];
  referenceTables: Set<string>;
  columns: Map<string, StoredColumn>;
  migrations: StoredMigration[];
  outboxEvents: StoredOutbox[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

type AddColumn = {
  addColumn: (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }>;
};
type EditColumn = {
  editColumn: (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }>;
};
type DeprecateColumn = {
  deprecateColumn: (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'schema-session', client: currentClient }),
  );
});

describe('schema admin wizard Server Actions (T-023)', () => {
  it('V-SET-01: rejects unsupported data_type with discriminator INVALID_DATA_TYPE', async () => {
    const { addColumn } = await loadAddColumn();

    const result = await addColumn({
      tableCode: 'main_table',
      columnCode: 'invalid_kind',
      scope: 'org-specific',
      dataType: 'boolean',
      expectedSchemaVersion: 1,
    });

    expect(result).toEqual({
      ok: false,
      error: 'INVALID_DATA_TYPE',
      data: expect.objectContaining({ allowed: expect.arrayContaining(['text', 'number', 'date', 'enum', 'formula', 'relation']) }),
    });
    expect(writeCalls(), 'V-SET-01 must fail before any reference_schemas/schema_migrations/outbox writes').toHaveLength(0);
  });

  it('V-SET-02: rejects nonexistent dropdown_source with discriminator DROPDOWN_SOURCE_FK_VIOLATION', async () => {
    const { addColumn } = await loadAddColumn();

    const result = await addColumn({
      tableCode: 'main_table',
      columnCode: 'pack_finish',
      scope: 'variation',
      dataType: 'enum',
      dropdownSource: 'nonexistent_table',
      expectedSchemaVersion: 1,
    });

    expect(result).toEqual({
      ok: false,
      error: 'DROPDOWN_SOURCE_FK_VIOLATION',
      data: expect.objectContaining({ dropdownSource: 'nonexistent_table' }),
    });
    expect(writeCalls(), 'V-SET-02 must fail before any reference_schemas/schema_migrations/outbox writes').toHaveLength(0);
  });

  it('dry-run: auto-detects scope=variation as L2 and returns a plan without persistence', async () => {
    const { addColumn } = await loadAddColumn();

    const result = await addColumn({
      tableCode: 'main_table',
      columnCode: 'pack_finish_dry',
      scope: 'variation',
      dataType: 'enum',
      dropdownSource: 'pack_sizes',
      validationJson: { required: true },
      presentationJson: { section: 'Packaging', order: 30 },
      expectedSchemaVersion: 1,
      dryRun: true,
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ tier: 'L2', storage: 'tenant_variations', dryRun: true }),
    });
    expect(writeCalls(), 'dry-run must validate and plan, not mutate reference_schemas/schema_migrations/outbox').toHaveLength(0);
  });

  it('V-SET-03: L1 promotion without approved_by queues schema_migrations row with status=pending and emits outbox; no DDL', async () => {
    const { addColumn } = await loadAddColumn();

    const result = await addColumn({
      tableCode: 'main_table',
      columnCode: 'carbon_score',
      scope: 'universal',
      dataType: 'number',
      validationJson: { range: { min: 0, max: 100 } },
      presentationJson: { section: 'Sustainability', order: 90 },
      // NOTE: no approvedBy / approvedAt — V-SET-03 requires this path to
      // result in a pending row (admin requests promotion; superadmin approves later).
      expectedSchemaVersion: 1,
      dryRun: false,
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ tier: 'L1', migrationStatus: 'pending' }),
    });
    // schema_migrations row created, status='pending', approved_by IS NULL
    expect(currentClient.migrations).toEqual([
      expect.objectContaining({
        action: 'promote_l2_to_l1',
        table_code: 'main_table',
        column_code: 'carbon_score',
        tier_after: 'L1',
        status: 'pending',
        approved_by: null,
        approved_at: null,
      }),
    ]);
    // outbox event emitted in same context
    expect(currentClient.outboxEvents).toEqual([
      expect.objectContaining({
        event_type: 'settings.schema.migration_requested',
        org_id: ORG_ID,
      }),
    ]);
    // no live DDL on the action path
    expect(ddlCalls(), 'L1 promotion Server Action must not execute live DDL').toHaveLength(0);
  });

  it('V-SET-03: L1 promotion with explicit approved_by is also routed to schema_migrations queue (no live DDL)', async () => {
    const { addColumn } = await loadAddColumn();

    const result = await addColumn({
      tableCode: 'main_table',
      columnCode: 'lifecycle_score',
      scope: 'universal',
      dataType: 'number',
      validationJson: { range: { min: 0, max: 100 } },
      presentationJson: { section: 'Sustainability', order: 91 },
      approvedBy: APPROVER_ID,
      approvedAt: '2026-05-19T08:00:00.000Z',
      expectedSchemaVersion: 1,
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ tier: 'L1', migrationStatus: 'pending' }),
    });
    expect(currentClient.migrations).toContainEqual(
      expect.objectContaining({
        action: 'promote_l2_to_l1',
        table_code: 'main_table',
        column_code: 'lifecycle_score',
        status: 'pending',
        approved_by: APPROVER_ID,
        approved_at: '2026-05-19T08:00:00.000Z',
      }),
    );
    expect(ddlCalls(), 'approved L1 promotion path still never executes live DDL').toHaveLength(0);
  });

  it('V-SET-04: editColumn rejects stale schema_version with discriminator CONCURRENT_EDIT and returns diff', async () => {
    const { editColumn } = await loadEditColumn();

    const result = await editColumn({
      tableCode: 'main_table',
      columnCode: 'pack_finish',
      expectedSchemaVersion: 1,
      patch: { presentationJson: { section: 'Packaging', order: 31 } },
    });

    expect(result).toEqual({
      ok: false,
      error: 'CONCURRENT_EDIT',
      data: expect.objectContaining({ currentSchemaVersion: 2, diff: expect.any(Object) }),
    });
    expect(writeCalls(), 'CONCURRENT_EDIT must not mutate schema or emit outbox').toHaveLength(0);
  });

  it('V-SET-04: deprecateColumn rejects stale schema_version with discriminator CONCURRENT_EDIT and returns diff', async () => {
    const { deprecateColumn } = await loadDeprecateColumn();

    const result = await deprecateColumn({
      tableCode: 'main_table',
      columnCode: 'pack_finish',
      expectedSchemaVersion: 1,
      reason: 'superseded by packaging_finish_v2',
    });

    expect(result).toEqual({
      ok: false,
      error: 'CONCURRENT_EDIT',
      data: expect.objectContaining({ currentSchemaVersion: 2, diff: expect.any(Object) }),
    });
    expect(writeCalls(), 'CONCURRENT_EDIT must not mutate schema or emit outbox').toHaveLength(0);
  });
});

async function loadAddColumn(): Promise<AddColumn> {
  expect(existsSync(addColumnPath), 'apps/web/actions/schema/add-column.ts must exist and export addColumn(input)').toBe(true);
  const mod = (await import(addColumnPath)) as Partial<AddColumn>;
  if (typeof mod.addColumn !== 'function') expect.fail('apps/web/actions/schema/add-column.ts must export addColumn(input)');
  return mod as AddColumn;
}

async function loadEditColumn(): Promise<EditColumn> {
  expect(existsSync(editColumnPath), 'apps/web/actions/schema/edit-column.ts must exist and export editColumn(input)').toBe(true);
  const mod = (await import(editColumnPath)) as Partial<EditColumn>;
  if (typeof mod.editColumn !== 'function') expect.fail('apps/web/actions/schema/edit-column.ts must export editColumn(input)');
  return mod as EditColumn;
}

async function loadDeprecateColumn(): Promise<DeprecateColumn> {
  expect(
    existsSync(deprecateColumnPath),
    'apps/web/actions/schema/deprecate-column.ts must exist and export deprecateColumn(input)',
  ).toBe(true);
  const mod = (await import(deprecateColumnPath)) as Partial<DeprecateColumn>;
  if (typeof mod.deprecateColumn !== 'function') {
    expect.fail('apps/web/actions/schema/deprecate-column.ts must export deprecateColumn(input)');
  }
  return mod as DeprecateColumn;
}

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    referenceTables: new Set(['pack_sizes', 'allergens_reference']),
    columns: new Map<string, StoredColumn>([
      [
        'main_table:pack_finish',
        {
          id: EXISTING_COLUMN_ID,
          org_id: ORG_ID,
          table_code: 'main_table',
          column_code: 'pack_finish',
          data_type: 'enum',
          tier: 'L2',
          storage: 'tenant_variations',
          schema_version: 2,
          dropdown_source: 'pack_sizes',
          validation_json: { required: true },
          presentation_json: { section: 'Packaging', order: 30 },
          deprecated_at: null,
        },
      ],
    ]),
    migrations: [],
    outboxEvents: [],
    async query(sql: string, params: unknown[] = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (/\b(alter|create|drop|truncate)\s+(table|index|schema|column)\b/i.test(normalized)) {
        throw new Error(`DDL is out of scope for schema admin Server Actions: ${sql}`);
      }

      if (normalized.includes('from public.user_roles') || normalized.includes('settings.schema.edit')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (normalized.includes('from public.reference_tables')) {
        const tableCode = params.find((param): param is string => typeof param === 'string');
        const exists = tableCode ? client.referenceTables.has(tableCode) : false;
        return { rows: exists ? [{ table_code: tableCode }] : [], rowCount: exists ? 1 : 0 };
      }

      if (normalized.includes('from public.reference_schemas')) {
        const tableCode = String(params[0] ?? '');
        const columnCode = String(params[1] ?? '');
        const row = client.columns.get(`${tableCode}:${columnCode}`);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes('insert into public.reference_schemas')) {
        const row: StoredColumn = {
          id: EXISTING_COLUMN_ID,
          org_id: ORG_ID,
          table_code: stringParam(params, 'main_table'),
          column_code: stringParam(params, 'pack_finish_dry'),
          data_type: stringParam(params, 'enum'),
          tier: 'L2',
          storage: 'tenant_variations',
          schema_version: 1,
          dropdown_source: null,
          validation_json: {},
          presentation_json: {},
          deprecated_at: null,
        };
        client.columns.set(`${row.table_code}:${row.column_code}`, row);
        return { rows: [row], rowCount: 1 };
      }

      if (normalized.includes('update public.reference_schemas')) {
        const tableCode = stringParam(params, 'main_table');
        const columnCode = stringParam(params, 'pack_finish');
        const existing = client.columns.get(`${tableCode}:${columnCode}`);
        if (!existing) return { rows: [], rowCount: 0 };
        const updated: StoredColumn = { ...existing, schema_version: existing.schema_version + 1 };
        client.columns.set(`${tableCode}:${columnCode}`, updated);
        return { rows: [updated], rowCount: 1 };
      }

      if (normalized.includes('insert into public.schema_migrations')) {
        const row = migrationFromParams(params);
        client.migrations.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (normalized.includes('insert into public.outbox_events')) {
        const event = outboxFromParams(params);
        client.outboxEvents.push(event);
        return { rows: [event], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function migrationFromParams(params: unknown[]): StoredMigration {
  const stringParams = params.filter((p): p is string => typeof p === 'string');
  const blob = JSON.stringify(params);
  const tableCode = stringParams.find((p) => p === 'main_table') ?? 'main_table';
  const columnCode =
    stringParams.find((p) => p === 'carbon_score' || p === 'lifecycle_score') ??
    stringParams.find((p) => /^[a-z][a-z0-9_]*$/.test(p) && p !== tableCode && p !== 'promote_l2_to_l1' && p !== 'L1' && p !== 'pending') ??
    '';
  return {
    org_id: ORG_ID,
    table_code: tableCode,
    column_code: columnCode,
    action: blob.includes('promote_l2_to_l1') ? 'promote_l2_to_l1' : 'schema_column_added',
    tier_after: blob.includes('"L1"') || blob.includes("'L1'") || blob.includes(',L1,') || stringParams.includes('L1') ? 'L1' : 'L2',
    status: blob.includes('pending') ? 'pending' : 'completed',
    approved_by: stringParams.find((p) => p === APPROVER_ID) ?? null,
    approved_at: stringParams.find((p) => /^\d{4}-\d{2}-\d{2}T/.test(p)) ?? null,
    migration_script: stringParams.find((p) => p.startsWith('{')) ?? null,
    result_notes: stringParams.find((p) => /queued|metadata/i.test(p)) ?? null,
  };
}

function outboxFromParams(params: unknown[]): StoredOutbox {
  const eventType = params.find((p): p is string => typeof p === 'string' && p.includes('.')) ?? '';
  const payloadParam = params.find((p): p is string => typeof p === 'string' && p.startsWith('{') && p.includes('table_code')) ?? '{}';
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(payloadParam) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    org_id: ORG_ID,
    event_type: eventType,
    aggregate_type: 'schema_migration',
    payload,
  };
}

function stringParam(params: unknown[], fallback: string): string {
  return params.find((param): param is string => typeof param === 'string' && param === fallback) ?? fallback;
}

function writeCalls(): QueryCall[] {
  return currentClient.calls.filter((call) =>
    /(insert\s+into|update|delete\s+from)\s+public\.(reference_schemas|schema_migrations|outbox_events)/i.test(call.sql),
  );
}

function ddlCalls(): QueryCall[] {
  return currentClient.calls.filter((call) => /\b(alter|create|drop|truncate)\s+(table|index|schema|column)\b/i.test(call.sql));
}
