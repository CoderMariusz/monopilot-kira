'use client';

import { useState, useTransition } from 'react';

import type { MachineOption, MwoPriority } from '../_actions/mwo-actions';
import type { CreateMwoAction, MwoListLabels } from './mwo-list.client';
import { ModalShell } from './mwo-modal-shell';

/** MODAL: create MWO (modals.jsx:186-233, machine-scoped reactive subset). */
export function MwoCreateModal({
  machines,
  labels,
  createMwoAction,
  onClose,
  onCreated,
}: {
  machines: MachineOption[];
  labels: MwoListLabels;
  createMwoAction: CreateMwoAction;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [machineId, setMachineId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MwoPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const submit = () => {
    if (!machineId || title.trim().length < 3) {
      setError(labels.create.errorRequired);
      return;
    }
    setError(null);
    startSubmit(async () => {
      const result = await createMwoAction({
        machineId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
      });
      if (result.ok) onCreated();
      else setError(result.reason === 'forbidden' ? labels.transition.errorForbidden : labels.create.errorFailed);
    });
  };

  return (
    <ModalShell title={labels.create.title} testId="mwo-create-modal" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{labels.create.machine}</span>
          {machines.length === 0 ? (
            <span data-testid="mwo-create-no-machines" className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              {labels.create.noMachines}
            </span>
          ) : (
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              data-testid="mwo-create-machine"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="">{labels.create.machinePlaceholder}</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} · {m.name}
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
            data-testid="mwo-create-title"
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
            data-testid="mwo-create-description"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{labels.create.priority}</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as MwoPriority)}
              data-testid="mwo-create-priority"
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
              data-testid="mwo-create-due-date"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>

        {error ? (
          <p role="alert" data-testid="mwo-create-error" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="mwo-create-cancel"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {labels.create.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || machines.length === 0}
            data-testid="mwo-create-submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? labels.create.submitting : labels.create.submit}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
