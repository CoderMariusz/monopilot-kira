/**
 * T-048 — English default labels + next-intl translator for the allergens-config
 * screen (technical.allergens.config namespace, English fallback).
 */

import { getTranslations } from 'next-intl/server';

import type { AllergensConfigLabels } from './allergens-config.client';

export const DEFAULT_CONFIG_LABELS: AllergensConfigLabels = {
  title: 'Allergens configuration',
  subtitle:
    'Manufacturing-operation allergen additions and the line × allergen cross-contamination risk matrix (EU FIC 1169/2011).',
  tabMatrix: 'Contamination matrix',
  tabOps: 'Process additions',
  colLine: 'Production line',
  legendContains: 'High risk',
  legendMayContain: 'Medium risk',
  legendAbsent: 'No entry',
  gapBanner: '{count} line × allergen combinations have no contamination-risk entry.',
  gapLink: 'View gaps',
  riskLevel: {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    segregated: 'Segregated',
  },
  riskNone: 'No entry',
  loading: 'Loading allergens configuration…',
  empty: 'No lines or operations configured yet',
  emptyBody:
    'Add production lines (Settings → Infrastructure) and manufacturing operations to build the contamination-risk matrix.',
  error: 'Unable to load the allergens configuration. Please try again.',
  forbidden: 'You do not have permission to view the allergens configuration.',
  readOnlyTag: 'Read-only',
  opsTitle: 'Process allergen additions',
  opsColOperation: 'Manufacturing operation',
  opsColAllergen: 'Allergen',
  opsColReason: 'Reason',
  opsEmpty: 'No process-added allergens configured.',
  saveError: 'Could not save the change. Please try again.',
  cellAria: 'Contamination risk for',
};

function translate(
  t: (key: string) => string,
  defaults: AllergensConfigLabels,
): AllergensConfigLabels {
  const out: Record<string, string | Record<string, string>> = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (value !== null && typeof value === 'object') {
      const nested: Record<string, string> = {};
      for (const [nk, nv] of Object.entries(value as Record<string, string>)) {
        const dotted = `${key}.${nk}`;
        try {
          const resolved = t(dotted);
          nested[nk] = resolved === dotted ? nv : resolved;
        } catch {
          nested[nk] = nv;
        }
      }
      out[key] = nested;
    } else {
      try {
        const resolved = t(key);
        out[key] = resolved === key ? (value as string) : resolved;
      } catch {
        out[key] = value as string;
      }
    }
  }
  return out as unknown as AllergensConfigLabels;
}

export async function buildAllergensConfigLabels(locale: string): Promise<AllergensConfigLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'technical.allergens.config' });
    return translate(t as unknown as (key: string) => string, DEFAULT_CONFIG_LABELS);
  } catch {
    return { ...DEFAULT_CONFIG_LABELS };
  }
}
