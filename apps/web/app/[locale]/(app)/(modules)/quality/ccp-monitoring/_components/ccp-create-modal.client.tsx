'use client';

/**
 * MODAL-CCP-CREATE — create / edit a critical control point (Wave E3, client island).
 *
 * Closes the FIX-1 gap: the CCP-monitoring board (/quality/ccp-monitoring) could
 * RECORD readings but had no UI to CREATE a CCP, so the board was permanently
 * empty (haccp_ccps=0 live) and the empty-state CTA only linked back to /quality.
 *
 * Design-system conformance: no JSX prototype exists for a live CCP create modal
 * in prototypes/design/Monopilot Design System/quality/haccp-screens.jsx, so this
 * follows the sibling MODAL-INSPECTION-CREATE / MODAL-CCP-RECORD islands
 * (inspection-create-modal.client.tsx, ccp-record-modal.client.tsx): shadcn Modal
 * + Select (no raw <select>; no @radix-ui/* outside packages/ui), useTransition
 * for the optimistic submit, and the action's error/forbidden surfaced verbatim.
 *
 * Wires the reviewed `upsertCcp` Server Action (haccp-actions.ts:259), imported by
 * the page and passed in as a prop — NEVER authored here. The action validates
 * server-side (zod `upsertCcpSchema`) and is gated on `quality.haccp.plan_edit`
 * (creation stays plan_edit-only). This island only collects the snake_case
 * payload that schema expects, runs the same client-side guards for a fast reject
 * (required fields + decimal limits + min<=max), and refreshes the board on
 * success. Decimal limits are sent as STRINGS (never coerced to a JS number);
 * an omitted/blank bound becomes `null` for a one-sided critical limit.
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type { HazardType, UpsertCcpAction } from './ccp-contracts';
import { HAZARD_TYPES } from './labels';
import type { CcpCreateLabels } from './labels';

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Compares two decimal STRINGS without float coercion (mirrors the action's guard). */
function compareDecimals(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}

export type CcpCreateSuccess = { id: string; ccpCode: string };

export function CcpCreateModal({
  open,
  onOpenChange,
  labels,
  upsertCcpAction,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: CcpCreateLabels;
  upsertCcpAction: UpsertCcpAction;
  onSaved?: (result: CcpCreateSuccess) => void;
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
  const [isActive, setIsActive] = useState(true);
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
    setIsActive(true);
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
      is_active: isActive,
    } as const;

    startTransition(async () => {
      const result = await upsertCcpAction(payload);
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      const saved = { id: result.data.id, ccpCode: result.data.ccpCode };
      reset();
      onOpenChange(false);
      onSaved?.(saved);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="ccp_create_modal" dismissible={!pending}>
      <Modal.Header title={labels.titleCreate} />
      <Modal.Body>
        <div data-testid="ccp-create-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* CCP code. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.ccpCode} <span aria-hidden className="text-red-500">*</span>
            </span>
            <input
              type="text"
              data-testid="ccp-create-code"
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
              data-testid="ccp-create-name"
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
              data-testid="ccp-create-step"
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
            <div data-testid="ccp-create-hazard">
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

          {/* Critical limits (decimal strings; either bound may be blank for a one-sided limit). */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{labels.criticalLimitMin}</span>
              <input
                type="text"
                inputMode="decimal"
                data-testid="ccp-create-limit-min"
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
                data-testid="ccp-create-limit-max"
                value={limitMax}
                onChange={(e) => {
                  setLimitMax(e.target.value);
                  setError(null);
                }}
                placeholder={labels.criticalLimitMaxPlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>
          </div>
          <span className="-mt-2 text-xs text-slate-400">{labels.limitHelp}</span>

          {/* Unit + frequency. */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{labels.unit}</span>
              <input
                type="text"
                data-testid="ccp-create-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={labels.unitPlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{labels.frequency}</span>
              <input
                type="text"
                data-testid="ccp-create-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder={labels.frequencyPlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>
          </div>

          {/* Corrective action. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.correctiveAction}</span>
            <textarea
              data-testid="ccp-create-corrective"
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              placeholder={labels.correctiveActionPlaceholder}
              rows={2}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {/* Active toggle. */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="ccp-create-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="flex flex-col">
              <span className="font-medium text-slate-700">{labels.isActive}</span>
              <span className="text-xs text-slate-400">{labels.isActiveHelp}</span>
            </span>
          </label>

          {error && (
            <p role="alert" data-testid="ccp-create-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="ccp-create-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="ccp-create-submit"
          disabled={!valid || pending}
          onClick={submit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submitCreate}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
