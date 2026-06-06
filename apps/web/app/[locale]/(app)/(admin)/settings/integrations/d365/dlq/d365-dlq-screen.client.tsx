'use client';

/**
 * T-058 — TEC-073 D365 DLQ Manager (client screen).
 *
 * Prototype parity:
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:852-893
 *     (D365DriftScreen / TEC-073 "D365 DLQ manager") — table + Retry/Resolve row actions.
 *   - prototypes/design/Monopilot Design System/technical/modals.jsx:562-598
 *     (D365DriftResolveModal) — the row-action confirmation modal (translated to a
 *     local resolve/skip confirm here; no overwrite direction — DLQ is push-retry).
 *
 * Translated to shadcn primitives (Table/Badge/Button/Card/Select). No raw <select>.
 * 5 states: loading / empty / error / permission-denied / optimistic (row pending).
 * Threshold banner per PRD §13.7: warn when unresolved DLQ depth > 50.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type DlqStatus = 'unresolved' | 'retried' | 'resolved' | 'skipped';
export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'forbidden';

export type DlqEntry = {
  id: string;
  job_type: string;
  target_entity: string;
  direction: string;
  record_key: string | null;
  d365_item_id: string | null;
  error_message: string;
  error_detail: unknown;
  failed_payload: unknown;
  retry_count: number;
  status: DlqStatus;
  failed_at: string;
};

export type DlqActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type DlqLabels = {
  title: string;
  subtitle: string;
  forbidden: string;
  thresholdBanner: string;
  table: string;
  failedAt: string;
  jobType: string;
  entity: string;
  recordKey: string;
  retries: string;
  status: string;
  error: string;
  actions: string;
  view: string;
  retry: string;
  resolve: string;
  skip: string;
  loading: string;
  empty: string;
  errorState: string;
  count: string;
  notAvailable: string;
  payloadTitle: string;
  errorDetail: string;
  failedPayload: string;
  close: string;
  confirmTitle: string;
  confirmRetry: string;
  confirmResolve: string;
  confirmSkip: string;
  cancel: string;
  confirm: string;
  pending: string;
  actionFailed: string;
};

export type DlqActions = {
  retry: (id: string) => Promise<DlqActionResult>;
  markResolved: (id: string) => Promise<DlqActionResult>;
  skip: (id: string) => Promise<DlqActionResult>;
};

export type D365DlqScreenProps = {
  entries: DlqEntry[];
  canTrigger: boolean;
  labels: DlqLabels;
  state: PageState;
  thresholdDepth?: number;
  actions?: DlqActions;
};

const DLQ_THRESHOLD = 50;
const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/technical/other-screens.jsx:852-893';

function formatDateTime(value: string | null, emptyLabel: string) {
  if (!value) return emptyLabel;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().replace('T', ' ').slice(0, 19);
}

function statusVariant(status: DlqStatus) {
  if (status === 'resolved' || status === 'retried') return 'success' as const;
  if (status === 'skipped') return 'muted' as const;
  return 'danger' as const;
}

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

function renderShell(labels: DlqLabels, children: React.ReactNode) {
  return (
    <main
      data-testid="settings-d365-dlq-screen"
      data-route="/settings/integrations/d365/dlq"
      data-prototype-source={PROTOTYPE_SOURCE}
      aria-label={labels.title}
      className="settings-page settings-page--d365-dlq space-y-4"
    >
      <header data-region="page-head">
        <PageHeader title={labels.title} subtitle={labels.subtitle} />
      </header>
      {children}
    </main>
  );
}

type ConfirmKind = 'retry' | 'resolve' | 'skip';

export default function D365DlqScreen({
  entries,
  canTrigger,
  labels,
  state,
  thresholdDepth = DLQ_THRESHOLD,
  actions,
}: D365DlqScreenProps) {
  const [rows, setRows] = React.useState<DlqEntry[]>(entries);
  const [selected, setSelected] = React.useState<DlqEntry | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: ConfirmKind; entry: DlqEntry } | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRows(entries);
  }, [entries]);

  if (state === 'forbidden') {
    return renderShell(
      labels,
      <div role="alert" className="alert alert-red">{labels.forbidden}</div>,
    );
  }
  if (state === 'loading') {
    return renderShell(labels, <Card aria-busy="true"><CardContent role="status">{labels.loading}</CardContent></Card>);
  }
  if (state === 'error') {
    return renderShell(labels, <Card><CardContent role="alert">{labels.errorState}</CardContent></Card>);
  }
  if (state === 'empty' || rows.length === 0) {
    return renderShell(labels, <Card><CardContent role="status" data-testid="d365-dlq-empty">{labels.empty}</CardContent></Card>);
  }

  const unresolvedDepth = rows.filter((row) => row.status === 'unresolved').length;
  const overThreshold = unresolvedDepth > thresholdDepth;

  const runAction = async (kind: ConfirmKind, entry: DlqEntry) => {
    if (!canTrigger || !actions) return;
    setPendingId(entry.id);
    setActionError(null);
    const fn = kind === 'retry' ? actions.retry : kind === 'resolve' ? actions.markResolved : actions.skip;
    const result = await fn(entry.id);
    setPendingId(null);
    setConfirm(null);
    if (!result.ok) {
      setActionError(fill(labels.actionFailed, { error: result.error }));
      return;
    }
    // Optimistic: reflect the new terminal status without a full reload.
    const nextStatus: DlqStatus = kind === 'retry' ? 'retried' : kind === 'resolve' ? 'resolved' : 'skipped';
    setRows((prev) => prev.map((row) => (row.id === entry.id ? { ...row, status: nextStatus } : row)));
  };

  return renderShell(
    labels,
    <>
      {overThreshold ? (
        <div role="alert" data-testid="d365-dlq-threshold-banner" className="alert alert-amber">
          {fill(labels.thresholdBanner, { depth: unresolvedDepth, threshold: thresholdDepth })}
        </div>
      ) : null}

      {actionError ? (
        <div role="alert" className="alert alert-red">
          {actionError}
        </div>
      ) : null}

      <section data-region="d365-dlq-rows" aria-labelledby="settings-d365-dlq-title">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle id="settings-d365-dlq-title">{labels.table}</CardTitle>
            <span className="muted text-xs" aria-live="polite">
              {fill(labels.count, { count: rows.length })}
            </span>
          </CardHeader>
          <CardContent>
            <Table aria-label={labels.table}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.failedAt}</TableHead>
                  <TableHead scope="col">{labels.jobType}</TableHead>
                  <TableHead scope="col">{labels.entity}</TableHead>
                  <TableHead scope="col">{labels.recordKey}</TableHead>
                  <TableHead scope="col">{labels.retries}</TableHead>
                  <TableHead scope="col">{labels.status}</TableHead>
                  <TableHead scope="col">{labels.error}</TableHead>
                  <TableHead scope="col">{labels.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => {
                  const isPending = pendingId === entry.id;
                  const isTerminal = entry.status !== 'unresolved';
                  const disabled = !canTrigger || isPending || isTerminal;
                  return (
                    <TableRow key={entry.id} data-testid="d365-dlq-row" data-dlq-id={entry.id} data-status={entry.status}>
                      <TableCell className="mono text-xs">{formatDateTime(entry.failed_at, labels.notAvailable)}</TableCell>
                      <TableCell>{entry.job_type}</TableCell>
                      <TableCell>{entry.target_entity}</TableCell>
                      <TableCell className="mono text-xs">{entry.record_key ?? labels.notAvailable}</TableCell>
                      <TableCell className="num mono">{entry.retry_count}</TableCell>
                      <TableCell><Badge variant={statusVariant(entry.status)}>{entry.status}</Badge></TableCell>
                      <TableCell className="max-w-md truncate text-xs">{entry.error_message}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            type="button"
                            className="btn-secondary btn-sm"
                            aria-label={`${labels.view} ${entry.id}`}
                            onClick={() => setSelected(entry)}
                          >
                            {labels.view}
                          </Button>
                          <Button
                            type="button"
                            className="btn-primary btn-sm"
                            aria-label={`${labels.retry} ${entry.id}`}
                            aria-disabled={disabled ? 'true' : undefined}
                            disabled={disabled}
                            onClick={() => setConfirm({ kind: 'retry', entry })}
                          >
                            {isPending ? labels.pending : labels.retry}
                          </Button>
                          <Button
                            type="button"
                            className="btn-secondary btn-sm"
                            aria-label={`${labels.resolve} ${entry.id}`}
                            aria-disabled={disabled ? 'true' : undefined}
                            disabled={disabled}
                            onClick={() => setConfirm({ kind: 'resolve', entry })}
                          >
                            {labels.resolve}
                          </Button>
                          <Button
                            type="button"
                            className="btn-ghost btn-sm"
                            aria-label={`${labels.skip} ${entry.id}`}
                            aria-disabled={disabled ? 'true' : undefined}
                            disabled={disabled}
                            onClick={() => setConfirm({ kind: 'skip', entry })}
                          >
                            {labels.skip}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {selected ? (
        <div className="modal-overlay" role="presentation" onClick={() => setSelected(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-d365-dlq-payload-title"
            data-testid="d365-dlq-payload-modal"
            className="modal-box modal modal--md"
            onClick={(event) => event.stopPropagation()}
          >
            <header data-testid="modal-header" className="modal-head">
              <h2 id="settings-d365-dlq-payload-title" className="modal-title">
                {fill(labels.payloadTitle, { id: selected.id })}
              </h2>
            </header>
            <div data-testid="modal-body" className="modal-body space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">{labels.errorDetail}</h3>
                <pre
                  data-testid="d365-dlq-error-detail-json"
                  aria-readonly="true"
                  className="max-h-48 overflow-auto rounded-md bg-[var(--text)] p-3 text-xs text-white"
                >{JSON.stringify(selected.error_detail, null, 2)}</pre>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">{labels.failedPayload}</h3>
                <pre
                  data-testid="d365-dlq-payload-json"
                  aria-readonly="true"
                  className="max-h-48 overflow-auto rounded-md bg-[var(--text)] p-3 text-xs text-white"
                >{JSON.stringify(selected.failed_payload, null, 2)}</pre>
              </div>
            </div>
            <footer data-testid="modal-footer" className="modal-foot">
              <Button type="button" className="btn-secondary" onClick={() => setSelected(null)}>{labels.close}</Button>
            </footer>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div className="modal-overlay" role="presentation" onClick={() => setConfirm(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-d365-dlq-confirm-title"
            data-testid="d365-dlq-confirm-modal"
            className="modal-box modal modal--sm"
            onClick={(event) => event.stopPropagation()}
          >
            <header data-testid="modal-header" className="modal-head">
              <h2 id="settings-d365-dlq-confirm-title" className="modal-title">{labels.confirmTitle}</h2>
            </header>
            <div data-testid="modal-body" className="modal-body text-sm">
              {confirm.kind === 'retry' ? labels.confirmRetry : confirm.kind === 'resolve' ? labels.confirmResolve : labels.confirmSkip}
            </div>
            <footer data-testid="modal-footer" className="modal-foot">
              <Button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>{labels.cancel}</Button>
              <Button
                type="button"
                className={confirm.kind === 'skip' ? 'btn-danger' : 'btn-primary'}
                aria-label={`${labels.confirm} ${confirm.kind}`}
                disabled={pendingId === confirm.entry.id}
                onClick={() => runAction(confirm.kind, confirm.entry)}
              >
                {labels.confirm}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </>,
  );
}
