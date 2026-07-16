/**
 * W9-M2 — MRP netting core unit tests (pure math, node env).
 *
 * Covers: netting formula, shortage detection + severity ordering, BUY vs MAKE
 * suggestions with ceil-rounded qty, UoM mismatch exclusion (only same-base or
 * clean each/box pack-hierarchy conversions are netted), KPI tiles math.
 */
import { describe, expect, it } from 'vitest';

import {
  computeMrp,
  computeMrpPhased,
  normalizeToBase,
  type MrpItemRow,
  type MrpThresholdRow,
} from './mrp-compute';
import { addDaysIso, buildMrpBucketDates } from './mrp-buckets';

const RM_FLOUR: MrpItemRow = {
  id: 'item-flour',
  item_code: 'RM-FLOUR',
  name: 'Wheat flour',
  item_type: 'rm',
  uom_base: 'kg',
  output_uom: 'base',
  net_qty_per_each: null,
  each_per_box: null,
};

const INT_DOUGH: MrpItemRow = {
  id: 'item-dough',
  item_code: 'INT-DOUGH',
  name: 'Bread dough',
  item_type: 'intermediate',
  uom_base: 'kg',
  output_uom: 'base',
  net_qty_per_each: null,
  each_per_box: null,
};

const PKG_BOX: MrpItemRow = {
  id: 'item-box',
  item_code: 'PKG-BOX',
  name: 'Carton box',
  item_type: 'packaging',
  uom_base: 'pcs',
  output_uom: 'base',
  net_qty_per_each: null,
  each_per_box: null,
};

/** Item with a full pack hierarchy: 1 each = 0.5 kg, 1 box = 10 each. */
const RM_PACKED: MrpItemRow = {
  id: 'item-packed',
  item_code: 'RM-PACKED',
  name: 'Packed raw material',
  item_type: 'rm',
  uom_base: 'kg',
  output_uom: 'box',
  net_qty_per_each: '0.5',
  each_per_box: 10,
};

describe('normalizeToBase', () => {
  it('passes through quantities already in the base UoM', () => {
    expect(normalizeToBase(RM_FLOUR, 'kg', 12.5)).toBe(12.5);
  });

  it('converts each/box via the shared pack-hierarchy lib', () => {
    expect(normalizeToBase(RM_PACKED, 'each', 4)).toBe(2); // 4 × 0.5 kg
    expect(normalizeToBase(RM_PACKED, 'box', 2)).toBe(10); // 2 × 10 × 0.5 kg
  });

  it('returns null (excluded) for each/box without pack factors', () => {
    expect(normalizeToBase(RM_FLOUR, 'each', 4)).toBeNull();
    expect(normalizeToBase(RM_FLOUR, 'box', 1)).toBeNull();
  });

  it('returns null (excluded) for an unrelated UoM — never silently mixes', () => {
    expect(normalizeToBase(RM_FLOUR, 'lb', 10)).toBeNull();
    expect(normalizeToBase(PKG_BOX, 'kg', 10)).toBeNull();
  });
});

