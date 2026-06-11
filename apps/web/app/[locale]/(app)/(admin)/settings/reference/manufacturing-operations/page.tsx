import { getTranslations } from 'next-intl/server';

import { createManufacturingOperation } from '../../../../../../../actions/reference/manufacturing-ops/create';
import { listManufacturingOperations } from '../../../../../../../actions/reference/manufacturing-ops/list';
import { reorderManufacturingOperations } from '../../../../../../../actions/reference/manufacturing-ops/reorder';
import { resetManufacturingOperationsToSeed } from '../../../../../../../actions/reference/manufacturing-ops/reset-to-seed';
import ManufacturingOperationsScreen, {
  type IndustryCode,
  type ManufacturingOperation,
  type ManufacturingOperationsScreenLabels,
} from './manufacturing-operations-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

const LABEL_KEYS = [
  'breadcrumb_settings',
  'breadcrumb_reference_tables',
  'breadcrumb_manufacturing_operations',
  'set_reference',
  'title',
  'subtitle',
  'notice',
  'loading',
  'error',
  'permission_denied',
  'add_new_operation',
  'reset_to_seed_data',
  'delete_inactive_rows',
  'industry_label',
  'show_inactive',
  'industry_all',
  'industry_bakery',
  'industry_pharma',
  'industry_fmcg',
  'industry_generic',
  'industry_custom',
  'column_operation_name',
  'column_process_suffix',
  'column_sequence',
  'column_industry_code',
  'column_status',
  'column_actions',
  'status_active',
  'status_inactive',
  'edit_operation',
  'delete_operation',
  'empty',
  'reset_dialog_title',
  'reset_dialog_body',
  'add_dialog_title',
  'field_operation_name',
  'field_process_suffix',
  'field_description',
  'field_sequence',
  'field_active',
  'create',
  'creating',
  'duplicate_operation_name',
  'duplicate_process_suffix',
  'create_failed',
  'cancel',
  'reset',
] as const;

type LabelKey = (typeof LABEL_KEYS)[number];
type LabelCamelKey = keyof ManufacturingOperationsScreenLabels;

const LABEL_MAP: Record<LabelKey, LabelCamelKey> = {
  breadcrumb_settings: 'breadcrumbSettings',
  breadcrumb_reference_tables: 'breadcrumbReferenceTables',
  breadcrumb_manufacturing_operations: 'breadcrumbManufacturingOperations',
  set_reference: 'setReference',
  title: 'title',
  subtitle: 'subtitle',
  notice: 'notice',
  loading: 'loading',
  error: 'error',
  permission_denied: 'permissionDenied',
  add_new_operation: 'addNewOperation',
  reset_to_seed_data: 'resetToSeedData',
  delete_inactive_rows: 'deleteInactiveRows',
  industry_label: 'industryLabel',
  show_inactive: 'showInactive',
  industry_all: 'industryAll',
  industry_bakery: 'industryBakery',
  industry_pharma: 'industryPharma',
  industry_fmcg: 'industryFmcg',
  industry_generic: 'industryGeneric',
  industry_custom: 'industryCustom',
  column_operation_name: 'columnOperationName',
  column_process_suffix: 'columnProcessSuffix',
  column_sequence: 'columnSequence',
  column_industry_code: 'columnIndustryCode',
  column_status: 'columnStatus',
  column_actions: 'columnActions',
  status_active: 'statusActive',
  status_inactive: 'statusInactive',
  edit_operation: 'editOperation',
  delete_operation: 'deleteOperation',
  empty: 'empty',
  reset_dialog_title: 'resetDialogTitle',
  reset_dialog_body: 'resetDialogBody',
  add_dialog_title: 'addDialogTitle',
  field_operation_name: 'fieldOperationName',
  field_process_suffix: 'fieldProcessSuffix',
  field_description: 'fieldDescription',
  field_sequence: 'fieldSequence',
  field_active: 'fieldActive',
  create: 'create',
  creating: 'creating',
  duplicate_operation_name: 'duplicateOperationName',
  duplicate_process_suffix: 'duplicateProcessSuffix',
  create_failed: 'createFailed',
  cancel: 'cancel',
  reset: 'reset',
};

