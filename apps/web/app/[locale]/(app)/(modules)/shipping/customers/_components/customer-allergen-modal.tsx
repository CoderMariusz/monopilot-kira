'use client';

/**
 * Wave-shipping — Add / edit customer allergen restriction modal.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import type {
  AllergenReferenceOption,
  CustomerAllergenRestriction,
  CustomerAllergenRestrictionInput,
  CustomerAllergenRestrictionUpdateInput,
  CustomerResult,
} from './customer-types';

export type CustomerAllergenModalLabels = {
  createTitle: string;
  editTitle: string;
  subtitle: string;
  allergenLabel: string;
  allergenPlaceholder: string;
  restrictionLabel: string;
  restrictionOptions: Record<'refuses' | 'requires_decl', string>;
  notesLabel: string;
  notesPlaceholder: string;
  submitCreate: string;
  submitEdit: string;
  submitting: string;
  cancel: string;
  errors: {
    allergenRequired: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    already_exists: string;
    persistence_failed: string;
  };
};

type CreateAction = (input: CustomerAllergenRestrictionInput) => Promise<CustomerResult<CustomerAllergenRestriction>>;
type UpdateAction = (
  input: CustomerAllergenRestrictionUpdateInput,
) => Promise<CustomerResult<CustomerAllergenRestriction>>;

export type CustomerAllergenModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  restriction?: CustomerAllergenRestriction | null;
  allergenOptions: AllergenReferenceOption[];
  labels: CustomerAllergenModalLabels;
  createRestrictionAction: CreateAction;
  updateRestrictionAction: UpdateAction;
  onSaved: () => void;
};

export function CustomerAllergenModal({
  open,
  onOpenChange,
  customerId,
  restriction,
  allergenOptions,
  labels,
  createRestrictionAction,
  updateRestrictionAction,
  onSaved,
}: CustomerAllergenModalProps) {
  const isEdit = Boolean(restriction);
  const [allergenId, setAllergenId] = React.useState('');
  const [restrictionType, setRestrictionType] = React.useState<'refuses' | 'requires_decl'>('refuses');
  const [notes, setNotes] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (restriction) {
      setAllergenId(restriction.allergenId);
      setRestrictionType(restriction.restrictionType);
      setNotes(restriction.notes ?? '');
    } else {
      setAllergenId(allergenOptions[0]?.id ?? '');
      setRestrictionType('refuses');
      setNotes('');
    }
    setFieldError(null);
  }, [open, restriction, allergenOptions]);

  async function onSubmit() {
    if (!allergenId.trim()) {
      setFieldError(labels.errors.allergenRequired);
      return;
    }
    setPending(true);
    setFieldError(null);
    const payload = {
      customerId,
      allergenId: allergenId.trim(),
      restrictionType,
      notes: notes.trim() || undefined,
    };
    const result = isEdit && restriction
      ? await updateRestrictionAction({ ...payload, restrictionId: restriction.id })
      : await createRestrictionAction(payload);
    setPending(false);
    if (!result.ok) {
      setFieldError(labels.errors[result.error as keyof typeof labels.errors] ?? labels.errors.persistence_failed);
      return;
    }
    onOpenChange(false);
    onSaved();
  }

  const allergenSelectOptions = allergenOptions.map((option) => ({
    value: option.id,
    label: option.name,
  }));

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="customer_allergen_modal">
      <Modal.Header title={isEdit ? labels.editTitle : labels.createTitle} />
      <Modal.Body>
        <div className="flex flex-col gap-4" data-testid="customer-allergen-modal">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">{labels.allergenLabel}</span>
            <Select
              value={allergenId}
              onValueChange={setAllergenId}
              disabled={pending || allergenSelectOptions.length === 0}
              options={allergenSelectOptions}
              placeholder={labels.allergenPlaceholder}
              data-testid="customer-allergen-select"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">{labels.restrictionLabel}</span>
            <Select
              value={restrictionType}
              onValueChange={(value) => setRestrictionType(value as 'refuses' | 'requires_decl')}
              disabled={pending}
              options={[
                { value: 'refuses', label: labels.restrictionOptions.refuses },
                { value: 'requires_decl', label: labels.restrictionOptions.requires_decl },
              ]}
              data-testid="customer-allergen-restriction-type"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="customer-allergen-notes" className="text-xs font-medium text-slate-600">
              {labels.notesLabel}
            </label>
            <Input
              id="customer-allergen-notes"
              data-testid="customer-allergen-notes"
              value={notes}
              disabled={pending}
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {fieldError ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fieldError}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" className="btn--ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              {labels.cancel}
            </Button>
            <Button
              type="button"
              className="btn--primary"
              data-testid="customer-allergen-submit"
              disabled={pending || allergenSelectOptions.length === 0}
              aria-busy={pending}
              onClick={() => void onSubmit()}
            >
              {pending ? labels.submitting : isEdit ? labels.submitEdit : labels.submitCreate}
            </Button>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
