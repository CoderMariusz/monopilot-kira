'use client';

/**
 * NPD PILOT stage — PilotMaterialModal ("+ Add material" / "Edit" dialog).
 *
 * Additive edit affordance over the (otherwise read-only) prototype
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:374-389
 * — the material-reservation table. There is NO delete Server Action for
 * pilot-run materials, so this modal only covers ADD and EDIT (no delete
 * affordance is invented).
 *
 * Field names / types match the `upsertPilotMaterial` zod schema 1:1:
 *   materialId (uuid | null), ingredientCode (string), requiredKg (decimal
 *   string), availableKg (decimal string), reservedKg (decimal string).
 * The server recomputes status (reserved >= required → 'reserved' else 'short'),
 * so the form does not expose status. Qty inputs stay STRINGS (never floats).
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';

import type { PilotActionOutcome, PilotLabels, PilotMaterialView } from './pilot-screen';

export type PilotMaterialFormValues = {
  ingredientCode: string;
  requiredKg: string;
  availableKg: string;
  reservedKg: string;
};

const EMPTY: PilotMaterialFormValues = {
  ingredientCode: '',
  requiredKg: '',
  availableKg: '',
  reservedKg: '',
};

function fromMaterial(material: PilotMaterialView | null): PilotMaterialFormValues {
  if (!material) return EMPTY;
  return {
    ingredientCode: material.ingredientCode,
    requiredKg: material.requiredKg ?? '',
    availableKg: material.availableKg ?? '',
    reservedKg: material.reservedKg ?? '',
  };
}

export function PilotMaterialModal({
  open,
  onOpenChange,
  labels,
  material,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: PilotLabels;
  /** Pre-fill values when editing; null = add a new material. */
  material: PilotMaterialView | null;
  onSubmit: (values: PilotMaterialFormValues) => Promise<PilotActionOutcome>;
}) {
  const [values, setValues] = React.useState<PilotMaterialFormValues>(() => fromMaterial(material));
  const [submitState, setSubmitState] = React.useState<'idle' | 'saving' | 'error'>('idle');

  React.useEffect(() => {
    if (open) {
      setValues(fromMaterial(material));
      setSubmitState('idle');
    }
  }, [open, material]);

  function update<K extends keyof PilotMaterialFormValues>(key: K, next: PilotMaterialFormValues[K]) {
    setSubmitState('idle');
    setValues((prev) => ({ ...prev, [key]: next }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitState === 'saving') return;
    if (
      values.ingredientCode.trim() === '' ||
      values.requiredKg.trim() === '' ||
      values.availableKg.trim() === '' ||
      values.reservedKg.trim() === ''
    ) {
      setSubmitState('error');
      return;
    }
    setSubmitState('saving');
    const result = await onSubmit(values);
    if (result.ok) {
      onOpenChange(false);
    } else {
      setSubmitState('error');
    }
  }

  const title = material ? labels.editMaterial : labels.addMaterial;

  return (
    <Modal open={open} onOpenChange={onOpenChange} modalId="npd-pilot-material" size="md">
      <Modal.Header title={title} />
      <form onSubmit={handleSubmit} data-testid="pilot-material-form">
        <Modal.Body>
          <div className="space-y-3">
            <div className="field">
              <label htmlFor="material-ingredient">{labels.fieldIngredient}</label>
              <Input
                id="material-ingredient"
                value={values.ingredientCode}
                onChange={(e) => update('ingredientCode', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="material-required">{labels.fieldRequired}</label>
              <Input
                id="material-required"
                inputMode="decimal"
                value={values.requiredKg}
                onChange={(e) => update('requiredKg', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="material-available">{labels.fieldAvailable}</label>
              <Input
                id="material-available"
                inputMode="decimal"
                value={values.availableKg}
                onChange={(e) => update('availableKg', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="material-reserved">{labels.fieldReserved}</label>
              <Input
                id="material-reserved"
                inputMode="decimal"
                value={values.reservedKg}
                onChange={(e) => update('reservedKg', e.target.value)}
                required
              />
            </div>
            {submitState === 'error' ? (
              <div role="alert" className="alert alert-red" data-testid="pilot-material-error">
                {labels.saveError}
              </div>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="default" className="btn-ghost" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button type="submit" disabled={submitState === 'saving'} data-testid="pilot-material-submit">
            {submitState === 'saving' ? labels.saving : labels.save}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
