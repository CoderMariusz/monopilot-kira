'use client';

import { useState, useTransition } from 'react';

import { Select } from '@monopilot/ui/Select';

import type { EquipmentOption, PmScheduleRow } from '../_actions/mwo-actions';
import { PM_SCHEDULE_TYPES } from '../_types/pm-schedule-schemas';
import { ModalShell } from './mwo-modal-shell';

export type PmScheduleFormLabels = {
  createTitle: string;
  editTitle: string;
  equipment: string;
  equipmentPlaceholder: string;
  scheduleType: string;
  intervalValue: string;
  intervalUnit: string;
  warningDays: string;
  firstDueDate: string;
  nextDueDate: string;
  active: string;
  submit: string;
  submitting: string;
  cancel: string;
  errorRequired: string;
  errorFailed: string;
  errorForbidden: string;
  type: Record<PmScheduleRow['scheduleType'], string>;
};

type CreatePmScheduleAction = (input: {
  equipmentId: string;
  scheduleType: PmScheduleRow['scheduleType'];
  intervalValue: number;
  warningDays?: number;
  firstDueDate?: string;
}) => Promise<{ ok: boolean; reason?: string; message?: string }>;

type UpdatePmScheduleAction = (input: {
  scheduleId: string;
  intervalValue?: number;
  warningDays?: number;
  nextDueDate?: string;
  active?: boolean;
}) => Promise<{ ok: boolean; reason?: string; message?: string }>;

export function PmScheduleFormModal({
  mode,
  schedule,
  equipment,
  labels,
  createPmScheduleAction,
  updatePmScheduleAction,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  schedule?: PmScheduleRow;
  equipment: EquipmentOption[];
  labels: PmScheduleFormLabels;
  createPmScheduleAction: CreatePmScheduleAction;
  updatePmScheduleAction: UpdatePmScheduleAction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialWarningDays = schedule?.warningDays ?? 7;
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? '');
  const [scheduleType, setScheduleType] = useState<PmScheduleRow['scheduleType']>(
    schedule?.scheduleType ?? 'preventive',
  );
  const [intervalValue, setIntervalValue] = useState(String(schedule?.intervalValue ?? 30));
  const [warningDays, setWarningDays] = useState(String(initialWarningDays));
  const [dueDate, setDueDate] = useState(schedule?.nextDueDate ?? '');
  const [active, setActive] = useState(schedule?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const title = mode === 'create' ? labels.createTitle : labels.editTitle;
  const equipmentOptions = equipment.map((row) => ({
    value: row.id,
    label: `${row.code} — ${row.name}`,
  }));
  const typeOptions = PM_SCHEDULE_TYPES.map((value) => ({
    value,
    label: labels.type[value],
  }));

  const submit = () => {
    const parsedInterval = Number.parseInt(intervalValue, 10);
    const parsedWarning = Number.parseInt(warningDays, 10);
    if (
      (mode === 'create' && !equipmentId) ||
      !Number.isFinite(parsedInterval) ||
      parsedInterval < 1
    ) {
      setError(labels.errorRequired);
      return;
    }

    setError(null);
    startSubmit(async () => {
      const updatePayload: {
        scheduleId: string;
        intervalValue: number;
        warningDays?: number;
        nextDueDate?: string;
        active: boolean;
      } = {
        scheduleId: schedule!.id,
        intervalValue: parsedInterval,
        nextDueDate: dueDate || undefined,
        active,
      };
      if (parsedWarning !== initialWarningDays && Number.isFinite(parsedWarning)) {
        updatePayload.warningDays = parsedWarning;
      }

      const result =
        mode === 'create'
          ? await createPmScheduleAction({
              equipmentId,
              scheduleType,
              intervalValue: parsedInterval,
              warningDays: Number.isFinite(parsedWarning) ? parsedWarning : 7,
              firstDueDate: dueDate || undefined,
            })
          : await updatePmScheduleAction(updatePayload);
      if (result.ok) onSaved();
      else
        setError(
          result.reason === 'forbidden'
            ? labels.errorForbidden
            : result.message ?? labels.errorFailed,
        );
    });
  };

  return (
    <ModalShell
      title={title}
      testId={mode === 'create' ? 'pm-schedule-create-modal' : 'pm-schedule-edit-modal'}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {mode === 'create' ? (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.equipment}</span>
            <Select
              value={equipmentId}
              options={equipmentOptions}
              onValueChange={setEquipmentId}
              placeholder={labels.equipmentPlaceholder}
              aria-label={labels.equipment}
              data-testid="pm-schedule-equipment"
            />
          </div>
        ) : (
          <p className="text-sm text-slate-700">
            <span className="font-medium">{labels.equipment}: </span>
            <span className="font-mono text-xs">{schedule?.equipmentCode}</span>
            {schedule?.equipmentName ? ` — ${schedule.equipmentName}` : null}
          </p>
        )}

        {mode === 'create' ? (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.scheduleType}</span>
            <Select
              value={scheduleType}
              options={typeOptions}
              onValueChange={(value) => setScheduleType(value as PmScheduleRow['scheduleType'])}
              aria-label={labels.scheduleType}
              data-testid="pm-schedule-type"
            />
          </div>
        ) : (
          <p className="text-sm text-slate-700">
            <span className="font-medium">{labels.scheduleType}: </span>
            {labels.type[schedule!.scheduleType]}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            {labels.intervalValue} ({labels.intervalUnit})
          </span>
          <input
            type="number"
            min={1}
            value={intervalValue}
            onChange={(e) => setIntervalValue(e.target.value)}
            data-testid="pm-schedule-interval"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.warningDays}</span>
          <input
            type="number"
            min={0}
            value={warningDays}
            onChange={(e) => setWarningDays(e.target.value)}
            data-testid="pm-schedule-warning-days"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            {mode === 'create' ? labels.firstDueDate : labels.nextDueDate}
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            data-testid="pm-schedule-due-date"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        {mode === 'edit' ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              data-testid="pm-schedule-active"
            />
            {labels.active}
          </label>
        ) : null}

        {error ? (
          <p role="alert" data-testid="pm-schedule-error" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="pm-schedule-cancel"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            data-testid="pm-schedule-submit"
            className="rounded-md bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? labels.submitting : labels.submit}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
