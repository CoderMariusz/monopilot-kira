import { describe, expect, it } from 'vitest';

import { normalizeOrderUomLabel } from './order-line-uom';

describe('normalizeOrderUomLabel', () => {
  it('maps case/carton/pack trade labels to the box hierarchy rung', () => {
    expect(normalizeOrderUomLabel('case')).toBe('box');
    expect(normalizeOrderUomLabel('CASE')).toBe('box');
    expect(normalizeOrderUomLabel('carton')).toBe('box');
    expect(normalizeOrderUomLabel('pack')).toBe('box');
  });

  it('maps piece codes to each', () => {
    expect(normalizeOrderUomLabel('pcs')).toBe('each');
    expect(normalizeOrderUomLabel('ea')).toBe('each');
  });

  it('passes through base units unchanged', () => {
    expect(normalizeOrderUomLabel('kg')).toBe('kg');
    expect(normalizeOrderUomLabel('pallet')).toBe('pallet');
  });
});
