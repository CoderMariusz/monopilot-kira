'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import type { AcceptWipDefinitionUpdateUiResult } from '../_actions/accept-wip-definition-update-wrapper';
import type { StaleWipDefinitionRow } from '../_lib/stale-wip-definition';

export type StaleWipDefinitionBannerLabels = {
  updatedMessage: string;
  acceptButton: string;
  accepting: string;
  acceptSuccess: string;
  acceptSuccessBomsRegenerated: string;
  acceptError: string;
  acceptForbidden: string;
};

export type StaleWipDefinitionBannerProps = {
  projectId: string;
  staleDefinitions: StaleWipDefinitionRow[];
  canAccept: boolean;
  labels: StaleWipDefinitionBannerLabels;
  acceptAction: (input: {
    wipDefinitionId: string;
    projectId: string;
  }) => Promise<AcceptWipDefinitionUpdateUiResult>;
};

export function StaleWipDefinitionBanner({
  projectId,
  staleDefinitions,
  canAccept,
  labels,
  acceptAction,
}: StaleWipDefinitionBannerProps) {
  const router = useRouter();
  const [acceptingId, setAcceptingId] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  if (staleDefinitions.length === 0) {
    return null;
  }

  async function handleAccept(wipDefinitionId: string) {
    if (!canAccept) return;
    setAcceptingId(wipDefinitionId);
    setSuccessMessage(null);
    setErrorMessage(null);

    const result = await acceptAction({ wipDefinitionId, projectId });
    setAcceptingId(null);

    if (!result.ok) {
      setErrorMessage(labels.acceptError);
      return;
    }

    if (result.bomsRegenerated === true) {
      setSuccessMessage(labels.acceptSuccessBomsRegenerated);
    } else {
      setSuccessMessage(labels.acceptSuccess);
    }

    router.refresh();
  }

  return (
    <div className="space-y-2" data-testid="stale-wip-definition-banner">
      {successMessage ? (
        <div
          role="status"
          data-testid="stale-wip-accept-success"
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          {successMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div
          role="alert"
          data-testid="stale-wip-accept-error"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      ) : null}
      {staleDefinitions.map((row) => (
        <section
          key={row.wipDefinitionId}
          data-testid={`stale-wip-row-${row.wipDefinitionId}`}
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-amber-900">
                {labels.updatedMessage
                  .replace('{name}', row.name)
                  .replace('{version}', String(row.version))}
              </h2>
              {row.changesHint ? (
                <p className="mt-1 text-sm text-amber-800">{row.changesHint}</p>
              ) : null}
            </div>
            {canAccept ? (
              <button
                type="button"
                data-testid={`stale-wip-accept-${row.wipDefinitionId}`}
                disabled={acceptingId === row.wipDefinitionId}
                onClick={() => void handleAccept(row.wipDefinitionId)}
                className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
              >
                {acceptingId === row.wipDefinitionId ? labels.accepting : labels.acceptButton}
              </button>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}

export default StaleWipDefinitionBanner;
