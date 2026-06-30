'use client';

/**
 * BOM co-product row actions (edit + delete) — client island.
 *
 * Owner-reported gap: once a co-product / by-product was added to a BOM there was
 * NO way to edit or remove it (the Co-products tab was add-only → dead-end). This
 * island renders a pencil (edit) + trash (delete) pair next to each co-product row
 * in the BOM detail Co-products tab — the 1:1 mirror of the Components-tab
 * `BomLineRowActions`. Edit opens a small modal prefilled with quantity / uom /
 * allocation % / expected yield %; delete opens a confirm. Both wire to the real
 * updateBomCoProduct / deleteBomCoProduct Server Actions and router.refresh() on
 * success.
 *
 * Editability is server-authoritative (BOM_LINE_EDITABLE_STATUSES = draft |
 * in_review). On a non-editable (approved / active / superseded / archived)
 * version the buttons render DISABLED with an honest title; the server refuses
 * with `bom_not_editable` regardless. forbidden / bom_not_editable / validation
 * failures (e.g. V-TEC-12 allocation > 100) surface INLINE via role="alert" — the
 * action result is `{ ok: false, error }`, never a throw.
 *
 * Labels are resolved with the established t.has-guarded fallback (keys staged for
 * central application under technical.bom.coProductRowActions) so a missing bundle
 * key never throws.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';

import { deleteBomCoProduct, updateBomCoProduct } from '../_actions/co-product-actions';

export type BomCoProductRowActionTarget = {
  bomHeaderId: string;
  coProductId: string;
  coProductItemId: string;
  quantity: string;
  uom: string;
  allocationPct: string;
  expectedYieldPct: string | null;
  isByproduct: boolean;
};

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

// Local a11y-complete Dialog (no Radix) — same convention as bom-line-row-actions.tsx,
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
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
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

export function BomCoProductRowActions({
  target,
  editable,
  canEdit,
}: {
  target: BomCoProductRowActionTarget;
  /** Whether the owning version is in an editable status (draft | in_review). */
  editable: boolean;
  /** Server-resolved RBAC (technical.bom.create); never client-trusted. */
  canEdit: boolean;
}) {
  const t = useTranslations('technical.bom.coProductRowActions');
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
  const [allocation, setAllocation] = React.useState(target.allocationPct);
  const [expectedYield, setExpectedYield] = React.useState(target.expectedYieldPct ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Reset the edit form to the row's persisted values whenever it (re)opens.
  React.useEffect(() => {
    if (!editOpen) return;
    setQty(target.quantity);
    setUom(target.uom);
    setAllocation(target.allocationPct);
    setExpectedYield(target.expectedYieldPct ?? '');
    setError(null);
  }, [editOpen, target.quantity, target.uom, target.allocationPct, target.expectedYieldPct]);

  const qtyNum = Number(qty);
  const qtyInvalid = qty.trim().length === 0 || !Number.isFinite(qtyNum) || qtyNum <= 0;
  const uomInvalid = uom.trim().length === 0;
  const allocationNum = Number(allocation);
  const allocationInvalid =
    allocation.trim().length === 0 || !Number.isFinite(allocationNum) || allocationNum < 0 || allocationNum > 100;
  const yieldTrimmed = expectedYield.trim();
  const yieldNum = Number(yieldTrimmed);
  const yieldInvalid = yieldTrimmed.length > 0 && (!Number.isFinite(yieldNum) || yieldNum < 0 || yieldNum > 100);
  const canSave = !qtyInvalid && !uomInvalid && !allocationInvalid && !yieldInvalid && !pending;

  function mapError(err: string, fallbackKey: 'saveError' | 'deleteError'): string {
    if (err === 'forbidden') return tg('forbidden', 'You do not have permission to edit BOM co-products.');
    if (err === 'bom_not_editable') {
      return tg('notEditable', 'This BOM version is approved or active — its co-products can no longer be edited.');
    }
    if (err === 'validation_failed') {
      return tg('allocationOver', 'The non-by-product allocation across this BOM cannot exceed 100%.');
    }
    if (err === 'invalid_input') {
      return tg('invalidInput', 'Check the quantity, unit, allocation and yield values and try again.');
    }
    return tg(
      fallbackKey,
      fallbackKey === 'saveError'
        ? 'Unable to update this co-product. Please try again.'
        : 'Unable to remove this co-product. Please try again.',
    );
  }

  function onSave() {
    if (!canSave) return;
    setError(null);
    startTransition(async () => {
      const res = await updateBomCoProduct({
        bomHeaderId: target.bomHeaderId,
        coProductId: target.coProductId,
        quantity: qty.trim(),
        uom: uom.trim(),
        allocationPct: allocation.trim(),
        expectedYieldPct: yieldTrimmed.length > 0 ? yieldTrimmed : undefined,
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
      const res = await deleteBomCoProduct({ bomHeaderId: target.bomHeaderId, coProductId: target.coProductId });
      if (res.ok) {
        setDeleteOpen(false);
        router.refresh();
      } else {
        setError(mapError(res.error, 'deleteError'));
      }
    });
  }

  const notEditableTitle = tg(
    'notEditable',
    'This BOM version is approved or active — its co-products can no longer be edited.',
  );

  if (!canEdit) return null;

  return (
    <div
      className="flex items-center justify-end gap-1"
      data-testid="bom-coproduct-row-actions"
      aria-label={tg('rowActionsLabel', 'Row actions')}
    >
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        data-testid="bom-coproduct-edit"
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
        data-testid="bom-coproduct-delete"
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
          title={tg('editTitle', 'Edit co-product')}
          subtitle={tg('editSubtitle', 'Update the quantity, unit, allocation or yield for {item}.', {
            item: target.coProductItemId,
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
              <label>{tg('uom', 'Unit of measure')}<span className="req">*</span></label>
              <input
                className="form-input font-mono"
                aria-label={tg('uom', 'Unit of measure')}
                value={uom}
                onChange={(event) => setUom(event.currentTarget.value)}
              />
              {uomInvalid ? (
                <span className="ff-error" role="alert">{tg('uomInvalid', 'Enter a unit of measure.')}</span>
              ) : null}
            </div>
            <div className="ff" style={{ marginBottom: 0 }}>
              <label>{tg('allocationPct', 'Allocation %')}<span className="req">*</span></label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="form-input"
                aria-label={tg('allocationPct', 'Allocation %')}
                value={allocation}
                onChange={(event) => setAllocation(event.currentTarget.value)}
              />
              {allocationInvalid ? (
                <span className="ff-error" role="alert">{tg('allocationInvalid', 'Enter an allocation between 0 and 100.')}</span>
              ) : null}
            </div>
            <div className="ff" style={{ marginBottom: 0 }}>
              <label>{tg('expectedYieldPct', 'Expected yield %')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="form-input"
                aria-label={tg('expectedYieldPct', 'Expected yield %')}
                placeholder={tg('expectedYieldPlaceholder', 'Optional')}
                value={expectedYield}
                onChange={(event) => setExpectedYield(event.currentTarget.value)}
              />
              {yieldInvalid ? (
                <span className="ff-error" role="alert">{tg('expectedYieldInvalid', 'Enter a yield between 0 and 100.')}</span>
              ) : null}
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
          title={tg('deleteTitle', 'Remove co-product')}
          footer={
            <>
              <Button type="button" className="btn-secondary" onClick={() => setDeleteOpen(false)}>
                {tg('cancel', 'Cancel')}
              </Button>
              <Button
                type="button"
                className="btn-danger"
                data-testid="bom-coproduct-delete-confirm"
                disabled={pending}
                onClick={onDelete}
              >
                {pending ? tg('deleting', 'Removing…') : tg('deleteAction', 'Remove co-product')}
              </Button>
            </>
          }
        >
          <p className="text-sm">
            {tg('deleteConfirm', 'Remove {item} from this BOM version? This cannot be undone.', {
              item: target.coProductItemId,
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

export default BomCoProductRowActions;
