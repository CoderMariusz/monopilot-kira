'use client';

/**
 * 01-NPD TRIAL stage — LogTrialModal ("+ Log new trial" dialog).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:237 (+ Log new trial CTA)
 *
 * shadcn-only: @monopilot/ui Modal/Input/Textarea/Select/Button. No raw
 * <select> (the technologist + result pickers use the @monopilot/ui Select
 * primitive). The submit handler calls the trial write Server Action passed in
 * by the screen; on a duplicate trial_no the friendly `duplicate_trial_no`
 * error is surfaced inline.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';
import Textarea from '@monopilot/ui/Textarea';

import type { TrialActionOutcome, TechnologistOption, TrialLabels } from './trial-screen';
import type { TrialResult } from '../_actions/errors';

export type TrialFormValues = {
  trialNo: string;
  trialDate: string;
  batchSizeKg: string;
  yieldPct: string;
  technologistUserId: string;
  result: TrialResult;
  notes: string;
};

const EMPTY: TrialFormValues = {
  trialNo: '',
  trialDate: '',
  batchSizeKg: '',
  yieldPct: '',
  technologistUserId: '',
  result: 'pending',
  notes: '',
};

export function LogTrialModal({
  open,
  onOpenChange,
  labels,
  technologists,
  technologistNone,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: TrialLabels;
  technologists: TechnologistOption[];
  technologistNone: string;
  onSubmit: (values: TrialFormValues) => Promise<TrialActionOutcome>;
}) {
  const [values, setValues] = React.useState<TrialFormValues>(EMPTY);
  const [submitState, setSubmitState] = React.useState<'idle' | 'saving' | 'error'>('idle');
  const [errorCode, setErrorCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setSubmitState('idle');
      setErrorCode(null);
    }
  }, [open]);

  function update<K extends keyof TrialFormValues>(key: K, next: TrialFormValues[K]) {
    setSubmitState('idle');
    setErrorCode(null);
    setValues((prev) => ({ ...prev, [key]: next }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitState === 'saving') return;
    if (values.trialNo.trim() === '') {
      setSubmitState('error');
      setErrorCode('invalid_input');
      return;
    }
    setSubmitState('saving');
    const result = await onSubmit(values);
    if (result.ok) {
      onOpenChange(false);
    } else {
      setSubmitState('error');
      setErrorCode(result.error ?? 'persistence_failed');
    }
  }

  const resultOptions = [
    { value: 'pending', label: labels.resultPending },
    { value: 'pass', label: labels.resultPass },
    { value: 'fail', label: labels.resultFail },
  ];

  const techOptions = [
    { value: '', label: technologistNone },
    ...technologists.map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <Modal open={open} onOpenChange={onOpenChange} modalId="npd-trial-log" size="md">
      <Modal.Header title={labels.modalTitle} />
      <form onSubmit={handleSubmit} data-testid="log-trial-form">
        <Modal.Body>
          <div className="space-y-3">
            <div className="field">
              <label htmlFor="trial-no">{labels.fieldTrialNo}</label>
              <Input
                id="trial-no"
                value={values.trialNo}
                onChange={(e) => update('trialNo', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="trial-date">{labels.fieldDate}</label>
              <Input
                id="trial-date"
                type="date"
                value={values.trialDate}
                onChange={(e) => update('trialDate', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="trial-batch">{labels.fieldBatch}</label>
              <Input
                id="trial-batch"
                inputMode="decimal"
                value={values.batchSizeKg}
                onChange={(e) => update('batchSizeKg', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="trial-yield">{labels.fieldYield}</label>
              <Input
                id="trial-yield"
                inputMode="decimal"
                value={values.yieldPct}
                onChange={(e) => update('yieldPct', e.target.value)}
              />
            </div>
            <div className="field">
              <label id="trial-tech-label">{labels.fieldTechnologist}</label>
              <Select
                aria-labelledby="trial-tech-label"
                value={values.technologistUserId}
                onValueChange={(v) => update('technologistUserId', v)}
                options={techOptions}
                placeholder={technologistNone}
              />
            </div>
            <div className="field">
              <label id="trial-result-label">{labels.fieldResult}</label>
              <Select
                aria-labelledby="trial-result-label"
                value={values.result}
                onValueChange={(v) => update('result', v as TrialResult)}
                options={resultOptions}
              />
            </div>
            <div className="field">
              <label htmlFor="trial-notes">{labels.fieldNotes}</label>
              <Textarea
                id="trial-notes"
                rows={3}
                value={values.notes}
                onChange={(e) => update('notes', e.target.value)}
              />
            </div>
            {submitState === 'error' ? (
              <div role="alert" className="alert alert-red" data-testid="log-trial-error">
                {errorCode === 'duplicate_trial_no' ? labels.duplicateError : labels.saveError}
              </div>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="default" className="btn-ghost" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button type="submit" disabled={submitState === 'saving'} data-testid="log-trial-submit">
            {submitState === 'saving' ? labels.saving : labels.save}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
