'use client';

/**
 * P2-PLANNING — Desktop "Receive" a Purchase Order line into stock.
 *
 * Prototype parity: the prototype PO detail (po-screens.jsx:204-251) shows a
 * per-line "Received N / Qty" column + a status-action group, but has NO desktop
 * receive surface (receiving lives in the scanner GRN flow). This modal is an
 * ADDITIVE desktop affordance (documented deviation) so a non-scanner user can
 * receive a line; its form/footer mirror the established PO line/edit modals
 * (modals.jsx:182-219 — Modal.Header + grid fields + Modal.Footer cancel/submit).
 *
 * Contract (imported, never authored): receivePoLineDesktop({ poLineId, qty,
 * batchNumber?, bestBefore?, toLocationId?, warehouseId? }). RBAC
 * (warehouse.grn.receive) is enforced server-side; this view never trusts a
 * client flag. The action NEVER throws — it returns a discriminated result; we
 * map every `{ ok:false, error }` to an inline role="alert" (special-casing
 * over_receive_cap + no_warehouse) and surface the new GRN/LP number on success.
 *
 * Destination location: optional. Populated from the shared org-scoped
 * listLocations read (warehouse.inventory.read). When the loader returns nothing
 * or fails (no permission / no locations) the picker is omitted and the action
 * falls back to the org-default warehouse server-side.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, type SelectOption } from '@monopilot/ui/Select';

import type { DesktopReceiveInput, DesktopReceiveResult } from '../_actions/receive-po-line.types';

/** Numeric with up to 3 decimals (mirrors the line modal's qty pattern). */
const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A warehouse-grouped location option for the destination picker. */
export type ReceiveLocationOption = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  warehouseCode: string | null;
  warehouseName: string | null;
};

export type ReceivePoLineLabels = {
  title: string;
  /** Line summary template, `{item}` interpolated. */
  forLine: string;
  qtyLabel: string;
  qtyHelp: string;
  qtyPlaceholder: string;
  batchLabel: string;
  batchPlaceholder: string;
  bestBeforeLabel: string;
  locationLabel: string;
  /** Placeholder = "use default warehouse". */
  locationPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  /** Success line, `{grn}` + `{lp}` + `{qty}` + `{uom}` interpolated. */
  success: string;
  /** Extra line shown when the receipt exceeded the ordered qty (overReceived). */
  overReceivedNote: string;
  /** Extra line shown when a QC inspection was raised. */
  qcRaisedNote: string;
  errors: {
    /** Local form validation. */
    qtyRequired: string;
    forbidden: string;
    not_found: string;
    invalid_qty: string;
    over_receive_cap: string;
    no_warehouse: string;
    invalid_location: string;
    invalid_state: string;
    wac_unsupported_currency: string;
    error: string;
  };
};

/** The line being received (subset of PoDetailLine). */
export type ReceiveLineSeed = {
  id: string;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
  receivedQty: string;
};

export type ReceivePoLineModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ReceivePoLineLabels;
  line: ReceiveLineSeed | null;
  /** Optional org-scoped, warehouse-grouped locations for the destination picker. */
  locations?: ReceiveLocationOption[];
  receivePoLineAction: (input: DesktopReceiveInput) => Promise<DesktopReceiveResult>;
  onReceived: () => void;
};

function remaining(line: ReceiveLineSeed): string {
  const ordered = Number(line.qty);
  const received = Number(line.receivedQty);
  const rem = ordered - received;
  if (!(rem > 0)) return '';
  // Trim trailing zeros from a float subtraction (e.g. 100 - 0 = 100, not "100").
  return String(Number(rem.toFixed(3)));
}

