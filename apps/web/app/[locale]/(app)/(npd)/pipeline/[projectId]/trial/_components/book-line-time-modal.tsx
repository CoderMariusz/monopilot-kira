'use client';

/**
 * NPD TRIAL stage — Book line time modal (planning capacity block upsert).
 *
 * Field names / types match `upsertCapacityBlock` 1:1:
 *   trialId, lineId, blockDate (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM).
 * shadcn-only: @monopilot/ui Modal / Input / Select / Button (no raw <select>).
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type { ProductionLineOption } from '../_lib/capacity-block';
import type { TrialCapacityBookingView, CapacityBlockActionOutcome } from '../_lib/capacity-block';
import type { TrialLabels } from './trial-screen';

export type BookLineTimeFormValues = {
  lineId: string;
  blockDate: string;
  startTime: string;
  endTime: string;
};

const EMPTY: BookLineTimeFormValues = {
  lineId: '',
  blockDate: '',
  startTime: '',
  endTime: '',
};

function fromBooking(booking: TrialCapacityBookingView | null): BookLineTimeFormValues {
  if (!booking) return EMPTY;
  return {
    lineId: booking.lineId,
    blockDate: booking.blockDate,
    startTime: booking.startTime,
    endTime: booking.endTime,
  };
}

function minutesSinceMidnight(value: string): number {
  const [h = '0', m = '0'] = value.split(':');
  return Number(h) * 60 + Number(m);
}

export function BookLineTimeModal({
  open,
  onOpenChange,
  labels,
  trialId,
  lines,
  existingBooking,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: TrialLabels;
  trialId: string;
  lines: ProductionLineOption[];
  existingBooking: TrialCapacityBookingView | null;
  onSubmit: (call: BookLineTimeFormValues & { trialId: string }) => Promise<CapacityBlockActionOutcome>;
}) {
  const isRebook = existingBooking !== null;
  const [values, setValues] = React.useState<BookLineTimeFormValues>(() => fromBooking(existingBooking));
  const [submitState, setSubmitState] = React.useState<'idle' | 'saving' | 'error'>('idle');
  const [errorCode, setErrorCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValues(fromBooking(existingBooking));
      setSubmitState('idle');
      setErrorCode(null);
    }
  }, [open, existingBooking]);

  const dialogTitle = isRebook ? labels.rebookLineTimeModalTitle : labels.bookLineTimeModalTitle;
  const submitLabel = isRebook ? labels.rebookLineTime : labels.bookLineTime;

  function update<K extends keyof BookLineTimeFormValues>(key: K, next: BookLineTimeFormValues[K]) {
    setSubmitState('idle');
    setErrorCode(null);
    setValues((prev) => ({ ...prev, [key]: next }));
  }

  function resolveErrorMessage(code: string | null): string {
    switch (code) {
      case 'invalid_input':
        return labels.bookLineTimeErrorInvalidInput;
      case 'invalid_range':
        return labels.bookLineTimeErrorInvalidRange;
      case 'forbidden':
        return labels.bookLineTimeErrorForbidden;
      case 'invalid_line':
        return labels.bookLineTimeErrorInvalidLine;
      case 'trial_not_found':
        return labels.bookLineTimeErrorTrialNotFound;
      case 'persistence_failed':
        return labels.bookLineTimeErrorPersistence;
      default:
        return labels.bookLineTimeError;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitState === 'saving') return;

    if (!values.lineId || !values.blockDate || !values.startTime || !values.endTime) {
      setSubmitState('error');
      setErrorCode('invalid_input');
      return;
    }
    if (minutesSinceMidnight(values.endTime) <= minutesSinceMidnight(values.startTime)) {
      setSubmitState('error');
      setErrorCode('invalid_range');
      return;
    }

    setSubmitState('saving');
    const result = await onSubmit({ trialId, ...values });
    if (result.ok) {
      onOpenChange(false);
    } else {
      setSubmitState('error');
      setErrorCode(result.error ?? 'persistence_failed');
    }
  }

  const lineOptions = lines.map((line) => ({
    value: line.id,
    label: `${line.code} — ${line.name}`,
  }));

  return (
    <Modal open={open} onOpenChange={onOpenChange} modalId={`npd-trial-book-line-${trialId}`} size="md">
      <Modal.Header title={dialogTitle} />
      <form onSubmit={handleSubmit} data-testid={`book-line-time-form-${trialId}`}>
        <Modal.Body>
          <div className="space-y-3">
            <div className="field">
              <label id={`book-line-label-${trialId}`}>{labels.fieldLine}</label>
              {lines.length === 0 ? (
                <p className="text-sm muted" data-testid={`book-line-no-lines-${trialId}`}>
                  {labels.noLines}
                </p>
              ) : (
                <Select
                  aria-labelledby={`book-line-label-${trialId}`}
                  value={values.lineId}
                  onValueChange={(v) => update('lineId', v)}
                  options={lineOptions}
                  placeholder={labels.linePlaceholder}
                />
              )}
            </div>
            <div className="field">
              <label htmlFor={`book-block-date-${trialId}`}>{labels.fieldBlockDate}</label>
              <Input
                id={`book-block-date-${trialId}`}
                type="date"
                value={values.blockDate}
                onChange={(e) => update('blockDate', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor={`book-start-time-${trialId}`}>{labels.fieldStartTime}</label>
              <Input
                id={`book-start-time-${trialId}`}
                type="time"
                value={values.startTime}
                onChange={(e) => update('startTime', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor={`book-end-time-${trialId}`}>{labels.fieldEndTime}</label>
              <Input
                id={`book-end-time-${trialId}`}
                type="time"
                value={values.endTime}
                onChange={(e) => update('endTime', e.target.value)}
                required
              />
            </div>
            {submitState === 'error' ? (
              <div
                role="alert"
                className="alert alert-red"
                data-testid={`book-line-time-error-${trialId}`}
              >
                {resolveErrorMessage(errorCode)}
              </div>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="default" className="btn-ghost" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            disabled={submitState === 'saving' || lines.length === 0}
            data-testid={`book-line-time-submit-${trialId}`}
          >
            {submitState === 'saving' ? labels.bookLineTimeSaving : submitLabel}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
