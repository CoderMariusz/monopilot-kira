'use client';

/**
 * 01-NPD TRIAL stage — TrialScreen (trial_screen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:222-257 (TrialScreen)
 *
 * NOTE: the prototype block 222-230 renders a "LEGACY — Phase 2 deprecation"
 * banner. Per the task spec all 8 stages are built for real, so the LEGACY
 * banner is intentionally NOT translated/rendered.
 *
 * Translation notes (TrialScreen):
 *   - card-head "Lab & kitchen trials" + subtitle           → Card header + muted subtitle
 *   - "+ Log new trial" button                              → @monopilot/ui Button (opens LogTrialModal)
 *   - table cols Trial # / Date / Batch / Yield / Tech /    → @monopilot/ui Table
 *     Result / Notes
 *   - result badge ✓ Pass (green) / ✗ Fail (red) /          → @monopilot/ui Badge (success / danger / muted)
 *     ⟳ In progress (amber→pending)
 *
 * Money/percent are rendered straight from NUMERIC decimal STRINGS (never JS
 * floats). RBAC (`permission_denied`) is resolved server-side in page.tsx and
 * is never trusted from the client. The Log/Update writes are owned by the
 * trial Server Actions and passed in as `onLogTrial` / `onUpdateTrial`.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { BookLineTimeModal } from './book-line-time-modal';
import { LogTrialModal, TrialFormModal, type TrialFormValues } from './log-trial-modal';
import type { ProductionLineOption } from '../_lib/capacity-block';
import type { TrialBatchView, TrialResult } from '../_actions/errors';
import type {
  CapacityBlockActionOutcome,
  TrialCapacityBookingView,
  UpsertCapacityBlockCall,
} from '../_lib/capacity-block';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type TechnologistOption = { id: string; name: string };

export type TrialScreenData = {
  projectId: string;
  productName: string;
  batches: TrialBatchView[];
  technologists: TechnologistOption[];
  /** True when the caller holds npd.trial.write (server-resolved). */
  canWrite: boolean;
  /** True when the caller holds npd.planning.write (server-resolved). */
  canBookLineTime: boolean;
  /** Active production lines for the line-time picker. */
  lines: ProductionLineOption[];
  /** Existing capacity blocks keyed by trial batch id. */
  capacityBookings: Record<string, TrialCapacityBookingView>;
  /** W5 — default line from npd_projects.production_line_id (user may override). */
  defaultProductionLineId: string | null;
};

