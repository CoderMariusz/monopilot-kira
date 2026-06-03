'use client';

import React, { useEffect, useId, useState } from 'react';

import { Button } from '@monopilot/ui/Button';

type InvitationStatus = 'pending' | 'expired' | 'accepted';

type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: InvitationStatus;
  inviteToken?: string;
};

type LifecycleResult = {
  ok: boolean;
  error?: string;
  auditEventId?: string;
  expiresAt?: string;
  status?: string;
};

type InvitationsPageProps = {
  invitations: PendingInvitation[];
  permissions: string[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
  errorMessage?: string;
  inviteUser?: (input: unknown) => Promise<unknown> | unknown;
  resendInvitation?: (input: { invitationId: string; inviteToken: string }) => Promise<LifecycleResult> | LifecycleResult;
  revokeInvitation?: (input: { invitationId: string; inviteToken: string }) => Promise<LifecycleResult> | LifecycleResult;
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
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
    >
      {children}
    </span>
  );
}

function LoadingState() {
  return (
    <main data-testid="settings-invitations-loading" aria-busy="true" className="space-y-4 p-6">
      <div className="h-8 w-64 rounded bg-slate-200" />
      <div className="rounded-xl border p-4">
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
  resendInvitation?: InvitationsPageProps['resendInvitation'];
  revokeInvitation?: InvitationsPageProps['revokeInvitation'];
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            Revoke invitation
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <p>
            Revoke invitation for <strong>{invitation.email}</strong>?
          </p>
          <p className="text-muted-foreground">
            This pending invitation expires at {invitation.expiresAt}. Revoking it records a T-124 audit result and prevents the magic link from being used.
          </p>
        </div>
        <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm}>
            Confirm revoke
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function InvitationsPage(props: Partial<InvitationsPageProps> = {}) {
  const isControlled = 'invitations' in props || 'permissions' in props || 'state' in props;
  const [runtimeInvitations, setRuntimeInvitations] = useState<PendingInvitation[]>([]);
  const [runtimePermissions, setRuntimePermissions] = useState<string[]>([]);
  const [runtimeState, setRuntimeState] = useState<'ready' | 'loading' | 'empty' | 'error'>(isControlled ? 'ready' : 'loading');
  const [runtimeError, setRuntimeError] = useState<string | undefined>();
  const [runtimeActions, setRuntimeActions] = useState<RuntimeActions>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [revokeTarget, setRevokeTarget] = useState<PendingInvitation | null>(null);

  useEffect(() => {
    if (isControlled) return;
    let cancelled = false;
    async function loadRuntimeInvitations() {
      try {
        const lifecycle = await import('../../../../actions/users/invitations-lifecycle.js');
        const result = await lifecycle.listInvitations();
        if (cancelled) return;
        setRuntimeActions({ resendInvitation: lifecycle.resendInvitation, revokeInvitation: lifecycle.revokeInvitation });
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
  const resendInvitation = props.resendInvitation ?? runtimeActions.resendInvitation;
  const revokeInvitation = props.revokeInvitation ?? runtimeActions.revokeInvitation;

  const canView = permissions.includes(VIEW_PERMISSION) || permissions.includes(INVITE_PERMISSION);
  const canWrite = hasWritePermissions(permissions);
  const effectiveState = state === 'empty' || invitations.length === 0 ? 'empty' : state;

  async function handleResend(invitation: PendingInvitation) {
    const input = lifecycleInput(invitation);
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
    const input = lifecycleInput(invitation);
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

  if (!canView) {
    return (
      <main className="p-6">
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Permission denied: {VIEW_PERMISSION} or {INVITE_PERMISSION} is required to view pending invitations.
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {errorMessage ?? 'Invitations could not be loaded.'}
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pending Invitations</h1>
          <p className="text-sm text-muted-foreground">
            View and manage outstanding user invitations for this organisation.
          </p>
        </div>
        {canWrite && effectiveState !== 'empty' ? (
          <Button type="button" onClick={() => void inviteUser?.({})}>
            Invite User
          </Button>
        ) : null}
      </div>

      {!canWrite ? (
        <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Read-only mode: {INVITE_PERMISSION} and {ROLE_ASSIGN_PERMISSION} are required for Invite, Resend, or Revoke controls.
        </div>
      ) : null}

      {feedback ? (
        <div
          role={feedback.kind}
          className={`rounded-lg border p-3 text-sm ${
            feedback.kind === 'alert' ? 'border-red-200 bg-red-50 text-red-900' : 'border-green-200 bg-green-50 text-green-900'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {effectiveState === 'empty' ? (
        <div role="status" className="rounded-lg border border-dashed p-8 text-center">
          <div className="text-2xl" aria-hidden="true">
            ✉️
          </div>
          <p className="mt-2 font-medium">No pending invitations.</p>
          <p className="mt-1 text-sm text-muted-foreground">Invite a team member to get started.</p>
          {canWrite ? (
            <Button type="button" className="mt-4" onClick={() => void inviteUser?.({})}>
              Invite User
            </Button>
          ) : null}
        </div>
      ) : (
        <section aria-label="Pending invitations panel" className="rounded-xl border">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold">Invitation lifecycle</h2>
            <p className="text-sm text-muted-foreground">Pending can be resent or revoked; expired can be resent; accepted invitations are immutable.</p>
          </div>
          <div className="overflow-x-auto p-4">
            <table aria-label="Pending Invitations" className="w-full border-collapse text-sm">
              <thead>
                <tr>
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
                  <tr key={invitation.id} className="border-t">
                    <td className="p-2 font-medium">{invitation.email}</td>
                    <td className="p-2">{invitation.role}</td>
                    <td className="p-2">{invitation.invitedBy}</td>
                    <td className="p-2 text-muted-foreground">{invitation.invitedAt}</td>
                    <td className="p-2 text-muted-foreground">{invitation.expiresAt}</td>
                    <td className="p-2">
                      <Badge tone={statusTone(invitation.status)}>{statusLabel(invitation.status)}</Badge>
                    </td>
                    <td className="p-2">
                      {canWrite && invitation.status === 'pending' && invitation.inviteToken ? (
                        <div className="flex gap-2">
                          <Button type="button" onClick={() => void handleResend(invitation)}>
                            Resend
                          </Button>
                          <Button type="button" onClick={() => setRevokeTarget(invitation)}>
                            Revoke
                          </Button>
                        </div>
                      ) : null}
                      {canWrite && invitation.status === 'expired' && invitation.inviteToken ? (
                        <Button type="button" onClick={() => void handleResend(invitation)}>
                          Resend
                        </Button>
                      ) : null}
                      {invitation.status === 'accepted' ? (
                        <span className="text-xs text-muted-foreground">Accepted user is immutable.</span>
                      ) : null}
                      {!canWrite && invitation.status !== 'accepted' ? (
                        <span className="text-xs text-muted-foreground">No actions</span>
                      ) : null}
                      {canWrite && invitation.status !== 'accepted' && !invitation.inviteToken ? (
                        <span className="text-xs text-muted-foreground">Lifecycle action unavailable</span>
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
    </main>
  );
}
