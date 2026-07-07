/**
 * Serializable EntityImportCard prop builders for the planning import hub.
 * RSC page imports these to assemble TO/WO card props without embedding
 * function fields (spec coerce/cells/groupKey or preview value helpers).
 */

import type { EntityImportCardLabels } from '../_components/entity-import-card.client';
import type { EntityImportWizardLabels } from '../_components/entity-import-wizard.client';
import type { EntityImportSpecId, PreviewColumnDescriptor } from './entity-import-registry';
import { TO_IMPORT_COLUMNS } from './to-spec';
import { WO_IMPORT_COLUMNS } from './wo-spec';

type Translator = (key: string, values?: Record<string, string | number>) => string;

export type EntityImportCardSerializableProps = {
  locale: string;
  testid: string;
  labels: EntityImportCardLabels;
  entityKind: EntityImportSpecId;
  showConversion: boolean;
  previewColumnDescriptors: PreviewColumnDescriptor[];
  createdNumberField: string;
  listPath: string;
  templateFilename: string;
  errorReportFilename: string;
  autoOpen: boolean;
};

function buildEntityWizardLabels(
  t: Translator,
  entity: 'to' | 'wo',
  conversionLabel: string,
): EntityImportWizardLabels {
  return {
    stepUpload: t('entityWizard.steps.upload'),
    stepValidate: t('entityWizard.steps.validate'),
    stepPreview: t('entityWizard.steps.preview'),
    stepResult: t('entityWizard.steps.result'),
    uploadTitle: t('entityWizard.upload.title'),
    fileLabel: t('entityWizard.upload.fileLabel'),
    orgScopedNote: t('entityWizard.upload.orgScopedNote'),
    selectedFile: t('entityWizard.upload.selectedFile'),
    validateCta: t('entityWizard.upload.validateCta'),
    validateTitle: t('entityWizard.validate.title'),
    counter: t('entityWizard.validate.counter'),
    rowsInFile: t('entityWizard.validate.rowsInFile'),
    okKpi: t('entityWizard.validate.okKpi'),
    errorsKpi: t('entityWizard.validate.errorsKpi'),
    colRow: t('entityWizard.validate.colRow'),
    colStatus: t('entityWizard.validate.colStatus'),
    colColumn: t('entityWizard.validate.colColumn'),
    colIssue: t('entityWizard.validate.colIssue'),
    colConversion: conversionLabel,
    statusOk: t('entityWizard.validate.statusOk'),
    statusError: t('entityWizard.validate.statusError'),
    noRowErrors: t('entityWizard.validate.noRowErrors'),
    downloadErrorReport: t('entityWizard.validate.downloadErrorReport'),
    previewTitle: t('entityWizard.preview.title'),
    docsToCreate: t(`${entity}.docsToCreate`),
    colLines: t('entityWizard.preview.colLines'),
    modeLabel: t('entityWizard.preview.modeLabel'),
    modeAllOrNothing: t('entityWizard.preview.modeAllOrNothing'),
    modeSkipInvalid: t('entityWizard.preview.modeSkipInvalid'),
    modeHelpAllOrNothing: t('entityWizard.preview.modeHelpAllOrNothing'),
    modeHelpSkipInvalid: t('entityWizard.preview.modeHelpSkipInvalid'),
    commitCta: t('entityWizard.preview.commitCta'),
    resultTitle: t('entityWizard.result.title'),
    createdKpi: t('entityWizard.result.createdKpi'),
    skippedKpi: t('entityWizard.result.skippedKpi'),
    failedKpi: t('entityWizard.result.failedKpi'),
    createdHeading: t(`${entity}.createdHeading`),
    skippedHeading: t('entityWizard.result.skippedHeading'),
    noCreated: t(`${entity}.noCreated`),
    viewList: t(`${entity}.viewList`),
    backCta: t('entityWizard.backCta'),
    parseFailed: t('entityWizard.errors.parseFailed'),
    headerMismatch: t('entityWizard.errors.headerMismatch'),
    forbidden: t(`${entity}.forbidden`),
    commitFailed: t('entityWizard.errors.commitFailed'),
    importAnother: t('entityWizard.result.importAnother'),
  };
}

