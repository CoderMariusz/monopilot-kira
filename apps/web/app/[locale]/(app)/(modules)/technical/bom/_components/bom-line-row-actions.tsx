'use client';

/**
 * BOM component-line row actions (reorder + edit + delete) — client island.
 *
 * Owner-reported gap: once a component was added to a BOM there was NO way to
 * edit or remove it. This island renders move-up / move-down / pencil (edit) /
 * trash (delete) next to each component row in the BOM detail Components tab.
 * Edit opens a small modal prefilled with qty / uom / scrap % / manufacturing
 * operation; delete opens a confirm. All wire to the real moveBomLine /
 * updateBomLine / deleteBomLine Server Actions and router.refresh() on success.
 *
 * PF-R06-03: scrap % was write-once (settable when adding a component, frozen
 * forever after) even though it inflates the WO requirement. It is now editable
 * here, with the honest 2-decimal precision the numeric(5,2) column actually
 * stores — a third decimal is refused, not silently rounded away.
 * PF-R06-04: the reorder controls; ordering is bom_lines.line_no, server-side.
 *
 * Editability is server-authoritative (BOM_LINE_EDITABLE_STATUSES = draft |
 * in_review). On a non-editable (approved / active / superseded / archived)
 * version the buttons render DISABLED with an honest title; the server refuses
 * with `bom_not_editable` regardless. forbidden / bom_not_editable surface inline.
 *
 * The manufacturing operation is OPTIONAL here, matching the nullable column and the
 * server contract. It was marked required, which made every NPD/generator-authored
 * line (operation NULL) permanently unsavable — even for a scrap-only edit.
 *
 * Labels are resolved with the established t.has-guarded fallback so a missing bundle
 * key never throws, but the `technical.bom.rowActions` namespace now exists in all four
 * runtime bundles — pl/ro/uk render their own language, not the English fallback.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';

import { deleteBomLine, moveBomLine, updateBomLine } from '../_actions/line-actions';
import { BOM_SCRAP_WARN_PCT, isScrapPrecisionValid } from '../_lib/scrap-precision';
import { listManufacturingOperations } from '../../../../../../../actions/reference/manufacturing-ops/list';

export type BomLineRowActionTarget = {
  bomHeaderId: string;
  lineId: string;
  componentCode: string;
  quantity: string;
  uom: string;
  scrapPct: string;
  manufacturingOperationName: string | null;
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

export function BomLineRowActions({
  target,
  editable,
  canEdit,
  isFirst = false,
  isLast = false,
}: {
  target: BomLineRowActionTarget;
  /** Whether the owning version is in an editable status (draft | in_review). */
  editable: boolean;
  /** Server-resolved RBAC (technical.bom.create); never client-trusted. */
  canEdit: boolean;
  /** First row in line_no order — nothing to move up into. */
  isFirst?: boolean;
  /** Last row in line_no order — nothing to move down into. */
  isLast?: boolean;
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
  const [scrap, setScrap] = React.useState(target.scrapPct);
  const [operationName, setOperationName] = React.useState(target.manufacturingOperationName ?? '');
  const [operations, setOperations] = React.useState<Array<{ value: string; label: string }>>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!editOpen) return;
    let cancelled = false;
    void listManufacturingOperations().then((result) => {
      if (cancelled || !result.ok) return;
      setOperations(result.data.map((op) => ({ value: op.operation_name, label: op.operation_name })));
    });
    return () => {
      cancelled = true;
    };
  }, [editOpen]);

  // Reset the edit form to the row's persisted values whenever it (re)opens.
  React.useEffect(() => {
    if (!editOpen) return;
    setQty(target.quantity);
    setUom(target.uom);
    setScrap(target.scrapPct);
    setOperationName(target.manufacturingOperationName ?? '');
    setError(null);
  }, [editOpen, target.quantity, target.uom, target.scrapPct, target.manufacturingOperationName]);

  const qtyNum = Number(qty);
  const qtyInvalid = qty.trim().length === 0 || !Number.isFinite(qtyNum) || qtyNum <= 0;
  const scrapNum = Number(scrap);
  const scrapOutOfRange =
    scrap.trim().length === 0 || !Number.isFinite(scrapNum) || scrapNum < 0 || scrapNum > 100;
  const scrapTooPrecise = !scrapOutOfRange && !isScrapPrecisionValid(scrapNum);
  const scrapInvalid = scrapOutOfRange || scrapTooPrecise;
  // NO operation-required gate. `bom_lines.manufacturing_operation_name` is nullable
  // and the server contract says so explicitly ("Null/empty names are allowed
  // (optional field)" — findUnknownBomManufacturingOperationName in _actions/shared.ts);
  // UpdateBomLineInput types it `.nullish()` and updateBomLine maps '' to NULL. A draft
  // authored by NPD/the generator arrives with that column NULL, so requiring it here
  // permanently disabled Save and made those lines uneditable — a user could not even
  // change the scrap %. If the operation is ever to become mandatory, the server schema
  // and every creation path have to enforce it first.
  const canSave = !qtyInvalid && !scrapInvalid && !pending;

  const FAILURE_FALLBACKS = {
    saveError: 'Unable to update this component line. Please try again.',
    deleteError: 'Unable to remove this component line. Please try again.',
    moveError: 'Unable to reorder this component line. Please try again.',
  } as const;

  function mapError(err: string, fallbackKey: keyof typeof FAILURE_FALLBACKS): string {
    if (err === 'forbidden') return tg('forbidden', 'You do not have permission to edit BOM components.');
    if (err === 'bom_not_editable') {
      return tg('notEditable', 'This BOM version is approved or active — its components can no longer be edited.');
    }
    return tg(fallbackKey, FAILURE_FALLBACKS[fallbackKey]);
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
        scrapPct: scrapNum,
        manufacturingOperationName: operationName.trim(),
      });
      if (res.ok) {
        setEditOpen(false);
        router.refresh();
      } else {
        setError(mapError(res.error, 'saveError'));
      }
    });
  }

  function onMove(direction: 'up' | 'down') {
    setError(null);
    startTransition(async () => {
      const res = await moveBomLine({ bomHeaderId: target.bomHeaderId, lineId: target.lineId, direction });
      if (res.ok) router.refresh();
      else setError(mapError(res.error, 'moveError'));
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
      {/* PF-R06-04 — reorder. Rendered disabled at the ends rather than removed so the
          action column keeps a stable width and focus order, matching how edit/delete
          already render disabled on a non-editable version. */}
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        data-testid="bom-line-move-up"
        disabled={!editable || isFirst || pending}
        title={editable ? tg('moveUp', 'Move up') : notEditableTitle}
        aria-label={tg('moveUpFor', 'Move {component} up', { component: target.componentCode })}
        onClick={() => onMove('up')}
      >
        ↑
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        data-testid="bom-line-move-down"
        disabled={!editable || isLast || pending}
        title={editable ? tg('moveDown', 'Move down') : notEditableTitle}
        aria-label={tg('moveDownFor', 'Move {component} down', { component: target.componentCode })}
        onClick={() => onMove('down')}
      >
        ↓
      </button>
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

      {/* A reorder failure has no dialog to land in — surface it on the row itself
          rather than swallowing it. */}
      {error && !editOpen && !deleteOpen ? (
        <span role="alert" data-testid="bom-line-row-error" className="ff-error" style={{ fontSize: 11 }}>
          {error}
        </span>
      ) : null}

      {editOpen ? (
        <Dialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title={tg('editTitle', 'Edit component line')}
          subtitle={tg('editSubtitle', 'Update the quantity, unit of measure, scrap % or manufacturing operation for {component}.', {
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
            {/* PF-R06-03 — scrap % is editable here, not only when the component is
                first added. step=0.01 matches the numeric(5,2) column exactly. */}
            <div className="ff" style={{ marginBottom: 0 }}>
              <label>{tg('scrapPct', 'Scrap %')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="form-input"
                data-testid="bom-line-scrap"
                aria-label={tg('scrapPct', 'Scrap %')}
                value={scrap}
                onChange={(event) => setScrap(event.currentTarget.value)}
              />
              {scrapOutOfRange ? (
                <span className="ff-error" role="alert">
                  {tg('scrapInvalid', 'Enter a scrap % between 0 and 100.')}
                </span>
              ) : scrapTooPrecise ? (
                <span className="ff-error" role="alert" data-testid="bom-line-scrap-precision-error">
                  {tg('scrapPrecision', 'Scrap % supports at most 2 decimal places.')}
                </span>
              ) : scrapNum >= BOM_SCRAP_WARN_PCT ? (
                <span className="muted" style={{ fontSize: 12 }} role="status" data-warning-code="V-TEC-11">
                  {tg('scrapHigh', 'Scrap of {value}% is unusually high (V-TEC-11).', { value: scrap })}
                </span>
              ) : null}
            </div>
            {/* Optional by contract — no `req` marker, no blocking error. */}
            <div className="ff" style={{ marginBottom: 0 }}>
              <label>{tg('manufacturingOperation', 'Manufacturing operation')}</label>
              <Select
                value={operationName}
                onValueChange={setOperationName}
                options={operations}
                placeholder={tg('manufacturingOperationPlaceholder', 'Select operation')}
                aria-label={tg('manufacturingOperation', 'Manufacturing operation')}
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
