'use client';

import { useState, useTransition } from 'react';

import type { EquipmentOption, MwoDetailRow, MwoPriority } from '../_actions/mwo-actions';
import type { MwoListLabels } from './mwo-list.client';
import { ModalShell } from './mwo-modal-shell';

export type UpdateMwoAction = (input: {
  mwoId: string;
  equipmentId: string;
  title: string;
  description?: string;
  priority: MwoPriority;
  dueDate?: string;
}) => Promise<{ ok: boolean; reason?: string; message?: string; data?: MwoDetailRow }>;

/** Edit modal for non-started MWOs (open / requested / approved). */
export function MwoEditModal({
  mwo,
  equipment,
  labels,
  updateMwoAction,
  onClose,
  onUpdated,
}: {
  mwo: MwoDetailRow;
  equipment: EquipmentOption[];
  labels: MwoListLabels;
  updateMwoAction: UpdateMwoAction;
  onClose: () => void;
  onUpdated: (updated: MwoDetailRow) => void;
}) {
  const [equipmentId, setEquipmentId] = useState(mwo.equipmentId ?? '');
  const [title, setTitle] = useState(mwo.title);
  const [description, setDescription] = useState(mwo.description ?? '');
  const [priority, setPriority] = useState<MwoPriority>(mwo.priority);
  const [dueDate, setDueDate] = useState(mwo.dueDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const submit = () => {
    if (!equipmentId || title.trim().length < 3) {
      setError(labels.edit.errorRequired);
      return;
    }
    setError(null);
    startSubmit(async () => {
      const result = await updateMwoAction({
        mwoId: mwo.id,
        equipmentId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
      });
      if (result.ok && result.data) onUpdated(result.data);
      else if (result.reason === 'forbidden') setError(labels.edit.errorForbidden);
      else if (result.reason === 'invalid_transition') setError(labels.edit.errorLocked);
      else setError(labels.edit.errorFailed);
    });
  };

  return (
    <ModalShell title={labels.edit.title} testId="mwo-edit-modal" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.create.equipment}</span>
          {equipment.length === 0 ? (
            <span
              data-testid="mwo-edit-no-equipment"
              className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800"
            >
              {labels.create.noEquipment}
            </span>
          ) : (
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              data-testid="mwo-edit-equipment"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="">{labels.create.equipmentPlaceholder}</option>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} · {e.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.create.titleField}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={labels.create.titlePlaceholder}
            data-testid="mwo-edit-title"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.create.description}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={labels.create.descriptionPlaceholder}
            rows={3}
            data-testid="mwo-edit-description"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.create.priority}</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as MwoPriority)}
              data-testid="mwo-edit-priority"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            >
              {(['low', 'medium', 'high', 'critical'] as const).map((p) => (
                <option key={p} value={p}>
                  {labels.priority[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.create.dueDate}</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="mwo-edit-due-date"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>

        {error ? (
          <p
            role="alert"
            data-testid="mwo-edit-error"
            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="mwo-edit-cancel"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {labels.edit.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || equipment.length === 0}
            data-testid="mwo-edit-submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? labels.edit.submitting : labels.edit.submit}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
