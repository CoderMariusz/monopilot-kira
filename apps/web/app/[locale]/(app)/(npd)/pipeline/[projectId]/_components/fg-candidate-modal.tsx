'use client';

/**
 * FgCandidateModal — wires the existing-but-unused createOrMapFgCandidateAtG3
 * Server Action to a real UI on the NPD project surface.
 *
 * Owner dead-end fixed ("Finished Good not found"): a project sitting at gate
 * G2/G3 has no `public.product` row yet, so its FG page rendered empty. From the
 * project header the user can now CREATE (or LINK) the FG candidate that the
 * downstream FG surfaces require.
 *
 * Owner-decided UX (ASK-with-suggested-code — never silent):
 *   - mode toggle: "Create new FG" (default) vs "Link existing FG"
 *   - Create mode: a code input PRE-FILLED with the suggested `FG-{projectCode}`,
 *     fully editable by the user before submit.
 *   - Link mode: a code input for an existing FG/product code.
 *   - submit → createOrMapFgCandidateAtG3({ projectId, mode, productCode })
 *   - success → onCreated(returnedProductCode) (the host maps this to
 *     router.push('/{locale}/fa/{productCode}')).
 *   - error → the action's error code is mapped to a friendly inline message
 *     (never thrown). PERSISTENCE_FAILED / unknown codes fall back to the
 *     generic message; a thrown error is also caught and surfaced generically.
 *
 * Parity / style: matches the sibling fa-create-modal.tsx — @monopilot/ui Modal
 * (Radix dialog, no native <dialog>, no raw <select>) + Input + Button, the same
 * `.ff` field chrome and `.alert alert-red` inline error block, btn-secondary /
 * btn-primary footer buttons.
 *
 * Next 16 RSC contract: the Server Action is INJECTED as a function prop (the
 * page/layout owns it; the action is imported there, never authored here). RBAC
 * is resolved server-side — when the caller may not advance the gate the layout
 * passes no `action`, and the submit button is honestly disabled.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';

/** Mirrors createOrMapFgCandidateAtG3's input + return envelope (imported by the host). */
export type CreateOrMapFgCandidateAction = (input: {
  projectId: string;
  mode: 'create' | 'map';
  productCode?: string | null;
}) => Promise<
  | { ok: true; data: { projectId: string; productCode: string; created: boolean; mapped: boolean } }
  | { ok: false; error: string; status: number }
>;

export type FgCandidateLabels = {
  title: string;
  subtitle: string;
  modeCreate: string;
  modeMap: string;
  fieldCreateCode: string;
  fieldCreateCodeHint: string;
  fieldMapCode: string;
  fieldMapCodeHint: string;
  cancel: string;
  submitCreate: string;
  submitMap: string;
  submitting: string;
  // Friendly text for each action error code (never the raw code).
  errorInvalidInput: string;
  errorG3Only: string;
  errorFgAlreadyLinked: string;
  errorForbidden: string;
  errorNotFound: string;
  errorGeneric: string;
};

type Mode = 'create' | 'map';

function friendlyError(code: string, labels: FgCandidateLabels): string {
  switch (code) {
    case 'INVALID_INPUT':
      return labels.errorInvalidInput;
    case 'G3_ONLY':
      return labels.errorG3Only;
    case 'FG_ALREADY_LINKED':
      return labels.errorFgAlreadyLinked;
    case 'FORBIDDEN':
      return labels.errorForbidden;
    case 'NOT_FOUND':
      return labels.errorNotFound;
    default:
      // PERSISTENCE_FAILED + any unknown code.
      return labels.errorGeneric;
  }
}

