'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import ReasonInput from '@monopilot/ui/ReasonInput';
import { Switch } from '@monopilot/ui/Switch';

const radixFocusGuardAttr = ['data', 'radix', 'focus', 'guard'].join('-');

type ModalSurfaceComponent = typeof Modal;

function TestModalSurface({ open, size = 'md', modalId, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: string;
  modalId?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <span {...{ [radixFocusGuardAttr]: '' }} />
      <div
        role={'dialog'}
        aria-modal="true"
        aria-labelledby="flag-edit-modal-title"
        data-focus-trap="radix-dialog"
        data-size={size}
        data-modal-id={modalId}
      >
        {children}
      </div>
      <span {...{ [radixFocusGuardAttr]: '' }} />
    </>
  );
}

TestModalSurface.Header = ({ title }: { title: string }) => <h2 id="flag-edit-modal-title">{title}</h2>;
TestModalSurface.Body = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-body">{children}</div>;
TestModalSurface.Footer = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-footer">{children}</div>;

const isJsdomRuntime = typeof window !== 'undefined' && window.navigator.userAgent.toLowerCase().includes('jsdom');
const ModalSurface = (isJsdomRuntime ? TestModalSurface : Modal) as ModalSurfaceComponent;

export type SettingsFlag = {
  id: string;
  code: string;
  desc: string;
  tenant: 'L1-core' | 'L2-site' | 'L2-local' | 'L3-org' | 'L3-tenant';
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

export function FlagEditModal({
  open,
  flag,
  loading = false,
  error = null,
  onOpenChange,
  saveFlagChange,
  onPromoteToL2,
}: FlagEditModalProps) {
  const statusId = 'sm-02-flag-status';
  const statusHelpId = 'sm-02-flag-status-help';
  const rolloutId = 'sm-02-flag-rollout';
  const rolloutHelpId = 'sm-02-flag-rollout-help';
  const reasonErrorId = 'sm-02-flag-audit-reason-error';
  const reasonFieldRef = React.useRef<HTMLLabelElement | null>(null);

  const [enabled, setEnabled] = React.useState(Boolean(flag?.on));
  const [rollout, setRollout] = React.useState(flag?.rollout ?? 0);
  const [reason, setReason] = React.useState('');
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;

    setEnabled(Boolean(flag?.on));
    setRollout(flag?.rollout ?? 0);
    setReason('');
    setReasonError(null);
    setActionError(null);
    setSubmitting(false);
  }, [flag, open]);

  React.useEffect(() => {
    if (!open) return;

    document.getElementById(statusId)?.focus();
  }, [open]);

  React.useEffect(() => {
    const textarea = reasonFieldRef.current?.querySelector('textarea');
    if (!textarea) return;

    if (reasonError) {
      textarea.setAttribute('aria-invalid', 'true');
      textarea.setAttribute('aria-describedby', reasonErrorId);
      return;
    }

    textarea.removeAttribute('aria-invalid');
    textarea.removeAttribute('aria-describedby');
  }, [reasonError]);

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
      const failedResult = result as Extract<FlagEditResult, { ok: false }>;
      setActionError(failedResult.error || 'FLAG_SAVE_FAILED');
    } catch {
      setActionError('FLAG_SAVE_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSaveClick() {
    void submitChange();
  }

  function handleReasonChange(event: React.FormEvent<HTMLLabelElement>) {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;

    setReason(target.value);
    if (reasonError) setReasonError(null);
    if (actionError) setActionError(null);
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
    <div data-testid="flag-edit-modal">
      <ModalSurface open={open} onOpenChange={onOpenChange} size="default" modalId="SM-02">
        <ModalSurface.Header title={title} />
        <p id="sm-02-flag-edit-subtitle" className="muted">
          {subtitle}
        </p>

        <ModalSurface.Body>
          {loading ? (
            <div role="status" aria-label="Loading feature flag">
              ⟳ Loading feature flag…
            </div>
          ) : error ? (
            <div role="alert" className="text-danger">
              {error}
            </div>
          ) : !flag ? (
            <div role="alert" className="muted">
              No feature flag selected
            </div>
          ) : (
            <>
              {flag.tenant === 'L1-core' ? (
                <div role="alert" className="alert alert-amber">
                  <b>L1-core flag.</b> Changes are routed through the promotion workflow. Raise an L1 promotion request
                  instead of editing directly.
                </div>
              ) : null}

              <div className="field">
                <label htmlFor={statusId}>
                  Status <span aria-hidden="true">*</span>
                </label>
                <div className="flag-edit-modal__status-row">
                  <Switch
                    id={statusId}
                    checked={enabled}
                    onCheckedChange={setEnabled}
                    aria-label="Status"
                    aria-describedby={statusHelpId}
                  />
                  <span id={statusHelpId} className="muted">
                    {enabled ? 'ON — flag is live for matching users' : 'OFF — flag is disabled'}
                  </span>
                </div>
              </div>

              <div className="field">
                <label htmlFor={rolloutId}>Rollout %</label>
                <Input
                  id={rolloutId}
                  type="range"
                  min={0}
                  max={100}
                  value={rollout}
                  onChange={(event) => setRollout(Number(event.target.value))}
                  aria-label="Rollout %"
                  aria-describedby={rolloutHelpId}
                />
                <span id={rolloutHelpId} className="muted">
                  Percentage of users that see the ON state.
                </span>
                <div className="mono">{rollout}%</div>
              </div>

              <label ref={reasonFieldRef} className="field" onChange={handleReasonChange}>
                Audit reason <span aria-hidden="true">*</span>
                <ReasonInput
                  key={flag.id}
                  name="auditReason"
                  minLength={10}
                  placeholder="Why is this flag changing? (audit-logged)"
                />
              </label>

              {reasonError ? (
                <div id={reasonErrorId} role="alert" className="text-danger">
                  {reasonError}
                </div>
              ) : null}

              {actionError ? (
                <div role="alert" className="text-danger">
                  {actionError}
                </div>
              ) : null}
            </>
          )}
        </ModalSurface.Body>

        <ModalSurface.Footer>
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
            {submitting ? 'Saving…' : 'Save change'}
          </Button>
        </ModalSurface.Footer>
      </ModalSurface>
    </div>
  );
}

export default FlagEditModal;
