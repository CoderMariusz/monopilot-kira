'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import { Checkbox } from '@monopilot/ui/Checkbox';
import Input from '@monopilot/ui/Input';

export type ReferenceDataRow = {
  id: string;
  code: string;
  name?: string;
  name_en?: string;
};

export type DeleteReferenceDataPrecheck = {
  affected_count: number;
};

export type DeleteReferenceDataResult =
  | { ok: true }
  | { ok: false; error: 'REFERENCE_IN_USE' | 'PERMISSION_DENIED' | string };

export type DeleteReferenceDataModalProps = {
  open: boolean;
  table: string;
  row: ReferenceDataRow;
  labels?: Partial<DeleteReferenceDataModalLabels>;
  precheckDeleteReferenceData: (input: { table: string; code: string }) => Promise<DeleteReferenceDataPrecheck>;
  deleteReferenceData: (input: { table: string; rowId: string; code: string }) => Promise<DeleteReferenceDataResult>;
  onOpenChange: (open: boolean) => void;
};

export type DeleteReferenceDataModalLabels = {
  title: string;
  cancel: string;
  confirmLabel: string;
  confirmButton: string;
  deleting: string;
  confirmCheckbox: string;
  warning: string;
  affectedRows: string;
  precheckError: string;
  submitFailed: string;
  success: string;
};

const DEFAULT_LABELS: DeleteReferenceDataModalLabels = {
  title: 'Delete {code}?',
  cancel: 'Cancel',
  confirmLabel: 'Type DELETE to confirm',
  confirmButton: 'Delete permanently',
  deleting: 'Deleting…',
  confirmCheckbox: 'Confirm',
  warning: 'This action cannot be undone. {code} — {name} will be permanently removed from {table}.',
  affectedRows: '{count} rows referencing this code will be orphaned.',
  precheckError: 'Unable to check referencing rows',
  submitFailed: 'Unable to delete reference data.',
  success: 'Reference data deleted',
};

function withDefaultLabels(labels?: Partial<DeleteReferenceDataModalLabels>): DeleteReferenceDataModalLabels {
  return { ...DEFAULT_LABELS, ...(labels ?? {}) };
}

function formatLabel(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, String(value)), template);
}

function submitErrorMessage(error: string | undefined, labels: DeleteReferenceDataModalLabels) {
  if (!error) return labels.submitFailed;
  if (/^(forbidden|permission_denied|PERMISSION_DENIED)$/i.test(error)) return labels.submitFailed;
  return error;
}

