'use client';

import React from 'react';
import { Button } from '@monopilot/ui/Button';

export type PasswordResetUser = {
  id: string;
  name: string;
  email: string;
};

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; error: 'PERMISSION_DENIED' | 'RESET_EMAIL_FAILED' | string };

export type PasswordResetModalProps = {
  open: boolean;
  user: PasswordResetUser;
  resetPassword: (input: { userId: string }) => Promise<PasswordResetResult>;
  onOpenChange: (open: boolean) => void;
};

const successMessage = 'Password reset email sent';

export function PasswordResetModal({
  open,
  user,
  resetPassword,
  onOpenChange,
}: PasswordResetModalProps) {
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const acknowledgementRef = React.useRef<HTMLInputElement>(null);
  const titleId = React.useId();

  React.useLayoutEffect(() => {
    if (!open) return;

    setAcknowledged(false);
    setPending(false);
    setError(null);
    acknowledgementRef.current?.focus();
  }, [open, user.id]);

  async function handleSubmit() {
    if (!acknowledged || pending) return;

    setPending(true);
    setError(null);

    try {
      const result = await resetPassword({ userId: user.id });
      if (result.ok) {
        setToastMessage(successMessage);
        onOpenChange(false);
        return;
      }

      setError(result.error);
    } catch {
      setError('RESET_EMAIL_FAILED');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-focus-trap="radix-dialog"
          data-size="sm"
          style={{ maxWidth: 'var(--modal-size-sm-width)' }}
        >
          <div data-testid="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 id={titleId} style={{ margin: 0 }}>Reset password?</h2>
          </div>
          <div data-testid="modal-body">
            <div
              role="alert"
              data-slot="alert"
              className="alert alert-red"
              style={{ fontSize: 12, marginBottom: 10 }}
            >
              {error ? (
                <span>{error}</span>
              ) : (
                <>
                  This will immediately invalidate <strong>{user.name}</strong>&apos;s current password and email a reset link to{' '}
                  <span className="mono">{user.email}</span>. Any active sessions for this user will be revoked.
                </>
              )}
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input
                ref={acknowledgementRef}
                type="checkbox"
                data-slot="checkbox"
                checked={acknowledged}
                disabled={pending}
                onChange={(event) => setAcknowledged(event.currentTarget.checked)}
              />
              I understand this will revoke active sessions.
            </label>
          </div>
          <div
            data-testid="modal-footer"
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}
          >
            <Button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="btn-danger btn-sm"
              data-variant="destructive"
              disabled={!acknowledged || pending}
              onClick={handleSubmit}
            >
              {pending ? 'Sending reset link' : 'Send reset link'}
            </Button>
          </div>
        </div>
      ) : null}
      {toastMessage ? <div role="status">{toastMessage}</div> : null}
    </>
  );
}

export default PasswordResetModal;
