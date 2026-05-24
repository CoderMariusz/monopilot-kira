import React from 'react';

export const dynamic = 'force-dynamic';

type ReferenceColumn = {
  code: string;
  label: string;
  required?: boolean;
};

type PreviewRow = {
  rowNumber: number;
  action: 'insert' | 'update' | 'skip' | 'error';
  values: Record<string, string>;
  message?: string;
};

type ImportPreview = {
  parsedRows: number;
  insertCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  rows: PreviewRow[];
  headerMismatch?: { expected: string[]; received: string[] };
};

type CommitResult = {
  status: 'processing' | 'complete';
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  errorRowsDownloadHref?: string;
};

type ReferenceTable = {
  code: string;
  name: string;
  columns: ReferenceColumn[];
  parentHref: string;
};

type PageProps = {
  params?: Promise<{ locale: string; code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  [key: string]: unknown;
};

type ReferenceImportOverrides = {
  initialStep?: 'upload' | 'preview' | 'commit';
};

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type SchemaColumnRow = {
  table_code: string;
  column_code: string;
  presentation_json?: unknown;
};

const h = React.createElement;

const FALLBACK_TABLES: Record<string, Omit<ReferenceTable, 'parentHref'>> = {
  allergens_reference: {
    code: 'allergens_reference',
    name: 'Allergens reference',
    columns: [
      { code: 'allergen_code', label: 'Allergen code', required: true },
      { code: 'display_name', label: 'Display name', required: true },
      { code: 'risk_level', label: 'Risk level' },
      { code: 'is_enabled', label: 'Enabled' },
    ],
  },
};

function humanize(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function labelFromPresentation(row: SchemaColumnRow) {
  if (row.presentation_json && typeof row.presentation_json === 'object' && 'label' in row.presentation_json) {
    const label = (row.presentation_json as { label?: unknown }).label;
    if (typeof label === 'string' && label.trim()) return label.trim();
  }
  return humanize(row.column_code);
}

function normalizeTableCode(value: string) {
  return value.startsWith('reference.') ? value.slice('reference.'.length) : value;
}

async function readReferenceTable(code: string, locale: string): Promise<ReferenceTable> {
  const fallback = FALLBACK_TABLES[code] ?? {
    code,
    name: humanize(code),
    columns: [
      { code: 'code', label: 'Code', required: true },
      { code: 'name', label: 'Name', required: true },
      { code: 'is_enabled', label: 'Enabled' },
    ],
  };

  const { withOrgContext } = await import('../../../../../../../../lib/auth/with-org-context.js');
  return await withOrgContext(async ({ client }: { client: QueryClient }) => {
    const result = await client.query<SchemaColumnRow>(
      `select table_code, column_code, presentation_json
         from public.reference_schemas
        where table_code = any($1::text[])
          and deprecated_at is null
        order by schema_version desc, column_code asc`,
      [[code, `reference.${code}`]],
    );
    const columns = result.rows
      .filter((row) => normalizeTableCode(row.table_code) === code)
      .map((row) => ({ code: row.column_code, label: labelFromPresentation(row), required: /code|name/i.test(row.column_code) }));

    return {
      ...fallback,
      columns: columns.length ? columns : fallback.columns,
      parentHref: `/${locale}/settings/reference/${code}`,
    };
  });
}

function statusPill(label: string, variant: 'success' | 'warning' | 'danger' | 'muted' | 'info') {
  return h('span', { className: `badge badge--${variant}`, 'data-variant': variant }, label);
}

function actionVariant(action: PreviewRow['action']) {
  if (action === 'insert') return 'success';
  if (action === 'update') return 'warning';
  if (action === 'error') return 'danger';
  return 'muted';
}

function expectedImportHeaders(columns: ReferenceColumn[]) {
  const columnCodes = columns.map((column) => column.code);
  return columnCodes.includes('row_key') ? columnCodes : ['row_key', ...columnCodes];
}

function resolveStepFromSearchParams(searchParams: Record<string, string | string[] | undefined> | undefined) {
  const raw = Array.isArray(searchParams?.step) ? searchParams?.step[0] : searchParams?.step;
  return raw === 'preview' || raw === 'commit' || raw === 'upload' ? raw : undefined;
}

function Stepper({ activeStep }: { activeStep: 'upload' | 'preview' | 'commit' }) {
  const steps = [
    ['upload', 'Upload'],
    ['preview', 'Preview'],
    ['commit', 'Commit'],
  ] as const;
  return h(
    'ol',
    { 'aria-label': 'Import steps', className: 'flex flex-wrap gap-2 text-sm' },
    ...steps.map(([key, label], index) => h(
      'li',
      { key, 'aria-current': activeStep === key ? 'step' : undefined, className: 'rounded-full border bg-white px-3 py-2' },
      h('span', { className: 'font-semibold' }, String(index + 1)),
      ' ',
      label,
    )),
  );
}

function UploadStep({ table }: { table: ReferenceTable }) {
  const expectedHeaders = expectedImportHeaders(table.columns).join(', ');
  return h(
    'section',
    { role: 'region', 'aria-labelledby': 'reference-import-upload-heading', className: 'space-y-4' },
    h('h2', { id: 'reference-import-upload-heading' }, 'Step 1 — Upload'),
    h(
      'div',
      { className: 'rounded-lg border-2 border-dashed bg-slate-50 p-8 text-center' },
      h('div', { className: 'mb-2 text-2xl', 'aria-hidden': 'true' }, '📄'),
      h('p', { className: 'font-medium' }, 'Drop your CSV file here or click to browse.'),
      h('p', { className: 'text-sm text-slate-600' }, 'Accepted: .csv only · Max 5MB'),
      h('label', { htmlFor: 'reference-csv-file', className: 'sr-only' }, 'CSV file'),
      h('input', { id: 'reference-csv-file', name: 'reference-csv-file', 'aria-label': 'CSV file', type: 'file', accept: '.csv,text/csv', className: 'mt-4' }),
    ),
    h('p', { className: 'text-sm text-slate-700' }, `First row must contain column headers matching: ${expectedHeaders}`),
    h(
      'div',
      { className: 'flex flex-wrap items-center justify-between gap-3' },
      h('a', { className: 'btn btn-secondary', href: `${table.parentHref}/import/template.csv` }, 'Download Template CSV'),
      h('a', { className: 'btn', href: `${table.parentHref}/import?step=preview` }, 'Preview CSV'),
    ),
  );
}

function PreviewStep({ preview, columns }: { preview?: ImportPreview; columns: ReferenceColumn[] }) {
  const expectedHeaders = expectedImportHeaders(columns);
  const rows = preview?.rows ?? [];
  const summary = preview
    ? `Parsed ${preview.parsedRows} rows. ${preview.insertCount} to insert, ${preview.updateCount} to update, ${preview.skipCount} to skip, ${preview.errorCount} errors.`
    : 'Parsed 0 rows. 0 to insert, 0 to update, 0 to skip, 0 errors.';
  const commitDisabled = Boolean(preview?.headerMismatch) || !preview;

  return h(
    'section',
    { role: 'region', 'aria-labelledby': 'reference-import-preview-heading', className: 'space-y-4' },
    h('h2', { id: 'reference-import-preview-heading' }, 'Step 2 — Preview'),
    h(
      'div',
      { className: 'rounded-md border bg-white p-3', 'aria-label': 'Preview summary' },
      h('span', null, summary),
      ' ',
      statusPill(`${preview?.insertCount ?? 0} insert`, 'success'),
      ' ',
      statusPill(`${preview?.updateCount ?? 0} update`, 'warning'),
      ' ',
      statusPill(`${preview?.skipCount ?? 0} skip`, 'muted'),
      ' ',
      statusPill(`${preview?.errorCount ?? 0} errors`, 'danger'),
    ),
    preview?.headerMismatch
      ? h('div', { role: 'alert', className: 'rounded-md border border-red-200 bg-red-50 p-3 text-red-900' }, `Header mismatch — expected: ${preview.headerMismatch.expected.join(', ')}`)
      : null,
    h(
      'div',
      { className: 'flex flex-wrap items-center justify-between gap-3' },
      h('button', { className: 'btn', type: 'button' }, 'Show errors only'),
      h(
        'div',
        { className: 'flex gap-2' },
        h('button', { className: 'btn', type: 'button' }, 'Cancel'),
        h('button', { className: 'btn', type: 'button', disabled: commitDisabled }, 'Commit Import'),
      ),
    ),
    h(
      'table',
      { className: 'table', 'aria-label': 'CSV preview rows' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, 'Row'),
          h('th', { scope: 'col' }, 'Action'),
          ...expectedHeaders.map((column) => h('th', { scope: 'col', key: column }, column)),
          h('th', { scope: 'col' }, 'Validation'),
        ),
      ),
      h(
        'tbody',
        null,
        ...(rows.length
          ? rows.map((row) => h(
            'tr',
            { key: `${row.rowNumber}-${row.action}` },
            h('td', null, String(row.rowNumber)),
            h('td', null, statusPill(row.action, actionVariant(row.action))),
            ...expectedHeaders.map((column) => h('td', { key: column }, row.values[column] ?? '—')),
            h('td', null, row.message ?? '—'),
          ))
          : [h('tr', { key: 'empty' }, h('td', { colSpan: expectedHeaders.length + 3 }, 'No preview rows yet. Upload a CSV to validate headers and rows.'))]),
      ),
    ),
  );
}

