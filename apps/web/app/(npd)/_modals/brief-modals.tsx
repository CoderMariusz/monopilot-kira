'use client';

/**
 * T-035 — Brief modals query-trigger host.
 *
 * Wires the BriefCreateModal + BriefCompleteModal into the `?modal=` query-trigger pattern used by
 * T-119 (brief-list-table.tsx pushes `?modal=briefCreate` and `?modal=briefConvert&brief=<id>`).
 *
 * - `?modal=briefCreate`                  → BriefCreateModal.
 * - `?modal=briefConvert&brief=<briefId>` → BriefCompleteModal (legacy query name kept for the
 *   existing trigger; user-facing copy is "Complete brief for project", never "Convert to FA").
 *
 * RBAC + Server Actions are injected from the page (server boundary). This host never decides
 * permissions and never touches the DB — it only maps URL state to the right injected modal.
 */

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  BriefCreateModal,
  type BriefCreateLabels,
  type CreateBriefAction,
} from './brief-create-modal';
import {
  BriefCompleteModal,
  type BriefCompleteLabels,
  type BriefCompleteStatus,
  type BriefCompleteSummary,
  type CompleteBriefAction,
} from './brief-complete-modal';

export type BriefModalsProps = {
  createLabels: BriefCreateLabels;
  completeLabels: BriefCompleteLabels;
  /** Injected only when the user may create (RBAC resolved server-side). */
  createBriefAction?: CreateBriefAction;
  /** Injected only when the user may complete/convert (RBAC resolved server-side). */
  completeBriefAction?: CompleteBriefAction;
  /** Resolves the read-only summary for the brief in `?brief=`; returns null while not ready. */
  completeStatus: BriefCompleteStatus;
  completeSummary: BriefCompleteSummary | null;
  /** Navigation target after a successful create (defaults to the new brief editor). */
  onCreated?: (result: { briefId: string; npdProjectId: string }) => void;
  onCompleted?: (result: { briefId: string; npdProjectId: string }) => void;
};

export function BriefModals({
  createLabels,
  completeLabels,
  createBriefAction,
  completeBriefAction,
  completeStatus,
  completeSummary,
  onCreated,
  onCompleted,
}: BriefModalsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const modal = searchParams?.get('modal') ?? null;

  const closeModal = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('modal');
    params.delete('brief');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const defaultCreated = React.useCallback(
    (result: { briefId: string; npdProjectId: string }) => {
      router.push(`/briefs/${result.briefId}`);
    },
    [router],
  );

  const defaultCompleted = React.useCallback(() => {
    closeModal();
    router.refresh();
  }, [closeModal, router]);

  return (
    <>
      <BriefCreateModal
        open={modal === 'briefCreate'}
        labels={createLabels}
        createBriefAction={createBriefAction}
        onCreated={onCreated ?? defaultCreated}
        onClose={closeModal}
      />
      <BriefCompleteModal
        open={modal === 'briefConvert' || modal === 'briefComplete'}
        status={completeStatus}
        summary={completeSummary}
        labels={completeLabels}
        completeBriefAction={completeBriefAction}
        onCompleted={onCompleted ?? defaultCompleted}
        onClose={closeModal}
      />
    </>
  );
}

export default BriefModals;
