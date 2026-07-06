import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyConsumptionWacReversal,
  applyShipmentWacCancelCredits,
  computeWacDebitReversalDelta,
  computeWacReversalDelta,
  debitWac,
  resolveWacDeltaQtyKg,
  upsertWac,
} from '../upsert-wac';

import type { QueryClient } from '../../../app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/procurement-shared';

const ORG_ID = '00000000-0000-4000-8000-00000000000a';
const USER_ID = '00000000-0000-4000-8000-0000000000aa';
const PO_ID = '00000000-0000-4000-8000-0000000000a1';
const LINE_ID = '00000000-0000-4000-8000-0000000000b1';
const ITEM_ID = '00000000-0000-4000-8000-0000000000c1';
const SUPPLIER_ID = '00000000-0000-4000-8000-0000000000d1';
const WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000e1';
const SITE_ID = '00000000-0000-4000-8000-0000000000e2';
const LOCATION_ID = '00000000-0000-4000-8000-0000000000f1';

let currentClient: ReceiveMockClient;

vi.mock('../../auth/with-org-context', () => ({
  withOrgContext: async <T,>(action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<T>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: currentClient }),
}));

vi.mock('../../site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => SITE_ID),
}));

vi.mock('../../../app/[locale]/(app)/(modules)/warehouse/_actions/shared', () => ({
  hasWarehousePermission: vi.fn(async () => true),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('upsertWac', () => {
  it('writes WAC totals without writing generated avg_cost or site_id', async () => {
    const client = new WacMockClient();

    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({
      totalQtyKg: '10',
      totalValue: '100',
      avgCost: '10',
    });
    expect(client.calls[0]?.params).toEqual([ORG_ID, ITEM_ID, '10', '100', USER_ID]);
    expect(client.calls[0]?.sql).toContain("select id from public.currencies where code = 'GBP'");
    expect(normalize(client.calls[0]?.sql ?? '')).not.toContain('avg_cost');
    expect(wacWriteColumns(client.calls[0]?.sql ?? '')).not.toContain('site_id');
  });

  it('receive -> void returns WAC state to the prior value', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: USER_ID,
    });

    const result = await upsertWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      deltaQtyKg: '-10',
      deltaValue: '-100',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({
      totalQtyKg: '0',
      totalValue: '0',
      avgCost: '0',
    });
    expect(result).toMatchObject({ totalQtyKg: '0', totalValue: '0', clamped: false });
    const updateSql = normalize(client.calls[1]?.sql ?? '');
    expect(updateSql).toContain('on conflict (org_id, item_id, currency_id) do update set');
    expect(updateSql).toContain('total_qty_kg = greatest(public.item_wac_state.total_qty_kg + $3::numeric, 0)');
    expect(updateSql).toContain('total_value = greatest(public.item_wac_state.total_value + $4::numeric, 0)');
    expect(updateSql).not.toContain('avg_cost');
    expect(updateSql).not.toContain('site_id');
  });

  it('conflict path adds the incoming first delta to the current row instead of replacing it', async () => {
    const client = new WacFirstInsertRaceMockClient();

    const result = await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: USER_ID,
    });

    expect(result).toMatchObject({ totalQtyKg: '20', totalValue: '200', clamped: false });
    const sql = normalize(client.calls[0]?.sql ?? '');
    expect(sql).toContain('on conflict (org_id, item_id, currency_id) do update set');
    expect(sql).toContain('total_qty_kg = greatest(public.item_wac_state.total_qty_kg + $3::numeric, 0)');
    expect(sql).toContain('total_value = greatest(public.item_wac_state.total_value + $4::numeric, 0)');
  });

  it('clamp-at-zero: voiding more than running total clamps WAC to 0 and flags it', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '3',
      deltaValue: '12',
      updatedBy: USER_ID,
    });

    const result = await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '-5',
      deltaValue: '-20',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({
      totalQtyKg: '0',
      totalValue: '0',
      avgCost: '0',
    });
    expect(result).toMatchObject({ totalQtyKg: '0', totalValue: '0', clamped: true });
  });

  it('excludes unresolved-UoM zero-quantity value deltas from WAC state', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '12',
      deltaValue: '60',
      updatedBy: USER_ID,
    });

    const result = await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '0',
      deltaValue: '25',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({ totalQtyKg: '12', totalValue: '60' });
    expect(client.calls).toHaveLength(2);
    expect(result).toMatchObject({ totalQtyKg: '12', totalValue: '60', clamped: false, excluded: 'unresolved_uom' });
  });
});

