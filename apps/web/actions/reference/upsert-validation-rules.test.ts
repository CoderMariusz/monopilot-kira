/**
 * S11 Z-3 / Z-4 — reference row writes.
 *
 * Z-3: one uncompilable `pattern` stored on ONE column used to make EVERY write
 *      to that table fail with `persistence_failed` (bare `new RegExp` inside
 *      the row validator, generic catch in the action) — the table became
 *      permanently uneditable and the message blamed the database.
 * Z-4: the column wizard offers a `max` and stores it; the executor only ever
 *      read `min`, so `5000` against `max: 100` returned `{ ok: true }`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '00000000-0000-0000-0000-000000000002';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';

type SchemaSeed = {
  column_code: string;
  data_type: string;
  required_for_done: boolean;
  validation_json: Record<string, unknown>;
};

const { _runWithOrgContext } = vi.hoisted(() => ({ _runWithOrgContext: vi.fn() }));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));
vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

function makeClient(schema: SchemaSeed[]) {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (norm.includes('from public.user_roles')) return { rows: [{ ok: true }] as never[], rowCount: 1 };
      if (norm.includes('from public.reference_schemas')) return { rows: schema as never[], rowCount: schema.length };
      if (norm.includes('app.refresh_reference_table_mv')) return { rows: [] as never[], rowCount: 1 };
      if (norm.startsWith('insert into public.audit_log') || norm.startsWith('insert into public.outbox_events')) {
        return { rows: [{ id: 1 }] as never[], rowCount: 1 };
      }
      if (norm.startsWith('select') && norm.includes('from public.reference_tables')) return { rows: [] as never[], rowCount: 0 };
      if (norm.startsWith('insert into public.reference_tables')) {
        const [, tableCode, rowKey, rowData] = params;
        return {
          rows: [{
            org_id: ORG_ID,
            table_code: String(tableCode),
            row_key: String(rowKey),
            row_data: rowData as Record<string, unknown>,
            version: 1,
            is_active: true,
            display_order: 0,
          }] as never[],
          rowCount: 1,
        };
      }
      return { rows: [] as never[], rowCount: 0 };
    },
  };
}

function useSchema(schema: SchemaSeed[]) {
  const client = makeClient(schema);
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 't', client }),
  );
}

type UpsertResult = { ok: boolean; error?: string; message?: string };

async function loadUpsert() {
  const mod = (await import(`${__dirname}/upsert.ts`)) as Record<string, unknown>;
  return mod.upsertReferenceRow as (input: unknown) => Promise<UpsertResult>;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('Z-3 a broken pattern must not brick the whole table', () => {
  const BROKEN = [
    { column_code: 'code', data_type: 'text', required_for_done: true, validation_json: { pattern: '[' } },
  ];

  it('saves a row instead of returning persistence_failed', async () => {
    useSchema(BROKEN);
    const upsertReferenceRow = await loadUpsert();
    const result = await upsertReferenceRow({ tableCode: 'widgets', rowKey: 'ABC', rowData: { code: 'ABC' } });
    expect(result.error).not.toBe('persistence_failed');
    expect(result).toMatchObject({ ok: true });
  });

  it('a VALID pattern is still enforced in both directions', async () => {
    const CURRENCY = [
      { column_code: 'currency', data_type: 'text', required_for_done: true, validation_json: { pattern: '^[A-Z]{3}$' } },
    ];
    useSchema(CURRENCY);
    const upsertReferenceRow = await loadUpsert();
    const bad = await upsertReferenceRow({ tableCode: 'widgets', rowKey: 'X', rowData: { currency: 'eur' } });
    expect(bad).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(bad.message).toBe('currency does not match the required pattern');

    useSchema(CURRENCY);
    const good = await upsertReferenceRow({ tableCode: 'widgets', rowKey: 'Y', rowData: { currency: 'EUR' } });
    expect(good).toMatchObject({ ok: true });
  });
});

describe('Z-4 max is enforced', () => {
  const BOUNDED = [
    { column_code: 'pct', data_type: 'number', required_for_done: false, validation_json: { min: 0, max: 100, scale: 2 } },
  ];

  it('rejects a value above max with a message naming the column', async () => {
    useSchema(BOUNDED);
    const upsertReferenceRow = await loadUpsert();
    const result = await upsertReferenceRow({ tableCode: 'widgets', rowKey: 'A', rowData: { pct: 5000 } });
    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(result.message).toBe('pct must be <= 100');
  });

  it('keeps rejecting below min and keeps accepting in-range values', async () => {
    useSchema(BOUNDED);
    let upsertReferenceRow = await loadUpsert();
    expect(await upsertReferenceRow({ tableCode: 'widgets', rowKey: 'B', rowData: { pct: -5 } })).toMatchObject({
      ok: false,
      error: 'invalid_input',
      message: 'pct must be >= 0',
    });

    vi.resetModules();
    useSchema(BOUNDED);
    upsertReferenceRow = await loadUpsert();
    expect(await upsertReferenceRow({ tableCode: 'widgets', rowKey: 'C', rowData: { pct: '12.50' } })).toMatchObject({ ok: true });
  });

  it('reads the JSON-Schema spelling of the same bound', async () => {
    useSchema([
      { column_code: 'pct', data_type: 'number', required_for_done: false, validation_json: { minimum: 0, maximum: 100 } },
    ]);
    const upsertReferenceRow = await loadUpsert();
    expect(await upsertReferenceRow({ tableCode: 'widgets', rowKey: 'D', rowData: { pct: 5000 } })).toMatchObject({
      ok: false,
      error: 'invalid_input',
    });
  });

  it('still rejects Infinity in a reference number column', async () => {
    useSchema([{ column_code: 'pct', data_type: 'number', required_for_done: false, validation_json: {} }]);
    const upsertReferenceRow = await loadUpsert();
    expect(await upsertReferenceRow({ tableCode: 'widgets', rowKey: 'E', rowData: { pct: 'Infinity' } })).toMatchObject({
      ok: false,
      error: 'invalid_input',
    });
  });
});
