'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

type D365SyncStatus = 'ok' | 'partial' | 'failed';
type D365SyncDirection = 'pull' | 'push';
type CallerRole = 'owner' | 'admin' | 'planner' | 'viewer';

type D365SyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  direction: D365SyncDirection;
  status: D365SyncStatus;
  source: string;
  records_in: number;
  records_out: number;
  errors: unknown[];
};

type D365AuditPageProps = {
  params?: Promise<{ locale: string }>;
  callerRole?: CallerRole;
  runs?: D365SyncRun[];
  runSyncNow?: () => Promise<{ ok: true } | { ok: false; message: string }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
};

type Labels = {
  title: string;
  subtitle: string;
  runNow: string;
  ownerRequired: string;
  filters: string;
  status: string;
  direction: string;
  allStatuses: string;
  allDirections: string;
  syncRuns: string;
  startedAt: string;
  finishedAt: string;
  source: string;
  recordsIn: string;
  recordsOut: string;
  errors: string;
  actions: string;
  viewErrors: string;
  noErrors: string;
  close: string;
  loading: string;
  empty: string;
  error: string;
};

const LABELS: Labels = {
  title: 'D365 sync audit',
  subtitle: 'Last sync results, raw error payloads, filters, and owner-triggered manual runs.',
  runNow: 'Run sync now',
  ownerRequired: 'owner role required; insufficient permissions to run D365 sync now',
  filters: 'D365 sync audit filters',
  status: 'Status',
  direction: 'Direction',
  allStatuses: 'All statuses',
  allDirections: 'All directions',
  syncRuns: 'D365 sync runs',
  startedAt: 'Started at',
  finishedAt: 'Finished at',
  source: 'Source',
  recordsIn: 'Records in',
  recordsOut: 'Records out',
  errors: 'Errors',
  actions: 'Actions',
  viewErrors: 'View errors',
  noErrors: 'No errors',
  close: 'Close',
  loading: 'Loading D365 sync audit…',
  empty: 'No D365 sync runs found.',
  error: 'Unable to load D365 sync audit.',
};

const STATUS_OPTIONS: Array<D365SyncStatus | 'all'> = ['all', 'ok', 'partial', 'failed'];
const DIRECTION_OPTIONS: Array<D365SyncDirection | 'all'> = ['all', 'pull', 'push'];

function formatDateTime(value: string | null) {
  if (!value) return '—';
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

function StatusOption({
  value,
  label,
  selected,
  onSelect,
}: {
  value: D365SyncStatus | 'all';
  label: string;
  selected: boolean;
  onSelect: (value: D365SyncStatus | 'all') => void;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      data-value={value}
      className="select__item"
      tabIndex={0}
      onClick={() => onSelect(value)}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          onSelect(value);
        }
      }}
    >
      {label}
    </div>
  );
}

function errorsLabel(labels: Labels, run: D365SyncRun) {
  return `${labels.viewErrors} ${run.id}`;
}

