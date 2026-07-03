'use client';

/**
 * NPD PILOT stage — PilotRunModal ("+ Plan pilot run" / "Edit plan" dialog).
 *
 * Additive edit affordance over the (otherwise read-only) prototype
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:364-372
 * — the run-plan card. The prototype shows static label/value cells; this modal
 * is the production edit path. Same @monopilot/ui Modal / Input / Select stack
 * as the trial screen's LogTrialModal (shadcn-only; no raw <select>).
 *
 * Field names / types match the `upsertPilotRun` zod schema 1:1:
 *   plannedDate (YYYY-MM-DD | null), line (string | null), batchSizeKg (decimal
 *   string | null), expectedYieldPct (decimal string <=100 | null),
 *   durationHours (decimal string | null), supervisorUserId (uuid | null).
 * Decimal/qty inputs stay STRINGS end-to-end (never JS floats).
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type {
  PilotActionOutcome,
  ProductionLineOption,
  SupervisorOption,
  PilotLabels,
  PilotRunStatus,
  PilotRunView,
} from './pilot-screen';

export type PilotRunFormValues = {
  plannedDate: string;
  line: string;
  batchSizeKg: string;
  expectedYieldPct: string;
  durationHours: string;
  supervisorUserId: string;
  /** pilot_runs status (migration 234 CHECK / upsertPilotRun zod enum). */
  status: PilotRunStatus;
};

const EMPTY: PilotRunFormValues = {
  plannedDate: '',
  line: '',
  batchSizeKg: '',
  expectedYieldPct: '',
  durationHours: '',
  supervisorUserId: '',
  status: 'planned',
};

function fromRun(run: PilotRunView | null): PilotRunFormValues {
  if (!run) return EMPTY;
  return {
    plannedDate: run.plannedDate ?? '',
    line: run.line ?? '',
    batchSizeKg: run.batchSizeKg ?? '',
    expectedYieldPct: run.expectedYieldPct ?? '',
    durationHours: run.durationHours ?? '',
    supervisorUserId: run.supervisorUserId ?? '',
    status: run.status ?? 'planned',
  };
}

