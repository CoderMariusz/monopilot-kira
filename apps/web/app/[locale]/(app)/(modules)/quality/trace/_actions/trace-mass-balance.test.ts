import { describe, expect, it } from 'vitest';

import {
  BATCH_SEED_LIMIT,
  computeMassBalance,
  computeNettedMassBalance,
  computeNodeMassBalance,
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
  it('balances a WO node when input equals output + waste + remaining', () => {
    const { node } = computeNodeMassBalance({
      woRef: 'WO-1',
      inputRows: [{ ref: 'LP-IN', qty: '10', uom: 'kg' }],
      outputRows: [{ ref: 'LP-WIP', qty: '9', uom: 'kg' }],
      wasteRows: [{ ref: 'WO-1', qty: '1', uom: 'kg' }],
      remainingRows: [],
    });

    expect(node).toMatchObject({
      inputKg: '10',
      outputKg: '9',
      wasteKg: '1',
      remainingKg: '0',
      deltaKg: '0',
      balanced: true,
    });
  });

  it('flags a node delta when output exceeds input', () => {
    const { node } = computeNodeMassBalance({
      woRef: 'WO-1',
      inputRows: [{ ref: 'LP-IN', qty: '10', uom: 'kg' }],
      outputRows: [{ ref: 'LP-OUT', qty: '15', uom: 'kg' }],
      wasteRows: [],
      remainingRows: [],
    });

    expect(node.balanced).toBe(false);
    expect(node.deltaKg).toBe('-5');
    expect(isWithinEpsilon('-5')).toBe(false);
  });

  it('balances netted total when seed input equals shipped + on-site + waste', () => {
    const netted = computeNettedMassBalance({
      seedRows: [{ ref: 'LP-IN', qty: '10', uom: 'kg' }],
      onSiteRows: [],
      shippedRows: [{ ref: 'LP-OUT', qty: '8.5', uom: 'kg' }],
      wasteKg: '1.5',
    });

    expect(netted?.total).toMatchObject({
      seedInputKg: '10',
      shippedKg: '8.5',
      onSiteKg: '0',
      wasteKg: '1.5',
      deltaKg: '0',
      balanced: true,
      percentAccounted: '100',
    });
  });

  it('excludes non-kg rows into unreconciled instead of mixing units', () => {
    const netted = computeNettedMassBalance({
      seedRows: [
        { ref: 'LP-IN-KG', qty: '80', uom: 'kg' },
        { ref: 'LP-IN-PCS', qty: '12', uom: 'pcs' },
      ],
      onSiteRows: [],
      shippedRows: [{ ref: 'LP-OUT', qty: '80', uom: 'kg' }],
      wasteKg: '0',
    });

    expect(netted?.total.seedInputKg).toBe('80');
    expect(netted?.total.balanced).toBe(true);
    expect(netted?.unreconciled).toEqual([
      { ref: 'LP-IN-PCS', qty: '12', uom: 'pcs', bucket: 'netted_seed' },
    ]);
  });

  it('unattributedWasteRows appear in unreconciled and are included in netted wasteKg', () => {
    const unattributedWasteRows: TraceMassBalanceUnreconciled[] = [
      { ref: 'WO-2026-0099', qty: '5', uom: 'kg', bucket: 'unattributed_wo_waste', reason: 'unattributed_wo_waste' },
    ];
    const balance = computeMassBalance({
      nodes: [
        {
          woRef: 'WO-1',
          inputRows: [{ ref: 'LP-IN', qty: '100', uom: 'kg' }],
          outputRows: [{ ref: 'LP-OUT', qty: '95', uom: 'kg' }],
          wasteRows: [],
          remainingRows: [],
        },
      ],
      seedRows: [{ ref: 'LP-IN', qty: '100', uom: 'kg' }],
      onSiteRows: [],
      shippedRows: [{ ref: 'LP-OUT', qty: '95', uom: 'kg' }],
      wasteByWo: new Map([['WO-1', '5']]),
      unattributedWasteRows,
    });

    expect(balance?.total.wasteKg).toBe('5');
    expect(balance?.total.balanced).toBe(true);
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