function renderShell(labels: Labels, children: React.ReactNode, actions?: React.ReactNode) {
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

export default function D365AuditPage(propsInput: unknown) {
  return <D365AuditScreen {...((propsInput ?? {}) as D365AuditPageProps)} />;
}

function D365AuditScreen({
  callerRole = 'viewer',
  runs = [],
  runSyncNow,
  state = 'ready',
}: D365AuditPageProps) {
  const labels = LABELS;
  const [statusFilter, setStatusFilter] = React.useState<D365SyncStatus | 'all'>('all');
  const [directionFilter, setDirectionFilter] = React.useState<D365SyncDirection | 'all'>('all');
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [selectedRun, setSelectedRun] = React.useState<D365SyncRun | null>(null);
  const [triggerState, setTriggerState] = React.useState<'idle' | 'pending' | 'error'>('idle');
  const [triggerError, setTriggerError] = React.useState<string | null>(null);

  const isOwner = callerRole === 'owner';
  const triggerAriaLabel = isOwner
    ? labels.runNow
    : `${labels.runNow} disabled: ${labels.ownerRequired}`;
  const sortedRuns = sortRunsDesc(runs);
  const visibleRuns = sortedRuns.filter((run) => {
    return (statusFilter === 'all' || run.status === statusFilter)
      && (directionFilter === 'all' || run.direction === directionFilter);
  });

  const runNow = async () => {
    if (!isOwner || !runSyncNow) return;
    setTriggerState('pending');
    setTriggerError(null);
    const result = await runSyncNow();
    if (result.ok) {
      setTriggerState('idle');
      return;
    }
    setTriggerState('error');
    setTriggerError(result.message);
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

  return renderShell(
    labels,
    <>
      {triggerState === 'error' && triggerError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {triggerError}
        </div>
      ) : null}

      <section data-region="d365-audit-filters" aria-label={labels.filters} className="flex flex-wrap items-center gap-2">
        <div className="select min-w-40">
          <button
            type="button"
            role="combobox"
            aria-label={labels.status}
            aria-expanded={statusOpen}
            aria-haspopup="listbox"
            className="select__trigger"
            onClick={() => setStatusOpen((open) => !open)}
          >
            <span>{statusFilter === 'all' ? labels.allStatuses : statusFilter}</span>
            <span aria-hidden="true">⌄</span>
          </button>
          {statusOpen ? (
            <div role="listbox" className="select__content">
              {STATUS_OPTIONS.map((value) => {
                const label = value === 'all' ? labels.allStatuses : value;
                return (
                  <StatusOption
                    key={value}
                    value={value}
                    label={label}
                    selected={statusFilter === value}
                    onSelect={(next) => {
                      setStatusFilter(next);
                      setStatusOpen(false);
                    }}
                  />
                );
              })}
            </div>
          ) : null}
        </div>

        <Select
          value={directionFilter}
          options={DIRECTION_OPTIONS.map((value) => ({ value, label: value === 'all' ? labels.allDirections : value }))}
          onValueChange={(value) => setDirectionFilter(value as D365SyncDirection | 'all')}
        >
          <SelectTrigger aria-label={labels.direction} className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTION_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>{value === 'all' ? labels.allDirections : value}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="muted text-xs" aria-live="polite">
          {visibleRuns.length} / {runs.length} runs
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
                  <TableHead scope="col">{labels.status}</TableHead>
                  <TableHead scope="col">{labels.direction}</TableHead>
                  <TableHead scope="col">{labels.source}</TableHead>
                  <TableHead scope="col">{labels.recordsIn}</TableHead>
                  <TableHead scope="col">{labels.recordsOut}</TableHead>
                  <TableHead scope="col">{labels.errors}</TableHead>
                  <TableHead scope="col">{labels.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRuns.map((run) => (
                  <TableRow key={run.id} data-testid="d365-sync-run-row" data-run-id={run.id}>
                    <TableCell className="mono text-xs">{formatDateTime(run.started_at)}</TableCell>
                    <TableCell className="mono text-xs">{formatDateTime(run.finished_at)}</TableCell>
                    <TableCell><Badge variant={statusVariant(run.status)}>{run.status}</Badge></TableCell>
                    <TableCell>{run.direction}</TableCell>
                    <TableCell>{run.source}</TableCell>
                    <TableCell className="num mono">{run.records_in}</TableCell>
                    <TableCell className="num mono">{run.records_out}</TableCell>
                    <TableCell className="num mono">{run.errors.length}</TableCell>
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
            <h2 id="settings-d365-audit-errors-title">Sync run errors — {selectedRun.id}</h2>
          </header>
          <div data-testid="modal-body">
            <pre
              data-testid="d365-sync-errors-json"
              aria-readonly="true"
              className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-white"
            >
              {JSON.stringify(selectedRun.errors, null, 2)}
            </pre>
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
