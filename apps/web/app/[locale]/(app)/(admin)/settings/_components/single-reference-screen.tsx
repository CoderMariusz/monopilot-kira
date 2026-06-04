import { getTranslations } from 'next-intl/server';

import { softDeleteReferenceRow } from '../../../../../../actions/reference/soft-delete';
import { upsertReferenceRow } from '../../../../../../actions/reference/upsert';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import ReferenceDataScreen, {
  type ReferenceColumn,
  type ReferenceDataLabels,
  type ReferenceRow,
  type ReferenceTable,
} from '../reference/reference-data-screen.client';

/**
 * Shared schema-driven single-table reference screen.
 *
 * Reuses the exact reference-data screen client + reference upsert/soft-delete
 * Server Actions used by /settings/reference (prototype parity source:
 * prototypes/design/Monopilot Design System/settings/admin-screens.jsx:561-621
 * reference_data_screen). A settings route (e.g. processes, partners) passes a
 * single TableDefinition + fallback columns; data is read from
 * public.reference_tables via withOrgContext (org-scoped, RLS) — no mocks.
 */

export type SingleReferenceTableDefinition = Omit<ReferenceTable, 'rows' | 'updated' | 'columns'>;

export type SingleReferenceScreenConfig = {
  /** reference_tables.table_code (e.g. 'processes'); schema rows live under 'reference.<code>'. */
  tableCode: string;
  definition: SingleReferenceTableDefinition;
  /** Fallback column descriptors used when no reference_schemas rows are found. */
  fallbackColumns: ReferenceColumn[];
  /** Translation namespace under settings.* providing the screen labels. */
  labelNamespace: string;
};

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type SchemaColumnRow = {
  table_code: string;
  column_code: string;
  data_type: string;
  presentation_json: unknown;
  validation_json: unknown;
};

type ReferenceDataRow = {
  table_code: string;
  row_key: string;
  row_data: Record<string, unknown>;
  version: number;
  is_active: boolean;
  updated_at: string | Date | null;
};

type TableCountRow = {
  table_code: string;
  row_count: string | number;
  updated_at: string | Date | null;
};

type ReferenceDataResult = {
  state: 'ready' | 'empty' | 'error';
  table: ReferenceTable;
  rows: ReferenceRow[];
  canEditReferenceData: boolean;
};

function humanizeColumn(columnCode: string) {
  return columnCode.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function columnType(row: SchemaColumnRow): ReferenceColumn['type'] {
  if (row.data_type === 'enum' || /code|status|level|type/i.test(row.column_code)) return 'badge';
  if (row.data_type === 'boolean' || /^is_|_active$|enabled/i.test(row.column_code)) return 'boolean';
  return 'text';
}

function labelFromPresentation(row: SchemaColumnRow) {
  if (row.presentation_json && typeof row.presentation_json === 'object' && 'label' in row.presentation_json) {
    const label = (row.presentation_json as { label?: unknown }).label;
    if (typeof label === 'string' && label.trim()) return label.trim();
  }
  return humanizeColumn(row.column_code);
}

function toDateString(value: string | Date | null | undefined) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 10);
}

function normalizeValue(value: unknown): string | boolean {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return '—';
  return String(value);
}

function normalizeTableCode(value: string) {
  return value.startsWith('reference.') ? value.slice('reference.'.length) : value;
}

function enumValuesFromSchema(row: SchemaColumnRow): string[] | undefined {
  if (row.data_type !== 'enum') return undefined;
  const validation = row.validation_json;
  if (validation && typeof validation === 'object') {
    const candidate =
      (validation as { enum_values?: unknown }).enum_values ?? (validation as { values?: unknown }).values;
    if (Array.isArray(candidate) && candidate.length > 0) return candidate.map(String);
  }
  return undefined;
}

function mapColumns(rows: SchemaColumnRow[]): ReferenceColumn[] {
  return rows.map((row) => {
    const enumOptions = enumValuesFromSchema(row);
    return {
      key: row.column_code,
      label: labelFromPresentation(row),
      type: columnType(row),
      ...(enumOptions ? { enumOptions } : {}),
    };
  });
}

function mapRows(rows: ReferenceDataRow[]): ReferenceRow[] {
  return rows.map((row) => ({
    rowId: `${normalizeTableCode(row.table_code)}:${row.row_key}`,
    rowKey: row.row_key,
    version: row.version,
    values: Object.fromEntries(Object.entries(row.row_data ?? {}).map(([key, value]) => [key, normalizeValue(value)])),
  }));
}

