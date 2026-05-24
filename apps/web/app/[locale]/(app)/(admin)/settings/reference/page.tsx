import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import ReferenceDataScreen, {
  type ReferenceColumn,
  type ReferenceDataLabels,
  type ReferenceRow,
  type ReferenceTable,
} from './reference-data-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type SchemaColumnRow = {
  table_code: string;
  column_code: string;
  data_type: string;
  presentation_json: unknown;
};

type ReferenceDataRow = {
  table_code: string;
  row_key: string;
  row_data: Record<string, unknown>;
  is_active: boolean;
  updated_at: string | Date | null;
};

type TableCountRow = {
  table_code: string;
  row_count: string | number;
  updated_at: string | Date | null;
};

type ReferenceDataResult =
  | { state: 'ready' | 'empty'; tables: ReferenceTable[]; rowsByTable: Record<string, ReferenceRow[]>; selectedTableCode: string }
  | { state: 'error'; tables: ReferenceTable[]; rowsByTable: Record<string, ReferenceRow[]>; selectedTableCode: string };

const TABLE_DEFINITIONS: Array<Omit<ReferenceTable, 'rows' | 'updated' | 'columns'>> = [
  {
    code: 'allergens_reference',
    name: 'Allergens reference',
    desc: 'Schema-driven allergen family reference data.',
    marker: 'UNIVERSAL',
  },
  {
    code: 'uom_reference',
    name: 'Units of measure',
    desc: 'Mass and count units used in planning and production.',
    marker: 'TENANT',
  },
  {
    code: 'currency_reference',
    name: 'Currency ISO',
    desc: 'ISO currencies used by finance and procurement.',
    marker: 'UNIVERSAL',
  },
  {
    code: 'country_iso_reference',
    name: 'Country ISO',
    desc: 'Country codes used for shipping, suppliers, and compliance.',
    marker: 'UNIVERSAL',
  },
];

const FALLBACK_COLUMNS: Record<string, ReferenceColumn[]> = {
  allergens_reference: [
    { key: 'allergen_code', label: 'Allergen code', type: 'badge' },
    { key: 'display_name', label: 'Display name', type: 'text' },
    { key: 'eu_disclosure_text', label: 'EU disclosure text', type: 'text' },
    { key: 'risk_level', label: 'Risk level', type: 'badge' },
    { key: 'is_enabled', label: 'Enabled', type: 'boolean' },
  ],
  uom_reference: [
    { key: 'code', label: 'Code', type: 'badge' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'active', label: 'Active', type: 'boolean' },
  ],
  currency_reference: [
    { key: 'code', label: 'Code', type: 'badge' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'active', label: 'Active', type: 'boolean' },
  ],
  country_iso_reference: [
    { key: 'code', label: 'Code', type: 'badge' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'active', label: 'Active', type: 'boolean' },
  ],
};

const EMPTY_ROWS: Record<string, ReferenceRow[]> = Object.fromEntries(TABLE_DEFINITIONS.map((table) => [table.code, []]));

async function buildLabels(locale: string): Promise<ReferenceDataLabels> {
  const fallback: ReferenceDataLabels = {
    title: 'Reference data',
    subtitle: 'Allergen families, UoM, currency, country ISO — configuration tables.',
    importCsv: 'Import CSV',
    exportCsv: 'Export CSV',
    addRow: '+ Add row',
    edit: 'Edit',
    delete: 'Delete',
    rowsSuffix: 'rows',
    updatedPrefix: 'Updated',
    loading: 'Loading reference data…',
    empty: 'No reference rows configured for this table.',
    error: 'Unable to load reference data.',
  };

  const t = await getTranslations({ locale, namespace: 'settings.reference_data' });
  return (Object.keys(fallback) as Array<keyof ReferenceDataLabels>).reduce((acc, key) => {
    try {
      acc[key] = t(key);
    } catch {
      acc[key] = fallback[key];
    }
    return acc;
  }, {} as ReferenceDataLabels);
}

