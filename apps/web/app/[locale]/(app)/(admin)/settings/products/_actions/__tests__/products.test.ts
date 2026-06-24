import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: unknown[] };

const harness = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  itemRows: [] as Array<Record<string, unknown>>,
}));

function makeClient() {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      harness.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.items i')) {
        return { rows: harness.itemRows as T[], rowCount: harness.itemRows.length };
      }
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
}

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (fn: (ctx: unknown) => Promise<unknown>) =>
    fn({ userId: '11111111-1111-1111-1111-111111111111', orgId: '22222222-2222-2222-2222-222222222222', client: makeClient() }),
  ),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('settings products data-layer contract', () => {
  beforeEach(() => {
    harness.calls = [];
    harness.itemRows = [
      {
        id: '33333333-3333-3333-3333-333333333333',
        sku: 'FG-BEEF-001',
        name: 'Beef mince 500g',
        category: 'Finished goods',
        unit: 'kg',
        weight: '0.5',
        bom_link: 'BOM-ABC12345',
        status: 'active',
      },
    ];
    vi.clearAllMocks();
  });

  it('getProducts returns org-scoped product rows with every prototype field', async () => {
    const { getProducts } = await import('../products');

    const rows = await getProducts('22222222-2222-2222-2222-222222222222');

    expect(rows).toEqual([
      {
        id: '33333333-3333-3333-3333-333333333333',
        sku: 'FG-BEEF-001',
        name: 'Beef mince 500g',
        category: 'Finished goods',
        unit: 'kg',
        weight: '0.5',
        bomLink: 'BOM-ABC12345',
        status: 'active',
      },
    ]);

    const productsCall = harness.calls.find((call) => call.sql.toLowerCase().includes('from public.items i'));
    expect(productsCall, 'loader must query the canonical public.items table').toBeTruthy();
    expect(productsCall?.sql).toContain('app.current_org_id()');
    expect(productsCall?.sql).toContain('public.bom_headers');
    expect(productsCall?.params).toEqual(['22222222-2222-2222-2222-222222222222']);
  });
});
