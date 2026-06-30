'use client';

import React, { useState, useTransition } from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';

import {
  interpolate,
  type CreateUserWithPasswordAction,
  type InviteUserAction,
  type UsersScreenData,
  type UsersScreenLabels,
} from '../users-screen.client';

export function InviteDialog({
  open,
  onOpenChange,
  labels,
  data,
  locale,
  inviteUserAction,
  createUserWithPasswordAction,
  onFeedback,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: UsersScreenLabels;
  data: UsersScreenData;
  locale: string;
  inviteUserAction?: InviteUserAction;
  createUserWithPasswordAction?: CreateUserWithPasswordAction;
  onFeedback: (feedback: { kind: 'status' | 'alert'; message: string } | null) => void;
}) {
  const defaultRoleId = data.roles.find((role) => role.category === 'Manager')?.id ?? data.roles[0]?.id ?? '';
  // Invite site picker draws from the real org sites (mig 381 source) when
  // available, falling back to the labels derived from the directory.
  const sites = data.siteOptions.length > 0
    ? data.siteOptions.map((site) => site.name)
    : Array.from(new Set(data.users.map((user) => user.site))).filter(Boolean);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [site, setSite] = useState(sites[0] ?? labels.allSites);
  const [personalMessage, setPersonalMessage] = useState('');
  // Admin-only alternative path: set a password directly instead of emailing
  // a magic-link invite. Only offered when the create-with-password action is
  // wired (which itself is gated on the same admin permission server-side).
  const [setPasswordMode, setSetPasswordMode] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPending, startTransition] = useTransition();

  const canSetPassword = Boolean(createUserWithPasswordAction);

  function resetForm() {
    setEmail('');
    setName('');
    setSite(sites[0] ?? labels.allSites);
    setPersonalMessage('');
    setPassword('');
    setConfirmPassword('');
  }

  function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (setPasswordMode) {
      if (!createUserWithPasswordAction || !email.trim() || !roleId || !password) {
        onFeedback({ kind: 'alert', message: labels.invalidInvite });
        return;
      }
      if (password !== confirmPassword) {
        onFeedback({ kind: 'alert', message: labels.passwordMismatch ?? 'Passwords do not match.' });
        return;
      }

      startTransition(async () => {
        const result = await createUserWithPasswordAction({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
          roleId,
          language: locale,
        });
        if (result.ok) {
          onFeedback({
            kind: 'status',
            message: interpolate(labels.userCreated ?? 'User {email} created.', { email: result.data.email }),
          });
          resetForm();
          onOpenChange(false);
          return;
        }
        // forbidden_role has its own label so the user knows WHICH field is wrong
        const errorMessage = result.error === 'forbidden_role'
          ? (labels.userCreationForbiddenRole ?? 'The selected role cannot be assigned directly — choose a non-system role.')
          : interpolate(labels.userCreationFailed ?? 'User creation failed: {error}', { error: result.error });
        onFeedback({ kind: 'alert', message: errorMessage });
      });
      return;
    }

    if (!inviteUserAction || !email.trim() || !roleId) {
      onFeedback({ kind: 'alert', message: labels.invalidInvite });
      return;
    }

    startTransition(async () => {
      const result = await inviteUserAction({
        email: email.trim(),
        name: name.trim() || undefined,
        roleId,
        site: site && site !== labels.allSites ? site : undefined,
        personalMessage: personalMessage.trim() || undefined,
        language: locale,
      });
      if (result.ok) {
        onFeedback({ kind: 'status', message: interpolate(labels.invitationSent, { email: result.data.email }) });
        resetForm();
        onOpenChange(false);
        return;
      }
      onFeedback({ kind: 'alert', message: interpolate(labels.invitationFailed, { error: result.error }) });
    });
  }

  const submitDisabled = isPending || (setPasswordMode ? !createUserWithPasswordAction : !inviteUserAction);

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="SM-06">
      <Modal.Header title={labels.inviteDialogTitle} />
      <form onSubmit={submitInvite}>
        <Modal.Body>
          <div className="space-y-4 px-5 py-4">
            {canSetPassword ? (
              <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={setPasswordMode}
                  onChange={(event) => setSetPasswordMode(event.currentTarget.checked)}
                  aria-label={labels.setPasswordToggle ?? 'Set password instead of sending invite'}
                />
                <span>
                  <span className="font-medium">{labels.setPasswordToggle ?? 'Set password instead of sending invite'}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {labels.setPasswordToggleHint ?? 'Admin only — creates an active account immediately, no email sent.'}
                  </span>
                </span>
              </label>
            ) : null}
            <label className="block space-y-1 text-sm font-medium">
              <span>{labels.emailAddress}</span>
              <Input type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder={labels.emailPlaceholder} autoFocus required />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>{labels.nameOptional}</span>
              <Input type="text" value={name} onChange={(event) => setName(event.currentTarget.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm font-medium">
                <span>{labels.role}</span>
                <select
                  value={roleId}
                  onChange={(event) => setRoleId(event.currentTarget.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                >
                  {data.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              {!setPasswordMode ? (
                <label className="block space-y-1 text-sm font-medium">
                  <span>{labels.site}</span>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={site} onChange={(event) => setSite(event.currentTarget.value)}>
                    {(sites.length > 0 ? sites : [labels.allSites]).map((siteOption) => (
                      <option key={siteOption} value={siteOption}>{siteOption}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {setPasswordMode ? (
              <>
                <label className="block space-y-1 text-sm font-medium">
                  <span>{labels.password ?? 'Password'}</span>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    placeholder={labels.passwordPlaceholder ?? 'Set a strong password'}
                    required
                  />
                </label>
                <label className="block space-y-1 text-sm font-medium">
                  <span>{labels.confirmPassword ?? 'Confirm password'}</span>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                    placeholder={labels.confirmPasswordPlaceholder ?? 'Re-enter the password'}
                    required
                  />
                </label>
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {labels.createUserHelp ?? 'The account is created active with this password. No email is sent.'}
                  {' '}
                  {labels.passwordStrengthHint ?? 'Use at least 12 characters with mixed letters, numbers, and symbols.'}
                </p>
              </>
            ) : (
              <>
                <label className="block space-y-1 text-sm font-medium">
                  <span>{labels.personalMessage}</span>
                  <Textarea rows={2} placeholder={labels.personalMessagePlaceholder} value={personalMessage} onChange={(event) => setPersonalMessage(event.currentTarget.value)} />
                </label>
                <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  {labels.inviteHelp}
                </p>
              </>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
            <Button type="button" className="btn-secondary" onClick={() => onOpenChange(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn-primary" disabled={submitDisabled}>
              {setPasswordMode ? (labels.createUserButton ?? 'Create user') : labels.sendInvitation}
            </Button>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