export function FgCandidateModal({
  open,
  projectId,
  projectCode,
  suggestedCode,
  labels,
  action,
  onCreated,
  onClose,
}: {
  open: boolean;
  projectId: string;
  /** Project code, shown in the subtitle for context. */
  projectCode: string;
  /** Suggested FG code `FG-{projectCode}` — pre-fills the Create-mode input (owner decision). */
  suggestedCode: string;
  labels: FgCandidateLabels;
  /** Injected only when the caller may advance the gate (RBAC resolved server-side). */
  action?: CreateOrMapFgCandidateAction;
  /** Called with the resulting product_code on success; the host navigates to /fa/<code>. */
  onCreated: (productCode: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = React.useState<Mode>('create');
  const [createCode, setCreateCode] = React.useState(suggestedCode);
  const [mapCode, setMapCode] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Keep the Create-mode field synced to the suggestion when the modal (re)opens
  // for a different project, without clobbering a user's edits while open.
  React.useEffect(() => {
    if (open) {
      setCreateCode(suggestedCode);
      setMapCode('');
      setMode('create');
      setServerError(null);
      setSubmitting(false);
    }
  }, [open, suggestedCode]);

  const mapInvalid = mode === 'map' && mapCode.trim().length === 0;
  const submitDisabled = submitting || !action || mapInvalid;

  const onSubmit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!action || submitting) return;
      const productCode = mode === 'map' ? mapCode.trim() : createCode.trim();
      if (mode === 'map' && !productCode) {
        setServerError(friendlyError('INVALID_INPUT', labels));
        return;
      }
      setServerError(null);
      setSubmitting(true);
      try {
        const result = await action({
          projectId,
          mode,
          // Create mode tolerates an empty code (the action auto-generates
          // FG-{code}); send the trimmed value when present.
          productCode: productCode.length > 0 ? productCode : null,
        });
        if (result.ok) {
          onCreated(result.data.productCode);
          return;
        }
        setServerError(friendlyError(result.error, labels));
        setSubmitting(false);
      } catch {
        setServerError(labels.errorGeneric);
        setSubmitting(false);
      }
    },
    [action, submitting, mode, mapCode, createCode, labels, projectId, onCreated],
  );

  const submitLabel = submitting
    ? labels.submitting
    : mode === 'create'
      ? labels.submitCreate
      : labels.submitMap;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      size="md"
      modalId="fgCandidate"
    >
      <Modal.Header title={labels.title} />
      <form onSubmit={onSubmit} noValidate>
        <Modal.Body>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            {labels.subtitle} <span className="mono">{projectCode}</span>
          </p>

          {/* Mode toggle — radio group, NOT a raw <select> (parity policy). */}
          <div
            role="radiogroup"
            aria-label={labels.title}
            style={{ display: 'flex', gap: 16, marginBottom: 14 }}
            data-testid="fg-candidate-mode"
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="fg-candidate-mode"
                value="create"
                checked={mode === 'create'}
                onChange={() => {
                  setMode('create');
                  setServerError(null);
                }}
                aria-label={labels.modeCreate}
              />
              <span>{labels.modeCreate}</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="fg-candidate-mode"
                value="map"
                checked={mode === 'map'}
                onChange={() => {
                  setMode('map');
                  setServerError(null);
                }}
                aria-label={labels.modeMap}
              />
              <span>{labels.modeMap}</span>
            </label>
          </div>

          {mode === 'create' ? (
            <div className="ff">
              <label htmlFor="fg-candidate-create-code">
                {labels.fieldCreateCode} <span className="req" aria-label="required">*</span>
              </label>
              <Input
                id="fg-candidate-create-code"
                className="form-input mono"
                value={createCode}
                placeholder={suggestedCode}
                aria-describedby="fg-candidate-create-code-hint"
                onChange={(event) => setCreateCode(event.target.value.toUpperCase())}
              />
              <span id="fg-candidate-create-code-hint" className="ff-help">
                {labels.fieldCreateCodeHint}
              </span>
            </div>
          ) : (
            <div className="ff">
              <label htmlFor="fg-candidate-map-code">
                {labels.fieldMapCode} <span className="req" aria-label="required">*</span>
              </label>
              <Input
                id="fg-candidate-map-code"
                className="form-input mono"
                value={mapCode}
                placeholder="FA5609"
                aria-invalid={mapInvalid ? 'true' : undefined}
                aria-describedby="fg-candidate-map-code-hint"
                onChange={(event) => setMapCode(event.target.value.toUpperCase())}
              />
              <span id="fg-candidate-map-code-hint" className="ff-help">
                {labels.fieldMapCodeHint}
              </span>
            </div>
          )}

          {serverError ? (
            <div role="alert" className="alert alert-red" data-testid="fg-candidate-error">
              {serverError}
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
            {labels.cancel}
          </Button>
          <Button type="submit" className="btn-primary btn-sm" disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export default FgCandidateModal;