export function ReceivePoLineModal({
  open,
  onOpenChange,
  labels,
  line,
  locations = [],
  receivePoLineAction,
  onReceived,
}: ReceivePoLineModalProps) {
  const [qty, setQty] = React.useState('');
  const [batch, setBatch] = React.useState('');
  const [bestBefore, setBestBefore] = React.useState('');
  const [locationId, setLocationId] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && line) {
      setQty(remaining(line));
      setBatch('');
      setBestBefore('');
      setLocationId('');
      setPending(false);
      setFormError(null);
      setSuccess(null);
    }
  }, [open, line?.id, line?.qty, line?.receivedQty]);

  // The shared Select's `placeholder` prop is not forwarded in the options-based
  // path, so the "use the org-default warehouse" choice is modelled as an explicit
  // empty-value option at the top of the list (selecting it sends toLocationId:null).
  const locationOptions = React.useMemo<SelectOption[]>(
    () => [
      { value: '', label: labels.locationPlaceholder },
      ...locations.map((l) => ({
        value: l.id,
        label: l.warehouseCode || l.warehouseName ? `${l.warehouseCode ?? l.warehouseName} · ${l.code}` : l.code,
      })),
    ],
    [locations, labels.locationPlaceholder],
  );

  if (!line) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!line) return;
    setFormError(null);
    setSuccess(null);

    const trimmedQty = qty.trim();
    if (!QTY_PATTERN.test(trimmedQty) || Number(trimmedQty) <= 0) {
      setFormError(labels.errors.qtyRequired);
      return;
    }
    const trimmedBest = bestBefore.trim();
    if (trimmedBest && !DATE_PATTERN.test(trimmedBest)) {
      setFormError(labels.errors.invalid_qty);
      return;
    }

    setPending(true);
    try {
      const result = await receivePoLineAction({
        poLineId: line.id,
        qty: trimmedQty,
        batchNumber: batch.trim() ? batch.trim() : null,
        bestBefore: trimmedBest ? trimmedBest : null,
        toLocationId: locationId ? locationId : null,
      });

      if (!result.ok) {
        const map = labels.errors as Record<string, string>;
        setFormError(map[result.error] ?? labels.errors.error);
        setPending(false);
        return;
      }

      const parts = [
        labels.success
          .replace('{grn}', result.grnNumber)
          .replace('{lp}', result.lpNumber)
          .replace('{qty}', result.qty)
          .replace('{uom}', result.uom),
      ];
      if (result.overReceived) parts.push(labels.overReceivedNote);
      if (result.qcInspectionRequired) parts.push(labels.qcRaisedNote);
      setSuccess(parts.join(' '));
      // Refresh the underlying PO detail so the line's received qty / status updates.
      onReceived();
    } catch {
      // The action never throws, but guard the seam anyway.
      setFormError(labels.errors.error);
      setPending(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="plan_po_receive_line">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="po-receive-form" onSubmit={onSubmit} data-testid="po-receive-form" className="flex flex-col gap-4">
          <div className="text-sm" data-testid="po-receive-line">
            <span className="font-mono font-semibold text-blue-700">{line.itemCode ?? '—'}</span>{' '}
            <span className="text-slate-800">{line.itemName ?? '—'}</span>
            <div className="text-xs text-slate-500">{labels.forLine.replace('{item}', `${line.qty} ${line.uom}`)}</div>
          </div>

          {formError ? (
            <div
              role="alert"
              data-testid="po-receive-error"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </div>
          ) : null}

          {success ? (
            <div
              role="status"
              data-testid="po-receive-success"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            >
              {success}
            </div>
          ) : null}

          {success ? null : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">{labels.qtyLabel}</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={qty}
                  data-testid="po-receive-qty"
                  placeholder={labels.qtyPlaceholder}
                  onChange={(e) => setQty(e.target.value)}
                  aria-label={labels.qtyLabel}
                />
                <span className="text-xs text-slate-500">
                  {labels.qtyHelp.replace('{ordered}', `${line.qty} ${line.uom}`).replace('{received}', `${line.receivedQty} ${line.uom}`)}
                </span>
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">{labels.batchLabel}</span>
                  <Input
                    type="text"
                    value={batch}
                    data-testid="po-receive-batch"
                    placeholder={labels.batchPlaceholder}
                    onChange={(e) => setBatch(e.target.value)}
                    aria-label={labels.batchLabel}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">{labels.bestBeforeLabel}</span>
                  <Input
                    type="date"
                    value={bestBefore}
                    data-testid="po-receive-best-before"
                    onChange={(e) => setBestBefore(e.target.value)}
                    aria-label={labels.bestBeforeLabel}
                  />
                </label>
              </div>

              {locations.length > 0 ? (
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">{labels.locationLabel}</span>
                  <Select
                    value={locationId}
                    onValueChange={setLocationId}
                    options={locationOptions}
                    placeholder={labels.locationPlaceholder}
                    aria-label={labels.locationLabel}
                  />
                </label>
              ) : null}
            </>
          )}
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="po-receive-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        {success ? null : (
          <Button
            type="submit"
            form="po-receive-form"
            className="btn--primary"
            data-testid="po-receive-submit"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? labels.submitting : labels.submit}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
