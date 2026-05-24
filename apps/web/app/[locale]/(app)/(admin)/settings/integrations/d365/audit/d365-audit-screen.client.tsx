'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { PageHeader } from '@monopilot/ui/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type D365SyncStatus = 'ok' | 'partial' | 'failed';
export type D365SyncDirection = 'pull' | 'push';
export type CallerRole = 'owner' | 'admin' | 'planner' | 'viewer';
export type PageState = 'ready' | 'loading' | 'empty' | 'error';
export type PageSearchParams = Record<string, string | string[] | undefined>;

export type D365SyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  direction: D365SyncDirection;
  status: D365SyncStatus;
  entity_type?: string;
  source?: string;
  rows_in?: number;
  rows_ok?: number;
  rows_failed?: number;
  records_in?: number;
  records_out?: number;
  error_summary?: string | null;
  errors: unknown[];
};

export type D365AuditLabels = {
  title: string;
  subtitle: string;
  runNow: string;
  ownerRequired: string;
  filters: string;
  status: string;
  direction: string;
  startDate: string;
  endDate: string;
  allStatuses: string;
  allDirections: string;
  syncRuns: string;
  startedAt: string;
  finishedAt: string;
  entityType: string;
  rowsIn: string;
  rowsOk: string;
  rowsFailed: string;
  errorSummary: string;
  errors: string;
  actions: string;
  viewErrors: string;
  noErrors: string;
  close: string;
  loading: string;
  empty: string;
  error: string;
  count: string;
  notAvailable: string;
  errorsTitle: string;
};

export type D365AuditScreenProps = {
  callerRole: CallerRole;
  labels: D365AuditLabels;
  runs: D365SyncRun[];
  runSyncNow?: () => Promise<{ ok: true } | { ok: false; message: string }>;
  state: PageState;
  initialSearchParams: PageSearchParams;
};

const STATUS_OPTIONS: Array<D365SyncStatus | 'all'> = ['all', 'ok', 'partial', 'failed'];
const DIRECTION_OPTIONS: Array<D365SyncDirection | 'all'> = ['all', 'pull', 'push'];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(value: string | undefined): value is D365SyncStatus {
  return value === 'ok' || value === 'partial' || value === 'failed';
}

function isDirection(value: string | undefined): value is D365SyncDirection {
  return value === 'pull' || value === 'push';
}

function formatDateTime(value: string | null, emptyLabel: string) {
  if (!value) return emptyLabel;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().replace('T', ' ').slice(0, 19);
}

function sortRunsDesc(runs: D365SyncRun[]) {
  return [...runs].sort((left, right) => Date.parse(right.started_at) - Date.parse(left.started_at));
}

function statusVariant(status: D365SyncStatus) {
  if (status === 'ok') return 'success' as const;
  if (status === 'partial') return 'warning' as const;
  return 'danger' as const;
}

function runEntityType(run: D365SyncRun) {
  return run.entity_type ?? run.source ?? 'unknown';
}

function runRowsIn(run: D365SyncRun) {
  return run.rows_in ?? run.records_in ?? 0;
}

function runRowsOk(run: D365SyncRun) {
  return run.rows_ok ?? Math.max((run.records_in ?? 0) + (run.records_out ?? 0) - run.errors.length, 0);
}

function runRowsFailed(run: D365SyncRun) {
  return run.rows_failed ?? run.errors.length;
}

function runErrorSummary(run: D365SyncRun, labels: D365AuditLabels) {
  if (run.error_summary) return run.error_summary;
  return run.errors.length > 0 ? JSON.stringify(run.errors[0]) : labels.noErrors;
}

function countText(labels: D365AuditLabels, visible: number, total: number) {
  return labels.count.replace('{visible}', String(visible)).replace('{total}', String(total));
}

function errorsLabel(labels: D365AuditLabels, run: D365SyncRun) {
  return `${labels.viewErrors} ${run.id}`;
}

