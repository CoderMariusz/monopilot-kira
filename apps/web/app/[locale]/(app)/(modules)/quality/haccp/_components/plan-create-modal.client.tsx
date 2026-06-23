'use client';

/**
 * MODAL-HACCP-PLAN-CREATE — create a HACCP plan (Wave E3, client island).
 *
 * Design-system conformance: no JSX prototype exists for a live HACCP-plan
 * create modal in prototypes/design/Monopilot Design System/quality/
 * haccp-screens.jsx (the "＋ New HACCP Plan" button at haccp-screens.jsx:18
 * opens an out-of-anchor modal whose markup is not in this file), so this
 * follows the sibling MODAL-CCP-CREATE / MODAL-INSPECTION-CREATE islands:
 * shadcn Modal + Select (no raw <select>; no @radix-ui/* outside packages/ui),
 * useTransition for the optimistic submit, the action's error/forbidden
 * surfaced verbatim.
 *
 * Wires the reviewed `upsertHaccpPlan` Server Action (haccp-plan-actions.ts),
 * imported by the page and passed in as a prop — NEVER authored here. The action
 * validates server-side (zod) and is gated on `quality.haccp.plan_edit`. This
 * island only collects the camelCase payload the action expects (name +
 * scopeType + optional scopeRef) and refreshes the list on success. siteId is
 * NOT collected here (no site picker in scope; the action defaults it to null).
 */

import { useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type { HaccpPlanHeader, HaccpPlanScopeType, UpsertPlanAction } from './haccp-contracts';
import { SCOPE_TYPES } from './labels';
import type { PlanCreateLabels } from './labels';

export function PlanCreateModal({
  open,
  onOpenChange,
  labels,
  upsertPlanAction,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: PlanCreateLabels;
  upsertPlanAction: UpsertPlanAction;
  onSaved?: (plan: HaccpPlanHeader) => void;
}) {
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState<HaccpPlanScopeType | ''>('');
  const [scopeRef, setScopeRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Required: name + scope type. scopeRef is optional.
  const valid = name.trim() !== '' && scopeType !== '';

  function reset() {
    setName('');
    setScopeType('');
    setScopeRef('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (name.trim() === '') return setError(labels.validation.nameRequired);
    if (scopeType === '') return setError(labels.validation.scopeTypeRequired);

    const payload = {
      name: name.trim(),
      scopeType,
      scopeRef: scopeRef.trim() === '' ? null : scopeRef.trim(),
    } as const;

    startTransition(async () => {
      const result = await upsertPlanAction(payload);
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      const saved = result.data;
      reset();
      onOpenChange(false);
      onSaved?.(saved);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="haccp_plan_create_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="haccp-plan-create-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* Plan name. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.name} <span aria-hidden className="text-red-500">*</span>
            </span>
            <input
              type="text"
              data-testid="haccp-plan-create-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder={labels.namePlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {/* Scope type (shadcn Select — no raw <select>). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.scopeType} <span aria-hidden className="text-red-500">*</span>
            </span>
            <div data-testid="haccp-plan-create-scope-type">
              <Select
                aria-label={labels.scopeType}
                value={scopeType}
                placeholder={labels.scopeTypePlaceholder}
                onValueChange={(v) => {
                  setScopeType(v as HaccpPlanScopeType);
                  setError(null);
                }}
                options={SCOPE_TYPES.map((s) => ({ value: s, label: labels.scopeTypeOptions[s] }))}
              />
            </div>
          </label>

          {/* Scope ref (optional). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.scopeRef}</span>
            <input
              type="text"
              data-testid="haccp-plan-create-scope-ref"
              value={scopeRef}
              onChange={(e) => setScopeRef(e.target.value)}
              placeholder={labels.scopeRefPlaceholder}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.scopeRefHelp}</span>
          </label>

          {error && (
            <p role="alert" data-testid="haccp-plan-create-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="haccp-plan-create-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="haccp-plan-create-submit"
          disabled={!valid || pending}
          onClick={submit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
