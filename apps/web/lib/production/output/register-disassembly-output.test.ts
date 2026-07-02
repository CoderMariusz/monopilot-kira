import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type OrgContextLike, type QueryClient } from '../shared';

const writeItemCostLedgerMock = vi.hoisted(() => vi.fn());

vi.mock('../../../app/[locale]/(app)/(modules)/technical/cost/_actions/write-cost-ledger', () => ({
  writeItemCostLedger: writeItemCostLedgerMock,
}));

import { DisassemblyAbort, registerDisassemblyOutput } from './register-disassembly-output';

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
let consumedQty: string;
let consumedQtyHasUnsupported: boolean;
let inputCostPerKg: string;
let existingDisassemblyOutputs: Array<{ lp_id: string; lp_number: string }>;

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

    if (normalized.includes('from public.work_orders wo') && normalized.includes('for update')) {
      return { rows: [{ id: WO_ID }] as T[], rowCount: 1 };
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
            cost_per_kg: inputCostPerKg,
            currency: 'PLN',
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.wo_material_consumption')) {
      return {
        rows: [{ qty_kg: consumedQty, has_unsupported: consumedQtyHasUnsupported }] as T[],
        rowCount: 1,
      };
    }

    if (
      normalized.includes('from public.wo_outputs wo') &&
      normalized.includes("ext_jsonb->>'disassembly_input_lp_id'")
    ) {
      return { rows: existingDisassemblyOutputs as T[], rowCount: existingDisassemblyOutputs.length };
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

async function runInMockTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const committedLpInserts: QueryCall[] = [];
  const originalQuery = client.query.bind(client);

  client.query = async <U = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => {
    const result = await originalQuery<U>(sql, params);
    if (normalizeSql(sql).startsWith('insert into public.license_plates')) {
      committedLpInserts.push({ sql, params });
    }
    return result;
  };

  try {
    return await fn();
  } catch (err) {
    committedLpInserts.length = 0;
    throw err;
  } finally {
    client.query = originalQuery;
  }
}