function buildToCardLabels(t: Translator): EntityImportCardLabels {
  return {
    cardTitle: t('to.cardTitle'),
    cardDesc: t('to.cardDesc'),
    downloadTemplate: t('to.downloadTemplate'),
    importFile: t('to.importFile'),
    templateColumns: `${t('to.templateColumnsLabel')}: ${TO_IMPORT_COLUMNS.join(', ')}`,
    wizard: buildEntityWizardLabels(t, 'to', t('entityWizard.validate.colIssue')),
  };
}

function buildWoCardLabels(t: Translator): EntityImportCardLabels {
  return {
    cardTitle: t('wo.cardTitle'),
    cardDesc: t('wo.cardDesc'),
    downloadTemplate: t('wo.downloadTemplate'),
    importFile: t('wo.importFile'),
    templateColumns: `${t('wo.templateColumnsLabel')}: ${WO_IMPORT_COLUMNS.join(', ')}`,
    wizard: buildEntityWizardLabels(t, 'wo', t('wo.colConversion')),
  };
}

const TO_PREVIEW_COLUMN_DESCRIPTORS = (t: Translator): PreviewColumnDescriptor[] => [
  {
    key: 'external_ref',
    label: t('entityWizard.preview.colExternalRef'),
    formatId: 'external_ref',
    mono: true,
  },
  {
    key: 'from',
    label: t('to.colFromWarehouse'),
    formatId: 'from_warehouse',
    mono: true,
  },
  {
    key: 'to',
    label: t('to.colToWarehouse'),
    formatId: 'to_warehouse',
    mono: true,
  },
];

const WO_PREVIEW_COLUMN_DESCRIPTORS = (t: Translator): PreviewColumnDescriptor[] => [
  {
    key: 'external_ref',
    label: t('entityWizard.preview.colExternalRef'),
    formatId: 'external_ref',
    mono: true,
  },
  {
    key: 'fg',
    label: t('wo.colFinishedGood'),
    formatId: 'fg_code',
    mono: true,
  },
  {
    key: 'qty',
    label: t('wo.colQuantity'),
    formatId: 'qty_uom',
  },
];

export function buildToImportCardProps(
  t: Translator,
  locale: string,
  autoOpen: boolean,
): EntityImportCardSerializableProps {
  return {
    locale,
    testid: 'to',
    labels: buildToCardLabels(t),
    entityKind: 'to',
    showConversion: false,
    previewColumnDescriptors: TO_PREVIEW_COLUMN_DESCRIPTORS(t),
    createdNumberField: 'to_number',
    listPath: '/planning/transfer-orders',
    templateFilename: 'to-import-template.csv',
    errorReportFilename: 'to-import-errors.csv',
    autoOpen,
  };
}

export function buildWoImportCardProps(
  t: Translator,
  locale: string,
  autoOpen: boolean,
): EntityImportCardSerializableProps {
  return {
    locale,
    testid: 'wo',
    labels: buildWoCardLabels(t),
    entityKind: 'wo',
    showConversion: true,
    previewColumnDescriptors: WO_PREVIEW_COLUMN_DESCRIPTORS(t),
    createdNumberField: 'wo_number',
    listPath: '/planning/work-orders',
    templateFilename: 'wo-import-template.csv',
    errorReportFilename: 'wo-import-errors.csv',
    autoOpen,
  };
}

/** Walk serializable card props and collect paths to any embedded functions. */
export function findFunctionFields(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [path || '(root)'];
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findFunctionFields(entry, `${path}[${index}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
    findFunctionFields(entry, path ? `${path}.${key}` : key),
  );
}
