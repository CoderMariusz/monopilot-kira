'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { DialogShell } from './dialog-shell';

export type CascadeDeleteDialogLabels = {
  cancel: string;
  confirmButton: string;
  deleting: string;
  typeToConfirm: string;
};

export function CascadeDeleteDialog({
  open,
  title,
  body,
  targetCode,
  labels,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  targetCode: string;
  labels: CascadeDeleteDialogLabels;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = React.useId();
  const inputId = React.useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) return;
    setTyped('');
  }, [open, targetCode]);

  useLayoutEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const typeLabel = labels.typeToConfirm.replace('{code}', targetCode);
  const canConfirm = typed === targetCode && !pending;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConfirm) return;
    onConfirm();
  }

  return (
    <DialogShell titleId={titleId} title={title} onCancel={onCancel}>
      <form data-testid="npd-cascade-delete-form" onSubmit={submit} className="mt-4">
        <p className="text-sm text-slate-700" data-testid="npd-cascade-delete-body">
          {body}
        </p>

        <div className="ff" style={{ marginTop: 12 }}>
          <label htmlFor={inputId}>{typeLabel}</label>
          <input
            ref={inputRef}
            id={inputId}
            className="form-input mono"
            value={typed}
            autoComplete="off"
            disabled={pending}
            placeholder={targetCode}
            data-testid="npd-cascade-delete-confirm-input"
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>

        {error ? (
          <div className="alert alert-red" role="alert" data-testid="npd-cascade-delete-error" style={{ marginTop: 12 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={onCancel}>
            {labels.cancel}
          </button>
          <button
            type="submit"
            className="btn btn-danger"
            disabled={!canConfirm}
            data-testid="npd-cascade-delete-confirm-button"
          >
            {pending ? labels.deleting : labels.confirmButton}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
