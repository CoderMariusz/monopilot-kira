'use client';

/**
 * MODAL — Resolve CCP deviation with e-sign (Wave E3, client island).
 *
 * Design-system conformance: the JSX prototype CcpDeviationLogModal
 * (prototypes/design/Monopilot Design System/quality/modals.jsx:554-594) is a
 * manual-log-deviation form (CCP picker + observed value + severity +
 * corrective action + e-sign PIN). The reviewed backend exposes RESOLVE, not
 * manual log, so this island translates that modal's two load-bearing regions —
 * the corrective-action-taken field (modals.jsx:580-582) and the e-sign PIN
 * block (modals.jsx:585-591) — onto `resolveCcpDeviation(id, { actionTaken,
 * disposition, signature:{password} })`, plus the canonical disposition enum.
 * Markup/density follows the sibling MODAL-CCP-RECORD island
 * (ccp-record-modal.client.tsx) + MODAL-HOLD-RELEASE e-sign block: shadcn Modal
 * (no raw select), useTransition for the optimistic submit, action error
 * surfaced VERBATIM, PIN is type=password.
 *
 * When a linked hold exists, an informational prompt + deep-link is shown;
 * resolving the deviation does NOT auto-release the hold (operators manage holds
 * separately via /quality/holds/{id}).
 */

import Link from 'next/link';
import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import {
  DEVIATION_DISPOSITIONS,
  type DeviationDisposition,
  type DeviationRow,
  type ResolveDeviationAction,
} from './ccp-deviations-contracts';
import type { DeviationResolveLabels } from './labels';

export function DeviationResolveModal({
  open,
  onOpenChange,
  deviation,
  labels,
  locale,
  resolveAction,
  onResolved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviation: DeviationRow;
  labels: DeviationResolveLabels;
  locale: string;
  resolveAction: ResolveDeviationAction;
  onResolved?: () => void;
}) {
  const [actionTaken, setActionTaken] = useState('');
  const [disposition, setDisposition] = useState<DeviationDisposition | ''>('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmedAction = actionTaken.trim();
  const valid = trimmedAction.length > 0 && disposition !== '' && password.length > 0;

  function reset() {
    setActionTaken('');
    setDisposition('');
    setPassword('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (trimmedAction.length === 0) return setError(labels.validation.actionRequired);
    if (disposition === '') return setError(labels.validation.dispositionRequired);
    if (password.length === 0) return setError(labels.validation.passwordRequired);

    startTransition(async () => {
      const result = await resolveAction(deviation.id, {
        actionTaken: trimmedAction,
        disposition,
        signature: { password },
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      reset();
      onOpenChange(false);
      onResolved?.();
    });
  }

  const readingText =
    deviation.measuredValue !== null
      ? `${deviation.measuredValue}${deviation.uom ? ` ${deviation.uom}` : ''}`
      : '—';

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="ccp_deviation_resolve_modal" dismissible={!pending}>
      <Modal.Header title={labels.title.replace('{ccpCode}', deviation.ccpCode)} />
      <Modal.Body>
        <div data-testid="deviation-resolve-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <dt className="text-slate-500">{labels.reading}</dt>
            <dd className="font-mono font-medium text-slate-800" data-testid="deviation-resolve-reading">
              <span className="mr-2 font-semibold text-slate-900">{deviation.ccpCode}</span>
              {readingText}
            </dd>
          </dl>

          {deviation.hold ? (
            <div
              role="note"
              data-testid="deviation-resolve-hold-prompt"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              <p className="font-semibold">{labels.holdPrompt.title}</p>
              <p className="mt-1">{labels.holdPrompt.body}</p>
              <Link
                href={`/${locale}/quality/holds/${deviation.hold.id}`}
                data-testid="deviation-resolve-hold-link"
                className="mt-2 inline-block font-mono font-medium text-sky-800 underline"
              >
                {labels.holdPrompt.linkLabel.replace('{holdNumber}', deviation.hold.holdNumber)}
              </Link>
            </div>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.actionTaken} <span aria-hidden className="text-red-500">*</span>
            </span>
            <textarea
              data-testid="deviation-resolve-action"
              value={actionTaken}
              onChange={(e) => {
                setActionTaken(e.target.value);
                setError(null);
              }}
              placeholder={labels.actionTakenPlaceholder}
              rows={3}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.actionTakenHelp}</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.disposition} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div data-testid="deviation-resolve-disposition">
              <Select
                aria-label={labels.disposition}
                value={disposition}
                onValueChange={(v) => {
                  setDisposition(v as DeviationDisposition);
                  setError(null);
                }}
                placeholder={labels.dispositionPlaceholder}
                options={DEVIATION_DISPOSITIONS.map((d) => ({ value: d, label: labels.dispositionOptions[d] }))}
              />
            </div>
            <span className="text-xs text-slate-400">{labels.dispositionHelp}</span>
          </label>

          <div data-testid="deviation-resolve-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
            <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">
                {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="password"
                data-testid="deviation-resolve-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder={labels.esign.passwordPlaceholder}
                autoComplete="off"
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>
            <p className="mt-1 text-[10px] leading-snug text-slate-400">{labels.esign.passwordHelp}</p>
          </div>

          {error && (
            <p role="alert" data-testid="deviation-resolve-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="deviation-resolve-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="deviation-resolve-submit"
          disabled={!valid || pending}
          onClick={submit}
          title={!valid ? labels.formIncomplete : undefined}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-emerald-700 disabled:opacity-50"
        >
          🔒 {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
