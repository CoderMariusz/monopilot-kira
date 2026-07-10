import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyConsumptionWacReversal,
  applyShipmentWacCancelCredits,
  computeWacDebitReversalDelta,
  computeWacReversalDelta,
  creditWacAtAvgCost,
  debitWac,
  resolveWacDeltaQtyKg,
  upsertWac,
  WAC_OUTBOX_APP_VERSION,
  WAC_VALUATION_CURRENCY_CODE,
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
const CONSUMPTION_ID = '00000000-0000-4000-8000-000000000101';

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
  it('writes WAC totals with site_id and currency bucket', async () => {
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
    expect(client.calls[0]?.params).toEqual([ORG_ID, ITEM_ID, '10', '100', USER_ID, SITE_ID, 'GBP']);
    expect(client.calls[0]?.sql).toContain("select id from public.currencies where code = $7::text");
    expect(normalize(client.calls[0]?.sql ?? '')).not.toContain('avg_cost');
    expect(wacWriteColumns(client.calls[0]?.sql ?? '')).toContain('site_id');
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
    expect(updateSql).toContain('site_id = coalesce(excluded.site_id');
    expect(updateSql).toContain('case when coerced_qty = 0 then 0');
    expect(updateSql).not.toContain('avg_cost');
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
    expect(sql).toContain('case when coerced_qty = 0 then 0');
  });

  it('coherent clamp: mismatched reversal zeros both qty and value instead of stranding one', async () => {
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
      deltaValue: '-10',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({
      totalQtyKg: '0',
      totalValue: '0',
      avgCost: '0',
    });
    expect(result).toMatchObject({ totalQtyKg: '0', totalValue: '0', clamped: true });
  });

  it('coherent clamp: value-only over-reversal keeps qty when value hits zero', async () => {
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
      deltaQtyKg: '-2',
      deltaValue: '-20',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({ totalQtyKg: '1', totalValue: '0' });
    expect(result).toMatchObject({ totalQtyKg: '1', totalValue: '0', clamped: true });
  });

  it('zero-value positive-qty gain keeps qty in the WAC pool', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '5',
      deltaValue: '0',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({ totalQtyKg: '5', totalValue: '0', avgCost: '0' });
  });

  it('clamp-at-zero: voiding more than running total clamps WAC to 0 and records outbox anomaly', async () => {
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
    expect(client.outboxEvents).toHaveLength(1);
    expect(client.outboxEvents[0]).toMatchObject({
      eventType: 'finance.wac.underflow',
      aggregateType: 'item',
      aggregateId: ITEM_ID,
      appVersion: WAC_OUTBOX_APP_VERSION,
    });
    expect(JSON.parse(client.outboxEvents[0]?.payload ?? '{}')).toMatchObject({
      org_id: ORG_ID,
      item_id: ITEM_ID,
      available_qty_kg: '3',
      available_value: '12',
      delta_qty_kg: '-5',
      delta_value: '-20',
      attempted_post_qty_kg: '-2',
      attempted_post_value: '-8',
    });
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
  it('over-debit clamps the pool, writes finance.wac.underflow, and still applies debit', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: USER_ID,
    });

    const result = await debitWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      qty: '15',
      uom: 'kg',
      updatedBy: USER_ID,
      sourceRef: {
        aggregateType: 'wo_material_consumption',
        aggregateId: CONSUMPTION_ID,
        dedupKey: `production-consume:${CONSUMPTION_ID}`,
      },
    });

    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(client.row).toMatchObject({ totalQtyKg: '0', totalValue: '0', avgCost: '0' });
    expect(result.wac).toMatchObject({ totalQtyKg: '0', totalValue: '0', clamped: true });
    expect(client.outboxEvents).toHaveLength(1);
    expect(client.outboxEvents[0]).toMatchObject({
      eventType: 'finance.wac.underflow',
      aggregateType: 'wo_material_consumption',
      aggregateId: CONSUMPTION_ID,
      dedupKey: `production-consume:${CONSUMPTION_ID}:wac-underflow`,
    });
    expect(JSON.parse(client.outboxEvents[0]?.payload ?? '{}')).toMatchObject({
      available_qty_kg: '10',
      available_value: '100',
      delta_qty_kg: '-15',
      delta_value: '-150',
      attempted_post_qty_kg: '-5',
      attempted_post_value: '-50',
    });
  });

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

  it('NN-FIN-1 mass conservation: receive 100@£1 + 50@£2, consume 120, remaining 30 at post-consume avg (not lifetime)', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '100',
      deltaValue: '100',
      updatedBy: USER_ID,
    });
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '50',
      deltaValue: '100',
      updatedBy: USER_ID,
    });
    expect(client.row).toMatchObject({ totalQtyKg: '150', totalValue: '200' });

    const debit = await debitWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      qty: '120',
      uom: 'kg',
      updatedBy: USER_ID,
    });

    expect(debit.applied).toBe(true);
    if (!debit.applied) return;
    expect(debit.qtyKg).toBe('120');
    expect(client.row?.totalQtyKg).toBe('30');
    expect(addDecimal(debit.valueDebited, client.row?.totalValue ?? '0')).toBe('200');
    expect(compareDecimal(client.row?.totalValue ?? '0', '200')).toBe(-1);
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

  it('reads avg_cost in a locked select then applies debit via upsertWac', async () => {
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
    const lockedRead = client.calls.find((call) => normalize(call.sql).includes('for update') && normalize(call.sql).includes('avg_cost'));
    expect(lockedRead).toBeDefined();
    expect(client.row).toMatchObject({ totalQtyKg: '75', totalValue: '750', avgCost: '10' });
  });
});