describe('debitWac', () => {
  it('debits qty and value at current avg_cost after a receipt', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '100',
      deltaValue: '1000',
      updatedBy: USER_ID,
    });

    const result = await debitWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      qty: '40',
      uom: 'kg',
      updatedBy: USER_ID,
    });

    expect(result).toMatchObject({
      applied: true,
      qtyKg: '40',
      valueDebited: '400',
      avgCostUsed: '10',
    });
    expect(client.row).toMatchObject({
      totalQtyKg: '60',
      totalValue: '600',
      avgCost: '10',
    });
  });

  it('re-buy at a new price then consume moves avg_cost correctly', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: USER_ID,
    });
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '10',
      deltaValue: '200',
      updatedBy: USER_ID,
    });
    expect(client.row?.avgCost).toBe('15');

    await debitWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      qty: '5',
      uom: 'kg',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({
      totalQtyKg: '15',
      totalValue: '225',
      avgCost: '15',
    });
  });

  it('skips debit when UoM cannot be resolved to kg', async () => {
    const client = new DebitWacMockClient({ resolved: false });
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '20',
      deltaValue: '200',
      updatedBy: USER_ID,
    });

    const result = await debitWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      qty: '5',
      uom: 'each',
      updatedBy: USER_ID,
    });

    expect(result).toEqual({ applied: false, excluded: 'unresolved_uom' });
    expect(client.row).toMatchObject({ totalQtyKg: '20', totalValue: '200' });
  });

  it('reads avg_cost and decrements inside one locked item_wac_state statement', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '100',
      deltaValue: '1000',
      updatedBy: USER_ID,
    });

    await debitWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      qty: '25',
      uom: 'kg',
      updatedBy: USER_ID,
    });

    const wacWrites = client.calls.filter((call) => normalize(call.sql).includes('insert into public.item_wac_state'));
    expect(wacWrites).toHaveLength(2);
    const debitSql = normalize(wacWrites[1]?.sql ?? '');
    expect(debitSql).toContain('for update');
    expect(debitSql).toContain('avg_cost');
    expect(debitSql).toContain('on conflict (org_id, item_id, currency_id) do update set');
    expect(client.calls.some((call) => normalize(call.sql).startsWith('select coalesce((') && normalize(call.sql).includes('avg_cost'))).toBe(false);
  });
});

describe('resolveWacDeltaQtyKg', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns resolved:true for a real kg conversion', async () => {
    const client = new ResolveWacMockClient({ resolved: true, qtyKg: '48' });

    const result = await resolveWacDeltaQtyKg(client, {
      itemId: ITEM_ID,
      qty: '2',
      uom: 'box',
    });

    expect(result).toEqual({ qtyKg: '48', resolved: true });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns resolved:false with unresolved_uom marker instead of raw fallback qty and warns', async () => {
    const client = new ResolveWacMockClient({ resolved: false, qtyKg: '5' });

    const result = await resolveWacDeltaQtyKg(client, {
      itemId: ITEM_ID,
      qty: '5',
      uom: 'each',
    });

    expect(result).toEqual({ qtyKg: '0', resolved: false, marker: 'unresolved_uom' });
    expect(console.warn).toHaveBeenCalledWith('[wac] unresolved_uom', {
      itemId: ITEM_ID,
      uom: 'each',
      qty: '5',
    });
  });

  it('returns resolved:false when the item row is missing and warns', async () => {
    const client = new ResolveWacMockClient({ missingItem: true });

    const result = await resolveWacDeltaQtyKg(client, {
      itemId: ITEM_ID,
      qty: '7',
      uom: 'kg',
    });

    expect(result).toEqual({ qtyKg: '0', resolved: false, marker: 'unresolved_uom' });
    expect(console.warn).toHaveBeenCalledWith('[wac] unresolved_uom', {
      itemId: ITEM_ID,
      uom: 'kg',
      qty: '7',
    });
  });
});

describe('computeWacReversalDelta', () => {
  it('reverses the originally-booked snapshot contribution before fallback math', () => {
    expect(
      computeWacReversalDelta({
        extJsonb: { wac_qty_kg: '9.500', wac_value: '114.0000' },
        fallbackQtyKg: '10.000',
        fallbackValue: '120.0000',
      }),
    ).toEqual({ deltaQtyKg: '-9.500', deltaValue: '-114.0000', source: 'snapshot' });
  });

  it('falls back to negating recomputed qty and value when no snapshot exists', () => {
    expect(
      computeWacReversalDelta({
        extJsonb: {},
        fallbackQtyKg: '10.000',
        fallbackValue: '120.0000',
      }),
    ).toEqual({ deltaQtyKg: '-10.000', deltaValue: '-120.0000', source: 'fallback' });
  });
});

