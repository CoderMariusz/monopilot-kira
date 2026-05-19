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
  deprecated_at: string | null;
};

type FakeClient = {
  calls: QueryCall[];
  referenceTables: Set<string>;
  columns: Map<string, StoredColumn>;
  migrations: Array<Record<string, unknown>>;
  outboxEvents: Array<Record<string, unknown>>;
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

describe('schema admin wizard Server Actions (TASK-000132/T-023 RED)', () => {
  it('V-SET-01/02: rejects invalid data_type and missing dropdown_source before any write', async () => {
    const { addColumn } = await loadAddColumn();

    const badType = await addColumn({
      tableCode: 'main_table',
      columnCode: 'invalid_kind',
      scope: 'org-specific',
      dataType: 'json_blob',
      expectedSchemaVersion: 1,
    });
    expect(badType).toEqual({ ok: false, error: 'invalid_input' });

    const missingDropdown = await addColumn({
      tableCode: 'main_table',
      columnCode: 'pack_finish',
      scope: 'variation',
      dataType: 'enum',
      dropdownSource: 'missing_reference_table',
      expectedSchemaVersion: 1,
    });
    expect(missingDropdown).toEqual({ ok: false, error: 'invalid_dropdown_source' });
    expect(writeCalls(), 'invalid schema inputs must not insert/update schema or outbox rows').toHaveLength(0);
  });

  it('dry-run: auto-detects scope=variation as L2 and returns a plan without persistence', async () => {
    const { addColumn } = await loadAddColumn();

    const result = await addColumn({
      tableCode: 'main_table',
      columnCode: 'pack_finish',
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

  it('V-SET-03/L1: queues universal promotions, emits settings.schema.migration_requested, and never executes DDL', async () => {
    const { addColumn } = await loadAddColumn();

    const result = await addColumn({
      tableCode: 'main_table',
      columnCode: 'carbon_score',
      scope: 'universal',
      dataType: 'number',
      validationJson: { range: { min: 0, max: 100 } },
      presentationJson: { section: 'Sustainability', order: 90 },
      approvedBy: APPROVER_ID,
      approvedAt: '2026-05-19T08:00:00.000Z',
      expectedSchemaVersion: 1,
      dryRun: false,
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ tier: 'L1', migrationStatus: 'pending' }),
    });
    expect(currentClient.migrations).toContainEqual(
      expect.objectContaining({
        action: 'promote_l2_to_l1',
        table_code: 'main_table',
        column_code: 'carbon_score',
        tier_after: 'L1',
        status: 'pending',
        approved_by: APPROVER_ID,
      }),
    );
    expect(currentClient.outboxEvents).toContainEqual(
      expect.objectContaining({ event_type: 'settings.schema.migration_requested', org_id: ORG_ID }),
    );
    expect(ddlCalls(), 'L1 promotion Server Action must not execute live DDL').toHaveLength(0);
  });

  it('V-SET-04: editColumn and deprecateColumn reject stale schema_version with a conflict diff and no mutation', async () => {
    const { editColumn } = await loadEditColumn();
    const { deprecateColumn } = await loadDeprecateColumn();

    const editResult = await editColumn({
      tableCode: 'main_table',
      columnCode: 'pack_finish',
      expectedSchemaVersion: 1,
      patch: { presentationJson: { section: 'Packaging', order: 31 } },
    });
    const deprecateResult = await deprecateColumn({
      tableCode: 'main_table',
      columnCode: 'pack_finish',
      expectedSchemaVersion: 1,
      reason: 'superseded by packaging_finish_v2',
    });

    expect(editResult).toEqual({
      ok: false,
      error: 'schema_version_conflict',
      data: expect.objectContaining({ currentSchemaVersion: 2, diff: expect.any(Object) }),
    });
    expect(deprecateResult).toEqual({
      ok: false,
      error: 'schema_version_conflict',
      data: expect.objectContaining({ currentSchemaVersion: 2, diff: expect.any(Object) }),
    });
    expect(writeCalls(), 'stale publish/deprecate attempts must not update schema or emit outbox').toHaveLength(0);
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
    columns: new Map([
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
        const tableCode = params.find((param): param is string => param === 'main_table') ?? String(params[0] ?? '');
        const columnCode = params.find((param): param is string => param === 'pack_finish' || param === 'carbon_score') ?? String(params[1] ?? '');
        const row = client.columns.get(`${tableCode}:${columnCode}`);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes('insert into public.reference_schemas')) {
        const row = rowFromParams(params);
        client.columns.set(`${row.table_code}:${row.column_code}`, row);
        return { rows: [row], rowCount: 1 };
      }

      if (normalized.includes('update public.reference_schemas')) {
        const tableCode = params.find((param): param is string => param === 'main_table') ?? 'main_table';
        const columnCode = params.find((param): param is string => param === 'pack_finish') ?? 'pack_finish';
        const existing = client.columns.get(`${tableCode}:${columnCode}`);
        if (!existing) return { rows: [], rowCount: 0 };
        const updated = { ...existing, schema_version: existing.schema_version + 1 };
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

function rowFromParams(params: unknown[]): StoredColumn {
  return {
    id: EXISTING_COLUMN_ID,
    org_id: ORG_ID,
    table_code: stringParam(params, 'main_table'),
    column_code: stringParam(params, 'carbon_score'),
    data_type: stringParam(params, 'number'),
    tier: 'L3',
    storage: 'ext_jsonb',
    schema_version: 1,
    deprecated_at: null,
  };
}

function migrationFromParams(params: unknown[]): Record<string, unknown> {
  const blob = JSON.stringify(params);
  return {
    org_id: ORG_ID,
    table_code: blob.includes('main_table') ? 'main_table' : params[1],
    column_code: blob.includes('carbon_score') ? 'carbon_score' : params[2],
    action: blob.includes('promote_l2_to_l1') ? 'promote_l2_to_l1' : params[3],
    tier_after: blob.includes('L1') ? 'L1' : params[5],
    status: blob.includes('pending') ? 'pending' : 'completed',
    approved_by: blob.includes(APPROVER_ID) ? APPROVER_ID : null,
  };
}

function outboxFromParams(params: unknown[]): Record<string, unknown> {
  const eventType = params.find((param): param is string => typeof param === 'string' && param.includes('.'));
  return { org_id: ORG_ID, event_type: eventType, params };
}

function stringParam(params: unknown[], fallback: string): string {
  return params.find((param): param is string => typeof param === 'string' && param.length > 0) ?? fallback;
}

function writeCalls(): QueryCall[] {
  return currentClient.calls.filter((call) =>
    /(insert\s+into|update|delete\s+from)\s+public\.(reference_schemas|schema_migrations|outbox_events)/i.test(call.sql),
  );
}

function ddlCalls(): QueryCall[] {
  return currentClient.calls.filter((call) => /\b(alter|create|drop|truncate)\s+(table|index|schema|column)\b/i.test(call.sql));
}