describe('creditWacAtAvgCost', () => {
  it('reads avg_cost in a locked select then applies credit via upsertWac', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '100',
      deltaValue: '1000',
      updatedBy: USER_ID,
    });

    await creditWacAtAvgCost(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      qty: '10',
      uom: 'kg',
      updatedBy: USER_ID,
    });

    const wacWrites = client.calls.filter((call) => normalize(call.sql).includes('insert into public.item_wac_state'));
    expect(wacWrites).toHaveLength(2);
    const lockedRead = client.calls.find(
      (call) => normalize(call.sql).includes('for update') && normalize(call.sql).includes('delta_value'),
    );
    expect(lockedRead).toBeDefined();
    expect(client.row).toMatchObject({ totalQtyKg: '110', totalValue: '1100', avgCost: '10' });
  });

  it('zero avg_cost credit adds qty without zeroing it', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      deltaQtyKg: '5',
      deltaValue: '0',
      updatedBy: USER_ID,
    });

    await creditWacAtAvgCost(client, {
      orgId: ORG_ID,
      siteId: null,
      itemId: ITEM_ID,
      qty: '3',
      uom: 'kg',
      updatedBy: USER_ID,
    });

    expect(client.row).toMatchObject({ totalQtyKg: '8', totalValue: '0', avgCost: '0' });
  });
});

describe('WAC valuation currency pool', () => {
  it('defaults omitted currencyCode to org base GBP', () => {
    expect(WAC_VALUATION_CURRENCY_CODE).toBe('GBP');
  });

  it('receipt credit and consumption debit share the same GBP pool', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: USER_ID,
      currencyCode: WAC_VALUATION_CURRENCY_CODE,
    });

    const debit = await debitWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      qty: '4',
      uom: 'kg',
      updatedBy: USER_ID,
    });
    expect(debit.applied).toBe(true);
    expect(client.getBucket('GBP')).toMatchObject({ totalQtyKg: '6', totalValue: '60', avgCost: '10' });
    expect(client.calls[0]?.params?.[6]).toBe('GBP');
    expect(client.calls.at(-1)?.params?.[6]).toBe('GBP');
  });

  it('consumption reversal credits the same GBP pool as the original debit', async () => {
    const client = new WacMockClient();
    await upsertWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      deltaQtyKg: '100',
      deltaValue: '1000',
      updatedBy: USER_ID,
    });
    const debit = await debitWac(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      qty: '40',
      uom: 'kg',
      updatedBy: USER_ID,
    });
    if (!debit.applied) throw new Error('expected debit');

    const reversal = await applyConsumptionWacReversal(client, {
      orgId: ORG_ID,
      siteId: SITE_ID,
      itemId: ITEM_ID,
      extJsonb: { wac_qty_kg: debit.qtyKg, wac_value: debit.valueDebited },
      fallbackQty: '40',
      fallbackUom: 'kg',
      updatedBy: USER_ID,
    });
    expect(reversal).toMatchObject({ applied: true });
    expect(client.getBucket('GBP')).toMatchObject({ totalQtyKg: '100', totalValue: '1000', avgCost: '10' });
    expect(client.calls.at(-1)?.params?.[6]).toBe('GBP');
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

  it('maps canonical pcs to each for WAC kg resolution', async () => {
    const client = new ResolveWacMockClient({ resolved: true, qtyKg: '2.500' });

    const result = await resolveWacDeltaQtyKg(client, {
      itemId: ITEM_ID,
      qty: '5',
      uom: 'pcs',
    });

    expect(result).toEqual({ qtyKg: '2.500', resolved: true });
    expect(client.lastUomParam).toBe('each');
  });

  it('maps legacy szt/ea piece aliases to each for WAC kg resolution', async () => {
    const client = new ResolveWacMockClient({ resolved: true, qtyKg: '1.000' });

    for (const uom of ['szt', 'ea'] as const) {
      await resolveWacDeltaQtyKg(client, { itemId: ITEM_ID, qty: '2', uom });
      expect(client.lastUomParam).toBe('each');
    }
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
    expect(currentClient.calls[wacIndex]?.params).toEqual([ORG_ID, ITEM_ID, '10', '42', USER_ID, SITE_ID, 'GBP']);
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
    expect(currentClient.calls[wacIndex]?.params).toEqual([ORG_ID, ITEM_ID, '48', '100', USER_ID, SITE_ID, 'GBP']);
  });

  it('unresolved-UoM receipt is rejected before WAC can be skipped silently', async () => {
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

    expect(result).toEqual({ ok: false, error: 'wac_unresolved_uom' });
    const wacWrite = currentClient.calls.find((call) => normalize(call.sql).includes('insert into public.item_wac_state'));
    expect(wacWrite).toBeUndefined();
  });

  it('rejects non-base PO currency before booking WAC', async () => {
    currentClient = new ReceiveMockClient({ poCurrency: 'EUR' });
    const { receivePoLineDesktop } = await import(
      '../../../app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/receive-po-line'
    );

    const result = await receivePoLineDesktop({
      poLineId: LINE_ID,
      qty: '10.000',
      batchNumber: 'B-EUR',
      bestBefore: '2026-07-01',
    });

    expect(result).toEqual({ ok: false, error: 'wac_unsupported_currency' });
    const wacWrite = currentClient.calls.find((call) => normalize(call.sql).includes('insert into public.item_wac_state'));
    expect(wacWrite).toBeUndefined();
  });
});

