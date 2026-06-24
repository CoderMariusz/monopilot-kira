'use client';

/**
 * SET-010 — Pending Invitations client island.
 *
 * Canonical client component for the invitations screen. Extracted from the
 * legacy non-localized (admin)/settings/invitations/page.tsx as part of the
 * dual-route-tree consolidation (F4). The localized SSR server loader at
 * ./page.tsx prefetches real org-scoped data and renders this component in
 * controlled mode so the first paint shows real data (no skeleton flash).
 *
 * Parity source: prototypes/design/Monopilot Design System/settings/access-screens.jsx:232-243
 */

import React, { useEffect, useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import Textarea from '@monopilot/ui/Textarea';

export type InvitationStatus = 'pending' | 'expired' | 'accepted';

export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  roleId?: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: InvitationStatus;
  inviteToken?: string;
};

export type LifecycleResult = {
  ok: boolean;
  error?: string;
  auditEventId?: string;
  expiresAt?: string;
  status?: string;
};

export type InviteRoleOption = {
  id: string;
  label: string;
};

export type InviteUserAction = (input: {
  email: string;
  name?: string;
  roleId: string;
  site?: string;
  personalMessage?: string;
  language?: string;
}) => Promise<{ ok: true; data: { email: string; expiresAt: string } } | { ok: false; error: string }>;