describe('computeMrp — netting formula', () => {
  it('computes net = onHand − reserved + openSupply − demand per item', () => {
    const { rows } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '100.000', reserved: '20.000' }],
      demand: [{ product_id: 'item-flour', uom: 'kg', qty: '50.000' }],
      poSupply: [{ product_id: 'item-flour', uom: 'kg', qty: '30.000' }],
      productionSupply: [],
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.onHand).toBe('100.000');
    expect(row.reserved).toBe('20.000');
    expect(row.openSupply).toBe('30.000');
    expect(row.demand).toBe('50.000');
    expect(row.net).toBe('60.000'); // 100 − 20 + 30 − 50
    expect(row.severity).toBe('covered');
    expect(row.suggestedAction).toBeNull();
  });

  it('flags shortages with BUY (rm/packaging) and ceil-rounded suggested qty', () => {
    const { rows, kpis } = computeMrp({
      items: [RM_FLOUR, PKG_BOX],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '10.000', reserved: '0' }],
      demand: [
        { product_id: 'item-flour', uom: 'kg', qty: '25.300' }, // short 15.3 → BUY 16
        { product_id: 'item-box', uom: 'pcs', qty: '7.000' }, // short 7 → BUY 7
      ],
      poSupply: [],
      productionSupply: [],
    });

    const flour = rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.severity).toBe('shortage');
    expect(flour.net).toBe('-15.300');
    expect(flour.suggestedAction).toEqual({ type: 'buy', qty: '16', dueDate: null, supplierId: null });

    const box = rows.find((r) => r.itemCode === 'PKG-BOX')!;
    expect(box.suggestedAction).toEqual({ type: 'buy', qty: '7', dueDate: null, supplierId: null });

    expect(kpis.itemsShort).toBe(2);
  });

  it('suggests MAKE for intermediates and counts schedule_outputs as open supply', () => {
    const { rows } = computeMrp({
      items: [INT_DOUGH],
      onHand: [],
      demand: [{ product_id: 'item-dough', uom: 'kg', qty: '40.000' }],
      productionSupply: [{ product_id: 'item-dough', uom: 'kg', qty: '15.000' }],
      poSupply: [],
    });

    const dough = rows[0];
    expect(dough.openSupply).toBe('15.000');
    expect(dough.net).toBe('-25.000');
    expect(dough.suggestedAction).toEqual({ type: 'make', qty: '25', dueDate: null, supplierId: null });
  });

  it('marks demand covered only by incoming supply as at_risk', () => {
    const { rows } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '10.000', reserved: '0' }],
      demand: [{ product_id: 'item-flour', uom: 'kg', qty: '30.000' }],
      poSupply: [{ product_id: 'item-flour', uom: 'kg', qty: '25.000' }],
      productionSupply: [],
    });

    expect(rows[0].severity).toBe('at_risk'); // net +5 but on-hand alone < demand
    expect(rows[0].suggestedAction).toBeNull();
  });

  it('sorts shortages first, most negative net on top', () => {
    const { rows } = computeMrp({
      items: [RM_FLOUR, INT_DOUGH, PKG_BOX],
      onHand: [{ product_id: 'item-box', uom: 'pcs', on_hand: '100', reserved: '0' }],
      demand: [
        { product_id: 'item-flour', uom: 'kg', qty: '5.000' }, // net −5
        { product_id: 'item-dough', uom: 'kg', qty: '50.000' }, // net −50
        { product_id: 'item-box', uom: 'pcs', qty: '10.000' }, // net +90 covered
      ],
      poSupply: [],
      productionSupply: [],
    });

    expect(rows.map((r) => r.itemCode)).toEqual(['INT-DOUGH', 'RM-FLOUR', 'PKG-BOX']);
  });

  it('excludes non-convertible UoM buckets and surfaces them per row', () => {
    const { rows } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '20.000', reserved: '0' }],
      demand: [
        { product_id: 'item-flour', uom: 'kg', qty: '5.000' },
        { product_id: 'item-flour', uom: 'lb', qty: '999.000' }, // no conversion → excluded
      ],
      poSupply: [],
      productionSupply: [],
    });

    const row = rows[0];
    expect(row.demand).toBe('5.000'); // the lb bucket is NOT mixed in
    expect(row.net).toBe('15.000');
    expect(row.excludedUoms).toEqual(['lb']);
  });

  it('nets each/box buckets via the pack hierarchy when factors exist', () => {
    const { rows } = computeMrp({
      items: [RM_PACKED],
      onHand: [{ product_id: 'item-packed', uom: 'box', on_hand: '2', reserved: '0' }], // 10 kg
      demand: [{ product_id: 'item-packed', uom: 'each', qty: '30' }], // 15 kg
      poSupply: [],
      productionSupply: [],
    });

    const row = rows[0];
    expect(row.onHand).toBe('10.000');
    expect(row.demand).toBe('15.000');
    expect(row.net).toBe('-5.000');
    expect(row.suggestedAction).toEqual({ type: 'buy', qty: '5', dueDate: null, supplierId: null });
    expect(row.excludedUoms).toEqual([]);
  });

  it('ignores buckets for unknown items (fg etc.) and reports honest KPIs', () => {
    const { rows, kpis } = computeMrp({
      items: [RM_FLOUR],
      onHand: [],
      demand: [
        { product_id: 'item-flour', uom: 'kg', qty: '10.000' },
        { product_id: 'item-unknown-fg', uom: 'kg', qty: '999.000' },
      ],
      poSupply: [],
      productionSupply: [],
    });

    expect(rows).toHaveLength(1);
    expect(kpis.itemsAnalyzed).toBe(1);
    expect(kpis.itemsShort).toBe(1);
    expect(kpis.totalDemand).toBe('10.000');
    expect(kpis.coveragePct).toBe(0);
  });

  it('reports 100% coverage when there is no open demand', () => {
    const { kpis } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '5.000', reserved: '0' }],
      demand: [],
      poSupply: [],
      productionSupply: [],
    });
    expect(kpis.coveragePct).toBe(100);
    expect(kpis.itemsShort).toBe(0);
  });

  it('nets 0.1 + 0.2 against 0.3 to EXACT zero (0.1+0.2 float class — no float drift)', () => {
    // In float, 0.1 + 0.2 = 0.30000000000000004 → net would be a negative dust
    // value. With micro-unit bigints the netting is exact.
    const { rows, kpis } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '0.300', reserved: '0' }],
      demand: [
        { product_id: 'item-flour', uom: 'kg', qty: '0.100' },
        { product_id: 'item-flour', uom: 'kg', qty: '0.200' },
      ],
      poSupply: [],
      productionSupply: [],
    });

    const row = rows[0];
    expect(row.demand).toBe('0.300'); // exactly 0.1 + 0.2
    expect(row.net).toBe('0.000'); // exactly zero — NOT a float-dust shortage
    expect(row.severity).toBe('covered');
    expect(row.suggestedAction).toBeNull();
    expect(kpis.itemsShort).toBe(0);
    expect(kpis.coveragePct).toBe(100);
  });

  it('accumulates 15.333 repeated exactly (3 × 15.333 = 45.999, 1g short of 45.998 on-hand... flipped)', () => {
    // 15.333 × 3 in float = 45.998999999999995; exact arithmetic must yield
    // 45.999 and detect the precise 0.001 shortage against 45.998 on-hand.
    const { rows } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '45.998', reserved: '0' }],
      demand: [
        { product_id: 'item-flour', uom: 'kg', qty: '15.333' },
        { product_id: 'item-flour', uom: 'kg', qty: '15.333' },
        { product_id: 'item-flour', uom: 'kg', qty: '15.333' },
      ],
      poSupply: [],
      productionSupply: [],
    });

    const row = rows[0];
    expect(row.demand).toBe('45.999');
    expect(row.net).toBe('-0.001'); // exact 1g shortage
    expect(row.severity).toBe('shortage');
    expect(row.suggestedAction).toEqual({ type: 'buy', qty: '1', dueDate: null, supplierId: null }); // ceil(0.001)
  });

  it('covers 3 × 15.333 demand with exactly 45.999 on-hand (no phantom shortage)', () => {
    const { rows, kpis } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '45.999', reserved: '0' }],
      demand: [
        { product_id: 'item-flour', uom: 'kg', qty: '15.333' },
        { product_id: 'item-flour', uom: 'kg', qty: '15.333' },
        { product_id: 'item-flour', uom: 'kg', qty: '15.333' },
      ],
      poSupply: [],
      productionSupply: [],
    });

    expect(rows[0].net).toBe('0.000');
    expect(rows[0].severity).toBe('covered');
    expect(kpis.itemsShort).toBe(0);
  });

  it('converts 4dp NUMERIC pack factors exactly (each × 0.3333 kg)', () => {
    const fineItem: MrpItemRow = {
      ...RM_PACKED,
      id: 'item-fine',
      item_code: 'RM-FINE',
      net_qty_per_each: '0.3333', // 4dp NUMERIC string
      each_per_box: 10,
    };
    const { rows } = computeMrp({
      items: [fineItem],
      onHand: [{ product_id: 'item-fine', uom: 'each', on_hand: '3', reserved: '0' }], // 0.9999 kg
      demand: [{ product_id: 'item-fine', uom: 'kg', qty: '1.000' }],
      poSupply: [],
      productionSupply: [],
    });

    const row = rows[0];
    expect(row.onHand).toBe('1.000'); // 0.9999 exact in micro-units, 3dp display rounds
    expect(row.net).toBe('0.000'); // −0.0001 micro-exact rounds to 0.000 at 3dp (never "-0.000")
    expect(row.severity).toBe('shortage'); // exact: 0.9999 < 1.000 — a real (sub-display) shortage
    expect(row.suggestedAction).toEqual({ type: 'buy', qty: '1', dueDate: null, supplierId: null });
  });

  it('computes demand-weighted coverage', () => {
    const { kpis } = computeMrp({
      items: [RM_FLOUR, PKG_BOX],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '75.000', reserved: '0' }],
      demand: [
        { product_id: 'item-flour', uom: 'kg', qty: '100.000' }, // shortage 25
        { product_id: 'item-box', uom: 'pcs', qty: '100.000' }, // shortage 100
      ],
      poSupply: [],
      productionSupply: [],
    });
    // total demand 200, total shortage 125 → coverage 37.5%
    expect(kpis.totalDemand).toBe('200.000');
    expect(kpis.coveragePct).toBe(37.5);
  });
});

