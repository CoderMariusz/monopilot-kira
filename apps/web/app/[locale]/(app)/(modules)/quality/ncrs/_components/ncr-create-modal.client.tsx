'use client';

/**
 * MODAL-NCR-CREATE — create a Non-Conformance Report (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   modals.jsx:299-382 (NcrCreateModal):
 *     NCR type select (required)                         → modals.jsx:320-329
 *     severity pills (critical/major/minor) + due window → modals.jsx:330-336
 *     title (required)                                   → modals.jsx:339
 *     description (required, min 20 / max 2000 + counter)→ modals.jsx:341-343
 *     affected qty (kg)                                  → modals.jsx:373
 *     footer Cancel / Submit NCR (disabled until valid)  → modals.jsx:313-317
 *
 * Wires the reviewed createNcr Server Action (imported, never authored). The
 * action validates server-side and gates the create permission; this island only
 * collects the payload and surfaces the action's error/forbidden verbatim. The
 * type is a shadcn Select (NO raw <select>); severity is parity pills with the
 * critical dual-sign SoD warning copy (V-QA-NCR-006).
 *
 * DEVIATIONS (red-lines, documented per UI-PROTOTYPE-PARITY-POLICY.md):
 *   - "Save as draft" footer action (modals.jsx:315) is DEFERRED — the create
 *     action submits an NCR; draft authoring is a separate workflow slice.
 *   - The yield-issue and allergen-deviation conditional sub-forms
 *     (modals.jsx:345-363) are OUT OF SCOPE for this read/create slice (the
 *     backend createNcr contract does not yet accept those structured fields).
 *   - Source-reference / Product / Detected-at / Detected-location / Immediate
 *     action / Assign-to selects (modals.jsx:365-379) collapse to affected-qty;
 *     a product/hold picker would re-introduce the audit-#4 raw-UUID antipattern
 *     with no NCR-side resolver, so linked records are established from the holds
 *     side and surfaced read-only on the detail page.
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import {
  NCR_SEVERITIES,
  NCR_TYPES,
  type CreateNcrAction,
  type NcrSeverity,
  type NcrType,
} from './ncr-contracts';

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 2000;

export type NcrCreateLabels = {
  title: string;
  subtitle: string;
  ncrType: string;
  ncrTypeHelp: string;
  ncrTypePlaceholder: string;
  ncrTypeOptions: Record<string, string>;
  severity: string;
  severityHelp: string;
  severityOptions: Record<string, string>;
  severityWindow: Record<string, string>;
  criticalWarning: string;
  titleField: string;
  titlePlaceholder: string;
  description: string;
  descriptionHelp: string;
  descriptionPlaceholder: string;
  descriptionMinError: string;
  linkedHold: string;
  linkedHoldHelp: string;
  linkedHoldPlaceholder: string;
  linkedHoldSearchLabel: string;
  linkedHoldSearching: string;
  linkedHoldNoMatch: string;
  linkedHoldChip: string;
  linkedHoldClear: string;
  affectedQty: string;
  affectedQtyPlaceholder: string;
  cancel: string;
  submit: string;
  submitting: string;
  validation: { titleRequired: string; descriptionRequired: string };
  error: string;
  success: string;
};

export function NcrCreateModal({
  open,
  onOpenChange,
  labels,
  createNcrAction,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: NcrCreateLabels;
  createNcrAction: CreateNcrAction;
  onCreated?: (created: { id: string; ncrNumber: string }) => void;
}) {
  const [ncrType, setNcrType] = useState<NcrType>('quality');
  const [severity, setSeverity] = useState<NcrSeverity>('major');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [affectedQty, setAffectedQty] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmedTitle = title.trim();
  const trimmedDesc = description.trim();
  const descTooShort = trimmedDesc.length > 0 && trimmedDesc.length < DESCRIPTION_MIN;
  const valid = trimmedTitle.length > 0 && trimmedDesc.length >= DESCRIPTION_MIN;
  const isCritical = severity === 'critical';

  function reset() {
    setNcrType('quality');
    setSeverity('major');
    setTitle('');
    setDescription('');
    setAffectedQty('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (trimmedTitle.length === 0) {
      setError(labels.validation.titleRequired);
      return;
    }
    if (trimmedDesc.length < DESCRIPTION_MIN) {
      setError(labels.validation.descriptionRequired);
      return;
    }

    startTransition(async () => {
      const result = await createNcrAction({
        ncrType,
        severity,
        title: trimmedTitle,
        description: trimmedDesc,
        ...(affectedQty.trim() ? { affectedQtyKg: affectedQty.trim() } : {}),
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      const created = result.data;
      reset();
      onOpenChange(false);
      onCreated?.(created);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="ncr_create_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="ncr-create-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* NCR type (parity modals.jsx:320-329) — shadcn Select, no raw <select>. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.ncrType} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div data-testid="ncr-create-type">
              <Select
                aria-label={labels.ncrType}
                value={ncrType}
                onValueChange={(v) => setNcrType(v as NcrType)}
                placeholder={labels.ncrTypePlaceholder}
                options={NCR_TYPES.map((ty) => ({ value: ty, label: labels.ncrTypeOptions[ty] }))}
              />
            </div>
            <span className="text-xs text-slate-400">{labels.ncrTypeHelp}</span>
          </label>

          {/* Severity pills (parity modals.jsx:330-336) + response window. */}
          <fieldset>
            <legend className="mb-1 font-medium text-slate-700">
              {labels.severity} <span aria-hidden className="text-red-500">*</span>
            </legend>
            <div className="flex flex-wrap gap-1" role="group" aria-label={labels.severity}>
              {NCR_SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`ncr-create-severity-${s}`}
                  aria-pressed={severity === s}
                  onClick={() => setSeverity(s)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs capitalize transition',
                    severity === s
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  ].join(' ')}
                >
                  {labels.severityOptions[s]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400" data-testid="ncr-create-severity-window">
              {labels.severityHelp.replace('{window}', labels.severityWindow[severity])}
            </p>
          </fieldset>

          {/* Critical SoD / dual-sign warning (parity QA-009a V-QA-NCR-006). */}
          {isCritical && (
            <div
              role="note"
              data-testid="ncr-create-sod-warning"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              ⚠ {labels.criticalWarning}
            </div>
          )}

          {/* Title (parity modals.jsx:339). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.titleField} <span aria-hidden className="text-red-500">*</span>
            </span>
            <input
              type="text"
              data-testid="ncr-create-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={labels.titlePlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {/* Description (parity modals.jsx:341-343) — min 20 / max 2000 + counter. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.description} <span aria-hidden className="text-red-500">*</span>
            </span>
            <textarea
              data-testid="ncr-create-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              rows={4}
              placeholder={labels.descriptionPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            {descTooShort ? (
              <span data-testid="ncr-create-description-error" className="text-xs text-red-600">
                {labels.descriptionMinError}
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                {labels.descriptionHelp.replace('{count}', String(trimmedDesc.length))}
              </span>
            )}
          </label>

          {/* Affected qty (parity modals.jsx:373). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.affectedQty}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              data-testid="ncr-create-affectedqty"
              value={affectedQty}
              onChange={(e) => setAffectedQty(e.target.value)}
              placeholder={labels.affectedQtyPlaceholder}
              className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5 font-mono focus:border-slate-400 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" data-testid="ncr-create-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="ncr-create-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="ncr-create-submit"
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
