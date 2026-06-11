'use client';

/**
 * BOM component-line row actions (edit + delete) — client island.
 *
 * Owner-reported gap: once a component was added to a BOM there was NO way to
 * edit or remove it. This island renders a pencil (edit) + trash (delete) pair
 * next to each component row in the BOM detail Components tab. Edit opens a small
 * modal prefilled with qty / uom / notes; delete opens a confirm. Both wire to the
 * real updateBomLine / deleteBomLine Server Actions and router.refresh() on
 * success.
 *
 * Editability is server-authoritative (BOM_LINE_EDITABLE_STATUSES = draft |
 * in_review). On a non-editable (approved / active / superseded / archived)
 * version the buttons render DISABLED with an honest title; the server refuses
 * with `bom_not_editable` regardless. forbidden / bom_not_editable surface inline.
 *
 * Labels are resolved with the established t.has-guarded fallback (keys staged in
 * _meta/i18n-staging/bom-row-actions.json) so a missing bundle key never throws.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';

import { deleteBomLine, updateBomLine } from '../_actions/line-actions';

export type BomLineRowActionTarget = {
  bomHeaderId: string;
  lineId: string;
  componentCode: string;
  quantity: string;
  uom: string;
  notes: string | null;
};

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

// Local a11y-complete Dialog (no Radix) — same convention as bom-edit-dialog.tsx,
// which avoids the dual-React useRef crash under jsdom.
function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-box outline-none"
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {subtitle ? <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{subtitle}</p> : null}
          </div>
          <button type="button" aria-label="Close" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export function BomLineRowActions({
  target,
  editable,
  canEdit,
}: {
  target: BomLineRowActionTarget;
  /** Whether the owning version is in an editable status (draft | in_review). */
  editable: boolean;
  /** Server-resolved RBAC (technical.bom.create); never client-trusted. */
  canEdit: boolean;
}) {
  const t = useTranslations('technical.bom.rowActions');
  const router = useRouter();

  const tg = React.useCallback(
    (key: string, fallback: string, vars?: Record<string, string | number>): string =>
      t.has(key) ? t(key, vars) : interpolate(fallback, vars ?? {}),
    [t],
  );

  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [qty, setQty] = React.useState(target.quantity);
  const [uom, setUom] = React.useState(target.uom);
  const [notes, setNotes] = React.useState(target.notes ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Reset the edit form to the row's persisted values whenever it (re)opens.
  React.useEffect(() => {
    if (!editOpen) return;
    setQty(target.quantity);
    setUom(target.uom);
    setNotes(target.notes ?? '');
    setError(null);
  }, [editOpen, target.quantity, target.uom, target.notes]);

  const qtyNum = Number(qty);
  const qtyInvalid = qty.trim().length === 0 || !Number.isFinite(qtyNum) || qtyNum <= 0;
  const canSave = !qtyInvalid && !pending;

  function mapError(err: string, fallbackKey: 'saveError' | 'deleteError'): string {
    if (err === 'forbidden') return tg('forbidden', 'You do not have permission to edit BOM components.');
    if (err === 'bom_not_editable') {
      return tg('notEditable', 'This BOM version is approved or active — its components can no longer be edited.');
    }
    return tg(fallbackKey, fallbackKey === 'saveError' ? 'Unable to update this component line. Please try again.' : 'Unable to remove this component line. Please try again.');
  }

  function onSave() {
    if (!canSave) return;
    setError(null);
    startTransition(async () => {
      // qty stays a DECIMAL STRING on the wire (no float coercion at the form seam).
      const res = await updateBomLine({
        bomHeaderId: target.bomHeaderId,
        lineId: target.lineId,
        qty: qty.trim(),
        uom: uom.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (res.ok) {
        setEditOpen(false);
        router.refresh();
      } else {
        setError(mapError(res.error, 'saveError'));
      }
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteBomLine({ bomHeaderId: target.bomHeaderId, lineId: target.lineId });
      if (res.ok) {
        setDeleteOpen(false);
        router.refresh();
      } else {
        setError(mapError(res.error, 'deleteError'));
      }
    });
  }

  const notEditableTitle = tg('notEditable', 'This BOM version is approved or active — its components can no longer be edited.');

  if (!canEdit) return null;

  return (
    <div
      className="flex items-center justify-end gap-1"
      data-testid="bom-line-row-actions"
      aria-label={tg('rowActionsLabel', 'Row actions')}
    >
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        data-testid="bom-line-edit"
        disabled={!editable}
        title={editable ? tg('edit', 'Edit') : notEditableTitle}
        aria-label={tg('edit', 'Edit')}
        onClick={() => setEditOpen(true)}
      >
        ✎
      </button>
      <button
        type="button"
        className="btn btn-danger btn-icon"
        data-testid="bom-line-delete"
        disabled={!editable}
        title={editable ? tg('delete', 'Delete') : notEditableTitle}
        aria-label={tg('delete', 'Delete')}
        onClick={() => setDeleteOpen(true)}
      >
        🗑
      </button>

      {editOpen ? (
        <Dialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title={tg('editTitle', 'Edit component line')}
          subtitle={tg('editSubtitle', 'Update the quantity, unit of measure or notes for {component}.', {
            component: target.componentCode,
          })}
          footer={
            <>
              <Button type="button" className="btn-secondary" onClick={() => setEditOpen(false)}>
                {tg('cancel', 'Cancel')}
              </Button>
              <Button type="button" className="btn-primary" disabled={!canSave} onClick={onSave}>
                {pending ? tg('saving', 'Saving…') : tg('save', 'Save changes')}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="ff" style={{ marginBottom: 0 }}>
              <label>{tg('quantity', 'Quantity')}<span className="req">*</span></label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="form-input"
                aria-label={tg('quantity', 'Quantity')}
                value={qty}
                onChange={(event) => setQty(event.currentTarget.value)}
              />
              {qtyInvalid ? (
                <span className="ff-error" role="alert">{tg('quantityInvalid', 'Enter a quantity greater than zero.')}</span>
              ) : null}
            </div>
            <div className="ff" style={{ marginBottom: 0 }}>
              <label>{tg('uom', 'Unit of measure')}</label>
              <input
                className="form-input font-mono"
                aria-label={tg('uom', 'Unit of measure')}
                value={uom}
                onChange={(event) => setUom(event.currentTarget.value)}
              />
            </div>
            <div className="ff" style={{ marginBottom: 0 }}>
              <label>{tg('notes', 'Notes')}</label>
              <input
                className="form-input"
                aria-label={tg('notes', 'Notes')}
                placeholder={tg('notesPlaceholder', 'Optional line note')}
                value={notes}
                onChange={(event) => setNotes(event.currentTarget.value)}
              />
            </div>
            {error ? (
              <div role="alert" className="alert alert-red">
                <div className="alert-title">{error}</div>
              </div>
            ) : null}
          </div>
        </Dialog>
      ) : null}

      {deleteOpen ? (
        <Dialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          title={tg('deleteTitle', 'Remove component line')}
          footer={
            <>
              <Button type="button" className="btn-secondary" onClick={() => setDeleteOpen(false)}>
                {tg('cancel', 'Cancel')}
              </Button>
              <Button
                type="button"
                className="btn-danger"
                data-testid="bom-line-delete-confirm"
                disabled={pending}
                onClick={onDelete}
              >
                {pending ? tg('deleting', 'Removing…') : tg('deleteAction', 'Remove component')}
              </Button>
            </>
          }
        >
          <p className="text-sm">
            {tg('deleteConfirm', 'Remove {component} from this BOM version? This cannot be undone.', {
              component: target.componentCode,
            })}
          </p>
          {error ? (
            <div role="alert" className="alert alert-red mt-3">
              <div className="alert-title">{error}</div>
            </div>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}

export default BomLineRowActions;