describe('computeWacDebitReversalDelta', () => {
  it('credits the originally-booked debit snapshot back into WAC', () => {
    expect(
      computeWacDebitReversalDelta({
        extJsonb: { wac_qty_kg: '2.500', wac_value: '25' },
        fallbackQtyKg: '3.000',
        fallbackValue: '30',
      }),
    ).toEqual({ deltaQtyKg: '2.500', deltaValue: '25', source: 'snapshot' });
  });
});

describe('applyConsumptionWacReversal', () => {
  it('consume then reverse nets item_wac_state to the pre-consume value', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '100',
      deltaValue: '1000',
      updatedBy: USER_ID,
    });
    const debit = await debitWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      qty: '40',
      uom: 'kg',
      updatedBy: USER_ID,
    });
    expect(client.row).toMatchObject({ totalQtyKg: '60', totalValue: '600', avgCost: '10' });
    expect(debit.applied).toBe(true);
    if (!debit.applied) return;

    const reversal = await applyConsumptionWacReversal(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      extJsonb: { wac_qty_kg: debit.qtyKg, wac_value: debit.valueDebited },
      fallbackQty: '40',
      fallbackUom: 'kg',
      updatedBy: USER_ID,
    });
    expect(reversal).toMatchObject({ applied: true, deltaQtyKg: '40', deltaValue: '400' });
    expect(client.row).toMatchObject({ totalQtyKg: '100', totalValue: '1000', avgCost: '10' });
  });

  it('skips reversal when the original consumption was wac_excluded', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '20',
      deltaValue: '200',
      updatedBy: USER_ID,
    });

    const reversal = await applyConsumptionWacReversal(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      extJsonb: { wac_excluded: 'unresolved_uom', wac_uom: 'each', wac_qty: '5' },
      fallbackQty: '5',
      fallbackUom: 'each',
      updatedBy: USER_ID,
    });

    expect(reversal).toEqual({ applied: false, skipped: 'wac_excluded' });
    expect(client.row).toMatchObject({ totalQtyKg: '20', totalValue: '200' });
    expect(client.calls).toHaveLength(1);
  });
});

describe('applyShipmentWacCancelCredits', () => {
  it('ship then cancel nets item_wac_state to the pre-ship value', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '50',
      deltaValue: '500',
      updatedBy: USER_ID,
    });
    const debit = await debitWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      qty: '12',
      uom: 'kg',
      updatedBy: USER_ID,
    });
    expect(client.row).toMatchObject({ totalQtyKg: '38', totalValue: '380', avgCost: '10' });
    if (!debit.applied) throw new Error('expected debit to apply');

    await applyShipmentWacCancelCredits(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      wacDebits: [{ lp_id: 'lp-1', item_id: ITEM_ID, qty_kg: debit.qtyKg, wac_value: debit.valueDebited }],
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({ totalQtyKg: '50', totalValue: '500', avgCost: '10' });
  });
});

