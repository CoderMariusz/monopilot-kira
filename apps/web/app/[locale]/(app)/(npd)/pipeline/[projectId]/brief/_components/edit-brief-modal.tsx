'use client';

/**
 * NPD project-stage Brief — Edit modal (additive write affordance).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:45-105 (BriefScreen).
 *   The prototype's two-column form (Product name / Category·select / Target
 *   launch / Target price / Pack format / Sales channel·select / Expected volume
 *   / Target audience + full-width Marketing claims / Constraints·textarea /
 *   Notes·textarea) is reproduced here inside the @monopilot/ui Modal — the
 *   project-stage READ view stays read-only; editing happens in this dialog.
 *
 * Uses @monopilot/ui Modal / Input / Select primitives only (no raw <select>).
 * The mutation Server Action is passed in as `onUpdate` (Next16 function-prop
 * crash guard — never a raw closure authored in the RSC). Decimal values
 * (target price, pack weight) are carried as STRINGS, never coerced to floats.
 *
 * On submit the form builds the exact zod patch the reviewed `updateProjectBrief`
 * action expects ({ projectId, patch: { productName, category, ... } }); empty
 * optional fields are sent as null (the action's optionalText/-Decimal contract).
 * Action error codes (INVALID_INPUT / FORBIDDEN / NOT_FOUND / PERSISTENCE_FAILED)
 * are mapped to inline messages. Success → onSaved() (router.refresh in parent).
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select, type SelectOption } from '@monopilot/ui/Select';

import type { ProjectBriefLabels } from './project-brief-screen';
import type { ProjectBriefView } from '../_actions/read-project-brief';

/** Mirrors the reviewed updateProjectBrief zod patch field names exactly. */
export type BriefPatch = {
  productName: string | null;
  category: string | null;
  targetLaunchDate: string | null;
  packFormat: string | null;
  packWeightG: string | null;
  expectedVolume: string | null;
  marketingClaims: string | null;
  targetRetailPriceEur: string | null;
  salesChannel: string | null;
  targetAudience: string | null;
  constraints: string | null;
  notes: string | null;
};

export type UpdateBriefCall = { projectId: string; patch: BriefPatch };
export type UpdateBriefOutcome =
  | { ok: true }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED' };

type FormState = {
  productName: string;
  category: string;
  targetLaunchDate: string;
  targetRetailPriceEur: string;
  packFormat: string;
  packWeightG: string;
  salesChannel: string;
  expectedVolume: string;
  targetAudience: string;
  marketingClaims: string;
  constraints: string;
  notes: string;
};

function viewToForm(data: ProjectBriefView): FormState {
  return {
    productName: data.productName ?? '',
    category: data.category ?? '',
    targetLaunchDate: data.targetLaunchDate ?? '',
    targetRetailPriceEur: data.targetRetailPriceEur ?? '',
    packFormat: data.packFormat ?? '',
    packWeightG: data.packWeightG ?? '',
    salesChannel: data.salesChannel ?? '',
    expectedVolume: data.expectedVolume ?? '',
    targetAudience: data.targetAudience ?? '',
    marketingClaims: data.marketingClaims ?? '',
    constraints: data.constraints ?? '',
    notes: data.notes ?? '',
  };
}

/** Trim → null for empty (the action's optionalText/-Decimal contract). */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Prototype option lists (project.jsx:67-78). The CURRENT stored value is folded
// in when it falls outside the canonical list so the Select stays accurate.
const CATEGORY_OPTIONS = [
  'Meat · Cold cut',
  'Meat · Smoked',
  'Meat · Cured',
  'Meat · Pâté',
  'Fish · Smoked',
];
const CHANNEL_OPTIONS = ['Retail', 'HoReCa', 'Industrial', 'Export'];

function withCurrent(canonical: string[], current: string): SelectOption[] {
  const values = current && !canonical.includes(current) ? [current, ...canonical] : canonical;
  return values.map((v) => ({ value: v, label: v }));
}

function errorMessage(
  error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED',
  labels: ProjectBriefLabels,
): string {
  switch (error) {
    case 'INVALID_INPUT':
      return labels.errInvalidInput;
    case 'FORBIDDEN':
      return labels.errForbidden;
    case 'NOT_FOUND':
      return labels.errNotFound;
    default:
      return labels.errPersistence;
  }
}

