'use client';

/**
 * QA-003b — Spec parameter row actions (Edit modal + destructive Delete confirm).
 *
 * DEVIATION (documented): the prototype parameters table
 *   (prototypes/design/Monopilot Design System/quality/specs-screens.jsx:365-384)
 * is READ-ONLY — it has no per-row Edit/Delete affordance, so the draft spec was an
 * add-only dead-end. This component adds the missing per-row Edit/Delete, modeled
 * 1:1 on the shipped supplier-spec pattern
 *   technical/items/[item_code]/_components/supplier-spec-row-actions.client.tsx
 * (inline Modal, useTransition, router.refresh() on success, inline role="alert" on
 * failure, never throws). The actions are ONLY rendered when the spec is a DRAFT and
 * the user can edit — mirroring the server contract: updateSpecParameter /
 * deleteSpecParameter only mutate draft specs and gate quality.spec.approve. The
 * buttons are affordances only; each action re-checks the grant + draft state
 * authoritatively server-side, so a spoofed button is still rejected.
 *
 * The field set mirrors the create-modal parameter editor (parity
 * specs-screens.jsx:192-244): name (text) / type (Select, no raw <select>) /
 * target,min,max (decimal, numeric types only) / unit (text) / critical (checkbox),
 * with the same min ≤ max client guard mirroring the DB CHECK. Numeric values are
 * DECIMAL STRINGS passed through verbatim.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import type {
  DeleteSpecParameterFn,
  SpecParameterDetail,
  SpecParameterType,
  UpdateSpecParameterFn,
} from '../../_components/spec-actions-contract';

/** Mirrors the create-modal parameter-type set (parity specs-screens.jsx:192-244). */
export const SPEC_PARAMETER_TYPES: SpecParameterType[] = [
  'visual',
  'measurement',
  'attribute',
  'microbiological',
  'chemical',
  'sensory',
  'equipment',
];

/** Numeric-bearing types — target/min/max only meaningful here (parity with create). */
const NUMERIC_TYPES = new Set<SpecParameterType>(['measurement', 'chemical', 'microbiological']);

export type SpecParamRowActionsLabels = {
  edit: string;
  delete: string;
  editTitle: string;
  editSubtitle: string;
  name: string;
  namePlaceholder: string;
  type: string;
  target: string;
  min: string;
  max: string;
  unit: string;
  unitPlaceholder: string;
  critical: string;
  minLeMax: string;
  nameRequired: string;
  submit: string;
  submitting: string;
  cancel: string;
  success: string;
  updateError: string;
  typeOptions: Record<SpecParameterType, string>;
  deleteTitle: string;
  deleteBody: string;
  deleteWarnCritical: string;
  deleteConfirm: string;
  deleteCancel: string;
  deleteSuccess: string;
  deleteError: string;
};

export interface SpecParamRowActionsProps {
  specId: string;
  parameter: SpecParameterDetail;
  index: number;
  labels: SpecParamRowActionsLabels;
  updateSpecParameter: UpdateSpecParameterFn;
  deleteSpecParameter: DeleteSpecParameterFn;
}

/** min ≤ max client check mirroring quality_spec_parameters_min_le_max_check. */
export function minGtMax(min: string, max: string): boolean {
  if (min.trim() === '' || max.trim() === '') return false;
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isNaN(lo) || Number.isNaN(hi)) return false;
  return lo > hi;
}

function optDecimal(v: string): string | undefined {
  const t = v.trim();
  return t === '' ? undefined : t;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ff" style={{ display: 'block', marginBottom: 10 }}>
      <span className="ff-label">{label}</span>
      {children}
    </label>
  );
}