function humanizeColumn(columnCode: string) {
  return columnCode
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function mapRows(rows: ReferenceDataRow[]): Record<string, ReferenceRow[]> {
  const grouped: Record<string, ReferenceRow[]> = { ...EMPTY_ROWS };
  for (const row of rows) {
    const tableCode = normalizeTableCode(row.table_code);
    grouped[tableCode] ??= [];
    grouped[tableCode].push({
      rowId: `${tableCode}:${row.row_key}`,
      rowKey: row.row_key,
      values: Object.fromEntries(Object.entries(row.row_data ?? {}).map(([key, value]) => [key, normalizeValue(value)])),
    });
  }
  return grouped;
}

function mapColumns(rows: SchemaColumnRow[]): Record<string, ReferenceColumn[]> {
  const grouped: Record<string, ReferenceColumn[]> = {};
  for (const row of rows) {
    const tableCode = normalizeTableCode(row.table_code);
    grouped[tableCode] ??= [];
    grouped[tableCode].push({ key: row.column_code, label: labelFromPresentation(row), type: columnType(row) });
  }
  return grouped;
}

function tableShell(columnsByTable: Record<string, ReferenceColumn[]> = {}, counts: Record<string, TableCountRow> = {}): ReferenceTable[] {
  return TABLE_DEFINITIONS.map((definition) => ({
    ...definition,
    rows: Number(counts[definition.code]?.row_count ?? 0),
    updated: toDateString(counts[definition.code]?.updated_at),
    columns: columnsByTable[definition.code]?.length ? columnsByTable[definition.code] : FALLBACK_COLUMNS[definition.code],
  }));
}

async function readReferenceData(): Promise<ReferenceDataResult> {
  try {
    return await withOrgContext(async ({ client }) => {
      const queryClient = client as QueryClient;
      const tableCodes = TABLE_DEFINITIONS.map((table) => table.code);
      const schemaTableCodes = tableCodes.flatMap((code) => [code, `reference.${code}`]);
      const [schemaResult, countResult, rowResult] = await Promise.all([
        queryClient.query<SchemaColumnRow>(
          `select table_code, column_code, data_type, presentation_json
             from public.reference_schemas
            where table_code = any($1::text[])
              and deprecated_at is null
            order by table_code asc, schema_version asc, column_code asc`,
          [schemaTableCodes],
        ),
        queryClient.query<TableCountRow>(
          `select table_code, count(*) as row_count, max(updated_at) as updated_at
             from public.reference_tables
            where org_id = app.current_org_id()
              and table_code = any($1::text[])
              and is_active = true
            group by table_code`,
          [tableCodes],
        ),
        queryClient.query<ReferenceDataRow>(
          `select table_code, row_key, row_data, is_active, updated_at
             from public.reference_tables
            where org_id = app.current_org_id()
              and table_code = any($1::text[])
              and is_active = true
            order by table_code asc, display_order asc nulls last, row_key asc`,
          [tableCodes],
        ),
      ]);

      const columnsByTable = mapColumns(schemaResult.rows);
      const countsByTable = Object.fromEntries(countResult.rows.map((row) => [row.table_code, row]));
      const rowsByTable = mapRows(rowResult.rows);
      const tables = tableShell(columnsByTable, countsByTable);
      const selectedTableCode = TABLE_DEFINITIONS[0].code;
      return {
        state: rowsByTable[selectedTableCode]?.length ? 'ready' : 'empty',
        tables,
        rowsByTable,
        selectedTableCode,
      };
    });
  } catch {
    return {
      state: 'error',
      tables: tableShell(),
      rowsByTable: { ...EMPTY_ROWS },
      selectedTableCode: TABLE_DEFINITIONS[0].code,
    };
  }
}

export default async function ReferenceDataPage({ params }: PageProps) {
  const { locale } = await params;
  const [labels, data] = await Promise.all([buildLabels(locale), readReferenceData()]);

  return (
    <ReferenceDataScreen
      labels={labels}
      tables={data.tables}
      rowsByTable={data.rowsByTable}
      selectedTableCode={data.selectedTableCode}
      state={data.state}
    />
  );
}
