'use client';

/**
 * T-108 — AdvanceGateModal (NPD-005, Advance gate confirmation).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:261-373 (AdvanceGateModal)
 *   prototype-index-npd.json#advance_gate_modal (lines 261-377; component_type=modal).
 *
 * Translation notes (prototype → production; from prototype-index-npd.json#advance_gate_modal):
 *   - window.Modal + foot Cancel/Advance            → @monopilot/ui Modal (Radix dialog) + Modal.Header/Body/Footer.
 *   - GATE_INFO / STAGE_TO_GATE / resolveItems mock → REAL gate metadata + checklist items are resolved
 *     server-side (T-057 getProject) and passed in as `gateInfo` + `items` props. This island NEVER queries
 *     the DB (risk red-line); it is a pure controlled component.
 *   - blockers = items.filter(required && !done)     → computed locally from the items prop (no override mutation;
 *     toggling lives in GateChecklistPanel/T-107). Submit is gated by blockers.length === 0 to mirror the
 *     advanceProjectGate server check (rejects 409 BLOCKERS_PRESENT) — defence in depth, not the source of truth.
 *   - gate-transition card + dashed-when-blocked arrow → CSS card; arrow exposes data-blocked for parity evidence.
 *   - Progress div + per-item rows with Done/Blocking/Optional badges → role="progressbar" + @monopilot/ui Badge
 *     (every status pairs colour with a glyph + text — a11y: never colour-only).
 *   - red blocker box / green ready alert            → role="alert" (blockers) / role="status" (ready) notices.
 *   - notes <textarea> disabled when blockers        → @monopilot/ui Textarea, disabled when blockers > 0, RHF-bound.
 *   - handleSubmit setTimeout mock                    → calls the injected advanceProjectGate Server Action
 *     (T-058, merged: apps/web/app/(npd)/pipeline/_actions/advance-project-gate.ts) with
 *     { projectId, targetGate, notes }; success alert mirrors the prototype's "Gate advanced …" panel.
 *   - hardcoded gate labels                          → i18n LABELS (npd.advanceGateModal namespace), resolved by
 *     the RSC host (T-111) and passed in as `labels`.
 *
 * Required UI states: loading / empty / error / permission-denied (via `state`) + optimistic submit (the
 * Advance button shows a "Processing…" label and is disabled while the action is in flight).
 *
 * The Server Action is injected (advanceProjectGate) so the component stays a pure client form; the host page
 * (T-111) wires the real merged action — imported there, never authored here.
 */

import React from 'react';
import { useForm } from 'react-hook-form';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';

export type GateKey = 'G0' | 'G1' | 'G2' | 'G3' | 'G4';
export type TargetGate = 'G1' | 'G2' | 'G3' | 'G4' | 'Launched';
export type AdvanceGateState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

/** A checklist item summary for the gate being advanced (resolved server-side, T-057). */
export type AdvanceGateItem = {
  id: string;
  text: string;
  required: boolean;
  done: boolean;
};

/** Gate-transition metadata (domain constant, resolved server-side from the project's current gate). */
export type AdvanceGateInfo = {
  current: GateKey;
  currentLabel: string;
  next: TargetGate;
  nextLabel: string;
  requiresApproval: boolean;
};

export type AdvanceGateProject = {
  id: string;
  code: string;
  name: string;
  currentGate: GateKey;
};

/**
 * Server Action contract (owned by T-058 — imported by the host page, injected here as a prop).
 * Mirrors advanceProjectGate's AdvanceProjectGateResult shape; we only branch on `ok`.
 */
export type AdvanceProjectGateAction = (input: {
  projectId: string;
  targetGate: TargetGate;
  notes: string;
}) => Promise<{ ok: true; data?: unknown } | { ok: false; error: string; status: number }>;

export type AdvanceGateLabels = {
  title: string;
  gateTransition: string;
  currentTag: string;
  targetTag: string;
  approvalRequired: string;
  checklistSummary: string; // ICU-ish: "{gate}" + "{label}"
  done: string;
  blocking: string;
  optional: string;
  requiredComplete: string; // "{done} of {total} required items complete"
  blockersTitle: string; // "{count} blocker(s)"
  readyAlert: string;
  notesLabel: string;
  notesPlaceholder: string;
  notesHint: string;
  cancel: string;
  advance: string; // "Advance to {gate}: {nextLabel}"
  advancing: string;
  successTitle: string; // "Gate advanced to {gate}: {nextLabel}"
  successBody: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
};

