import { beforeEach, describe, expect, it, vi } from 'vitest';

import { writeItemCostLedger } from '../write-cost-ledger';

type QueryCall = { sql: string; params: unknown[] };

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

let calls: QueryCall[];
let anchorMode: 'backdated' | 'forward' | 'between-closed';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

const client = {
  query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
    const normalized = normalize(sql);
    calls.push({ sql: normalized, params: [...(params ?? [])] });

    if (normalized.includes('from public.items i') && normalized.includes('current_cost')) {
      return {
        rows: [{ id: ITEM_ID, item_code: 'RM-100', current_cost: '10.0000' }],
        rowCount: 1,
      };
    }

    if (normalized.includes('as exceeds')) {
      return { rows: [{ exceeds: false }], rowCount: 1 };
    }

    if (normalized.includes('as open_id')) {
      if (anchorMode === 'backdated') {
        return {
          rows: [
            {
              open_id: 'open-row-id',
              open_from: '2026-07-10',
              next_from: '2026-07-10',
              containing_id: null,
              containing_from: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (anchorMode === 'between-closed') {
        return {
          rows: [
            {
              open_id: null,
              open_from: null,
              next_from: '2026-06-15',
              containing_id: 'closed-row-id',
              containing_from: '2026-06-01',
            },
          ],
          rowCount: 1,
        };
      }
      return {
        rows: [
          {
            open_id: 'open-row-id',
            open_from: '2026-07-01',
            next_from: null,
            containing_id: 'open-row-id',
            containing_from: '2026-07-01',
          },
        ],
        rowCount: 1,
      };
    }

    if (normalized.includes('as effective_to') && normalized.includes("interval '1 day'")) {
      const nextFrom = params?.[0];
      if (nextFrom === '2026-06-15') {
        return { rows: [{ effective_to: '2026-06-14' }], rowCount: 1 };
      }
      return { rows: [{ effective_to: '2026-07-09' }], rowCount: 1 };
    }

    if (normalized.startsWith('insert into public.item_cost_history')) {
      return {
        rows: [{ id: 'hist-new', effective_from: params?.[3] ?? '2026-07-01' }],
        rowCount: 1,
      };
    }

    if (normalized.startsWith('insert into public.audit_log')) {
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }),
};

describe('writeItemCostLedger interval surgery', () => {
  beforeEach(() => {
    calls = [];
    anchorMode = 'backdated';
    client.query.mockClear();
  });

  it('backdated insert closes the gap before the next row and does not supersede the open row', async () => {
    const result = await writeItemCostLedger(client, {
      orgId: ORG_ID,
      userId: USER_ID,
      input: {
        itemId: ITEM_ID,
        costPerKg: '9.5000',
        currency: 'GBP',
        effectiveFrom: '2026-07-01',
        source: 'manual',
      },
    });

    expect(result.ok).toBe(true);
    const lockCall = calls.find((call) => call.sql.includes('pg_advisory_xact_lock'));
    expect(lockCall?.params).toEqual([ORG_ID, ITEM_ID]);
    const anchorIdx = calls.findIndex((call) => call.sql.includes('as open_id'));
    expect(anchorIdx).toBeGreaterThan(calls.indexOf(lockCall!));
    expect(calls.some((call) => call.sql.startsWith('update public.item_cost_history') && call.params[0] === 'open-row-id')).toBe(
      false,
    );
    const insert = calls.find((call) => call.sql.startsWith('insert into public.item_cost_history'));
    expect(insert?.params).toEqual([ITEM_ID, '9.5000', 'GBP', '2026-07-01', '2026-07-09', 'manual', USER_ID]);
    expect(calls.some((call) => call.sql.startsWith('update public.items'))).toBe(false);
  });

  it('forward insert closes the prior open row and denormalizes items.cost_per_kg', async () => {
    anchorMode = 'forward';

    const result = await writeItemCostLedger(client, {
      orgId: ORG_ID,
      userId: USER_ID,
      input: {
        itemId: ITEM_ID,
        costPerKg: '11.0000',
        currency: 'GBP',
        effectiveFrom: '2026-07-10',
        source: 'manual',
      },
    });

    expect(result.ok).toBe(true);
    const closeOpen = calls.find(
      (call) => call.sql.startsWith('update public.item_cost_history') && call.params[0] === 'open-row-id',
    );
    expect(closeOpen?.params).toEqual(['open-row-id', '2026-07-10']);
    const insert = calls.find((call) => call.sql.startsWith('insert into public.item_cost_history'));
    expect(insert?.params[4]).toBeNull();
    expect(calls.some((call) => call.sql.startsWith('update public.items'))).toBe(true);
  });

  it('insert between two closed intervals closes the containing row and ends before the next start', async () => {
    anchorMode = 'between-closed';

    const result = await writeItemCostLedger(client, {
      orgId: ORG_ID,
      userId: USER_ID,
      input: {
        itemId: ITEM_ID,
        costPerKg: '9.2500',
        currency: 'GBP',
        effectiveFrom: '2026-06-12',
        source: 'manual',
      },
    });

    expect(result.ok).toBe(true);
    const closeContaining = calls.find(
      (call) => call.sql.startsWith('update public.item_cost_history') && call.params[0] === 'closed-row-id',
    );
    expect(closeContaining?.params).toEqual(['closed-row-id', '2026-06-12']);
    const insert = calls.find((call) => call.sql.startsWith('insert into public.item_cost_history'));
    expect(insert?.params).toEqual([ITEM_ID, '9.2500', 'GBP', '2026-06-12', '2026-06-14', 'manual', USER_ID]);
    expect(calls.some((call) => call.sql.startsWith('update public.items'))).toBe(false);
  });
});
