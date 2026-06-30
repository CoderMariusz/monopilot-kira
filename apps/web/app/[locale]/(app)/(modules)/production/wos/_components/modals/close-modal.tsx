'use client';

import { useState } from 'react';

import Link from 'next/link';

import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Button } from '@monopilot/ui/Button';

import { freshTransactionId } from './use-wo-action';
import { ErrorBanner, FieldRow, mapError, type BaseModalProps } from './shared';

// ── Close (e-sign) ──────────────────────────────────────────────────────────

export function CloseModal({
  open,
  woId,
  labels,
  run,
  onClose,
  signerUserId,
  locale = 'en',
}: BaseModalProps & { signerUserId: string; locale?: string }) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = password.trim() !== '' && reason.trim() !== '' && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const result = await run('close', {
      transactionId: freshTransactionId(),
      signerUserId,
      pin: password,
      reason: reason.trim(),
    });
    setBusy(false);
    if (result.ok) {
      setPassword('');
      setReason('');
      onClose();
    } else {
      setError(mapError(labels, result.errorCode));
    }
  }

  return (
    <Modal open={open} onOpenChange={(n) => (n ? undefined : onClose())} modalId="wo-close" size="md">
      <Modal.Header title={labels.close.title} />
      <Modal.Body>
        <p className="mb-3 text-sm text-slate-600">{labels.close.subtitle}</p>
        {error ? <ErrorBanner message={error} testid="wo-close-error" /> : null}
        <div className="space-y-3">
          <FieldRow id="wo-close-password" label={labels.close.password}>
            <Input
              id="wo-close-password"
              type="password"
              autoComplete="off"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="wo-close-password"
            />
          </FieldRow>
          {labels.close.pinHint ? (
            // W9-L7 — escape hatch for the PIN wall: signEvent accepts the e-sign
            // PIN (or the account password while no PIN is enrolled); the shared
            // PIN is managed on /account/pin.
            <p className="text-xs text-slate-500">
              <Link href={`/${locale}/account/pin`} className="underline" data-testid="wo-close-pin-link">
                {labels.close.pinHint}
              </Link>
            </p>
          ) : null}
          <FieldRow id="wo-close-reason" label={labels.close.reason}>
            <Textarea id="wo-close-reason" rows={3} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} data-testid="wo-close-reason" />
          </FieldRow>
          <p className="text-xs text-slate-500">{labels.close.legal}</p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" data-testid="wo-close-cancel" disabled={busy} onClick={onClose}>
          {labels.cancel}
        </Button>
        <Button type="button" data-testid="wo-close-confirm" disabled={!canConfirm} onClick={handleConfirm}>
          {busy ? labels.submitting : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
