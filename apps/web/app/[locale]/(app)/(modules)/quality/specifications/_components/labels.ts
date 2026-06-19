/**
 * QA-003 / QA-003b / MODAL-SPEC-SIGN — label builders.
 *
 * Maps the staged `quality-specs.json` bundle (resolved by getQaSpecsTranslator,
 * the FIXED warehouse loader pattern) into the typed label props the client
 * islands consume. Shared by the RSC pages and the RTL tests so both assert the
 * same resolved strings (and that en + pl never leak a raw dotted key).
 */
import type { QaSpecsTranslator } from '../../qa-specs-labels';
import type { SpecListLabels } from './spec-list.client';
import type { SpecAppliesTo, SpecCreateLabels } from './spec-create-modal.client';
import type { SpecParameterType, SpecStatus } from './spec-actions-contract';
import type { SpecDetailLabels } from '../[specId]/_components/spec-detail.client';
import type { SpecSignLabels } from '../[specId]/_components/spec-sign-modal.client';

const STATUSES: SpecStatus[] = ['draft', 'under_review', 'active', 'expired', 'superseded'];
const APPLIES: SpecAppliesTo[] = ['incoming', 'in_process', 'final', 'all'];
const TYPES: SpecParameterType[] = [
  'visual',
  'measurement',
  'attribute',
  'microbiological',
  'chemical',
  'sensory',
  'equipment',
];

function statusValues(t: QaSpecsTranslator): Record<SpecStatus, string> {
  return Object.fromEntries(STATUSES.map((s) => [s, t(`list.status.${s}`)])) as Record<SpecStatus, string>;
}
function appliesValues(t: QaSpecsTranslator): Record<SpecAppliesTo, string> {
  return Object.fromEntries(APPLIES.map((a) => [a, t(`list.appliesTo.${a}`)])) as Record<SpecAppliesTo, string>;
}
function typeValues(t: QaSpecsTranslator): Record<SpecParameterType, string> {
  return Object.fromEntries(TYPES.map((ty) => [ty, t(`createModal.type.${ty}`)])) as Record<SpecParameterType, string>;
}

export function buildSpecListLabels(t: QaSpecsTranslator): SpecListLabels {
  return {
    createSpec: t('list.createSpec'),
    searchPlaceholder: t('list.searchPlaceholder'),
    searchLabel: t('list.searchLabel'),
    rowsLabel: t('list.rowsLabel'),
    statusFilterLabel: t('list.statusFilterLabel'),
    clear: t('list.clear'),
    emptyAll: t('list.emptyAll'),
    emptyFiltered: t('list.emptyFiltered'),
    noApprover: t('list.noApprover'),
    noProduct: t('list.noProduct'),
    statusAll: t('list.statusAll'),
    statusValues: statusValues(t),
    columns: {
      product: t('list.columns.product'),
      specCode: t('list.columns.specCode'),
      version: t('list.columns.version'),
      status: t('list.columns.status'),
      approvedBy: t('list.columns.approvedBy'),
    },
  };
}

export function buildSpecCreateLabels(t: QaSpecsTranslator): SpecCreateLabels {
  return {
    title: t('createModal.title'),
    subtitle: t('createModal.subtitle'),
    product: t('createModal.product'),
    productHelp: t('createModal.productHelp'),
    productPlaceholder: t('createModal.productPlaceholder'),
    pickProduct: t('createModal.pickProduct'),
    specCode: t('createModal.specCode'),
    specCodeHelp: t('createModal.specCodeHelp'),
    specCodePlaceholder: t('createModal.specCodePlaceholder'),
    appliesTo: t('createModal.appliesTo'),
    appliesToHelp: t('createModal.appliesToHelp'),
    appliesToOptions: appliesValues(t),
    parameters: t('createModal.parameters'),
    parametersHelp: t('createModal.parametersHelp'),
    addParameter: t('createModal.addParameter'),
    removeParameter: t('createModal.removeParameter'),
    noParameters: t('createModal.noParameters'),
    param: {
      name: t('createModal.param.name'),
      namePlaceholder: t('createModal.param.namePlaceholder'),
      type: t('createModal.param.type'),
      target: t('createModal.param.target'),
      min: t('createModal.param.min'),
      max: t('createModal.param.max'),
      unit: t('createModal.param.unit'),
      unitPlaceholder: t('createModal.param.unitPlaceholder'),
      critical: t('createModal.param.critical'),
      criticalShort: t('createModal.param.criticalShort'),
    },
    typeOptions: typeValues(t),
    cancel: t('createModal.cancel'),
    submit: t('createModal.submit'),
    submitting: t('createModal.submitting'),
    formIncomplete: 'Complete all required fields to continue.',
    validation: {
      productRequired: t('createModal.validation.productRequired'),
      specCodeRequired: t('createModal.validation.specCodeRequired'),
      parametersRequired: t('createModal.validation.parametersRequired'),
      paramNameRequired: t('createModal.validation.paramNameRequired'),
      minLeMax: t('createModal.validation.minLeMax'),
      fixErrors: t('createModal.validation.fixErrors'),
    },
    error: t('createModal.error'),
    success: t('createModal.success'),
    picker: {
      trigger: t('createModal.pickProduct'),
      searchLabel: t('createModal.product'),
      searchPlaceholder: t('createModal.specCodePlaceholder'),
      loading: t('createModal.submitting'),
      empty: t('createModal.productPlaceholder'),
      cancel: t('createModal.cancel'),
      error: t('createModal.error').replace('{message}', ''),
    },
  };
}

