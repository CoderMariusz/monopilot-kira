/**
 * HACCP plan management (Wave E3) — label builders.
 *
 * Resolves the LIVE next-intl `quality.haccp` namespace
 * (apps/web/i18n/{en,pl,ro,uk}.json — real en + pl, ro/uk mirror EN per the
 * locale lesson) into the typed label objects the client islands consume.
 * Keys live in the live catalogs, NOT a staging bundle (lesson F-D08a).
 *
 * A `Translator` is any `(key, values?) => string` — both next-intl's
 * `getTranslations('quality.haccp')` (RSC) and a vi.fn-backed test translator
 * satisfy it, so the RSC pages and the RTL tests assert the same resolved
 * strings.
 */
import {
  formatLimit as formatQualityLimit,
  formatLimitFromTemplates,
  type LimitTemplates,
} from '../../../../../../../lib/quality/format-limit';
import type { HaccpPlanScopeType, HaccpPlanStatus, HazardType } from './haccp-contracts';

export type Translator = (key: string, values?: Record<string, string | number>) => string;

export const SCOPE_TYPES: HaccpPlanScopeType[] = ['product', 'category', 'line'];
export const PLAN_STATUSES: HaccpPlanStatus[] = ['draft', 'active', 'superseded'];
export const HAZARD_TYPES: HazardType[] = ['biological', 'chemical', 'physical', 'allergen'];

export type PlanListLabels = {
  newPlan: string;
  newPlanDisabled: string;
  table: {
    ariaLabel: string;
    name: string;
    scope: string;
    version: string;
    status: string;
    ccps: string;
    actions: string;
  };
  scopeType: Record<HaccpPlanScopeType, string>;
  status: Record<HaccpPlanStatus, string>;
  scopeValue: string;
  ccpsValue: string;
  view: string;
  activate: string;
  activateDisabled: string;
  newVersion: string;
  newVersionDisabled: string;
  newVersionError: string;
  empty: { title: string; body: string; cta: string; ctaDisabled: string };
  error: { title: string; body: string };
  denied: { title: string; body: string };
};

export type PlanCreateLabels = {
  title: string;
  subtitle: string;
  name: string;
  namePlaceholder: string;
  scopeType: string;
  scopeTypePlaceholder: string;
  scopeTypeOptions: Record<HaccpPlanScopeType, string>;
  scopeRef: string;
  scopeRefPlaceholder: string;
  scopeRefHelp: string;
  cancel: string;
  submit: string;
  submitting: string;
  validation: { nameRequired: string; scopeTypeRequired: string };
  error: string;
};

export type PlanActivateLabels = {
  title: string;
  summary: { name: string; scope: string; version: string };
  checklistTitle: string;
  checklist: { ccpsDefined: string; limitsSet: string; role: string };
  infoBox: string;
  esign: { title: string; meaning: string; password: string; passwordHelp: string; passwordPlaceholder: string };
  cancel: string;
  submit: string;
  submitting: string;
  validation: { passwordRequired: string };
  error: string;
};

export type PlanDetailLabels = {
  addCcp: string;
  addCcpDisabled: string;
  activate: string;
  activateDisabled: string;
  header: {
    title: string;
    name: string;
    scope: string;
    version: string;
    status: string;
    approvedBy: string;
    notApproved: string;
    ccpCount: string;
  };
  scopeType: Record<HaccpPlanScopeType, string>;
  status: Record<HaccpPlanStatus, string>;
  scopeValue: string;
  table: {
    ariaLabel: string;
    code: string;
    name: string;
    step: string;
    hazard: string;
    limits: string;
    frequency: string;
    actions: string;
  };
  hazardType: Record<HazardType, string>;
  limitRange: string;
  limitMinOnly: string;
  limitMaxOnly: string;
  limitNone: string;
  empty: { title: string; body: string; cta: string; ctaDisabled: string };
  notFound: { title: string; body: string; back: string };
  error: { title: string; body: string };
  denied: { title: string; body: string };
  lockedHint: string;
};

/**
 * Labels for the per-row CCP Edit/Deactivate island (MODAL-CCP-EDIT +
 * deactivate confirm) on the plan detail screen. The Edit modal REUSES the
 * `CcpAddLabels` field set (it is the same CCP form); these labels only cover
 * the row triggers, the edit modal title/subtitle override, and the deactivate
 * confirm copy.
 */
export type CcpRowActionsLabels = {
  edit: string;
  deactivate: string;
  editTitle: string;
  editSubtitle: string;
  editSubmit: string;
  editSubmitting: string;
  editError: string;
  deactivateTitle: string;
  deactivateBody: string;
  deactivateWarn: string;
  deactivateConfirm: string;
  deactivateCancel: string;
  deactivateSubmitting: string;
  deactivateError: string;
};

/** Labels for MODAL-CCP-ADD on the plan detail screen (wired to upsertCcp with plan_id). */
export type CcpAddLabels = {
  title: string;
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
  unit: string;
  unitPlaceholder: string;
  limitHelp: string;
  frequency: string;
  frequencyPlaceholder: string;
  correctiveAction: string;
  correctiveActionPlaceholder: string;
  cancel: string;
  submit: string;
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
};

