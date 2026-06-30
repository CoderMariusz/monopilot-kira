'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';

import {
  interpolate,
  type AssignRoleAction,
  type SettingsUser,
  type UsersScreenData,
  type UsersScreenLabels,
} from '../users-screen.client';

export function RoleAssignDialog({
  draft,
  onClose,
  labels,
  data,
  assignRoleAction,
  onFeedback,
}: {
  draft: { user: SettingsUser; roleId: string } | null;
  onClose: () => void;
  labels: UsersScreenLabels;
  data: UsersScreenData;
  assignRoleAction?: AssignRoleAction;
  onFeedback: (feedback: { kind: 'status' | 'alert'; message: string } | null) => void;
}) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(draft?.roleId ?? '');
  const [isPending, startTransition] = useTransition();

  React.useEffect(() => {
    setRoleId(draft?.roleId ?? '');
  }, [draft?.roleId, draft?.user.id]);

  const title = labels.assignRoleDialogTitle ?? 'Assign role';
  const searchUser = labels.searchUser ?? 'Search user';
  const newRole = labels.newRole ?? 'New role';
  const pickRole = labels.pickRole ?? '— pick role —';
  const selectedRoleLabel = data.roles.find((role) => role.id === roleId)?.label ?? roleId;
  const preview = draft
    ? interpolate(labels.roleAssignmentPreview ?? 'Assigning {role} to {user}. Previous role {previousRole} will be replaced.', {
      role: selectedRoleLabel,
      user: draft.user.name,
      previousRole: draft.user.roleLabel,
    })
    : '';

  function submitAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !roleId || !assignRoleAction) {
      onFeedback({ kind: 'alert', message: labels.roleAssignmentUnavailable });
      return;
    }

    startTransition(async () => {
      const result = await assignRoleAction({ targetUserId: draft.user.id, roleId });
      if (result.ok) {
        onFeedback({ kind: 'status', message: labels.roleAssignmentSuccess ?? 'Role updated.' });
        onClose();
        router.refresh();
        return;
      }
      onFeedback({
        kind: 'alert',
        message: interpolate(labels.roleAssignmentFailed ?? 'Role assignment failed: {error}.', { error: result.error }),
      });
    });
  }

  return (
    <Modal open={Boolean(draft)} onOpenChange={(open) => { if (!open) onClose(); }} size="lg" modalId="SM-07">
      <Modal.Header title={title} />
      <p className="px-5 pt-2 text-sm text-muted-foreground">{labels.roleAssignmentSubtitle ?? 'Pick a user, then the new role.'}</p>
      <form onSubmit={submitAssignment}>
        <Modal.Body>
          <div className="space-y-4 px-5 py-4">
            <label className="block space-y-1 text-sm font-medium">
              <span>{searchUser}</span>
              <Input
                value={draft?.user.name ?? ''}
                placeholder={labels.searchUserPlaceholder ?? 'Name or email…'}
                readOnly
                autoFocus
              />
            </label>
            {draft ? (
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">
                    {draft.user.initials}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{draft.user.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {draft.user.email} · current: {draft.user.roleLabel}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <label className="block space-y-1 text-sm font-medium">
              <span>{newRole}</span>
              <select
                aria-label={newRole}
                value={roleId}
                onChange={(event) => setRoleId(event.currentTarget.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                required
              >
                <option value="">{pickRole}</option>
                {data.roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.label}</option>
                ))}
              </select>
            </label>
            {draft && roleId && roleId !== draft.user.roleId ? (
              <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                {preview}
              </p>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
            <Button type="button" className="btn-secondary" onClick={onClose}>{labels.cancel}</Button>
            <Button type="submit" className="btn-primary" disabled={isPending || !draft || !roleId || roleId === draft.user.roleId || !assignRoleAction}>
              {title}
            </Button>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
