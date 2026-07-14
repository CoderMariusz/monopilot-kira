'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';

import type {
  listOpenWorkOrdersForLpReserve,
  reserveLp,
  ReserveLpResult,
  ReserveWorkOrderOption,
} from '../_actions/lp-detail-actions';
import type { WarehouseResult } from '../../../_actions/shared';

export type LpReserveModalLabels = {
  title: string;
  intro: string;
  search: string;
  searchPlaceholder: string;
  wo: string;
  woPlaceholder: string;
  qty: string;
  qtyHint: string;
  loading: string;
  empty: string;
  cancel: string;
  confirm: string;
  submitting: string;
  errors: {
    forbidden: string;
    invalidInput: string;
    notFound: string;
    locked: string;
    invalidState: string;
    notReleased: string;
    otherWo: string;
    woNotOpen: string;
    qtyExceedsAvailable: string;
    productNotInWoBom: string;
    generic: string;
  };
};

function optionLabel(wo: ReserveWorkOrderOption): string {
  const item = wo.itemCode ?? wo.itemName;
  return item ? `${wo.woNumber} · ${item}` : wo.woNumber;
}

function reserveError(result: Extract<WarehouseResult<ReserveLpResult>, { ok: false }>, labels: LpReserveModalLabels): string {
  if (result.reason === 'forbidden') return labels.errors.forbidden;
  if (result.reason === 'not_found') return labels.errors.notFound;
  switch (result.message) {
    case 'invalid_input':
      return labels.errors.invalidInput;
    case 'locked':
      return labels.errors.locked;
    case 'invalid_state':
      return labels.errors.invalidState;
    case 'lp_not_released':
      return labels.errors.notReleased;
    case 'reserved_for_other_wo':
      return labels.errors.otherWo;
    case 'wo_not_open':
      return labels.errors.woNotOpen;
    case 'qty_exceeds_available':
      return labels.errors.qtyExceedsAvailable;
    case 'product_not_in_wo_bom':
      return labels.errors.productNotInWoBom;
    default:
      return labels.errors.generic;
  }
}

export function LpReserveModal({
  open,
  onOpenChange,
  lpId,
  lpNumber,
  availableQty,
  uom,
  labels,
  reserveAction,
  listWorkOrdersAction,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lpId: string;
  lpNumber: string;
  availableQty: string;
  uom: string;
  labels: LpReserveModalLabels;
  reserveAction: typeof reserveLp;
  listWorkOrdersAction: typeof listOpenWorkOrdersForLpReserve;
  onSuccess: () => void;
}) {
  const [search, setSearch] = useState('');
  const [workOrders, setWorkOrders] = useState<ReserveWorkOrderOption[]>([]);
  const [selectedWoId, setSelectedWoId] = useState('');
  const [qty, setQty] = useState(availableQty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const options = useMemo(() => workOrders.map((wo) => ({ value: wo.id, label: optionLabel(wo) })), [workOrders]);
  const canSubmit = selectedWoId.length > 0 && qty.trim().length > 0 && !loading && !isPending;

  useEffect(() => {
    if (!open) {
      setSearch('');
      setWorkOrders([]);
      setSelectedWoId('');
      setQty(availableQty);
      setError(null);
    }
  }, [availableQty, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      const result = await listWorkOrdersAction(lpId, search);
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setWorkOrders(result.data);
        setSelectedWoId((current) => (result.data.some((wo) => wo.id === current) ? current : ''));
        setError(null);
      } else {
        setWorkOrders([]);
        setSelectedWoId('');
        setError(result.reason === 'forbidden' ? labels.errors.forbidden : labels.errors.generic);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [labels.errors.forbidden, labels.errors.generic, listWorkOrdersAction, lpId, open, search]);

  function close() {
    if (isPending) return;
    onOpenChange(false);
  }

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await reserveAction(lpId, selectedWoId, qty);
      if (result.ok) {
        onOpenChange(false);
        setSelectedWoId('');
        setError(null);
        onSuccess();
        return;
      }
      setError(reserveError(result, labels));
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="lp-reserve-modal" dismissible={!isPending}>
      <Modal.Header title={labels.title.replace('{lp}', lpNumber)} />
      <Modal.Body>
        <div data-testid="lp-reserve-modal" className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">{labels.intro}</p>

          <label htmlFor="lp-reserve-search" className="text-sm font-medium text-slate-700">
            {labels.search}
          </label>
          <Input
            id="lp-reserve-search"
            data-testid="lp-reserve-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchPlaceholder}
            disabled={isPending}
          />

          <label htmlFor="lp-reserve-wo" className="text-sm font-medium text-slate-700">
            {labels.wo}
          </label>
          <Select
            id="lp-reserve-wo"
            value={selectedWoId}
            onValueChange={setSelectedWoId}
            options={options}
            disabled={isPending || loading || workOrders.length === 0}
          >
            <SelectTrigger id="lp-reserve-wo-trigger" aria-label={labels.wo} data-testid="lp-reserve-wo">
              <SelectValue placeholder={loading ? labels.loading : labels.woPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {workOrders.map((wo) => (
                <SelectItem key={wo.id} value={wo.id}>
                  {optionLabel(wo)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!loading && workOrders.length === 0 ? (
            <p data-testid="lp-reserve-wo-empty" className="text-xs text-slate-500">
              {labels.empty}
            </p>
          ) : null}

          <label htmlFor="lp-reserve-qty" className="text-sm font-medium text-slate-700">
            {labels.qty}
          </label>
          <Input
            id="lp-reserve-qty"
            data-testid="lp-reserve-qty"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            inputMode="decimal"
            disabled={isPending}
          />
          <p className="text-xs text-slate-500" data-testid="lp-reserve-qty-hint">
            {labels.qtyHint.replace('{qty}', availableQty).replace('{uom}', uom)}
          </p>

          {error ? (
            <p role="alert" data-testid="lp-reserve-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="lp-reserve-cancel"
          onClick={close}
          disabled={isPending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="lp-reserve-confirm"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? labels.submitting : labels.confirm}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
