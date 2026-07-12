import { describe, expect, it } from 'vitest';

import { buildAllergenCascadeData } from '../build-allergen-cascade-data';

describe('buildAllergenCascadeData (S20)', () => {
  it('keeps a product shell when the cascade read-model is missing but declaration must be accepted', () => {
    const data = buildAllergenCascadeData(
      'FG-001',
      null,
      { accepted: false, acceptedBy: null, acceptedAt: null },
    );
    expect(data.productCode).toBe('FG-001');
    expect(data.publishedAllergens).toEqual([]);
    expect(data.declarationAccepted).toBe(false);
  });
});
