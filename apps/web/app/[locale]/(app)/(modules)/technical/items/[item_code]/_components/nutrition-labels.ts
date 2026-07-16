/**
 * TAXONOMY lane — English default labels + next-intl translator for the item-detail
 * Nutrition tab. Mirrors the allergen-labels.ts pattern: the page translates via
 * the `technical.items.detail.nutrition` namespace with an English fallback; RTL
 * tests pass labels directly (no next-intl provider needed).
 */

import { getTranslations } from 'next-intl/server';

import { EU14_CODES, EU14_DEFAULT_NAMES } from './nutrition-eu14';
import type { NutritionTabLabels } from './nutrition-tab.client';

export const DEFAULT_NUTRITION_LABELS: NutritionTabLabels = {
  title: 'Nutrition (per 100 g)',
  subtitle:
    'Per-100 g nutrient declaration and inherited EU-14 allergens. Used to compute the finished-good label.',
  perHundred: 'Per 100 g',
  fields: {
    energy_kj: 'Energy (kJ)',
    fat_g: 'Fat (g)',
    saturates_g: 'Saturates (g)',
    carbs_g: 'Carbohydrate (g)',
    sugars_g: 'Sugars (g)',
    protein_g: 'Protein (g)',
    salt_g: 'Salt (g)',
  },
  allergensLegend: 'Inherited allergens (EU-14)',
  allergensHint: 'Allergens this material contributes to any finished good that consumes it.',
  allergenNames: { ...EU14_DEFAULT_NAMES },
  save: 'Save nutrition',
  saving: 'Saving…',
  saved: 'Nutrition saved.',
  loading: 'Loading nutrition…',
  empty: 'No nutrition recorded yet',
  emptyBody: 'Enter the per-100 g values and inherited allergens, then save.',
  error: 'Unable to load nutrition. Please try again.',
  forbidden: 'You can view nutrition but cannot edit this item.',
  notApplicable: 'Nutrition data is not applicable for this item type.',
  saveError: 'Could not save the nutrition. Please try again.',
  readonlyTitle: 'Computed nutrition (per 100 g)',
  colNutrient: 'Nutrient',
  colPer100g: 'Per 100 g',
  colPerPortion: 'Per portion',
  colAllergen: 'Allergen',
  colPresence: 'Presence',
  noComputed: 'No computed nutrition yet for this finished good.',
  computedNote: 'Recomputed from the materialized NPD nutrition model on {when}.',
  computedNoteNoDate: 'Materialized from the NPD nutrition model.',
  presence: {
    contains: 'Contains',
    may_contain: 'May contain',
    free_from: 'Free from',
    unknown: 'Unknown',
  },
};

/** Build the localized label bundle; falls back to English when a key is missing. */
export async function buildNutritionTabLabels(locale: string): Promise<NutritionTabLabels> {
  const t = await getTranslations({ locale, namespace: 'technical.items.detail.nutrition' });
  const fb = DEFAULT_NUTRITION_LABELS;

  // Resolve a key with an English fallback (avoids hard-crash when a locale lags).
  const tr = (key: string, fallback: string): string => {
    try {
      const value = t(key);
      return value && value !== key ? value : fallback;
    } catch {
      return fallback;
    }
  };

  const allergenNames: Record<string, string> = {};
  for (const code of EU14_CODES) {
    allergenNames[code] = tr(`allergenNames.${code}`, fb.allergenNames[code]);
  }

  return {
    title: tr('title', fb.title),
    subtitle: tr('subtitle', fb.subtitle),
    perHundred: tr('perHundred', fb.perHundred),
    fields: {
      energy_kj: tr('fields.energy_kj', fb.fields.energy_kj),
      fat_g: tr('fields.fat_g', fb.fields.fat_g),
      saturates_g: tr('fields.saturates_g', fb.fields.saturates_g),
      carbs_g: tr('fields.carbs_g', fb.fields.carbs_g),
      sugars_g: tr('fields.sugars_g', fb.fields.sugars_g),
      protein_g: tr('fields.protein_g', fb.fields.protein_g),
      salt_g: tr('fields.salt_g', fb.fields.salt_g),
    },
    allergensLegend: tr('allergensLegend', fb.allergensLegend),
    allergensHint: tr('allergensHint', fb.allergensHint),
    allergenNames,
    save: tr('save', fb.save),
    saving: tr('saving', fb.saving),
    saved: tr('saved', fb.saved),
    loading: tr('loading', fb.loading),
    empty: tr('empty', fb.empty),
    emptyBody: tr('emptyBody', fb.emptyBody),
    error: tr('error', fb.error),
    forbidden: tr('forbidden', fb.forbidden),
    notApplicable: tr('notApplicable', fb.notApplicable),
    saveError: tr('saveError', fb.saveError),
    readonlyTitle: tr('readonlyTitle', fb.readonlyTitle),
    colNutrient: tr('colNutrient', fb.colNutrient),
    colPer100g: tr('colPer100g', fb.colPer100g),
    colPerPortion: tr('colPerPortion', fb.colPerPortion),
    colAllergen: tr('colAllergen', fb.colAllergen),
    colPresence: tr('colPresence', fb.colPresence),
    noComputed: tr('noComputed', fb.noComputed),
    computedNote: tr('computedNote', fb.computedNote),
    computedNoteNoDate: tr('computedNoteNoDate', fb.computedNoteNoDate),
    presence: {
      contains: tr('presence.contains', fb.presence.contains),
      may_contain: tr('presence.may_contain', fb.presence.may_contain),
      free_from: tr('presence.free_from', fb.presence.free_from),
      unknown: tr('presence.unknown', fb.presence.unknown),
    },
  };
}