function Modal({
  onClose,
  title,
  subtitle,
  children,
  footer,
  testId,
}: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  testId: string;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    contentRef.current?.focus();
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-box outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        data-testid={testId}
      >
        <div className="modal-head">
          <div>
            <div id={titleId} className="modal-title">
              {title}
            </div>
            {subtitle ? (
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export function SpecParamRowActions({
  specId,
  parameter,
  index,
  labels,
  updateSpecParameter,
  deleteSpecParameter,
}: SpecParamRowActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [parameterName, setParameterName] = React.useState(parameter.parameterName);
  const [parameterType, setParameterType] = React.useState<SpecParameterType>(parameter.parameterType);
  const [targetValue, setTargetValue] = React.useState(parameter.targetValue ?? '');
  const [minValue, setMinValue] = React.useState(parameter.minValue ?? '');
  const [maxValue, setMaxValue] = React.useState(parameter.maxValue ?? '');
  const [unit, setUnit] = React.useState(parameter.unit ?? '');
  const [isCritical, setIsCritical] = React.useState(parameter.isCritical);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const showNumeric = NUMERIC_TYPES.has(parameterType);
  const badRange = showNumeric && minGtMax(minValue, maxValue);
  const nameEmpty = parameterName.trim() === '';

  function resetEdit() {
    setParameterName(parameter.parameterName);
    setParameterType(parameter.parameterType);
    setTargetValue(parameter.targetValue ?? '');
    setMinValue(parameter.minValue ?? '');
    setMaxValue(parameter.maxValue ?? '');
    setUnit(parameter.unit ?? '');
    setIsCritical(parameter.isCritical);
    setError(null);
    setSuccess(null);
  }

  function closeEdit() {
    setEditOpen(false);
    resetEdit();
  }

  function closeDelete() {
    setDeleteOpen(false);
    setError(null);
    setSuccess(null);
  }

  function submitEdit() {
    setError(null);
    setSuccess(null);
    if (nameEmpty) {
      setError(labels.nameRequired);
      return;
    }
    if (badRange) {
      setError(labels.minLeMax);
      return;
    }
    startTransition(async () => {
      const result = await updateSpecParameter({
        specId,
        parameterId: parameter.id,
        parameterName: parameterName.trim(),
        parameterType,
        // Numeric values only meaningful for numeric-bearing types (parity create).
        targetValue: showNumeric ? optDecimal(targetValue) : undefined,
        minValue: showNumeric ? optDecimal(minValue) : undefined,
        maxValue: showNumeric ? optDecimal(maxValue) : undefined,
        unit: optDecimal(unit),
        isCritical,
      });
      if (!result.ok) {
        setError(labels.updateError.replace('{message}', result.message ?? result.reason));
        return;
      }
      setSuccess(labels.success);
      router.refresh();
      window.setTimeout(() => closeEdit(), 1200);
    });
  }

  function submitDelete() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await deleteSpecParameter({ specId, parameterId: parameter.id });
      if (!result.ok) {
        setError(labels.deleteError.replace('{message}', result.message ?? result.reason));
        return;
      }
      setSuccess(labels.deleteSuccess);
      router.refresh();
      window.setTimeout(() => closeDelete(), 1200);
    });
  }

  return (
    <>
      <div className="flex justify-end gap-2" data-testid={`spec-param-actions-${index}`}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          data-testid={`spec-param-edit-${index}`}
          onClick={() => {
            resetEdit();
            setEditOpen(true);
          }}
        >
          {labels.edit}
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          data-testid={`spec-param-delete-${index}`}
          onClick={() => {
            setError(null);
            setSuccess(null);
            setDeleteOpen(true);
          }}
        >
          {labels.delete}
        </button>
      </div>

      {editOpen ? (
        <Modal
          onClose={closeEdit}
          title={labels.editTitle}
          subtitle={labels.editSubtitle}
          testId="spec-param-edit-modal"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={closeEdit} disabled={pending}>
                {labels.cancel}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitEdit}
                disabled={pending || nameEmpty || badRange}
                title={nameEmpty || badRange ? (nameEmpty ? labels.nameRequired : labels.minLeMax) : undefined}
                data-testid="spec-param-edit-submit"
              >
                {pending ? labels.submitting : labels.submit}
              </button>
            </>
          }
        >
          {error ? (
            <div role="alert" className="alert alert-red" style={{ marginBottom: 10 }} data-testid="spec-param-edit-error">
              <div className="alert-title">{error}</div>
            </div>
          ) : null}
          {success ? (
            <div role="status" className="alert alert-green" style={{ marginBottom: 10 }}>
              <div className="alert-title">{success}</div>
            </div>
          ) : null}

          <Field label={labels.name}>
            <Input
              value={parameterName}
              onChange={(e) => setParameterName(e.target.value)}
              placeholder={labels.namePlaceholder}
              aria-label={labels.name}
              aria-invalid={nameEmpty || undefined}
              data-testid="spec-param-edit-name"
            />
          </Field>
          <Field label={labels.type}>
            <div data-testid="spec-param-edit-type">
              <Select
                aria-label={labels.type}
                value={parameterType}
                onValueChange={(v) => setParameterType(v as SpecParameterType)}
                options={SPEC_PARAMETER_TYPES.map((t) => ({ value: t, label: labels.typeOptions[t] }))}
              />
            </div>
          </Field>
          <div className="ff-inline">
            <Field label={labels.target}>
              <Input
                inputMode="decimal"
                value={targetValue}
                disabled={!showNumeric}
                onChange={(e) => setTargetValue(e.target.value)}
                aria-label={labels.target}
                data-testid="spec-param-edit-target"
              />
            </Field>
            <Field label={labels.min}>
              <Input
                inputMode="decimal"
                value={minValue}
                disabled={!showNumeric}
                onChange={(e) => setMinValue(e.target.value)}
                aria-label={labels.min}
                aria-invalid={badRange || undefined}
                data-testid="spec-param-edit-min"
              />
            </Field>
            <Field label={labels.max}>
              <Input
                inputMode="decimal"
                value={maxValue}
                disabled={!showNumeric}
                onChange={(e) => setMaxValue(e.target.value)}
                aria-label={labels.max}
                aria-invalid={badRange || undefined}
                data-testid="spec-param-edit-max"
              />
            </Field>
          </div>
          {badRange ? (
            <p role="alert" data-testid="spec-param-edit-minmax-error" className="text-xs text-red-600" style={{ marginBottom: 10 }}>
              {labels.minLeMax}
            </p>
          ) : null}
          <Field label={labels.unit}>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={labels.unitPlaceholder}
              aria-label={labels.unit}
              data-testid="spec-param-edit-unit"
            />
          </Field>
          <label className="flex items-center gap-2" style={{ marginTop: 4, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={isCritical}
              onChange={(e) => setIsCritical(e.target.checked)}
              data-testid="spec-param-edit-critical"
            />
            <span>{labels.critical}</span>
          </label>
        </Modal>
      ) : null}

      {deleteOpen ? (
        <Modal
          onClose={closeDelete}
          title={labels.deleteTitle}
          testId="spec-param-delete-modal"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={closeDelete} disabled={pending}>
                {labels.deleteCancel}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={submitDelete}
                disabled={pending}
                data-testid="spec-param-delete-submit"
              >
                {pending ? labels.submitting : labels.deleteConfirm}
              </button>
            </>
          }
        >
          {error ? (
            <div role="alert" className="alert alert-red" style={{ marginBottom: 10 }} data-testid="spec-param-delete-error">
              <div className="alert-title">{error}</div>
            </div>
          ) : null}
          {success ? (
            <div role="status" className="alert alert-green" style={{ marginBottom: 10 }}>
              <div className="alert-title">{success}</div>
            </div>
          ) : null}
          <p className="text-sm" style={{ marginBottom: 10 }}>
            {labels.deleteBody.replace('{name}', parameter.parameterName)}
          </p>
          {parameter.isCritical ? (
            <div role="alert" className="alert alert-amber">
              <div className="alert-title">{labels.deleteWarnCritical}</div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
