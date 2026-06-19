/**
 * QA-009 / QA-009a / MODAL-NCR-CREATE / MODAL-NCR-CLOSE — label builders.
 *
 * Maps the staged `quality-ncrs.json` bundle (resolved by getQaNcrsTranslator,
 * the FIXED qa-holds-labels.ts loader pattern) into the typed label props the
 * client islands consume. Shared by the RSC pages and the RTL tests so both assert
 * the same resolved strings (and that en + pl never leak a raw dotted key).
 */
import type { QaNcrsTranslator } from '../../qa-ncrs-labels';
import {
  NCR_SEVERITIES,
  NCR_TYPES,
  NCR_ROOT_CAUSE_CATEGORIES,
} from './ncr-contracts';
import type { NcrListLabels } from './ncr-list.client';
import type { NcrCreateLabels } from './ncr-create-modal.client';
import type { NcrDetailLabels } from '../[ncrId]/_components/ncr-detail.client';
import type { NcrCloseLabels } from '../[ncrId]/_components/ncr-close-modal.client';

const STATUSES = ['draft', 'open', 'investigating', 'awaiting_capa', 'closed', 'reopened', 'cancelled'];

function severityValues(t: QaNcrsTranslator): Record<string, string> {
  return Object.fromEntries(NCR_SEVERITIES.map((s) => [s, t(`list.severityValues.${s}`)]));
}
function statusValues(t: QaNcrsTranslator): Record<string, string> {
  return Object.fromEntries(STATUSES.map((s) => [s, t(`list.statusValues.${s}`)]));
}
function typeValues(t: QaNcrsTranslator): Record<string, string> {
  return Object.fromEntries(NCR_TYPES.map((ty) => [ty, t(`list.typeValues.${ty}`)]));
}

export function buildNcrListLabels(t: QaNcrsTranslator): NcrListLabels {
  return {
    createNcr: t('list.createNcr'),
    searchPlaceholder: t('list.searchPlaceholder'),
    searchLabel: t('list.searchLabel'),
    rowsLabel: t('list.rowsLabel'),
    statusLabel: t('list.statusLabel'),
    statusAll: t('list.statusAll'),
    severityLabel: t('list.severityLabel'),
    severityAll: t('list.severityAll'),
    typeLabel: t('list.typeLabel'),
    typeAll: t('list.typeAll'),
    clear: t('list.clear'),
    noTitle: t('list.noTitle'),
    unassigned: t('list.unassigned'),
    emptyAll: t('list.emptyAll'),
    emptyFiltered: t('list.emptyFiltered'),
    overdueTag: t('list.overdueTag'),
    attention: {
      heading: t('list.attention.heading'),
      meta: t('list.attention.meta'),
    },
    calm: {
      heading: t('list.calm.heading'),
      metaCollapsed: t('list.calm.metaCollapsed'),
      metaExpanded: t('list.calm.metaExpanded'),
    },
    columns: {
      ncrNumber: t('list.columns.ncrNumber'),
      title: t('list.columns.title'),
      severity: t('list.columns.severity'),
      type: t('list.columns.type'),
      status: t('list.columns.status'),
      product: t('list.columns.product'),
      linkedHold: t('list.columns.linkedHold'),
      created: t('list.columns.created'),
      responseDue: t('list.columns.responseDue'),
    },
    severityValues: severityValues(t),
    statusValues: statusValues(t),
    typeValues: typeValues(t),
    createLabels: buildNcrCreateLabels(t),
  };
}

export function buildNcrCreateLabels(t: QaNcrsTranslator): NcrCreateLabels {
  return {
    title: t('createModal.title'),
    subtitle: t('createModal.subtitle'),
    ncrType: t('createModal.ncrType'),
    ncrTypeHelp: t('createModal.ncrTypeHelp'),
    ncrTypePlaceholder: t('createModal.ncrTypePlaceholder'),
    ncrTypeOptions: typeValues(t),
    severity: t('createModal.severity'),
    severityHelp: t('createModal.severityHelp'),
    severityOptions: severityValues(t),
    severityWindow: Object.fromEntries(
      NCR_SEVERITIES.map((s) => [s, t(`createModal.severityWindow.${s}`)]),
    ),
    criticalWarning: t('createModal.criticalWarning'),
    titleField: t('createModal.title_'),
    titlePlaceholder: t('createModal.titlePlaceholder'),
    description: t('createModal.description'),
    descriptionHelp: t('createModal.descriptionHelp'),
    descriptionPlaceholder: t('createModal.descriptionPlaceholder'),
    descriptionMinError: t('createModal.descriptionMinError'),
    linkedHold: t('createModal.linkedHold'),
    linkedHoldHelp: t('createModal.linkedHoldHelp'),
    linkedHoldPlaceholder: t('createModal.linkedHoldPlaceholder'),
    linkedHoldSearchLabel: t('createModal.linkedHoldSearchLabel'),
    linkedHoldSearching: t('createModal.linkedHoldSearching'),
    linkedHoldNoMatch: t('createModal.linkedHoldNoMatch'),
    linkedHoldChip: t('createModal.linkedHoldChip'),
    linkedHoldClear: t('createModal.linkedHoldClear'),
    affectedQty: t('createModal.affectedQty'),
    affectedQtyPlaceholder: t('createModal.affectedQtyPlaceholder'),
    cancel: t('createModal.cancel'),
    submit: t('createModal.submit'),
    submitting: t('createModal.submitting'),
    formIncomplete: 'Complete all required fields to continue.',
    validation: {
      titleRequired: t('createModal.validation.titleRequired'),
      descriptionRequired: t('createModal.validation.descriptionRequired'),
    },
    error: t('createModal.error'),
    success: t('createModal.success'),
  };
}