describe('computeMrp — reorder thresholds (mig 178, CL2)', () => {
  const SUPPLIER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const threshold = (over: Partial<MrpThresholdRow> = {}): MrpThresholdRow => ({
    item_id: 'item-flour',
    min_qty: '20.000',
    reorder_qty: '0',
    preferred_supplier_id: null,
    lead_time_days: null,
    ...over,
  });

  it('flags net >= 0 below min_qty as below_min with its own severity (not shortage)', () => {
    const { rows, kpis } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '30.000', reserved: '0' }],
      demand: [{ product_id: 'item-flour', uom: 'kg', qty: '15.000' }],
      poSupply: [],
      productionSupply: [],
      thresholds: [threshold()], // min 20, net = 15 → below min
      today: '2026-06-11',
    });

    const row = rows[0];
    expect(row.net).toBe('15.000');
    expect(row.severity).toBe('below_min');
    expect(row.minQty).toBe('20.000');
    // gap = 20 − 15 = 5; reorder lot 0 → top up to the floor only.
    expect(row.suggestedAction).toEqual({ type: 'buy', qty: '5', dueDate: null, supplierId: null });
    expect(kpis.itemsBelowMin).toBe(1);
    expect(kpis.itemsShort).toBe(0);
  });

  it('suggests at least the configured reorder lot when it exceeds the gap', () => {
    const { rows } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '19.000', reserved: '0' }],
      demand: [],
      poSupply: [],
      productionSupply: [],
      thresholds: [threshold({ reorder_qty: '50.000' })], // gap 1, lot 50 → 50
      today: '2026-06-11',
    });
    expect(rows[0].suggestedAction).toEqual({ type: 'buy', qty: '50', dueDate: null, supplierId: null });
  });

  it('tops a thresholded SHORTAGE back up over the floor — qty = max(min−net, lot), exact bigints', () => {
    const { rows, kpis } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '10.000', reserved: '0' }],
      demand: [{ product_id: 'item-flour', uom: 'kg', qty: '25.300' }], // net −15.3
      poSupply: [],
      productionSupply: [],
      thresholds: [threshold({ min_qty: '20.000' })],
      today: '2026-06-11',
    });
    const row = rows[0];
    expect(row.severity).toBe('shortage'); // negative net stays RED
    expect(row.net).toBe('-15.300');
    // gap to the floor = 20 − (−15.3) = 35.3 → ceil 36 (not just the 16 shortage cover).
    expect(row.suggestedAction).toEqual({ type: 'buy', qty: '36', dueDate: null, supplierId: null });
    expect(kpis.itemsShort).toBe(1);
    expect(kpis.itemsBelowMin).toBe(0);
  });

  it('derives the due date from the preferred supplier lead time (today + N days)', () => {
    const { rows } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '5.000', reserved: '0' }],
      demand: [],
      poSupply: [],
      productionSupply: [],
      thresholds: [threshold({ preferred_supplier_id: SUPPLIER, lead_time_days: 7 })],
      today: '2026-06-11',
    });
    expect(rows[0].suggestedAction).toEqual({
      type: 'buy',
      qty: '15', // gap 20 − 5
      dueDate: '2026-06-18',
      supplierId: SUPPLIER,
    });
  });

  it('keeps the due date null when the preferred supplier is unset (honest)', () => {
    const { rows } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '5.000', reserved: '0' }],
      demand: [],
      poSupply: [],
      productionSupply: [],
      // lead_time_days present but NO preferred supplier → no due date.
      thresholds: [threshold({ preferred_supplier_id: null, lead_time_days: 7 })],
      today: '2026-06-11',
    });
    expect(rows[0].suggestedAction!.dueDate).toBeNull();
    expect(rows[0].suggestedAction!.supplierId).toBeNull();
  });

  it('surfaces a zero-activity item whose floor is configured (net 0 < min)', () => {
    const { rows, kpis } = computeMrp({
      items: [RM_FLOUR],
      onHand: [],
      demand: [],
      poSupply: [],
      productionSupply: [],
      thresholds: [threshold({ min_qty: '12.500', reorder_qty: '10.000' })],
      today: '2026-06-11',
    });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.severity).toBe('below_min');
    expect(row.suggestedAction).toEqual({ type: 'buy', qty: '20', dueDate: null, supplierId: null }); // ceil(12.5/10)*10
    expect(kpis.itemsBelowMin).toBe(1);
  });

  it('MAKE for a thresholded intermediate; exact micro math on a 6dp min', () => {
    const { rows } = computeMrp({
      items: [INT_DOUGH],
      onHand: [{ product_id: 'item-dough', uom: 'kg', on_hand: '0.999999', reserved: '0' }],
      demand: [],
      poSupply: [],
      productionSupply: [],
      thresholds: [threshold({ item_id: 'item-dough', min_qty: '1.000001', reorder_qty: '0' })],
      today: '2026-06-11',
    });
    const row = rows[0];
    expect(row.severity).toBe('below_min'); // 0.999999 < 1.000001 — exact, no float dust
    // gap = 0.000002 → ceil to 1 whole unit.
    expect(row.suggestedAction).toEqual({ type: 'make', qty: '1', dueDate: null, supplierId: null });
  });

  it('R10-02: rounds the replenishment gap up to the configured reorder lot multiple (6dp exact)', () => {
    const { rows } = computeMrp({
      items: [RM_FLOUR],
      onHand: [],
      demand: [],
      poSupply: [],
      productionSupply: [],
      thresholds: [
        threshold({
          min_qty: '123.456788',
          reorder_qty: '7.654322',
        }),
      ],
      today: '2026-07-15',
    });
    const row = rows[0];
    expect(row.severity).toBe('below_min');
    // ceil(123.456788 / 7.654322) = 17 lots → 17 × 7.654322 = 130.123474
    expect(row.suggestedAction).toEqual({
      type: 'buy',
      qty: '130.123474',
      dueDate: null,
      supplierId: null,
    });
  });

  it('a satisfied floor changes nothing (net >= min → covered, no suggestion)', () => {
    const { rows, kpis } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '20.000', reserved: '0' }],
      demand: [],
      poSupply: [],
      productionSupply: [],
      thresholds: [threshold()], // min 20, net 20 → NOT below
      today: '2026-06-11',
    });
    expect(rows[0].severity).toBe('covered');
    expect(rows[0].suggestedAction).toBeNull();
    expect(kpis.itemsBelowMin).toBe(0);
  });

  it('sorts below_min between shortage and at_risk', () => {
    const { rows } = computeMrp({
      items: [RM_FLOUR, INT_DOUGH, PKG_BOX],
      onHand: [
        { product_id: 'item-flour', uom: 'kg', on_hand: '10.000', reserved: '0' }, // below min
        { product_id: 'item-box', uom: 'pcs', on_hand: '5.000', reserved: '0' },
      ],
      demand: [
        { product_id: 'item-dough', uom: 'kg', qty: '5.000' }, // shortage −5
        { product_id: 'item-box', uom: 'pcs', qty: '10.000' }, // at_risk via PO supply
      ],
      poSupply: [{ product_id: 'item-box', uom: 'pcs', qty: '10.000' }],
      productionSupply: [],
      thresholds: [threshold()], // flour min 20 > net 10
      today: '2026-06-11',
    });
    expect(rows.map((r) => r.severity)).toEqual(['shortage', 'below_min', 'at_risk']);
  });

  it('nets sales-order demand alongside dependent WO demand and tracks soDemand separately (NN-PLAN-4)', () => {
    const { rows } = computeMrp({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '100.000', reserved: '0' }],
      demand: [{ product_id: 'item-flour', uom: 'kg', qty: '40.000' }],
      soDemand: [{ product_id: 'item-flour', uom: 'kg', qty: '15.000' }],
      poSupply: [],
      productionSupply: [],
    });

    const row = rows[0];
    expect(row.demand).toBe('55.000');
    expect(row.soDemand).toBe('15.000');
    expect(row.forecastDemand).toBe('0.000');
    expect(row.net).toBe('45.000');
  });

  it('converts each/box SO demand via the shared pack-hierarchy machinery (NN-PLAN-4)', () => {
    const { rows } = computeMrp({
      items: [RM_PACKED],
      onHand: [],
      demand: [],
      soDemand: [{ product_id: 'item-packed', uom: 'each', qty: '4' }],
      poSupply: [],
      productionSupply: [],
    });

    const row = rows[0];
    expect(row.soDemand).toBe('2.000'); // 4 each × 0.5 kg
    expect(row.demand).toBe('2.000');
    expect(row.net).toBe('-2.000');
  });
});