type MockCall = { sql: string; params?: readonly unknown[] };

class WacMockClient {
  calls: MockCall[] = [];
  outboxEvents: Array<{
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: string;
    appVersion: string;
    dedupKey: string;
  }> = [];
  private buckets = new Map<string, { totalQtyKg: string; totalValue: string; avgCost: string | null }>();

  get row(): { totalQtyKg: string; totalValue: string; avgCost: string | null } | null {
    return this.buckets.get('GBP') ?? this.buckets.values().next().value ?? null;
  }

  getBucket(currencyCode: string) {
    return this.buckets.get(currencyCode) ?? null;
  }

  private bucketKey(params: readonly unknown[]): string {
    if (params.length === 7) return String(params[6] ?? 'GBP');
    if (params.length === 4) return String(params[3] ?? 'GBP');
    return 'GBP';
  }

  private getBucketForParams(params: readonly unknown[]) {
    const key = this.bucketKey(params);
    return this.buckets.get(key) ?? null;
  }

  private setBucketForParams(
    params: readonly unknown[],
    row: { totalQtyKg: string; totalValue: string; avgCost: string | null },
  ): void {
    this.buckets.set(this.bucketKey(params), row);
  }

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    const normalized = normalize(sql);
    if (normalized.startsWith('insert into public.outbox_events')) {
      this.outboxEvents.push({
        eventType: String(params[1]),
        aggregateType: String(params[2]),
        aggregateId: String(params[3]),
        payload: String(params[4]),
        appVersion: String(params[5]),
        dedupKey: String(params[6]),
      });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('select total_qty_kg::text as "totalqtykg"')) {
      const existing = this.getBucketForParams(params);
      return {
        rows: existing
          ? [{ totalQtyKg: existing.totalQtyKg, totalValue: existing.totalValue, clamped: false }] as T[]
          : [],
        rowCount: existing ? 1 : 0,
      };
    }
    if (normalized.includes('from public.items i') && normalized.includes('as qty_kg')) {
      return {
        rows: [{ qty_kg: String(params[0]), resolved: true }] as T[],
      };
    }
    if (normalized.includes('with existing as materialized') && normalized.includes('avg_cost_used')) {
      const existing = this.getBucketForParams(params);
      const avgCost =
        existing && compareDecimal(existing.totalQtyKg, '0') > 0 ? existing.avgCost ?? '0' : '0';
      const qtyKg = String(params[2]);
      const valueDebited = multiplyDecimal(qtyKg, avgCost);
      return { rows: [{ avg_cost_used: avgCost, value_debited: valueDebited }] as T[] };
    }
    if (normalized.includes('with existing as materialized') && normalized.includes('delta_value')) {
      const existing = this.getBucketForParams(params);
      const avgCost =
        existing && compareDecimal(existing.totalQtyKg, '0') > 0 ? existing.avgCost ?? '0' : '0';
      return { rows: [{ delta_value: multiplyDecimal(String(params[2]), avgCost) }] as T[] };
    }
    if (normalized.startsWith('select coalesce((') && normalized.includes('avg_cost')) {
      const existing = this.getBucketForParams(params);
      const avgCost =
        existing && compareDecimal(existing.totalQtyKg, '0') > 0 ? existing.avgCost ?? '0' : '0';
      return { rows: [{ avg_cost: avgCost }] as T[] };
    }
    if (normalized.startsWith('select ($1::numeric * $2::numeric)::text as value')) {
      return { rows: [{ value: multiplyDecimal(String(params[0]), String(params[1])) }] as T[] };
    }
    const deltaQty = String(params[2]);
    const deltaValue = String(params[3]);