export function buildNcrCloseLabels(t: QaNcrsTranslator): NcrCloseLabels {
  return {
    title: t('closeModal.title'),
    summary: {
      ncr: t('closeModal.summary.ncr'),
      title: t('closeModal.summary.title'),
      severity: t('closeModal.summary.severity'),
      status: t('closeModal.summary.status'),
    },
    resolution: t('closeModal.resolution'),
    resolutionHelp: t('closeModal.resolutionHelp'),
    resolutionPlaceholder: t('closeModal.resolutionPlaceholder'),
    dualSignWarning: t('closeModal.dualSignWarning'),
    esign: {
      title: t('closeModal.esign.title'),
      meaning: t('closeModal.esign.meaning'),
      password: t('closeModal.esign.password'),
      passwordHelp: t('closeModal.esign.passwordHelp'),
      passwordPlaceholder: t('closeModal.esign.passwordPlaceholder'),
    },
    cancel: t('closeModal.cancel'),
    submit: t('closeModal.submit'),
    submitting: t('closeModal.submitting'),
    formIncomplete: 'Complete all required fields to continue.',
    validation: {
      resolutionRequired: t('closeModal.validation.resolutionRequired'),
      passwordRequired: t('closeModal.validation.passwordRequired'),
    },
    error: t('closeModal.error'),
    success: t('closeModal.success'),
    severityValues: severityValues(t),
    statusValues: statusValues(t),
  };
}

export function buildNcrDetailLabels(t: QaNcrsTranslator): NcrDetailLabels {
  return {
    backToNcrs: t('detail.backToNcrs'),
    overdueBanner: t('detail.overdueBanner'),
    closedBanner: t('detail.closedBanner'),
    closeNcr: t('detail.closeNcr'),
    downloadReport: t('detail.downloadReport'),
    header: {
      title: t('detail.header.title'),
      responseWindowCritical: t('detail.header.responseWindowCritical'),
      responseWindowMajor: t('detail.header.responseWindowMajor'),
    },
    context: {
      detectedBy: t('detail.context.detectedBy'),
      detectedAt: t('detail.context.detectedAt'),
      location: t('detail.context.location'),
      product: t('detail.context.product'),
      affectedQty: t('detail.context.affectedQty'),
      responseDue: t('detail.context.responseDue'),
      noProduct: t('detail.context.noProduct'),
      kg: t('detail.context.kg'),
    },
    investigation: {
      title: t('detail.investigation.title'),
      rootCause: t('detail.investigation.rootCause'),
      rootCauseHelp: t('detail.investigation.rootCauseHelp'),
      rootCausePlaceholder: t('detail.investigation.rootCausePlaceholder'),
      rootCauseCategory: t('detail.investigation.rootCauseCategory'),
      rootCauseCategoryPlaceholder: t('detail.investigation.rootCauseCategoryPlaceholder'),
      immediateAction: t('detail.investigation.immediateAction'),
      immediateActionPlaceholder: t('detail.investigation.immediateActionPlaceholder'),
      save: t('detail.investigation.save'),
      saving: t('detail.investigation.saving'),
      saved: t('detail.investigation.saved'),
      readOnly: t('detail.investigation.readOnly'),
      error: t('detail.investigation.error'),
    },
    rootCauseCategories: Object.fromEntries(
      NCR_ROOT_CAUSE_CATEGORIES.map((c) => [c, t(`detail.rootCauseCategories.${c}`)]),
    ),
    capa: {
      title: t('detail.capa.title'),
      badge: t('detail.capa.badge'),
      body: t('detail.capa.body'),
    },
    linked: {
      title: t('detail.linked.title'),
      hold: t('detail.linked.hold'),
      reference: t('detail.linked.reference'),
      none: t('detail.linked.none'),
    },
    ccpBreach: {
      title: t('detail.ccpBreach.title'),
      ccp: t('detail.ccpBreach.ccp'),
      measuredValue: t('detail.ccpBreach.measuredValue'),
      criticalLimit: t('detail.ccpBreach.criticalLimit'),
      limitMin: t('detail.ccpBreach.limitMin'),
      limitMax: t('detail.ccpBreach.limitMax'),
      limitRange: t('detail.ccpBreach.limitRange'),
      limitNone: t('detail.ccpBreach.limitNone'),
      measuredAt: t('detail.ccpBreach.measuredAt'),
      recordedBy: t('detail.ccpBreach.recordedBy'),
      noReading: t('detail.ccpBreach.noReading'),
      none: t('detail.ccpBreach.none'),
    },
    dualSign: t('detail.dualSign'),
    severityValues: severityValues(t),
    statusValues: statusValues(t),
    typeValues: typeValues(t),
    closeLabels: buildNcrCloseLabels(t),
  };
}
