/**
 * Wave E11 — Complaints + CAPA register: label builders.
 *
 * Resolves the LIVE next-intl `quality.complaints` namespace
 * (apps/web/i18n/{en,pl,ro,uk}.json — real en + pl, ro/uk mirror EN per the
 * locale lesson) into the typed label objects the list / detail / modal client
 * islands consume. Lesson F-D08a: keys live in the live catalogs, NOT a staging
 * bundle (mirrors the sibling ccp-deviations Wave E3 slice).
 *
 * A `Translator` is any `(key, values?) => string` — both next-intl's
 * `getTranslations('quality.complaints')` (RSC) and a vi.fn-backed test translator
 * satisfy it, so the RSC pages and the RTL tests assert the same resolved strings.
 */
import {
  CAPA_ACTION_TYPES,
  COMPLAINT_FILTER_STATUSES,
  COMPLAINT_SEVERITIES,
  type CapaActionType,
  type CapaStatus,
  type ComplaintSeverity,
  type ComplaintStatus,
} from './complaints-contracts';

export type Translator = (key: string, values?: Record<string, string | number>) => string;

const CAPA_STATUSES: CapaStatus[] = ['open', 'in_progress', 'closed'];

function severityValues(t: Translator): Record<string, string> {
  return Object.fromEntries(COMPLAINT_SEVERITIES.map((s) => [s, t(`severityValues.${s}`)]));
}
function statusValues(t: Translator): Record<string, string> {
  return Object.fromEntries(COMPLAINT_FILTER_STATUSES.map((s) => [s, t(`statusValues.${s}`)]));
}
function capaTypeValues(t: Translator): Record<string, string> {
  return Object.fromEntries(CAPA_ACTION_TYPES.map((a) => [a, t(`capaTypeValues.${a}`)]));
}
function capaStatusValues(t: Translator): Record<string, string> {
  return Object.fromEntries(CAPA_STATUSES.map((s) => [s, t(`capaStatusValues.${s}`)]));
}

export type ComplaintListLabels = {
  newComplaint: string;
  newComplaintDisabled: string;
  searchPlaceholder: string;
  searchLabel: string;
  statusLabel: string;
  statusAll: string;
  rowsLabel: string;
  noCustomer: string;
  noRef: string;
  emptyAll: string;
  emptyFiltered: string;
  columns: {
    complaintNumber: string;
    customer: string;
    ref: string;
    severity: string;
    status: string;
    openedAt: string;
  };
  severityValues: Record<string, string>;
  statusValues: Record<string, string>;
  createLabels: ComplaintCreateLabels;
};

export type ComplaintCreateLabels = {
  title: string;
  subtitle: string;
  customer: string;
  customerHelp: string;
  customerPlaceholder: string;
  batchRef: string;
  batchRefHelp: string;
  batchRefPlaceholder: string;
  description: string;
  descriptionHelp: string;
  descriptionPlaceholder: string;
  severity: string;
  severityHelp: string;
  severityOptions: Record<string, string>;
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  validation: { descriptionRequired: string };
  error: string;
  success: string;
};

export type ComplaintDetailLabels = {
  backToList: string;
  convertedBanner: string;
  convert: string;
  converting: string;
  convertHelp: string;
  convertDisabledConverted: string;
  convertError: string;
  linkedNcr: string;
  linkedNcrView: string;
  info: {
    title: string;
    complaintNumber: string;
    customer: string;
    ref: string;
    severity: string;
    status: string;
    openedAt: string;
    description: string;
    noCustomer: string;
    noRef: string;
  };
  severityValues: Record<string, string>;
  statusValues: Record<string, string>;
  capa: CapaPanelLabels;
};

export type CapaPanelLabels = {
  title: string;
  subtitle: string;
  addAction: string;
  empty: string;
  error: string;
  resolve: string;
  resolveDisabled: string;
  ownerLabel: string;
  noOwner: string;
  dueLabel: string;
  noDue: string;
  columns: {
    actionType: string;
    description: string;
    owner: string;
    due: string;
    status: string;
    actions: string;
  };
  actionTypeValues: Record<string, string>;
  statusValues: Record<string, string>;
  addLabels: CapaCreateLabels;
  resolveLabels: CapaResolveLabels;
};

