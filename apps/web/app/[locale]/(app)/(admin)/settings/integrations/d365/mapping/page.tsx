import { getTranslations } from 'next-intl/server';

import { getD365FieldMapping } from '../../../../../../../../actions/d365/get-field-mapping';
import { D365_FIELD_MAPPING_MANIFEST } from '../../../../../../../../actions/d365/field-mapping-manifest';
import D365MappingScreen from './mapping-screen.client';

export type D365Direction = 'incoming' | 'outgoing' | 'both';
export type D365Filter = 'all' | D365Direction;

export type D365FieldMapping = {
  d365_field: string;
  direction: D365Direction;
  monopilot_field: string;
  type: string;
  transform: string;
  unmapped?: boolean;
};

export type ExportD365MappingCsv = (input?: { dir?: D365Filter; rows?: D365FieldMapping[] }) => Response | Promise<Response>;

export type D365MappingPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ dir?: D365Filter }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  rows?: D365FieldMapping[];
  exportD365MappingCsv?: ExportD365MappingCsv;
  testD365Connection?: () => Promise<{ status: 'ok'; latencyMs: number; environment: string } | { status: 'error'; reason: string }>;
};

export type D365MappingLabels = {
  title: string;
  subtitle: string;
  exportCsv: string;
  testConnection: string;
  changeNotice: string;
  unmappedAlert: string;
  all: string;
  incoming: string;
  outgoing: string;
  directionFilterLabel: string;
  fieldLevelMap: string;
  d365Field: string;
  direction: string;
  monopilotField: string;
  type: string;
  transform: string;
  loading: string;
  empty: string;
  error: string;
  exportReady: string;
  exportFailed: string;
  testConnectionDialogTitle: string;
  testConnectionDialogBody: string;
  close: string;
};

// CI/CD-deployed D365 field map (source of truth in actions/d365/field-mapping-manifest.ts).
// The read-only route renders per-org reference_tables overrides when present and falls
// back to this manifest. These rows are product configuration (the R15 anti-corruption
// field map), not illustrative prototype mock data.
const DEFAULT_MAPPING_ROWS: D365FieldMapping[] = D365_FIELD_MAPPING_MANIFEST.map((row) => ({ ...row }));

function label(fullKey: string, translated: string, fallback: string) {
  return translated && translated !== fullKey && !translated.endsWith(`.${fullKey}`) ? translated : fallback;
}

function safeLabel(t: ((key: string) => string) & { raw?: (key: string) => unknown }, key: string, fallback: string) {
  try {
    const raw = typeof t.raw === 'function' ? t.raw(key) : null;
    if (typeof raw === 'string') return label(key, raw, fallback);
    return label(key, t(key), fallback);
  } catch {
    return fallback;
  }
}

async function labelsFor(): Promise<D365MappingLabels> {
  const t = await getTranslations('settings.d365Mapping');
  return {
    title: safeLabel(t, 'title', 'D365 field mapping'),
    subtitle: safeLabel(t, 'subtitle', 'How D365 entity fields map to Monopilot tables.'),
    exportCsv: safeLabel(t, 'exportCsv', 'Export mapping CSV'),
    testConnection: safeLabel(t, 'testConnection', 'Test connection'),
    changeNotice: safeLabel(
      t,
      'changeNotice',
      'Mapping is deployed via CI/CD. To change a mapping, raise a PR in the monopilot/integrations-d365 repo.',
    ),
    unmappedAlert: safeLabel(t, 'unmappedAlert', 'Item.allergens[] is unmapped in D365 field mapping.'),
    all: safeLabel(t, 'all', 'All ({count})'),
    incoming: safeLabel(t, 'incoming', 'D365 → Monopilot ({count})'),
    outgoing: safeLabel(t, 'outgoing', 'Monopilot → D365 ({count})'),
    directionFilterLabel: safeLabel(t, 'directionFilterLabel', 'D365 mapping direction'),
    fieldLevelMap: safeLabel(t, 'fieldLevelMap', 'Field-level map'),
    d365Field: safeLabel(t, 'd365Field', 'D365 field'),
    direction: safeLabel(t, 'direction', 'Direction'),
    monopilotField: safeLabel(t, 'monopilotField', 'Monopilot field'),
    type: safeLabel(t, 'type', 'Type'),
    transform: safeLabel(t, 'transform', 'Transform'),
    loading: safeLabel(t, 'loading', 'Loading D365 field mapping…'),
    empty: safeLabel(t, 'empty', 'No D365 field mappings found.'),
    error: safeLabel(t, 'error', 'Unable to load D365 field mapping.'),
    exportReady: safeLabel(t, 'exportReady', 'CSV export ready'),
    exportFailed: safeLabel(t, 'exportFailed', 'CSV export failed'),
    testConnectionDialogTitle: safeLabel(t, 'testConnectionDialogTitle', 'D365 test connection'),
    testConnectionDialogBody: safeLabel(
      t,
      'testConnectionDialogBody',
      'Endpoint, Azure AD, and mapping export checks are read-only on SET-081.',
    ),
    close: safeLabel(t, 'close', 'Close'),
  };
}

function filteredRows(rows: D365FieldMapping[], dir: D365Filter) {
  return dir === 'all' ? rows : rows.filter((row) => row.direction === dir);
}

function csvEscape(value: unknown) {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function exportD365MappingCsv(input: { dir?: D365Filter; rows?: D365FieldMapping[] } = {}) {
  'use server';

  const dir = input.dir ?? 'all';
  const rows = filteredRows(input.rows ?? DEFAULT_MAPPING_ROWS, dir);
  const header = ['d365_field', 'direction', 'monopilot_field', 'type', 'transform'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [row.d365_field, row.direction, row.monopilot_field, row.type, row.transform].map(csvEscape).join(','),
    ),
  ];

  return new Response(`${lines.join('\n')}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="d365-field-mapping.csv"',
    },
  });
}

export default async function D365MappingPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as D365MappingPageProps;
  const {
    params,
    searchParams,
    state = 'ready',
    rows = DEFAULT_MAPPING_ROWS,
    exportD365MappingCsv: exportAction = exportD365MappingCsv,
    testD365Connection,
  } = props;
  const labels = await labelsFor();
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const dir = resolvedSearchParams?.dir ?? 'all';
  const locale = resolvedParams?.locale ?? 'en';

  // Real data: tests inject `rows` for deterministic rendering; the production
  // route reads the org's mapping (reference_tables overrides → CI/CD manifest).
  const rowsInjected = Object.prototype.hasOwnProperty.call(props, 'rows');
  let resolvedRows = rows;
  let resolvedState = state;
  if (!rowsInjected && state === 'ready') {
    const result = await getD365FieldMapping();
    if (result.ok) resolvedRows = result.data;
    else if (result.error === 'persistence_failed') resolvedState = 'error';
    // 'forbidden' → render the empty/manifest table; route-level RBAC owns access.
  }

  return (
    <D365MappingScreen
      labels={labels}
      rows={resolvedRows}
      dir={dir}
      locale={locale}
      state={resolvedState}
      exportAction={exportAction}
      testD365Connection={testD365Connection}
      includeRowsInExport={exportAction === exportD365MappingCsv}
    />
  );
}
