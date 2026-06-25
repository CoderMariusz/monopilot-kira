import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type OrgContextLike, type QueryClient } from '../shared';

const writeItemCostLedgerMock = vi.hoisted(() => vi.fn());

vi.mock('../../../app/[locale]/(app)/(modules)/technical/cost/_actions/write-cost-ledger', () => ({
  writeItemCostLedger: writeItemCostLedgerMock,
}));

import { registerDisassemblyOutput } from './register-disassembly-output';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '22222222-2222-4222-8222-222222222223';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const BOM_ID = '44444444-4444-4444-8444-444444444444';
const INPUT_LP_ID = '55555555-5555-4555-8555-555555555555';
const ITEM_A = '66666666-6666-4666-8666-666666666666';
const ITEM_B = '77777777-7777-4777-8777-777777777777';
const ITEM_C = '88888888-8888-4888-8888-888888888888';
const BAD_ITEM = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: readonly unknown[] };
type CoProductFixture = {
  co_product_item_id: string;
  allocation_pct: string;
  is_byproduct: boolean;
};

let client: MockClient;
let bomType: 'forward' | 'disassembly';
let woExecutionStatus: 'planned' | 'in_progress' | 'paused' | 'completed' | 'closed' | 'cancelled' | null;
let activeHold: { hold_id: string; reference_type: string; reference_id: string } | null;
let coProducts: CoProductFixture[];