describe('computeMrpPhased — weekly buckets (C3b)', () => {
  const SUPPLIER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const today = '2026-06-11';
  const buckets = buildMrpBucketDates(today, 4);
  const week3 = buckets[2]!;

  it('matches computeMrp totals when horizon = 1 bucket (invariance)', () => {
    const input = {
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '40.000', reserved: '10.000' }],
      demand: [{ product_id: 'item-flour', uom: 'kg', qty: '80.000', need_date: today }],
      poSupply: [{ product_id: 'item-flour', uom: 'kg', qty: '25.000', need_date: today }],
      productionSupply: [] as const,
      today,
    };
    const single = computeMrp(input);
    const phased = computeMrpPhased({ ...input, horizonWeeks: 1 });
    expect(phased.rows[0]?.net).toBe(single.rows[0]?.net);
    expect(phased.rows[0]?.demand).toBe(single.rows[0]?.demand);
    expect(phased.rows[0]?.openSupply).toBe(single.rows[0]?.openSupply);
    expect(phased.kpis).toEqual(single.kpis);
  });

  it('nets multi-bucket PAB and places demand in the correct week bucket', () => {
    const { bucketRows } = computeMrpPhased({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '100.000', reserved: '0' }],
      demand: [],
      soDemand: [{ product_id: 'item-flour', uom: 'kg', qty: '30.000', need_date: week3 }],
      poSupply: [],
      productionSupply: [],
      today,
      horizonWeeks: 4,
    });

    const quiet = bucketRows.filter((r) => r.bucketIndex < 2);
    const spike = bucketRows.find((r) => r.bucketDate === week3)!;
    expect(quiet.every((r) => r.grossRequirement === '0.000' && r.projectedAvailable === '100.000')).toBe(true);
    expect(spike.grossRequirement).toBe('30.000');
    expect(spike.projectedAvailable).toBe('70.000');
    expect(spike.severity).toBe('covered');
  });

  it('releases a planned order in week 3 minus supplier lead time', () => {
    const { bucketRows } = computeMrpPhased({
      items: [RM_FLOUR],
      onHand: [],
      demand: [],
      soDemand: [{ product_id: 'item-flour', uom: 'kg', qty: '30.000', need_date: week3 }],
      poSupply: [],
      productionSupply: [],
      thresholds: [
        {
          item_id: 'item-flour',
          min_qty: '0',
          reorder_qty: '0',
          preferred_supplier_id: SUPPLIER,
          lead_time_days: 7,
        },
      ],
      today,
      horizonWeeks: 4,
    });

    const spike = bucketRows.find((r) => r.bucketDate === week3)!;
    expect(spike.severity).toBe('shortage');
    expect(spike.suggestedAction).toMatchObject({
      type: 'buy',
      qty: '30',
      dueDate: week3,
      releaseDate: addDaysIso(week3, -7),
      supplierId: SUPPLIER,
    });
  });

  it('rolls multi-bucket PAB forward — stock covers week 1, shortage in week 2', () => {
    const week2 = buckets[1]!;
    const { bucketRows } = computeMrpPhased({
      items: [RM_FLOUR],
      onHand: [{ product_id: 'item-flour', uom: 'kg', on_hand: '30.000', reserved: '0' }],
      demand: [
        { product_id: 'item-flour', uom: 'kg', qty: '20.000', need_date: buckets[0]! },
        { product_id: 'item-flour', uom: 'kg', qty: '25.000', need_date: week2 },
      ],
      poSupply: [],
      productionSupply: [],
      today,
      horizonWeeks: 4,
    });

    const b0 = bucketRows.find((r) => r.bucketDate === buckets[0])!;
    const b1 = bucketRows.find((r) => r.bucketDate === week2)!;
    expect(b0.projectedAvailable).toBe('10.000');
    expect(b1.severity).toBe('shortage');
    expect(b1.net).toBe('-15.000');
    expect(b1.suggestedAction?.qty).toBe('15');
  });

  it('ignores PO supply dated after the horizon — far-future receipt does not cover in-horizon shortage', () => {
    const week2 = buckets[1]!;
    const afterHorizon = addDaysIso(buckets[3]!, 7);
    const { bucketRows } = computeMrpPhased({
      items: [RM_FLOUR],
      onHand: [],
      demand: [{ product_id: 'item-flour', uom: 'kg', qty: '20.000', need_date: week2 }],
      poSupply: [{ product_id: 'item-flour', uom: 'kg', qty: '100.000', need_date: afterHorizon }],
      productionSupply: [],
      today,
      horizonWeeks: 4,
    });

    const shortage = bucketRows.find((r) => r.bucketDate === week2)!;
    expect(shortage.severity).toBe('shortage');
    expect(shortage.scheduledReceipts).toBe('0.000');
    expect(shortage.net).toBe('-20.000');
  });

  it('clamps release to today and flags expedite when lead time exceeds time-to-bucket (S12)', () => {
    const week2 = buckets[1]!;
    const { bucketRows } = computeMrpPhased({
      items: [RM_FLOUR],
      onHand: [],
      demand: [],
      soDemand: [{ product_id: 'item-flour', uom: 'kg', qty: '30.000', need_date: week2 }],
      poSupply: [],
      productionSupply: [],
      thresholds: [
        {
          item_id: 'item-flour',
          min_qty: '0',
          reorder_qty: '0',
          preferred_supplier_id: SUPPLIER,
          lead_time_days: 14,
        },
      ],
      today,
      horizonWeeks: 4,
    });

    const spike = bucketRows.find((r) => r.bucketDate === week2)!;
    expect(spike.severity).toBe('shortage');
    expect(spike.suggestedAction).toMatchObject({
      type: 'buy',
      qty: '30',
      dueDate: week2,
      releaseDate: today,
      isLate: true,
      supplierId: SUPPLIER,
    });
  });
});
