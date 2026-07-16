import { describe, expect, it } from 'vitest';

import {
  computePoLineGross,
  computePoLineNet,
  computePoLineTax,
  computePoOrderTotals,
} from './po-line-price';

describe('computePoLineNet', () => {
  it('multiplies qty × unit_price with exact numeric scale', () => {
    expect(computePoLineNet('10', '6.2000')).toBe('62.0000');
    expect(computePoLineNet('3.25', '3.50')).toBe('11.3750');
  });
});

describe('computePoLineTax', () => {
  it('applies tax_pct to net without float drift', () => {
    expect(computePoLineTax('62.0000', '20')).toBe('12.4000');
    expect(computePoLineTax('100.0000', '5')).toBe('5.0000');
  });
});

describe('computePoLineGross', () => {
  it('returns net + tax (gross = net × (1 + tax_pct/100))', () => {
    expect(computePoLineGross('10', '6.2000', '20')).toBe('74.4000');
    expect(computePoLineGross('1', '100.0000', '0')).toBe('100.0000');
  });
});

describe('computePoOrderTotals', () => {
  it('rolls up net, tax and gross across lines', () => {
    expect(
      computePoOrderTotals([
        { qty: '10', unitPrice: '6.2000', taxPct: '20' },
        { qty: '5', unitPrice: '4.0000', taxPct: '5' },
      ]),
    ).toEqual({
      netTotal: '82.0000',
      taxTotal: '13.4000',
      grossTotal: '95.4000',
    });
  });
});