export type InvitationsScreenProps = {
  invitations: PendingInvitation[];
  permissions: string[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
  errorMessage?: string;
  inviteUser?: InviteUserAction;
  inviteRoles?: InviteRoleOption[];
  locale?: string;
  resendInvitation?: (input: { invitationId: string; inviteToken: string }) => Promise<LifecycleResult> | LifecycleResult;
  revokeInvitation?: (input: { invitationId: string; inviteToken: string }) => Promise<LifecycleResult> | LifecycleResult;
  getInvitationLifecycleToken?: (input: { invitationId: string }) => Promise<{ token: string }> | { token: string };
};

type Feedback = { kind: 'status' | 'alert'; message: string } | null;

const VIEW_PERMISSION = 'settings.users.view';
const INVITE_PERMISSION = 'settings.users.invite';
const ROLE_ASSIGN_PERMISSION = 'settings.roles.assign';

const lifecycleInput = (invitation: PendingInvitation): { invitationId: string; inviteToken: string } | null => {
  if (!invitation.inviteToken) return null;
  return {
    invitationId: invitation.id,
    inviteToken: invitation.inviteToken,
  };
};

function hasWritePermissions(permissions: string[]) {
  return permissions.includes(INVITE_PERMISSION) && permissions.includes(ROLE_ASSIGN_PERMISSION);
}

function statusTone(status: InvitationStatus) {
  if (status === 'pending') return 'amber';
  if (status === 'expired') return 'red';
  return 'green';
}

function statusLabel(status: InvitationStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  const toneClass = tone === 'amber' ? 'badge-amber' : tone === 'red' ? 'badge-red' : 'badge-green';
  return (
    <span data-slot="badge" data-tone={tone} className={`badge ${toneClass}`}>
      {children}
    </span>
  );
}

function LoadingState() {
  return (
    <main data-testid="settings-invitations-loading" aria-busy="true" className="space-y-4 p-6">
      <div className="h-8 w-64 rounded" style={{ background: 'var(--gray-100)' }} />
      <div className="card" style={{ margin: 0 }}>
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            data-testid="settings-invitations-skeleton-row"
            className="mb-3 grid grid-cols-7 gap-3 last:mb-0"
          >
            {[0, 1, 2, 3, 4, 5, 6].map((cell) => (
              <div key={cell} className="h-6 rounded bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}

type RuntimeInvitationListItem = {
  id: string;
  email: string;
  role?: string | null;
  invitedBy?: string | null;
  invitedAt?: string | null;
  expiresAt?: string | null;
  status: string;
  inviteToken?: string | null;
};

type RuntimeActions = {
  resendInvitation?: InvitationsScreenProps['resendInvitation'];
  revokeInvitation?: InvitationsScreenProps['revokeInvitation'];
  getInvitationLifecycleToken?: InvitationsScreenProps['getInvitationLifecycleToken'];
};

function normalizeRuntimeInvitation(item: RuntimeInvitationListItem): PendingInvitation | null {
  if (item.status !== 'pending' && item.status !== 'expired' && item.status !== 'accepted') return null;
  return {
    id: item.id,
    email: item.email,
    role: item.role ?? 'Unassigned',
    invitedBy: item.invitedBy ?? 'System',
    invitedAt: item.invitedAt ?? '—',
    expiresAt: item.expiresAt ?? '—',
    status: item.status,
    inviteToken: item.inviteToken ?? undefined,
  };
}

function RevokeDialog({
  invitation,
  onCancel,
  onConfirm,
}: {
  invitation: PendingInvitation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-box"
        style={{ width: 440 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">
            Revoke invitation
          </h2>
        </div>
        <div className="modal-body space-y-3 text-sm">
          <div className="alert alert-red" style={{ marginBottom: 0 }}>
            Revoke invitation for <strong>{invitation.email}</strong>?
          </div>
          <p className="muted">
            This pending invitation expires at {invitation.expiresAt}. Revoking it records a T-124 audit result and prevents the magic link from being used.
          </p>
        </div>
        <div className="modal-foot">
          <Button type="button" className="btn-secondary btn-sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" className="btn-danger btn-sm" onClick={onConfirm}>
            Confirm revoke
          </Button>
        </div>
      </div>
    </div>
  );
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)), template);
}

function InviteDialog({
  open,
  onOpenChange,
  roles,
  locale,
  inviteUser,
  onFeedback,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: InviteRoleOption[];
  locale: string;
  inviteUser?: InviteUserAction;
  onFeedback: (feedback: Feedback) => void;
}) {
  const t = useTranslations('settings.invitations');
  const defaultRoleId = roles[0]?.id ?? '';
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [site, setSite] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!roleId && defaultRoleId) setRoleId(defaultRoleId);
  }, [defaultRoleId, roleId]);

  function resetForm() {
    setEmail('');
    setName('');
    setSite('');
    setPersonalMessage('');
    setInlineError(null);
    setRoleId(defaultRoleId);
  }

  function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInlineError(null);

    if (!inviteUser || !email.trim() || !roleId) {
      setInlineError('Enter a valid email and role.');
      return;
    }

    startTransition(async () => {
      const result = await inviteUser({
        email: email.trim(),
        name: name.trim() || undefined,
        roleId,
        site: site.trim() || undefined,
        personalMessage: personalMessage.trim() || undefined,
        language: locale,
      });

      if (result.ok) {
        onFeedback({
          kind: 'status',
          message: t('invitation_sent', { email: result.data.email }),
        });
        resetForm();
        onOpenChange(false);
        return;
      }

      setInlineError(interpolate('Invitation failed: {error}', { error: 'error' in result ? result.error : 'invite_failed' }));
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="SM-06">
      <Modal.Header title={t('invite_team_member')} />
      <form onSubmit={submitInvite}>
        <Modal.Body>
          <div className="space-y-4 px-5 py-4">
            {inlineError ? (
              <div role="alert" className="alert alert-red" style={{ marginBottom: 0 }}>
                {inlineError}
              </div>
            ) : null}
            <label className="block space-y-1 text-sm font-medium">
              <span>Email address</span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                placeholder="name@example.com"
                autoFocus
                required
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>Name (optional)</span>
              <Input type="text" value={name} onChange={(event) => setName(event.currentTarget.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm font-medium">
                <span>Role</span>
                <Select value={roleId} onValueChange={setRoleId} disabled={roles.length === 0}>
                  <SelectTrigger aria-label="Role">
                    <SelectValue placeholder={t('select_role')} />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1 text-sm font-medium">
                <span>Site</span>
                <Input type="text" value={site} onChange={(event) => setSite(event.currentTarget.value)} />
              </label>
            </div>
            <label className="block space-y-1 text-sm font-medium">
              <span>Personal message</span>
              <Textarea
                rows={2}
                placeholder={t('optional_note')}
                value={personalMessage}
                onChange={(event) => setPersonalMessage(event.currentTarget.value)}
              />
            </label>
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              The invite link expires after 7 days and is scoped to this organisation.
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
            <Button type="button" className="btn-secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="btn-primary" disabled={isPending || !inviteUser || !roleId}>
              Send invitation
            </Button>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export default function InvitationsScreen(props: Partial<InvitationsScreenProps> = {}) {
  const isControlled = 'invitations' in props || 'permissions' in props || 'state' in props;
  const [runtimeInvitations, setRuntimeInvitations] = useState<PendingInvitation[]>([]);
  const [runtimePermissions, setRuntimePermissions] = useState<string[]>([]);
  const [runtimeState, setRuntimeState] = useState<'ready' | 'loading' | 'empty' | 'error'>(isControlled ? 'ready' : 'loading');
  const [runtimeError, setRuntimeError] = useState<string | undefined>();
  const [runtimeActions, setRuntimeActions] = useState<RuntimeActions>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [revokeTarget, setRevokeTarget] = useState<PendingInvitation | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    if (isControlled) return;
    let cancelled = false;
    async function loadRuntimeInvitations() {
      try {
        const lifecycle = await import('../../../../../../actions/users/invitations-lifecycle.js');
        const tokenLifecycle = await import('../../../../../../actions/invitations/get-invitation-lifecycle-token.js');
        const result = await lifecycle.listInvitations();
        if (cancelled) return;
        setRuntimeActions({
          resendInvitation: lifecycle.resendInvitation,
          revokeInvitation: lifecycle.revokeInvitation,
          getInvitationLifecycleToken: tokenLifecycle.getInvitationLifecycleToken,
        });
        if (!result.ok) {
          const errorCode = 'error' in result ? result.error : 'persistence_failed';
          setRuntimePermissions([]);
          setRuntimeError(errorCode === 'forbidden' ? `Permission denied: ${VIEW_PERMISSION} or ${INVITE_PERMISSION} is required to view pending invitations.` : 'Invitations could not be loaded.');
          setRuntimeState('error');
          return;
        }
        const loadedInvitations = (result.data.invitations as RuntimeInvitationListItem[])
          .map((item: RuntimeInvitationListItem) => normalizeRuntimeInvitation(item))
          .filter((item: PendingInvitation | null): item is PendingInvitation => item !== null);
        setRuntimePermissions([VIEW_PERMISSION, INVITE_PERMISSION, ROLE_ASSIGN_PERMISSION]);
        setRuntimeInvitations(loadedInvitations);
        setRuntimeState(loadedInvitations.length > 0 ? 'ready' : 'empty');
      } catch {
        if (cancelled) return;
        setRuntimePermissions([]);
        setRuntimeError('Invitations could not be loaded.');
        setRuntimeState('error');
      }
    }
    void loadRuntimeInvitations();
    return () => {
      cancelled = true;
    };
  }, [isControlled]);

  const invitations = props.invitations ?? runtimeInvitations;
  const permissions = props.permissions ?? runtimePermissions;
  const state = props.state ?? runtimeState;
  const errorMessage = props.errorMessage ?? runtimeError;
  const inviteUser = props.inviteUser;
  const inviteRoles = props.inviteRoles ?? [];
  const locale = props.locale ?? 'en';
  const resendInvitation = props.resendInvitation ?? runtimeActions.resendInvitation;
  const revokeInvitation = props.revokeInvitation ?? runtimeActions.revokeInvitation;
  const getInvitationLifecycleToken = props.getInvitationLifecycleToken ?? runtimeActions.getInvitationLifecycleToken;

  const canView = permissions.includes(VIEW_PERMISSION) || permissions.includes(INVITE_PERMISSION);
  const canWrite = hasWritePermissions(permissions);
  const effectiveState = state === 'empty' || invitations.length === 0 ? 'empty' : state;

  function openInviteDialog() {
    if (!canWrite) return;
    setShowInvite(true);
  }

  async function tokenInput(invitation: PendingInvitation): Promise<{ invitationId: string; inviteToken: string } | null> {
    const existing = lifecycleInput(invitation);
    if (existing) return existing;
    if (invitation.status !== 'pending' || !getInvitationLifecycleToken) return null;
    const result = await Promise.resolve(getInvitationLifecycleToken({ invitationId: invitation.id }));
    return { invitationId: invitation.id, inviteToken: result.token };
  }

  async function handleResend(invitation: PendingInvitation) {
    let input: { invitationId: string; inviteToken: string } | null = null;
    try {
      input = await tokenInput(invitation);
    } catch (error) {
      setFeedback({ kind: 'alert', message: `Could not resend invitation: ${error instanceof Error ? error.message : 'token_unavailable'}.` });
      return;
    }
    if (!resendInvitation || !input) {
      setFeedback({ kind: 'alert', message: 'Could not resend invitation: lifecycle action unavailable.' });
      return;
    }
    const result = await Promise.resolve(resendInvitation(input));
    if (result.ok) {
      setFeedback({
        kind: 'status',
        message: `Invitation resent for ${invitation.email}. Audit result ${result.auditEventId ?? 'recorded'}.`,
      });
      return;
    }
    setFeedback({ kind: 'alert', message: `Could not resend invitation: ${result.error ?? 'invite_failed'}.` });
  }

  async function handleRevoke(invitation: PendingInvitation) {
    if (invitation.status !== 'pending') return;
    let input: { invitationId: string; inviteToken: string } | null = null;
    try {
      input = await tokenInput(invitation);
    } catch (error) {
      setRevokeTarget(null);
      setFeedback({ kind: 'alert', message: `Could not revoke invitation: ${error instanceof Error ? error.message : 'token_unavailable'}.` });
      return;
    }
    if (!revokeInvitation || !input) {
      setRevokeTarget(null);
      setFeedback({ kind: 'alert', message: 'Could not revoke invitation: lifecycle action unavailable.' });
      return;
    }
    const result = await Promise.resolve(revokeInvitation(input));
    setRevokeTarget(null);
    if (result.ok) {
      setFeedback({
        kind: 'status',
        message: `Invitation revoked for ${invitation.email}. Audit result ${result.auditEventId ?? 'recorded'}.`,
      });
      return;
    }
    setFeedback({ kind: 'alert', message: `Could not revoke invitation: ${result.error ?? 'invite_failed'}.` });
  }

  if (state === 'loading') {
    return <LoadingState />;
  }

  const t = useTranslations('settings.invitations');

  if (!canView) {
    return (
      <main className="p-6">
        <div role="alert" className="alert alert-amber">
          Permission denied: {VIEW_PERMISSION} or {INVITE_PERMISSION} is required to view pending invitations.
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="p-6">
        <div role="alert" className="alert alert-red">
          {errorMessage ?? 'Invitations could not be loaded.'}
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t('heading')}</h1>
          <p className="muted text-sm">
            View and manage outstanding user invitations for this organisation.
          </p>
        </div>
        {canWrite && effectiveState !== 'empty' ? (
          <Button type="button" className="btn-primary" onClick={openInviteDialog}>
            {t('invite_user')}
          </Button>
        ) : null}
      </div>

      {!canWrite ? (
        <div role="note" className="alert alert-amber">
          Read-only mode: {INVITE_PERMISSION} and {ROLE_ASSIGN_PERMISSION} are required for Invite, Resend, or Revoke controls.
        </div>
      ) : null}

      {feedback ? (
        <div role={feedback.kind} className={`alert ${feedback.kind === 'alert' ? 'alert-red' : 'alert-green'}`}>
          {feedback.message}
        </div>
      ) : null}

      {effectiveState === 'empty' ? (
        <div role="status" className="empty-state card" style={{ margin: 0 }}>
          <div className="empty-state-icon" aria-hidden="true">
            &#9993;
          </div>
          <p className="empty-state-title">No pending invitations.</p>
          <p className="empty-state-body">Invite a team member to get started.</p>
          {canWrite ? (
            <Button type="button" className="btn-primary empty-state-action" onClick={openInviteDialog}>
              {t('invite_user')}
            </Button>
          ) : null}
        </div>
      ) : (
        <section aria-label="Pending invitations panel" className="card" style={{ margin: 0, padding: 0 }}>
          <div className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
            <h2 className="card-title">Invitation lifecycle</h2>
            <p className="muted text-sm">Pending can be resent or revoked; expired can be resent; accepted invitations are immutable.</p>
          </div>
          <div className="overflow-x-auto p-4">
            <table aria-label="Pending Invitations" className="w-full border-collapse text-sm">
              <thead>
                <tr style={{ background: 'var(--gray-050)' }}>
                  <th scope="col" className="p-2 text-left">Email</th>
                  <th scope="col" className="p-2 text-left">Role</th>
                  <th scope="col" className="p-2 text-left">Invited By</th>
                  <th scope="col" className="p-2 text-left">Invited At</th>
                  <th scope="col" className="p-2 text-left">Expires At</th>
                  <th scope="col" className="p-2 text-left">Status</th>
                  <th scope="col" className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr key={invitation.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="p-2 font-medium">{invitation.email}</td>
                    <td className="p-2">{invitation.role}</td>
                    <td className="p-2">{invitation.invitedBy}</td>
                    <td className="muted mono p-2">{invitation.invitedAt}</td>
                    <td className="muted mono p-2">{invitation.expiresAt}</td>
                    <td className="p-2">
                      <Badge tone={statusTone(invitation.status)}>{statusLabel(invitation.status)}</Badge>
                    </td>
                    <td className="p-2">
                      {canWrite && invitation.status === 'pending' && (invitation.inviteToken || getInvitationLifecycleToken) ? (
                        <div className="flex gap-2">
                          <Button type="button" className="btn-secondary btn-sm" onClick={() => void handleResend(invitation)}>
                            Resend
                          </Button>
                          <Button type="button" className="btn-danger btn-sm" onClick={() => setRevokeTarget(invitation)}>
                            Revoke
                          </Button>
                        </div>
                      ) : null}
                      {canWrite && invitation.status === 'expired' && invitation.inviteToken ? (
                        <Button type="button" className="btn-secondary btn-sm" onClick={() => void handleResend(invitation)}>
                          Resend
                        </Button>
                      ) : null}
                      {invitation.status === 'accepted' ? (
                        <span className="muted text-xs">Accepted user is immutable.</span>
                      ) : null}
                      {!canWrite && invitation.status !== 'accepted' ? (
                        <span className="muted text-xs">No actions</span>
                      ) : null}
                      {canWrite && invitation.status !== 'accepted' && !invitation.inviteToken && !(invitation.status === 'pending' && getInvitationLifecycleToken) ? (
                        <span className="muted text-xs">Lifecycle action unavailable</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {revokeTarget ? (
        <RevokeDialog invitation={revokeTarget} onCancel={() => setRevokeTarget(null)} onConfirm={() => void handleRevoke(revokeTarget)} />
      ) : null}
      <InviteDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        roles={inviteRoles}
        locale={locale}
        inviteUser={inviteUser}
        onFeedback={setFeedback}
      />
    </main>
  );
}