async function buildLabels(
  locale: string,
  namespace: string,
  enumColumnKeys: string[] = [],
): Promise<ReferenceDataLabels> {
  const fallback: ReferenceDataLabels = {
    title: 'Reference data',
    subtitle: 'Schema-driven configuration table.',
    importCsv: 'Import CSV',
    exportCsv: 'Export CSV',
    addRow: '+ Add row',
    edit: 'Edit',
    delete: 'Delete',
    rowsSuffix: 'rows',
    updatedPrefix: 'Updated',
    loading: 'Loading reference data…',
    empty: 'No rows configured yet.',
    error: 'Unable to load reference data.',
    permissionDenied: 'You do not have permission to edit reference data.',
    actions: 'Actions',
    enabled: 'Enabled',
    disabled: 'Disabled',
    yes: 'Yes',
    no: 'No',
    rowKey: 'Row key',
    rowKeyHelp: 'Uppercase, min 2 chars. Unique in table.',
    modal: {
      edit: {
        title: 'Add row',
        editTitle: 'Edit row — {rowKey}',
        referenceTable: 'Reference table · {tableCode}',
        cancel: 'Cancel',
        save: 'Save',
        saving: 'Saving…',
        loading: '⟳ Loading reference row…',
        loadingLabel: 'Loading reference row',
        noSchema: 'No schema fields available for {tableCode}',
        rowKeyInvalid: 'Must be uppercase alnum / underscore / dash, ≥ 2 chars',
        rowKeyRequired: 'Row key is required',
        minChars: 'Min 2 chars',
        selectPlaceholder: 'Select…',
        saveFailed: 'Unable to save reference row.',
      },
      delete: {
        title: 'Delete {code}?',
        cancel: 'Cancel',
        confirmLabel: 'Type DELETE to confirm',
        confirmButton: 'Delete permanently',
        deleting: 'Deleting…',
        confirmCheckbox: 'Confirm',
        warning: 'This action cannot be undone. {code} — {name} will be permanently removed from {table}.',
        affectedRows: '{count} rows referencing this code will be orphaned.',
        precheckError: 'Unable to check referencing rows',
        submitFailed: 'Unable to delete reference data.',
        success: 'Reference data deleted',
      },
    },
  };

  const t = await getTranslations({ locale, namespace: `settings.${namespace}` });
  const safeT = (key: string, value: string, values?: Record<string, string | number>) => {
    try {
      return t(key, values) || value;
    } catch {
      return value;
    }
  };

  // Localized labels for schema enum option values. Translation shape:
  //   settings.<namespace>.<column>.options.<value> = "Localized label"
  // Flattened to `<column>.<value>` so the CRUD modal can resolve a dropdown
  // option label. Resolved per enum column so it does not depend on reading the
  // whole namespace root (next-intl t.raw requires a concrete key).
  const optionLabels: Record<string, string> = {};
  for (const columnKey of enumColumnKeys) {
    try {
      const options = typeof t.raw === 'function' ? (t.raw(`${columnKey}.options`) as unknown) : null;
      if (options && typeof options === 'object') {
        for (const [value, label] of Object.entries(options as Record<string, unknown>)) {
          if (typeof label === 'string' && label.trim()) optionLabels[`${columnKey}.${value}`] = label;
        }
      }
    } catch {
      // No option labels for this column — humanized fallback applies in the modal.
    }
  }

  return {
    title: safeT('title', fallback.title),
    subtitle: safeT('subtitle', fallback.subtitle),
    importCsv: safeT('importCsv', fallback.importCsv),
    exportCsv: safeT('exportCsv', fallback.exportCsv),
    addRow: safeT('addRow', fallback.addRow),
    edit: safeT('edit', fallback.edit),
    delete: safeT('delete', fallback.delete),
    rowsSuffix: safeT('rowsSuffix', fallback.rowsSuffix),
    updatedPrefix: safeT('updatedPrefix', fallback.updatedPrefix),
    loading: safeT('loading', fallback.loading),
    empty: safeT('empty', fallback.empty),
    error: safeT('error', fallback.error),
    permissionDenied: safeT('permissionDenied', fallback.permissionDenied ?? ''),
    actions: safeT('actions', fallback.actions),
    enabled: safeT('enabled', fallback.enabled),
    disabled: safeT('disabled', fallback.disabled),
    yes: safeT('yes', fallback.yes),
    no: safeT('no', fallback.no),
    rowKey: safeT('rowKey', fallback.rowKey),
    rowKeyHelp: safeT('rowKeyHelp', fallback.rowKeyHelp),
    ...(Object.keys(optionLabels).length ? { optionLabels } : {}),
    modal: {
      edit: {
        title: safeT('modal.edit.title', fallback.modal?.edit?.title ?? ''),
        editTitle: safeT('modal.edit.editTitle', fallback.modal?.edit?.editTitle ?? '', { rowKey: '{rowKey}' }),
        referenceTable: safeT('modal.edit.referenceTable', fallback.modal?.edit?.referenceTable ?? '', { tableCode: '{tableCode}' }),
        cancel: safeT('modal.edit.cancel', fallback.modal?.edit?.cancel ?? ''),
        save: safeT('modal.edit.save', fallback.modal?.edit?.save ?? ''),
        saving: safeT('modal.edit.saving', fallback.modal?.edit?.saving ?? ''),
        loading: safeT('modal.edit.loading', fallback.modal?.edit?.loading ?? ''),
        loadingLabel: safeT('modal.edit.loadingLabel', fallback.modal?.edit?.loadingLabel ?? ''),
        noSchema: safeT('modal.edit.noSchema', fallback.modal?.edit?.noSchema ?? '', { tableCode: '{tableCode}' }),
        rowKeyInvalid: safeT('modal.edit.rowKeyInvalid', fallback.modal?.edit?.rowKeyInvalid ?? ''),
        rowKeyRequired: safeT('modal.edit.rowKeyRequired', fallback.modal?.edit?.rowKeyRequired ?? ''),
        minChars: safeT('modal.edit.minChars', fallback.modal?.edit?.minChars ?? ''),
        selectPlaceholder: safeT('modal.edit.selectPlaceholder', fallback.modal?.edit?.selectPlaceholder ?? ''),
        saveFailed: safeT('modal.edit.saveFailed', fallback.modal?.edit?.saveFailed ?? ''),
      },
      delete: {
        title: safeT('modal.delete.title', fallback.modal?.delete?.title ?? '', { code: '{code}', name: '{name}', table: '{table}' }),
        cancel: safeT('modal.delete.cancel', fallback.modal?.delete?.cancel ?? ''),
        confirmLabel: safeT('modal.delete.confirmLabel', fallback.modal?.delete?.confirmLabel ?? ''),
        confirmButton: safeT('modal.delete.confirmButton', fallback.modal?.delete?.confirmButton ?? ''),
        deleting: safeT('modal.delete.deleting', fallback.modal?.delete?.deleting ?? ''),
        confirmCheckbox: safeT('modal.delete.confirmCheckbox', fallback.modal?.delete?.confirmCheckbox ?? ''),
        warning: safeT('modal.delete.warning', fallback.modal?.delete?.warning ?? '', { code: '{code}', name: '{name}', table: '{table}' }),
        affectedRows: safeT('modal.delete.affectedRows', fallback.modal?.delete?.affectedRows ?? '', { count: '{count}' }),
        precheckError: safeT('modal.delete.precheckError', fallback.modal?.delete?.precheckError ?? ''),
        submitFailed: safeT('modal.delete.submitFailed', fallback.modal?.delete?.submitFailed ?? ''),
        success: safeT('modal.delete.success', fallback.modal?.delete?.success ?? ''),
      },
    },
  } satisfies ReferenceDataLabels;
}

