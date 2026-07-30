import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const HISTORY_ID = '44444444-4444-4444-8444-444444444444';

type QueryCall = { sql: string; params: readonly unknown[] };

const { runWithOrgContext, safeRevalidatePath } = vi.hoisted(() => ({
  runWithOrgContext: vi.fn(),
  safeRevalidatePath: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));
vi.mock('../../../items/_actions/revalidate', () => ({ safeRevalidatePath }));

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient() {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as T[], rowCount: 1 };
      }
      if (normalized.includes('from public.items i') && normalized.includes('current_cost')) {
        return {
          rows: [{ id: ITEM_ID, item_code: 'RM-100', current_cost: null }] as T[],
          rowCount: 1,
        };
      }
      if (normalized === 'select current_date::text as eff_date') {
        return { rows: [{ eff_date: '2026-07-30' }] as T[], rowCount: 1 };
      }
      if (normalized.includes('as open_id')) {
        return {
          rows: [
            {
              open_id: null,
              open_from: null,
              next_from: null,
              containing_id: null,
              containing_from: null,
            },
          ] as T[],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.item_cost_history')) {
        return {
          rows: [{ id: HISTORY_ID, effective_from: params[3] }] as T[],
          rowCount: 1,
        };
      }
      return { rows: [] as T[], rowCount: normalized.startsWith('update public.items') ? 1 : 0 };
    },
  };
}

let client: ReturnType<typeof makeClient>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
  client = makeClient();
  runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('postCost P0 contracts', () => {
  it('TEC-221 posts an exact manual cost through history, denormalization, audit, and revalidation', async () => {
    const { postCost } = await import('../post-cost');

    await expect(
      postCost({
        itemId: ITEM_ID,
        costPerKg: '5.5000',
        source: 'manual',
        currency: 'GBP',
        notes: 'contract roll',
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        id: HISTORY_ID,
        itemId: ITEM_ID,
        itemCode: 'RM-100',
        costPerKg: '5.5000',
        effectiveFrom: '2026-07-30',
      },
    });

    const historyInsert = client.calls.find((call) =>
      normalizeSql(call.sql).startsWith('insert into public.item_cost_history'),
    );
    expect(historyInsert?.params).toEqual([
      ITEM_ID,
      '5.5000',
      'GBP',
      '2026-07-30',
      null,
      'manual',
      USER_ID,
    ]);
    const itemUpdate = client.calls.find((call) => normalizeSql(call.sql).startsWith('update public.items'));
    expect(itemUpdate?.params).toEqual([ITEM_ID, '5.5000']);
    const auditInsert = client.calls.find((call) =>
      normalizeSql(call.sql).startsWith('insert into public.audit_log'),
    );
    expect(auditInsert?.params[2]).toBe('item_cost.recorded');
    expect(JSON.parse(String(auditInsert?.params[5]))).toMatchObject({
      itemId: ITEM_ID,
      costPerKg: '5.5000',
      currency: 'GBP',
      source: 'manual',
      notes: 'contract roll',
    });
    expect(safeRevalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/technical/items',
      '/technical/items/RM-100',
    ]);
  });

  it('TEC-222 rejects a negative cost before DB access and accepts zero as non-negative', async () => {
    const { postCost } = await import('../post-cost');
    const base = { itemId: ITEM_ID, source: 'manual' as const, currency: 'GBP' };

    await expect(postCost({ ...base, costPerKg: '-1' })).resolves.toMatchObject({
      ok: false,
      error: 'invalid_input',
      message: expect.stringContaining('V-TEC-50'),
    });
    expect(client.calls).toHaveLength(0);

    await expect(postCost({ ...base, costPerKg: '0.0000' })).resolves.toMatchObject({
      ok: true,
      data: { costPerKg: '0.0000' },
    });
  });

  it('TEC-223 rejects tomorrow with V-TEC-51 and accepts today', async () => {
    const { postCost } = await import('../post-cost');
    const base = {
      itemId: ITEM_ID,
      costPerKg: '5.5000',
      source: 'manual' as const,
      currency: 'GBP',
    };

    await expect(postCost({ ...base, effectiveFrom: '2026-07-31' })).resolves.toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'effective_from must be <= today (V-TEC-51)',
    });
    expect(client.calls).toHaveLength(0);

    await expect(postCost({ ...base, effectiveFrom: '2026-07-30' })).resolves.toMatchObject({
      ok: true,
      data: { effectiveFrom: '2026-07-30' },
    });
  });
});
