import { describe, expect, it } from 'vitest';

import { shippingAllergenReferenceId } from './customer-allergen-reference';

describe('shippingAllergenReferenceId', () => {
  const ORG_ID = '11111111-1111-4111-8111-111111111111';

  it('is stable for org + allergen code and case-insensitive on code', () => {
    const lower = shippingAllergenReferenceId(ORG_ID, 'milk');
    const upper = shippingAllergenReferenceId(ORG_ID, 'MILK');
    const spaced = shippingAllergenReferenceId(ORG_ID, ' milk ');

    expect(lower).toBe(upper);
    expect(lower).toBe(spaced);
    expect(lower).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('matches the PostgreSQL shipping_allergen_reference_id slice layout', () => {
    // Vector from node mirror of migration 541 substring(h, …) — would diverge if TS used slice(13,16).
    expect(shippingAllergenReferenceId(ORG_ID, 'milk')).toBe('05b4bd55-a303-4fa3-a16c-fb3c57d072a5');
  });
});
