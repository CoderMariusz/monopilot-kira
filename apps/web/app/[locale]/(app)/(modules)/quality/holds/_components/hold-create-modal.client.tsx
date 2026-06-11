'use client';

/**
 * MODAL-HOLD-CREATE — create a quality hold (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   modals.jsx:22-96 (HoldCreateModal):
 *     hold target type pills (LP/Batch/WO/PO/GRN)   → modals.jsx:42-48
 *     reference input                               → modals.jsx:50-52
 *     hold reason select / notes                    → modals.jsx:54-65
 *     priority pills (low/medium/high/critical)     → modals.jsx:67-76
 *     critical SoD warning (V-QA-HOLD-006)          → modals.jsx:78-83
 *     estimated release date                        → modals.jsx:91-93
 *     footer Cancel / Create Hold (disabled until valid) → modals.jsx:37-40
 *
 * Wires the reviewed createHold Server Action (imported, never authored). The
 * action validates server-side and gates quality.hold.create; this island only
 * collects the payload and surfaces the action's error/forbidden verbatim.
 *
 * DEVIATIONS (red-lines): the prototype's QA_HOLD_REASONS reason-code dropdown +
 * "Disposition (optional)" + auto-calculated duration helper are reduced to a
 * free-text reason (the backend accepts reasonCodeId OR reasonText; the reference
 * picker autocomplete BL-QA-07 is explicitly deferred). The reference + LP ids are
 * honest UUID inputs (P1: comma-separated LP ids with a hint) — no fake search.
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';

import type { createHold } from '../../_actions/hold-actions';
import type { HoldRefType } from './holds-list.client';

const REF_TYPES: HoldRefType[] = ['lp', 'batch', 'wo', 'po', 'grn'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export type HoldCreateLabels = {
  title: string;
  subtitle: string;
  refType: string;
  refTypeHelp: string;
  refTypeOptions: Record<HoldRefType, string>;
  referenceId: string;
  referenceIdHelp: string;
  referenceIdPlaceholder: string;
  lpIds: string;
  lpIdsHelp: string;
  lpIdsPlaceholder: string;
  reasonText: string;
  reasonTextHelp: string;
  reasonTextPlaceholder: string;
  priority: string;
  priorityOptions: Record<string, string>;
  estRelease: string;
  criticalWarning: string;
  cancel: string;
  submit: string;
  submitting: string;
  validation: { referenceRequired: string; reasonRequired: string };
  error: string;
  success: string;
};

export function HoldCreateModal({
  open,
  onOpenChange,
  labels,
  createHoldAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: HoldCreateLabels;
  createHoldAction: typeof createHold;
}) {
  const [refType, setRefType] = useState<HoldRefType>('lp');
  const [referenceId, setReferenceId] = useState('');
  const [lpIdsRaw, setLpIdsRaw] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('medium');
  const [estRelease, setEstRelease] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmedRef = referenceId.trim();
  const trimmedReason = reasonText.trim();
  const valid = trimmedRef.length > 0 && trimmedReason.length > 0;
  const isCritical = priority === 'critical';

  function reset() {
    setRefType('lp');
    setReferenceId('');
    setLpIdsRaw('');
    setReasonText('');
    setPriority('medium');
    setEstRelease('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (!valid) {
      setError(trimmedRef.length === 0 ? labels.validation.referenceRequired : labels.validation.reasonRequired);
      return;
    }
    const lpIds = lpIdsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    startTransition(async () => {
      const result = await createHoldAction({
        referenceType: refType,
        referenceId: trimmedRef,
        reasonText: trimmedReason,
        priority,
        ...(lpIds.length > 0 ? { lpIds } : {}),
        ...(estRelease ? { estimatedReleaseAt: estRelease } : {}),
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      close();
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="hold_create_modal">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="hold-create-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* Reference type pills (parity modals.jsx:42-48) — no raw <select>. */}
          <fieldset>
            <legend className="mb-1 font-medium text-slate-700">{labels.refType}</legend>
            <div className="flex flex-wrap gap-1" role="group" aria-label={labels.refType}>
              {REF_TYPES.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  data-testid={`hold-create-reftype-${rt}`}
                  aria-pressed={refType === rt}
                  onClick={() => setRefType(rt)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs transition',
                    refType === rt
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  ].join(' ')}
                >
                  {labels.refTypeOptions[rt]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">{labels.refTypeHelp}</p>
          </fieldset>

          {/* Reference UUID input (parity modals.jsx:50-52). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.referenceId} <span aria-hidden className="text-red-500">*</span>
            </span>
            <input
              type="text"
              data-testid="hold-create-reference"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder={labels.referenceIdPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.referenceIdHelp}</span>
          </label>

          {/* Optional comma-separated LP ids (honest simple, P1). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.lpIds}</span>
            <textarea
              data-testid="hold-create-lpids"
              value={lpIdsRaw}
              onChange={(e) => setLpIdsRaw(e.target.value)}
              placeholder={labels.lpIdsPlaceholder}
              rows={2}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.lpIdsHelp}</span>
          </label>

          {/* Reason free text (parity modals.jsx:54-65). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.reasonText} <span aria-hidden className="text-red-500">*</span>
            </span>
            <textarea
              data-testid="hold-create-reason"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={labels.reasonTextPlaceholder}
              rows={3}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.reasonTextHelp}</span>
          </label>

          {/* Priority pills (parity modals.jsx:67-76). */}
          <fieldset>
            <legend className="mb-1 font-medium text-slate-700">{labels.priority}</legend>
            <div className="flex flex-wrap gap-1" role="group" aria-label={labels.priority}>
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  data-testid={`hold-create-priority-${p}`}
                  aria-pressed={priority === p}
                  onClick={() => setPriority(p)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs capitalize transition',
                    priority === p
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  ].join(' ')}
                >
                  {labels.priorityOptions[p] ?? p}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Critical SoD warning (parity modals.jsx:78-83). */}
          {isCritical && (
            <div
              role="note"
              data-testid="hold-create-sod-warning"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              ⚠ {labels.criticalWarning}
            </div>
          )}

          {/* Estimated release date (parity modals.jsx:91-93). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.estRelease}</span>
            <input
              type="date"
              data-testid="hold-create-estrelease"
              value={estRelease}
              onChange={(e) => setEstRelease(e.target.value)}
              className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" data-testid="hold-create-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="hold-create-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="hold-create-submit"
          disabled={!valid || pending}
          onClick={submit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
