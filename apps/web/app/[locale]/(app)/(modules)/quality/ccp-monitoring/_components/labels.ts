/**
 * CCP Monitoring (Wave E3) — label builders.
 *
 * Resolves the LIVE next-intl `quality.ccpMonitoring` namespace
 * (apps/web/i18n/{en,pl,ro,uk}.json — real en + pl, ro/uk mirror EN per the
 * locale lesson) into the typed label objects the client islands consume.
 * Lesson F-D08a: keys live in the live catalogs, NOT a staging bundle.
 *
 * A `Translator` is any `(key, values?) => string` — both next-intl's
 * `getTranslations('quality.ccpMonitoring')` (RSC) and a vi.fn-backed test
 * translator satisfy it, so the RSC pages and the RTL tests assert the same
 * resolved strings.
 */
import { formatLimit as formatQualityLimit } from '../../../../../../../lib/quality/format-limit';
import type { HazardType } from './ccp-contracts';

export type Translator = (key: string, values?: Record<string, string | number>) => string;

export const HAZARD_TYPES: HazardType[] = ['biological', 'chemical', 'physical', 'allergen'];

export type CcpStatusLabels = {
  inLimit: string;
  outOfLimit: string;
  noData: string;
};

export type CcpBoardLabels = {
  recordReading: string;
  /** "Add CCP" header action (gated on quality.haccp.plan_edit). */
  addCcp: string;
  /** tooltip shown on the disabled "Add CCP" button when plan_edit is absent (rule 0.13c). */
  addCcpDisabled: string;
  summary: {
    activeCcps: string;
    activeCcpsSub: string;
    inLimit: string;
    inLimitSub: string;
    outOfLimit: string;
    outOfLimitSub: string;
  };
  board: {
    ariaLabel: string;
    hazard: string;
    criticalLimit: string;
    frequency: string;
    lastReading: string;
    noReading: string;
  };
  status: CcpStatusLabels;
  hazardType: Record<HazardType, string>;
  empty: { title: string; body: string; cta: string; ctaDisabled: string };
};

export type CcpRecordLabels = {
  title: string;
  subtitle: string;
  ccp: string;
  ccpPlaceholder: string;
  value: string;
  valuePlaceholder: string;
  valueHelp: string;
  unit: string;
  note: string;
  notePlaceholder: string;
  cancel: string;
  submit: string;
  submitting: string;
  validation: {
    ccpRequired: string;
    valueRequired: string;
    valueNumeric: string;
  };
  error: string;
  breach: { title: string; body: string; viewNcr: string };
  success: string;
};

/** Labels for MODAL-CCP-CREATE (the create/edit CCP modal wired to upsertCcp). */
export type CcpCreateLabels = {
  titleCreate: string;
  titleEdit: string;
  subtitle: string;
  ccpCode: string;
  ccpCodePlaceholder: string;
  ccpCodeHelp: string;
  name: string;
  namePlaceholder: string;
  processStep: string;
  processStepPlaceholder: string;
  hazardType: string;
  hazardTypePlaceholder: string;
  hazardTypeOptions: Record<HazardType, string>;
  criticalLimitMin: string;
  criticalLimitMinPlaceholder: string;
  criticalLimitMax: string;
  criticalLimitMaxPlaceholder: string;
  limitHelp: string;
  unit: string;
  unitPlaceholder: string;
  frequency: string;
  frequencyPlaceholder: string;
  correctiveAction: string;
  correctiveActionPlaceholder: string;
  isActive: string;
  isActiveHelp: string;
  cancel: string;
  submitCreate: string;
  submitEdit: string;
  submitting: string;
  validation: {
    ccpCodeRequired: string;
    nameRequired: string;
    processStepRequired: string;
    hazardTypeRequired: string;
    limitNumeric: string;
    limitOrder: string;
  };
  error: string;
  success: string;
};

