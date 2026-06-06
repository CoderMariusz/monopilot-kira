'use client';

/**
 * T-138 — FA right-panel quick actions (client wiring).
 *
 * The merged T-137 FaRightPanel is an async RSC and cannot carry client click
 * handlers; this small client wrapper renders the Dept Close / D365 Build action
 * buttons and routes them to the established `?modal=` query-trigger pattern
 * (the same pattern T-035/T-121 use for brief modals). Opening a modal is a
 * client-side `router.push(?modal=deptClose|d365Build)`; the FA modal host
 * (mounted by the layout) turns that URL state into the right dialog.
 *
 * RBAC is resolved SERVER-SIDE by the layout and passed down as `canDeptClose`
 * (npd.fa.close). The D365 Build button additionally requires the FA to be
 * Complete (prototype lines 347-349) — both gates disable the button so the
 * client can never open an action the server would reject.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:344-362
 *   (the FA detail header "Delete FA" / "Build D365 →" launchers — here surfaced
 *    as the right-panel quick-action affordances per the task contract).
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

export type FaRightPanelActionsLabels = {
  actions: string;
  deptClose: string;
  d365Build: string;
  /** Hint shown when an action is disabled (no permission / not Complete). */
  deptCloseDisabledHint: string;
  d365DisabledHint: string;
};

export type FaRightPanelActionsProps = {
  /** RBAC npd.fa.close, resolved server-side. */
  canDeptClose: boolean;
  /** RBAC npd.fa.build (or read fallback), resolved server-side. */
  canBuild: boolean;
  /** D365 Build requires the FA to be Complete (prototype line 347). */
  faComplete: boolean;
  labels: FaRightPanelActionsLabels;
};

/** Modal keys consumed by the FA modal host (URL `?modal=`). */
export type FaModalKey = 'deptClose' | 'd365Build';

export function FaRightPanelActions({
  canDeptClose,
  canBuild,
  faComplete,
  labels,
}: FaRightPanelActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function openModal(key: FaModalKey) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('modal', key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const deptCloseDisabled = !canDeptClose;
  const d365Disabled = !canBuild || !faComplete;

  return (
    <div className="grid gap-2" data-slot="fa-right-panel-actions">
      <Button
        type="button"
        className="btn-secondary btn-sm justify-center"
        disabled={deptCloseDisabled}
        aria-disabled={deptCloseDisabled}
        data-testid="fa-right-panel-action-deptClose"
        title={deptCloseDisabled ? labels.deptCloseDisabledHint : labels.deptClose}
        onClick={() => openModal('deptClose')}
      >
        {labels.deptClose}
      </Button>
      <Button
        type="button"
        className="btn-primary btn-sm justify-center"
        disabled={d365Disabled}
        aria-disabled={d365Disabled}
        data-testid="fa-right-panel-action-d365Build"
        title={d365Disabled ? labels.d365DisabledHint : labels.d365Build}
        onClick={() => openModal('d365Build')}
      >
        {labels.d365Build}
      </Button>
    </div>
  );
}

export default FaRightPanelActions;