function scopeTypeMap(t: Translator): Record<HaccpPlanScopeType, string> {
  return Object.fromEntries(SCOPE_TYPES.map((s) => [s, t(`scopeType.${s}`)])) as Record<
    HaccpPlanScopeType,
    string
  >;
}

function statusMap(t: Translator): Record<HaccpPlanStatus, string> {
  return Object.fromEntries(PLAN_STATUSES.map((s) => [s, t(`status.${s}`)])) as Record<
    HaccpPlanStatus,
    string
  >;
}

function hazardMap(t: Translator): Record<HazardType, string> {
  return Object.fromEntries(HAZARD_TYPES.map((h) => [h, t(`hazardType.${h}`)])) as Record<
    HazardType,
    string
  >;
}

export function buildPlanListLabels(t: Translator): PlanListLabels {
  return {
    newPlan: t('list.newPlan'),
    newPlanDisabled: t('list.newPlanDisabled'),
    table: {
      ariaLabel: t('list.table.ariaLabel'),
      name: t('list.table.name'),
      scope: t('list.table.scope'),
      version: t('list.table.version'),
      status: t('list.table.status'),
      ccps: t('list.table.ccps'),
      actions: t('list.table.actions'),
    },
    scopeType: scopeTypeMap(t),
    status: statusMap(t),
    scopeValue: t('list.scopeValue'),
    ccpsValue: t('list.ccpsValue'),
    view: t('list.view'),
    activate: t('list.activate'),
    activateDisabled: t('list.activateDisabled'),
    newVersion: t('list.newVersion'),
    newVersionDisabled: t('list.newVersionDisabled'),
    newVersionError: t('list.newVersionError'),
    empty: {
      title: t('list.empty.title'),
      body: t('list.empty.body'),
      cta: t('list.empty.cta'),
      ctaDisabled: t('list.empty.ctaDisabled'),
    },
    error: { title: t('list.error.title'), body: t('list.error.body') },
    denied: { title: t('denied.title'), body: t('denied.body') },
  };
}

export function buildPlanCreateLabels(t: Translator): PlanCreateLabels {
  return {
    title: t('create.title'),
    subtitle: t('create.subtitle'),
    name: t('create.name'),
    namePlaceholder: t('create.namePlaceholder'),
    scopeType: t('create.scopeType'),
    scopeTypePlaceholder: t('create.scopeTypePlaceholder'),
    scopeTypeOptions: scopeTypeMap(t),
    scopeRef: t('create.scopeRef'),
    scopeRefPlaceholder: t('create.scopeRefPlaceholder'),
    scopeRefHelp: t('create.scopeRefHelp'),
    cancel: t('create.cancel'),
    submit: t('create.submit'),
    submitting: t('create.submitting'),
    validation: {
      nameRequired: t('create.validation.nameRequired'),
      scopeTypeRequired: t('create.validation.scopeTypeRequired'),
    },
    error: t('create.error'),
  };
}

export function buildPlanActivateLabels(t: Translator): PlanActivateLabels {
  return {
    title: t('activate.title'),
    summary: {
      name: t('activate.summary.name'),
      scope: t('activate.summary.scope'),
      version: t('activate.summary.version'),
    },
    checklistTitle: t('activate.checklistTitle'),
    checklist: {
      ccpsDefined: t('activate.checklist.ccpsDefined'),
      limitsSet: t('activate.checklist.limitsSet'),
      role: t('activate.checklist.role'),
    },
    infoBox: t('activate.infoBox'),
    esign: {
      title: t('activate.esign.title'),
      meaning: t('activate.esign.meaning'),
      password: t('activate.esign.password'),
      passwordHelp: t('activate.esign.passwordHelp'),
      passwordPlaceholder: t('activate.esign.passwordPlaceholder'),
    },
    cancel: t('activate.cancel'),
    submit: t('activate.submit'),
    submitting: t('activate.submitting'),
    validation: { passwordRequired: t('activate.validation.passwordRequired') },
    error: t('activate.error'),
  };
}

