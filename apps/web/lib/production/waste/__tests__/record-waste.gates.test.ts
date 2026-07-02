import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordWaste } from '../record-waste';
import { type OrgContextLike, type QueryClient } from '../../shared';

vi.mock('../../../warehouse/lp-create', () => ({
  makeStockMoveNumber: vi.fn((transactionId: string) => `SM-${transactionId.replaceAll('-', '').slice(0, 20)}`),
}));

vi.mock('../../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
    holdsGuard: vi.fn(async () => null),
    readWoExecutionStatus: vi.fn(async () => 'in_progress'),
    emitOutbox: vi.fn(async () => undefined),
  };
});

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const LP_ID = '44444444-4444-4444-8444-444444444444';
const TX_ID = '55555555-5555-4555-8555-555555555555';
const SITE_ID = '66666666-6666-4666-8666-666666666666';
const CATEGORY_ID = '77777777-7777-4777-8777-777777777777';
const LOCATION_ID = '88888888-8888-4888-8888-888888888888';
const WASTE_ID = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: readonly unknown[] };

let queries: QueryCall[];
let lpStatus: string;
let lpQaStatus: string;
let lpUom: string;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const n = normalize(sql);

      if (n.includes('from public.work_orders')) {
        return { rows: [{ id: WO_ID, wo_number: 'WO-1', site_id: SITE_ID }], rowCount: 1 };
      }
      if (n.includes('from public.waste_categories')) {
        return { rows: [{ id: CATEGORY_ID }], rowCount: 1 };
      }
      if (n.includes('from public.license_plates') && n.includes('for update')) {
        return {
          rows: [{
            id: LP_ID,
            quantity: '100',
            reserved_qty: '0',
            has_available: true,
            status: lpStatus,
            qa_status: lpQaStatus,
            uom: lpUom,
            location_id: LOCATION_ID,
          }],
          rowCount: 1,
        };
      }
      if (n.startsWith('update public.license_plates')) {
        return { rows: [{ id: LP_ID, quantity: '90' }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.stock_moves')) {
        return { rows: [], rowCount: 1 };
      }
      if (n.startsWith('insert into public.wo_waste_log')) {
        return { rows: [{ id: WASTE_ID }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`unexpected query: ${n}`);
    }),
  };
}

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, client: makeClient() };
}

const baseBody = {
  transaction_id: TX_ID,
  category_code: 'SCRAP',
  qty_kg: '10',
  shift_id: 'DAY',
  lp_id: LP_ID,
};

describe('recordWaste LP gates', () => {
  beforeEach(() => {
    queries = [];
    lpStatus = 'available';
    lpQaStatus = 'released';
    lpUom = 'kg';
  });

  it('rejects terminal LP status before decrement', async () => {
    lpStatus = 'consumed';

    await expect(recordWaste(makeCtx(), WO_ID, baseBody)).rejects.toMatchObject({
      name: 'ProductionActionError',
      code: 'lp_not_wasteable',
      status: 409,
    });

    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('rejects non-kg LP uom before decrement', async () => {
    lpUom = 'each';

    await expect(recordWaste(makeCtx(), WO_ID, baseBody)).rejects.toMatchObject({
      name: 'ProductionActionError',
      code: 'uom_mismatch',
      status: 409,
    });

    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
  });

  it('inserts stock_moves on successful LP decrement', async () => {
    const result = await recordWaste(makeCtx(), WO_ID, baseBody);

    expect(result.waste_id).toBe(WASTE_ID);
    const stockMove = queries.find((q) => normalize(q.sql).startsWith('insert into public.stock_moves'));
    expect(stockMove).toBeDefined();
    expect(normalize(stockMove!.sql)).toContain("'adjustment'");
    expect(normalize(stockMove!.sql)).toContain("'completed'");
    expect(stockMove!.params).toEqual(
      expect.arrayContaining([SITE_ID, LP_ID, '-10', 'kg', TX_ID, WO_ID]),
    );
    const lpUpdate = queries.find((q) => normalize(q.sql).startsWith('update public.license_plates'));
    const stockMoveIdx = queries.indexOf(stockMove!);
    const lpUpdateIdx = queries.indexOf(lpUpdate!);
    expect(lpUpdateIdx).toBeLessThan(stockMoveIdx);
  });

  it('maps stock_moves 23505 to already_recorded like wo_waste_log', async () => {
    const baseClient = makeClient();
    const client: QueryClient = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        const n = normalize(sql);
        if (n.startsWith('insert into public.stock_moves')) {
          const err = Object.assign(new Error('duplicate'), { code: '23505' });
          throw err;
        }
        return baseClient.query(sql, params);
      }),
    };

    await expect(recordWaste({ ...makeCtx(), client }, WO_ID, baseBody)).rejects.toMatchObject({
      code: 'already_recorded',
      status: 409,
    });
  });
});