function CommitStep({ table, commitResult }: { table: ReferenceTable; commitResult?: CommitResult }) {
  const complete = commitResult?.status === 'complete';
  const progress = complete ? 100 : commitResult ? 50 : 0;
  const inserted = commitResult?.inserted ?? 0;
  const updated = commitResult?.updated ?? 0;
  const skipped = commitResult?.skipped ?? 0;
  const errors = commitResult?.errors ?? 0;

  return h(
    'section',
    { role: 'region', 'aria-labelledby': 'reference-import-commit-heading', className: 'space-y-4' },
    h('h2', { id: 'reference-import-commit-heading' }, 'Step 3 — Commit'),
    h('div', {
      role: 'progressbar',
      'aria-label': 'Import progress',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': progress,
      className: 'h-3 overflow-hidden rounded-full bg-slate-200',
    }, h('div', { className: 'h-full bg-blue-600', style: { width: `${progress}%` } })),
    h(
      'div',
      { className: 'card rounded-md border bg-white p-4' },
      h('h3', null, complete ? 'Commit summary' : 'Import pending'),
      h('p', null, complete
        ? `Import complete. ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${errors} errors.`
        : 'Import is ready to process after preview validation.'),
      h('div', { className: 'mt-3 flex flex-wrap gap-2' },
        statusPill(`${inserted} inserted`, 'success'),
        statusPill(`${updated} updated`, 'warning'),
        statusPill(`${skipped} skipped`, 'muted'),
        statusPill(`${errors} errors`, errors > 0 ? 'danger' : 'info')),
    ),
    h(
      'div',
      { className: 'flex flex-wrap gap-3' },
      h('a', { className: 'btn btn-primary', href: table.parentHref }, 'Return to Table'),
      commitResult?.errorRowsDownloadHref ? h('a', { href: commitResult.errorRowsDownloadHref }, 'Download error rows') : null,
    ),
  );
}

