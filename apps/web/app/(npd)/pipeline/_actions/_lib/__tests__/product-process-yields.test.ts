import { describe, expect, it } from 'vitest';

import {
  compoundYieldFractions,
  compoundedYieldPctForComponent,
  compoundedYieldPctForProduct,
  type ProductProcessYields,
} from '../product-process-yields';

function yields(overrides: Partial<ProductProcessYields> & Pick<ProductProcessYields, 'all'>): ProductProcessYields {
  return {
    byIngredientItemId: new Map(),
    byWipItemId: new Map(),
    componentCount: 1,
    ...overrides,
  };
}

describe('compoundYieldFractions', () => {
  it('returns 100 for an empty chain', () => {
    expect(compoundYieldFractions([])).toBe(100);
  });

  it('compounds the owner canonical 30 × 95 × 95 chain', () => {
    expect(compoundYieldFractions([30, 95, 95])).toBeCloseTo(27.075, 3);
  });

  it('skips invalid yield values', () => {
    expect(compoundYieldFractions([100, 0, 150, 95])).toBeCloseTo(95, 6);
  });
});

describe('compoundedYieldPctForProduct', () => {
  it('returns null when the product has no processes', () => {
    expect(compoundedYieldPctForProduct(yields({ all: [], componentCount: 0 }))).toBeNull();
  });

  it('returns null for multi-component products (ambiguous chain)', () => {
    expect(
      compoundedYieldPctForProduct(
        yields({ all: [95, 95], componentCount: 2 }),
      ),
    ).toBeNull();
  });

  it('compounds the single-component process chain', () => {
    expect(
      compoundedYieldPctForProduct(yields({ all: [30, 95, 95], componentCount: 1 })),
    ).toBeCloseTo(27.075, 3);
  });
});

describe('compoundedYieldPctForComponent', () => {
  it('matches product-wide compounding for a single-component product', () => {
    const data = yields({ all: [30, 95, 95], componentCount: 1 });
    expect(compoundedYieldPctForComponent(data, null)).toBeCloseTo(27.075, 3);
    expect(compoundedYieldPctForProduct(data)).toBeCloseTo(27.075, 3);
  });
});