describe('receivePoLineDesktop WAC integration', () => {
  beforeEach(() => {
    currentClient = new ReceiveMockClient();
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 11));
    vi.spyOn(Math, 'random').mockReturnValue(0.1234);
  });

  it('calls upsertWac with received kg and PO line value after LP creation', async () => {
    const { receivePoLineDesktop } = await import(
      '../../../app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/receive-po-line'
    );

    const result = await receivePoLineDesktop({
      poLineId: LINE_ID,
      qty: '10.000',
      batchNumber: 'B-1',
      bestBefore: '2026-07-01',
    });

    expect(result).toMatchObject({ ok: true, lpId: 'lp-1' });
    const lpIndex = currentClient.calls.findIndex((call) => normalize(call.sql).startsWith('insert into public.license_plates'));
    const wacIndex = currentClient.calls.findIndex((call) => normalize(call.sql).includes('insert into public.item_wac_state'));
    expect(lpIndex).toBeGreaterThanOrEqual(0);
    expect(wacIndex).toBeGreaterThan(lpIndex);
    expect(currentClient.calls[wacIndex]?.params).toEqual([ORG_ID, ITEM_ID, '10', '42', USER_ID]);
  });

  it('unit-mixing case: box item with kg conversion computes WAC on kg basis', async () => {
    currentClient = new ReceiveMockClient({ lineUom: 'box', unitPrice: '50', wacQtyKg: '48' });
    const { receivePoLineDesktop } = await import(
      '../../../app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/receive-po-line'
    );

    const result = await receivePoLineDesktop({
      poLineId: LINE_ID,
      qty: '2.000',
      batchNumber: 'B-BOX',
      bestBefore: '2026-07-01',
    });

    expect(result).toMatchObject({ ok: true, lpId: 'lp-1' });
    const wacIndex = currentClient.calls.findIndex((call) => normalize(call.sql).includes('insert into public.item_wac_state'));
    expect(currentClient.calls[wacIndex]?.params).toEqual([ORG_ID, ITEM_ID, '48', '100', USER_ID]);
  });

  it('unresolved-UoM receipt does not corrupt WAC and flags grn_items ext_jsonb', async () => {
    currentClient = new ReceiveMockClient({ lineUom: 'each', wacResolved: false });
    const { receivePoLineDesktop } = await import(
      '../../../app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/receive-po-line'
    );

    const result = await receivePoLineDesktop({
      poLineId: LINE_ID,
      qty: '5.000',
      batchNumber: 'B-EA',
      bestBefore: '2026-07-01',
    });

    expect(result).toMatchObject({ ok: true, lpId: 'lp-1' });
    const wacWrite = currentClient.calls.find((call) => normalize(call.sql).includes('insert into public.item_wac_state'));
    expect(wacWrite).toBeUndefined();
    const grnFlag = currentClient.calls.find(
      (call) => normalize(call.sql).startsWith('update public.grn_items') && normalize(call.sql).includes('ext_jsonb'),
    );
    expect(JSON.parse(String(grnFlag?.params?.[2]))).toMatchObject({ wac_excluded: 'unresolved_uom' });
  });
});

type MockCall = { sql: string; params?: readonly unknown[] };

class WacMockClient {
  calls: MockCall[] = [];
  row: { totalQtyKg: string; totalValue: string; avgCost: string | null } | null = null;

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    const normalized = normalize(sql);
    if (normalized.startsWith('select total_qty_kg::text as "totalqtykg"')) {
      return {
        rows: this.row
          ? [{ totalQtyKg: this.row.totalQtyKg, totalValue: this.row.totalValue, clamped: false }] as T[]
          : [],
        rowCount: this.row ? 1 : 0,
      };
    }
    if (normalized.includes('from public.items i') && normalized.includes('as qty_kg')) {
      return {
        rows: [{ qty_kg: String(params[0]), resolved: true }] as T[],
      };
    }
    if (normalized.includes('with existing as materialized') && normalized.includes('avg_cost_used')) {
      if (params.length === 4) {
        return this.applyLockedDebit<T>(params);
      }
      const avgCost = this.row && compareDecimal(this.row.totalQtyKg, '0') > 0 ? this.row.avgCost ?? '0' : '0';
      const qtyKg = String(params[2]);
      const valueDebited = multiplyDecimal(qtyKg, avgCost);
      return { rows: [{ avg_cost_used: avgCost, value_debited: valueDebited }] as T[] };
    }
    if (normalized.startsWith('select coalesce((') && normalized.includes('avg_cost')) {
      const avgCost = this.row && compareDecimal(this.row.totalQtyKg, '0') > 0 ? this.row.avgCost ?? '0' : '0';
      return { rows: [{ avg_cost: avgCost }] as T[] };
    }
    if (normalized.startsWith('select ($1::numeric * $2::numeric)::text as value')) {
      return { rows: [{ value: multiplyDecimal(String(params[0]), String(params[1])) }] as T[] };
    }
    const deltaQty = String(params[2]);
    const deltaValue = String(params[3]);

    if (params.length !== 5) {
      throw new Error(`unexpected wac query with ${params.length} params: ${normalized}`);
    }

    if (!this.row) {
      const totalQtyKg = maxDecimal(deltaQty, '0');
      const totalValue = maxDecimal(deltaValue, '0');
      this.row = {
        totalQtyKg,
        totalValue,
        avgCost: compareDecimal(totalQtyKg, '0') > 0 ? divideDecimal(totalValue, totalQtyKg) : '0',
      };
      return { rows: [{ totalQtyKg, totalValue, clamped: compareDecimal(deltaQty, '0') < 0 || compareDecimal(deltaValue, '0') < 0 }] as T[], rowCount: 1 };
    }