export function EditBriefModal({
  open,
  onOpenChange,
  projectId,
  data,
  labels,
  onUpdate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  data: ProjectBriefView;
  labels: ProjectBriefLabels;
  onUpdate: (call: UpdateBriefCall) => Promise<UpdateBriefOutcome>;
  onSaved?: () => void;
}) {
  const [form, setForm] = React.useState<FormState>(() => viewToForm(data));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(viewToForm(data));
      setError(null);
      setSaving(false);
    }
  }, [open, data]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    const patch: BriefPatch = {
      productName: orNull(form.productName),
      category: orNull(form.category),
      targetLaunchDate: orNull(form.targetLaunchDate),
      packFormat: orNull(form.packFormat),
      packWeightG: orNull(form.packWeightG),
      expectedVolume: orNull(form.expectedVolume),
      marketingClaims: orNull(form.marketingClaims),
      targetRetailPriceEur: orNull(form.targetRetailPriceEur),
      salesChannel: orNull(form.salesChannel),
      targetAudience: orNull(form.targetAudience),
      constraints: orNull(form.constraints),
      notes: orNull(form.notes),
    };

    try {
      const result = await onUpdate({ projectId, patch });
      if (result.ok) {
        onOpenChange(false);
        onSaved?.();
      } else {
        setError(errorMessage(result.error, labels));
        setSaving(false);
      }
    } catch {
      setError(labels.errPersistence);
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} modalId="npd-brief-edit" size="lg">
      <Modal.Header title={labels.editModalTitle} />
      <form onSubmit={handleSubmit} data-testid="brief-edit-form">
        <Modal.Body>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">{labels.fieldProductName}</span>
              <Input
                value={form.productName}
                onChange={(e) => set('productName', e.target.value)}
                data-testid="brief-field-productName"
              />
            </label>
            <label className="field">
              <span className="field__label">{labels.fieldCategory}</span>
              <Select
                aria-label={labels.fieldCategory}
                value={form.category}
                options={withCurrent(CATEGORY_OPTIONS, form.category)}
                onValueChange={(v) => set('category', v)}
              />
            </label>
            <label className="field">
              <span className="field__label">{labels.fieldTargetLaunch}</span>
              <Input
                type="date"
                value={form.targetLaunchDate}
                onChange={(e) => set('targetLaunchDate', e.target.value)}
                data-testid="brief-field-targetLaunchDate"
              />
            </label>
            <label className="field">
              <span className="field__label">{labels.fieldTargetPrice}</span>
              <Input
                inputMode="decimal"
                value={form.targetRetailPriceEur}
                onChange={(e) => set('targetRetailPriceEur', e.target.value)}
                data-testid="brief-field-targetRetailPriceEur"
              />
            </label>
            <label className="field">
              <span className="field__label">{labels.fieldPackFormat}</span>
              <Input
                value={form.packFormat}
                onChange={(e) => set('packFormat', e.target.value)}
                data-testid="brief-field-packFormat"
              />
            </label>
            <label className="field">
              <span className="field__label">{labels.fieldPackWeight}</span>
              <Input
                inputMode="decimal"
                value={form.packWeightG}
                onChange={(e) => set('packWeightG', e.target.value)}
                data-testid="brief-field-packWeightG"
              />
            </label>
            <label className="field">
              <span className="field__label">{labels.fieldSalesChannel}</span>
              <Select
                aria-label={labels.fieldSalesChannel}
                value={form.salesChannel}
                options={withCurrent(CHANNEL_OPTIONS, form.salesChannel)}
                onValueChange={(v) => set('salesChannel', v)}
              />
            </label>
            <label className="field">
              <span className="field__label">{labels.fieldExpectedVolume}</span>
              <Input
                value={form.expectedVolume}
                onChange={(e) => set('expectedVolume', e.target.value)}
                data-testid="brief-field-expectedVolume"
              />
            </label>
            <label className="field">
              <span className="field__label">{labels.fieldTargetAudience}</span>
              <Input
                value={form.targetAudience}
                onChange={(e) => set('targetAudience', e.target.value)}
                data-testid="brief-field-targetAudience"
              />
            </label>
          </div>

          <label className="field">
            <span className="field__label">{labels.fieldMarketingClaims}</span>
            <Input
              value={form.marketingClaims}
              onChange={(e) => set('marketingClaims', e.target.value)}
              data-testid="brief-field-marketingClaims"
            />
          </label>
          <label className="field">
            <span className="field__label">{labels.fieldConstraints}</span>
            <textarea
              rows={2}
              value={form.constraints}
              onChange={(e) => set('constraints', e.target.value)}
              data-testid="brief-field-constraints"
            />
          </label>
          <label className="field">
            <span className="field__label">{labels.fieldNotes}</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              data-testid="brief-field-notes"
            />
          </label>

          {error && (
            <div role="alert" className="alert alert-red" data-testid="brief-form-error">
              {error}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            className="btn-ghost"
            onClick={() => onOpenChange(false)}
            data-testid="brief-cancel"
          >
            {labels.cancel}
          </Button>
          <Button type="submit" className="btn-primary" disabled={saving} data-testid="brief-submit">
            {saving ? labels.saving : labels.save}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