export function buildPlanDetailLabels(t: Translator): PlanDetailLabels {
  return {
    addCcp: t('detail.addCcp'),
    addCcpDisabled: t('detail.addCcpDisabled'),
    activate: t('detail.activate'),
    activateDisabled: t('detail.activateDisabled'),
    header: {
      title: t('detail.header.title'),
      name: t('detail.header.name'),
      scope: t('detail.header.scope'),
      version: t('detail.header.version'),
      status: t('detail.header.status'),
      approvedBy: t('detail.header.approvedBy'),
      notApproved: t('detail.header.notApproved'),
      ccpCount: t('detail.header.ccpCount'),
    },
    scopeType: scopeTypeMap(t),
    status: statusMap(t),
    scopeValue: t('detail.scopeValue'),
    table: {
      ariaLabel: t('detail.table.ariaLabel'),
      code: t('detail.table.code'),
      name: t('detail.table.name'),
      step: t('detail.table.step'),
      hazard: t('detail.table.hazard'),
      limits: t('detail.table.limits'),
      frequency: t('detail.table.frequency'),
      actions: t('detail.table.actions'),
    },
    hazardType: hazardMap(t),
    limitRange: t('detail.limitRange'),
    limitMinOnly: t('detail.limitMinOnly'),
    limitMaxOnly: t('detail.limitMaxOnly'),
    limitNone: t('detail.limitNone'),
    empty: {
      title: t('detail.empty.title'),
      body: t('detail.empty.body'),
      cta: t('detail.empty.cta'),
      ctaDisabled: t('detail.empty.ctaDisabled'),
    },
    notFound: {
      title: t('detail.notFound.title'),
      body: t('detail.notFound.body'),
      back: t('detail.notFound.back'),
    },
    error: { title: t('detail.error.title'), body: t('detail.error.body') },
    denied: { title: t('denied.title'), body: t('denied.body') },
    lockedHint: t('detail.lockedHint'),
  };
}

export function buildCcpAddLabels(t: Translator): CcpAddLabels {
  return {
    title: t('ccpAdd.title'),
    subtitle: t('ccpAdd.subtitle'),
    ccpCode: t('ccpAdd.ccpCode'),
    ccpCodePlaceholder: t('ccpAdd.ccpCodePlaceholder'),
    ccpCodeHelp: t('ccpAdd.ccpCodeHelp'),
    name: t('ccpAdd.name'),
    namePlaceholder: t('ccpAdd.namePlaceholder'),
    processStep: t('ccpAdd.processStep'),
    processStepPlaceholder: t('ccpAdd.processStepPlaceholder'),
    hazardType: t('ccpAdd.hazardType'),
    hazardTypePlaceholder: t('ccpAdd.hazardTypePlaceholder'),
    hazardTypeOptions: hazardMap(t),
    criticalLimitMin: t('ccpAdd.criticalLimitMin'),
    criticalLimitMinPlaceholder: t('ccpAdd.criticalLimitMinPlaceholder'),
    criticalLimitMax: t('ccpAdd.criticalLimitMax'),
    criticalLimitMaxPlaceholder: t('ccpAdd.criticalLimitMaxPlaceholder'),
    unit: t('ccpAdd.unit'),
    unitPlaceholder: t('ccpAdd.unitPlaceholder'),
    limitHelp: t('ccpAdd.limitHelp'),
    frequency: t('ccpAdd.frequency'),
    frequencyPlaceholder: t('ccpAdd.frequencyPlaceholder'),
    correctiveAction: t('ccpAdd.correctiveAction'),
    correctiveActionPlaceholder: t('ccpAdd.correctiveActionPlaceholder'),
    cancel: t('ccpAdd.cancel'),
    submit: t('ccpAdd.submit'),
    submitting: t('ccpAdd.submitting'),
    validation: {
      ccpCodeRequired: t('ccpAdd.validation.ccpCodeRequired'),
      nameRequired: t('ccpAdd.validation.nameRequired'),
      processStepRequired: t('ccpAdd.validation.processStepRequired'),
      hazardTypeRequired: t('ccpAdd.validation.hazardTypeRequired'),
      limitNumeric: t('ccpAdd.validation.limitNumeric'),
      limitOrder: t('ccpAdd.validation.limitOrder'),
    },
    error: t('ccpAdd.error'),
  };
}

export function buildCcpRowActionsLabels(t: Translator): CcpRowActionsLabels {
  return {
    edit: t('ccpRowActions.edit'),
    deactivate: t('ccpRowActions.deactivate'),
    editTitle: t('ccpRowActions.editTitle'),
    editSubtitle: t('ccpRowActions.editSubtitle'),
    editSubmit: t('ccpRowActions.editSubmit'),
    editSubmitting: t('ccpRowActions.editSubmitting'),
    editError: t('ccpRowActions.editError'),
    deactivateTitle: t('ccpRowActions.deactivateTitle'),
    deactivateBody: t('ccpRowActions.deactivateBody'),
    deactivateWarn: t('ccpRowActions.deactivateWarn'),
    deactivateConfirm: t('ccpRowActions.deactivateConfirm'),
    deactivateCancel: t('ccpRowActions.deactivateCancel'),
    deactivateSubmitting: t('ccpRowActions.deactivateSubmitting'),
    deactivateError: t('ccpRowActions.deactivateError'),
  };
}

/** Formats a CCP critical-limit range for display (pure, uses the passed translator). */
export function formatLimit(
  t: Translator,
  min: string | null,
  max: string | null,
  unit: string,
): string {
  return formatQualityLimit(t, 'detail', min, max, unit);
}

/** Formats a CCP critical-limit range from pre-resolved detail labels (RSC-safe). */
export function formatLimitFromLabels(
  labels: LimitTemplates,
  min: string | null,
  max: string | null,
  unit: string,
): string {
  return formatLimitFromTemplates(labels, min, max, unit);
}