async function readReferenceData(config: SingleReferenceScreenConfig): Promise<ReferenceDataResult> {
  const { tableCode, definition, fallbackColumns } = config;
  const emptyTable: ReferenceTable = { ...definition, rows: 0, updated: '—', columns: fallbackColumns };

  try {
    return await withOrgContext(async ({ client, userId, orgId }: { client: QueryClient; userId: string; orgId: string }) => {
      const schemaTableCodes = [tableCode, `reference.${tableCode}`];
      const [schemaResult, countResult, rowResult, permissionResult] = await Promise.all([
        client.query<SchemaColumnRow>(
          `select table_code, column_code, data_type, presentation_json, validation_json
             from public.reference_schemas
            where table_code = any($1::text[])
              and deprecated_at is null
            order by table_code asc, schema_version asc, column_code asc`,
          [schemaTableCodes],
        ),
        client.query<TableCountRow>(
          `select table_code, count(*) as row_count, max(updated_at) as updated_at
             from public.reference_tables
            where org_id = app.current_org_id()
              and table_code = $1
              and is_active = true
            group by table_code`,
          [tableCode],
        ),
        client.query<ReferenceDataRow>(
          `select table_code, row_key, row_data, version, is_active, updated_at
             from public.reference_tables
            where org_id = app.current_org_id()
              and table_code = $1
              and is_active = true
            order by display_order asc nulls last, row_key asc`,
          [tableCode],
        ),
        client.query<{ ok: boolean }>(
          `select true as ok
             from public.user_roles ur
             join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
             join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
            where ur.user_id = $1::uuid
              and ur.org_id = $2::uuid
            limit 1`,
          [userId, orgId, 'settings.reference.edit'],
        ),
      ]);

      const columns = mapColumns(schemaResult.rows);
      const count = countResult.rows[0];
      const rows = mapRows(rowResult.rows);
      const table: ReferenceTable = {
        ...definition,
        rows: Number(count?.row_count ?? rows.length),
        updated: toDateString(count?.updated_at),
        columns: columns.length ? columns : fallbackColumns,
      };

      return {
        state: rows.length ? 'ready' : 'empty',
        table,
        rows,
        canEditReferenceData: permissionResult.rows.length > 0,
      };
    });
  } catch {
    return { state: 'error', table: emptyTable, rows: [], canEditReferenceData: false };
  }
}

export async function SingleReferenceScreen({ locale, config }: { locale: string; config: SingleReferenceScreenConfig }) {
  const data = await readReferenceData(config);
  const enumColumnKeys = data.table.columns.filter((column) => column.enumOptions?.length).map((column) => column.key);
  const labels = await buildLabels(locale, config.labelNamespace, enumColumnKeys);

  return (
    <ReferenceDataScreen
      labels={labels}
      tables={[data.table]}
      rowsByTable={{ [config.tableCode]: data.rows }}
      selectedTableCode={config.tableCode}
      state={data.state}
      canEditReferenceData={data.canEditReferenceData}
      upsertReferenceRow={upsertReferenceRow}
      softDeleteReferenceRow={softDeleteReferenceRow}
    />
  );
}
