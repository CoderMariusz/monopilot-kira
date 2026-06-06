'use client';

/**
 * T-040 — AllergenOverrideModal (MODAL-09, additive allergen override).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:389-428 (allergen_override_modal)
 *
 * Translation notes (from the prototype + prototype-index allergen_override_modal):
 *   - window.Modal / Field / foot Cancel+Save  → @monopilot/ui Modal (Radix dialog)
 *   - allergen + current status (read-only)     → Input readOnly (bg-muted), preselected
 *   - include/exclude pill toggle (two buttons) → two-button single-select (no raw <select>);
 *                                                 mapped to the DB enum action 'add' | 'remove'
 *   - ReasonInput min 10 / max 500              → @monopilot/ui ReasonInput (counter + min gate)
 *   - audit-trail amber alert                   → Alert region; copy via npd.allergenWidget key
 *   - Save override                             → setAllergenOverride Server Action (T-039, merged).
 *
 * §8.10 reason contract (mirrors server-side z.string().trim().min(10)):
 *   Save is disabled and setAllergenOverride is NOT invoked while reason < 10 chars.
 *   The action itself is owned by T-039 (imported by the widget/page, injected here).
 *
 * RBAC: the modal is only mounted from a write-permitted surface; the authoritative
 * permission check lives server-side inside setAllergenOverride (FORBIDDEN on failure).
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import ReasonInput from '@monopilot/ui/ReasonInput';

export type OverrideAction = 'add' | 'remove';

// Server Action signature (owned by T-039 — imported by the page, injected here).
export type SetAllergenOverrideAction = (
  productCode: string,
  allergenCode: string,
  action: OverrideAction,
  reason: string,
) => Promise<{ ok: boolean } & Record<string, unknown>>;

export type AllergenOverrideLabels = {
  title: string;
  subtitle: string;
  auditWarning: string;
  fieldAllergen: string;
  fieldCurrent: string;
  fieldAction: string;
  actionAdd: string;
  actionRemove: string;
  fieldReason: string;
  reasonPlaceholder: string;
  reasonTooShort: string;
  cancel: string;
  save: string;
  error: string;
  statusContains: string;
  statusAbsent: string;
};

const REASON_MIN = 10;
const REASON_MAX = 500;

export function AllergenOverrideModal({
  open,
  productCode,
  allergenCode,
  allergenLabel,
  currentlyPresent,
  labels,
  onClose,
  setAllergenOverrideAction,
}: {
  open: boolean;
  productCode: string;
  allergenCode: string;
  allergenLabel: string;
  /** Whether the allergen is currently in the published Contains set. */
  currentlyPresent: boolean;
  labels: AllergenOverrideLabels;
  onClose: () => void;
  setAllergenOverrideAction?: SetAllergenOverrideAction;
}) {
  // Default action: if currently present, the natural override is to remove; otherwise add.
  const [action, setAction] = React.useState<OverrideAction>(currentlyPresent ? 'remove' : 'add');
  const [reason, setReason] = React.useState('');
  const [reasonTouched, setReasonTouched] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;

  const currentLabel = currentlyPresent ? labels.statusContains : labels.statusAbsent;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    setReasonTouched(true);

    // Mirror the server contract: do NOT invoke the action while reason is too short.
    if (!reasonValid) {
      return;
    }

    try {
      setSubmitting(true);
      const result = await setAllergenOverrideAction?.(productCode, allergenCode, action, trimmed);
      if (result && !result.ok) {
        setServerError(labels.error);
        return;
      }
      onClose();
    } catch {
      setServerError(labels.error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      size="md"
      modalId="allergenOverride"
    >
      <Modal.Header title={`${labels.title}: ${allergenLabel}`} />
      <form onSubmit={handleSubmit} noValidate>
        <Modal.Body>
          <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{labels.subtitle}</div>

          {/* Audit-trail warning (prototype amber alert). */}
          <div role="note" data-testid="override-audit-alert" className="alert alert-amber">
            {labels.auditWarning}
          </div>

          {/* Allergen (read-only, preselected). */}
          <div className="ff">
            <label htmlFor="override-allergen">{labels.fieldAllergen}</label>
            <input
              id="override-allergen"
              data-testid="override-allergen"
              className="form-input"
              value={allergenLabel}
              readOnly
              style={{ background: 'var(--gray-100)' }}
            />
          </div>

          {/* Current auto-cascade status (read-only). */}
          <div className="ff">
            <label htmlFor="override-current">{labels.fieldCurrent}</label>
            <input
              id="override-current"
              data-testid="override-current"
              className="form-input"
              value={currentLabel}
              readOnly
              style={{ background: 'var(--gray-100)' }}
            />
          </div>

          {/* Action selector — two-button single-select (no raw <select>). */}
          <div className="ff" role="group" aria-label={labels.fieldAction}>
            <label>
              {labels.fieldAction} <span className="req" aria-label="required">*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['add', 'remove'] as OverrideAction[]).map((value) => {
                const selected = action === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    data-testid={`override-action-${value}`}
                    aria-pressed={selected}
                    className={`btn-sm ${selected ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setAction(value)}
                  >
                    {value === 'add' ? labels.actionAdd : labels.actionRemove}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Reason (min 10 / max 500). ReasonInput renders its own wired <label>
              and walks sibling [type=submit] buttons to set aria-disabled while
              below minLength. */}
          <div className="ff">
            <ReasonInputBridge
              value={reason}
              onChange={(next) => {
                setReasonTouched(true);
                setReason(next);
              }}
              label={labels.fieldReason}
              placeholder={labels.reasonPlaceholder}
            />
            {reasonTouched && !reasonValid ? (
              <div id="override-reason-error" role="alert" className="ff-error">
                {labels.reasonTooShort}
              </div>
            ) : null}
          </div>

          {serverError ? (
            <div role="alert" className="alert alert-red">
              {serverError}
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            data-testid="override-save"
            className="btn-primary btn-sm"
            aria-disabled={!reasonValid || submitting ? 'true' : 'false'}
            disabled={submitting}
          >
            {labels.save}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

/**
 * Controlled bridge over @monopilot/ui ReasonInput.
 *
 * ReasonInput owns its own value state and exposes the textarea via `name`; we mirror
 * the value into the parent through an onChange listener on the rendered <textarea>
 * (the bridge keeps the parent in sync without forking the primitive). The primitive's
 * sibling-submit aria-disabled mechanism (min-length gate) is preserved because the
 * raw submit button remains a sibling of the ReasonInput container inside the <form>.
 */
function ReasonInputBridge({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const textarea = ref.current?.querySelector('textarea');
    if (!textarea) return;
    const handler = (event: Event) => {
      onChange((event.target as HTMLTextAreaElement).value);
    };
    textarea.addEventListener('input', handler);
    // Tag the textarea for tests + ensure value mirroring on mount.
    textarea.setAttribute('data-testid', 'override-reason');
    return () => textarea.removeEventListener('input', handler);
  }, [onChange]);

  return (
    <div ref={ref} data-current-value={value}>
      <ReasonInput name="override-reason" minLength={REASON_MIN} label={label} placeholder={placeholder} />
    </div>
  );
}

export default AllergenOverrideModal;
