'use client';

/**
 * T-047 — TEC-040 Allergen Declaration / manual-override modal (client island).
 *
 * Prototype parity (1:1):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:309-347
 *   (`AllergenDeclarationModal`, MODAL-05).
 *
 * The prototype is a confirm-with-checklist Allergen Declaration dialog. We
 * translate it to the production manual-override flow: pick an allergen, declare
 * its intensity (Present / May contain / Trace) + confidence, and supply the
 * MANDATORY override reason (V-TEC-42) — auto-suggestions in the prototype's blue
 * info banner are restated as the "auto-cascaded badges are read-only; override to
 * declare the final label" note. Raw prototype `<input type="checkbox">` becomes
 * a shadcn <Select> (no raw <select>); the `<Modal>`/`btn` chrome becomes the
 * local accessible Dialog (the established items-master deviation — Radix Modal
 * dual-React crash in jsdom). Save calls the real saveAllergenOverride Server
 * Action under withOrgContext + RLS.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';
import Textarea from '@monopilot/ui/Textarea';

import { INTENSITY_OPTIONS, CONFIDENCE_OPTIONS } from './allergen-options';

export type AllergenDeclarationLabels = {
  title: string;
  subtitle: string;
  autoNote: string;
  fieldAllergen: string;
  fieldIntensity: string;
  fieldConfidence: string;
  fieldReason: string;
  reasonPlaceholder: string;
  reasonRequired: string;
  cancel: string;
  save: string;
  saving: string;
  saveError: string;
  intensity: Record<string, string>;
  confidence: Record<string, string>;
  selectPlaceholder: string;
};

export type AllergenChoice = { allergenCode: string; allergenName: string };

export type DeclarationDraft = {
  allergenCode: string;
  intensity: string;
  confidence: string;
  reason: string;
};

export type DeclarationSaveResult = { ok: true } | { ok: false; error: string };

const REASON_MIN = 1;

export function AllergenDeclarationModal({
  open,
  onClose,
  labels,
  allergens,
  initial,
  canEdit,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  labels: AllergenDeclarationLabels;
  allergens: AllergenChoice[];
  initial?: Partial<DeclarationDraft>;
  canEdit: boolean;
  onSave: (draft: DeclarationDraft) => Promise<DeclarationSaveResult>;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = React.useState<DeclarationDraft>({
    allergenCode: initial?.allergenCode ?? '',
    intensity: initial?.intensity ?? 'contains',
    confidence: initial?.confidence ?? 'declared',
    reason: initial?.reason ?? '',
  });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Re-seed the draft whenever the modal (re)opens for a (possibly different) row.
  React.useEffect(() => {
    if (!open) return;
    setDraft({
      allergenCode: initial?.allergenCode ?? '',
      intensity: initial?.intensity ?? 'contains',
      confidence: initial?.confidence ?? 'declared',
      reason: initial?.reason ?? '',
    });
    setError(null);
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // initial is intentionally read on open only (modal seeds once per open).
  }, [open, onClose]);

  if (!open) return null;

  const reasonValid = draft.reason.trim().length >= REASON_MIN;
  const allergenValid = draft.allergenCode.trim().length > 0;
  const canSave = canEdit && reasonValid && allergenValid && !pending;

  const allergenOptions = allergens.map((a) => ({ value: a.allergenCode, label: a.allergenName }));
  const intensityOptions = INTENSITY_OPTIONS.map((v) => ({ value: v, label: labels.intensity[v] ?? v }));
  const confidenceOptions = CONFIDENCE_OPTIONS.map((v) => ({
    value: v,
    label: labels.confidence[v] ?? v,
  }));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reasonValid || !allergenValid) {
      setError(labels.reasonRequired);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await onSave(draft);
      if (result.ok) {
        onClose();
      } else {
        setError(labels.saveError);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      data-testid="allergen-declaration-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-modal-id="TEC-040-ALLERGEN-DECLARE"
        className="w-full max-w-xl rounded-xl border bg-white p-5 text-sm shadow-lg outline-none"
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {labels.title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{labels.subtitle}</p>
          </div>
          <button
            type="button"
            aria-label={`${labels.cancel} ✕`}
            data-testid="allergen-declaration-close"
            className="text-muted-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div
          role="note"
          data-testid="allergen-auto-note"
          className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800"
        >
          ⓘ {labels.autoNote}
        </div>

        <form id="allergen-declaration-form" className="space-y-3" onSubmit={submit}>
          <div className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block">{labels.fieldAllergen}</span>
            <Select
              value={draft.allergenCode}
              onValueChange={(v) => setDraft((d) => ({ ...d, allergenCode: v }))}
              options={allergenOptions}
              placeholder={labels.selectPlaceholder}
              disabled={!canEdit || Boolean(initial?.allergenCode)}
              aria-label={labels.fieldAllergen}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="block text-sm font-medium text-slate-700">
              <span className="mb-1 block">{labels.fieldIntensity}</span>
              <Select
                value={draft.intensity}
                onValueChange={(v) => setDraft((d) => ({ ...d, intensity: v }))}
                options={intensityOptions}
                disabled={!canEdit}
                aria-label={labels.fieldIntensity}
              />
            </div>
            <div className="block text-sm font-medium text-slate-700">
              <span className="mb-1 block">{labels.fieldConfidence}</span>
              <Select
                value={draft.confidence}
                onValueChange={(v) => setDraft((d) => ({ ...d, confidence: v }))}
                options={confidenceOptions}
                disabled={!canEdit}
                aria-label={labels.fieldConfidence}
              />
            </div>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            {labels.fieldReason}
            <Textarea
              name="reason"
              required
              rows={3}
              maxLength={2000}
              placeholder={labels.reasonPlaceholder}
              value={draft.reason}
              disabled={!canEdit}
              aria-label={labels.fieldReason}
              data-testid="allergen-override-reason"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((d) => ({ ...d, reason: value }));
              }}
            />
            {!reasonValid ? (
              <span role="alert" className="mt-1 block text-xs text-red-600">
                {labels.reasonRequired}
              </span>
            ) : null}
          </label>

          {error ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </form>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" className="btn-secondary" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            className="btn-primary"
            form="allergen-declaration-form"
            disabled={!canSave}
            data-testid="allergen-override-save"
          >
            {pending ? labels.saving : labels.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
