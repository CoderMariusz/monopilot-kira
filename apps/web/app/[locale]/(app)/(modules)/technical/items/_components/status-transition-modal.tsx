'use client';

/**
 * Wave 8b Lane IA — item status transition confirm dialog (audit finding #8).
 *
 * Lightweight confirm for transitionItemStatus (draft→active "Activate",
 * active→deprecated "Deprecate", deprecated→active "Reactivate"). Unlike the
 * TEC-081 deactivate modal there is no reason enum or type-to-confirm gate —
 * these transitions are reversible, so a plain confirm is proportionate.
 *
 * Local Dialog primitive (NOT the Radix-backed @monopilot/ui Modal): same
 * established deviation as the sibling deactivate-modal.tsx — React 19 vs the
 * workspace's React 18 @radix peer crashes jsdom unit tests. Production
 * semantics (role="dialog", aria-modal, focus on open, Escape + backdrop close,
 * labelled title) preserved.
 *
 * Real data: submits via the transitionItemStatus Server Action (withOrgContext
 * + RLS + zod + technical.items.edit). No mocks.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import { transitionItemStatus } from '../_actions/transition-item-status';
import type { TransitionTarget } from '../_actions/shared';
import { DEFAULT_TRANSITION_LABELS, type StatusTransitionLabels } from './item-transition-labels';

export function StatusTransitionModal({
  open,
  onClose,
  itemId,
  itemCode,
  itemName,
  toStatus,
  title,
  body,
  labels = DEFAULT_TRANSITION_LABELS,
  onTransitioned,
}: {
  open: boolean;
  onClose: () => void;
  itemId: string;
  itemCode: string;
  itemName: string;
  toStatus: TransitionTarget;
  title: string;
  body: string;
  labels?: StatusTransitionLabels;
  onTransitioned?: () => void;
}) {
  const router = useRouter();
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await transitionItemStatus({ id: itemId, toStatus });
      if (result.ok) {
        onClose();
        onTransitioned?.();
        router.refresh();
      } else {
        setError(labels.actionErrors[result.error] ?? labels.actionErrors.persistence_failed);
      }
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
        data-modal-id="TEC-ITEM-STATUS"
        className="modal-box outline-none"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              <span className="font-mono">{itemCode}</span> · {itemName}
            </div>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p style={{ margin: 0 }}>{body}</p>
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
            data-action="confirm-status-transition"
            disabled={pending}
            onClick={submit}
          >
            {pending ? labels.working : labels.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default StatusTransitionModal;
