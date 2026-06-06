'use client';

/**
 * NPD PACKAGING stage — add/edit component Modal.
 *
 * Renders the @monopilot/ui Modal with a small form (component / material /
 * supplier / spec / cost-per-unit / status / tier). On submit it calls the
 * `onUpsert` Server Action passed in as a prop (Next16 function-prop crash
 * guard — never a raw closure authored in the RSC). No raw <select> — uses the
 * @monopilot/ui Select primitive. cost_per_unit is kept as a decimal STRING.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type { PackagingLabels, MutationOutcome, UpsertCall } from './packaging-screen';
import type {
  PackagingComponentRow,
  PackagingStatus,
  PackagingTier,
} from '../_actions/shared';

type FormState = {
  componentName: string;
  material: string;
  supplierCode: string;
  spec: string;
  costPerUnit: string;
  status: PackagingStatus;
  tier: PackagingTier;
};

function rowToForm(row: PackagingComponentRow | null, defaultTier: PackagingTier): FormState {
  return {
    componentName: row?.componentName ?? '',
    material: row?.material ?? '',
    supplierCode: row?.supplierCode ?? '',
    spec: row?.spec ?? '',
    costPerUnit: row?.costPerUnit ?? '',
    status: row?.status ?? 'draft',
    tier: row?.tier ?? defaultTier,
  };
}

export function PackagingComponentModal({
  open,
  onOpenChange,
  projectId,
  editing,
  defaultTier,
  labels,
  onUpsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  editing: PackagingComponentRow | null;
  defaultTier: PackagingTier;
  labels: PackagingLabels;
  onUpsert: (call: UpsertCall) => Promise<MutationOutcome>;
}) {
  const [form, setForm] = React.useState<FormState>(() => rowToForm(editing, defaultTier));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(rowToForm(editing, defaultTier));
      setError(null);
      setSaving(false);
    }
  }, [open, editing, defaultTier]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const name = form.componentName.trim();
    if (name === '') {
      setError(labels.saveError);
      return;
    }
    const cost = form.costPerUnit.trim();
    if (cost !== '' && !/^\d+(\.\d+)?$/.test(cost)) {
      setError(labels.saveError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await onUpsert({
        id: editing?.id,
        projectId,
        tier: form.tier,
        componentName: name,
        material: form.material.trim() || null,
        supplierCode: form.supplierCode.trim() || null,
        spec: form.spec.trim() || null,
        costPerUnit: cost || null,
        status: form.status,
      });
      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(labels.saveError);
        setSaving(false);
      }
    } catch {
      setError(labels.saveError);
      setSaving(false);
    }
  }

  const statusOptions = [
    { value: 'approved', label: labels.statusApproved },
    { value: 'pending_artwork', label: labels.statusPendingArtwork },
    { value: 'draft', label: labels.statusDraft },
  ];
  const tierOptions = [
    { value: 'primary', label: labels.tierPrimary },
    { value: 'secondary', label: labels.tierSecondary },
  ];

  return (
    <Modal open={open} onOpenChange={onOpenChange} modalId="npd-packaging-component" size="md">
      <Modal.Header title={editing ? labels.editComponent : labels.addComponent} />
      <form onSubmit={handleSubmit} data-testid="packaging-component-form">
        <Modal.Body>
          <div className="grid gap-3">
            <label>
              <span>{labels.fieldComponent}</span>
              <Input
                name="componentName"
                value={form.componentName}
                onChange={(e) => set('componentName', e.target.value)}
                required
                data-testid="field-component-name"
              />
            </label>
            <label>
              <span>{labels.fieldTier}</span>
              <Select
                aria-label={labels.fieldTier}
                value={form.tier}
                options={tierOptions}
                onValueChange={(v) => set('tier', v as PackagingTier)}
              />
            </label>
            <label>
              <span>{labels.fieldMaterial}</span>
              <Input
                name="material"
                value={form.material}
                onChange={(e) => set('material', e.target.value)}
                data-testid="field-material"
              />
            </label>
            <label>
              <span>{labels.fieldSupplier}</span>
              <Input
                name="supplierCode"
                value={form.supplierCode}
                onChange={(e) => set('supplierCode', e.target.value)}
                data-testid="field-supplier"
              />
            </label>
            <label>
              <span>{labels.fieldSpec}</span>
              <Input
                name="spec"
                value={form.spec}
                onChange={(e) => set('spec', e.target.value)}
                data-testid="field-spec"
              />
            </label>
            <label>
              <span>{labels.fieldCostUnit}</span>
              <Input
                name="costPerUnit"
                inputMode="decimal"
                value={form.costPerUnit}
                onChange={(e) => set('costPerUnit', e.target.value)}
                data-testid="field-cost"
              />
            </label>
            <label>
              <span>{labels.fieldStatus}</span>
              <Select
                aria-label={labels.fieldStatus}
                value={form.status}
                options={statusOptions}
                onValueChange={(v) => set('status', v as PackagingStatus)}
              />
            </label>
            {error && (
              <div role="alert" className="alert alert-red" data-testid="form-error">
                {error}
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            className="btn-ghost"
            onClick={() => onOpenChange(false)}
            data-testid="cancel-component"
          >
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            className="btn-primary"
            disabled={saving}
            data-testid="submit-component"
          >
            {saving ? labels.saving : labels.save}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