export type CapaCreateLabels = {
  title: string;
  subtitle: string;
  actionType: string;
  actionTypeHelp: string;
  actionTypeOptions: Record<string, string>;
  description: string;
  descriptionHelp: string;
  descriptionPlaceholder: string;
  owner: string;
  ownerHelp: string;
  ownerPlaceholder: string;
  dueDate: string;
  dueDateHelp: string;
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  validation: { descriptionRequired: string };
  error: string;
  success: string;
};

export type CapaResolveLabels = {
  title: string;
  subtitle: string;
  summaryType: string;
  summaryDescription: string;
  esign: { title: string; meaning: string; password: string; passwordHelp: string; passwordPlaceholder: string };
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  validation: { passwordRequired: string };
  error: string;
  success: string;
  actionTypeValues: Record<string, string>;
};

export function buildComplaintCreateLabels(t: Translator): ComplaintCreateLabels {
  return {
    title: t('createModal.title'),
    subtitle: t('createModal.subtitle'),
    customer: t('createModal.customer'),
    customerHelp: t('createModal.customerHelp'),
    customerPlaceholder: t('createModal.customerPlaceholder'),
    batchRef: t('createModal.batchRef'),
    batchRefHelp: t('createModal.batchRefHelp'),
    batchRefPlaceholder: t('createModal.batchRefPlaceholder'),
    description: t('createModal.description'),
    descriptionHelp: t('createModal.descriptionHelp'),
    descriptionPlaceholder: t('createModal.descriptionPlaceholder'),
    severity: t('createModal.severity'),
    severityHelp: t('createModal.severityHelp'),
    severityOptions: severityValues(t),
    cancel: t('createModal.cancel'),
    submit: t('createModal.submit'),
    submitting: t('createModal.submitting'),
    formIncomplete: t('createModal.formIncomplete'),
    validation: { descriptionRequired: t('createModal.validation.descriptionRequired') },
    error: t('createModal.error'),
    success: t('createModal.success'),
  };
}

export function buildComplaintListLabels(t: Translator): ComplaintListLabels {
  return {
    newComplaint: t('list.newComplaint'),
    newComplaintDisabled: t('list.newComplaintDisabled'),
    searchPlaceholder: t('list.searchPlaceholder'),
    searchLabel: t('list.searchLabel'),
    statusLabel: t('list.statusLabel'),
    statusAll: t('list.statusAll'),
    rowsLabel: t('list.rowsLabel'),
    noCustomer: t('list.noCustomer'),
    noRef: t('list.noRef'),
    emptyAll: t('list.emptyAll'),
    emptyFiltered: t('list.emptyFiltered'),
    columns: {
      complaintNumber: t('list.columns.complaintNumber'),
      customer: t('list.columns.customer'),
      ref: t('list.columns.ref'),
      severity: t('list.columns.severity'),
      status: t('list.columns.status'),
      openedAt: t('list.columns.openedAt'),
    },
    severityValues: severityValues(t),
    statusValues: statusValues(t),
    createLabels: buildComplaintCreateLabels(t),
  };
}

export function buildCapaCreateLabels(t: Translator): CapaCreateLabels {
  return {
    title: t('capaCreateModal.title'),
    subtitle: t('capaCreateModal.subtitle'),
    actionType: t('capaCreateModal.actionType'),
    actionTypeHelp: t('capaCreateModal.actionTypeHelp'),
    actionTypeOptions: capaTypeValues(t),
    description: t('capaCreateModal.description'),
    descriptionHelp: t('capaCreateModal.descriptionHelp'),
    descriptionPlaceholder: t('capaCreateModal.descriptionPlaceholder'),
    owner: t('capaCreateModal.owner'),
    ownerHelp: t('capaCreateModal.ownerHelp'),
    ownerPlaceholder: t('capaCreateModal.ownerPlaceholder'),
    dueDate: t('capaCreateModal.dueDate'),
    dueDateHelp: t('capaCreateModal.dueDateHelp'),
    cancel: t('capaCreateModal.cancel'),
    submit: t('capaCreateModal.submit'),
    submitting: t('capaCreateModal.submitting'),
    formIncomplete: t('capaCreateModal.formIncomplete'),
    validation: { descriptionRequired: t('capaCreateModal.validation.descriptionRequired') },
    error: t('capaCreateModal.error'),
    success: t('capaCreateModal.success'),
  };
}

