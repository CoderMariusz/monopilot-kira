'use client';

/**
 * P2-PLANNING — Create Work Order modal.
 *
 * Prototype parity: wo-list.jsx:94 ("＋ Create WO" primary button) + the
 * planning create flow (modals.jsx wo_create_wizard / draft_wo_review_modal).
 * Collapsed to a single dense form modal (one screen, no multi-step wizard) per
 * the reviewed createWorkOrder action shape: product, planned quantity,
 * scheduled start, line, machine, notes.
 *
 * Red lines honoured:
 *   - Product picker = the established ItemPicker combobox pattern (npd) restricted
 *     to FINISHED GOODS via the searchFgProducts read action seam — real items
 *     master, never free text, never a hardcoded list.
 *   - Line / machine are shadcn-family @monopilot/ui Select (NO raw <select>),
 *     loaded from the real production_lines / machines masters.
 *   - The action is the source of truth: this surfaces its result, including the
 *     `no_active_bom` warning, and maps forbidden/invalid_input/persistence_failed
 *     to honest inline states. RBAC is enforced server-side inside createWorkOrder.
 *
 * UI states: idle, optimistic (pending — submit disabled + busy), success (warning
 * banner when no active BOM, then close + onCreated), error (invalid_input /
 * forbidden / persistence_failed inline alert). No client-trusted permissions.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import { WoChainPreview } from './wo-chain-preview';
import type { PreviewWorkOrderChainResult } from '../_actions/chain-preview';
import { ItemPicker, type ItemSearchFn } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items-types';
import {
  toBaseQty,
  snapshotFromItemRow,
  TypedError,
  type OutputUom,
  type UomSnapshot,
} from '../../../../../../../lib/uom/convert';
import type { CreateWorkOrderResult } from '../_actions/shared';
import type { FgProductOption, ProductionResources, SearchFgProductsInput } from '../_actions/wo-form-data';

/**
 * P0-UOM — the picked product plus its pack snapshot. The Codex backend lane
 * extends FgProductOption with output_uom / net_qty_per_each / each_per_box /
 * weight_mode; until those fields land on the option, snapshotFromItemRow falls
 * back to a 'base'/'kg' snapshot, so the modal degrades to base-kg entry.
 */
type PickedProduct = {
  id: string;
  itemCode: string;
  name: string;
  uomBase: string;
  snapshot: UomSnapshot;
};

export type CreateWoLabels = {
  title: string;
  productLabel: string;
  productPlaceholder: string;
  picker: {
    trigger: string;
    searchLabel: string;
    searchPlaceholder: string;
    loading: string;
    empty: string;
    cancel: string;
    error: string;
  };
  quantityLabel: string;
  quantityPlaceholder: string;
  /**
   * P0-UOM — unit suffix used to build the quantity label in the product's
   * OUTPUT unit ("Quantity (box)") and the live conversion preview template
   * "{qty} {unit} = {kg} {base}". The keys live in the real bundles
   * (apps/web/i18n/{en,pl,ro,uk}.json, Planning.workOrders.create.*; F-D08a);
   * optional only so legacy callers that predate them still type-check.
   */
  quantityUom?: { base: string; each: string; box: string };
  conversionPreview?: string;
  /**
   * P0-UOM — label for the "Order unit" selector that lets the planner enter the
   * WO quantity in a unit OTHER than the item's default output unit (e.g. order
   * in box when the item is normally counted in each). Optional so callers that
   * predate it still type-check; defaults to plain English "Order unit" in-file.
   */
  orderUnitLabel?: string;
  scheduledStartLabel: string;
  lineLabel: string;
  machineLabel: string;
  noneOption: string;
  notesLabel: string;
  notesPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  selectedProduct: string;
  errors: {
    productRequired: string;
    quantityRequired: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    invalid_state: string;
    persistence_failed: string;
    /** P0-UOM — the product lacks pack data needed to convert to base kg. */
    uom_conversion_unavailable?: string;
    /**
     * O-2 — release-only pack-hierarchy gate code. createWorkOrder never returns
     * it, but it is part of the shared PlanningWorkOrderError union, so the index
     * type must cover it (the `?? persistence_failed` fallback handles the unset
     * case here).
     */
    pack_hierarchy_incomplete?: string;
    /** F10 — no resolvable site for the write (org has 0 active sites). */
    no_active_site?: string;
    /** F10 — >1 active site, none chosen/default; operator must pick one. */
    ambiguous_site?: string;
    /**
     * W1-L2 — org_document_settings has no 'wo' mask row. The pilot path surfaces
     * it specifically; this planning modal never mints custom numbers, so the
     * `?? persistence_failed` fallback covers the unset case.
     */
    document_mask_missing?: string;
    not_released_to_factory?: string;
    /** C5 — draft WO delete blocked when chain peer is active. */
    chain_delete_blocked?: string;
    /** A3 — production line belongs to a different site than the WO. */
    line_site_mismatch?: string;
  };
  noBomWarning: string;
  /** Shown when a multi-stage FG creates upstream WIP work orders alongside the root. */
  chainCreatedWarning?: string;
  /** P0-UOM — surfaced when createWorkOrder warns the FG has no approved factory spec. */
  noFactorySpecWarning?: string;
};

