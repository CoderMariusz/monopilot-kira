'use client';

/**
 * T-109 — GateApprovalModal query-trigger host.
 *
 * Wires GateApprovalModal into the `?modal=` query-trigger pattern (same convention as
 * brief-modals.tsx / T-035). The sibling GateChecklistPanel (T-107) opens this modal via its
 * `openModal('gateApproval', { project })` contract; the route page (T-111, out of scope here)
 * pushes `?modal=gateApproval` and renders this host with the injected Server Action caller.
 *
 * - `?modal=gateApproval` → GateApprovalModal.
 *
 * RBAC + the approveProjectGate Server Action (T-058) are injected from the page server boundary.
 * This host never decides permissions and never touches the DB — it only maps URL state to the
 * modal and clears the param on close.
 */

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  GateApprovalModal,
  type GateApprovalProject,
  type GateApprovalStatus,
  type OnApproveGate,
} from './gate-approval-modal';

export const GATE_APPROVAL_MODAL_PARAM = 'gateApproval';

export type GateApprovalModalHostProps = {
  /** Server-fetched project context for the gate awaiting approval; null while not ready. */
  project: GateApprovalProject | null;
  /** Loading/empty/error/permission gate resolved server-side. */
  status?: GateApprovalStatus;
  /** Injected only when the user may approve gates (RBAC resolved server-side). */
  onApprove?: OnApproveGate;
  /** Optional callback after a successful decision (defaults to closing + refreshing). */
  onDecided?: () => void;
};

export function GateApprovalModalHost({ project, status = 'ready', onApprove, onDecided }: GateApprovalModalHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const modal = searchParams?.get('modal') ?? null;
  const open = modal === GATE_APPROVAL_MODAL_PARAM;

  const closeModal = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('modal');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
    onDecided?.();
  }, [onDecided, pathname, router, searchParams]);

  // When the user lacks permission or there is no gate to approve, surface the gated UI
  // (never render-then-disable: status is derived server-side).
  const resolvedStatus: GateApprovalStatus = onApprove ? status : 'forbidden';

  if (!project) {
    // Without a project we can only render the non-ready shell when the modal is open.
    return open ? (
      <GateApprovalModal
        open={open}
        status={status === 'ready' ? 'loading' : status}
        project={{ id: '', code: '', name: '', gateCode: 'G3', requiredDone: 0, requiredTotal: 0, pct: 0 }}
        onApprove={async () => ({ ok: false, error: 'NOT_READY' })}
        onClose={closeModal}
      />
    ) : null;
  }

  return (
    <GateApprovalModal
      open={open}
      project={project}
      status={resolvedStatus}
      onApprove={onApprove ?? (async () => ({ ok: false, error: 'FORBIDDEN' }))}
      onClose={closeModal}
    />
  );
}

export default GateApprovalModalHost;
