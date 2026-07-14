'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Modal from '@monopilot/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';
import D365TestConnectionModal, {
  type D365ConnectionResult,
} from '../../../../../../../../components/settings/modals/d365-test-connection-modal';

import type { D365FieldMapping, D365Filter, D365Direction, D365MappingLabels, ExportD365MappingCsv } from './mapping-types';

const prototypeSource = 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:109-146';
const route = '/settings/integrations/d365/mapping';

type D365MappingScreenProps = {
  labels: D365MappingLabels;
  rows: D365FieldMapping[];
  dir: D365Filter;
  locale: string;
  state: 'ready' | 'loading' | 'empty' | 'error';
  exportAction: ExportD365MappingCsv;
  testD365Connection?: () => Promise<D365ConnectionResult>;
  includeRowsInExport?: boolean;
};

function formatTemplate(template: string, count: number) {
  return template.replace(/\{count\}/g, String(count));
}

// ponytail: R15 export-only — UI never advertises D365→Monopilot import
function displayDirection(_direction: D365Direction) {
  return 'Monopilot → D365';
}

function filteredRows(rows: D365FieldMapping[], dir: D365Filter) {
  return dir === 'all' ? rows : rows.filter((row) => row.direction === dir);
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
        <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
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
      {state === 'error' ? (
        <div role="alert" className="alert alert-red">
          {labels.error}
        </div>
      ) : state === 'loading' ? (
        <Card className="bg-white">
          <CardContent className="p-4">
            <p data-testid="settings-d365-mapping-loading" role="status" className="text-sm text-muted-foreground">
              {labels.loading}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-white">
          <CardContent className="p-4">
            <p role="status" className="text-sm text-muted-foreground">
              {labels.empty}
            </p>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}

function DirectionFilters({
  labels,
  rows,
  dir,
  locale,
}: {
  labels: D365MappingLabels;
  rows: D365FieldMapping[];
  dir: D365Filter;
  locale: string;
}) {
  const outgoing = rows.filter((row) => row.direction === 'outgoing').length;
  // R15: no "incoming" filter — that label implied unsupported import
  const items: Array<{ key: D365Filter; text: string }> = [
    { key: 'all', text: formatTemplate(labels.all, rows.length) },
    { key: 'outgoing', text: formatTemplate(labels.outgoing, outgoing) },
  ];

  function onSelect(next: D365Filter) {
    const suffix = next === 'all' ? '' : `?dir=${next}`;
    window.location.href = `/${locale}${route}${suffix}`;
  }

  return (
    <nav data-region="direction-filter" aria-label={labels.directionFilterLabel} className="mb-2 flex flex-wrap gap-2">
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

function TestConnectionDialog({
  labels,
  open,
  onOpenChange,
  testD365Connection,
}: {
  labels: D365MappingLabels;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testD365Connection?: () => Promise<D365ConnectionResult>;
}) {
  if (!open) return null;

  return (
    <D365TestConnectionModal
      key="SM-08-mapping-open"
      defaultOpen
      environmentUrl="configured D365 endpoint"
      testConnection={testD365Connection ?? (async () => ({ status: 'error', reason: 'ERR_D365_CONNECTION_UNAVAILABLE' }))}
      onOpenChange={onOpenChange}
      title={`${labels.testConnectionDialogTitle} — ${labels.testConnection}`}
      description={labels.testConnectionDialogBody}
      closeLabel={labels.close}
      cancelLabel={labels.close}
      retryLabel="Retry"
      triggerLabel={labels.testConnection}
      useModalPrimitive
    />
  );
}

export default function D365MappingScreen({
  labels,
  rows,
  dir,
  locale,
  state,
  exportAction,
  testD365Connection,
  includeRowsInExport = false,
}: D365MappingScreenProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [exportStatus, setExportStatus] = React.useState<string | null>(null);

  if (state === 'loading' || state === 'empty' || state === 'error') {
    return <StateView labels={labels} state={state as 'loading' | 'empty' | 'error'} dir={dir} />;
  }

  if (rows.length === 0) {
    return <StateView labels={labels} state="empty" dir={dir} />;
  }

  const visibleRows = filteredRows(rows, dir);

  async function onExport() {
    const response = await exportAction(includeRowsInExport ? { dir, rows } : { dir });
    const disposition = response.headers.get('Content-Disposition') ?? 'd365-field-mapping.csv';
    setExportStatus(response.ok ? `${labels.exportReady}: ${disposition}` : labels.exportFailed);
  }

  const hasUnmappedAllergens = rows.some((row) => row.unmapped);
  const guidanceClassName = hasUnmappedAllergens ? 'alert alert-red text-xs' : 'alert alert-blue text-xs';

  return (
    <Shell dir={dir}>
      <PageHead labels={labels} onExport={onExport} onTest={() => setDialogOpen(true)} />
      <div data-region="mapping-guidance" role="alert" className={guidanceClassName}>
        <span>{labels.changeNotice}</span>
        {hasUnmappedAllergens ? <span> {labels.unmappedAlert}</span> : null}
      </div>
      <DirectionFilters labels={labels} rows={rows} dir={dir} locale={locale} />
      {exportStatus ? (
        <div role="status" className="alert alert-green">
          {exportStatus}
        </div>
      ) : null}
      <section data-region="field-level-map" aria-labelledby="settings-d365-field-level-map-title">
        <Card className="sg-section bg-white">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle id="settings-d365-field-level-map-title" className="text-base font-semibold">
              {labels.fieldLevelMap}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-0">
            <Table aria-label={labels.fieldLevelMap}>
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
      <TestConnectionDialog
        labels={labels}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        testD365Connection={testD365Connection}
      />
    </Shell>
  );
}
