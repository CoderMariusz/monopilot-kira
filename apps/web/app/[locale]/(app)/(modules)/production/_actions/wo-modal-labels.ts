/**
 * P2-MODALS — build the WoModalLabels bundle from a next-intl translator scoped
 * to `production.wos.actions`. Shared by the detail page (full action set) and
 * the list page (Start / Pause / Resume per row). Keeps every modal string in
 * i18n (no inline copy) and the key layout in ONE place.
 */

import type { WoModalLabels } from '../wos/_components/modals/types';

type Translator = (key: string) => string;

/** The VERBATIM handler error codes surfaced inline in the modals. */
const ERROR_CODES = [
  'invalid_input',
  'forbidden',
  'not_found',
  'invalid_state_transition',
  'concurrent_modification',
  'quality_hold_active',
  // C4/F6: canonical changeover-gate code; allergen_changeover_required is the
  // legacy alias kept mapped for older payloads.
  'changeover_signoff_required',
  'allergen_changeover_required',
  'closed_production_strict_failed',
  'esign_failed',
  'wo_not_recordable',
  'already_recorded',
  'invalid_reference',
  'factory_release_incomplete',
  'persistence_failed',
  'network_error',
] as const;

export function buildWoModalLabels(t: Translator): WoModalLabels {
  const errors = ERROR_CODES.reduce<Record<string, string>>((acc, code) => {
    acc[code] = t(`errors.${code}`);
    return acc;
  }, {});

  return {
    cancel: t('common.cancel'),
    confirm: t('common.confirm'),
    submitting: t('common.submitting'),
    errors,
    errorFallback: t('errors.fallback'),
    start: {
      title: t('start.title'),
      subtitle: t('start.subtitle'),
      line: t('start.line'),
      shift: t('start.shift'),
      optional: t('common.optional'),
      // F15 — the Start line/shift are now <Select> dropdowns; reuse the Pause
      // placeholders so no new i18n keys are needed (line/shift copy is identical).
      linePlaceholder: t('pause.linePlaceholder'),
      shiftPlaceholder: t('pause.shiftPlaceholder'),
    },
    pause: {
      title: t('pause.title'),
      subtitle: t('pause.subtitle'),
      reason: t('pause.reason'),
      reasonPlaceholder: t('pause.reasonPlaceholder'),
      line: t('pause.line'),
      linePlaceholder: t('pause.linePlaceholder'),
      noLines: t('pause.noLines'),
      shift: t('pause.shift'),
      shiftPlaceholder: t('pause.shiftPlaceholder'),
      notes: t('pause.notes'),
      noCategories: t('pause.noCategories'),
    },
    resume: {
      title: t('resume.title'),
      subtitle: t('resume.subtitle'),
      duration: t('resume.duration'),
      durationHint: t('resume.durationHint'),
    },
    cancelWo: {
      title: t('cancelWo.title'),
      subtitle: t('cancelWo.subtitle'),
      reasonCode: t('cancelWo.reasonCode'),
      notes: t('cancelWo.notes'),
    },
    complete: {
      title: t('complete.title'),
      subtitle: t('complete.subtitle'),
      override: t('complete.override'),
      overrideHint: t('complete.overrideHint'),
    },
    close: {
      title: t('close.title'),
      subtitle: t('close.subtitle'),
      password: t('close.password'),
      reason: t('close.reason'),
      legal: t('close.legal'),
      pinHint: t('close.pinHint'),
    },
    release: {
      title: t('release.title'),
      subtitle: t('release.subtitle'),
    },
    output: {
      title: t('output.title'),
      subtitle: t('output.subtitle'),
      type: t('output.type'),
      types: {
        primary: t('output.types.primary'),
        co_product: t('output.types.co_product'),
        by_product: t('output.types.by_product'),
      },
      product: t('output.product'),
      qty: t('output.qty'),
      batch: t('output.batch'),
      batchHint: t('output.batchHint'),
    },
    waste: {
      title: t('waste.title'),
      subtitle: t('waste.subtitle'),
      category: t('waste.category'),
      categoryPlaceholder: t('waste.categoryPlaceholder'),
      qty: t('waste.qty'),
      shift: t('waste.shift'),
      shiftPlaceholder: t('waste.shiftPlaceholder'),
      reasonCode: t('waste.reasonCode'),
      notes: t('waste.notes'),
      noCategories: t('waste.noCategories'),
    },
    shifts: {
      morning: t('shifts.morning'),
      afternoon: t('shifts.afternoon'),
      night: t('shifts.night'),
    },
  };
}
