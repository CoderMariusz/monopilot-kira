import { describe, expect, it } from 'vitest';

import { summarizeConsumptionProgress } from '../consumption-progress';

describe('summarizeConsumptionProgress (S7)', () => {
  it('returns a single scalar when all materials share one UoM', () => {
    const summary = summarizeConsumptionProgress([
      { uom: 'kg', required_qty: '100', consumed_qty: '50' },
      { uom: 'kg', required_qty: '50', consumed_qty: '25' },
    ]);
    expect(summary.mixedUnits).toBe(false);
    expect(summary.progressPct).toBe(50);
    expect(summary.byUom).toEqual([
      { uom: 'kg', requiredQty: '150', consumedQty: '75', progressPct: 50 },
    ]);
  });

  it('never sums kg and pcs into one headline percentage', () => {
    const summary = summarizeConsumptionProgress([
      { uom: 'kg', required_qty: '100', consumed_qty: '40' },
      { uom: 'pcs', required_qty: '10', consumed_qty: '5' },
    ]);
    expect(summary.mixedUnits).toBe(true);
    expect(summary.progressPct).toBeNull();
    expect(summary.byUom).toEqual([
      { uom: 'kg', requiredQty: '100', consumedQty: '40', progressPct: 40 },
      { uom: 'pcs', requiredQty: '10', consumedQty: '5', progressPct: 50 },
    ]);
  });
});
