import { describe, expect, it } from 'vitest';

import { canEditProductionFromFormulationIngredientCount } from '../production-unlock';

describe('canEditProductionFromFormulationIngredientCount', () => {
  it('keeps Production locked until the current formulation has at least one ingredient row', () => {
    expect(canEditProductionFromFormulationIngredientCount(0)).toBe(false);
    expect(canEditProductionFromFormulationIngredientCount(null)).toBe(false);
    expect(canEditProductionFromFormulationIngredientCount(undefined)).toBe(false);
  });

  it('unlocks Production as soon as the current formulation has one or more ingredient rows', () => {
    expect(canEditProductionFromFormulationIngredientCount(1)).toBe(true);
    expect(canEditProductionFromFormulationIngredientCount(3)).toBe(true);
  });
});
