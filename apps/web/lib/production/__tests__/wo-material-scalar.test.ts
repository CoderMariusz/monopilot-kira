import { describe, expect, it } from 'vitest';

import { computeWoMaterialScalar, WoMaterialScalarError } from '../wo-material-scalar';

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

  // Fail-loud (DB cleanup audit A2): a per_box BOM whose item lacks the pack
  // hierarchy must throw, not silently fall back to plannedBaseQty (~×kg/box
  // material overstatement). Callers catch this BEFORE any write.
  it('throws WoMaterialScalarError for per_box BOMs with null each_per_box', () => {
    expect(() =>
      computeWoMaterialScalar({
        plannedBaseQty: 100,
        lineBasis: 'per_box',
        eachPerBox: null,
        netQtyPerEach: 0.5,
      }),
    ).toThrow(WoMaterialScalarError);
  });

  it('throws WoMaterialScalarError for per_box BOMs with null netQtyPerEach', () => {
    expect(() =>
      computeWoMaterialScalar({
        plannedBaseQty: 100,
        lineBasis: 'per_box',
        eachPerBox: 4,
        netQtyPerEach: null,
      }),
    ).toThrow(WoMaterialScalarError);
  });

  it('throws WoMaterialScalarError for per_box BOMs with zero each_per_box', () => {
    expect(() =>
      computeWoMaterialScalar({
        plannedBaseQty: 100,
        lineBasis: 'per_box',
        eachPerBox: 0,
        netQtyPerEach: 0.5,
      }),
    ).toThrow(WoMaterialScalarError);
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