function renderShell(labels: D365AuditLabels, children: React.ReactNode, actions?: React.ReactNode) {
  return (
    <main
      data-testid="settings-d365-audit-screen"
      data-route="/settings/integrations/d365/audit"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/admin-screens.jsx:152-217"
      aria-label={labels.title}
      className="settings-page settings-page--d365-audit space-y-4"
    >
      <header data-region="page-head">
        <PageHeader title={labels.title} subtitle={labels.subtitle} actions={actions as never} />
      </header>
      {children}
    </main>
  );
}

export default function D365AuditScreen({
  callerRole = 'viewer',
  labels,
  runs = [],
  runSyncNow,
  state = 'ready',
  initialSearchParams,
}: D365AuditScreenProps) {
  const initialStatus = firstParam(initialSearchParams.status);
  const initialDirection = firstParam(initialSearchParams.direction);
  const initialStatusFilter: D365SyncStatus | 'all' = isStatus(initialStatus) ? initialStatus : 'all';
  const initialDirectionFilter: D365SyncDirection | 'all' = isDirection(initialDirection) ? initialDirection : 'all';
  const [statusFilter, setStatusFilter] = React.useState<D365SyncStatus | 'all'>(initialStatusFilter);
  const [directionFilter, setDirectionFilter] = React.useState<D365SyncDirection | 'all'>(initialDirectionFilter);
  const [startDate, setStartDate] = React.useState(firstParam(initialSearchParams.start) ?? '');
  const [endDate, setEndDate] = React.useState(firstParam(initialSearchParams.end) ?? '');
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [directionOpen, setDirectionOpen] = React.useState(false);
  const [selectedRun, setSelectedRun] = React.useState<D365SyncRun | null>(null);
  const [triggerState, setTriggerState] = React.useState<'idle' | 'pending' | 'error'>('idle');
  const [triggerError, setTriggerError] = React.useState<string | null>(null);

  const isOwner = callerRole === 'owner';
  const triggerAriaLabel = isOwner ? labels.runNow : `${labels.runNow} disabled: ${labels.ownerRequired}`;
  const sortedRuns = sortRunsDesc(runs);
  const visibleRuns = sortedRuns.filter((run) => {
    const started = run.started_at.slice(0, 10);
    return (statusFilter === 'all' || run.status === statusFilter)
      && (directionFilter === 'all' || run.direction === directionFilter)
      && (!startDate || started >= startDate)
      && (!endDate || started <= endDate);
  });

  const runNow = async () => {
    if (!isOwner || !runSyncNow) return;
    setTriggerState('pending');
    setTriggerError(null);
    const result = await runSyncNow();
    if ('message' in result) {
      setTriggerState('error');
      setTriggerError(result.message);
      return;
    }
    setTriggerState('idle');
  };

  const actions = (
    <Button
      type="button"
      className="btn-primary"
      aria-label={triggerAriaLabel}
      aria-disabled={!isOwner ? 'true' : undefined}
      disabled={!isOwner || triggerState === 'pending'}
      onClick={runNow}
    >
      {labels.runNow}
    </Button>
  );

  if (state === 'loading') {
    return renderShell(labels, <Card aria-busy="true"><CardContent role="status">{labels.loading}</CardContent></Card>, actions);
  }

  if (state === 'error') {
    return renderShell(labels, <Card><CardContent role="alert">{labels.error}</CardContent></Card>, actions);
  }

  if (state === 'empty' || runs.length === 0) {
    return renderShell(labels, <Card><CardContent role="status">{labels.empty}</CardContent></Card>, actions);
  }

  const statusOptions = STATUS_OPTIONS.map((value) => ({ value, label: value === 'all' ? labels.allStatuses : value }));
  const directionOptions = DIRECTION_OPTIONS.map((value) => ({ value, label: value === 'all' ? labels.allDirections : value }));

  return renderShell(
    labels,
    <>
      {triggerState === 'error' && triggerError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {triggerError}
        </div>
      ) : null}

      <section data-region="d365-audit-filters" aria-label={labels.filters} className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} options={statusOptions} onValueChange={(value) => setStatusFilter(value as D365SyncStatus | 'all')}>
          <SelectTrigger
            {...({
              'aria-label': labels.status,
              className: 'min-w-40',
              onClick: () => setStatusOpen((open) => !open),
            } as React.ComponentProps<typeof SelectTrigger> & { onClick: () => void })}
          >
            <SelectValue />
          </SelectTrigger>
          {statusOpen ? (
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          ) : null}
        </Select>

        <Select value={directionFilter} options={directionOptions} onValueChange={(value) => setDirectionFilter(value as D365SyncDirection | 'all')}>
          <SelectTrigger
            {...({
              'aria-label': labels.direction,
              className: 'min-w-40',
              onClick: () => setDirectionOpen((open) => !open),
            } as React.ComponentProps<typeof SelectTrigger> & { onClick: () => void })}
          >
            <SelectValue />
          </SelectTrigger>
          {directionOpen ? (
            <SelectContent>
              {directionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          ) : null}
        </Select>

        <Input
          type="date"
          aria-label={labels.startDate}
          className="min-w-36"
          value={startDate}
          onChange={(event) => setStartDate(event.currentTarget.value)}
        />
        <Input
          type="date"
          aria-label={labels.endDate}
          className="min-w-36"
          value={endDate}
          onChange={(event) => setEndDate(event.currentTarget.value)}
        />

        <span className="muted text-xs" aria-live="polite">
          {countText(labels, visibleRuns.length, runs.length)}
        </span>
      </section>

      <section data-region="d365-audit-runs" aria-labelledby="settings-d365-audit-runs-title">
        <Card>
          <CardHeader>
            <CardTitle id="settings-d365-audit-runs-title">{labels.syncRuns}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label={labels.syncRuns}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.startedAt}</TableHead>
                  <TableHead scope="col">{labels.finishedAt}</TableHead>
                  <TableHead scope="col">{labels.direction}</TableHead>
                  <TableHead scope="col">{labels.entityType}</TableHead>
                  <TableHead scope="col">{labels.status}</TableHead>
                  <TableHead scope="col">{labels.rowsIn}</TableHead>
                  <TableHead scope="col">{labels.rowsOk}</TableHead>
                  <TableHead scope="col">{labels.rowsFailed}</TableHead>
                  <TableHead scope="col">{labels.errorSummary}</TableHead>
                  <TableHead scope="col">{labels.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRuns.map((run) => (
                  <TableRow key={run.id} data-testid="d365-sync-run-row" data-run-id={run.id}>
                    <TableCell className="mono text-xs">{formatDateTime(run.started_at, labels.notAvailable)}</TableCell>
                    <TableCell className="mono text-xs">{formatDateTime(run.finished_at, labels.notAvailable)}</TableCell>
                    <TableCell>{run.direction}</TableCell>
                    <TableCell>{runEntityType(run)}</TableCell>
                    <TableCell><Badge variant={statusVariant(run.status)}>{run.status}</Badge></TableCell>
                    <TableCell className="num mono">{runRowsIn(run)}</TableCell>
                    <TableCell className="num mono">{runRowsOk(run)}</TableCell>
                    <TableCell className="num mono">{runRowsFailed(run)}</TableCell>
                    <TableCell className="max-w-md truncate text-xs">{runErrorSummary(run, labels)}</TableCell>
                    <TableCell>
                      {run.errors.length > 0 ? (
                        <Button type="button" className="btn-secondary btn-sm" aria-label={errorsLabel(labels, run)} onClick={() => setSelectedRun(run)}>
                          {labels.viewErrors}
                        </Button>
                      ) : (
                        <span className="muted text-xs">{labels.noErrors}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {selectedRun ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-d365-audit-errors-title"
          className="modal modal--md"
        >
          <header data-testid="modal-header" className="flex items-center justify-between gap-4">
            <h2 id="settings-d365-audit-errors-title">
              {labels.errorsTitle.replace('{id}', selectedRun.id)}
            </h2>
          </header>
          <div data-testid="modal-body">
            <pre
              data-testid="d365-sync-errors-json"
              aria-readonly="true"
              className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-white"
            >{JSON.stringify(selectedRun.errors, null, 2)}</pre>
          </div>
          <footer data-testid="modal-footer" className="flex justify-end gap-2">
            <Button type="button" onClick={() => setSelectedRun(null)}>{labels.close}</Button>
          </footer>
        </div>
      ) : null}
    </>,
    actions,
  );
}
