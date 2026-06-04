import { describe, expect, it } from 'vitest';

import { validateSuffixMatchV06 } from '../src/v06-suffix-match.js';

describe('V06 suffix match validator', () => {
  it('returns WARN with a generic mismatch message when recipe last component and last suffix differ', () => {
    const result = validateSuffixMatchV06({
      recipeComponents: 'Flour, Starter A',
      intermediateCodeFinal: 'WIP-MX-KN-PR-B-0000001',
    });

    expect(result).toEqual({
      status: 'WARN',
      severity: 'WARN',
      code: 'V06',
      message: 'Recipe component suffix does not match the final intermediate suffix.',
    });
  });
});
