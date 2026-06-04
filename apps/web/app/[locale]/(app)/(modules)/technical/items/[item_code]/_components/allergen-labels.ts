/**
 * T-047 / T-049 — English default labels + next-intl translator for the allergen
 * profile editor + override-audit panel. Mirrors the established
 * fa/_lib/allergen-cascade.tsx DEFAULT_LABELS pattern: pages translate via
 * `technical.allergens` namespace with an English fallback, RTL tests pass labels
 * directly (no next-intl provider needed).
 */

import { getTranslations } from 'next-intl/server';

import type { AllergensTabLabels } from './allergens-tab.client';
import type { OverrideAuditLabels } from '../../../allergens/overrides/_components/override-audit.client';

export const DEFAULT_TAB_LABELS: AllergensTabLabels = {
  title: 'Allergen profile',
  subtitle:
    'Per-item allergen declaration (EU FIC 1169/2011 — 14 mandatory allergens). Auto-cascaded badges are read-only; manual overrides are additive and require a reason.',
  declareCta: 'Declare / override',
  sourceHeading: {
    cascaded: 'Auto-cascaded (BOM + process)',
    brief_declared: 'Brief-declared',
    supplier_spec: 'Supplier spec',
    lab_result: 'Lab result',
    manual_override: 'Manual override',
  },
  readOnlyTag: 'Read-only',
  overrideTag: 'Override',
  loading: 'Loading allergen profile…',
  empty: 'No allergens declared yet',
  emptyBody:
    'Allergens cascade automatically from BOM components and process additions; declare a manual override to add one to the final label.',
  error: 'Unable to load the allergen profile. Please try again.',
  forbidden: 'You can view allergens but cannot edit this item’s profile.',
  intensity: {
    contains: 'Contains',
    may_contain: 'May contain',
    trace: 'Trace',
  },
  modal: {
    title: 'Declare allergen',
    subtitle: 'Override the auto-cascade to declare the final product label.',
    autoNote:
      'Auto-suggestions come from BOM component allergen flags. Override here to declare the final product label — the cascade source is preserved.',
    fieldAllergen: 'Allergen',
    fieldIntensity: 'Presence',
    fieldConfidence: 'Confidence',
    fieldReason: 'Override reason',
    reasonPlaceholder: 'Explain why the auto-cascade is overridden…',
    reasonRequired: 'A reason is required for a manual override (V-TEC-42).',
    cancel: 'Cancel',
    save: 'Save declaration',
    saving: 'Saving…',
    saveError: 'Could not save the override. Please try again.',
    selectPlaceholder: 'Select an allergen…',
    intensity: {
      contains: 'Contains',
      may_contain: 'May contain',
      trace: 'Trace',
    },
    confidence: {
      declared: 'Declared',
      tested: 'Tested',
      assumed: 'Assumed',
    },
  },
};

export const DEFAULT_OVERRIDE_AUDIT_LABELS: OverrideAuditLabels = {
  title: 'Manual override audit',
  subtitle:
    'Append-only history of manual allergen overrides — one immutable row per (item × allergen × actor × timestamp).',
  colItem: 'Item',
  colAllergen: 'Allergen',
  colAction: 'Action',
  colIntensity: 'Presence',
  colReason: 'Reason',
  colActor: 'Actor',
  colTimestamp: 'When',
  actionSet: 'Set',
  actionClear: 'Cleared',
  actionAdjustIntensity: 'Adjusted presence',
  actionAdjustConfidence: 'Adjusted confidence',
  reviewCta: 'Review / re-override',
  loading: 'Loading override history…',
  empty: 'No manual overrides recorded',
  emptyBody:
    'When an allergen is manually overridden, an immutable audit row is appended here with the actor and timestamp.',
  error: 'Unable to load the override audit. Please try again.',
  forbidden: 'You do not have permission to review allergen overrides.',
  intensity: {
    contains: 'Contains',
    may_contain: 'May contain',
    trace: 'Trace',
  },
};

function translate<T extends Record<string, unknown>>(
  t: (key: string) => string,
  defaults: T,
  prefix = '',
): T {
  const out = {} as T;
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const value = defaults[key];
    const dotted = `${prefix}${String(key)}`;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = translate(t, value as Record<string, unknown>, `${dotted}.`) as T[keyof T];
    } else {
      try {
        const resolved = t(dotted);
        out[key] = (resolved === dotted ? value : resolved) as T[keyof T];
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

export async function buildAllergensTabLabels(locale: string): Promise<AllergensTabLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'technical.allergens.tab' });
    return translate(t as unknown as (key: string) => string, DEFAULT_TAB_LABELS);
  } catch {
    return { ...DEFAULT_TAB_LABELS };
  }
}

export async function buildOverrideAuditLabels(locale: string): Promise<OverrideAuditLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'technical.allergens.audit' });
    return translate(t as unknown as (key: string) => string, DEFAULT_OVERRIDE_AUDIT_LABELS);
  } catch {
    return { ...DEFAULT_OVERRIDE_AUDIT_LABELS };
  }
}
