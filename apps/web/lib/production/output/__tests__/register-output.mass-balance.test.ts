import { beforeEach, describe, expect, it } from 'vitest';

import { type OrgContextLike, ProductionActionError, type QueryClient } from '../../shared';
import { registerOutput } from '../register-output';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '22222222-2222-4222-8222-222222222223';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const TX_ID = '55555555-5555-4555-8555-555555555555';

type QueryCall = { sql: string; params: readonly unknown[] };

let client: MockClient;
let postedConsumptionKg: string;
let effectiveYieldPct: string;
let existingOutputKg: string;
let blockPct: string;
let materialConsumptionRows: Array<{ qty_consumed: string; uom: string }>;

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function decimalText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

class MockClient implements QueryClient {
  calls: QueryCall[] = [];
  outboxPayload: Record<string, unknown> | null = null;

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    const normalized = normalizeSql(sql);

    if (normalized.startsWith('with cfg as') && normalized.includes('massbalance_threshold_pct')) {
      const qtyKg = Number(params[1]);
      const warnPct = Number(params[2]);
      const runningOutput = Number(existingOutputKg) + qtyKg;
      const yieldPct = Number(effectiveYieldPct);
      const postedConsumption =
        materialConsumptionRows.length > 0
          ? materialConsumptionRows
              .filter((row) => row.uom === 'kg')
              .reduce((sum, row) => sum + Number(row.qty_consumed), 0)
          : Number(postedConsumptionKg);
      const postedConsumptionText =
        materialConsumptionRows.length > 0 ? decimalText(postedConsumption) : postedConsumptionKg;
      const yieldFactor = yieldPct / 100;
      const expectedInput = yieldPct > 0 ? runningOutput / yieldFactor : null;
      const warnThresholdOutput = postedConsumption * yieldFactor * (1 + warnPct);
      const blockThresholdOutput = postedConsumption * yieldFactor * (1 + Number(blockPct) / 100);
      return {
        rows: [
          {
            expected_input_kg: expectedInput === null ? null : decimalText(expectedInput),
            posted_consumption_kg: postedConsumptionText,
            effective_yield_pct: effectiveYieldPct,
            block_pct: blockPct,
            warn:
              postedConsumption > 0 &&
              expectedInput !== null &&
              runningOutput > warnThresholdOutput,
            block:
              postedConsumption > 0 &&
              expectedInput !== null &&
              Number(blockPct) > 0 &&
              runningOutput > blockThresholdOutput,
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.work_orders')) {
      return {
        rows: [
          {
            id: WO_ID,
            wo_number: 'WO-001',
            uom: 'kg',
            uom_snapshot: null,
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.user_roles')) {
      return { rows: [{ ok: true }] as T[], rowCount: 1 };
    }

    if (normalized.includes('from public.items')) {
      return {
        rows: [
          {
            id: PRODUCT_ID,
            weight_mode: 'fixed',
            shelf_life_days: null,
            nominal_weight: null,
            variance_tolerance_pct: null,
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.wo_executions')) {
      return { rows: [{ status: 'in_progress' }] as T[], rowCount: 1 };
    }

    if (normalized.includes('from public.wo_outputs') && normalized.includes('count(*)::text as seq')) {
      return { rows: [{ seq: '0' }] as T[], rowCount: 1 };
    }

    if (normalized.startsWith('insert into public.wo_outputs')) {
      return {
        rows: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            lp_id: null,
            expiry_date: null,
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.warehouses')) {
      return {
        rows: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            default_location_id: '88888888-8888-4888-8888-888888888888',
          },
        ] as T[],
        rowCount: 1,
      };
    }

    if (normalized.includes('from public.wo_material_consumption')) {
      return { rows: [] as T[], rowCount: 0 };
    }

    if (normalized.startsWith('insert into public.license_plates')) {
      return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }] as T[], rowCount: 1 };
    }

    if (normalized.startsWith('insert into public.lp_state_history')) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (normalized.startsWith('update public.wo_outputs')) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (normalized.startsWith('insert into public.outbox_events')) {
      this.outboxPayload = JSON.parse(String(params[3])) as Record<string, unknown>;
      return { rows: [] as T[], rowCount: 1 };
    }

    return { rows: [] as T[], rowCount: 0 };
  }
}

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

async function register(qtyKg: string = '100') {
  return registerOutput(makeCtx(), WO_ID, {
    transaction_id: TX_ID,
    output_type: 'primary',
    product_id: PRODUCT_ID,
    qty_kg: qtyKg,
  });
}

describe('registerOutput mass-balance advisory warning', () => {
  beforeEach(() => {
    client = new MockClient();
    postedConsumptionKg = '0';
    effectiveYieldPct = '100';
    existingOutputKg = '0';
    blockPct = '0';
    materialConsumptionRows = [];
  });

  it('flags when output exceeds consumed input by more than 2%', async () => {
    postedConsumptionKg = '100';

    const result = await register('103');

    expect(result.mass_balance_warning).toEqual({
      expected_input_kg: '103',
      posted_consumption_kg: '100',
      effective_yield_pct: '100',
      warn_pct: 0.02,
    });
    expect(client.outboxPayload?.mass_balance_warning).toEqual(result.mass_balance_warning);
  });

  it('does not flag expected yield loss within the 2% tolerance', async () => {
    postedConsumptionKg = '1000';
    effectiveYieldPct = '10';

    const result = await register('101');

    expect(result.mass_balance_warning).toBeUndefined();
    expect(client.outboxPayload?.mass_balance_warning).toBeNull();
  });

  it('does not flag output within the 2% mass-balance tolerance', async () => {
    postedConsumptionKg = '100';

    const result = await register('101.99');

    expect(result.mass_balance_warning).toBeUndefined();
    expect(client.outboxPayload?.mass_balance_warning).toBeNull();
  });

  it('skips the guard when posted consumption is zero', async () => {
    const result = await register('100');

    expect(result.mass_balance_warning).toBeUndefined();
    expect(client.outboxPayload?.mass_balance_warning).toBeNull();
  });

  it('warns at 95% yield when output exceeds expected output by more than 2%', async () => {
    postedConsumptionKg = '95';
    effectiveYieldPct = '95';

    const result = await register('100.1');

    expect(result.mass_balance_warning).toMatchObject({
      posted_consumption_kg: '95',
      effective_yield_pct: '95',
      warn_pct: 0.02,
    });
    expect(result.mass_balance_warning?.expected_input_kg).toBe(String(100.1 / 0.95));
  });

  it('blocks when the tenant mass-balance threshold flag is active and exceeded', async () => {
    postedConsumptionKg = '50';
    blockPct = '10';

    let error: unknown;
    try {
      await register('200');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ProductionActionError);
    expect(error).toMatchObject({
      code: 'insufficient_input_for_output',
      status: 409,
    });
  });

  it('only includes kg material consumption in the mass-balance warning sum', async () => {
    materialConsumptionRows = [
      { qty_consumed: '200', uom: 'each' },
      { qty_consumed: '50', uom: 'kg' },
    ];

    const result = await register('100');

    expect(result.mass_balance_warning).toEqual({
      expected_input_kg: '100',
      posted_consumption_kg: '50',
      effective_yield_pct: '100',
      warn_pct: 0.02,
    });
    const massBalanceQuery = client.calls.find(
      (call) => normalizeSql(call.sql).startsWith('with cfg as') && call.sql.includes('wo_material_consumption'),
    );
    expect(massBalanceQuery?.sql).toContain("and c.uom = 'kg'");
  });
});
