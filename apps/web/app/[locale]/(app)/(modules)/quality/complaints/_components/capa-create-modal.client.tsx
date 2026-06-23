'use client';

/**
 * MODAL — Add a CAPA action (Wave E11, client island).
 *
 * Design-system conformance: mirrors the sibling MODAL-NCR-CREATE / CCP-deviation
 * resolve markup/density — shadcn Modal (no raw <select>), action-type pills,
 * useTransition for the optimistic submit, action error surfaced VERBATIM.
 *
 * Wires the reviewed `createCapaAction` Server Action (backend DONE — imported,
 * passed in as a prop, never authored here). Contract: createCapaAction({sourceType,
 * sourceId, actionType, description, ownerUserId?, dueDate?}). sourceType +
 * sourceId are fixed by the parent (the complaint) and passed in.
 *
 * DEVIATION (documented per UI-PROTOTYPE-PARITY-POLICY.md): the reviewed action
 * takes ownerUserId as a UUID and there is no user PICKER yet (a free-text UUID
 * input is the banned raw-UUID antipattern). The "owner" field is exposed as
 * optional free text but is NOT sent to the action (no resolver) — ownerUserId
 * stays unset; assigning an owner is a follow-up once a user picker lands. dueDate
 * is a real <input type=date> wired to the action's YYYY-MM-DD slot.
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';

import {
  CAPA_ACTION_TYPES,
  type CapaActionType,
  type CapaSourceType,
  type CreateCapaActionAction,
} from './complaints-contracts';
import type { CapaCreateLabels } from './labels';

const DESCRIPTION_MAX = 4000;

export function CapaCreateModal({
  open,
  onOpenChange,
  sourceType,
  sourceId,
  labels,
  createCapaActionAction,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceType: CapaSourceType;
  sourceId: string;
  labels: CapaCreateLabels;
  createCapaActionAction: CreateCapaActionAction;
  onCreated?: () => void;
}) {
  const [actionType, setActionType] = useState<CapaActionType>('corrective');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmedDesc = description.trim();
  const valid = trimmedDesc.length > 0;

  function reset() {
    setActionType('corrective');
    setDescription('');
    setOwner('');
    setDueDate('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (trimmedDesc.length === 0) {
      setError(labels.validation.descriptionRequired);
      return;
    }

    startTransition(async () => {
      const result = await createCapaActionAction({
        sourceType,
        sourceId,
        actionType,
        description: trimmedDesc,
        ...(dueDate ? { dueDate } : {}),
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.error));
        return;
      }
      reset();
      onOpenChange(false);
      onCreated?.();
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="capa_create_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="capa-create-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* Action type pills (corrective / preventive) — no raw <select>. */}
          <fieldset>
            <legend className="mb-1 font-medium text-slate-700">
              {labels.actionType} <span aria-hidden className="text-red-500">*</span>
            </legend>
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label={labels.actionType}
              data-testid="capa-create-actiontype"
            >
              {CAPA_ACTION_TYPES.map((a) => (
                <button
                  key={a}
                  type="button"
                  data-testid={`capa-create-actiontype-${a}`}
                  aria-pressed={actionType === a}
                  onClick={() => setActionType(a)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs capitalize transition',
                    actionType === a
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  ].join(' ')}
                >
                  {labels.actionTypeOptions[a]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">{labels.actionTypeHelp}</p>
          </fieldset>

          {/* Description (required). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.description} <span aria-hidden className="text-red-500">*</span>
            </span>
            <textarea
              data-testid="capa-create-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              rows={3}
              placeholder={labels.descriptionPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.descriptionHelp}</span>
          </label>

          {/* Owner (free text — no user picker / UUID on the reviewed action). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.owner}</span>
            <input
              type="text"
              data-testid="capa-create-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              maxLength={120}
              placeholder={labels.ownerPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.ownerHelp}</span>
          </label>

          {/* Due date — real date input wired to the action's YYYY-MM-DD slot. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.dueDate}</span>
            <input
              type="date"
              data-testid="capa-create-duedate"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-44 rounded-md border border-slate-300 px-2.5 py-1.5 font-mono focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.dueDateHelp}</span>
          </label>

          {error && (
            <p role="alert" data-testid="capa-create-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="capa-create-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="capa-create-submit"
          disabled={!valid || pending}
          onClick={submit}
          title={!valid ? labels.formIncomplete : undefined}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
