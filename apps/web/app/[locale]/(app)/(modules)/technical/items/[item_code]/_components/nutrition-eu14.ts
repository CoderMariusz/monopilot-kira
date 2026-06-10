/**
 * TAXONOMY lane — EU-14 allergen reference for the item-detail Nutrition tab's
 * inherited-allergens multi-pick.
 *
 * The freshly-landed `upsertNutrition` Server Action validates
 * `allergensInherited` against the positional codes A01…A14 (see
 * `../_actions/upsert-nutrition.ts` → `EU14_CODES`). The multi-pick therefore
 * stores A01…A14 — NOT the named `gluten`/`milk` codes the allergens *cascade*
 * editor uses — so the payload matches the backend enum 1:1.
 *
 * The English display names mirror the canonical EU FIC 1169/2011 ordering from
 * packages/db/seeds/allergens-eu14.ts (gluten…molluscs). Localized names are
 * supplied by the page via the `technical.items.detail.nutrition.allergenNames.*`
 * i18n keys (English fallbacks live here so RTL stays provider-free).
 */

export const EU14_CODES = [
  'A01',
  'A02',
  'A03',
  'A04',
  'A05',
  'A06',
  'A07',
  'A08',
  'A09',
  'A10',
  'A11',
  'A12',
  'A13',
  'A14',
] as const;

export type Eu14Code = (typeof EU14_CODES)[number];

/** A01…A14 → English EU-14 display name (regulatory order). */
export const EU14_DEFAULT_NAMES: Record<Eu14Code, string> = {
  A01: 'Gluten',
  A02: 'Crustaceans',
  A03: 'Eggs',
  A04: 'Fish',
  A05: 'Peanuts',
  A06: 'Soybeans',
  A07: 'Milk',
  A08: 'Nuts',
  A09: 'Celery',
  A10: 'Mustard',
  A11: 'Sesame',
  A12: 'Sulphites',
  A13: 'Lupin',
  A14: 'Molluscs',
};

export function isEu14Code(value: string): value is Eu14Code {
  return (EU14_CODES as readonly string[]).includes(value);
}