    const unclampedQty = addDecimal(this.row.totalQtyKg, deltaQty);
    const unclampedValue = addDecimal(this.row.totalValue, deltaValue);
    const totalQtyKg = maxDecimal(addDecimal(this.row.totalQtyKg, deltaQty), '0');
    const totalValue = maxDecimal(addDecimal(this.row.totalValue, deltaValue), '0');
    const clamped = compareDecimal(unclampedQty, '0') < 0 || compareDecimal(unclampedValue, '0') < 0;
    this.row = {
      totalQtyKg,
      totalValue,
      avgCost: compareDecimal(totalQtyKg, '0') > 0 ? divideDecimal(totalValue, totalQtyKg) : '0',
    };
    return { rows: [{ totalQtyKg, totalValue, clamped }] as T[], rowCount: 1 };
  }

  private applyLockedDebit<T>(params: readonly unknown[]): { rows: T[]; rowCount: number } {
    const qtyKg = String(params[2]);
    const avgCostUsed = this.row && compareDecimal(this.row.totalQtyKg, '0') > 0 ? this.row.avgCost ?? '0' : '0';
    const valueDebited = multiplyDecimal(qtyKg, avgCostUsed);
    const deltaQty = negateDecimal(qtyKg);
    const deltaValue = negateDecimal(valueDebited);
    const unclampedQty = addDecimal(this.row?.totalQtyKg ?? '0', deltaQty);
    const unclampedValue = addDecimal(this.row?.totalValue ?? '0', deltaValue);
    const totalQtyKg = maxDecimal(unclampedQty, '0');
    const totalValue = maxDecimal(unclampedValue, '0');
    const clamped = compareDecimal(unclampedQty, '0') < 0 || compareDecimal(unclampedValue, '0') < 0;
    this.row = {
      totalQtyKg,
      totalValue,
      avgCost: compareDecimal(totalQtyKg, '0') > 0 ? divideDecimal(totalValue, totalQtyKg) : '0',
    };
    return {
      rows: [{
        qtyKg,
        valueDebited,
        avgCostUsed,
        totalQtyKg,
        totalValue,
        clamped,
      }] as T[],
      rowCount: 1,
    };
  }
}

class WacFirstInsertRaceMockClient {
  calls: MockCall[] = [];

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    return {
      rows: [{
        totalQtyKg: '20',
        totalValue: '200',
        clamped: false,
      }] as T[],
      rowCount: 1,
    };
  }
}

class ReceiveMockClient implements QueryClient {
  calls: MockCall[] = [];
  lineUom: string;
  unitPrice: string;
  wacQtyKg: string | null;
  wacResolved: boolean | null;

  constructor(options: { lineUom?: string; unitPrice?: string; wacQtyKg?: string; wacResolved?: boolean } = {}) {
    this.lineUom = options.lineUom ?? 'kg';
    this.unitPrice = options.unitPrice ?? '4.20';
    this.wacQtyKg = options.wacQtyKg ?? null;
    this.wacResolved = options.wacResolved ?? null;
  }

  async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    const normalized = normalize(sql);

