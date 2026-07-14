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

export interface ResolvedComponentNutrition {
  nutritionPer100g: RawMaterialNutrition;
  allergensInherited: string[];
}

export interface NutritionBomLine {
  componentCode: string;
  quantity: NutritionNumeric;
}

export interface ComponentNutritionLoaders {
  loadRawMaterials(
    codes: readonly string[],
  ): Promise<Record<string, ResolvedComponentNutrition | undefined>>;
  loadIntermediates(codes: readonly string[]): Promise<Record<string, string | undefined>>;
  loadActiveBom(itemId: string): Promise<readonly NutritionBomLine[]>;
}

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
// ponytail: 32 levels caps corrupt BOM recursion; raise only if a legitimate recipe chain reaches it.
const MAX_WIP_DEPTH = 32;

export async function resolveComponentNutrition(
  componentCodes: readonly string[],
  loaders: ComponentNutritionLoaders,
): Promise<Record<string, ResolvedComponentNutrition>> {
  const rawMaterials = new Map<string, ResolvedComponentNutrition>();
  const intermediateIds = new Map<string, string>();
  const checkedRaw = new Set<string>();
  const checkedItems = new Set<string>();
  const cache = new Map<string, ResolvedComponentNutrition>();

  async function prime(codes: readonly string[]): Promise<void> {
    const unique = [...new Set(codes)];
    const rawCodes = unique.filter((code) => !checkedRaw.has(code));
    if (rawCodes.length > 0) {
      const loaded = await loaders.loadRawMaterials(rawCodes);
      for (const code of rawCodes) {
        checkedRaw.add(code);
        const source = loaded[code];
        if (source) rawMaterials.set(code, source);
      }
    }
    const itemCodes = unique.filter((code) => !rawMaterials.has(code) && !checkedItems.has(code));
    if (itemCodes.length > 0) {
      const loaded = await loaders.loadIntermediates(itemCodes);
      for (const code of itemCodes) {
        checkedItems.add(code);
        const itemId = loaded[code];
        if (itemId) intermediateIds.set(code, itemId);
      }
    }
  }

  async function resolve(code: string, visited: Set<string>, path: string[]): Promise<ResolvedComponentNutrition> {
    const cached = cache.get(code);
    if (cached) return cached;
    if (visited.has(code)) throw new Error(`Cyclic WIP BOM: ${[...path, code].join(' -> ')}`);
    if (path.length >= MAX_WIP_DEPTH) throw new Error(`WIP BOM depth exceeds ${MAX_WIP_DEPTH}: ${[...path, code].join(' -> ')}`);

    await prime([code]);
    const raw = rawMaterials.get(code);
    if (raw) {
      cache.set(code, raw);
      return raw;
    }

    const itemId = intermediateIds.get(code);
    if (!itemId) {
      const empty = { nutritionPer100g: {}, allergensInherited: [] };
      cache.set(code, empty);
      return empty;
    }

    const lines = await loaders.loadActiveBom(itemId);
    const quantities = lines.map((line) => Dec.from(line.quantity));
    let total = Dec.zero();
    for (const quantity of quantities) {
      if (quantity.cmp(Dec.zero()) <= 0) throw new Error(`WIP BOM ${code} has a non-positive quantity`);
      total = total.add(quantity);
    }
    if (total.isZero()) {
      const empty = { nutritionPer100g: {}, allergensInherited: [] };
      cache.set(code, empty);
      return empty;
    }

    const nextVisited = new Set(visited).add(code);
    const nextPath = [...path, code];
    await prime(lines.map((line) => line.componentCode));
    const nutrients = new Map<string, Dec>();
    const allergens = new Set<string>();
    for (const [index, line] of lines.entries()) {
      const child = await resolve(line.componentCode, nextVisited, nextPath);
      const fraction = (quantities[index] as Dec).div(total);
      for (const [nutrient, value] of Object.entries(child.nutritionPer100g)) {
        if (value === null || value === undefined || value === '') continue;
        nutrients.set(nutrient, (nutrients.get(nutrient) ?? Dec.zero()).add(fraction.mul(Dec.from(value))));
      }
      for (const allergen of child.allergensInherited) {
        if (allergen) allergens.add(allergen);
      }
    }
    const result: ResolvedComponentNutrition = {
      nutritionPer100g: Object.fromEntries(
        [...nutrients.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value.toFixed(OUTPUT_DP)]),
      ),
      allergensInherited: [...allergens].sort(),
    };
    cache.set(code, result);
    return result;
  }

  const uniqueCodes = [...new Set(componentCodes)];
  await prime(uniqueCodes);
  const resolved: Record<string, ResolvedComponentNutrition> = {};
  for (const code of uniqueCodes) resolved[code] = await resolve(code, new Set(), []);
  return resolved;
}

export function computeNutrition(
  ingredients: readonly NutritionIngredient[],
  rmNutrition: RawMaterialNutritionByCode,
  options: ComputeNutritionOptions = {},
): ComputedNutritionRow[] {
  const per100g = computeNutritionPer100g(ingredients, rmNutrition);

  const portionFraction = Dec.from(options.portionGrams ?? DEFAULT_PORTION_GRAMS).div(HUNDRED);

  return NUTRIENT_CODES.map((code) => {
    const per100gDec = Dec.from(per100g[code]);
    return {
      nutrientCode: code,
      per100g: per100gDec.toFixed(OUTPUT_DP),
      perPortion: per100gDec.mul(portionFraction).toFixed(OUTPUT_DP),
    };
  });
}

export function computeNutritionPer100g(
  ingredients: readonly NutritionIngredient[],
  nutritionByCode: RawMaterialNutritionByCode,
): Record<string, string> {
  const acc = new Map<string, Dec>();
  for (const ingredient of ingredients) {
    const fraction = Dec.from(ingredient.pct).div(HUNDRED);
    for (const [nutrient, value] of Object.entries(nutritionByCode[ingredient.rmCode] ?? {})) {
      if (value === null || value === undefined || value === '') continue;
      acc.set(nutrient, (acc.get(nutrient) ?? Dec.zero()).add(fraction.mul(Dec.from(value))));
    }
  }
  return Object.fromEntries(
    [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value.toFixed(OUTPUT_DP)]),
  );
}
