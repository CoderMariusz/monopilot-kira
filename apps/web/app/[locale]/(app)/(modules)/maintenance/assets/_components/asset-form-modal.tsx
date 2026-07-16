'use client';

import { useState, useTransition } from 'react';

import { Select } from '@monopilot/ui/Select';

import { EQUIPMENT_TYPES } from '../_types/asset-schemas';
import { ModalShell } from '../../_components/mwo-modal-shell';

export type AssetFormLabels = {
  createTitle: string;
  code: string;
  codePlaceholder: string;
  name: string;
  namePlaceholder: string;
  type: string;
  requiresLoto: string;
  requiresCalibration: string;
  submit: string;
  submitting: string;
  cancel: string;
  errorRequired: string;
  errorFailed: string;
  errorForbidden: string;
  errorConflict: string;
  types: Record<string, string>;
};

type CreateEquipmentAction = (input: {
  equipmentCode: string;
  name: string;
  equipmentType: (typeof EQUIPMENT_TYPES)[number];
  requiresLoto?: boolean;
  requiresCalibration?: boolean;
}) => Promise<{ ok: boolean; reason?: string }>;

export function AssetFormModal({
  labels,
  createEquipmentAction,
  onClose,
  onSaved,
}: {
  labels: AssetFormLabels;
  createEquipmentAction: CreateEquipmentAction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [equipmentCode, setEquipmentCode] = useState('');
  const [name, setName] = useState('');
  const [equipmentType, setEquipmentType] = useState<(typeof EQUIPMENT_TYPES)[number]>('mixer');
  const [requiresLoto, setRequiresLoto] = useState(false);
  const [requiresCalibration, setRequiresCalibration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const typeOptions = EQUIPMENT_TYPES.map((value) => ({
    value,
    label: labels.types[value] ?? value,
  }));

  const submit = () => {
    if (!equipmentCode.trim() || !name.trim()) {
      setError(labels.errorRequired);
      return;
    }

    setError(null);
    startSubmit(async () => {
      const result = await createEquipmentAction({
        equipmentCode: equipmentCode.trim(),
        name: name.trim(),
        equipmentType,
        requiresLoto,
        requiresCalibration,
      });
      if (result.ok) {
        onSaved();
        return;
      }
      setError(
        result.reason === 'forbidden'
          ? labels.errorForbidden
          : result.reason === 'conflict'
            ? labels.errorConflict
            : labels.errorFailed,
      );
    });
  };

  return (
    <ModalShell title={labels.createTitle} testId="asset-create-modal" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.code}</span>
          <input
            type="text"
            value={equipmentCode}
            onChange={(e) => setEquipmentCode(e.target.value)}
            placeholder={labels.codePlaceholder}
            data-testid="asset-create-code"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.name}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={labels.namePlaceholder}
            data-testid="asset-create-name"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.type}</span>
          <Select
            value={equipmentType}
            options={typeOptions}
            onValueChange={(value) => setEquipmentType(value as (typeof EQUIPMENT_TYPES)[number])}
            aria-label={labels.type}
            data-testid="asset-create-type"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={requiresLoto}
            onChange={(e) => setRequiresLoto(e.target.checked)}
            data-testid="asset-create-loto"
          />
          {labels.requiresLoto}
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={requiresCalibration}
            onChange={(e) => setRequiresCalibration(e.target.checked)}
            data-testid="asset-create-calibration"
          />
          {labels.requiresCalibration}
        </label>

        {error ? (
          <p
            role="alert"
            data-testid="asset-create-error"
            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="asset-create-cancel"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            data-testid="asset-create-submit"
            className="rounded-md bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? labels.submitting : labels.submit}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
