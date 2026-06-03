import React from 'react';
import { getTranslations } from 'next-intl/server';

import { ImportWizard, type ImportWizardProps, type InjectedPreview, type InjectedCommit } from './import-wizard.client';
import { previewImportAction } from './_actions/previewImport';
import { commitImportAction } from './_actions/commitImport';

export const dynamic = 'force-dynamic';

type ReferenceColumn = {
  code: string;
  label: string;
  required?: boolean;
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
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
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

// REAL Supabase read (T-022 pattern): reference_schemas columns under
// app.current_org_id() RLS via withOrgContext. Kept intact per the audit
// finding (readReferenceTable was already real); only the commit pipeline was
// dead and is now wired below to previewImportAction / commitImportAction.
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

function expectedImportHeaders(columns: ReferenceColumn[]) {
  const columnCodes = columns.map((column) => column.code);
  return columnCodes.includes('row_key') ? columnCodes : ['row_key', ...columnCodes];
}

function resolveStepFromSearchParams(searchParams: Record<string, string | string[] | undefined> | undefined) {
  const raw = Array.isArray(searchParams?.step) ? searchParams?.step[0] : searchParams?.step;
  return raw === 'preview' || raw === 'commit' || raw === 'upload' ? raw : undefined;
}

export default async function ReferenceCsvImportPage(props: PageProps) {
  const referenceTable = props.referenceTable as ReferenceTable | undefined;
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const initialStep =
    (props.initialStep as ImportWizardProps['initialStep'] | undefined) ?? resolveStepFromSearchParams(searchParams) ?? 'upload';
  const preview = props.preview as InjectedPreview | undefined;
  const commitResult = props.commitResult as InjectedCommit | undefined;
  const resolvedParams = await (props.params ?? Promise.resolve({ locale: 'en', code: referenceTable?.code ?? 'allergens_reference' }));
  const table: ReferenceTable = referenceTable ?? (await readReferenceTable(resolvedParams.code, resolvedParams.locale));
  const expectedHeaders = expectedImportHeaders(table.columns);

  const t = await getTranslations('settings');
  // next-intl returns the resolved string when a key exists; when missing, both
  // the real provider and the test mock echo a key form. Treat a returned value
  // that equals either the namespaced (`settings.reference.import.<key>`) or the
  // relative (`reference.import.<key>`) key as "unresolved" and fall back.
  const tr = (key: string, fallback: string) => {
    const relativeKey = `reference.import.${key}`;
    const resolved = t(relativeKey);
    if (resolved === relativeKey || resolved === `settings.${relativeKey}`) return fallback;
    return resolved;
  };

  const labels: ImportWizardProps['labels'] = {
    title: tr('title', 'CSV Import Wizard'),
    subtitle: tr('subtitle', 'Guided 3-step CSV import with schema header validation, row preview, and audited commit summary.'),
    dropzone: tr('dropzone', 'Drop your CSV file here or click to browse.'),
    downloadTemplate: tr('downloadTemplate', 'Download Template CSV'),
    previewCta: tr('previewCta', 'Preview CSV'),
    accepted: tr('accepted', 'Accepted: .csv only · Max 5MB'),
    headerGuidance: tr('headerGuidance', 'First row must contain column headers matching:'),
    stepUpload: tr('stepUpload', 'Step 1 — Upload'),
    stepPreview: tr('stepPreview', 'Step 2 — Preview'),
    stepCommit: tr('stepCommit', 'Step 3 — Commit'),
    stepperUpload: tr('stepperUpload', 'Upload'),
    stepperPreview: tr('stepperPreview', 'Preview'),
    stepperCommit: tr('stepperCommit', 'Commit'),
    uploading: tr('uploading', 'Validating CSV…'),
    committing: tr('committing', 'Committing…'),
    commitImport: tr('commitImport', 'Commit Import'),
    cancel: tr('cancel', 'Cancel'),
    showErrorsOnly: tr('showErrorsOnly', 'Show errors only'),
    showAll: tr('showAll', 'Show all'),
    returnToTable: tr('returnToTable', 'Return to Table'),
    downloadErrorRows: tr('downloadErrorRows', 'Download error rows'),
    importComplete: tr('importComplete', 'Import complete.'),
    importPending: tr('importPending', 'Import is ready to process after preview validation.'),
    commitSummary: tr('commitSummary', 'Commit summary'),
    headerMismatchPrefix: tr('headerMismatchPrefix', 'Header mismatch — expected: '),
    emptyRows: tr('emptyRows', 'No preview rows yet. Upload a CSV to validate headers and rows.'),
    errorForbidden: tr('errorForbidden', 'You do not have permission to import reference data.'),
    errorGeneric: tr('errorGeneric', 'The CSV could not be processed. Check the file and try again.'),
    colRow: tr('colRow', 'Row'),
    colAction: tr('colAction', 'Action'),
    colValidation: tr('colValidation', 'Validation'),
    insertLabel: tr('insertLabel', 'insert'),
    updateLabel: tr('updateLabel', 'update'),
    skipLabel: tr('skipLabel', 'skip'),
    errorsLabel: tr('errorsLabel', 'errors'),
    parsedSummary: tr('parsedSummary', 'Parsed'),
    completeSummary: tr('completeSummary', 'Import complete.'),
    safeguards: tr(
      'safeguards',
      'Loading state uses the upload/preview pending panel, empty state shows no preview rows, errors fail closed before commit, and unauthorized imports are blocked by the server action permission gate.',
    ),
    breadcrumb: tr('breadcrumb', 'Settings / Reference tables /'),
  };

  return h(ImportWizard, {
    table,
    labels,
    expectedHeaders,
    previewAction: previewImportAction,
    commitAction: commitImportAction,
    initialStep,
    preview,
    commitResult,
  });
}
