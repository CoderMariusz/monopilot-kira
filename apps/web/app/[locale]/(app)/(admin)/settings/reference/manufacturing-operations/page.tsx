import { getTranslations } from 'next-intl/server';

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
  cancel: 'cancel',
  reset: 'reset',
};

async function buildLabels(locale: string): Promise<ManufacturingOperationsScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.manufacturing_operations' });
  return LABEL_KEYS.reduce((acc, key) => {
    acc[LABEL_MAP[key]] = t(key);
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
        reorderOperations={reorderOperations}
        resetToSeed={resetToSeed}
      />
    );
  }

  return (
    <ManufacturingOperationsScreen
      labels={labels}
      operations={normalizeOperations(result.data)}
      reorderOperations={reorderOperations}
      resetToSeed={resetToSeed}
    />
  );
}
