'use client';

import { useState, useTransition } from 'react';

import { Select } from '@monopilot/ui/Select';

import type { CalibrationDueRow } from '../_types/calibration-schemas';
import { ModalShell } from '../../_components/mwo-modal-shell';

export type InstrumentFormLabels = {
  createTitle: string;
  editTitle: string;
  code: string;
  codePlaceholder: string;
  type: string;
  standard: string;
  intervalDays: string;
  rangeMin: string;
  rangeMax: string;
  unit: string;
  unitPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  deactivate: string;
  deactivating: string;
  reactivate: string;
  reactivating: string;
  errorRequired: string;
  errorFailed: string;
  errorForbidden: string;
  types: Record<string, string>;
  standards: Record<string, string>;
};

type CreateInstrumentAction = (input: {
  instrumentCode: string;
  instrumentType: 'scale' | 'thermometer' | 'ph_meter' | 'other';
  standard: 'ISO_9001' | 'NIST' | 'internal' | 'other';
  calibrationIntervalDays: number;
  rangeMin?: string;
  rangeMax?: string;
  unitOfMeasure?: string;
}) => Promise<{ ok: boolean; reason?: string }>;

type UpdateInstrumentAction = (input: {
  instrumentId: string;
  instrumentCode: string;
  instrumentType: 'scale' | 'thermometer' | 'ph_meter' | 'other';
  standard: 'ISO_9001' | 'NIST' | 'internal' | 'other';
  calibrationIntervalDays: number;
  rangeMin?: string;
  rangeMax?: string;
  unitOfMeasure?: string;
}) => Promise<{ ok: boolean; reason?: string }>;

type DeactivateInstrumentAction = (input: {
  instrumentId: string;
}) => Promise<{ ok: boolean; reason?: string }>;

type ReactivateInstrumentAction = (input: {
  instrumentId: string;
}) => Promise<{ ok: boolean; reason?: string }>;

const INSTRUMENT_TYPES = ['scale', 'thermometer', 'ph_meter', 'other'] as const;
const STANDARDS = ['ISO_9001', 'NIST', 'internal', 'other'] as const;

