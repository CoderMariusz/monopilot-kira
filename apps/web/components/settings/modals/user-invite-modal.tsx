'use client';

import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';

type InviteResult =
  | { ok: true; invitationId?: string }
  | { ok: false; error: 'EMAIL_INVALID' | 'SEAT_LIMIT_REACHED' | string };

export type UserInviteModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: string[];
  inviteUser: (input: {
    email: string;
    fullName?: string;
    role: string;
    message?: string;
  }) => Promise<InviteResult>;
  rolesLoading?: boolean;
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function optionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function UserInviteModal({
  open,
  onOpenChange,
  roles,
  inviteUser,
  rolesLoading = false,
}: UserInviteModalProps) {
  const firstRole = roles[0] ?? '';
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState(firstRole);
  const [message, setMessage] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const emailInvalid = email.length > 0 && !EMAIL_PATTERN.test(email);
  const canSubmit = EMAIL_PATTERN.test(email) && Boolean(role) && !pending;

  const roleOptions = useMemo(() => {
    if (roles.length > 0) return roles;
    return rolesLoading ? ['Loading roles…'] : ['No roles available'];
  }, [roles, rolesLoading]);

  useEffect(() => {
    if (!open) return undefined;

    setRole((currentRole) => (roles.includes(currentRole) ? currentRole : firstRole));
    queueMicrotask(() => emailRef.current?.focus());

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
  }, [firstRole, open, roles]);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (value.length > 0 && !EMAIL_PATTERN.test(value)) {
      setSubmitError('EMAIL_INVALID');
      return;
    }
    if (submitError === 'EMAIL_INVALID') {
      setSubmitError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!EMAIL_PATTERN.test(email)) {
      setSubmitError('EMAIL_INVALID');
      emailRef.current?.focus();
      return;
    }

    if (!role) {
      setSubmitError('ROLE_REQUIRED');
      return;
    }

    setPending(true);
    setSubmitError(null);

    let result: InviteResult;
    try {
      result = await inviteUser({
        email: email.trim(),
        fullName: optionalValue(fullName),
        role,
        message: optionalValue(message),
      });
    } catch {
      setPending(false);
      setSubmitError('INVITE_FAILED');
      return;
    }

    setPending(false);

    if (result.ok) {
      onOpenChange(false);
      return;
    }

    const errorCode = 'error' in result ? result.error : 'INVITE_FAILED';
    if (errorCode === 'SEAT_LIMIT_REACHED') {
      setSubmitError('SEAT_LIMIT_REACHED — add seats in Settings → Plan before sending another invitation.');
      return;
    }

    setSubmitError(errorCode || 'INVITE_FAILED');
  }

  if (!open) return null;

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sm-06-invite-title"
      data-focus-trap="radix-dialog"
      ref={dialogRef}
      onKeyDown={handleDialogKeyDown}
      style={{ maxWidth: 'var(--modal-size-md-width)' }}
    >
      <h2 id="sm-06-invite-title" style={{ margin: 0 }}>Invite team member</h2>
      <form onSubmit={handleSubmit} noValidate>
        <div data-testid="modal-body">
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label htmlFor="sm-06-invite-email">
                Email address <span aria-hidden="true">*</span>
              </label>
              <Input
                ref={emailRef}
                id="sm-06-invite-email"
                type="email"
                value={email}
                onChange={(event) => handleEmailChange(event.target.value)}
                aria-invalid={emailInvalid ? 'true' : undefined}
                aria-describedby={submitError ? 'sm-06-invite-alert' : undefined}
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="sm-06-invite-name">Full name (optional)</label>
              <Input
                id="sm-06-invite-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>

            <div>
              <label htmlFor="sm-06-invite-role">
                Role <span aria-hidden="true">*</span>
              </label>
              <select
                id="sm-06-invite-role"
                value={role || roleOptions[0]}
                onChange={(event) => setRole(event.target.value)}
                disabled={rolesLoading || roles.length === 0}
              >
                {roleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sm-06-invite-message">Custom message (optional)</label>
              <Textarea
                id="sm-06-invite-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={500}
                style={{ minHeight: 70 }}
                aria-describedby="sm-06-invite-message-help"
              />
              <p id="sm-06-invite-message-help">Included in the invitation email.</p>
            </div>

            {submitError ? (
              <div id="sm-06-invite-alert" role="alert">
                {submitError}
              </div>
            ) : null}
          </div>
        </div>

        <div data-testid="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <Button type="button" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {pending ? 'Sending…' : 'Send invitation'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default UserInviteModal;
