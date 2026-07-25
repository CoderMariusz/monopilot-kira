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
  type AdvanceGateServerReadiness,
  type AdvanceGateState,
  type AdvanceProjectGateAction,
} from './advance-gate-modal';
import { getStageGateReadiness } from '../pipeline/_actions/get-stage-gate-readiness';
import { pipelineStageHrefFromPathname } from '../../../lib/npd/stage-routes';

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
  serverReadiness?: AdvanceGateServerReadiness;
  /** Server-resolved load/permission state for the gate summary (defaults to 'ready'). */
  state?: AdvanceGateState;
  /** Injected only when the user may advance (RBAC resolved server-side). */
  advanceProjectGate?: AdvanceProjectGateAction;
  /** Called after a successful advance; defaults to navigating to the new stage. */
  onAdvanced?: (advanced?: { currentStage?: string | null }) => void;
};

export function AdvanceGateModalHost({
  labels,
  project,
  gateInfo,
  items,
  serverReadiness,
  state = 'ready',
  advanceProjectGate,
  onAdvanced,
}: AdvanceGateModalHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const modal = searchParams?.get('modal') ?? null;
  const open = modal === ADVANCE_GATE_MODAL_PARAM;

  const [resolvedGateInfo, setResolvedGateInfo] = React.useState(gateInfo);
  const [resolvedItems, setResolvedItems] = React.useState(items);
  const [resolvedReadiness, setResolvedReadiness] = React.useState(serverReadiness);
  const [readinessLoading, setReadinessLoading] = React.useState(false);

  React.useEffect(() => {
    setResolvedGateInfo(gateInfo);
    setResolvedItems(items);
    setResolvedReadiness(serverReadiness);
  }, [gateInfo, items, serverReadiness]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReadinessLoading(true);
    void getStageGateReadiness({ projectId: project.id, purpose: 'advance' })
      .then((result) => {
        if (cancelled || !result.ok) return;
        setResolvedGateInfo(result.data.gateInfo);
        setResolvedItems(result.data.items);
        setResolvedReadiness(result.data.readiness);
      })
      .finally(() => {
        if (!cancelled) setReadinessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, project.id]);

  const closeModal = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('modal');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  // Advancing changes current_stage, and the stage IS the route segment — so a
  // bare refresh left the user parked on the stage they just left until some
  // later navigation happened to re-derive it (PF-R04-14a). Push the new stage
  // route (which also drops `?modal=`); fall back to close+refresh when the
  // target has no route of its own, e.g. the terminal 'launched' state.
  const defaultAdvanced = React.useCallback(
    (advanced?: { currentStage?: string | null }) => {
      const href = pipelineStageHrefFromPathname(pathname, project.id, advanced?.currentStage);
      if (href) router.push(href);
      else closeModal();
      router.refresh();
    },
    [closeModal, pathname, project.id, router],
  );

  const effectiveState: AdvanceGateState = readinessLoading ? 'loading' : state;

  return (
    <AdvanceGateModal
      open={open}
      labels={labels}
      project={project}
      gateInfo={resolvedGateInfo}
      items={resolvedItems}
      serverReadiness={resolvedReadiness}
      state={effectiveState}
      advanceProjectGate={advanceProjectGate}
      onAdvanced={onAdvanced ?? defaultAdvanced}
      onReadinessBlocked={setResolvedReadiness}
      onClose={closeModal}
    />
  );
}

export default AdvanceGateModalHost;
