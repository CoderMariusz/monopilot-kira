'use client';

/**
 * T-111 — Gate screen orchestrator (WIRING).
 *
 * Composes the four merged Stage-Gate slice components into one route-level client
 * island:
 *   - GateChecklistPanel       (T-107) — the per-gate checklist + advance/approve CTA.
 *   - AdvanceGateModal         (T-108) — G0→G2 self-advance confirmation.
 *   - GateApprovalModal        (T-109) — G3/G4 e-sign approve / reject.
 *   - ApprovalHistoryTimeline  (T-110) — the immutable gate_approvals timeline.
 *
 * Wiring contract (T-111):
 *   1. The RSC page (gate/page.tsx) fetches REAL data (T-057 getProject + withOrgContext)
 *      and passes serializable props + Server-Action adapters down here. This island
 *      NEVER queries the DB and NEVER authors a Server Action — it imports them.
 *   2. GateChecklistPanel.openModal('advanceGate'|'gateApproval', { project }) is wired to
 *      route-level state here. The panel already chooses the modal by the gate's
 *      requiresApproval flag (G3/G4 → gateApproval, else advanceGate) — the orchestrator
 *      honours whichever modal key it asks for.
 *   3. After advanceProjectGate / approveProjectGate completes, router.refresh() re-runs the
 *      RSC loader so ApprovalHistoryTimeline + the checklist reflect the new entry.
 *
 * Risk red line (T-111): this file does not modify any slice component (T-107..T-110);
 * it only mounts + wires them.
 */

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  GateChecklistPanel,
  type GateChecklistLabels,
  type GateChecklistProject,
  type GateHardBlocker,
  type GateView,
  type OpenModalFn,
  type OpenRevertModalFn,
  type PanelState,
  type ToggleGateChecklistItemAction,
} from '../../../../../../../(npd)/pipeline/[projectId]/_components/gate-checklist-panel';
import {
  AdvanceGateModal,
  type AdvanceGateInfo,
  type AdvanceGateItem,
  type AdvanceGateLabels,
  type AdvanceGateProject,
  type AdvanceGateServerReadiness,
  type AdvanceProjectGateAction,
} from '../../../../../../../(npd)/_modals/advance-gate-modal';
import { pipelineStageHrefFromPathname } from '../../../../../../../../lib/npd/stage-routes';
import {
  GateApprovalModal,
  type GateApprovalProject,
  type OnApproveGate,
} from '../../../../../../../(npd)/_modals/gate-approval-modal';
import { getStageGateReadiness } from '../../../../../../../(npd)/pipeline/_actions/get-stage-gate-readiness';
import {
  GateRevertModal,
  type RevertProjectGateAction,
} from '../../../../../../../(npd)/_modals/gate-revert-modal';
import {
  ApprovalHistoryTimeline,
  type ApprovalHistoryEntry,
  type ApprovalHistoryLabels,
  type ApprovalHistoryState,
} from '../../_components/approval-history-timeline';

type ActiveModal = 'none' | 'advanceGate' | 'gateApproval' | 'gateRevert';

export type GateScreenData = {
  /** Checklist-panel project header. */
  panelProject: GateChecklistProject;
  /** Per-gate checklist views (G0..G4) in domain order. */
  gates: GateView[];
  /** Advance-modal project header + transition metadata + current-gate items. */
  advanceProject: AdvanceGateProject;
  advanceGateInfo: AdvanceGateInfo;
  advanceItems: AdvanceGateItem[];
  /** Server-authoritative readiness for the advance modal (evaluateStageGate). */
  advanceServerReadiness: AdvanceGateServerReadiness | null;
  /** Approval-modal project header (G3/G4 e-sign context). */
  approvalProject: GateApprovalProject;
  /** Server-authoritative readiness for the approval modal (formal_approve). */
  approvalServerReadiness: AdvanceGateServerReadiness | null;
  /** Approval-history timeline entries (DESC, newest first). */
  approvals: ApprovalHistoryEntry[];
  /** True once the project has reached the launched terminal state. */
  isTerminal: boolean;
  /** Hard blockers for handoff → launched (compliance criteria, etc.). */
  launchHardBlockers: GateHardBlocker[];
};

export type GateScreenLabels = {
  checklist: GateChecklistLabels;
  advance: AdvanceGateLabels;
  approvalHistory: ApprovalHistoryLabels;
};

