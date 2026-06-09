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

import type { PilotActionOutcome, SupervisorOption, PilotLabels, PilotRunView } from './pilot-screen';

export type PilotRunFormValues = {
  plannedDate: string;
  line: string;
  batchSizeKg: string;
  expectedYieldPct: string;
  durationHours: string;
  supervisorUserId: string;
};

const EMPTY: PilotRunFormValues = {
  plannedDate: '',
  line: '',
  batchSizeKg: '',
  expectedYieldPct: '',
  durationHours: '',
  supervisorUserId: '',
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
  };
}

export function PilotRunModal({
  open,
  onOpenChange,
  labels,
  run,
  supervisors,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: PilotLabels;
  /** Pre-fill values when editing an existing run; null = new run. */
  run: PilotRunView | null;
  supervisors: SupervisorOption[];
  onSubmit: (values: PilotRunFormValues) => Promise<PilotActionOutcome>;
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
            <div className="field">
              <label htmlFor="pilot-line">{labels.fieldLine}</label>
              <Input
                id="pilot-line"
                value={values.line}
                onChange={(e) => update('line', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pilot-batch">{labels.fieldBatchSize}</label>
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