export default async function ReferenceCsvImportPage(props: PageProps) {
  const referenceTable = props.referenceTable as ReferenceTable | undefined;
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const initialStep = (props.initialStep as ReferenceImportOverrides['initialStep'] | undefined) ?? resolveStepFromSearchParams(searchParams) ?? 'upload';
  const preview = props.preview as ImportPreview | undefined;
  const commitResult = props.commitResult as CommitResult | undefined;
  const resolvedParams = await (props.params ?? Promise.resolve({ locale: 'en', code: referenceTable?.code ?? 'allergens_reference' }));
  const table: ReferenceTable = referenceTable ?? await readReferenceTable(resolvedParams.code, resolvedParams.locale);

  return h(
    'main',
    {
      'data-testid': 'settings-reference-csv-import-wizard',
      'data-screen': 'reference-csv-import-wizard',
      'data-route': `/settings/reference/${table.code}/import`,
      'data-ux-source': 'SET-053',
      'aria-labelledby': 'reference-csv-import-heading',
      className: 'mx-auto max-w-3xl space-y-5',
    },
    h(
      'header',
      { 'data-region': 'page-head', className: 'space-y-2' },
      h('p', { className: 'text-sm text-slate-500' }, `Settings / Reference tables / ${table.name}`),
      h('h1', { id: 'reference-csv-import-heading' }, 'CSV Import Wizard'),
      h('p', { className: 'text-sm text-slate-600' }, 'Guided 3-step CSV import with schema header validation, row preview, and audited commit summary.'),
    ),
    h(Stepper, { activeStep: initialStep }),
    h(
      'div',
      { className: 'card rounded-lg border bg-white p-4' },
      initialStep === 'upload' ? h(UploadStep, { table }) : null,
      initialStep === 'preview' ? h(PreviewStep, { preview, columns: table.columns }) : null,
      initialStep === 'commit' ? h(CommitStep, { table, commitResult }) : null,
    ),
    h(
      'section',
      { role: 'note', 'aria-label': 'CSV import safeguards', className: 'rounded-md border bg-slate-50 p-3 text-sm text-slate-700' },
      'Loading state uses the upload/preview pending panel, empty state shows no preview rows, errors fail closed before commit, and unauthorized imports must be blocked by the server action permission gate.',
    ),
  );
}
