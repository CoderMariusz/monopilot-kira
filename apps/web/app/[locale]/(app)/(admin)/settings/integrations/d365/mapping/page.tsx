import React from 'react';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

type D365Direction = 'incoming' | 'outgoing' | 'both';
type D365Filter = 'all' | D365Direction;

type D365FieldMapping = {
  d365_field: string;
  direction: D365Direction;
  monopilot_field: string;
  type: string;
  transform: string;
  unmapped?: boolean;
};

type ExportD365MappingCsv = (input?: { dir?: D365Filter; rows?: D365FieldMapping[] }) => Response | Promise<Response>;

type D365MappingPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ dir?: D365Filter }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  rows?: D365FieldMapping[];
  exportD365MappingCsv?: ExportD365MappingCsv;
};

type D365MappingLabels = {
  title: string;
  subtitle: string;
  exportCsv: string;
  testConnection: string;
  changeNotice: string;
  unmappedAlert: string;
  all: string;
  incoming: string;
  outgoing: string;
  d365Field: string;
  direction: string;
  monopilotField: string;
  type: string;
  transform: string;
  loading: string;
  empty: string;
  error: string;
  exportReady: string;
};

const prototypeSource = 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:109-146';
const route = '/settings/integrations/d365/mapping';

const fallbackRows: D365FieldMapping[] = [
  {
    d365_field: 'InventTable.ItemId',
    direction: 'incoming',
    monopilot_field: 'products.sku',
    type: 'text',
    transform: 'none',
  },
  {
    d365_field: 'VendTable.CurrencyCode',
    direction: 'incoming',
    monopilot_field: 'partners.currency',
    type: 'enum',
    transform: 'upper',
  },
  {
    d365_field: 'SalesTable.SalesId',
    direction: 'outgoing',
    monopilot_field: 'planning.d365_so_ref',
    type: 'text',
    transform: 'prefix:SO-',
  },
  {
    d365_field: 'Item.allergens[]',
    direction: 'outgoing',
    monopilot_field: 'products.allergens',
    type: 'json',
    transform: 'unmapped',
    unmapped: true,
  },
];

function label(fullKey: string, translated: string, fallback: string) {
  return translated && translated !== fullKey ? translated : fallback;
}

async function labelsFor(): Promise<D365MappingLabels> {
  const t = await getTranslations('settings.d365Mapping');
  return {
    title: label('title', t('title'), 'D365 field mapping'),
    subtitle: label('subtitle', t('subtitle'), 'How D365 entity fields map to Monopilot tables.'),
    exportCsv: label('exportCsv', t('exportCsv'), 'Export mapping CSV'),
    testConnection: label('testConnection', t('testConnection'), 'Test connection'),
    changeNotice: label(
      'changeNotice',
      t('changeNotice'),
      'Mapping is deployed via CI/CD. To change a mapping, raise a PR in the monopilot/integrations-d365 repo.',
    ),
    unmappedAlert: label('unmappedAlert', t('unmappedAlert'), 'Item.allergens[] is unmapped in D365 field mapping.'),
    all: label('all', t('all'), 'All ({count})'),
    incoming: label('incoming', t('incoming'), 'D365 → Monopilot ({count})'),
    outgoing: label('outgoing', t('outgoing'), 'Monopilot → D365 ({count})'),
    d365Field: label('d365Field', t('d365Field'), 'D365 field'),
    direction: label('direction', t('direction'), 'Direction'),
    monopilotField: label('monopilotField', t('monopilotField'), 'Monopilot field'),
    type: label('type', t('type'), 'Type'),
    transform: label('transform', t('transform'), 'Transform'),
    loading: label('loading', t('loading'), 'Loading D365 field mapping…'),
    empty: label('empty', t('empty'), 'No D365 field mappings found.'),
    error: label('error', t('error'), 'Unable to load D365 field mapping.'),
    exportReady: label('exportReady', t('exportReady'), 'CSV export ready'),
  };
}

function formatTemplate(template: string, count: number) {
  return template.replace(/\{count\}/g, String(count));
}

