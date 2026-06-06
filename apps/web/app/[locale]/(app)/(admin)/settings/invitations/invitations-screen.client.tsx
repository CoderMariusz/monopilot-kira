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

import React, { useEffect, useId, useState } from 'react';

import { Button } from '@monopilot/ui/Button';

export type InvitationStatus = 'pending' | 'expired' | 'accepted';

export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
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

export type InvitationsScreenProps = {
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

export default function InvitationsScreen(props: Partial<InvitationsScreenProps> = {}) {
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
        const lifecycle = await import('../../../../../../actions/users/invitations-lifecycle.js');
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
          <h1 className="page-title">Pending Invitations</h1>
          <p className="muted text-sm">
            View and manage outstanding user invitations for this organisation.
          </p>
        </div>
        {canWrite && effectiveState !== 'empty' ? (
          <Button type="button" className="btn-primary" onClick={() => void inviteUser?.({})}>
            Invite User
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
            <Button type="button" className="btn-primary empty-state-action" onClick={() => void inviteUser?.({})}>
              Invite User
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
                      {canWrite && invitation.status === 'pending' && invitation.inviteToken ? (
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
                      {canWrite && invitation.status !== 'accepted' && !invitation.inviteToken ? (
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
    </main>
  );
}
