import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const RM_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  fgItem: { item_code: string; name: string | null; status: string; item_type: string } | null;
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const { runWithOrgContext, revalidatePath } = vi.hoisted(() => ({
  runWithOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(fgItem: FakeClient['fgItem']): FakeClient {
  const client: FakeClient = {
    calls: [],
    fgItem,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }
      if (normalized.includes('from public.bom_headers h join public.bom_lines')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      if (normalized.includes('from public.items') && normalized.includes('id = $1::uuid')) {
        return { rows: [{ id: RM_ID, status: 'active', updated_at: '2026-06-09T00:00:00Z' }] as never[], rowCount: 1 };
      }
      if (normalized.includes('from public.supplier_specs')) {
        return {
          rows: [
            {
              supplier_code: 'SUP-DEMO-01',
              supplier_status: 'approved',
              lifecycle_status: 'active',
              review_status: 'approved',
              effective_from: '2026-01-01',
              expiry_date: '2030-01-01',
              cost_review_blocked: false,
              spec_review_blocked: false,
              updated_at: '2026-06-09T00:00:00Z',
            },
          ] as never[],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.item_allergen_profiles')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      if (normalized.includes('from public.product')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      if (normalized.includes('from public.items') && normalized.includes('item_code = $1')) {
        return { rows: (client.fgItem ? [client.fgItem] : []) as never[], rowCount: client.fgItem ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.product')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      if (normalized.includes('coalesce(max(version), 0) + 1')) {
        return { rows: [{ next_version: 1 }] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.bom_headers')) {
        return { rows: [{ id: '44444444-4444-4444-8444-444444444444' }] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.bom_lines')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.audit_log') || normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [{ id: '55555555-5555-4555-8555-555555555555' }] as never[], rowCount: 1 };
      }
      return { rows: [] as never[], rowCount: 0 };
    },
  };
  return client;
}

let client: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  client = makeClient({ item_code: 'FG-WIZ-001', name: 'Wizard FG', status: 'active', item_type: 'fg' });
  runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  );
});

describe('createBomDraft product reference self-heal', () => {
  it('inserts a minimal product row for an existing active FG item before inserting the BOM header', async () => {
    const { createBomDraft } = await import('../create-draft');

    const result = await createBomDraft({
      productId: 'FG-WIZ-001',
      parentAllocationPct: 100,
      lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
    });

    expect(result).toMatchObject({ ok: true, data: { version: 1 } });
    const productInsertIndex = client.calls.findIndex((call) => normalizeSql(call.sql).startsWith('insert into public.product'));
    const headerInsertIndex = client.calls.findIndex((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'));
    expect(productInsertIndex).toBeGreaterThan(-1);
    expect(headerInsertIndex).toBeGreaterThan(productInsertIndex);
    expect(client.calls[productInsertIndex]?.params).toEqual(['FG-WIZ-001', 'Wizard FG', 'active', USER_ID]);
  });

  it('keeps invalid-reference rejection when the target FG item is missing', async () => {
    client.fgItem = null;
    const { createBomDraft } = await import('../create-draft');

    const result = await createBomDraft({
      productId: 'FG-MISSING',
      parentAllocationPct: 100,
      lines: [{ itemId: RM_ID, componentCode: 'RM-001', quantity: 1, uom: 'kg' }],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input', message: 'invalid reference' });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.product'))).toBe(false);
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.bom_headers'))).toBe(false);
  });
});
