'use client';

/**
 * F4-H10 — user reactivate confirm dialog (mirror of DeactivateUserDialog).
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';

export type ReactivateUserAction = (input: { userId: string }) => Promise<
  | { ok: true }
  | { ok: false; error: string }
>;

export type ReactivateUserDialogLabels = {
  title: string;
  /** `{name}` interpolated with the target user name. */
  body: string;
  confirm: string;
  reactivating: string;
  cancel: string;
  /** `{error}` interpolated with the action error code. */
  failed: string;
};

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

export function ReactivateUserDialog({
  open,
  user,
  labels,
  reactivateUserAction,
  onClose,
  onReactivated,
  onFeedback,
}: {
  open: boolean;
  user: { id: string; name: string; email: string } | null;
  labels: ReactivateUserDialogLabels;
  reactivateUserAction?: ReactivateUserAction;
  onClose: () => void;
  onReactivated?: (userId: string) => void;
  onFeedback?: (feedback: { kind: 'status' | 'alert'; message: string }) => void;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
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

  function submit() {
    if (!user || !reactivateUserAction) return;
    setError(null);
    const targetUser = user;
    startTransition(async () => {
      const result = await reactivateUserAction({ userId: targetUser.id });
      if (result.ok) {
        onReactivated?.(targetUser.id);
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
        data-testid="reactivate-user-dialog"
        className="modal-box outline-none"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">
            {labels.title}
          </h2>
          <button type="button" className="modal-close" aria-label={labels.cancel} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p>{interpolate(labels.body, { name: user.name })}</p>
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
            className="btn-primary"
            data-action="confirm-reactivate-user"
            disabled={pending || !reactivateUserAction}
            onClick={submit}
          >
            {pending ? labels.reactivating : labels.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ReactivateUserDialog;
