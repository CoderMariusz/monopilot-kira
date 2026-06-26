'use client';

/**
 * CCP-ROW-ACTIONS — per-row Edit / Deactivate for a HACCP plan's CCPs
 * (closes the add-only dead-end on the plan detail screen).
 *
 * Parity model: technical/items/[item_code]/_components/
 *   supplier-spec-row-actions.client.tsx — a row-trigger pair ([Edit]/[Deactivate])
 *   that opens (a) an Edit modal PRE-POPULATED from the row and (b) a Deactivate
 *   confirm, both surfacing the action error inline via role="alert" and NEVER
 *   throwing (the Server Action's error/forbidden is rendered verbatim).
 *
 * The Edit modal REUSES the SAME field set as MODAL-CCP-ADD (ccp-add-modal.client):
 * ccp_code, name, process_step, hazard_type, critical_limit_min/max, unit,
 * monitoring_frequency, corrective_action, line_id — wired to the reviewed
 * `upsertCcp` Server Action (haccp-actions.ts) WITH the row's `id` so it takes
 * the EDIT (ON CONFLICT DO UPDATE) path. Deactivate calls the reviewed
 * `deactivateCcp(ccp.id)` (soft-delete: is_active=false). Both actions are
 * gated server-side on `quality.haccp.plan_edit`; this island never trusts a
 * client flag — the table only mounts it when `canEdit && isDraft`.
 *
 * Design-system conformance: shadcn Modal (@monopilot/ui/Modal) + Select
 * (@monopilot/ui/Select); no raw <select>, no @radix-ui/* outside packages/ui;
 * useTransition for the optimistic submit. Decimal limits are passed as STRINGS
 * (never coerced to a JS number); a blank bound becomes `null` for a one-sided
 * limit — identical to the add modal's guard.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type {
  DeactivateCcpAction,
  HaccpPlanCcp,
  HazardType,
  UpsertCcpAction,
} from '../../_components/haccp-contracts';
import { HAZARD_TYPES } from '../../_components/labels';
import type { CcpAddLabels, CcpRowActionsLabels } from '../../_components/labels';

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Compares two decimal STRINGS without float coercion (mirrors the action's guard). */
function compareDecimals(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}

