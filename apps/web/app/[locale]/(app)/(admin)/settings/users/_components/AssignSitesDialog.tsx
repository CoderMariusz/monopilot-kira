'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';

import {
  interpolate,
  type AssignUserSitesAction,
  type SettingsUser,
  type SiteOption,
  type UsersScreenLabels,
} from '../users-screen.client';

export function AssignSitesDialog({
  user,
  onClose,
  labels,
  siteOptions,
  assignUserSitesAction,
  onFeedback,
}: {
  user: SettingsUser | null;
  onClose: () => void;
  labels: UsersScreenLabels;
  siteOptions: SiteOption[];
  assignUserSitesAction?: AssignUserSitesAction;
  onFeedback: (feedback: { kind: 'status' | 'alert'; message: string } | null) => void;
}) {
  // Pre-check the user's current assignments; an empty set means "unrestricted"
  // (0 rows) which the help text explains. The selection set is the
  // authoritative payload — assignUserSites REPLACES the assignments.
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  React.useEffect(() => {
    setSelected(new Set(user?.assignedSiteIds ?? []));
  }, [user?.id, user?.assignedSiteIds]);

  const title = labels.assignSitesDialogTitle ?? 'Assign sites';

  function toggle(siteId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(siteId);
      else next.delete(siteId);
      return next;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !assignUserSitesAction) {
      onFeedback({ kind: 'alert', message: labels.assignSitesUnavailable ?? 'Site assignment unavailable' });
      return;
    }
    const siteIds = siteOptions.map((site) => site.id).filter((id) => selected.has(id));
    startTransition(async () => {
      const result = await assignUserSitesAction({ userId: user.id, siteIds });
      if (result.ok) {
        onFeedback({ kind: 'status', message: labels.sitesAssignmentSuccess ?? 'Site access updated.' });
        onClose();
        router.refresh();
        return;
      }
      onFeedback({
        kind: 'alert',
        message: interpolate(labels.sitesAssignmentFailed ?? 'Site assignment failed: {error}.', { error: result.error }),
      });
    });
  }

  return (
    <Modal open={Boolean(user)} onOpenChange={(open) => { if (!open) onClose(); }} size="md" modalId="SM-08">
      <Modal.Header title={title} />
      <p className="px-5 pt-2 text-sm text-muted-foreground">{labels.assignSitesDialogSubtitle ?? 'Choose which sites this user can see and select.'}</p>
      <form onSubmit={submit}>
        <Modal.Body>
          <div className="space-y-4 px-5 py-4">
            {user ? (
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">
                    {user.initials}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </div>
                </div>
              </div>
            ) : null}
            {siteOptions.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                {labels.noOrgSites ?? 'No sites are configured for this organization yet.'}
              </p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{labels.assignSites ?? 'Assign sites'}</legend>
                {siteOptions.map((site) => (
                  <label key={site.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(site.id)}
                      onChange={(event) => toggle(site.id, event.currentTarget.checked)}
                      aria-label={site.name}
                    />
                    <span>{site.name}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              {selected.size === 0
                ? (labels.assignSitesEmptyHint ?? 'No sites selected — the user can see ALL sites (unrestricted).')
                : (labels.assignSitesHelp ?? 'The user will only see the selected sites.')}
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
            <Button type="button" className="btn-secondary" onClick={onClose}>{labels.cancel}</Button>
            <Button type="submit" className="btn-primary" disabled={isPending || !user || !assignUserSitesAction}>
              {labels.saveSites ?? 'Save sites'}
            </Button>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
