'use client';

/**
 * T-079 — GateApprovalModal (e-signature submit-for-approval flow).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:456 ("Submit for approval" CTA)
 *   The e-sign confirmation step itself follows the canonical NPD gate-approval
 *   pattern (§17.6 e-signature flow / T-061): an authenticated password + notes are
 *   required to sign the decision; the modal NEVER signs client-side — it calls the
 *   merged approveProjectGate Server Action (passed in as `onApprove`).
 *
 * Structural map:
 *   - @monopilot/ui Modal (Radix Dialog wrapper — focus-trapped, ESC/click-outside close)
 *   - password Input (type=password, autoComplete=off) + notes Textarea, both with <label htmlFor>
 *   - Confirm button: busy → success closes the modal; failure surfaces an i18n error (role=alert)
 *
 * This island holds only transient form/submit state; it owns no data and queries
 * no DB. RBAC is enforced server-side by approveProjectGate (GATE_APPROVE_PERMISSION).
 */

import React from 'react';
import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Button } from '@monopilot/ui/Button';

import type { ApprovalGateCode, ApproveGateAction } from './approval-screen';

export type GateApprovalModalLabels = {
  modalTitle: string;
  modalSubtitle: string;
  fieldPassword: string;
  fieldNotes: string;
  cancel: string;
  confirm: string;
  signing: string;
  modalError: string;
};

const NOTES_MIN_LENGTH = 1;

export function GateApprovalModal({
  open,
  projectId,
  projectCode,
  gateCode,
  labels,
  onClose,
  onApprove,
}: {
  open: boolean;
  projectId: string;
  projectCode: string;
  gateCode: ApprovalGateCode;
  labels: GateApprovalModalLabels;
  onClose: () => void;
  onApprove?: ApproveGateAction;
}) {
  const [password, setPassword] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const passwordId = `gate-approval-password-${projectId}`;
  const notesId = `gate-approval-notes-${projectId}`;
  const canConfirm = password.trim().length > 0 && notes.trim().length >= NOTES_MIN_LENGTH && !busy;

  async function handleConfirm() {
    if (!onApprove || !canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onApprove({
        projectId,
        gateCode,
        decision: 'approved',
        notes: notes.trim(),
        password,
      });
      if (result.ok) {
        onClose();
      } else {
        setError(labels.modalError);
      }
    } catch {
      setError(labels.modalError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onClose())} modalId="npd-gate-approval" size="md">
      <Modal.Header title={labels.modalTitle} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">
          {labels.modalSubtitle}{' '}
          <span className="font-mono text-xs text-slate-500">
            {projectCode} · {gateCode}
          </span>
        </p>

        {error ? (
          <div role="alert" data-testid="approval-modal-error" className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={passwordId} className="text-sm font-medium text-slate-900">
              {labels.fieldPassword}
            </label>
            <Input
              id={passwordId}
              type="password"
              autoComplete="off"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={notesId} className="text-sm font-medium text-slate-900">
              {labels.fieldNotes}
            </label>
            <Textarea
              id={notesId}
              rows={3}
              value={notes}
              disabled={busy}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="approval-modal-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button
          type="button"
          data-testid="approval-modal-confirm"
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          {busy ? labels.signing : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default GateApprovalModal;