function fmt(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

type NotesForm = { notes: string };

// ——— state notice (loading / empty / error / permission-denied) ———
function StateNotice({ state, labels }: { state: AdvanceGateState; labels: AdvanceGateLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" data-testid="advance-gate-loading" className="p-6 text-sm text-slate-600">
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div role="status" data-testid="advance-gate-empty" className="p-6 text-sm text-slate-600">
        {labels.empty}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" data-testid="advance-gate-state-error" className="p-6 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" data-testid="advance-gate-forbidden" className="p-6 text-sm text-red-700">
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

export function AdvanceGateModal({
  open,
  labels,
  project,
  gateInfo,
  items,
  state = 'ready',
  advanceProjectGate,
  onAdvanced,
  onClose,
}: {
  open: boolean;
  labels: AdvanceGateLabels;
  project: AdvanceGateProject;
  gateInfo: AdvanceGateInfo;
  items: AdvanceGateItem[];
  state?: AdvanceGateState;
  advanceProjectGate?: AdvanceProjectGateAction;
  /** Called after a successful advance; the host maps it to revalidation / close. */
  onAdvanced?: () => void;
  onClose: () => void;
}) {
  const { register, handleSubmit, watch, reset, formState } = useForm<NotesForm>({
    defaultValues: { notes: '' },
    mode: 'onChange',
  });
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const notes = watch('notes');

  React.useEffect(() => {
    if (!open) {
      reset({ notes: '' });
      setServerError(null);
      setSuccess(false);
    }
  }, [open, reset]);

  // Empty when there are no items to summarise (treated as a UI state).
  const effectiveState: AdvanceGateState =
    state === 'ready' && items.length === 0 ? 'empty' : state;

  const blockers = React.useMemo(() => items.filter((i) => i.required && !i.done), [items]);
  const requiredItems = React.useMemo(() => items.filter((i) => i.required), [items]);
  const requiredDone = requiredItems.filter((i) => i.done).length;
  const pct = items.length
    ? Math.round((items.filter((i) => i.done).length / items.length) * 100)
    : 0;

  const isBlocked = blockers.length > 0;
  const canAdvance = !isBlocked && notes.trim().length > 0;
  const submitting = formState.isSubmitting;

  const onSubmit = handleSubmit(async (values) => {
    if (isBlocked) return; // defence in depth: never submit when blockers exist
    setServerError(null);
    try {
      const result = await advanceProjectGate?.({
        projectId: project.id,
        targetGate: gateInfo.next,
        notes: values.notes.trim(),
      });
      if (result?.ok) {
        setSuccess(true);
        onAdvanced?.();
      } else {
        setServerError(labels.error);
      }
    } catch {
      setServerError(labels.error);
    }
  });

  const advanceLabel = fmt(labels.advance, { gate: gateInfo.next, nextLabel: gateInfo.nextLabel });

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      size="md"
      modalId="advanceGate"
    >
      <Modal.Header title={labels.title} />
      <Modal.Body>
        {effectiveState !== 'ready' ? (
          <StateNotice state={effectiveState} labels={labels} />
        ) : success ? (
          <div role="status" data-testid="advance-gate-success" className="alert alert-green p-6 text-center text-sm">
            <div aria-hidden="true" className="mb-2 text-3xl">
              ✓
            </div>
            <div className="font-semibold">
              {fmt(labels.successTitle, { gate: gateInfo.next, nextLabel: gateInfo.nextLabel })}
            </div>
            <div className="muted mt-1 text-xs">{labels.successBody}</div>
          </div>
        ) : (
          <form id="advance-gate-form" onSubmit={onSubmit} noValidate className="grid gap-4">
            {/* ——— Gate transition ——— */}
            <div
              data-testid="advance-gate-transition"
              className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3.5"
            >
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {labels.gateTransition}
              </p>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <span
                    aria-hidden="true"
                    className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white"
                  >
                    {gateInfo.current}
                  </span>
                  <div className="text-[11px] text-slate-500">{gateInfo.currentLabel}</div>
                  <div className="text-[10px] text-slate-500">{labels.currentTag}</div>
                </div>
                <div
                  data-testid="advance-gate-arrow"
                  data-blocked={isBlocked ? 'true' : 'false'}
                  aria-hidden="true"
                  className={[
                    'flex-1 text-center text-lg',
                    isBlocked ? 'text-amber-500' : 'text-emerald-600',
                  ].join(' ')}
                >
                  {isBlocked ? '- - - - ▸' : '━━━━▸'}
                </div>
                <div className="text-center">
                  <span
                    aria-hidden="true"
                    className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500"
                  >
                    {gateInfo.next}
                  </span>
                  <div className="text-[11px] text-slate-500">{gateInfo.nextLabel}</div>
                  <div className="text-[10px] text-slate-500">{labels.targetTag}</div>
                </div>
              </div>
              {gateInfo.requiresApproval && (
                <div role="note" data-testid="advance-gate-approval-note" className="alert alert-blue mt-2.5 text-xs">
                  <span aria-hidden="true">🛡</span> {labels.approvalRequired}
                </div>
              )}
            </div>

            {/* ——— Checklist summary ——— */}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {fmt(labels.checklistSummary, { gate: gateInfo.current, label: gateInfo.currentLabel })}
              </p>
              <div className="mb-2.5 flex items-center gap-2">
                <div
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={fmt(labels.checklistSummary, {
                    gate: gateInfo.current,
                    label: gateInfo.currentLabel,
                  })}
                  data-testid="advance-gate-progress"
                  className="h-2 flex-1 overflow-hidden rounded bg-slate-100"
                >
                  <div
                    className={pct >= 100 ? 'h-full bg-emerald-600' : 'h-full bg-blue-600'}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="font-mono text-xs font-semibold">{pct}%</span>
              </div>

              <ul className="max-h-40 list-none overflow-y-auto p-0">
                {items.map((item) => {
                  const isItemBlocking = item.required && !item.done;
                  return (
                    <li
                      key={item.id}
                      data-testid="advance-gate-item"
                      data-item-id={item.id}
                      data-done={item.done || undefined}
                      data-blocking={isItemBlocking || undefined}
                      className="flex items-center gap-2 py-1 text-sm"
                    >
                      <span
                        aria-hidden="true"
                        className={item.done ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}
                      >
                        {item.done ? '✓' : '✗'}
                      </span>
                      <span className={['flex-1', item.done ? 'text-slate-500' : ''].join(' ')}>
                        {item.text}
                      </span>
                      <Badge variant={item.done ? 'success' : item.required ? 'danger' : 'muted'}>
                        {item.done ? labels.done : item.required ? labels.blocking : labels.optional}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-xs text-slate-500">
                {fmt(labels.requiredComplete, { done: requiredDone, total: requiredItems.length })}
              </p>
            </div>

            {/* ——— Blockers / ready ——— */}
            {isBlocked ? (
              <div role="alert" data-testid="advance-gate-blockers" className="alert alert-red">
                <p className="alert-title text-red-800">
                  <span aria-hidden="true">⚠</span>{' '}
                  {fmt(labels.blockersTitle, { count: blockers.length })}
                </p>
                <ul data-testid="advance-gate-blocker-list" className="list-none p-0">
                  {blockers.map((b) => (
                    <li key={b.id} data-testid="advance-gate-blocker-item" className="text-xs text-red-900">
                      <span aria-hidden="true">✗</span> {b.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div role="status" data-testid="advance-gate-ready" className="alert alert-green text-xs">
                <span aria-hidden="true">✓</span> {labels.readyAlert}
              </div>
            )}

            {/* ——— Notes ——— */}
            <div className="grid gap-1">
              <label htmlFor="advance-gate-notes" className="text-sm font-medium text-slate-700">
                {labels.notesLabel} <span aria-label="required">*</span>
              </label>
              <Textarea
                id="advance-gate-notes"
                rows={3}
                placeholder={labels.notesPlaceholder}
                disabled={isBlocked}
                aria-describedby="advance-gate-notes-hint"
                className={isBlocked ? 'opacity-50' : undefined}
                {...register('notes')}
              />
              <span id="advance-gate-notes-hint" className="text-xs text-slate-500">
                {labels.notesHint}
              </span>
            </div>

            {serverError ? (
              <div role="alert" data-testid="advance-gate-error" className="alert alert-red text-sm">
                {serverError}
              </div>
            ) : null}
          </form>
        )}
      </Modal.Body>

      {effectiveState === 'ready' && !success && (
        <Modal.Footer>
          <Button type="button" className="btn--secondary btn-sm text-sm" onClick={onClose} disabled={submitting}>
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            form="advance-gate-form"
            className="btn--primary btn-sm text-sm"
            disabled={!canAdvance || submitting || !advanceProjectGate}
          >
            {submitting ? labels.advancing : advanceLabel}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

export default AdvanceGateModal;
