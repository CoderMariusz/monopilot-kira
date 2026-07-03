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
 *   - incompleteRequired = items.filter(required && !done) → computed locally from the items prop (no override
 *     mutation; toggling lives in GateChecklistPanel/T-107). Checklist completeness is advisory, so submit stays
 *     available; hard guards are enforced by advanceProjectGate.
 *   - gate-transition card + dashed-when-blocked arrow → CSS card; arrow exposes data-blocked for parity evidence.
 *   - Progress div + per-item rows with Done/Required/Optional badges → role="progressbar" + @monopilot/ui Badge
 *     (every status pairs colour with a glyph + text — a11y: never colour-only).
 *   - amber advisory box / green ready alert         → role="note" (advisory) / role="status" (ready) notices.
 *   - notes <textarea>                               → @monopilot/ui Textarea, RHF-bound.
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
  override?: { note: string };
}) => Promise<{
  ok: true;
  data?: unknown;
} | {
  ok: false;
  error: string;
  status: number;
  blockers?: Array<{ id?: string; code?: string; text?: string; label?: string; message?: string }>;
  missing?: string[];
}>;

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
  requiredIncompleteWarning: string; // "{count} required checklist items are not complete — you can still advance."
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
  esignRequiredError?: string;
  blockersPresentError?: string; // "{count} blocker(s) prevent advancement."
  /** Honest per-code failure messages (F-C09 — every ok:false must be visible). */
  alreadyClosedError?: string;
  adjacencyError?: string;
  notFoundError?: string;
  fgLinkedError?: string;
  softGateBlockedError?: string;
  overrideNoteLabel?: string;
  overrideNoteHint?: string;
  overrideConfirm?: string;
};

