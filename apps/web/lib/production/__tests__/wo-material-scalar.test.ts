import { describe, expect, it } from 'vitest';

import { computeWoMaterialScalar } from '../wo-material-scalar';

describe('computeWoMaterialScalar', () => {
  it('returns plannedBaseQty unchanged for per_base BOMs', () => {
    expect(
      computeWoMaterialScalar({
        plannedBaseQty: 100,
        lineBasis: 'per_base',
        eachPerBox: 4,
        netQtyPerEach: 0.5,
      }),
    ).toBe(100);
  });

  it('returns number of boxes for per_box BOMs', () => {
    expect(
      computeWoMaterialScalar({
        plannedBaseQty: 100,
        lineBasis: 'per_box',
        eachPerBox: 4,
        netQtyPerEach: 0.5,
      }),
    ).toBe(50);
  });

  it('falls back to plannedBaseQty for per_box BOMs with null each_per_box', () => {
    expect(
      computeWoMaterialScalar({
        plannedBaseQty: 100,
        lineBasis: 'per_box',
        eachPerBox: null,
        netQtyPerEach: 0.5,
      }),
    ).toBe(100);
  });

  it('falls back to plannedBaseQty for per_box BOMs with null netQtyPerEach', () => {
    expect(
      computeWoMaterialScalar({
        plannedBaseQty: 100,
        lineBasis: 'per_box',
        eachPerBox: 4,
        netQtyPerEach: null,
      }),
    ).toBe(100);
  });

  it('falls back to plannedBaseQty for per_box BOMs with zero each_per_box', () => {
    expect(
      computeWoMaterialScalar({
        plannedBaseQty: 100,
        lineBasis: 'per_box',
        eachPerBox: 0,
        netQtyPerEach: 0.5,
      }),
    ).toBe(100);
  });

  it('scales a worked per-box BOM line by the computed box count', () => {
    expect(
      5 *
        computeWoMaterialScalar({
          plannedBaseQty: 100,
          lineBasis: 'per_box',
          eachPerBox: 4,
          netQtyPerEach: 0.5,
        }),
    ).toBe(250);
  });
});
