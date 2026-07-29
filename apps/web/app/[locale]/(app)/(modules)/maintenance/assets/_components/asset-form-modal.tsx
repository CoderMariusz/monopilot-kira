'use client';

import { useState, useTransition } from 'react';

import { Select } from '@monopilot/ui/Select';

import { EQUIPMENT_TYPES, type EquipmentAssetRow } from '../_types/asset-schemas';
import { ModalShell } from '../../_components/mwo-modal-shell';

export type AssetFormLabels = {
  createTitle: string;
  editTitle: string;
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
  withdraw: string;
  withdrawing: string;
  withdrawReason: string;
  withdrawReasonPlaceholder: string;
  reactivate: string;
  reactivating: string;
  errorRequired: string;
  errorWithdrawReason: string;
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

type UpdateEquipmentAction = (input: {
  equipmentId: string;
  equipmentCode?: string;
  name: string;
  equipmentType: (typeof EQUIPMENT_TYPES)[number];
  requiresLoto: boolean;
  requiresCalibration: boolean;
}) => Promise<{ ok: boolean; reason?: string }>;

type DeactivateEquipmentAction = (input: {
  equipmentId: string;
  reason: string;
}) => Promise<{ ok: boolean; reason?: string; message?: string }>;

type ReactivateEquipmentAction = (input: {
  equipmentId: string;
}) => Promise<{ ok: boolean; reason?: string }>;

export function AssetFormModal({
  mode,
  asset,
  labels,
  canDeactivate,
  createEquipmentAction,
  updateEquipmentAction,
  deactivateEquipmentAction,
  reactivateEquipmentAction,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  asset?: EquipmentAssetRow;
  labels: AssetFormLabels;
  canDeactivate: boolean;
  createEquipmentAction: CreateEquipmentAction;
  updateEquipmentAction: UpdateEquipmentAction;
  deactivateEquipmentAction: DeactivateEquipmentAction;
  reactivateEquipmentAction: ReactivateEquipmentAction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [equipmentCode, setEquipmentCode] = useState(asset?.equipmentCode ?? '');
  const [name, setName] = useState(asset?.name ?? '');
  const [equipmentType, setEquipmentType] = useState<(typeof EQUIPMENT_TYPES)[number]>(
    (asset?.equipmentType as (typeof EQUIPMENT_TYPES)[number]) ?? 'mixer',
  );
  const [requiresLoto, setRequiresLoto] = useState(asset?.requiresLoto ?? false);
  const [requiresCalibration, setRequiresCalibration] = useState(asset?.requiresCalibration ?? false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [withdrawing, startWithdraw] = useTransition();
  const [reactivating, startReactivate] = useTransition();

  const title = mode === 'create' ? labels.createTitle : labels.editTitle;
  const typeOptions = EQUIPMENT_TYPES.map((value) => ({
    value,
    label: labels.types[value] ?? value,
  }));

  const submit = () => {
    if (mode === 'create' && !equipmentCode.trim()) {
      setError(labels.errorRequired);
      return;
    }
    if (!name.trim()) {
      setError(labels.errorRequired);
      return;
    }

    setError(null);
    startSubmit(async () => {
      const result =
        mode === 'create'
          ? await createEquipmentAction({
              equipmentCode: equipmentCode.trim(),
              name: name.trim(),
              equipmentType,
              requiresLoto,
              requiresCalibration,
            })
          : await updateEquipmentAction({
              equipmentId: asset!.id,
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

  const withdraw = () => {
    if (!asset || withdrawReason.trim().length < 3) {
      setError(labels.errorWithdrawReason);
      return;
    }
    setError(null);
    startWithdraw(async () => {
      const result = await deactivateEquipmentAction({
        equipmentId: asset.id,
        reason: withdrawReason.trim(),
      });
      if (result.ok) onSaved();
      else
        setError(
          result.reason === 'forbidden'
            ? labels.errorForbidden
            : result.message ?? labels.errorFailed,
        );
    });
  };

  const reactivate = () => {
    if (!asset) return;
    setError(null);
    startReactivate(async () => {
      const result = await reactivateEquipmentAction({ equipmentId: asset.id });
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
      testId={mode === 'create' ? 'asset-create-modal' : 'asset-edit-modal'}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.code}</span>
          <input
            type="text"
            value={equipmentCode}
            onChange={(e) => setEquipmentCode(e.target.value)}
            placeholder={labels.codePlaceholder}
            data-testid={mode === 'create' ? 'asset-create-code' : 'asset-edit-code'}
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
            data-testid={mode === 'create' ? 'asset-create-name' : 'asset-edit-name'}
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
            data-testid={mode === 'create' ? 'asset-create-type' : 'asset-edit-type'}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={requiresLoto}
            onChange={(e) => setRequiresLoto(e.target.checked)}
            data-testid={mode === 'create' ? 'asset-create-loto' : 'asset-edit-loto'}
          />
          {labels.requiresLoto}
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={requiresCalibration}
            onChange={(e) => setRequiresCalibration(e.target.checked)}
            data-testid={mode === 'create' ? 'asset-create-calibration' : 'asset-edit-calibration'}
          />
          {labels.requiresCalibration}
        </label>

        {mode === 'edit' && asset && !asset.active && asset.deactivationReason ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            {asset.deactivationReason}
          </p>
        ) : null}

        {mode === 'edit' && asset && showWithdraw ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.withdrawReason}</span>
            <textarea
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value)}
              placeholder={labels.withdrawReasonPlaceholder}
              rows={3}
              data-testid="asset-withdraw-reason"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        ) : null}

        {error ? (
          <p
            role="alert"
            data-testid="asset-form-error"
            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex flex-wrap justify-end gap-2">
          {mode === 'edit' && asset && !asset.active && canDeactivate ? (
            <button
              type="button"
              onClick={reactivate}
              disabled={reactivating}
              data-testid="asset-reactivate"
              className="mr-auto rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
            >
              {reactivating ? labels.reactivating : labels.reactivate}
            </button>
          ) : null}
          {mode === 'edit' && asset?.active && canDeactivate && !showWithdraw ? (
            <button
              type="button"
              onClick={() => setShowWithdraw(true)}
              data-testid="asset-withdraw-open"
              className="mr-auto rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              {labels.withdraw}
            </button>
          ) : null}
          {mode === 'edit' && asset?.active && showWithdraw ? (
            <button
              type="button"
              onClick={withdraw}
              disabled={withdrawing}
              data-testid="asset-withdraw-submit"
              className="mr-auto rounded-md border border-amber-300 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-60"
            >
              {withdrawing ? labels.withdrawing : labels.withdraw}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            data-testid={mode === 'create' ? 'asset-create-cancel' : 'asset-edit-cancel'}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {labels.cancel}
          </button>
          {mode === 'create' || (asset?.active && !showWithdraw) ? (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              data-testid={mode === 'create' ? 'asset-create-submit' : 'asset-edit-submit'}
              className="rounded-md bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {submitting ? labels.submitting : labels.submit}
            </button>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
