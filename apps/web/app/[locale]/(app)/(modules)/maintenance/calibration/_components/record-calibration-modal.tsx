'use client';

import { useState, useTransition } from 'react';

import { Select } from '@monopilot/ui/Select';

import type { CalibrationRecordRowPatch, InstrumentOption } from '../_types/calibration-schemas';
import { ModalShell } from '../../_components/mwo-modal-shell';

export type RecordCalibrationLabels = {
  title: string;
  instrument: string;
  instrumentPlaceholder: string;
  calibratedAt: string;
  result: string;
  resultPass: string;
  resultFail: string;
  resultOutOfSpec: string;
  measuredValues: string;
  measuredPlaceholder: string;
  notes: string;
  certificateRef: string;
  certificatePlaceholder: string;
  calibratorPassword: string;
  reviewerUserId: string;
  reviewerUserIdPlaceholder: string;
  reviewerPassword: string;
  dualSignWarning: string;
  submit: string;
  submitting: string;
  cancel: string;
  errorRequired: string;
  errorFailed: string;
  errorForbidden: string;
  errorEsign: string;
  errorSod: string;
};

type RecordCalibrationAction = (input: {
  instrumentId: string;
  calibratedAt: string;
  result: 'PASS' | 'FAIL' | 'OUT_OF_SPEC';
  testPoints?: Array<{ reference: string; measured: string | number; tolerance_pct?: number }>;
  notes?: string;
  certificateRef?: string;
  signature: { password: string };
  reviewerSignature: { userId: string; password: string };
}) => Promise<{ ok: boolean; reason?: string; message?: string; rowPatch?: CalibrationRecordRowPatch }>;

const RESULTS = ['PASS', 'FAIL', 'OUT_OF_SPEC'] as const;

export function RecordCalibrationModal({
  instruments,
  defaultInstrumentId,
  labels,
  recordCalibrationAction,
  onClose,
  onRecorded,
}: {
  instruments: InstrumentOption[];
  defaultInstrumentId?: string;
  labels: RecordCalibrationLabels;
  recordCalibrationAction: RecordCalibrationAction;
  onClose: () => void;
  onRecorded: (rowPatch: CalibrationRecordRowPatch) => void;
}) {
  const [instrumentId, setInstrumentId] = useState(defaultInstrumentId ?? '');
  const [calibratedAt, setCalibratedAt] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<(typeof RESULTS)[number]>('PASS');
  const [measuredValues, setMeasuredValues] = useState('');
  const [notes, setNotes] = useState('');
  const [certificateRef, setCertificateRef] = useState('');
  const [calibratorPassword, setCalibratorPassword] = useState('');
  const [reviewerUserId, setReviewerUserId] = useState('');
  const [reviewerPassword, setReviewerPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const resultLabel: Record<(typeof RESULTS)[number], string> = {
    PASS: labels.resultPass,
    FAIL: labels.resultFail,
    OUT_OF_SPEC: labels.resultOutOfSpec,
  };

  const submit = () => {
    if (
      !instrumentId ||
      !calibratedAt ||
      !calibratorPassword.trim() ||
      !reviewerUserId.trim() ||
      !reviewerPassword.trim()
    ) {
      setError(labels.errorRequired);
      return;
    }

    let testPoints: Array<{ reference: string; measured: string | number; tolerance_pct?: number }> | undefined;
    if (measuredValues.trim()) {
      try {
        const parsed = JSON.parse(measuredValues) as unknown;
        if (!Array.isArray(parsed)) throw new Error('not array');
        testPoints = parsed as Array<{ reference: string; measured: string | number; tolerance_pct?: number }>;
      } catch {
        setError(labels.errorRequired);
        return;
      }
    }

    setError(null);
    startSubmit(async () => {
      const actionResult = await recordCalibrationAction({
        instrumentId,
        calibratedAt: `${calibratedAt}T12:00:00.000Z`,
        result,
        testPoints,
        notes: notes.trim() || undefined,
        certificateRef: certificateRef.trim() || undefined,
        signature: { password: calibratorPassword },
        reviewerSignature: { userId: reviewerUserId.trim(), password: reviewerPassword },
      });
      if (actionResult.ok && actionResult.rowPatch) onRecorded(actionResult.rowPatch);
      else if (actionResult.reason === 'forbidden') setError(labels.errorForbidden);
      else if (actionResult.reason === 'sod_violation') setError(labels.errorSod);
      else if (actionResult.reason === 'esign_failed') setError(labels.errorEsign);
      else setError(labels.errorFailed);
    });
  };

  return (
    <ModalShell title={labels.title} testId="calibration-record-modal" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.instrument}</span>
          {instruments.length === 0 ? (
            <span data-testid="calibration-record-no-instruments" className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              {labels.instrumentPlaceholder}
            </span>
          ) : (
            <div data-testid="calibration-record-instrument">
              <Select
                aria-label={labels.instrument}
                value={instrumentId}
                placeholder={labels.instrumentPlaceholder}
                onValueChange={(v) => setInstrumentId(v)}
                options={instruments.map((i) => ({
                  value: i.id,
                  label: i.instrumentCode + (!i.active ? ' (inactive)' : ''),
                }))}
              />
            </div>
          )}
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.calibratedAt}</span>
            <input
              type="date"
              value={calibratedAt}
              onChange={(e) => setCalibratedAt(e.target.value)}
              data-testid="calibration-record-date"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.result}</span>
            <div data-testid="calibration-record-result">
              <Select
                aria-label={labels.result}
                value={result}
                onValueChange={(v) => setResult(v as (typeof RESULTS)[number])}
                options={RESULTS.map((r) => ({ value: r, label: resultLabel[r] }))}
              />
            </div>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.measuredValues}</span>
          <textarea
            value={measuredValues}
            onChange={(e) => setMeasuredValues(e.target.value)}
            placeholder={labels.measuredPlaceholder}
            rows={3}
            data-testid="calibration-record-measured"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 font-mono text-xs focus:border-slate-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.notes}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            data-testid="calibration-record-notes"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.certificateRef}</span>
          <input
            type="text"
            value={certificateRef}
            onChange={(e) => setCertificateRef(e.target.value)}
            placeholder={labels.certificatePlaceholder}
            data-testid="calibration-record-certificate"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <div
          data-testid="calibration-record-dual-sign"
          className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900"
        >
          {labels.dualSignWarning}
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.calibratorPassword}</span>
          <input
            type="password"
            value={calibratorPassword}
            onChange={(e) => setCalibratorPassword(e.target.value)}
            autoComplete="current-password"
            data-testid="calibration-record-calibrator-signature"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.reviewerUserId}</span>
          <input
            type="text"
            value={reviewerUserId}
            onChange={(e) => setReviewerUserId(e.target.value)}
            placeholder={labels.reviewerUserIdPlaceholder}
            data-testid="calibration-record-reviewer-user"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 font-mono text-xs focus:border-slate-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.reviewerPassword}</span>
          <input
            type="password"
            value={reviewerPassword}
            onChange={(e) => setReviewerPassword(e.target.value)}
            autoComplete="new-password"
            data-testid="calibration-record-reviewer-signature"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        {error ? (
          <p role="alert" data-testid="calibration-record-error" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="calibration-record-cancel"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || instruments.length === 0}
            data-testid="calibration-record-submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? labels.submitting : labels.submit}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
