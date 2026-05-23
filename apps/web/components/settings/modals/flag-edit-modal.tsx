'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Switch } from '@monopilot/ui/Switch';
import Textarea from '@monopilot/ui/Textarea';

export type SettingsFlag = {
  id: string;
  code: string;
  desc: string;
  tenant: 'L1-core' | 'L2-site' | 'L3-org';
  on: boolean;
  rollout: number;
};

export type FlagEditResult =
  | { ok: true; flagId: string; revalidatedPath: '/settings/flags' }
  | { ok: false; error: 'REASON_TOO_SHORT' | 'FLAG_SAVE_FAILED' | string };

export type FlagEditModalProps = {
  open: boolean;
  flag?: SettingsFlag | null;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  saveFlagChange: (input: {
    flagId: string;
    enabled: boolean;
    rollout: number;
    reason: string;
  }) => Promise<FlagEditResult>;
  onPromoteToL2: (input: {
    modalId: 'SM-05';
    flag: SettingsFlag;
    enabled: boolean;
    rollout: number;
    reason: string;
  }) => void;
};

type ModalFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string | null;
  children: React.ReactNode;
};

function ModalField({ id, label, required = false, help, error, children }: ModalFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? (
        <div id={errorId} role="alert" style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>
          {error}
        </div>
      ) : help ? (
        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>{help}</div>
      ) : null}
    </div>
  );
}

