import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const tx = vi.hoisted(() => ({
  committed: false,
  rolledBack: false,
  query: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => {
    try {
      const result = await action({ orgId: ORG_ID, userId: USER_ID, client: { query: tx.query } });
      tx.committed = true;
      return result;
    } catch (error) {
      tx.rolledBack = true;
      throw error;
    }
  }),
}));

import { upsertForecast } from '../../_actions/forecasts';

describe('planning forecasts server actions', () => {
  beforeEach(() => {
    tx.committed = false;
    tx.rolledBack = false;
    tx.query.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rolls back and reports persistence_failed when the upsert returns no row', async () => {
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] };
      }
      if (sql.includes('from public.items i')) {
        return {
          rows: [
            {
              uom_base: 'kg',
              output_uom: 'base',
              net_qty_per_each: null,
              each_per_box: null,
              weight_mode: 'fixed',
            },
          ],
        };
      }
      if (sql.includes('insert into public.demand_forecasts')) {
        return { rows: [] };
      }
      if (sql.includes('insert into public.audit_events')) {
        throw new Error('audit should not run after a no-row upsert');
      }
      return { rows: [] };
    });

    const result = await upsertForecast({
      itemId: '11111111-1111-4111-8111-111111111111',
      isoWeek: '2026-W25',
      qty: '12.5',
    });

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
    expect(tx.rolledBack).toBe(true);
    expect(tx.committed).toBe(false);
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes('insert into public.audit_events'))).toBe(false);
  });
});
