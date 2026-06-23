'use client';

/**
 * E1 — Warehouse Print-history screen (client island).
 *
 * Sibling-conformant with the warehouse list surfaces: page head + a status filter
 * toolbar + a table of print jobs (entity ref / status badge / copies / printer /
 * created / download link when result_url is present) + a per-row Reprint that
 * wires reprintFromHistory. All five UI states render (loading / empty / error /
 * data + permission-denied). RBAC (settings.org.update — the SAME permission the
 * print actions enforce) is resolved server-side and threaded in as `canManage`;
 * Reprint is disabled with an explanatory aria-label when absent, and the action
 * re-checks the permission regardless.
 *
 * No raw UUIDs: entity is shown via lp_code / entity_display, printer by name; ids
 * stay in data-* hooks only.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import React from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
export type PrintJobStatus = 'queued' | 'sent' | 'failed';

export type PrintJobRow = {
  id: string;
  status: PrintJobStatus;
  entity_type: string;
  entity_display: string;
  lp_code: string | null;
  copies: number;
  printer_name: string | null;
  result_url: string | null;
  created_at: string;
};

export type PrintHistoryLabels = {
  title: string;
  subtitle: string;
  filterLabel: string;
  filterAll: string;
  filterQueued: string;
  filterSent: string;
  filterFailed: string;
  columnEntity: string;
  columnStatus: string;
  columnCopies: string;
  columnPrinter: string;
  columnCreated: string;
  columnResult: string;
  columnActions: string;
  statusQueued: string;
  statusSent: string;
  statusFailed: string;
  download: string;
  noPrinter: string;
  reprint: string;
  reprintPending: string;
  reprintSuccess: string;
  reprintFailed: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
  insufficientPermission: string;
};

const STATUS_VARIANT: Record<PrintJobStatus, BadgeVariant> = {
  sent: 'success',
  queued: 'info',
  failed: 'danger',
};

function statusLabel(status: PrintJobStatus, labels: PrintHistoryLabels) {
  if (status === 'sent') return labels.statusSent;
  if (status === 'failed') return labels.statusFailed;
  return labels.statusQueued;
}

function formatCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function StateNotice({ state, labels }: { state: PageState; labels: PrintHistoryLabels }) {
  if (state === 'loading') return <div role="status" aria-live="polite">{labels.loading}</div>;
  if (state === 'empty') return <div role="status">{labels.empty}</div>;
  if (state === 'error') return <div role="alert">{labels.error}</div>;
  if (state === 'permission_denied') return <div role="alert">{labels.forbidden}</div>;
  return null;
}

export default function PrintHistoryScreen({
  initialJobs,
  labels,
  canManage,
  reprintFromHistory,
  state = 'ready',
}: {
  initialJobs: PrintJobRow[];
  labels: PrintHistoryLabels;
  canManage: boolean;
  reprintFromHistory: (jobId: string) => Promise<PrintJobRow> | PrintJobRow;
  state?: PageState;
}) {
  const [rows, setRows] = React.useState<PrintJobRow[]>(() => [...initialJobs]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | PrintJobStatus>('all');
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const visibleRows = React.useMemo(
    () => rows.filter((row) => statusFilter === 'all' || row.status === statusFilter),
    [rows, statusFilter],
  );

  async function reprint(job: PrintJobRow) {
    if (!canManage || pendingId) return;
    setPendingId(job.id);
    setActionError(null);
    setStatusMessage(null);
    try {
      const created = await reprintFromHistory(job.id);
      setRows((current) => [created, ...current]);
      setStatusMessage(labels.reprintSuccess);
    } catch {
      setActionError(labels.reprintFailed);
    } finally {
      setPendingId(null);
    }
  }

  const effectiveState: PageState = state === 'empty' && rows.length > 0 ? 'ready' : state;

  return (
    <main
      data-testid="warehouse-print-history-screen"
      data-screen="warehouse-print-history"
      aria-labelledby="print-history-title"
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-4" data-region="page-head">
        <div>
          <h1 id="print-history-title" className="text-2xl font-semibold tracking-tight text-slate-950">
            {labels.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{labels.subtitle}</p>
        </div>
        <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span id="print-history-status-filter-label">{labels.filterLabel}</span>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as 'all' | PrintJobStatus)}
            options={[
              { value: 'all', label: labels.filterAll },
              { value: 'queued', label: labels.filterQueued },
              { value: 'sent', label: labels.filterSent },
              { value: 'failed', label: labels.filterFailed },
            ]}
          >
            <SelectTrigger aria-label={labels.filterLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.filterAll}</SelectItem>
              <SelectItem value="queued">{labels.filterQueued}</SelectItem>
              <SelectItem value="sent">{labels.filterSent}</SelectItem>
              <SelectItem value="failed">{labels.filterFailed}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {statusMessage ? (
        <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
          {statusMessage}
        </section>
      ) : null}
      {actionError ? <div role="alert" className="text-sm text-red-700">{actionError}</div> : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="print-history-list-title">
        <h2 id="print-history-list-title" className="sr-only">{labels.title}</h2>
        {effectiveState === 'ready' ? (
          visibleRows.length > 0 ? (
            <Table aria-label={labels.title} className="w-full border-collapse text-left text-sm">
              <TableHeader className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnEntity}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnStatus}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnCopies}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnPrinter}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnCreated}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnResult}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {visibleRows.map((job) => (
                  <TableRow
                    key={job.id}
                    data-testid="print-history-row"
                    data-job-id={job.id}
                    data-status={job.status}
                    className="align-top hover:bg-slate-50"
                  >
                    <TableCell className="px-4 py-3 font-mono text-xs text-slate-900">
                      {job.lp_code ?? job.entity_display}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[job.status]} aria-label={statusLabel(job.status, labels)}>
                        {statusLabel(job.status, labels)}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs text-slate-600">{job.copies}</TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-600">{job.printer_name ?? labels.noPrinter}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-[11px] text-slate-500">{formatCreated(job.created_at)}</TableCell>
                    <TableCell className="px-4 py-3 text-xs">
                      {job.result_url ? (
                        <a
                          href={job.result_url}
                          download
                          data-testid="print-history-download"
                          className="text-sky-700 hover:underline"
                        >
                          {labels.download}
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Button
                        type="button"
                        variant="dry-run"
                        disabled={!canManage || pendingId !== null}
                        aria-label={canManage ? `${labels.reprint} ${job.lp_code ?? job.entity_display}` : `${labels.reprint} — ${labels.insufficientPermission}`}
                        onClick={() => void reprint(job)}
                      >
                        {pendingId === job.id ? labels.reprintPending : labels.reprint}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div role="status" className="p-6 text-sm text-slate-600">{labels.empty}</div>
          )
        ) : (
          <div className="p-4">
            <StateNotice state={effectiveState} labels={labels} />
          </div>
        )}
      </section>
    </main>
  );
}