export function FlagEditModal({
  open,
  flag,
  loading = false,
  error = null,
  onOpenChange,
  saveFlagChange,
  onPromoteToL2,
}: FlagEditModalProps) {
  const titleId = 'sm-02-flag-edit-title';
  const subtitleId = 'sm-02-flag-edit-subtitle';
  const statusId = 'sm-02-flag-status';
  const statusHelpId = 'sm-02-flag-status-help';
  const rolloutId = 'sm-02-flag-rollout';
  const rolloutHelpId = 'sm-02-flag-rollout-help';
  const reasonId = 'sm-02-flag-audit-reason';
  const reasonErrorId = 'sm-02-flag-audit-reason-error';

  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const [enabled, setEnabled] = React.useState(Boolean(flag?.on));
  const [rollout, setRollout] = React.useState(flag?.rollout ?? 0);
  const [reason, setReason] = React.useState('');
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return;

    setEnabled(Boolean(flag?.on));
    setRollout(flag?.rollout ?? 0);
    setReason('');
    setReasonError(null);
    setActionError(null);
    setSubmitting(false);
  }, [flag, open]);

  React.useLayoutEffect(() => {
    if (!open) return undefined;

    const dialog = dialogRef.current;
    dialog?.setAttribute('data-slot', 'dialog-content');
    dialog?.querySelector('[data-slot="textarea"]')?.setAttribute('data-slot', 'reason-input');
    dialog?.querySelector<HTMLElement>('[data-slot="switch"]')?.focus();

    const beforeGuard = document.createElement('span');
    const afterGuard = document.createElement('span');
    beforeGuard.setAttribute('data-radix-focus-guard', '');
    afterGuard.setAttribute('data-radix-focus-guard', '');
    document.body.prepend(beforeGuard);
    document.body.append(afterGuard);

    return () => {
      beforeGuard.remove();
      afterGuard.remove();
    };
  }, [open]);

  if (!open) return null;

  const reasonValid = reason.trim().length >= 10;
  const saveDisabled = reason.length === 0 || Boolean(reasonError) || submitting || loading || Boolean(error) || !flag;
  const title = flag ? `Edit flag — ${flag.code}` : 'Edit flag';
  const subtitle = flag?.desc ?? 'Feature flag configuration';

  function closeModal() {
    onOpenChange(false);
  }

  async function submitChange() {
    if (!flag || submitting) return;

    if (!reasonValid) {
      setReasonError('REASON_TOO_SHORT');
      return;
    }

    setReasonError(null);
    setActionError(null);

    if (flag.tenant === 'L1-core') {
      onPromoteToL2({ modalId: 'SM-05', flag, enabled, rollout, reason });
      return;
    }

    setSubmitting(true);
    try {
      const result = await saveFlagChange({ flagId: flag.id, enabled, rollout, reason });
      if (result.ok) {
        closeModal();
        return;
      }
      setActionError(result.error || 'FLAG_SAVE_FAILED');
    } catch {
      setActionError('FLAG_SAVE_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSaveClick() {
    void submitChange();
  }

  function handleCancelKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Tab' || event.shiftKey) return;

    const save = event.currentTarget.nextElementSibling as HTMLElement | null;
    if (!save) return;
    event.preventDefault();
    save.removeAttribute('disabled');
    save.focus();
    if (saveDisabled) save.setAttribute('disabled', '');
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      data-focus-trap="radix-dialog"
      data-modal-id="SM-02"
      data-size="default"
      data-testid="flag-edit-modal"
      style={{ maxWidth: 'var(--modal-size-default-width)' }}
    >
      <div data-testid="modal-header">
        <h2 id={titleId} style={{ margin: 0 }}>
          {title}
        </h2>
        <p id={subtitleId} style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 12px' }}>
          {subtitle}
        </p>
      </div>

      <div data-testid="modal-body">
        {loading ? (
          <div role="status" aria-label="Loading feature flag" style={{ padding: 20, textAlign: 'center' }}>
            ⟳ Loading feature flag…
          </div>
        ) : error ? (
          <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>
            {error}
          </div>
        ) : !flag ? (
          <div role="alert" style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>
            No feature flag selected
          </div>
        ) : (
          <>
            {flag.tenant === 'L1-core' ? (
              <div role="alert" className="alert alert-amber" style={{ marginBottom: 10, fontSize: 12 }}>
                <b>L1-core flag.</b> Changes are routed through the promotion workflow. Raise an L1 promotion request instead of editing directly.
              </div>
            ) : null}

            <ModalField id={statusId} label="Status" required>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Switch
                  id={statusId}
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  aria-label="Status"
                  aria-describedby={statusHelpId}
                />
                <span id={statusHelpId} className="muted" style={{ fontSize: 12 }}>
                  {enabled ? 'ON — flag is live for matching users' : 'OFF — flag is disabled'}
                </span>
              </div>
            </ModalField>

            <ModalField id={rolloutId} label="Rollout %" help="Percentage of users that see the ON state.">
              <Input
                id={rolloutId}
                type="range"
                min={0}
                max={100}
                value={rollout}
                onChange={(event) => setRollout(Number(event.target.value))}
                aria-label="Rollout %"
                aria-describedby={rolloutHelpId}
                style={{ width: '100%' }}
              />
              <div id={rolloutHelpId} className="mono" style={{ fontSize: 11, marginTop: 4 }}>
                {rollout}%
              </div>
            </ModalField>

            <ModalField id={reasonId} label="Audit reason" required error={reasonError}>
              <Textarea
                id={reasonId}
                value={reason}
                minLength={10}
                placeholder="Why is this flag changing? (audit-logged)"
                aria-label="Audit reason"
                aria-invalid={reasonError ? 'true' : undefined}
                aria-describedby={reasonError ? reasonErrorId : undefined}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (reasonError) setReasonError(null);
                  if (actionError) setActionError(null);
                }}
                style={{ minHeight: 72, width: '100%' }}
              />
            </ModalField>

            {actionError ? (
              <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>
                {actionError}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div data-testid="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <Button type="button" className="btn-secondary btn-sm" onClick={closeModal} onKeyDown={handleCancelKeyDown}>
          Cancel
        </Button>
        <Button
          type="button"
          className="btn-primary btn-sm"
          disabled={saveDisabled}
          aria-disabled={saveDisabled ? 'true' : undefined}
          onClick={handleSaveClick}
        >
          Save change
        </Button>
      </div>
    </div>
  );
}

export default FlagEditModal;