export type GateScreenProps = {
  projectId: string;
  data: GateScreenData;
  labels: GateScreenLabels;
  /** Server-resolved checklist panel + timeline state (loading/empty/error/permission_denied/ready). */
  state?: PanelState;
  /** True when the caller may write checklist items (npd.gate.advance / view-write). */
  canWrite?: boolean;
  /** True when the caller may advance gates (npd.gate.advance). */
  canAdvance?: boolean;
  /** True when the caller may approve gates (npd.gate.approve). */
  canApprove?: boolean;
  /** True when the caller may revert a gate (npd.gate.advance — same permission as advance). */
  canRevert?: boolean;
  /** Server-Action adapters (owned by T-058 — injected by the RSC page, never authored here). */
  toggleGateChecklistItem?: ToggleGateChecklistItemAction;
  advanceProjectGate?: AdvanceProjectGateAction;
  approveProjectGate?: OnApproveGate;
  /** revertNpdGate adapter (owned by revert-npd-gate.ts — injected by the RSC page). */
  revertProjectGate?: RevertProjectGateAction;
};

/** Maps the panel state to the read-only timeline's state union. */
function toTimelineState(state: PanelState): ApprovalHistoryState {
  return state;
}

export function GateScreen({
  projectId,
  data,
  labels,
  state = 'ready',
  canWrite = false,
  canAdvance = false,
  canApprove = false,
  canRevert = false,
  toggleGateChecklistItem,
  advanceProjectGate,
  approveProjectGate,
  revertProjectGate,
}: GateScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeModal, setActiveModal] = React.useState<ActiveModal>('none');
  const [advanceGateInfo, setAdvanceGateInfo] = React.useState(data.advanceGateInfo);
  const [advanceItems, setAdvanceItems] = React.useState(data.advanceItems);
  const [advanceServerReadiness, setAdvanceServerReadiness] = React.useState(data.advanceServerReadiness);
  const [approvalProject, setApprovalProject] = React.useState(data.approvalProject);
  const [approvalServerReadiness, setApprovalServerReadiness] = React.useState(data.approvalServerReadiness);
  const [readinessLoading, setReadinessLoading] = React.useState(false);

  React.useEffect(() => {
    setAdvanceGateInfo(data.advanceGateInfo);
    setAdvanceItems(data.advanceItems);
    setAdvanceServerReadiness(data.advanceServerReadiness);
    setApprovalProject(data.approvalProject);
    setApprovalServerReadiness(data.approvalServerReadiness);
  }, [data.advanceGateInfo, data.advanceItems, data.advanceServerReadiness, data.approvalProject, data.approvalServerReadiness]);

  const refreshAdvanceReadiness = React.useCallback(async () => {
    setReadinessLoading(true);
    try {
      const result = await getStageGateReadiness({ projectId, purpose: 'advance' });
      if (result.ok) {
        setAdvanceGateInfo(result.data.gateInfo);
        setAdvanceItems(result.data.items);
        setAdvanceServerReadiness(result.data.readiness);
      }
    } finally {
      setReadinessLoading(false);
    }
  }, [projectId]);

  const refreshApprovalReadiness = React.useCallback(async () => {
    setReadinessLoading(true);
    try {
      const result = await getStageGateReadiness({ projectId, purpose: 'formal_approve' });
      if (result.ok) {
        const gateCode = result.data.formalApprovalGateCode ?? result.data.gateInfo.current;
        const pct = result.data.readiness.requiredTotal > 0
          ? Math.round((result.data.readiness.requiredDone / result.data.readiness.requiredTotal) * 100)
          : 0;
        setApprovalProject({
          id: projectId,
          code: data.approvalProject.code,
          name: data.approvalProject.name,
          gateCode: gateCode === 'G3' || gateCode === 'G4' ? gateCode : data.approvalProject.gateCode,
          requiredDone: result.data.readiness.requiredDone,
          requiredTotal: result.data.readiness.requiredTotal,
          pct,
        });
        setApprovalServerReadiness(result.data.readiness);
      }
    } finally {
      setReadinessLoading(false);
    }
  }, [data.approvalProject.code, data.approvalProject.gateCode, data.approvalProject.name, projectId]);

  React.useEffect(() => {
    if (activeModal === 'advanceGate') {
      void refreshAdvanceReadiness();
    } else if (activeModal === 'gateApproval') {
      void refreshApprovalReadiness();
    }
  }, [activeModal, refreshAdvanceReadiness, refreshApprovalReadiness]);

  // GateChecklistPanel asks to open a modal keyed by the gate's requiresApproval flag.
  const openModal = React.useCallback<OpenModalFn>((modal) => {
    setActiveModal(modal);
  }, []);

  // The panel's "Revert gate" ghost button opens the dedicated e-sign revert modal.
  const openRevertModal = React.useCallback<OpenRevertModalFn>(() => {
    setActiveModal('gateRevert');
  }, []);

  const closeModal = React.useCallback(() => setActiveModal('none'), []);

  // After a successful advance/approval the RSC loader re-runs so the timeline +
  // checklist reflect the new gate_approvals / gate state (AC3).
  const onMutated = React.useCallback(() => {
    closeModal();
    router.refresh();
  }, [closeModal, router]);

  // Advance is NOT just a mutation — it moves the project to a new stage, and the
  // stage is the route segment. Refreshing alone kept the user on the stage they
  // just left (PF-R04-14a). Revert/approve keep plain onMutated: they do not move
  // the project forward off the current route.
  const onAdvanced = React.useCallback(
    (advanced?: { currentStage?: string | null }) => {
      const href = pipelineStageHrefFromPathname(pathname, projectId, advanced?.currentStage);
      if (href) router.push(href);
      else closeModal();
      router.refresh();
    },
    [closeModal, pathname, projectId, router],
  );

  // Approve adapter: refresh the page after a successful decision (approve or reject).
  const handleApprove = React.useCallback<OnApproveGate>(
    async (input) => {
      if (!approveProjectGate) return { ok: false, error: 'FORBIDDEN' };
      const result = await approveProjectGate(input);
      if (result.ok) {
        router.refresh();
      } else if (result.error === 'BLOCKERS_PRESENT' && 'blockers' in result && result.blockers?.length) {
        const blockers = result.blockers.map((blocker, index) => ({
          id: blocker.itemId ?? `${blocker.code ?? 'BLOCKER'}-${index}`,
          text: blocker.itemText ?? blocker.message ?? blocker.code ?? 'Blocker',
          code: blocker.code,
        }));
        const requiredTotal = Math.max(approvalProject.requiredTotal, blockers.length);
        setApprovalServerReadiness({
          status: 'HARD_BLOCKED',
          blockers,
          softMissing: [],
          requiredDone: approvalProject.requiredDone,
          requiredTotal,
          canAdvance: false,
        });
      }
      return result;
    },
    [approveProjectGate, approvalProject.requiredDone, approvalProject.requiredTotal, router],
  );

  // Human label of the gate the project currently sits at
  // shown in the revert modal's warning copy.
  const currentGateView = data.gates.find((g) => g.isCurrent) ?? data.gates[data.gates.length - 1];
  const currentGateLabel = currentGateView
    ? `${currentGateView.key} — ${currentGateView.label}`
    : data.panelProject.currentGate;

  return (
    <div data-testid="gate-screen" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <GateChecklistPanel
          project={data.panelProject}
          gates={data.gates}
          labels={labels.checklist}
          canWrite={canWrite}
          canRevert={canRevert && !!revertProjectGate}
          state={state}
          isTerminal={data.isTerminal}
          launchHardBlockers={data.launchHardBlockers}
          toggleGateChecklistItem={toggleGateChecklistItem}
          openModal={openModal}
          openRevertModal={openRevertModal}
        />
      </div>

      <aside className="min-w-0">
        <ApprovalHistoryTimeline
          projectId={projectId}
          entries={data.approvals}
          labels={labels.approvalHistory}
          state={toTimelineState(state)}
        />
      </aside>

      {/* Modals mounted as siblings; route-level state controls open + which one. */}
      <AdvanceGateModal
        open={activeModal === 'advanceGate'}
        labels={labels.advance}
        project={data.advanceProject}
        gateInfo={advanceGateInfo}
        items={advanceItems}
        serverReadiness={advanceServerReadiness ?? undefined}
        state={readinessLoading ? 'loading' : canAdvance ? 'ready' : 'permission_denied'}
        advanceProjectGate={canAdvance ? advanceProjectGate : undefined}
        onAdvanced={onAdvanced}
        onESignRequired={() => setActiveModal('gateApproval')}
        onClose={closeModal}
        onReadinessBlocked={(readiness) => setAdvanceServerReadiness(readiness)}
      />

      <GateApprovalModal
        open={activeModal === 'gateApproval'}
        project={approvalProject}
        serverReadiness={approvalServerReadiness ?? undefined}
        status={readinessLoading ? 'loading' : canApprove ? 'ready' : 'forbidden'}
        onApprove={handleApprove}
        onClose={closeModal}
      />

      <GateRevertModal
        open={activeModal === 'gateRevert'}
        project={{
          id: data.panelProject.id,
          code: data.panelProject.code,
          name: data.panelProject.name,
          currentGateLabel,
        }}
        status={canRevert ? 'ready' : 'forbidden'}
        revertProjectGate={canRevert ? revertProjectGate : undefined}
        onReverted={onMutated}
        onClose={closeModal}
      />
    </div>
  );
}

export default GateScreen;
