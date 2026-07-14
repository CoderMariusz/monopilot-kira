'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import { ALLOWED_CREATE_PICK_LIST_SO_STATUSES } from '../_actions/so-transitions';

export type CreatePickListLabels = {
  label: string;
  pending: string;
  noPermission: string;
  notAllocated: string;
  notPickable: string;
  goToPick: string;
  errors: Record<string, string>;
};

export type CreatePickListResult = { ok: true; pickListId: string } | { ok: false; error: string };

export function CreatePickListButton({
  locale,
  soId,
  soStatus,
  hasOpenPickList,
  canPick,
  labels,
  createPickListAction,
}: {
  locale: string;
  soId: string;
  soStatus: string;
  hasOpenPickList: boolean;
  canPick: boolean;
  labels: CreatePickListLabels;
  createPickListAction: (soId: string) => Promise<CreatePickListResult>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const status = soStatus.toLowerCase() as Parameters<typeof ALLOWED_CREATE_PICK_LIST_SO_STATUSES.has>[0];
  const pickable = ALLOWED_CREATE_PICK_LIST_SO_STATUSES.has(status) && !hasOpenPickList;
  const preAllocation = !ALLOWED_CREATE_PICK_LIST_SO_STATUSES.has(status) && ['draft', 'confirmed'].includes(status);
  const disabled = !canPick || !pickable || pending;
  const tooltip = !canPick
    ? labels.noPermission
    : preAllocation
      ? labels.notAllocated
      : !pickable
        ? labels.notPickable
        : undefined;

  async function onClick() {
    if (disabled) return;
    setPending(true);
    setError(null);
    try {
      const result = await createPickListAction(soId);
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      router.push(`/${locale}/shipping/${soId}/pick`);
    } catch {
      setError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  if (hasOpenPickList) {
    return (
      <Button
        type="button"
        className="btn--primary"
        data-testid="so-action-go-to-pick"
        onClick={() => router.push(`/${locale}/shipping/${soId}/pick`)}
      >
        {labels.goToPick}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="btn--primary"
        data-testid="so-action-create-pick-list"
        disabled={disabled}
        aria-busy={pending}
        title={tooltip}
        onClick={() => void onClick()}
      >
        {pending ? labels.pending : labels.label}
      </Button>
      {error ? (
        <div
          role="alert"
          data-testid="create-pick-list-error"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
