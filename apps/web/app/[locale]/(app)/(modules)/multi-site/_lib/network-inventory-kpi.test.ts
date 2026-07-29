import { describe, expect, it } from 'vitest';

import { formatInventoryQtyByUom } from './network-inventory-kpi';

describe('formatInventoryQtyByUom', () => {
  it('returns null for empty rows', () => {
    expect(formatInventoryQtyByUom([])).toBeNull();
  });

  it('labels each total with its UoM instead of summing unlike units', () => {
    expect(
      formatInventoryQtyByUom([
        { uom: 'kg', qty: '100.500' },
        { uom: 'pcs', qty: '250' },
      ]),
    ).toBe('100.500 kg · 250 pcs');
  });

  it('would mislead if kg and pcs were summed without UoM labels', () => {
    const formatted = formatInventoryQtyByUom([
      { uom: 'kg', qty: '100' },
      { uom: 'pcs', qty: '200' },
    ]);
    expect(formatted).not.toBe('300');
    expect(formatted).toContain('kg');
    expect(formatted).toContain('pcs');
  });
});