export function buildCcpBoardLabels(t: Translator): CcpBoardLabels {
  return {
    recordReading: t('recordReading'),
    addCcp: t('addCcp'),
    addCcpDisabled: t('addCcpDisabled'),
    summary: {
      activeCcps: t('summary.activeCcps'),
      activeCcpsSub: t('summary.activeCcpsSub'),
      inLimit: t('summary.inLimit'),
      inLimitSub: t('summary.inLimitSub'),
      outOfLimit: t('summary.outOfLimit'),
      outOfLimitSub: t('summary.outOfLimitSub'),
    },
    board: {
      ariaLabel: t('board.ariaLabel'),
      hazard: t('board.hazard'),
      criticalLimit: t('board.criticalLimit'),
      frequency: t('board.frequency'),
      lastReading: t('board.lastReading'),
      noReading: t('board.noReading'),
    },
    status: {
      inLimit: t('status.inLimit'),
      outOfLimit: t('status.outOfLimit'),
      noData: t('status.noData'),
    },
    hazardType: Object.fromEntries(
      HAZARD_TYPES.map((h) => [h, t(`hazardType.${h}`)]),
    ) as Record<HazardType, string>,
    empty: {
      title: t('empty.title'),
      body: t('empty.body'),
      cta: t('empty.cta'),
      ctaDisabled: t('empty.ctaDisabled'),
    },
  };
}

export function buildCcpCreateLabels(t: Translator): CcpCreateLabels {
  return {
    titleCreate: t('create.titleCreate'),
    titleEdit: t('create.titleEdit'),
    subtitle: t('create.subtitle'),
    ccpCode: t('create.ccpCode'),
    ccpCodePlaceholder: t('create.ccpCodePlaceholder'),
    ccpCodeHelp: t('create.ccpCodeHelp'),
    name: t('create.name'),
    namePlaceholder: t('create.namePlaceholder'),
    processStep: t('create.processStep'),
    processStepPlaceholder: t('create.processStepPlaceholder'),
    hazardType: t('create.hazardType'),
    hazardTypePlaceholder: t('create.hazardTypePlaceholder'),
    // hazard option labels reuse the board's hazardType.* keys (same canonical set).
    hazardTypeOptions: Object.fromEntries(
      HAZARD_TYPES.map((h) => [h, t(`hazardType.${h}`)]),
    ) as Record<HazardType, string>,
    criticalLimitMin: t('create.criticalLimitMin'),
    criticalLimitMinPlaceholder: t('create.criticalLimitMinPlaceholder'),
    criticalLimitMax: t('create.criticalLimitMax'),
    criticalLimitMaxPlaceholder: t('create.criticalLimitMaxPlaceholder'),
    limitHelp: t('create.limitHelp'),
    unit: t('create.unit'),
    unitPlaceholder: t('create.unitPlaceholder'),
    frequency: t('create.frequency'),
    frequencyPlaceholder: t('create.frequencyPlaceholder'),
    correctiveAction: t('create.correctiveAction'),
    correctiveActionPlaceholder: t('create.correctiveActionPlaceholder'),
    isActive: t('create.isActive'),
    isActiveHelp: t('create.isActiveHelp'),
    cancel: t('create.cancel'),
    submitCreate: t('create.submitCreate'),
    submitEdit: t('create.submitEdit'),
    submitting: t('create.submitting'),
    validation: {
      ccpCodeRequired: t('create.validation.ccpCodeRequired'),
      nameRequired: t('create.validation.nameRequired'),
      processStepRequired: t('create.validation.processStepRequired'),
      hazardTypeRequired: t('create.validation.hazardTypeRequired'),
      limitNumeric: t('create.validation.limitNumeric'),
      limitOrder: t('create.validation.limitOrder'),
    },
    error: t('create.error'),
    success: t('create.success'),
  };
}

export function buildCcpRecordLabels(t: Translator): CcpRecordLabels {
  return {
    title: t('record.title'),
    subtitle: t('record.subtitle'),
    ccp: t('record.ccp'),
    ccpPlaceholder: t('record.ccpPlaceholder'),
    value: t('record.value'),
    valuePlaceholder: t('record.valuePlaceholder'),
    valueHelp: t('record.valueHelp'),
    unit: t('record.unit'),
    note: t('record.note'),
    notePlaceholder: t('record.notePlaceholder'),
    cancel: t('record.cancel'),
    submit: t('record.submit'),
    submitting: t('record.submitting'),
    validation: {
      ccpRequired: t('record.validation.ccpRequired'),
      valueRequired: t('record.validation.valueRequired'),
      valueNumeric: t('record.validation.valueNumeric'),
    },
    error: t('record.error'),
    breach: {
      title: t('record.breach.title'),
      body: t('record.breach.body'),
      viewNcr: t('record.breach.viewNcr'),
    },
    success: t('record.success'),
  };
}

/**
 * Formats the critical-limit range for display from the raw min/max decimal
 * strings + unit. Pure (no i18n side-effects beyond the passed translator).
 */
export function formatLimit(
  t: Translator,
  min: string | null,
  max: string | null,
  unit: string,
): string {
  return formatQualityLimit(t, 'board', min, max, unit);
}