function fmt(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

type NotesForm = { notes: string };

function resolveSubmitError(
  result: Awaited<ReturnType<AdvanceProjectGateAction>>,
  labels: AdvanceGateLabels,
): string {
  if (result.ok) return '';
  if (result.error === 'ESIGN_REQUIRED') {
    return labels.esignRequiredError ??
      'Gate G4 e-signature approval is required before handoff — approve it on the Approval stage.';
  }
  if (result.error === 'BLOCKERS_PRESENT') {
    const blockers = result.blockers ?? [];
    const title = labels.blockersPresentError
      ? fmt(labels.blockersPresentError, { count: blockers.length })
      : fmt(labels.blockersTitle, { count: blockers.length || 1 });
    const details = blockers
      .map((blocker) => blocker.text ?? blocker.label ?? blocker.message ?? blocker.code ?? blocker.id)
      .filter((value): value is string => Boolean(value));
    return details.length > 0 ? `${title}\n${details.join('\n')}` : title;
  }
  if (result.error === 'SOFT_GATE_BLOCKED') {
    const missing = result.missing ?? [];
    const title = labels.softGateBlockedError ?? 'Required stage checks are incomplete. Add an override note to continue.';
    return missing.length > 0 ? `${title}\n${missing.join('\n')}` : title;
  }
  // F-C09 honesty: every ok:false path maps to a specific, human-readable message
  // (the modal NEVER closes on failure — see onSubmit). Codes without a dedicated
  // label still surface verbatim alongside the generic copy so terminal launch
  // failures (e.g. HANDOFF_BOM_NOT_APPROVED) are visible, never swallowed.
  if (result.error === 'ALREADY_CLOSED') {
    return labels.alreadyClosedError ??
      'This project is already launched — there is no further stage to advance to.';
  }
  if (result.error === 'ADJACENCY_VIOLATION') {
    return labels.adjacencyError ??
      'The project can only advance one stage at a time. Reload the page — the stage may have changed.';
  }
  if (result.error === 'FORBIDDEN') {
    return labels.forbidden;
  }
  if (result.error === 'NOT_FOUND') {
    return labels.notFoundError ?? 'This project could not be found. It may have been deleted.';
  }
  if (result.error === 'FG_ALREADY_LINKED') {
    return labels.fgLinkedError ??
      'The Finished Good code is already linked to another active NPD project.';
  }
  if (result.error && result.error !== 'PERSISTENCE_FAILED') {
    return `${labels.error}\n${result.error}`;
  }
  return labels.error;
}

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
  onESignRequired,
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
  /** Called when the server reports that an e-sign approval must be collected first. */
  onESignRequired?: () => void;
  onClose: () => void;
}) {
  const { register, handleSubmit, reset, formState, watch } = useForm<NotesForm>({
    defaultValues: { notes: '' },
    mode: 'onChange',
  });
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [softGateMissing, setSoftGateMissing] = React.useState<string[]>([]);
  const [success, setSuccess] = React.useState(false);
  const noteValue = watch('notes');

  React.useEffect(() => {
    if (!open) {
      reset({ notes: '' });
      setServerError(null);
      setSoftGateMissing([]);
      setSuccess(false);
    }
  }, [open, reset]);

  // 2026-06-06 pivot: the gate checklist is ADVISORY in the simplified R&D pipeline
  // — the items are shown as progress/info but DO NOT hard-block the stage advance
  // (the user has no UI to tick them; brief/stage fields are the real completeness
  // signal). The one hard regulatory gate is the approval→handoff e-signature, which
  // is enforced server-side (advanceProjectGate → ESIGN_REQUIRED) and surfaced here as
  // a serverError. So the modal always renders ready and never gates on the checklist.
  const effectiveState: AdvanceGateState = state;

  const incompleteRequired = React.useMemo(() => items.filter((i) => i.required && !i.done), [items]);
  const requiredItems = React.useMemo(() => items.filter((i) => i.required), [items]);
  const requiredDone = requiredItems.filter((i) => i.done).length;
  const pct = items.length
    ? Math.round((items.filter((i) => i.done).length / items.length) * 100)
    : 0;

  const isBlocked = false; // checklist is advisory; see note above
  const overrideMode = softGateMissing.length > 0;
  const overrideNote = noteValue.trim();
  const canAdvance = !overrideMode || overrideNote.length > 0; // notes optional until a soft-gate override is requested
  const submitting = formState.isSubmitting;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const trimmedNotes = values.notes.trim();
      const result = await advanceProjectGate?.({
        projectId: project.id,
        targetGate: gateInfo.next,
        notes: trimmedNotes,
        ...(overrideMode ? { override: { note: trimmedNotes } } : {}),
      });
      if (result?.ok) {
        setSuccess(true);
        onAdvanced?.();
      } else if (result?.error === 'ESIGN_REQUIRED') {
        onESignRequired?.();
        setServerError(resolveSubmitError(result, labels));
      } else if (result?.error === 'SOFT_GATE_BLOCKED') {
        setSoftGateMissing(result.missing ?? []);
        setServerError(result ? resolveSubmitError(result, labels) : labels.error);
      } else {
        setServerError(result ? resolveSubmitError(result, labels) : labels.error);
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

            {/* ——— Advisory pending items / ready ——— */}
            {incompleteRequired.length > 0 ? (
              <div role="note" data-testid="advance-gate-required-warning" className="alert alert-amber">
                <p className="alert-title text-amber-800">
                  <span aria-hidden="true">ℹ</span>{' '}
                  {fmt(labels.requiredIncompleteWarning, { count: incompleteRequired.length })}
                </p>
                <ul data-testid="advance-gate-required-warning-list" className="list-none p-0">
                  {incompleteRequired.map((b) => (
                    <li key={b.id} data-testid="advance-gate-required-warning-item" className="text-xs text-amber-900">
                      <span aria-hidden="true">○</span> {b.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div role="status" data-testid="advance-gate-ready" className="alert alert-green text-xs">
                <span aria-hidden="true">✓</span> {labels.readyAlert}
              </div>
            )}

            {softGateMissing.length > 0 ? (
              <div role="alert" data-testid="advance-gate-soft-block" className="alert alert-amber">
                <p className="alert-title text-amber-800">
                  {labels.softGateBlockedError ?? 'Required stage checks are incomplete. Add an override note to continue.'}
                </p>
                <ul data-testid="advance-gate-soft-block-list" className="list-none p-0">
                  {softGateMissing.map((missing) => (
                    <li key={missing} data-testid="advance-gate-soft-block-item" className="text-xs text-amber-900">
                      <span aria-hidden="true">○</span> {missing}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* ——— Notes ——— */}
            <div className="grid gap-1">
              <label htmlFor="advance-gate-notes" className="text-sm font-medium text-slate-700">
                {overrideMode ? labels.overrideNoteLabel ?? 'Override note' : labels.notesLabel}
              </label>
              <Textarea
                id="advance-gate-notes"
                rows={3}
                placeholder={labels.notesPlaceholder}
                disabled={isBlocked}
                aria-describedby="advance-gate-notes-hint"
                className={isBlocked ? 'opacity-50' : undefined}
                maxLength={2000}
          {...register('notes')}
              />
              <span id="advance-gate-notes-hint" className="text-xs text-slate-500">
                {overrideMode
                  ? labels.overrideNoteHint ?? 'Required to override incomplete stage checks.'
                  : labels.notesHint}
              </span>
            </div>

            {serverError ? (
              <div role="alert" data-testid="advance-gate-error" className="alert alert-red text-sm">
                {serverError.split('\n').map((line) => (
                  <div key={line}>{line}</div>
                ))}
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
            {submitting ? labels.advancing : overrideMode ? labels.overrideConfirm ?? 'Override and advance' : advanceLabel}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

export default AdvanceGateModal;
