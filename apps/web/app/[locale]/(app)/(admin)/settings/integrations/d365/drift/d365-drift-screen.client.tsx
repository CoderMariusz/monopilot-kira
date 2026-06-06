'use client';

/**
 * T-059 — TEC-091 D365 Drift Resolution (client screen).
 *
 * Prototype parity:
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:852-893
 *     (D365DriftScreen / TEC-073-91 "DLQ manager / drift resolution") — the drift
 *     table: Drift ID / Entity / Item / MP value / D365 value / Δ / Severity /
 *     Detected / Action(Accept/Reject).
 *   - prototypes/design/Monopilot Design System/technical/modals.jsx:562-598
 *     (D365DriftResolveModal) — the per-row resolve modal: destructive banner,
 *     MP→D365 / D365→MP direction radios, audit-logged reason (min 10 chars).
 *
 * Translated to shadcn primitives (Table/Badge/Button/Card/Checkbox/Textarea).
 * No raw <select>. 5 states: loading / empty / error / permission-denied / optimistic.
 * Accept = authorized, audited overwrite/import; Reject = mark resolved, no change.
 * D365 is never canonical-by-default.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { Checkbox } from '@monopilot/ui/Checkbox';
import { PageHeader } from '@monopilot/ui/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';
import Textarea from '@monopilot/ui/Textarea';

export type DriftDirection = 'mp_wins' | 'd365_wins';
export type DriftResolution = 'accept' | 'reject';
export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'forbidden';

export type DriftEvent = {
  id: string;
  occurred_at: string;
  resource_id: string;
  entity: string;
  item_code: string;
  mp_value: string;
  d365_value: string;
};

export type DriftActionResult = { ok: true } | { ok: false; error: string };
export type BulkActionResult = { ok: true; resolved: number } | { ok: false; error: string };

export type DriftLabels = {
  title: string;
  subtitle: string;
  forbidden: string;
  table: string;
  selectAll: string;
  selectRow: string;
  driftId: string;
  entity: string;
  item: string;
  mpValue: string;
  d365Value: string;
  detected: string;
  actions: string;
  accept: string;
  reject: string;
  bulkAccept: string;
  bulkReject: string;
  selectedCount: string;
  loading: string;
  empty: string;
  errorState: string;
  count: string;
  notAvailable: string;
  modalTitle: string;
  destructive: string;
  directionMpWins: string;
  directionMpWinsHint: string;
  directionD365Wins: string;
  directionD365WinsHint: string;
  reasonLabel: string;
  reasonHint: string;
  reasonPlaceholder: string;
  cancel: string;
  apply: string;
  pending: string;
  actionFailed: string;
};

export type DriftActions = {
  resolve: (input: {
    driftId: string;
    occurredAt: string;
    resolution: DriftResolution;
    direction: DriftDirection;
    reason: string;
  }) => Promise<DriftActionResult>;
  bulkResolve: (input: {
    drifts: Array<{ driftId: string; occurredAt: string }>;
    resolution: DriftResolution;
    direction: DriftDirection;
    reason: string;
  }) => Promise<BulkActionResult>;
};

export type D365DriftScreenProps = {
  events: DriftEvent[];
  canTrigger: boolean;
  labels: DriftLabels;
  state: PageState;
  actions?: DriftActions;
};

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/technical/other-screens.jsx:852-893';
const MIN_REASON = 10;

function formatDateTime(value: string | null, emptyLabel: string) {
  if (!value) return emptyLabel;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().replace('T', ' ').slice(0, 19);
}

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

function renderShell(labels: DriftLabels, children: React.ReactNode) {
  return (
    <main
      data-testid="settings-d365-drift-screen"
      data-route="/settings/integrations/d365/drift"
      data-prototype-source={PROTOTYPE_SOURCE}
      aria-label={labels.title}
      className="settings-page settings-page--d365-drift space-y-4"
    >
      <header data-region="page-head">
        <PageHeader title={labels.title} subtitle={labels.subtitle} />
      </header>
      {children}
    </main>
  );
}

type ResolveTarget =
  | { mode: 'single'; event: DriftEvent }
  | { mode: 'bulk'; resolution: DriftResolution };

export default function D365DriftScreen({ events, canTrigger, labels, state, actions }: D365DriftScreenProps) {
  const [rows, setRows] = React.useState<DriftEvent[]>(events);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [target, setTarget] = React.useState<ResolveTarget | null>(null);
  const [direction, setDirection] = React.useState<DriftDirection>('mp_wins');
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRows(events);
    setSelectedIds(new Set());
  }, [events]);

  React.useEffect(() => {
    if (!target) {
      setDirection('mp_wins');
      setReason('');
    }
  }, [target]);

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
    return renderShell(labels, <Card><CardContent role="status" data-testid="d365-drift-empty">{labels.empty}</CardContent></Card>);
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  };

  const reasonValid = reason.trim().length >= MIN_REASON;

  const submit = async () => {
    if (!canTrigger || !actions || !target || !reasonValid) return;
    setPending(true);
    setActionError(null);

    let resolvedIds: string[] = [];
    let failed = false;
    if (target.mode === 'single') {
      const result = await actions.resolve({
        driftId: target.event.id,
        occurredAt: target.event.occurred_at,
        resolution: 'accept',
        direction,
        reason: reason.trim(),
      });
      if (result.ok) resolvedIds = [target.event.id];
      else failed = true;
    } else {
      const drifts = rows
        .filter((row) => selectedIds.has(row.id))
        .map((row) => ({ driftId: row.id, occurredAt: row.occurred_at }));
      const result = await actions.bulkResolve({
        drifts,
        resolution: target.resolution,
        direction: target.resolution === 'accept' ? direction : 'mp_wins',
        reason: reason.trim(),
      });
      if (result.ok) resolvedIds = drifts.map((d) => d.driftId);
      else failed = true;
    }

    setPending(false);
    setTarget(null);
    if (failed) {
      setActionError(labels.actionFailed);
      return;
    }
    // Optimistic: drop resolved rows from the table + the selection.
    const resolvedSet = new Set(resolvedIds);
    setRows((prev) => prev.filter((row) => !resolvedSet.has(row.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      resolvedSet.forEach((id) => next.delete(id));
      return next;
    });
  };

  const bulkDisabled = !canTrigger || selectedIds.size === 0;
  const isReject = target?.mode === 'bulk' && target.resolution === 'reject';

  return renderShell(
    labels,
    <>
      {actionError ? (
        <div role="alert" className="alert alert-red">
          {actionError}
        </div>
      ) : null}

      <section data-region="d365-drift-bulk" aria-label={labels.actions} className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="btn-primary btn-sm"
          aria-label={labels.bulkAccept}
          aria-disabled={bulkDisabled ? 'true' : undefined}
          disabled={bulkDisabled}
          onClick={() => setTarget({ mode: 'bulk', resolution: 'accept' })}
        >
          {labels.bulkAccept}
        </Button>
        <Button
          type="button"
          className="btn-secondary btn-sm"
          aria-label={labels.bulkReject}
          aria-disabled={bulkDisabled ? 'true' : undefined}
          disabled={bulkDisabled}
          onClick={() => setTarget({ mode: 'bulk', resolution: 'reject' })}
        >
          {labels.bulkReject}
        </Button>
        <span className="muted text-xs" aria-live="polite">
          {fill(labels.selectedCount, { selected: selectedIds.size })}
        </span>
      </section>

      <section data-region="d365-drift-rows" aria-labelledby="settings-d365-drift-title">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle id="settings-d365-drift-title">{labels.table}</CardTitle>
            <span className="muted text-xs" aria-live="polite">{fill(labels.count, { count: rows.length })}</span>
          </CardHeader>
          <CardContent>
            <Table aria-label={labels.table}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">
                    <Checkbox
                      checked={allSelected}
                      disabled={!canTrigger}
                      onCheckedChange={toggleAll}
                      aria-label={labels.selectAll}
                    />
                  </TableHead>
                  <TableHead scope="col">{labels.driftId}</TableHead>
                  <TableHead scope="col">{labels.entity}</TableHead>
                  <TableHead scope="col">{labels.item}</TableHead>
                  <TableHead scope="col">{labels.mpValue}</TableHead>
                  <TableHead scope="col">{labels.d365Value}</TableHead>
                  <TableHead scope="col">{labels.detected}</TableHead>
                  <TableHead scope="col">{labels.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((event) => (
                  <TableRow key={event.id} data-testid="d365-drift-row" data-drift-id={event.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(event.id)}
                        disabled={!canTrigger}
                        onCheckedChange={() => toggleRow(event.id)}
                        aria-label={`${labels.selectRow} ${event.id}`}
                      />
                    </TableCell>
                    <TableCell className="mono text-xs">{event.id.slice(0, 8)}</TableCell>
                    <TableCell className="mono text-xs">{event.entity}</TableCell>
                    <TableCell className="mono text-xs">{event.item_code}</TableCell>
                    <TableCell className="num mono text-xs">{event.mp_value}</TableCell>
                    <TableCell className="num mono text-xs">{event.d365_value}</TableCell>
                    <TableCell className="mono text-xs text-muted-foreground">{formatDateTime(event.occurred_at, labels.notAvailable)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          type="button"
                          className="btn-ghost btn-sm"
                          aria-label={`${labels.accept} ${event.id}`}
                          aria-disabled={!canTrigger ? 'true' : undefined}
                          disabled={!canTrigger}
                          onClick={() => setTarget({ mode: 'single', event })}
                        >
                          {labels.accept}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {target ? (
        <div className="modal-overlay" role="presentation" onClick={() => setTarget(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-d365-drift-modal-title"
            data-testid="d365-drift-resolve-modal"
            className="modal-box modal modal--md"
            onClick={(event) => event.stopPropagation()}
          >
            <header data-testid="modal-header" className="modal-head">
              <h2 id="settings-d365-drift-modal-title" className="modal-title">{labels.modalTitle}</h2>
            </header>
            <div data-testid="modal-body" className="modal-body space-y-3">
              {!isReject ? (
                <>
                  <div role="alert" className="alert alert-red text-xs">
                    {labels.destructive}
                  </div>
                  <fieldset className="grid gap-2" aria-label={labels.modalTitle}>
                    <label className="flex items-start gap-2 rounded border border-border px-3 py-2">
                      <input
                        type="radio"
                        name="drift-direction"
                        value="mp_wins"
                        checked={direction === 'mp_wins'}
                        onChange={() => setDirection('mp_wins')}
                      />
                      <span>
                        <b>{labels.directionMpWins}</b>
                        <span className="block text-xs text-muted-foreground">{labels.directionMpWinsHint}</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 rounded border border-border px-3 py-2">
                      <input
                        type="radio"
                        name="drift-direction"
                        value="d365_wins"
                        checked={direction === 'd365_wins'}
                        onChange={() => setDirection('d365_wins')}
                      />
                      <span>
                        <b>{labels.directionD365Wins}</b>
                        <span className="block text-xs text-muted-foreground">{labels.directionD365WinsHint}</span>
                      </span>
                    </label>
                  </fieldset>
                </>
              ) : null}
              <div className="ff grid gap-1">
                <label htmlFor="d365-drift-reason">{labels.reasonLabel}</label>
                <Textarea
                  id="d365-drift-reason"
                  aria-label={labels.reasonLabel}
                  placeholder={labels.reasonPlaceholder}
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  className="form-input"
                />
                <span className="text-xs text-muted-foreground" data-testid="d365-drift-reason-counter">
                  {reason.trim().length}/{MIN_REASON}+ · {labels.reasonHint}
                </span>
              </div>
            </div>
            <footer data-testid="modal-footer" className="modal-foot">
              <Button type="button" className="btn-secondary" onClick={() => setTarget(null)}>{labels.cancel}</Button>
              <Button
                type="button"
                className="btn-danger"
                aria-label={labels.apply}
                aria-disabled={!reasonValid || pending ? 'true' : undefined}
                disabled={!reasonValid || pending}
                onClick={submit}
              >
                {pending ? labels.pending : labels.apply}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </>,
  );
}