function displayDirection(direction: D365Direction) {
  if (direction === 'incoming') return 'D365 → Monopilot';
  if (direction === 'outgoing') return 'Monopilot → D365';
  return 'Bidirectional';
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
  const rows = filteredRows(input.rows ?? fallbackRows, dir);
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

function Shell({ children, dir, busy = false }: { children: React.ReactNode; dir: D365Filter; busy?: boolean }) {
  return (
    <main
      data-testid="settings-d365-mapping-screen"
      data-screen="d365_mapping_screen"
      data-route={route}
      data-dir={dir}
      data-prototype-source={prototypeSource}
      aria-busy={busy || undefined}
      className="settings-page settings-page--d365-mapping space-y-4 p-6"
    >
      {children}
    </main>
  );
}

function PageHead({
  labels,
  onExport,
  onTest,
  exportDisabled = false,
}: {
  labels: D365MappingLabels;
  onExport?: () => void;
  onTest?: () => void;
  exportDisabled?: boolean;
}) {
  return (
    <header data-region="page-head" className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="text-sm text-slate-600">{labels.subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" className="btn-secondary" onClick={onExport} disabled={exportDisabled}>
          {labels.exportCsv}
        </Button>
        <Button type="button" className="btn-secondary" data-modal-trigger="d365Test" onClick={onTest}>
          {labels.testConnection}
        </Button>
      </div>
    </header>
  );
}

function StateView({ labels, state, dir }: { labels: D365MappingLabels; state: 'loading' | 'empty' | 'error'; dir: D365Filter }) {
  return (
    <Shell dir={dir} busy={state === 'loading'}>
      <PageHead labels={labels} exportDisabled />
      <Card className={state === 'error' ? 'border-red-200 bg-red-50' : 'bg-white'}>
        <CardContent className="p-4">
          {state === 'error' ? (
            <p role="alert" className="text-sm font-medium text-red-900">
              {labels.error}
            </p>
          ) : state === 'loading' ? (
            <p data-testid="settings-d365-mapping-loading" role="status" className="text-sm text-slate-700">
              {labels.loading}
            </p>
          ) : (
            <p role="status" className="text-sm text-slate-700">
              {labels.empty}
            </p>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function DirectionFilters({ labels, rows, dir }: { labels: D365MappingLabels; rows: D365FieldMapping[]; dir: D365Filter }) {
  const incoming = rows.filter((row) => row.direction === 'incoming').length;
  const outgoing = rows.filter((row) => row.direction === 'outgoing').length;
  const items: Array<{ key: D365Filter; text: string }> = [
    { key: 'all', text: formatTemplate(labels.all, rows.length) },
    { key: 'incoming', text: formatTemplate(labels.incoming, incoming) },
    { key: 'outgoing', text: formatTemplate(labels.outgoing, outgoing) },
  ];

  function onSelect(next: D365Filter) {
    const suffix = next === 'all' ? '' : `?dir=${next}`;
    if (typeof window !== 'undefined') window.location.href = `/en${route}${suffix}`;
  }

  return (
    <nav data-region="direction-filter" aria-label="D365 mapping direction" className="mb-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <Button
          key={item.key}
          type="button"
          className={dir === item.key ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          aria-pressed={dir === item.key}
          onClick={() => onSelect(item.key)}
        >
          {item.text}
        </Button>
      ))}
    </nav>
  );
}

function TestConnectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const titleId = 'settings-d365-mapping-test-title';

  React.useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-modal-id="SM-08"
      data-slot="dialog-content"
      className="modal modal--sm rounded-md border bg-white p-4 shadow-lg"
    >
      <h2 id={titleId} className="text-base font-semibold">
        D365 test connection
      </h2>
      <p className="mt-2 text-sm text-slate-700">Endpoint, Azure AD, and mapping export checks are read-only on SET-081.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" className="btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>
    </div>
  );
}

function MappingScreen({
  labels,
  rows,
  dir,
  exportAction,
}: {
  labels: D365MappingLabels;
  rows: D365FieldMapping[];
  dir: D365Filter;
  exportAction: ExportD365MappingCsv;
}) {
  const visibleRows = filteredRows(rows, dir);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [exportStatus, setExportStatus] = React.useState<string | null>(null);

  async function onExport() {
    const input = exportAction === exportD365MappingCsv ? { dir, rows } : { dir };
    const response = await exportAction(input);
    const disposition = response.headers.get('Content-Disposition') ?? 'd365-field-mapping.csv';
    setExportStatus(response.ok ? `${labels.exportReady}: ${disposition}` : 'CSV export failed');
  }

  return (
    <Shell dir={dir}>
      <PageHead labels={labels} onExport={onExport} onTest={() => setDialogOpen(true)} />
      <div data-region="mapping-guidance" role="alert" className="alert alert-blue rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-950">
        <span>{labels.changeNotice}</span>
        {rows.some((row) => row.unmapped) ? <span> {labels.unmappedAlert}</span> : null}
      </div>
      <DirectionFilters labels={labels} rows={rows} dir={dir} />
      {exportStatus ? (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {exportStatus}
        </div>
      ) : null}
      <section data-region="field-level-map" aria-labelledby="settings-d365-field-level-map-title">
        <Card className="sg-section bg-white">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle id="settings-d365-field-level-map-title" className="text-base font-semibold">
              Field-level map
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-0">
            <Table aria-label="Field-level map">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.d365Field}</TableHead>
                  <TableHead scope="col">{labels.direction}</TableHead>
                  <TableHead scope="col">{labels.monopilotField}</TableHead>
                  <TableHead scope="col">{labels.type}</TableHead>
                  <TableHead scope="col">{labels.transform}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={`${row.d365_field}:${row.monopilot_field}`} data-testid="settings-d365-mapping-row">
                    <TableCell className="mono text-xs">{row.d365_field}</TableCell>
                    <TableCell className="mono muted text-xs">{displayDirection(row.direction)}</TableCell>
                    <TableCell className="mono text-xs font-semibold">{row.monopilot_field}</TableCell>
                    <TableCell>
                      <Badge variant="muted" className="text-[10px]">
                        {row.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="mono muted text-xs">{row.transform}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
      <TestConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Shell>
  );
}

export default async function D365MappingPage(propsInput: unknown) {
  const {
    searchParams,
    state = 'ready',
    rows = fallbackRows,
    exportD365MappingCsv: exportAction = exportD365MappingCsv,
  } = (propsInput ?? {}) as D365MappingPageProps;
  const labels = await labelsFor();
  const params = await searchParams;
  const dir = params?.dir ?? 'all';

  if (state === 'loading' || state === 'empty' || state === 'error') {
    return <StateView labels={labels} state={state} dir={dir} />;
  }

  if (rows.length === 0) {
    return <StateView labels={labels} state="empty" dir={dir} />;
  }

  return <MappingScreen labels={labels} rows={rows} dir={dir} exportAction={exportAction} />;
}