export type CreateWoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: CreateWoLabels;
  resources: ProductionResources;
  /** Server Action seams (passed from the RSC; never authored here). */
  searchFgProductsAction: (input: SearchFgProductsInput) => Promise<FgProductOption[]>;
  createWorkOrderAction: (params: {
    productId: string;
    itemCode: string;
    plannedQuantity: string;
    /** P0-UOM — quantity in the product's OUTPUT unit + which unit. */
    quantityEntered?: string;
    quantityEnteredUom?: 'base' | 'each' | 'box';
    scheduledStartTime?: string;
    productionLineId?: string;
    notes?: string;
  }) => Promise<CreateWorkOrderResult>;
  /** Called after a successful create so the list can refresh. */
  onCreated: (result: Extract<CreateWorkOrderResult, { ok: true }>) => void;
  /**
   * Optional chain-preview seam. When wired, a read-only tree of the child WIP work
   * orders that will be created appears below the form for multi-stage finished
   * goods. Optional so existing callers/tests that don't pass it are unaffected.
   */
  previewChainAction?: (input: { productId: string; plannedQuantity: string }) => Promise<PreviewWorkOrderChainResult>;
};

const QTY_PATTERN = /^\d+(?:\.\d{1,3})?$/;

function fmtKg(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function CreateWoModal({
  open,
  onOpenChange,
  labels,
  resources,
  searchFgProductsAction,
  createWorkOrderAction,
  onCreated,
  previewChainAction,
}: CreateWoModalProps) {
  const [product, setProduct] = React.useState<PickedProduct | null>(null);
  // P0-UOM — the unit the quantity is entered in. Initialised to the picked
  // item's default output unit, but the planner can switch it (Order unit
  // selector below) to any unit the item's pack hierarchy can convert.
  const [orderUom, setOrderUom] = React.useState<OutputUom>('base');
  const [quantity, setQuantity] = React.useState('');
  const [scheduledStart, setScheduledStart] = React.useState('');
  const [lineId, setLineId] = React.useState('');
  const [notes, setNotes] = React.useState('');

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);

  // Reset all field + status state whenever the modal is (re)opened/closed.
  React.useEffect(() => {
    if (!open) {
      setProduct(null);
      setOrderUom('base');
      setQuantity('');
      setScheduledStart('');
      setLineId('');
      setNotes('');
      setPending(false);
      setFormError(null);
      setWarning(null);
    }
  }, [open]);

  // The ItemPickerOption contract has no pack fields, so we stash the raw Fg rows
  // (which DO carry output_uom / net_qty_per_each / each_per_box once Codex lands
  // them) keyed by id; onPick recovers the pack snapshot from the stashed row.
  const rowsById = React.useRef<Map<string, FgProductOption>>(new Map());

  // Adapt searchFgProducts (Fg shape) to the ItemPicker's ItemSearchFn contract so
  // we reuse the EXACT established combobox component, restricted to fg items.
  const pickerSearch: ItemSearchFn = React.useCallback(
    async (input) => {
      const rows = await searchFgProductsAction({ query: input.query });
      for (const r of rows) rowsById.current.set(r.id, r);
      return rows.map<ItemPickerOption>((r) => ({
        id: r.id,
        itemCode: r.itemCode,
        name: r.name,
        itemType: 'fg',
        status: 'active',
        costPerKgEur: null,
        uomBase: r.uomBase,
      }));
    },
    [searchFgProductsAction],
  );

  function onPick(item: ItemPickerOption) {
    // Recover the original Fg row (with pack fields) to build the UOM snapshot;
    // fall back to a base/kg snapshot if it's not stashed (defensive).
    const row = rowsById.current.get(item.id);
    const snapshot = snapshotFromItemRow(
      (row as unknown as Record<string, unknown>) ?? { uom_base: item.uomBase },
    );
    setProduct({
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      uomBase: item.uomBase,
      snapshot,
    });
    // Reset the order unit to the new item's default output unit on every pick.
    setOrderUom(snapshot.outputUom);
    setFormError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setWarning(null);

    if (!product) {
      setFormError(labels.errors.productRequired);
      return;
    }
    if (!QTY_PATTERN.test(quantity.trim()) || Number(quantity) <= 0) {
      setFormError(labels.errors.quantityRequired);
      return;
    }

    // P0-UOM — quantity is entered in the planner-chosen ORDER unit. Convert to
    // base kg for plannedQuantity (the reviewed action's base-qty contract) and
    // send the entered unit alongside. If the pack factors are missing for
    // each/box, surface uom_conversion_unavailable BEFORE the round-trip.
    let plannedBase: string;
    if (orderUom === 'base') {
      plannedBase = quantity.trim();
    } else {
      try {
        const baseQty = toBaseQty(product.snapshot, Number(quantity.trim()), orderUom);
        // Box/each → base multiplication can yield an unterminating float
        // (2 × 12 × 0.3 = 7.199999999999999) which the server schema rejects
        // (≤4 decimals) — round to the schema's precision before submit.
        plannedBase = baseQty.toFixed(4).replace(/\.?0+$/, '');
      } catch (err) {
        setFormError(
          err instanceof TypedError
            ? labels.errors.uom_conversion_unavailable ?? labels.errors.invalid_input
            : labels.errors.invalid_input,
        );
        return;
      }
    }

    setPending(true);
    try {
      const result = await createWorkOrderAction({
        productId: product.id,
        itemCode: product.itemCode,
        plannedQuantity: plannedBase,
        quantityEntered: quantity.trim(),
        quantityEnteredUom: orderUom,
        // Parse the date-only input as LOCAL midnight (`+ 'T00:00:00'`) before
        // converting to ISO. `new Date('2026-06-15')` parses as UTC midnight, which
        // rolls back to the previous calendar day in UTC+ zones — the scheduled day
        // the user picked must be preserved in their own timezone.
        scheduledStartTime: scheduledStart ? new Date(scheduledStart + 'T00:00:00').toISOString() : undefined,
        productionLineId: lineId || undefined,
        notes: notes.trim() || undefined,
      });

      if (!result.ok) {
        setFormError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }

      // Success. Surface create warnings (no active BOM / no approved factory spec)
      // in-modal; multi-stage chain summary is shown by the list parent via onCreated.
      if (result.warning === 'no_active_bom') {
        setWarning(labels.noBomWarning);
      } else if (result.warning === 'no_approved_factory_spec') {
        setWarning(labels.noFactorySpecWarning ?? labels.noBomWarning);
      }
      onCreated(result);
      onOpenChange(false);
    } catch {
      setFormError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  // P0-UOM — the units the planner may ORDER in for the picked item. Always
  // allow base (bulk kg). Allow `each` only when net_qty_per_each is a positive
  // factor; allow `box` only when BOTH net_qty_per_each and each_per_box are
  // present (the same convertibility rule toBaseQty enforces). Each option is
  // labelled human-readably ("Each" / "Box" / the snapshot's base unit, e.g. "kg").
  const orderUnitOptions = React.useMemo(() => {
    if (!product) return [];
    const snap = product.snapshot;
    const hasEach = snap.netQtyPerEach !== null && Number.isFinite(snap.netQtyPerEach) && snap.netQtyPerEach > 0;
    const hasBox =
      hasEach && snap.eachPerBox !== null && Number.isFinite(snap.eachPerBox) && snap.eachPerBox > 0;
    const opts: { value: OutputUom; label: string }[] = [
      { value: 'base', label: labels.quantityUom?.base ?? snap.uomBase },
    ];
    if (hasEach) opts.push({ value: 'each', label: labels.quantityUom?.each ?? 'each' });
    if (hasBox) opts.push({ value: 'box', label: labels.quantityUom?.box ?? 'box' });
    return opts;
  }, [product, labels.quantityUom]);

  // P0-UOM — derive the unit-aware quantity label + the live conversion preview
  // off the CHOSEN order unit (orderUom), not the item's default. Until a product
  // is picked the label stays the plain base copy. For each/box the label gets the
  // unit suffix ("Quantity (box)") and a preview line shows the nominal base-kg
  // conversion. Base keeps the legacy label / no preview.
  const unitWord =
    orderUom === 'box'
      ? labels.quantityUom?.box
      : orderUom === 'each'
        ? labels.quantityUom?.each
        : undefined;
  const qtyLabel = unitWord ? `${labels.quantityLabel} (${unitWord})` : labels.quantityLabel;
  const orderUnitLabel = labels.orderUnitLabel ?? 'Order unit';

  // Base-qty for the chain preview (the dry-run action keys required WIP qty off the
  // base qty, same as the create action). Empty until product + a valid qty exist.
  const previewBaseQty = React.useMemo(() => {
    if (!product) return '';
    const raw = quantity.trim();
    if (!QTY_PATTERN.test(raw) || Number(raw) <= 0) return '';
    if (orderUom === 'base') return raw;
    try {
      return toBaseQty(product.snapshot, Number(raw), orderUom).toFixed(4).replace(/\.?0+$/, '');
    } catch {
      return '';
    }
  }, [product, quantity, orderUom]);

  let conversionPreview: string | null = null;
  if (product && orderUom !== 'base' && QTY_PATTERN.test(quantity.trim()) && Number(quantity) > 0) {
    try {
      const baseKg = toBaseQty(product.snapshot, Number(quantity.trim()), orderUom);
      conversionPreview =
        labels.conversionPreview
          ?.replace('{qty}', quantity.trim())
          .replace('{unit}', unitWord ?? orderUom)
          .replace('{kg}', fmtKg(baseKg))
          .replace('{base}', product.snapshot.uomBase) ?? null;
    } catch {
      conversionPreview = labels.errors.uom_conversion_unavailable ?? null;
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="plan_wo_create">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="create-wo-form" onSubmit={onSubmit} data-testid="create-wo-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="create-wo-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}
          {warning ? (
            <div role="status" data-testid="create-wo-warning" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warning}
            </div>
          ) : null}

          {/* Product — FG-restricted ItemPicker */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.productLabel}</span>
            {product ? (
              <div data-testid="create-wo-selected-product" className="flex items-center gap-2 text-sm">
                <span className="font-mono font-semibold text-blue-700">{product.itemCode}</span>
                <span className="text-slate-800">{product.name}</span>
                <button
                  type="button"
                  className="btn btn--ghost btn-sm"
                  data-testid="create-wo-clear-product"
                  onClick={() => setProduct(null)}
                >
                  ✕
                </button>
              </div>
            ) : (
              <ItemPicker
                searchItemsAction={pickerSearch}
                onSelect={onPick}
                triggerClassName="btn btn--secondary"
                labels={{
                  trigger: labels.picker.trigger,
                  searchLabel: labels.picker.searchLabel,
                  searchPlaceholder: labels.picker.searchPlaceholder,
                  loading: labels.picker.loading,
                  empty: labels.picker.empty,
                  cancel: labels.picker.cancel,
                  error: labels.picker.error,
                }}
              />
            )}
          </div>

          {/* P0-UOM — Order unit selector. Only when a product is picked and the
              item's pack hierarchy actually offers more than one convertible unit;
              a single-unit item keeps the legacy behaviour (a disabled read-only
              control, no point in a 1-option dropdown). */}
          {product && orderUnitOptions.length > 1 ? (
            <label className="flex flex-col gap-1" data-testid="create-wo-order-unit">
              <span className="text-sm font-medium text-slate-700">{orderUnitLabel}</span>
              <Select
                value={orderUom}
                onValueChange={(v) => setOrderUom(v as OutputUom)}
                aria-label={orderUnitLabel}
                options={orderUnitOptions.map((o) => ({ value: o.value, label: o.label }))}
              />
            </label>
          ) : null}

          {/* Planned quantity (decimal string) — labelled in the chosen ORDER unit. */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{qtyLabel}</span>
            <Input
              type="text"
              inputMode="decimal"
              value={quantity}
              data-testid="create-wo-quantity"
              placeholder={labels.quantityPlaceholder}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {conversionPreview ? (
              <span data-testid="create-wo-conversion" className="text-xs text-slate-500">
                {conversionPreview}
              </span>
            ) : null}
          </label>

          {/* Scheduled start (date) */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.scheduledStartLabel}</span>
            <Input
              type="date"
              value={scheduledStart}
              data-testid="create-wo-scheduled-start"
              onChange={(e) => setScheduledStart(e.target.value)}
            />
          </label>

          {/* Line select — from real production_lines master */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.lineLabel}</span>
            <Select
              value={lineId}
              onValueChange={setLineId}
              aria-label={labels.lineLabel}
              options={[
                { value: '', label: labels.noneOption },
                ...resources.lines.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` })),
              ]}
            />
          </label>

          {/* Notes */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Textarea
              value={notes}
              data-testid="create-wo-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm"
            />
          </label>

          {/* Multi-stage chain preview (read-only, dry run). Only when wired + a
              product is picked; renders nothing for single-stage finished goods. */}
          {previewChainAction && product ? (
            <WoChainPreview
              productId={product.id}
              plannedQuantity={previewBaseQty}
              previewChainAction={previewChainAction}
            />
          ) : null}
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="create-wo-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="create-wo-form"
          className="btn--primary"
          data-testid="create-wo-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