const EN_LABEL_FALLBACKS: Record<LabelKey, string> = {
  breadcrumb_settings: 'Settings',
  breadcrumb_reference_tables: 'Reference Tables',
  breadcrumb_manufacturing_operations: 'Manufacturing Operations',
  set_reference: 'SET-055 / PRD §8.9.4',
  title: 'Manufacturing Operations',
  subtitle: 'Configure tenant-specific operation names, process suffixes, industry seed sets, active state, and recipe sequence order.',
  notice: 'Operations are referenced by routings, line assignments, and WIP code generators. The process suffix is immutable after creation.',
  loading: 'Loading manufacturing operations...',
  error: 'Unable to load manufacturing operations.',
  permission_denied: 'You do not have permission to manage manufacturing operations.',
  add_new_operation: 'Add New Operation',
  reset_to_seed_data: 'Reset to seed data',
  delete_inactive_rows: 'Delete inactive rows',
  industry_label: 'Industry',
  show_inactive: 'Show inactive',
  industry_all: 'All industries',
  industry_bakery: 'Bakery',
  industry_pharma: 'Pharma',
  industry_fmcg: 'FMCG',
  industry_generic: 'Generic',
  industry_custom: 'Custom',
  column_operation_name: 'Operation Name',
  column_process_suffix: 'Process Suffix',
  column_sequence: 'Sequence',
  column_industry_code: 'Industry Code',
  column_status: 'Status',
  column_actions: 'Actions',
  status_active: 'Active',
  status_inactive: 'Inactive',
  edit_operation: 'Edit {operation}',
  delete_operation: 'Delete {operation}',
  empty: 'No manufacturing operations match the current filters.',
  reset_dialog_title: 'Reset to industry seed data',
  reset_dialog_body: 'This will replace all current operations with the selected industry seed data. Existing operation order, suffixes, and inactive rows will be reset.',
  add_dialog_title: 'Add manufacturing operation',
  field_operation_name: 'Operation name',
  field_process_suffix: 'Process suffix',
  field_description: 'Description',
  field_sequence: 'Sequence',
  field_active: 'Active',
  create: 'Create',
  creating: 'Creating...',
  duplicate_operation_name: 'An operation with this name already exists.',
  duplicate_process_suffix: 'An operation with this suffix already exists for this industry.',
  create_failed: 'Unable to create manufacturing operation.',
  cancel: 'Cancel',
  reset: 'Reset',
};

async function buildLabels(locale: string): Promise<ManufacturingOperationsScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.manufacturing_operations' });
  const has = typeof t.has === 'function' ? t.has.bind(t) : null;
  return LABEL_KEYS.reduce((acc, key) => {
    acc[LABEL_MAP[key]] = has?.(key) ? t(key) : EN_LABEL_FALLBACKS[key];
    return acc;
  }, {} as ManufacturingOperationsScreenLabels);
}

function normalizeOperations(rows: ManufacturingOperation[]): ManufacturingOperation[] {
  return rows.map((row) => ({
    id: row.id,
    operation_name: row.operation_name,
    process_suffix: row.process_suffix,
    operation_seq: row.operation_seq,
    industry_code: row.industry_code,
    is_active: row.is_active,
    description: row.description ?? null,
  }));
}

async function reorderOperations(rows: Array<{ id: string; operation_seq: number }>) {
  'use server';

  return reorderManufacturingOperations({
    items: rows.map((row) => ({ id: row.id, operationSeq: row.operation_seq })),
  });
}

async function resetToSeed(industryCode: IndustryCode) {
  'use server';

  return resetManufacturingOperationsToSeed({ industryCode, confirmReset: true });
}

async function addOperation(input: {
  operationName: string;
  processSuffix: string;
  description: string | null;
  operationSeq: number;
  industryCode: IndustryCode;
  isActive: boolean;
}) {
  'use server';

  return createManufacturingOperation(input);
}

export default async function ManufacturingOperationsPage({ params }: PageProps) {
  const { locale } = await params;
  const labels = await buildLabels(locale);
  const result = await listManufacturingOperations({ includeInactive: true });

  if (result.ok === false) {
    return (
      <ManufacturingOperationsScreen
        labels={labels}
        operations={[]}
        error={result.error === 'forbidden' ? null : labels.error}
        canManage={result.error === 'forbidden' ? false : true}
        createOperation={addOperation}
        reorderOperations={reorderOperations}
        resetToSeed={resetToSeed}
      />
    );
  }

  return (
    <ManufacturingOperationsScreen
      labels={labels}
      operations={normalizeOperations(result.data)}
      createOperation={addOperation}
      reorderOperations={reorderOperations}
      resetToSeed={resetToSeed}
    />
  );
}