    if (normalized.includes('from public.purchase_order_lines pol') && normalized.includes('for update of pol, po')) {
      return {
        rows: [
          {
            id: LINE_ID,
            org_id: ORG_ID,
            po_id: PO_ID,
            item_id: ITEM_ID,
            supplier_id: SUPPLIER_ID,
            destination_warehouse_id: null,
            line_no: 1,
            ordered_qty: '10.000000',
            uom: this.lineUom,
            unit_price: this.unitPrice,
            received_qty: '0.000000',
            shelf_life_days: null,
            shelf_life_mode: null,
          },
        ] as T[],
      };
    }
    if (normalized.startsWith('select pol.item_id::text, pol.unit_price::text as unit_price')) {
      return { rows: [{ item_id: ITEM_ID, unit_price: this.unitPrice }] as T[] };
    }
    if (normalized.includes('from public.warehouses w')) {
      return { rows: [{ id: WAREHOUSE_ID, site_id: SITE_ID, default_location_id: LOCATION_ID }] as T[] };
    }
    if (normalized.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (normalized.includes('from public.grns') && normalized.includes('status =')) return { rows: [] };
    if (normalized.includes("substring(grn_number from 'grn-")) return { rows: [{ seq: 1 }] as T[] };
    if (normalized.startsWith('insert into public.grns')) return { rows: [{ id: 'grn-1', grn_number: 'GRN-20260611-0001' }] as T[] };
    if (normalized.startsWith('insert into public.license_plates')) return { rows: [{ id: 'lp-1' }] as T[] };
    if (normalized.startsWith('select ($1::numeric * coalesce($2::numeric, 0))::text as value')) {
      return { rows: [{ value: multiplyDecimal(String(params?.[0] ?? '0'), String(params?.[1] ?? '0')) }] as T[] };
    }
    if (normalized.includes('from public.items i') && normalized.includes('as qty_kg')) {
      return {
        rows: [{
          qty_kg: this.wacQtyKg ?? String(params?.[0] ?? '0'),
          resolved: this.wacResolved ?? true,
        }],
      } as T[];
    }
    if (normalized.startsWith('update public.grn_items') && normalized.includes('ext_jsonb')) {
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes('insert into public.item_wac_state')) {
      return { rows: [{ totalQtyKg: String(params?.[2] ?? '0'), totalValue: String(params?.[3] ?? '0'), clamped: false }] as T[], rowCount: 1 };
    }
    if (normalized.includes('max(line_number)')) return { rows: [{ line_number: 1 }] as T[] };
    if (normalized.startsWith('insert into public.grn_items')) return { rows: [{ id: 'grn-item-1' }] as T[] };
    if (normalized.startsWith('insert into public.lp_state_history')) return { rows: [] };
    if (normalized.startsWith('insert into public.outbox_events')) return { rows: [] };
    if (normalized.includes('from public.tenant_variations')) return { rows: [{ require_qc: false }] as T[] };
    if (normalized.includes('bool_and')) return { rows: [{ is_received: true }] as T[] };
    if (normalized.startsWith('update public.purchase_orders')) return { rows: [] };
    if (normalized.startsWith('update public.grns')) return { rows: [] };
    if (normalized.startsWith('insert into public.audit_events')) return { rows: [] };

    return { rows: [] };
  }
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function wacWriteColumns(sql: string): string {
  const match = normalize(sql).match(/insert into public\.item_wac_state \(([^)]+)\)/);
  return match?.[1] ?? '';
}

const SCALE = 1_000_000n;

function toFixed(value: string): bigint {
  const negative = value.startsWith('-');
  const body = negative ? value.slice(1) : value;
  const [integer = '0', fraction = ''] = body.split('.');
  const fixed = BigInt(integer || '0') * SCALE + BigInt((fraction + '000000').slice(0, 6));
  return negative ? -fixed : fixed;
}

function fromFixed(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const integer = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative && abs !== 0n ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function addDecimal(left: string, right: string): string {
  return fromFixed(toFixed(left) + toFixed(right));
}

function maxDecimal(left: string, right: string): string {
  return compareDecimal(left, right) >= 0 ? left : right;
}

function compareDecimal(left: string, right: string): number {
  const diff = toFixed(left) - toFixed(right);
  return diff > 0n ? 1 : diff < 0n ? -1 : 0;
}

function multiplyDecimal(left: string, right: string): string {
  return fromFixed((toFixed(left) * toFixed(right)) / SCALE);
}

function negateDecimal(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) return trimmed.slice(1);
  return `-${trimmed}`;
}

function divideDecimal(left: string, right: string): string {
  return fromFixed((toFixed(left) * SCALE) / toFixed(right));
}

class ResolveWacMockClient {
  constructor(private readonly options: { resolved?: boolean; qtyKg?: string; missingItem?: boolean }) {}

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount?: number | null }> {
    const normalized = normalize(sql);
    if (normalized.includes('from public.items i') && normalized.includes('as qty_kg')) {
      if (this.options.missingItem) return { rows: [] };
      return {
        rows: [{
          qty_kg: this.options.qtyKg ?? String(params[0]),
          resolved: this.options.resolved ?? true,
        }] as T[],
      };
    }
    throw new Error(`unexpected query: ${normalized}`);
  }
}

class DebitWacMockClient extends WacMockClient {
  constructor(private readonly resolution: { resolved: boolean; qtyKg?: string }) {
    super();
  }

  override async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount?: number | null }> {
    const normalized = normalize(sql);
    if (normalized.includes('from public.items i') && normalized.includes('as qty_kg')) {
      return {
        rows: [{
          qty_kg: this.resolution.qtyKg ?? '0',
          resolved: this.resolution.resolved,
        }] as T[],
      };
    }
    return super.query(sql, params);
  }
}