    if (params.length !== 7) {
      throw new Error(`unexpected wac query with ${params.length} params: ${normalized}`);
    }

    if (!this.getBucketForParams(params)) {
      const availableQtyKg = '0';
      const availableValue = '0';
      const { totalQtyKg, totalValue } = coerceWacTotals(deltaQty, deltaValue);
      const rawClamped = compareDecimal(deltaQty, '0') < 0 || compareDecimal(deltaValue, '0') < 0;
      this.setBucketForParams(params, {
        totalQtyKg,
        totalValue,
        avgCost: compareDecimal(totalQtyKg, '0') > 0 ? divideDecimal(totalValue, totalQtyKg) : '0',
      });
      return {
        rows: [{
          totalQtyKg,
          totalValue,
          clamped: rawClamped,
          availableQtyKg,
          availableValue,
          rawQtyKg: deltaQty,
          rawValue: deltaValue,
        }] as T[],
        rowCount: 1,
      };
    }

    const existing = this.getBucketForParams(params)!;
    const availableQtyKg = existing.totalQtyKg;
    const availableValue = existing.totalValue;
    const unclampedQty = addDecimal(availableQtyKg, deltaQty);
    const unclampedValue = addDecimal(availableValue, deltaValue);
    const { totalQtyKg, totalValue, clamped } = coerceWacTotals(unclampedQty, unclampedValue);
    const rawClamped = compareDecimal(unclampedQty, '0') < 0 || compareDecimal(unclampedValue, '0') < 0;
    this.setBucketForParams(params, {
      totalQtyKg,
      totalValue,
      avgCost: compareDecimal(totalQtyKg, '0') > 0 ? divideDecimal(totalValue, totalQtyKg) : '0',
    });
    return {
      rows: [{
        totalQtyKg,
        totalValue,
        clamped: rawClamped || clamped,
        availableQtyKg,
        availableValue,
        rawQtyKg: unclampedQty,
        rawValue: unclampedValue,
      }] as T[],
      rowCount: 1,
    };
  }

  private applyLockedDebit<T>(_params: readonly unknown[]): { rows: T[]; rowCount: number } {
    throw new Error('applyLockedDebit is no longer used');
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
  poCurrency: string;

  constructor(options: { lineUom?: string; unitPrice?: string; wacQtyKg?: string; wacResolved?: boolean; poCurrency?: string } = {}) {
    this.lineUom = options.lineUom ?? 'kg';
    this.unitPrice = options.unitPrice ?? '4.20';
    this.wacQtyKg = options.wacQtyKg ?? null;
    this.wacResolved = options.wacResolved ?? null;
    this.poCurrency = options.poCurrency ?? 'GBP';
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
      return { rows: [{ item_id: ITEM_ID, unit_price: this.unitPrice, currency: this.poCurrency }] as T[] };
    }
    if (normalized.includes('from public.currencies where code = $1')) {
      const code = String(params?.[0] ?? '');
      if (['EUR', 'GBP', 'USD'].includes(code)) {
        return { rows: [{ id: `currency-${code}` }] as T[] };
      }
      return { rows: [] };
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

function coerceWacTotals(rawQty: string, rawValue: string): { totalQtyKg: string; totalValue: string; clamped: boolean } {
  const coercedQty = maxDecimal(rawQty, '0');
  const coercedValue = maxDecimal(rawValue, '0');
  const strandedValue = compareDecimal(coercedQty, '0') === 0 && compareDecimal(coercedValue, '0') > 0;
  const totalQtyKg = coercedQty;
  const totalValue = compareDecimal(coercedQty, '0') === 0 ? '0' : coercedValue;
  const clamped = strandedValue || compareDecimal(rawQty, '0') < 0 || compareDecimal(rawValue, '0') < 0;
  return { totalQtyKg, totalValue, clamped };
}

class ResolveWacMockClient {
  lastUomParam: string | undefined;

  constructor(private readonly options: { resolved?: boolean; qtyKg?: string; missingItem?: boolean }) {}

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount?: number | null }> {
    const normalized = normalize(sql);
    if (normalized.includes('from public.items i') && normalized.includes('as qty_kg')) {
      this.lastUomParam = String(params[1] ?? '');
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
