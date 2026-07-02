'use client';

/**
 * F4-H10 — admin MFA reset confirm dialog (reason required).
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

export type ResetUserMfaAction = (input: { userId: string; reason: string }) => Promise<
  | { ok: true }
  | { ok: false; error: string }
>;

export type ResetUserMfaDialogLabels = {
  title: string;
  /** `{name}` interpolated with the target user name. */
  body: string;
  reason: string;
  reasonPlaceholder: string;
  reasonRequired: string;
  confirm: string;
  resetting: string;
  cancel: string;
  /** `{error}` interpolated with the action error code. */
  failed: string;
};

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

export function ResetUserMfaDialog({
  open,
  user,
  labels,
  resetUserMfaAction,
  onClose,
  onReset,
  onFeedback,
}: {
  open: boolean;
  user: { id: string; name: string; email: string } | null;
  labels: ResetUserMfaDialogLabels;
  resetUserMfaAction?: ResetUserMfaAction;
  onClose: () => void;
  onReset?: (userId: string) => void;
  onFeedback?: (feedback: { kind: 'status' | 'alert'; message: string }) => void;
}) {
  const titleId = React.useId();
  const reasonId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
    contentRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !user) return null;

  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length >= 3;

  function submit() {
    if (!user || !resetUserMfaAction || !canSubmit) return;
    setError(null);
    const targetUser = user;
    const submittedReason = trimmedReason;
    startTransition(async () => {
      const result = await resetUserMfaAction({ userId: targetUser.id, reason: submittedReason });
      if (result.ok) {
        onReset?.(targetUser.id);
        onClose();
        return;
      }
      const message = interpolate(labels.failed, { error: result.error });
      setError(message);
      onFeedback?.({ kind: 'alert', message });
    });
  }

  return (
    <div
      className="modal-overlay"
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
        data-testid="reset-user-mfa-dialog"
        className="modal-box outline-none"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title" style={{ color: 'var(--red)' }}>
            {labels.title}
          </h2>
          <button type="button" className="modal-close" aria-label={labels.cancel} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div
            className="alert alert-red"
            style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}
          >
            <span aria-hidden="true">⚠</span>
            <span>{interpolate(labels.body, { name: user.name })}</span>
          </div>

          <label htmlFor={reasonId} className="block text-sm font-medium">
            {labels.reason}
          </label>
          <Input
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            placeholder={labels.reasonPlaceholder}
            aria-invalid={!canSubmit && reason.length > 0}
          />
          {!canSubmit ? (
            <p className="mt-1 text-xs text-muted-foreground">{labels.reasonRequired}</p>
          ) : null}

          {error ? (
            <p role="alert" className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="modal-foot">
          <Button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
            {labels.cancel}
          </Button>
          <Button
            type="button"
            className="btn-danger"
            data-action="confirm-reset-user-mfa"
            disabled={pending || !resetUserMfaAction || !canSubmit}
            onClick={submit}
          >
            {pending ? labels.resetting : labels.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ResetUserMfaDialog;
