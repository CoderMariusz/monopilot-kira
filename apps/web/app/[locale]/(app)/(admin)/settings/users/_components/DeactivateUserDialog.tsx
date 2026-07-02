'use client';

/**
 * F2-C1 — user deactivate confirm dialog.
 *
 * Wires the existing deactivateUser Server Action (via the page's
 * { userId } adapter) to the settings/users list & cards. A lean confirm
 * dialog: a red warning naming the target, Cancel + destructive confirm. No
 * reason/type-to-confirm gate — the underlying action already blocks
 * self-deactivation and is org.access.admin-gated server-side.
 *
 * Local plain-div dialog (NOT the Radix @monopilot/ui Modal) so the sibling
 * jsdom RTL suite runs without the React 19 vs @radix React-18 peer crash — the
 * same established deviation as the items DeactivateItemModal. Production
 * semantics preserved: role="dialog", aria-modal, focus on open, Escape close,
 * labelled title.
 *
 * Focus discipline (repo gotcha): the focus effect depends on [open] ONLY — never
 * on onClose — so the confirm button does not steal focus on every render.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';

export type DeactivateUserAction = (input: { userId: string }) => Promise<
  | { ok: true }
  | { ok: false; error: string }
>;

export type DeactivateUserDialogLabels = {
  title: string;
  /** `{name}` interpolated with the target user name. */
  body: string;
  confirm: string;
  deactivating: string;
  cancel: string;
  /** `{error}` interpolated with the action error code. */
  failed: string;
  self: string;
};

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

export function DeactivateUserDialog({
  open,
  user,
  labels,
  deactivateUserAction,
  onClose,
  onDeactivated,
  onFeedback,
}: {
  open: boolean;
  user: { id: string; name: string; email: string } | null;
  labels: DeactivateUserDialogLabels;
  deactivateUserAction?: DeactivateUserAction;
  onClose: () => void;
  onDeactivated?: (userId: string) => void;
  onFeedback?: (feedback: { kind: 'status' | 'alert'; message: string }) => void;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Focus + reset ONLY when the dialog opens — never depends on onClose (repo
  // focus-loss gotcha: an onClose-dep focus effect re-focuses every render).
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
    if (!user || !deactivateUserAction) return;
    setError(null);
    const targetUser = user;
    startTransition(async () => {
      const result = await deactivateUserAction({ userId: targetUser.id });
      if (result.ok) {
        // Parent owns the success toast + optimistic list update (it holds the
        // full label set and the users state).
        onDeactivated?.(targetUser.id);
        onClose();
        return;
      }
      const message =
        result.error === 'self_deactivation'
          ? labels.self
          : interpolate(labels.failed, { error: result.error });
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
        data-testid="deactivate-user-dialog"
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
            style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
          >
            <span aria-hidden="true">⚠</span>
            <span>{interpolate(labels.body, { name: user.name })}</span>
          </div>

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
            data-action="confirm-deactivate-user"
            disabled={pending || !deactivateUserAction}
            onClick={submit}
          >
            {pending ? labels.deactivating : labels.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DeactivateUserDialog;