export function InstrumentFormModal({
  mode,
  instrument,
  labels,
  canDeactivate,
  createInstrumentAction,
  updateInstrumentAction,
  deactivateInstrumentAction,
  reactivateInstrumentAction,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  instrument?: CalibrationDueRow;
  labels: InstrumentFormLabels;
  canDeactivate: boolean;
  createInstrumentAction: CreateInstrumentAction;
  updateInstrumentAction: UpdateInstrumentAction;
  deactivateInstrumentAction: DeactivateInstrumentAction;
  reactivateInstrumentAction: ReactivateInstrumentAction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [instrumentCode, setInstrumentCode] = useState(instrument?.instrumentCode ?? '');
  const [instrumentType, setInstrumentType] = useState<(typeof INSTRUMENT_TYPES)[number]>(
    (instrument?.instrumentType as (typeof INSTRUMENT_TYPES)[number]) ?? 'scale',
  );
  const [standard, setStandard] = useState<(typeof STANDARDS)[number]>(
    (instrument?.standard as (typeof STANDARDS)[number]) ?? 'internal',
  );
  const [intervalDays, setIntervalDays] = useState(String(instrument?.calibrationIntervalDays ?? 365));
  const [rangeMin, setRangeMin] = useState(instrument?.rangeMin ?? '');
  const [rangeMax, setRangeMax] = useState(instrument?.rangeMax ?? '');
  const [unitOfMeasure, setUnitOfMeasure] = useState(instrument?.unitOfMeasure ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [deactivating, startDeactivate] = useTransition();
  const [reactivating, startReactivate] = useTransition();

  const title = mode === 'create' ? labels.createTitle : labels.editTitle;

  const submit = () => {
    const parsedInterval = Number.parseInt(intervalDays, 10);
    if (!instrumentCode.trim() || !Number.isFinite(parsedInterval) || parsedInterval < 1) {
      setError(labels.errorRequired);
      return;
    }
    setError(null);
    startSubmit(async () => {
      const payload = {
        instrumentCode: instrumentCode.trim(),
        instrumentType,
        standard,
        calibrationIntervalDays: parsedInterval,
        rangeMin: rangeMin.trim() || undefined,
        rangeMax: rangeMax.trim() || undefined,
        unitOfMeasure: unitOfMeasure.trim() || undefined,
      };
      const result =
        mode === 'create'
          ? await createInstrumentAction(payload)
          : await updateInstrumentAction({ instrumentId: instrument!.instrumentId, ...payload });
      if (result.ok) onSaved();
      else
        setError(
          result.reason === 'forbidden'
            ? labels.errorForbidden
            : labels.errorFailed,
        );
    });
  };

  const deactivate = () => {
    if (!instrument) return;
    setError(null);
    startDeactivate(async () => {
      const result = await deactivateInstrumentAction({ instrumentId: instrument.instrumentId });
      if (result.ok) onSaved();
      else
        setError(
          result.reason === 'forbidden'
            ? labels.errorForbidden
            : labels.errorFailed,
        );
    });
  };

  const reactivate = () => {
    if (!instrument) return;
    setError(null);
    startReactivate(async () => {
      const result = await reactivateInstrumentAction({ instrumentId: instrument.instrumentId });
      if (result.ok) onSaved();
      else
        setError(
          result.reason === 'forbidden'
            ? labels.errorForbidden
            : labels.errorFailed,
        );
    });
  };

  return (
    <ModalShell
      title={title}
      testId={mode === 'create' ? 'calibration-instrument-create' : 'calibration-instrument-edit'}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.code}</span>
          <input
            type="text"
            value={instrumentCode}
            onChange={(e) => setInstrumentCode(e.target.value)}
            placeholder={labels.codePlaceholder}
            data-testid="calibration-instrument-code"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.type}</span>
            <div data-testid="calibration-instrument-type">
              <Select
                aria-label={labels.type}
                value={instrumentType}
                onValueChange={(v) => setInstrumentType(v as (typeof INSTRUMENT_TYPES)[number])}
                options={INSTRUMENT_TYPES.map((t) => ({ value: t, label: labels.types[t] ?? t }))}
              />
            </div>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.standard}</span>
            <div data-testid="calibration-instrument-standard">
              <Select
                aria-label={labels.standard}
                value={standard}
                onValueChange={(v) => setStandard(v as (typeof STANDARDS)[number])}
                options={STANDARDS.map((s) => ({ value: s, label: labels.standards[s] ?? s }))}
              />
            </div>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.intervalDays}</span>
          <input
            type="number"
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            data-testid="calibration-instrument-interval"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.rangeMin}</span>
            <input
              type="text"
              value={rangeMin}
              onChange={(e) => setRangeMin(e.target.value)}
              data-testid="calibration-instrument-range-min"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.rangeMax}</span>
            <input
              type="text"
              value={rangeMax}
              onChange={(e) => setRangeMax(e.target.value)}
              data-testid="calibration-instrument-range-max"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.unit}</span>
          <input
            type="text"
            value={unitOfMeasure}
            onChange={(e) => setUnitOfMeasure(e.target.value)}
            placeholder={labels.unitPlaceholder}
            data-testid="calibration-instrument-unit"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        {error ? (
          <p role="alert" data-testid="calibration-instrument-error" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-between gap-2">
          <div>
            {mode === 'edit' && instrument?.active && canDeactivate ? (
              <button
                type="button"
                onClick={deactivate}
                disabled={deactivating || submitting || reactivating}
                data-testid="calibration-instrument-deactivate"
                className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deactivating ? labels.deactivating : labels.deactivate}
              </button>
            ) : null}
            {mode === 'edit' && instrument && !instrument.active && canDeactivate ? (
              <button
                type="button"
                onClick={reactivate}
                disabled={reactivating || submitting || deactivating}
                data-testid="calibration-instrument-reactivate"
                className="rounded-md border border-green-200 px-3 py-1.5 text-sm text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reactivating ? labels.reactivating : labels.reactivate}
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              data-testid="calibration-instrument-cancel"
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || deactivating || reactivating}
              data-testid="calibration-instrument-submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? labels.submitting : labels.submit}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