export function buildCapaResolveLabels(t: Translator): CapaResolveLabels {
  return {
    title: t('capaResolveModal.title'),
    subtitle: t('capaResolveModal.subtitle'),
    summaryType: t('capaResolveModal.summaryType'),
    summaryDescription: t('capaResolveModal.summaryDescription'),
    esign: {
      title: t('capaResolveModal.esign.title'),
      meaning: t('capaResolveModal.esign.meaning'),
      password: t('capaResolveModal.esign.password'),
      passwordHelp: t('capaResolveModal.esign.passwordHelp'),
      passwordPlaceholder: t('capaResolveModal.esign.passwordPlaceholder'),
    },
    cancel: t('capaResolveModal.cancel'),
    submit: t('capaResolveModal.submit'),
    submitting: t('capaResolveModal.submitting'),
    formIncomplete: t('capaResolveModal.formIncomplete'),
    validation: { passwordRequired: t('capaResolveModal.validation.passwordRequired') },
    error: t('capaResolveModal.error'),
    success: t('capaResolveModal.success'),
    actionTypeValues: capaTypeValues(t),
  };
}

export function buildCapaPanelLabels(t: Translator): CapaPanelLabels {
  return {
    title: t('capa.title'),
    subtitle: t('capa.subtitle'),
    addAction: t('capa.addAction'),
    empty: t('capa.empty'),
    error: t('capa.error'),
    resolve: t('capa.resolve'),
    resolveDisabled: t('capa.resolveDisabled'),
    ownerLabel: t('capa.ownerLabel'),
    noOwner: t('capa.noOwner'),
    dueLabel: t('capa.dueLabel'),
    noDue: t('capa.noDue'),
    columns: {
      actionType: t('capa.columns.actionType'),
      description: t('capa.columns.description'),
      owner: t('capa.columns.owner'),
      due: t('capa.columns.due'),
      status: t('capa.columns.status'),
      actions: t('capa.columns.actions'),
    },
    actionTypeValues: capaTypeValues(t),
    statusValues: capaStatusValues(t),
    addLabels: buildCapaCreateLabels(t),
    resolveLabels: buildCapaResolveLabels(t),
  };
}

export function buildComplaintDetailLabels(t: Translator): ComplaintDetailLabels {
  return {
    backToList: t('detail.backToList'),
    convertedBanner: t('detail.convertedBanner'),
    convert: t('detail.convert'),
    converting: t('detail.converting'),
    convertHelp: t('detail.convertHelp'),
    convertDisabledConverted: t('detail.convertDisabledConverted'),
    convertError: t('detail.convertError'),
    linkedNcr: t('detail.linkedNcr'),
    linkedNcrView: t('detail.linkedNcrView'),
    info: {
      title: t('detail.info.title'),
      complaintNumber: t('detail.info.complaintNumber'),
      customer: t('detail.info.customer'),
      ref: t('detail.info.ref'),
      severity: t('detail.info.severity'),
      status: t('detail.info.status'),
      openedAt: t('detail.info.openedAt'),
      description: t('detail.info.description'),
      noCustomer: t('detail.info.noCustomer'),
      noRef: t('detail.info.noRef'),
    },
    severityValues: severityValues(t),
    statusValues: statusValues(t),
    capa: buildCapaPanelLabels(t),
  };
}

export { severityValues as complaintSeverityValues };
export type { ComplaintSeverity, ComplaintStatus, CapaActionType, CapaStatus };
