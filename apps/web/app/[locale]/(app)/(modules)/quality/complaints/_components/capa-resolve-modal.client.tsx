'use client';

/**
 * MODAL — Resolve a CAPA action with e-sign (Wave E11, client island).
 *
 * Design-system conformance: mirrors the sibling MODAL-NCR-CLOSE e-sign block
 * (ncr-close-modal.client.tsx:179-200) and the CCP-deviation resolve e-sign block
 * (deviation-resolve-modal.client.tsx:162-184) 1:1 — a shadcn Modal with a read-only
 * summary, an e-sign block exposing the PIN field (type=password), useTransition for
 * the optimistic submit, and the action error surfaced VERBATIM.
 *
 * Wires the reviewed `resolveCapaAction` Server Action (backend DONE — imported,
 * passed in as a prop, never authored here). Contract: resolveCapaAction(id,
 * {signature:{password}}). The server signs the closure via signEvent (21 CFR
 * Part 11) and re-checks the grant; an esign_failed / forbidden result is shown
 * verbatim. No raw UUID is rendered — the action TYPE + description identify the row.
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';

import type { CapaActionRow, ResolveCapaActionAction } from './complaints-contracts';
import type { CapaResolveLabels } from './labels';

export function CapaResolveModal({
  open,
  onOpenChange,
  capa,
  labels,
  resolveCapaActionAction,
  onResolved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capa: CapaActionRow;
  labels: CapaResolveLabels;
  resolveCapaActionAction: ResolveCapaActionAction;
  onResolved?: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = password.length > 0;

  function reset() {
    setPassword('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (password.length === 0) {
      setError(labels.validation.passwordRequired);
      return;
    }

    startTransition(async () => {
      const result = await resolveCapaActionAction(capa.id, { signature: { password } });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.error));
        return;
      }
      reset();
      onOpenChange(false);
      onResolved?.();
    });
  }

  const summaryRows: Array<[string, string]> = [
    [labels.summaryType, labels.actionTypeValues[capa.actionType] ?? capa.actionType],
    [labels.summaryDescription, capa.description],
  ];

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="capa_resolve_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="capa-resolve-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* Read-only summary — action TYPE + description (never a UUID). */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            {summaryRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>

          {/* E-sign PIN block — type=password (parity NCR-CLOSE / CCP-deviation resolve). */}
          <div data-testid="capa-resolve-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
            <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">
                {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="password"
                data-testid="capa-resolve-password"
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
            <p role="alert" data-testid="capa-resolve-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="capa-resolve-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="capa-resolve-submit"
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
