'use client';

/**
 * T-108 — AdvanceGateModal query-trigger host.
 *
 * Wires AdvanceGateModal into the `?modal=` query-trigger pattern used across NPD (mirrors
 * brief-modals.tsx / T-035). The GateChecklistPanel (T-107) advance CTA calls
 * openModal('advanceGate', { project }); the host page maps that to `?modal=advanceGate` and renders
 * this host. The host reads URL state, never decides permissions, and never touches the DB —
 * RBAC + the advanceProjectGate Server Action (T-058, merged) are injected from the server boundary.
 *
 * - `?modal=advanceGate` → AdvanceGateModal (gate-transition, checklist summary, blockers, notes, confirm).
 *
 * The `gateInfo` + `items` summary is resolved server-side (T-057 getProject) and passed in; this host
 * only maps URL state to the injected modal.
 */

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  AdvanceGateModal,
  type AdvanceGateInfo,
  type AdvanceGateItem,
  type AdvanceGateLabels,
  type AdvanceGateProject,
  type AdvanceGateState,
  type AdvanceProjectGateAction,
} from './advance-gate-modal';

/** The query value that opens this modal. Exported so callers build trigger URLs from one source. */
export const ADVANCE_GATE_MODAL_PARAM = 'advanceGate';

/** Build the `?modal=advanceGate` trigger href for a given pathname (single source of truth). */
export function advanceGateTriggerHref(pathname: string, search?: string): string {
  const params = new URLSearchParams(search ?? '');
  params.set('modal', ADVANCE_GATE_MODAL_PARAM);
  return `${pathname}?${params.toString()}`;
}

export type AdvanceGateModalHostProps = {
  labels: AdvanceGateLabels;
  project: AdvanceGateProject;
  gateInfo: AdvanceGateInfo;
  items: AdvanceGateItem[];
  /** Server-resolved load/permission state for the gate summary (defaults to 'ready'). */
  state?: AdvanceGateState;
  /** Injected only when the user may advance (RBAC resolved server-side). */
  advanceProjectGate?: AdvanceProjectGateAction;
  /** Called after a successful advance; defaults to closing the modal + refreshing. */
  onAdvanced?: () => void;
};

export function AdvanceGateModalHost({
  labels,
  project,
  gateInfo,
  items,
  state = 'ready',
  advanceProjectGate,
  onAdvanced,
}: AdvanceGateModalHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const modal = searchParams?.get('modal') ?? null;

  const closeModal = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('modal');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const defaultAdvanced = React.useCallback(() => {
    closeModal();
    router.refresh();
  }, [closeModal, router]);

  return (
    <AdvanceGateModal
      open={modal === ADVANCE_GATE_MODAL_PARAM}
      labels={labels}
      project={project}
      gateInfo={gateInfo}
      items={items}
      state={state}
      advanceProjectGate={advanceProjectGate}
      onAdvanced={onAdvanced ?? defaultAdvanced}
      onClose={closeModal}
    />
  );
}

export default AdvanceGateModalHost;
