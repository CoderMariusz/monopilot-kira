'use client';

/**
 * FA detail header ACTIONS BAR (client wiring).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:344-362
 *   (the FA detail header action buttons: "Delete FA" .btn-danger +
 *    "Build D365 →" .btn-primary, the latter disabled unless status=Complete with
 *    the title "FA must be Complete first (all 7 depts closed)".)
 *
 * WIRING: both buttons route to the EXISTING `?modal=` query-trigger host
 * (FaDetailModalHost, layout-owned) — the same pattern the right-panel quick
 * actions use. Delete opens the real `faDelete` confirm dialog (wired to the
 * `deleteFa` Server Action, T-029 DONE). "Build D365 →" opens the d365Build
 * modal, whose builder Server Action is DEFERRED — the modal shows a
 * "not yet available" deferred body; nothing is faked here.
 *
 * RBAC is resolved SERVER-SIDE by the layout and passed as plain booleans; a
 * lacking permission disables the button so the client can never open an action
 * the server would reject.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

export type FaHeaderActionsLabels = {
  deleteFa: string;
  d365Build: string;
  /** Hint when Delete is disabled (no permission). */
  deleteDisabledHint: string;
  /** Hint when Build D365 is disabled (not Complete / no permission). */
  d365DisabledHint: string;
};

export type FaHeaderActionsProps = {
  /** RBAC fallback for FA delete: npd.core.write, resolved server-side. */
  canDelete: boolean;
  /** RBAC npd.fa.build, resolved server-side. */
  canBuild: boolean;
  /** D365 Build requires the FA to be Complete (prototype line 347). */
  faComplete: boolean;
  labels: FaHeaderActionsLabels;
};

type ModalKey = 'faDelete' | 'd365Build';

export function FaHeaderActions({ canDelete, canBuild, faComplete, labels }: FaHeaderActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function openModal(key: ModalKey) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('modal', key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const deleteDisabled = !canDelete;
  // D365 build is gated on BOTH the build permission AND status=Complete
  // (prototype line 347). When the builder action ships, the modal body will
  // surface "not yet available"; until then the button stays a real, gated
  // launcher — never a faked build.
  const d365Disabled = !canBuild || !faComplete;

  return (
    <div
      style={{ display: 'flex', gap: 8 }}
      data-testid="fa-header-actions"
      data-prototype-anchor="npd/fa-screens.jsx:344-362"
    >
      <Button
        type="button"
        className="btn-danger"
        disabled={deleteDisabled}
        aria-disabled={deleteDisabled}
        data-testid="fa-header-action-delete"
        title={deleteDisabled ? labels.deleteDisabledHint : labels.deleteFa}
        onClick={() => openModal('faDelete')}
      >
        {labels.deleteFa}
      </Button>
      <Button
        type="button"
        className="btn-primary"
        disabled={d365Disabled}
        aria-disabled={d365Disabled}
        data-testid="fa-header-action-d365"
        title={d365Disabled ? labels.d365DisabledHint : labels.d365Build}
        onClick={() => openModal('d365Build')}
      >
        {labels.d365Build}
      </Button>
    </div>
  );
}

export default FaHeaderActions;