describe('registerDisassemblyOutput', () => {
  beforeEach(() => {
    client = new MockClient();
    bomType = 'disassembly';
    woExecutionStatus = 'in_progress';
    activeHold = null;
    consumedQty = '100';
    consumedQtyHasUnsupported = false;
    inputCostPerKg = '5.000000';
    existingDisassemblyOutputs = [];
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

  it('allocates cost from consumed qty when input LP residual is zero', async () => {
    consumedQty = '20';
    inputCostPerKg = '3.5';
    coProducts = [
      { co_product_item_id: ITEM_A, allocation_pct: '50.000', is_byproduct: false },
      { co_product_item_id: ITEM_B, allocation_pct: '50.000', is_byproduct: false },
    ];

    const outputs = [
      { coProductItemId: ITEM_A, qtyKg: '10.000' },
      { coProductItemId: ITEM_B, qtyKg: '10.000' },
    ];

    const result = await registerDisassemblyOutput(makeCtx(), {
      woId: WO_ID,
      inputLpId: INPUT_LP_ID,
      outputs,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('error' in result ? result.error : result.reason);
    expect(result.outputs).toHaveLength(2);

    const woOutputInserts = callsStartingWith('insert into public.wo_outputs');
    expect(woOutputInserts).toHaveLength(2);

    const allocatedCosts = woOutputInserts.map((call) => {
      const ext = JSON.parse(String(call.params[9]));
      return ext.allocated_cost as string;
    });
    const allocatedTotal = allocatedCosts.reduce((sum, cost) => sum + Number(cost), 0);
    expect(allocatedTotal).toBe(70);
    expect(allocatedCosts[0]).toBe('35.000000');
    expect(allocatedCosts[1]).toBe('35.000000');
  });

  it('throws DisassemblyAbort when cost ledger write fails after first LP insert', async () => {
    writeItemCostLedgerMock
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          itemId: ITEM_A,
          itemCode: 'CP',
          costPerKg: '1.000000',
          effectiveFrom: '2026-06-23',
        },
      })
      .mockResolvedValueOnce({ ok: false, error: 'ledger-write-failed' });

    await expect(
      runInMockTransaction(() =>
        registerDisassemblyOutput(makeCtx(), {
          woId: WO_ID,
          inputLpId: INPUT_LP_ID,
          outputs: [
            { coProductItemId: ITEM_A, qtyKg: '10.000' },
            { coProductItemId: ITEM_B, qtyKg: '20.000' },
            { coProductItemId: ITEM_C, qtyKg: '20.000' },
          ],
        }),
      ),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(DisassemblyAbort);
      expect(err).toMatchObject({ code: 'cost-ledger-ledger-write-failed' });
      return true;
    });

    expect(callsStartingWith('insert into public.license_plates').length).toBeGreaterThanOrEqual(1);
  });

  it('rolls back LP inserts when DisassemblyAbort propagates out of the transaction harness', async () => {
    writeItemCostLedgerMock
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          itemId: ITEM_A,
          itemCode: 'CP',
          costPerKg: '1.000000',
          effectiveFrom: '2026-06-23',
        },
      })
      .mockResolvedValueOnce({ ok: false, error: 'ledger-write-failed' });

    let committedLpInserts = 0;
    const originalQuery = client.query.bind(client);
    client.query = async <T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => {
      const result = await originalQuery<T>(sql, params);
      if (normalizeSql(sql).startsWith('insert into public.license_plates')) {
        committedLpInserts += 1;
      }
      return result;
    };

    await expect(
      (async () => {
        try {
          await registerDisassemblyOutput(makeCtx(), {
            woId: WO_ID,
            inputLpId: INPUT_LP_ID,
            outputs: [
              { coProductItemId: ITEM_A, qtyKg: '10.000' },
              { coProductItemId: ITEM_B, qtyKg: '20.000' },
              { coProductItemId: ITEM_C, qtyKg: '20.000' },
            ],
          });
        } catch (err) {
          committedLpInserts = 0;
          throw err;
        }
      })(),
    ).rejects.toBeInstanceOf(DisassemblyAbort);

    expect(committedLpInserts).toBe(0);
    client.query = originalQuery;
  });

  it('returns existing outputs without new inserts on replay', async () => {
    existingDisassemblyOutputs = [
      { lp_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', lp_number: 'LP-EXIST-1' },
      { lp_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', lp_number: 'LP-EXIST-2' },
      { lp_id: '10101010-1010-4101-8101-101010101010', lp_number: 'LP-EXIST-3' },
    ];

    const insertCountBefore = callsStartingWith('insert into').length;

    const result = await registerDisassemblyOutput(makeCtx(), {
      woId: WO_ID,
      inputLpId: INPUT_LP_ID,
      outputs: [
        { coProductItemId: ITEM_A, qtyKg: '10.000' },
        { coProductItemId: ITEM_B, qtyKg: '20.000' },
        { coProductItemId: ITEM_C, qtyKg: '20.000' },
      ],
    });

    expect(result).toEqual({
      ok: true,
      outputs: [
        { lpId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', lpCode: 'LP-EXIST-1' },
        { lpId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', lpCode: 'LP-EXIST-2' },
        { lpId: '10101010-1010-4101-8101-101010101010', lpCode: 'LP-EXIST-3' },
      ],
    });

    const insertCountAfter = callsStartingWith('insert into').length;
    expect(insertCountAfter).toBe(insertCountBefore);
    expect(writeItemCostLedgerMock).not.toHaveBeenCalled();
  });

  it('returns input-not-consumed when no consumption rows exist for the input LP', async () => {
    consumedQty = '0';

    const result = await registerDisassemblyOutput(makeCtx(), {
      woId: WO_ID,
      inputLpId: INPUT_LP_ID,
      outputs: [
        { coProductItemId: ITEM_A, qtyKg: '10.000' },
        { coProductItemId: ITEM_B, qtyKg: '20.000' },
        { coProductItemId: ITEM_C, qtyKg: '20.000' },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'input-not-consumed' });
    expect(callsStartingWith('insert into public.license_plates')).toHaveLength(0);
  });

  it('returns input-uom-unsupported when consumption mixes kg with non-convertible each rows', async () => {
    consumedQty = '0';
    consumedQtyHasUnsupported = true;

    const result = await registerDisassemblyOutput(makeCtx(), {
      woId: WO_ID,
      inputLpId: INPUT_LP_ID,
      outputs: [
        { coProductItemId: ITEM_A, qtyKg: '10.000' },
        { coProductItemId: ITEM_B, qtyKg: '20.000' },
        { coProductItemId: ITEM_C, qtyKg: '20.000' },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'input-uom-unsupported' });
    expect(callsStartingWith('insert into public.license_plates')).toHaveLength(0);
    expect(writeItemCostLedgerMock).not.toHaveBeenCalled();
  });

  it('allocates cost from kg-converted consumption when kg and each rows are present', async () => {
    consumedQty = '120';
    consumedQtyHasUnsupported = false;
    inputCostPerKg = '2.5';
    coProducts = [
      { co_product_item_id: ITEM_A, allocation_pct: '50.000', is_byproduct: false },
      { co_product_item_id: ITEM_B, allocation_pct: '50.000', is_byproduct: false },
    ];

    const outputs = [
      { coProductItemId: ITEM_A, qtyKg: '10.000' },
      { coProductItemId: ITEM_B, qtyKg: '10.000' },
    ];

    const result = await registerDisassemblyOutput(makeCtx(), {
      woId: WO_ID,
      inputLpId: INPUT_LP_ID,
      outputs,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('error' in result ? result.error : result.reason);

    const woOutputInserts = callsStartingWith('insert into public.wo_outputs');
    const allocatedTotal = woOutputInserts
      .map((call) => Number((JSON.parse(String(call.params[9])) as { allocated_cost: string }).allocated_cost))
      .reduce((sum, cost) => sum + cost, 0);
    expect(allocatedTotal).toBe(300);
  });

  it('acquires a work-order row lock before the replay existence check', async () => {
    await registerDisassemblyOutput(makeCtx(), {
      woId: WO_ID,
      inputLpId: INPUT_LP_ID,
      outputs: [
        { coProductItemId: ITEM_A, qtyKg: '10.000' },
        { coProductItemId: ITEM_B, qtyKg: '20.000' },
        { coProductItemId: ITEM_C, qtyKg: '20.000' },
      ],
    });

    const lockIdx = client.calls.findIndex((call) => normalizeSql(call.sql).includes('for update'));
    const replayIdx = client.calls.findIndex((call) =>
      normalizeSql(call.sql).includes("ext_jsonb->>'disassembly_input_lp_id'"),
    );
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(replayIdx).toBeGreaterThan(lockIdx);
  });
});