export function PilotRunModal({
  open,
  onOpenChange,
  labels,
  run,
  supervisors,
  lines,
  batchUnitLabel = 'kg',
  onSubmit,
  onLineChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: PilotLabels;
  /** Pre-fill values when editing an existing run; null = new run. */
  run: PilotRunView | null;
  supervisors: SupervisorOption[];
  /** Production-line options for the "Line" dropdown; value = line CODE. */
  lines: ProductionLineOption[];
  /** FG base unit shown in the batch-size label (e.g. kg / each). */
  batchUnitLabel?: string;
  onSubmit: (values: PilotRunFormValues) => Promise<PilotActionOutcome>;
  /**
   * Notify the parent when the line changes (with the new line CODE, or null
   * when cleared) so it can re-derive recipe availability for the new warehouse.
   */
  onLineChange?: (lineCode: string | null) => void;
}) {
  const [values, setValues] = React.useState<PilotRunFormValues>(() => fromRun(run));
  const [submitState, setSubmitState] = React.useState<'idle' | 'saving' | 'error'>('idle');

  React.useEffect(() => {
    if (open) {
      setValues(fromRun(run));
      setSubmitState('idle');
    }
  }, [open, run]);

  function update<K extends keyof PilotRunFormValues>(key: K, next: PilotRunFormValues[K]) {
    setSubmitState('idle');
    setValues((prev) => ({ ...prev, [key]: next }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitState === 'saving') return;
    if (!values.line.trim()) {
      setSubmitState('error');
      return;
    }
    setSubmitState('saving');
    const result = await onSubmit(values);
    if (result.ok) {
      onOpenChange(false);
    } else {
      setSubmitState('error');
    }
  }

  const supervisorOptions = [
    { value: '', label: labels.noSupervisor },
    ...supervisors.map((s) => ({ value: s.id, label: s.name })),
  ];

  // Production LINE is required — no unset placeholder option.
  const lineOptions = lines.map((l) => {
    const siteLabel =
      l.siteCode || l.siteName ? ` · ${l.siteCode ?? l.siteName}` : '';
    return { value: l.code, label: `${l.code} — ${l.name}${siteLabel}` };
  });

  const batchSizeLabel =
    labels.fieldBatchSize.includes('({unit})')
      ? labels.fieldBatchSize.replace('({unit})', `(${batchUnitLabel})`)
      : `${labels.fieldBatchSize} (${batchUnitLabel})`;

  function handleLineSelect(next: string) {
    update('line', next);
    onLineChange?.(next || null);
  }

  // pilot_runs.status (migration 234 CHECK). Marking a run "completed" is what
  // clears the launch gate PILOT_WO_NOT_LINKED, so the control is always offered.
  const statusOptions: { value: PilotRunFormValues['status']; label: string }[] = [
    { value: 'planned', label: labels.statusPlanned },
    { value: 'in_progress', label: labels.statusInProgress },
    { value: 'completed', label: labels.statusCompleted },
  ];

  const title = run ? labels.editPlan : labels.planPilotRun;

  return (
    <Modal open={open} onOpenChange={onOpenChange} modalId="npd-pilot-run" size="md">
      <Modal.Header title={title} />
      <form onSubmit={handleSubmit} data-testid="pilot-run-form">
        <Modal.Body>
          <div className="space-y-3">
            <div className="field">
              <label htmlFor="pilot-date">{labels.fieldPlannedDate}</label>
              <Input
                id="pilot-date"
                type="date"
                value={values.plannedDate}
                onChange={(e) => update('plannedDate', e.target.value)}
              />
            </div>
            <div className="field" data-testid="pilot-line-field">
              <label id="pilot-line-label">
                {labels.fieldLine}
                <span className="req" aria-label="required"> *</span>
              </label>
              <Select
                aria-labelledby="pilot-line-label"
                aria-required="true"
                value={values.line}
                onValueChange={handleLineSelect}
                options={lineOptions}
                placeholder={labels.linePlaceholder}
              />
              {lines.length === 0 ? (
                <p className="muted text-[11px] mt-1" data-testid="pilot-no-lines-hint">
                  {labels.noLines}
                </p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="pilot-batch">{batchSizeLabel}</label>
              <Input
                id="pilot-batch"
                inputMode="decimal"
                value={values.batchSizeKg}
                onChange={(e) => update('batchSizeKg', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pilot-yield">{labels.fieldExpectedYield}</label>
              <Input
                id="pilot-yield"
                inputMode="decimal"
                value={values.expectedYieldPct}
                onChange={(e) => update('expectedYieldPct', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pilot-duration">{labels.fieldDuration}</label>
              <Input
                id="pilot-duration"
                inputMode="decimal"
                value={values.durationHours}
                onChange={(e) => update('durationHours', e.target.value)}
              />
            </div>
            <div className="field">
              <label id="pilot-supervisor-label">{labels.fieldSupervisor}</label>
              <Select
                aria-labelledby="pilot-supervisor-label"
                value={values.supervisorUserId}
                onValueChange={(v) => update('supervisorUserId', v)}
                options={supervisorOptions}
                placeholder={labels.noSupervisor}
              />
            </div>
            <div className="field" data-testid="pilot-status-field">
              <label id="pilot-status-label">{labels.fieldStatus}</label>
              <Select
                aria-labelledby="pilot-status-label"
                value={values.status}
                onValueChange={(v) => update('status', v as PilotRunFormValues['status'])}
                options={statusOptions}
              />
            </div>
            {submitState === 'error' ? (
              <div role="alert" className="alert alert-red" data-testid="pilot-run-error">
                {labels.saveError}
              </div>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="default" className="btn-ghost" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button type="submit" disabled={submitState === 'saving'} data-testid="pilot-run-submit">
            {submitState === 'saving' ? labels.saving : labels.save}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
