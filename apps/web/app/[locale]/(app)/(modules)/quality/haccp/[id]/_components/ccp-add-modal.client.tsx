'use client';

/**
 * MODAL-CCP-ADD — add a CCP to a HACCP plan (Wave E3, client island).
 *
 * Design-system conformance: parity with the prototype's "＋ Add reading" /
 * CCP card grid (prototypes/design/Monopilot Design System/quality/
 * haccp-screens.jsx:65-101) and the sibling MODAL-CCP-CREATE island
 * (ccp-monitoring/_components/ccp-create-modal.client.tsx): shadcn Modal +
 * Select (no raw <select>; no @radix-ui/* outside packages/ui), useTransition
 * for the optimistic submit, the action's error/forbidden surfaced verbatim.
 *
 * Wires the reviewed `upsertCcp` Server Action (haccp-actions.ts) WITH this
 * plan's `plan_id` so the CCP is linked to the plan — imported by the page and
 * passed in as a prop, NEVER authored here. The action validates server-side
 * (zod) and is gated on `quality.haccp.plan_edit`. Decimal limits are sent as
 * STRINGS (never coerced to a JS number); an omitted/blank bound becomes `null`
 * for a one-sided critical limit. `is_active` is forced true (a plan CCP is
 * active by definition; the detail screen has no de-activate control).
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type { HaccpCcpRow, HazardType, UpsertCcpAction } from '../../_components/haccp-contracts';
import { HAZARD_TYPES } from '../../_components/labels';
import type { CcpAddLabels } from '../../_components/labels';

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Compares two decimal STRINGS without float coercion (mirrors the action's guard). */
function compareDecimals(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}

export function CcpAddModal({
  open,
  onOpenChange,
  planId,
  labels,
  upsertCcpAction,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the plan this CCP is linked to (passed straight through as upsertCcp.plan_id). */
  planId: string;
  labels: CcpAddLabels;
  upsertCcpAction: UpsertCcpAction;
  onSaved?: (ccp: HaccpCcpRow) => void;
}) {
  const [ccpCode, setCcpCode] = useState('');
  const [name, setName] = useState('');
  const [processStep, setProcessStep] = useState('');
  const [hazardType, setHazardType] = useState<HazardType | ''>('');
  const [limitMin, setLimitMin] = useState('');
  const [limitMax, setLimitMax] = useState('');
  const [unit, setUnit] = useState('');
  const [frequency, setFrequency] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Required: code + name + process step + hazard type. Limits/unit/frequency optional.
  const valid =
    ccpCode.trim() !== '' && name.trim() !== '' && processStep.trim() !== '' && hazardType !== '';

  function reset() {
    setCcpCode('');
    setName('');
    setProcessStep('');
    setHazardType('');
    setLimitMin('');
    setLimitMax('');
    setUnit('');
    setFrequency('');
    setCorrectiveAction('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (ccpCode.trim() === '') return setError(labels.validation.ccpCodeRequired);
    if (name.trim() === '') return setError(labels.validation.nameRequired);
    if (processStep.trim() === '') return setError(labels.validation.processStepRequired);
    if (hazardType === '') return setError(labels.validation.hazardTypeRequired);

    // Decimal limits (accept a comma as the decimal separator, normalize to '.').
    const minRaw = limitMin.trim().replace(',', '.');
    const maxRaw = limitMax.trim().replace(',', '.');
    if (minRaw !== '' && !DECIMAL_RE.test(minRaw)) return setError(labels.validation.limitNumeric);
    if (maxRaw !== '' && !DECIMAL_RE.test(maxRaw)) return setError(labels.validation.limitNumeric);
    if (minRaw !== '' && maxRaw !== '' && compareDecimals(minRaw, maxRaw) > 0) {
      return setError(labels.validation.limitOrder);
    }

    const payload = {
      ccp_code: ccpCode.trim(),
      name: name.trim(),
      process_step: processStep.trim(),
      hazard_type: hazardType,
      critical_limit_min: minRaw === '' ? null : minRaw,
      critical_limit_max: maxRaw === '' ? null : maxRaw,
      ...(unit.trim() ? { unit: unit.trim() } : {}),
      ...(frequency.trim() ? { monitoring_frequency: frequency.trim() } : {}),
      ...(correctiveAction.trim() ? { corrective_action: correctiveAction.trim() } : {}),
      plan_id: planId,
      is_active: true,
    } as const;

    startTransition(async () => {
      const result = await upsertCcpAction(payload);
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      const saved = result.data;
      reset();
      onOpenChange(false);
      onSaved?.(saved);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="haccp_ccp_add_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="haccp-ccp-add-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* CCP code. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.ccpCode} <span aria-hidden className="text-red-500">*</span>
            </span>
            <input
              type="text"
              data-testid="haccp-ccp-add-code"
              value={ccpCode}
              onChange={(e) => {
                setCcpCode(e.target.value);
                setError(null);
              }}
              placeholder={labels.ccpCodePlaceholder}
              className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 font-mono focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.ccpCodeHelp}</span>
          </label>

          {/* Name. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.name} <span aria-hidden className="text-red-500">*</span>
            </span>
            <input
              type="text"
              data-testid="haccp-ccp-add-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder={labels.namePlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {/* Process step. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.processStep} <span aria-hidden className="text-red-500">*</span>
            </span>
            <input
              type="text"
              data-testid="haccp-ccp-add-step"
              value={processStep}
              onChange={(e) => {
                setProcessStep(e.target.value);
                setError(null);
              }}
              placeholder={labels.processStepPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {/* Hazard type (shadcn Select — no raw <select>). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.hazardType} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div data-testid="haccp-ccp-add-hazard">
              <Select
                aria-label={labels.hazardType}
                value={hazardType}
                placeholder={labels.hazardTypePlaceholder}
                onValueChange={(v) => {
                  setHazardType(v as HazardType);
                  setError(null);
                }}
                options={HAZARD_TYPES.map((h) => ({ value: h, label: labels.hazardTypeOptions[h] }))}
              />
            </div>
          </label>

          {/* Critical limits (decimal strings; either bound may be blank for a one-sided limit) + unit. */}
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{labels.criticalLimitMin}</span>
              <input
                type="text"
                inputMode="decimal"
                data-testid="haccp-ccp-add-limit-min"
                value={limitMin}
                onChange={(e) => {
                  setLimitMin(e.target.value);
                  setError(null);
                }}
                placeholder={labels.criticalLimitMinPlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{labels.criticalLimitMax}</span>
              <input
                type="text"
                inputMode="decimal"
                data-testid="haccp-ccp-add-limit-max"
                value={limitMax}
                onChange={(e) => {
                  setLimitMax(e.target.value);
                  setError(null);
                }}
                placeholder={labels.criticalLimitMaxPlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{labels.unit}</span>
              <input
                type="text"
                data-testid="haccp-ccp-add-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={labels.unitPlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>
          </div>
          <span className="-mt-2 text-xs text-slate-400">{labels.limitHelp}</span>

          {/* Monitoring frequency. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.frequency}</span>
            <input
              type="text"
              data-testid="haccp-ccp-add-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder={labels.frequencyPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {/* Corrective action. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.correctiveAction}</span>
            <textarea
              data-testid="haccp-ccp-add-corrective"
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              placeholder={labels.correctiveActionPlaceholder}
              rows={2}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" data-testid="haccp-ccp-add-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="haccp-ccp-add-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="haccp-ccp-add-submit"
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