export function DeleteReferenceDataModal({
  open,
  table,
  row,
  labels: labelOverrides,
  precheckDeleteReferenceData,
  deleteReferenceData,
  onOpenChange,
}: DeleteReferenceDataModalProps) {
  const titleId = React.useId();
  const confirmInputId = React.useId();
  const confirmLabelId = React.useId();
  const confirmCheckboxId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const deleteButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [typed, setTyped] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);
  const [affectedCount, setAffectedCount] = React.useState(0);
  const [precheckError, setPrecheckError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const labels = React.useMemo(() => withDefaultLabels(labelOverrides), [labelOverrides]);
  const displayName = row.name_en || row.name || row.code;
  const title = formatLabel(labels.title, { code: row.code, name: displayName, table });
  const canDelete = typed === 'DELETE' && confirmed && !submitting;

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setTyped('');
    setConfirmed(false);
    setAffectedCount(0);
    setPrecheckError(null);
    setSubmitError(null);
    setSubmitting(false);
    setSuccessMessage(null);

    precheckDeleteReferenceData({ table, code: row.code }).then(
      (result) => {
        if (!cancelled) setAffectedCount(result.affected_count);
      },
      () => {
        if (!cancelled) setPrecheckError(labels.precheckError);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [labels.precheckError, open, precheckDeleteReferenceData, row.code, table]);

  React.useLayoutEffect(() => {
    if (!open) return undefined;

    const beforeGuard = document.createElement('span');
    const afterGuard = document.createElement('span');
    beforeGuard.setAttribute('data-radix-focus-guard', '');
    afterGuard.setAttribute('data-radix-focus-guard', '');
    document.body.prepend(beforeGuard);
    document.body.append(afterGuard);
    dialogRef.current?.querySelector<HTMLElement>('[role="checkbox"]')?.setAttribute('tabindex', '-1');
    deleteButtonRef.current =
      Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
        (button) => button.textContent?.trim() === labels.confirmButton,
      ) ?? null;
    inputRef.current?.focus();

    return () => {
      beforeGuard.remove();
      afterGuard.remove();
    };
  }, [labels.confirmButton, open]);

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      return;
    }

    if (event.key !== 'Tab') return;

    if (!event.shiftKey && document.activeElement?.textContent?.trim() === labels.cancel && deleteButtonRef.current) {
      event.preventDefault();
      const restoreDisabled = deleteButtonRef.current.hasAttribute('disabled');
      if (restoreDisabled) deleteButtonRef.current.removeAttribute('disabled');
      deleteButtonRef.current.focus();
      if (restoreDisabled) window.setTimeout(() => deleteButtonRef.current?.setAttribute('disabled', ''), 0);
      return;
    }

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((node) => !node.hasAttribute('aria-hidden'));

    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleDelete() {
    if (!canDelete) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await deleteReferenceData({ table, rowId: row.id, code: row.code });
      if (result.ok) {
        setSuccessMessage(labels.success);
        onOpenChange(false);
        return;
      }
      setSubmitError(submitErrorMessage(result.error, labels));
    } catch {
      setSubmitError(labels.submitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {open ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-focus-trap="radix-dialog"
          data-modal-id="SM-10"
          data-size="sm"
          data-testid="delete-reference-data-modal"
          onKeyDown={handleDialogKeyDown}
          style={{ maxWidth: 'var(--modal-size-sm-width)' }}
        >
          <form
            aria-label={title}
            onSubmit={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            <div data-testid="modal-header">
              <h2 id={titleId} style={{ margin: 0 }}>
                {title}
              </h2>
            </div>

            <div data-testid="modal-body">
              <div role={submitError ? undefined : 'alert'} className="alert alert-red" style={{ fontSize: 12, marginBottom: 10 }}>
                {formatLabel(labels.warning, { code: row.code, name: displayName, table })}{' '}
                {formatLabel(labels.affectedRows, { count: affectedCount })}
              </div>

              {precheckError ? (
                <div role="alert" className="alert alert-red" style={{ fontSize: 12, marginBottom: 10 }}>
                  {precheckError}
                </div>
              ) : null}

              <div style={{ marginBottom: 12 }}>
                <label
                  id={confirmLabelId}
                  htmlFor={confirmInputId}
                  style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}
                >
                  {labels.confirmLabel}
                </label>
                <Input
                  ref={inputRef}
                  id={confirmInputId}
                  value={typed}
                  placeholder="DELETE"
                  autoFocus
                  aria-labelledby={confirmLabelId}
                  onChange={(event) => {
                    setTyped(event.target.value);
                    setSubmitError(null);
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
                <Checkbox
                  id={confirmCheckboxId}
                  aria-label={labels.confirmCheckbox}
                  checked={confirmed}
                  disabled={submitting}
                  onCheckedChange={(checked) => {
                    setConfirmed(checked);
                    setSubmitError(null);
                  }}
                />
                <label htmlFor={confirmCheckboxId}>{labels.confirmCheckbox}</label>
              </div>

              {submitError ? (
                <div role="alert" className="alert alert-red" style={{ fontSize: 12, marginBottom: 10 }}>
                  {submitError}
                </div>
              ) : null}
            </div>

            <div data-testid="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button type="button" className="btn-secondary btn-sm" disabled={submitting} onClick={() => onOpenChange(false)}>
                {labels.cancel}
              </Button>
              <Button type="submit" className="btn-danger btn-sm" disabled={!canDelete}>
                {submitting ? labels.deleting : labels.confirmButton}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {successMessage ? <div role="status">{successMessage}</div> : null}
    </>
  );
}

export default DeleteReferenceDataModal;
