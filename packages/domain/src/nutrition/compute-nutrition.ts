import { Dec } from '../formulation/decimal.js';

export const NUTRIENT_CODES = [
  'energy_kj',
  'fat_g',
  'saturates_g',
  'carbs_g',
  'sugars_g',
  'protein_g',
  'salt_g',
] as const;

export type NutrientCode = (typeof NUTRIENT_CODES)[number];
export type NutritionNumeric = string | null | undefined;

export interface NutritionIngredient {
  rmCode: string;
  pct: NutritionNumeric;
}

export type RawMaterialNutrition = Partial<Record<NutrientCode | string, NutritionNumeric>>;
export type RawMaterialNutritionByCode = Record<string, RawMaterialNutrition | undefined>;

export interface ComputeNutritionOptions {
  portionGrams?: NutritionNumeric;
}

export interface ComputedNutritionRow {
  nutrientCode: NutrientCode;
  per100g: string;
  perPortion: string;
}

const HUNDRED = Dec.from('100');
const DEFAULT_PORTION_GRAMS = '100';
const OUTPUT_DP = 2;

export function computeNutrition(
  ingredients: readonly NutritionIngredient[],
  rmNutrition: RawMaterialNutritionByCode,
  options: ComputeNutritionOptions = {},
): ComputedNutritionRow[] {
  const acc = new Map<NutrientCode, Dec>();
  for (const code of NUTRIENT_CODES) {
    acc.set(code, Dec.zero());
  }

  for (const ingredient of ingredients) {
    const fraction = Dec.from(ingredient.pct).div(HUNDRED);
    const nutrition = rmNutrition[ingredient.rmCode] ?? {};

    for (const code of NUTRIENT_CODES) {
      const value = nutrition[code];
      if (value === null || value === undefined || value === '') continue;
      acc.set(code, (acc.get(code) ?? Dec.zero()).add(fraction.mul(Dec.from(value))));
    }
  }

  const portionFraction = Dec.from(options.portionGrams ?? DEFAULT_PORTION_GRAMS).div(HUNDRED);

  return NUTRIENT_CODES.map((code) => {
    const per100gDec = acc.get(code) ?? Dec.zero();
    return {
      nutrientCode: code,
      per100g: per100gDec.toFixed(OUTPUT_DP),
      perPortion: per100gDec.mul(portionFraction).toFixed(OUTPUT_DP),
    };
  });
}
