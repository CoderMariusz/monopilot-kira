import { describe, expect, it } from 'vitest';

import {
  formatRetailPriceEurDisplay,
  parseOptionalRetailPriceEur,
  parseRetailPriceEurInput,
} from '../retail-price-eur';

describe('retail-price-eur', () => {
  it('rejects more than two decimal places and negative values', () => {
    expect(parseRetailPriceEurInput('19.999')).toBeUndefined();
    expect(parseRetailPriceEurInput('-0.01')).toBeUndefined();
    expect(parseOptionalRetailPriceEur(19.999)).toBeUndefined();
  });

  it('canonicalizes valid input to two decimal places for input and display', () => {
    expect(parseRetailPriceEurInput('19.9')).toBe('19.90');
    expect(parseRetailPriceEurInput('19.90')).toBe('19.90');
    expect(formatRetailPriceEurDisplay('19.9')).toBe('19.90');
    expect(parseOptionalRetailPriceEur('19.999')).toBeUndefined();
    expect(parseOptionalRetailPriceEur('19.99')).toBe('19.99');
  });
});