export type TrialLabels = {
  title: string;
  subtitle: string;
  logNewTrial: string;
  colTrialNo: string;
  colDate: string;
  colBatch: string;
  colYield: string;
  colTechnologist: string;
  colResult: string;
  colNotes: string;
  colActions: string;
  resultPass: string;
  resultFail: string;
  resultPending: string;
  // Row actions
  editTrial: string;
  deleteTrial: string;
  confirmDelete: string;
  deleteError: string;
  deleteHasProgressed: string;
  // Modal
  modalTitle: string;
  editModalTitle: string;
  fieldTrialNo: string;
  fieldDate: string;
  fieldBatch: string;
  fieldYield: string;
  fieldTechnologist: string;
  fieldResult: string;
  fieldNotes: string;
  technologistNone: string;
  save: string;
  saveEdit: string;
  saving: string;
  cancel: string;
  saveError: string;
  duplicateError: string;
  // Line time booking
  colLineTime: string;
  lineTimeNotBooked: string;
  bookLineTime: string;
  rebookLineTime: string;
  bookLineTimeModalTitle: string;
  rebookLineTimeModalTitle: string;
  fieldLine: string;
  linePlaceholder: string;
  noLines: string;
  fieldBlockDate: string;
  fieldStartTime: string;
  fieldEndTime: string;
  bookLineTimeSaving: string;
  bookLineTimeError: string;
  bookLineTimeErrorInvalidInput: string;
  bookLineTimeErrorInvalidRange: string;
  bookLineTimeErrorForbidden: string;
  bookLineTimeErrorInvalidLine: string;
  bookLineTimeErrorTrialNotFound: string;
  bookLineTimeErrorPersistence: string;
  // States
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

export type TrialActionOutcome = { ok: boolean; error?: string };

export type LogTrialCall = {
  projectId: string;
  trialNo: string;
  trialDate: string | null;
  batchSizeKg: string | null;
  yieldPct: string | null;
  technologistUserId: string | null;
  result: TrialResult;
  notes: string | null;
};

/** Edit payload — same shape as LogTrialCall plus the batch `id` to update. */
export type UpdateTrialCall = LogTrialCall & { id: string };

export type DeleteTrialCall = { id: string; projectId: string };

export type BookLineTimeCall = UpsertCapacityBlockCall;

function resultVariant(result: TrialResult): BadgeVariant {
  switch (result) {
    case 'pass':
      return 'success';
    case 'fail':
      return 'danger';
    default:
      return 'muted';
  }
}

function resultToneClass(result: TrialResult): string {
  switch (result) {
    case 'pass':
      return 'badge-green';
    case 'fail':
      return 'badge-red';
    default:
      return 'badge-amber';
  }
}

function resultLabel(result: TrialResult, labels: TrialLabels): string {
  switch (result) {
    case 'pass':
      return `✓ ${labels.resultPass}`;
    case 'fail':
      return `✗ ${labels.resultFail}`;
    default:
      return `⟳ ${labels.resultPending}`;
  }
}

/** Display yield as "78%" (string slicing only — never float math). */
function formatYield(value: string | null): string {
  if (value === null || value.trim() === '') return '—';
  const [intPart, fracRaw = ''] = value.trim().split('.');
  const frac = fracRaw.replace(/0+$/, '');
  return frac ? `${intPart}.${frac}%` : `${intPart}%`;
}

function formatBatch(value: string | null): string {
  if (value === null || value.trim() === '') return '—';
  const [intPart, fracRaw = ''] = value.trim().split('.');
  const frac = fracRaw.replace(/0+$/, '');
  return `${frac ? `${intPart}.${frac}` : intPart} kg`;
}

function formatLineTimeBooking(
  booking: TrialCapacityBookingView | undefined,
  labels: TrialLabels,
): string {
  if (!booking) return labels.lineTimeNotBooked;
  return `${booking.blockDate} · ${booking.lineName} · ${booking.startTime}–${booking.endTime}`;
}

/**
 * Build the edit-modal pre-fill from a row. NUMERIC decimals are carried as the
 * raw DB strings (never reformatted through float math) so a round-trip save of
 * an untouched field re-writes the identical value.
 */
function rowToFormValues(row: TrialBatchView): TrialFormValues {
  return {
    trialNo: row.trialNo,
    trialDate: row.trialDate ?? '',
    batchSizeKg: row.batchSizeKg ?? '',
    yieldPct: row.yieldPct ?? '',
    technologistUserId: row.technologistUserId ?? '',
    result: row.result,
    notes: row.notes ?? '',
  };
}

function StateNotice({ state, labels }: { state: PageState; labels: TrialLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card empty-state">
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="card empty-state">
        <div className="empty-state-icon" aria-hidden="true">
          🧪
        </div>
        <div className="empty-state-title">{labels.empty}</div>
        <div className="empty-state-body">{labels.emptyBody}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.forbidden}</div>
      </div>
    );
  }
  return null;
}

