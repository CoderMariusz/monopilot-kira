import { describe, expect, it } from 'vitest';

import {
  BATCH_SEED_LIMIT,
  computeMassBalance,
  isWithinEpsilon,
  LP_SEED_LIMIT,
  sliceSeedRows,
} from './trace-mass-balance';
import type { TraceMassBalanceUnreconciled } from './trace-types';

describe('trace seed truncation', () => {
  it('sliceSeedRows flags seed_lp when limit+1 rows are returned', () => {
    const rows = Array.from({ length: LP_SEED_LIMIT + 1 }, (_, index) => ({ id: `lp-${index}` }));
    const result = sliceSeedRows(rows, LP_SEED_LIMIT, 'seed_lp');
    expect(result.ids).toHaveLength(LP_SEED_LIMIT);
    expect(result.layer).toEqual({ layer: 'seed_lp', limit: LP_SEED_LIMIT });
  });

  it('sliceSeedRows is not truncated below the cap', () => {
    const rows = Array.from({ length: BATCH_SEED_LIMIT }, (_, index) => ({ id: `lp-${index}` }));
    const result = sliceSeedRows(rows, BATCH_SEED_LIMIT, 'seed_batch');
    expect(result.ids).toHaveLength(BATCH_SEED_LIMIT);
    expect(result.layer).toBeNull();
  });
});

describe('trace mass balance math', () => {
  it('balances when produced equals on-site + shipped + waste', () => {
    const balance = computeMassBalance({
      producedRows: [{ ref: 'LP-OUT', qty: '100', uom: 'kg' }],
      onSiteRows: [{ ref: 'LP-OUT', qty: '40', uom: 'kg' }],
      shippedRows: [{ ref: 'LP-OUT', qty: '50', uom: 'kg' }],
      wasteKg: '10',
    });

    expect(balance).toMatchObject({
      balanced: true,
      percentRecovered: '100',
      unreconciled: [],
    });
    expect(balance?.lines.find((line) => line.key === 'delta')?.qtyKg).toBe('0');
  });

  it('flags a delta when waste is missing from reconciliation', () => {
    const balance = computeMassBalance({
      producedRows: [{ ref: 'LP-OUT', qty: '100', uom: 'kg' }],
      onSiteRows: [{ ref: 'LP-OUT', qty: '60', uom: 'kg' }],
      shippedRows: [{ ref: 'LP-OUT', qty: '30', uom: 'kg' }],
      wasteKg: '0',
    });

    expect(balance?.balanced).toBe(false);
    expect(balance?.lines.find((line) => line.key === 'delta')?.qtyKg).toBe('10');
    expect(isWithinEpsilon('10')).toBe(false);
  });

  it('excludes non-kg rows into unreconciled instead of mixing units', () => {
    const balance = computeMassBalance({
      producedRows: [
        { ref: 'LP-OUT-KG', qty: '80', uom: 'kg' },
        { ref: 'LP-OUT-PCS', qty: '12', uom: 'pcs' },
      ],
      onSiteRows: [{ ref: 'LP-OUT-KG', qty: '80', uom: 'kg' }],
      shippedRows: [],
      wasteKg: '0',
    });

    expect(balance?.lines.find((line) => line.key === 'produced')?.qtyKg).toBe('80');
    expect(balance?.balanced).toBe(true);
    expect(balance?.unreconciled).toEqual([
      { ref: 'LP-OUT-PCS', qty: '12', uom: 'pcs', bucket: 'produced' },
    ]);
  });

  it('F1: unattributedWasteRows appear in unreconciled with bucket unattributed_wo_waste and do NOT inflate wasteKg', () => {
    const unattributedWasteRows: TraceMassBalanceUnreconciled[] = [
      { ref: 'WO-2026-0099', qty: '5', uom: 'kg', bucket: 'unattributed_wo_waste', reason: 'unattributed_wo_waste' },
    ];
    const balance = computeMassBalance({
      producedRows: [{ ref: 'LP-OUT', qty: '100', uom: 'kg' }],
      onSiteRows: [{ ref: 'LP-OUT', qty: '60', uom: 'kg' }],
      shippedRows: [{ ref: 'LP-OUT', qty: '40', uom: 'kg' }],
      wasteKg: '0',
      unattributedWasteRows,
    });

    // wasteKg stays 0 — unattributed waste is NOT counted in the balance sum
    expect(balance?.lines.find((l) => l.key === 'waste')?.qtyKg).toBe('0');
    expect(balance?.balanced).toBe(true);
    // The unattributed row surfaces in unreconciled for auditor visibility
    if (!balance || !('applicable' in balance)) throw new Error('expected applicable balance');
    expect(balance.unreconciled).toContainEqual({
      ref: 'WO-2026-0099',
      qty: '5',
      uom: 'kg',
      bucket: 'unattributed_wo_waste',
      reason: 'unattributed_wo_waste',
    });
  });
});