export function buildSpecSignLabels(t: QaSpecsTranslator): SpecSignLabels {
  return {
    title: t('signModal.title'),
    summary: {
      product: t('signModal.summary.product'),
      specCode: t('signModal.summary.specCode'),
      version: t('signModal.summary.version'),
      parameters: t('signModal.summary.parameters'),
      appliesTo: t('signModal.summary.appliesTo'),
    },
    parametersValue: t('signModal.parametersValue'),
    checklistTitle: t('signModal.checklistTitle'),
    checklist: {
      testMethod: t('signModal.checklist.testMethod'),
      minLeMax: t('signModal.checklist.minLeMax'),
      role: t('signModal.checklist.role'),
    },
    infoBox: t('signModal.infoBox'),
    esign: {
      title: t('signModal.esign.title'),
      meaning: t('signModal.esign.meaning'),
      password: t('signModal.esign.password'),
      passwordHelp: t('signModal.esign.passwordHelp'),
      passwordPlaceholder: t('signModal.esign.passwordPlaceholder'),
    },
    cancel: t('signModal.cancel'),
    submit: t('signModal.submit'),
    submitting: t('signModal.submitting'),
    validation: { passwordRequired: t('signModal.validation.passwordRequired') },
    error: t('signModal.error'),
    success: t('signModal.success'),
  };
}

export function buildSpecDetailLabels(t: QaSpecsTranslator): SpecDetailLabels {
  return {
    backToSpecs: t('detail.backToSpecs'),
    banner: {
      draft: t('detail.banner.draft'),
      under_review: t('detail.banner.under_review'),
      active: t('detail.banner.active'),
      superseded: t('detail.banner.superseded'),
      expired: t('detail.banner.expired'),
    },
    header: {
      title: t('detail.header.title'),
      product: t('detail.header.product'),
      specCode: t('detail.header.specCode'),
      version: t('detail.header.version'),
      status: t('detail.header.status'),
      appliesTo: t('detail.header.appliesTo'),
      approvedBy: t('detail.header.approvedBy'),
      approvedAt: t('detail.header.approvedAt'),
      notApproved: t('detail.header.notApproved'),
    },
    parameters: {
      title: t('detail.parameters.title'),
      name: t('detail.parameters.name'),
      type: t('detail.parameters.type'),
      target: t('detail.parameters.target'),
      min: t('detail.parameters.min'),
      max: t('detail.parameters.max'),
      unit: t('detail.parameters.unit'),
      critical: t('detail.parameters.critical'),
      criticalBadge: t('detail.parameters.criticalBadge'),
      empty: t('detail.parameters.empty'),
    },
    actions: {
      title: t('detail.actions.title'),
      submitForReview: t('detail.actions.submitForReview'),
      submitting: t('detail.actions.submitting'),
      approve: t('detail.actions.approve'),
      supersede: t('detail.actions.supersede'),
      supersedeNoTarget: t('detail.actions.supersedeNoTarget'),
      supersedePick: t('detail.actions.supersedePick'),
      supersedePlaceholder: t('detail.actions.supersedePlaceholder'),
      superseding: t('detail.actions.superseding'),
      formIncomplete: 'Complete all required fields to continue.',
      submitError: t('detail.actions.submitError'),
      supersedeError: t('detail.actions.supersedeError'),
    },
    supersededImmutable: t('detail.supersededImmutable'),
    statusValues: statusValues(t),
    appliesToValues: appliesValues(t),
    typeValues: typeValues(t),
    sign: buildSpecSignLabels(t),
  };
}