export function TrialScreen({
  state = 'ready',
  data,
  labels,
  onLogTrial,
  onUpdateTrial,
  onDeleteTrial,
  onBookLineTime,
}: {
  state?: PageState;
  data: TrialScreenData | null;
  labels: TrialLabels;
  onLogTrial?: (call: LogTrialCall) => Promise<TrialActionOutcome>;
  onUpdateTrial?: (call: UpdateTrialCall) => Promise<TrialActionOutcome>;
  onDeleteTrial?: (call: DeleteTrialCall) => Promise<TrialActionOutcome>;
  onBookLineTime?: (call: BookLineTimeCall) => Promise<CapacityBlockActionOutcome>;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);
  // The row currently being edited (null = edit modal closed).
  const [editingRow, setEditingRow] = React.useState<TrialBatchView | null>(null);
  const [bookingTrialId, setBookingTrialId] = React.useState<string | null>(null);

  // Optimistic placeholder rows while a create is in flight. Cleared on settle
  // so a successful revalidate/router.refresh() cannot stack a duplicate.
  const [optimistic, setOptimistic] = React.useState<TrialBatchView[]>([]);
  const [pendingDeletes, setPendingDeletes] = React.useState<Set<string>>(() => new Set());

  if (state !== 'ready' || !data) {
    return (
      <main
        data-testid="trial-screen"
        aria-labelledby="trial-title"
        className="mx-auto w-full max-w-6xl space-y-4 p-6"
      >
        <header>
          <h1 id="trial-title" className="page-title">
            {labels.title}
          </h1>
        </header>
        <StateNotice state={state} labels={labels} />
      </main>
    );
  }

  // ponytail: drop optimistic once server answers — refetch owns the truth row
  const rows = [...optimistic, ...data.batches.filter((b) => !pendingDeletes.has(b.id))];

  async function handleSubmit(values: TrialFormValues): Promise<TrialActionOutcome> {
    if (!onLogTrial) return { ok: false, error: 'persistence_failed' };
    const call: LogTrialCall = {
      projectId: data!.projectId,
      trialNo: values.trialNo,
      trialDate: values.trialDate || null,
      batchSizeKg: values.batchSizeKg || null,
      yieldPct: values.yieldPct || null,
      technologistUserId: values.technologistUserId || null,
      result: values.result,
      notes: values.notes || null,
    };
    // Optimistic insert at the top while the server confirms.
    const tempId = `optimistic-${Date.now()}`;
    const tech = data!.technologists.find((t) => t.id === call.technologistUserId);
    setOptimistic((prev) => [
      {
        id: tempId,
        trialNo: call.trialNo,
        trialDate: call.trialDate,
        batchSizeKg: call.batchSizeKg,
        yieldPct: call.yieldPct,
        technologistUserId: call.technologistUserId,
        technologistName: tech?.name ?? null,
        result: call.result,
        notes: call.notes,
      },
      ...prev,
    ]);
    const result = await onLogTrial(call);
    // Always drop the placeholder — success relies on revalidate + router.refresh().
    setOptimistic((prev) => prev.filter((r) => r.id !== tempId));
    if (result.ok) router.refresh();
    return result;
  }

  async function handleUpdate(values: TrialFormValues): Promise<TrialActionOutcome> {
    if (!onUpdateTrial || !editingRow) return { ok: false, error: 'persistence_failed' };
    const call: UpdateTrialCall = {
      id: editingRow.id,
      projectId: data!.projectId,
      trialNo: values.trialNo,
      trialDate: values.trialDate || null,
      batchSizeKg: values.batchSizeKg || null,
      yieldPct: values.yieldPct || null,
      technologistUserId: values.technologistUserId || null,
      result: values.result,
      notes: values.notes || null,
    };
    const result = await onUpdateTrial(call);
    if (result.ok) {
      // The Server Action persisted + revalidated the path; refresh the RSC tree
      // so the row reflects the saved values (no client-trusted optimistic edit).
      router.refresh();
    }
    return result;
  }

  async function handleDelete(row: TrialBatchView): Promise<void> {
    if (!onDeleteTrial) return;
    if (typeof window !== 'undefined' && !window.confirm(labels.confirmDelete)) return;
    setPendingDeletes((prev) => new Set(prev).add(row.id));
    const result = await onDeleteTrial({ id: row.id, projectId: data!.projectId });
    if (result.ok) {
      router.refresh();
      return;
    }
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.delete(row.id);
      return next;
    });
    if (typeof window !== 'undefined') {
      window.alert(
        result.error === 'has_progressed' ? labels.deleteHasProgressed : labels.deleteError,
      );
    }
  }

  async function handleBookLineTime(call: BookLineTimeCall): Promise<CapacityBlockActionOutcome> {
    if (!onBookLineTime) return { ok: false, error: 'persistence_failed' };
    const result = await onBookLineTime(call);
    if (result.ok) {
      router.refresh();
    }
    return result;
  }

  const bookingExisting = bookingTrialId ? data.capacityBookings[bookingTrialId] ?? null : null;

  return (
    <main
      data-testid="trial-screen"
      aria-labelledby="trial-title"
      className="mx-auto w-full max-w-6xl space-y-4 p-6"
    >
      <header className="page-head" data-region="page-head">
        <nav aria-label="breadcrumb" className="breadcrumb">
          NPD / {labels.title}
        </nav>
        <h1 id="trial-title" className="page-title mt-1">
          {labels.title} — {data.productName}
        </h1>
      </header>

      <Card data-testid="trial-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{labels.title}</CardTitle>
            <p className="mt-1 text-sm muted">{labels.subtitle}</p>
          </div>
          {data.canWrite ? (
            <Button
              type="button"
              className="btn-sm"
              data-testid="log-new-trial-button"
              onClick={() => setModalOpen(true)}
            >
              {labels.logNewTrial}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="trial-table">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colTrialNo}</TableHead>
                <TableHead scope="col">{labels.colDate}</TableHead>
                <TableHead scope="col">{labels.colBatch}</TableHead>
                <TableHead scope="col">{labels.colYield}</TableHead>
                <TableHead scope="col">{labels.colTechnologist}</TableHead>
                <TableHead scope="col">{labels.colResult}</TableHead>
                <TableHead scope="col">{labels.colNotes}</TableHead>
                <TableHead scope="col">{labels.colLineTime}</TableHead>
                {data.canWrite || data.canBookLineTime ? (
                  <TableHead scope="col" data-testid="trial-actions-head">
                    <span className="sr-only">{labels.colActions}</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id} data-testid="trial-row">
                  <TableCell className="mono">{t.trialNo}</TableCell>
                  <TableCell className="mono">{t.trialDate ?? '—'}</TableCell>
                  <TableCell className="mono">{formatBatch(t.batchSizeKg)}</TableCell>
                  <TableCell className="mono">{formatYield(t.yieldPct)}</TableCell>
                  <TableCell>{t.technologistName ?? '—'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={resultVariant(t.result)}
                      className={resultToneClass(t.result)}
                      data-testid={`trial-result-${t.result}`}
                    >
                      {resultLabel(t.result, labels)}
                    </Badge>
                  </TableCell>
                  <TableCell className="muted">{t.notes ?? ''}</TableCell>
                  <TableCell
                    className="mono text-sm"
                    data-testid={`trial-line-time-${t.id}`}
                  >
                    {formatLineTimeBooking(data.capacityBookings[t.id], labels)}
                  </TableCell>
                  {data.canWrite || data.canBookLineTime ? (
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        {/* Optimistic rows have a transient id and aren't yet
                            persisted, so they can't be edited until the refresh. */}
                        {data.canWrite && !t.id.startsWith('optimistic-') ? (
                          <Button
                            type="button"
                            variant="default"
                            className="btn-ghost btn-sm"
                            data-testid={`edit-trial-button-${t.id}`}
                            onClick={() => setEditingRow(t)}
                          >
                            {labels.editTrial}
                          </Button>
                        ) : null}
                        {data.canWrite &&
                        onDeleteTrial &&
                        !t.id.startsWith('optimistic-') &&
                        t.result === 'pending' ? (
                          <Button
                            type="button"
                            variant="default"
                            className="btn-ghost btn-sm"
                            data-testid={`delete-trial-button-${t.id}`}
                            onClick={() => void handleDelete(t)}
                          >
                            {labels.deleteTrial}
                          </Button>
                        ) : null}
                        {data.canBookLineTime && !t.id.startsWith('optimistic-') ? (
                          <Button
                            type="button"
                            variant="default"
                            className="btn-ghost btn-sm"
                            data-testid={`book-line-time-button-${t.id}`}
                            onClick={() => setBookingTrialId(t.id)}
                          >
                            {data.capacityBookings[t.id] ? labels.rebookLineTime : labels.bookLineTime}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.canWrite ? (
        <LogTrialModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          labels={labels}
          technologists={data.technologists}
          technologistNone={labels.technologistNone}
          onSubmit={handleSubmit}
        />
      ) : null}

      {data.canBookLineTime && bookingTrialId ? (
        <BookLineTimeModal
          open={bookingTrialId !== null}
          onOpenChange={(open) => {
            if (!open) setBookingTrialId(null);
          }}
          labels={labels}
          trialId={bookingTrialId}
          lines={data.lines}
          existingBooking={bookingExisting}
          defaultProductionLineId={data.defaultProductionLineId}
          onSubmit={handleBookLineTime}
        />
      ) : null}

      {data.canWrite ? (
        <TrialFormModal
          mode="edit"
          open={editingRow !== null}
          onOpenChange={(open) => {
            if (!open) setEditingRow(null);
          }}
          labels={labels}
          technologists={data.technologists}
          technologistNone={labels.technologistNone}
          initialValues={editingRow ? rowToFormValues(editingRow) : undefined}
          onSubmit={async (values) => {
            const outcome = await handleUpdate(values);
            if (outcome.ok) setEditingRow(null);
            return outcome;
          }}
        />
      ) : null}
    </main>
  );
}