export function CcpRowActions({
  ccp,
  labels,
  ccpAddLabels,
  upsertCcpAction,
  deactivateCcpAction,
}: {
  ccp: HaccpPlanCcp;
  labels: CcpRowActionsLabels;
  /** field labels shared with MODAL-CCP-ADD (the Edit modal is the same form). */
  ccpAddLabels: CcpAddLabels;
  upsertCcpAction: UpsertCcpAction;
  deactivateCcpAction: DeactivateCcpAction;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  // Edit form state — PRE-POPULATED from the row.
  const [ccpCode, setCcpCode] = useState(ccp.ccpCode);
  const [name, setName] = useState(ccp.name);
  const [processStep, setProcessStep] = useState(ccp.processStep);
  const [hazardType, setHazardType] = useState<HazardType>(ccp.hazardType);
  const [limitMin, setLimitMin] = useState(ccp.criticalLimitMin ?? '');
  const [limitMax, setLimitMax] = useState(ccp.criticalLimitMax ?? '');
  const [unit, setUnit] = useState(ccp.unit ?? '');
  const [frequency, setFrequency] = useState(ccp.monitoringFrequency ?? '');
  const [correctiveAction, setCorrectiveAction] = useState(ccp.correctiveAction ?? '');
  const [editError, setEditError] = useState<string | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Required: code + name + process step + hazard type. Limits/unit/frequency optional.
  const valid = ccpCode.trim() !== '' && name.trim() !== '' && processStep.trim() !== '' && hazardType !== ('' as HazardType);

  function resetEdit() {
    setCcpCode(ccp.ccpCode);
    setName(ccp.name);
    setProcessStep(ccp.processStep);
    setHazardType(ccp.hazardType);
    setLimitMin(ccp.criticalLimitMin ?? '');
    setLimitMax(ccp.criticalLimitMax ?? '');
    setUnit(ccp.unit ?? '');
    setFrequency(ccp.monitoringFrequency ?? '');
    setCorrectiveAction(ccp.correctiveAction ?? '');
    setEditError(null);
  }

  function openEdit() {
    resetEdit();
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    resetEdit();
  }

  function submitEdit() {
    setEditError(null);
    if (ccpCode.trim() === '') return setEditError(ccpAddLabels.validation.ccpCodeRequired);
    if (name.trim() === '') return setEditError(ccpAddLabels.validation.nameRequired);
    if (processStep.trim() === '') return setEditError(ccpAddLabels.validation.processStepRequired);

    // Decimal limits (accept a comma as the decimal separator, normalize to '.').
    const minRaw = limitMin.trim().replace(',', '.');
    const maxRaw = limitMax.trim().replace(',', '.');
    if (minRaw !== '' && !DECIMAL_RE.test(minRaw)) return setEditError(ccpAddLabels.validation.limitNumeric);
    if (maxRaw !== '' && !DECIMAL_RE.test(maxRaw)) return setEditError(ccpAddLabels.validation.limitNumeric);
    if (minRaw !== '' && maxRaw !== '' && compareDecimals(minRaw, maxRaw) > 0) {
      return setEditError(ccpAddLabels.validation.limitOrder);
    }

    const payload = {
      id: ccp.id,
      ccp_code: ccpCode.trim(),
      name: name.trim(),
      process_step: processStep.trim(),
      hazard_type: hazardType,
      critical_limit_min: minRaw === '' ? null : minRaw,
      critical_limit_max: maxRaw === '' ? null : maxRaw,
      unit: unit.trim(),
      monitoring_frequency: frequency.trim(),
      corrective_action: correctiveAction.trim(),
      line_id: ccp.lineId ?? null,
      is_active: true,
    } as const;

    startTransition(async () => {
      const result = await upsertCcpAction(payload);
      if (!result.ok) {
        setEditError(labels.editError.replace('{message}', result.message ?? result.reason));
        return;
      }
      setEditOpen(false);
      router.refresh();
    });
  }

  function submitDeactivate() {
    setDeactivateError(null);
    startTransition(async () => {
      const result = await deactivateCcpAction(ccp.id);
      if (!result.ok) {
        setDeactivateError(labels.deactivateError.replace('{message}', result.message ?? result.reason));
        return;
      }
      setDeactivateOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          data-testid={`haccp-ccp-edit-${ccp.id}`}
          onClick={openEdit}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {labels.edit}
        </button>
        <button
          type="button"
          data-testid={`haccp-ccp-deactivate-${ccp.id}`}
          onClick={() => {
            setDeactivateError(null);
            setDeactivateOpen(true);
          }}
          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
        >
          {labels.deactivate}
        </button>
      </div>

      {/* MODAL-CCP-EDIT — same field set as MODAL-CCP-ADD, pre-populated. */}
      <Modal
        open={editOpen}
        onOpenChange={(o) => (o ? setEditOpen(true) : closeEdit())}
        size="md"
        modalId="haccp_ccp_edit_modal"
        dismissible={!pending}
      >
        <Modal.Header title={labels.editTitle} />
        <Modal.Body>
          <div data-testid="haccp-ccp-edit-form" className="flex flex-col gap-4 text-sm">
            <p className="text-xs text-slate-500">{labels.editSubtitle}</p>

            {/* CCP code. */}
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {ccpAddLabels.ccpCode} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="text"
                data-testid="haccp-ccp-add-code"
                value={ccpCode}
                onChange={(e) => {
                  setCcpCode(e.target.value);
                  setEditError(null);
                }}
                placeholder={ccpAddLabels.ccpCodePlaceholder}
                className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 font-mono focus:border-slate-400 focus:outline-none"
              />
              <span className="text-xs text-slate-400">{ccpAddLabels.ccpCodeHelp}</span>
            </label>

            {/* Name. */}
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {ccpAddLabels.name} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="text"
                data-testid="haccp-ccp-add-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setEditError(null);
                }}
                placeholder={ccpAddLabels.namePlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>

            {/* Process step. */}
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {ccpAddLabels.processStep} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="text"
                data-testid="haccp-ccp-add-step"
                value={processStep}
                onChange={(e) => {
                  setProcessStep(e.target.value);
                  setEditError(null);
                }}
                placeholder={ccpAddLabels.processStepPlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>

            {/* Hazard type (shadcn Select — no raw <select>). */}
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {ccpAddLabels.hazardType} <span aria-hidden className="text-red-500">*</span>
              </span>
              <div data-testid="haccp-ccp-add-hazard">
                <Select
                  aria-label={ccpAddLabels.hazardType}
                  value={hazardType}
                  placeholder={ccpAddLabels.hazardTypePlaceholder}
                  onValueChange={(v) => {
                    setHazardType(v as HazardType);
                    setEditError(null);
                  }}
                  options={HAZARD_TYPES.map((h) => ({ value: h, label: ccpAddLabels.hazardTypeOptions[h] }))}
                />
              </div>
            </label>

            {/* Critical limits + unit. */}
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-medium text-slate-700">{ccpAddLabels.criticalLimitMin}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid="haccp-ccp-add-limit-min"
                  value={limitMin}
                  onChange={(e) => {
                    setLimitMin(e.target.value);
                    setEditError(null);
                  }}
                  placeholder={ccpAddLabels.criticalLimitMinPlaceholder}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium text-slate-700">{ccpAddLabels.criticalLimitMax}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid="haccp-ccp-add-limit-max"
                  value={limitMax}
                  onChange={(e) => {
                    setLimitMax(e.target.value);
                    setEditError(null);
                  }}
                  placeholder={ccpAddLabels.criticalLimitMaxPlaceholder}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium text-slate-700">{ccpAddLabels.unit}</span>
                <input
                  type="text"
                  data-testid="haccp-ccp-add-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder={ccpAddLabels.unitPlaceholder}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
              </label>
            </div>
            <span className="-mt-2 text-xs text-slate-400">{ccpAddLabels.limitHelp}</span>

            {/* Monitoring frequency. */}
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{ccpAddLabels.frequency}</span>
              <input
                type="text"
                data-testid="haccp-ccp-add-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder={ccpAddLabels.frequencyPlaceholder}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>

            {/* Corrective action. */}
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{ccpAddLabels.correctiveAction}</span>
              <textarea
                data-testid="haccp-ccp-add-corrective"
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                placeholder={ccpAddLabels.correctiveActionPlaceholder}
                rows={2}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>

            {editError && (
              <p role="alert" data-testid="haccp-ccp-add-error" className="text-sm text-red-600">
                {editError}
              </p>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            data-testid="haccp-ccp-edit-cancel"
            onClick={closeEdit}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            {ccpAddLabels.cancel}
          </button>
          <button
            type="button"
            data-testid="haccp-ccp-add-submit"
            disabled={!valid || pending}
            onClick={submitEdit}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? labels.editSubmitting : labels.editSubmit}
          </button>
        </Modal.Footer>
      </Modal>

      {/* Deactivate confirm (soft-delete: is_active=false; no hard delete). */}
      <Modal
        open={deactivateOpen}
        onOpenChange={(o) => (o ? setDeactivateOpen(true) : setDeactivateOpen(false))}
        size="sm"
        modalId="haccp_ccp_deactivate_modal"
        dismissible={!pending}
      >
        <Modal.Header title={labels.deactivateTitle} />
        <Modal.Body>
          <div data-testid="haccp-ccp-deactivate-form" className="flex flex-col gap-3 text-sm">
            <p className="text-slate-700">
              {labels.deactivateBody.replace('{code}', ccp.ccpCode).replace('{name}', ccp.name)}
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{labels.deactivateWarn}</p>
            {deactivateError && (
              <p role="alert" data-testid="haccp-ccp-deactivate-error" className="text-sm text-red-600">
                {deactivateError}
              </p>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            data-testid="haccp-ccp-deactivate-cancel"
            onClick={() => setDeactivateOpen(false)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            {labels.deactivateCancel}
          </button>
          <button
            type="button"
            data-testid="haccp-ccp-deactivate-confirm"
            disabled={pending}
            onClick={submitDeactivate}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? labels.deactivateSubmitting : labels.deactivateConfirm}
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
