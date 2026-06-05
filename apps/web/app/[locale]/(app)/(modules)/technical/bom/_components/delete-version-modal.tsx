'use client';

/**
 * T-042 — UI: TEC-082 BOM Version Delete modal (type-to-confirm).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:245-266
 *     (MODAL-13 DeleteBomVersionModal — type-to-confirm + irreversible warning)
 *
 * Destructive, type-to-confirm delete of a NON-active draft BOM version. The
 * Delete button is doubly guarded:
 *   1) snapshot guard — if any bom_snapshots reference this version (snapshotCount
 *      > 0) the action is BLOCKED (a Planning WO snapshot would be orphaned). The
 *      count is resolved server-side by the caller (out of scope here, AC-aligned
 *      "Out of scope: Server endpoint snapshots-count"); we only render the guard.
 *   2) status guard — active/technical_approved versions are never deletable
 *      (`deletable` false) — released rows are never mutated/removed (red-line).
 *   3) type-to-confirm — the user must type the exact version label (e.g. "v7").
 *
 * Translated from the prototype `window.Modal` to the shared `@monopilot/ui/Modal`
 * (Radix Dialog — focus trap + ESC/outside-close by default). `dismissible={false}`
 * mirrors the prototype. No inline styles for layout (Tailwind), no raw <select>,
 * FG canonical (no FA labels). Every visible string is an injected i18n label.
 *
 * The actual DELETE Server Action is OWNED elsewhere (out of scope): the caller
 * passes `onConfirm` and we fire it only when the guards pass.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';

export type DeleteVersionLabels = {
  title: string;
  subtitle: string;
  /** Irreversible warning copy. `{version}` is interpolated to the version label. */
  warning: string;
  /** Blocking notice shown when snapshots reference the version. `{count}` interpolated. */
  blockedBySnapshots: string;
  /** Blocking notice shown when the version is active/approved (not a draft). */
  blockedByStatus: string;
  /** "Type {version} to confirm" field label. `{version}` interpolated. */
  confirmLabel: string;
  cancel: string;
  delete: string;
};

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export type DeleteBomVersionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The version label the user must type, e.g. "v7". */
  versionLabel: string;
  /** Number of bom_snapshots referencing this version (server-resolved). > 0 blocks. */
  snapshotCount: number;
  /** Whether the version's status permits deletion (draft only). */
  deletable: boolean;
  labels: DeleteVersionLabels;
  /** Fired only when all guards pass and the typed value matches. */
  onConfirm: () => void;
};

export function DeleteBomVersionModal({
  open,
  onOpenChange,
  versionLabel,
  snapshotCount,
  deletable,
  labels,
  onConfirm,
}: DeleteBomVersionModalProps) {
  const [typed, setTyped] = React.useState('');

  // Reset the typed confirmation whenever the modal closes (prototype parity:
  // `useEffect(() => { if (!open) setTyped(""); }, [open])`).
  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const blockedBySnapshots = snapshotCount > 0;
  const blockedByStatus = !deletable;
  const blocked = blockedBySnapshots || blockedByStatus;
  const matches = typed === versionLabel;
  const canDelete = !blocked && matches;

  function handleConfirm() {
    if (!canDelete) return;
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      dismissible={false}
      modalId="delete_bom_version_modal"
    >
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <p className="mb-3 muted" style={{ fontSize: 12 }}>{labels.subtitle}</p>

        {blockedByStatus ? (
          <div role="alert" data-testid="delete-version-blocked-status" className="alert alert-amber mb-3">
            <div className="alert-title">⚠ {labels.blockedByStatus}</div>
          </div>
        ) : null}

        {blockedBySnapshots ? (
          <div role="alert" data-testid="delete-version-blocked-snapshots" className="alert alert-red mb-3">
            <div className="alert-title">
              ⚠ {interpolate(labels.blockedBySnapshots, { count: snapshotCount, version: versionLabel })}
            </div>
          </div>
        ) : null}

        <div role="alert" className="alert alert-red mb-3">
          <div className="alert-title">⚠ {interpolate(labels.warning, { version: versionLabel })}</div>
        </div>

        <div className="ff">
          <label htmlFor="delete-version-confirm">
            {interpolate(labels.confirmLabel, { version: versionLabel })}
            <span className="req">*</span>
          </label>
          <input
            id="delete-version-confirm"
            data-testid="delete-version-confirm-input"
            value={typed}
            disabled={blocked}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={versionLabel}
            className="form-input w-full font-mono"
            autoComplete="off"
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="button"
          data-testid="delete-version-confirm-button"
          className="btn-danger btn-sm"
          disabled={!canDelete}
          aria-disabled={!canDelete}
          onClick={handleConfirm}
        >
          {labels.delete}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default DeleteBomVersionModal;