class MockClient implements QueryClient {
  calls: QueryCall[] = [];
  private lpSequence = 0;
  private outputSequence = 0;

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    const normalized = normalizeSql(sql);

    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }] as T[], rowCount: 1 };
    }

    if (normalized.includes('from public.work_orders wo')) {
      return {
        rows: [
          {
            id: WO_ID,
            wo_number: 'WO-DIS-001',
            site_id: SITE_ID,
            uom: 'kg',
            bom_header_id: BOM_ID,
            bom_type: bomType,
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.wo_executions')) {
      return {
        rows: woExecutionStatus ? ([{ status: woExecutionStatus }] as T[]) : ([] as T[]),
        rowCount: woExecutionStatus ? 1 : 0,
      };
    }

    if (normalized.includes('from public.v_active_holds')) {
      return {
        rows: activeHold ? ([activeHold] as T[]) : ([] as T[]),
        rowCount: activeHold ? 1 : 0,
      };
    }

    if (normalized.includes('from public.bom_co_products')) {
      return { rows: coProducts as T[], rowCount: coProducts.length };
    }

    if (normalized.includes('from public.license_plates lp')) {
      return {
        rows: [
          {
            id: INPUT_LP_ID,
            quantity: '100.000000',
            cost_per_kg: '5.000000',
            currency: 'PLN',
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.wo_outputs') && normalized.includes('count(*)')) {
      return { rows: [{ seq: '0' }] as T[], rowCount: 1 };
    }

    if (normalized.includes('from public.warehouses')) {
      return {
        rows: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            default_location_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.startsWith('insert into public.license_plates')) {
      this.lpSequence += 1;
      return {
        rows: [{ id: `aaaaaaaa-0000-4000-8000-${String(this.lpSequence).padStart(12, '0')}` }] as T[],
        rowCount: 1,
      };
    }

    if (normalized.startsWith('insert into public.wo_outputs')) {
      this.outputSequence += 1;
      return {
        rows: [{ id: `bbbbbbbb-0000-4000-8000-${String(this.outputSequence).padStart(12, '0')}` }] as T[],
        rowCount: 1,
      };
    }

    if (
      normalized.startsWith('insert into public.lp_genealogy') ||
      normalized.startsWith('insert into public.lp_state_history') ||
      normalized.startsWith('insert into public.outbox_events')
    ) {
      return { rows: [] as T[], rowCount: 1 };
    }

    return { rows: [] as T[], rowCount: 0 };
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

function callsStartingWith(prefix: string): QueryCall[] {
  return client.calls.filter((call) => normalizeSql(call.sql).startsWith(prefix));
}

describe('registerDisassemblyOutput', () => {
  beforeEach(() => {
    client = new MockClient();
    bomType = 'disassembly';
    woExecutionStatus = 'in_progress';
    activeHold = null;
    coProducts = [
      { co_product_item_id: ITEM_A, allocation_pct: '50.000', is_byproduct: false },
      { co_product_item_id: ITEM_B, allocation_pct: '30.000', is_byproduct: false },
      { co_product_item_id: ITEM_C, allocation_pct: '20.000', is_byproduct: false },
    ];
    writeItemCostLedgerMock.mockReset();
    writeItemCostLedgerMock.mockResolvedValue({
      ok: true,
      data: {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        itemId: ITEM_A,
        itemCode: 'CP',
        costPerKg: '1.000000',
        effectiveFrom: '2026-06-23',
      },
    });
  });

  it('creates three output LPs with input genealogy and allocates total input cost', async () => {
    const outputs = [
      { coProductItemId: ITEM_A, qtyKg: '10.000' },
      { coProductItemId: ITEM_B, qtyKg: '20.000' },
      { coProductItemId: ITEM_C, qtyKg: '20.000' },
    ];

    const result = await registerDisassemblyOutput(makeCtx(), {
      woId: WO_ID,
      inputLpId: INPUT_LP_ID,
      outputs,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('error' in result ? result.error : result.reason);
    expect(result.outputs).toHaveLength(3);

    const lpInserts = callsStartingWith('insert into public.license_plates');
    expect(lpInserts).toHaveLength(3);
    expect(lpInserts.map((call) => call.params[8])).toEqual([INPUT_LP_ID, INPUT_LP_ID, INPUT_LP_ID]);

    const genealogyInserts = callsStartingWith('insert into public.lp_genealogy');
    expect(genealogyInserts).toHaveLength(3);
    for (const call of genealogyInserts) {
      expect(normalizeSql(call.sql)).toContain("'derived'");
      expect(call.params[1]).toBe(INPUT_LP_ID);
    }

    const woOutputInserts = callsStartingWith('insert into public.wo_outputs');
    expect(woOutputInserts).toHaveLength(3);

    expect(writeItemCostLedgerMock).toHaveBeenCalledTimes(3);
    const allocatedTotal = writeItemCostLedgerMock.mock.calls.reduce((sum, call, index) => {
      const params = call[1] as { input: { costPerKg: string; source: string } };
      expect(params.input.source).toBe('disassembly_allocation');
      return sum + Number(params.input.costPerKg) * Number(outputs[index]!.qtyKg);
    }, 0);
    expect(allocatedTotal).toBeCloseTo(500, 5);

    const outboxInserts = callsStartingWith('insert into public.outbox_events');
    expect(outboxInserts).toHaveLength(3);
  });

  it('returns co-product-mismatch when an output item is not on the BOM', async () => {
    const result = await registerDisassemblyOutput(makeCtx(), {
      woId: WO_ID,
      inputLpId: INPUT_LP_ID,
      outputs: [
        { coProductItemId: ITEM_A, qtyKg: '10.000' },
        { coProductItemId: BAD_ITEM, qtyKg: '20.000' },
        { coProductItemId: ITEM_C, qtyKg: '20.000' },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'co-product-mismatch' });
    expect(callsStartingWith('insert into public.license_plates')).toHaveLength(0);
    expect(writeItemCostLedgerMock).not.toHaveBeenCalled();
  });

  it('returns not-disassembly for a non-disassembly BOM', async () => {
    bomType = 'forward';

    const result = await registerDisassemblyOutput(makeCtx(), {
      woId: WO_ID,
      inputLpId: INPUT_LP_ID,
      outputs: [{ coProductItemId: ITEM_A, qtyKg: '10.000' }],
    });

    expect(result).toEqual({ ok: false, error: 'not-disassembly' });
    expect(callsStartingWith('insert into public.license_plates')).toHaveLength(0);
    expect(writeItemCostLedgerMock).not.toHaveBeenCalled();
  });

  it('throws wo_not_recordable and does not insert LPs when WO status is not recordable', async () => {
    woExecutionStatus = 'planned';

    await expect(
      registerDisassemblyOutput(makeCtx(), {
        woId: WO_ID,
        inputLpId: INPUT_LP_ID,
        outputs: [
          { coProductItemId: ITEM_A, qtyKg: '10.000' },
          { coProductItemId: ITEM_B, qtyKg: '20.000' },
          { coProductItemId: ITEM_C, qtyKg: '20.000' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'wo_not_recordable' });

    expect(callsStartingWith('insert into public.license_plates')).toHaveLength(0);
    expect(writeItemCostLedgerMock).not.toHaveBeenCalled();
  });

  it('throws quality_hold_active and does not insert LPs when an active hold exists', async () => {
    activeHold = {
      hold_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      reference_type: 'lp',
      reference_id: INPUT_LP_ID,
    };

    await expect(
      registerDisassemblyOutput(makeCtx(), {
        woId: WO_ID,
        inputLpId: INPUT_LP_ID,
        outputs: [
          { coProductItemId: ITEM_A, qtyKg: '10.000' },
          { coProductItemId: ITEM_B, qtyKg: '20.000' },
          { coProductItemId: ITEM_C, qtyKg: '20.000' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'quality_hold_active' });

    expect(callsStartingWith('insert into public.license_plates')).toHaveLength(0);
    expect(writeItemCostLedgerMock).not.toHaveBeenCalled();
  });
});
