'use client';

/**
 * P2-PLANNING — Create Purchase Order modal.
 *
 * Prototype parity:
 *   - "＋ Create PO" primary trigger        → po-screens.jsx:45
 *   - supplier select + line editor          → po-screens.jsx:66 (supplier select),
 *       208 ("＋ Add line"), 210-248 (PO lines table: product / qty / uom /
 *       unit price). The create modal collapses the prototype's read-only detail
 *       lines table into an editable line editor matching the reviewed
 *       createPurchaseOrder input contract.
 *
 * Red lines honoured:
 *   - Supplier = shadcn-family @monopilot/ui Select (NO raw <select>) loaded from
 *     the REAL public.suppliers master via listPoSuppliers — never the prototype's
 *     hardcoded <option> list (po-screens.jsx:66, documented deviation).
 *   - Line item = the established ItemPicker combobox over the REAL items master
 *     (purchase_order_lines.item_id → items.id) — never free text, never hardcoded.
 *   - createPurchaseOrder is the source of truth: this surfaces its result and maps
 *     forbidden / invalid_input / already_exists / persistence_failed to honest
 *     inline states. RBAC (npd.planning.write) is enforced server-side inside it.
 *
 * Input contract (procurement-shared PurchaseOrderCreateInput): poNumber, supplierId,
 * status (defaults draft), expectedDelivery? (yyyy-mm-dd), currency (3 chars),
 * notes?, lines[] of { itemId, qty (positive numeric string), uom, unitPrice
 * (non-negative numeric string), lineNo (1-based) }. min 1 line.
 *
 * UI states: idle, optimistic (pending — submit disabled + busy), success (close +
 * onCreated), error (validation + forbidden/already_exists/persistence_failed inline
 * alert). No client-trusted permissions.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import { ItemPicker } from '../../../../(npd)/_components/item-picker';
import type { ItemPickerOption, SearchItemsInput } from '../../../../../../(npd)/fa/actions/search-items-types';
import type { PoSupplierOption } from '../_actions/po-form-data-types';
import { UomSelect, type UomOptionLabels } from '../../../../../../../components/forms/uom-select';
import { SiteSwitcher, type SiteSwitcherOption } from '../../../../../../../components/shell/site-switcher';
import { listPoWarehouses } from '../_actions/actions';

/**
 * BUG1 — effective supplier-spec price by date (fallback items.list_price_gbp).
 * Owned by the parallel po-form-data lane; consumed here to pre-fill the line's
 * unit price on item select. Optional so existing render sites keep compiling
 * until the page threads it.
 */
export type GetItemSupplierPriceAction = (input: {
  itemId: string;
  supplierId?: string | null;
  date?: string | null;
}) => Promise<
  | { ok: true; data: { unitPrice: string | null; currency: string | null; source: 'spec' | 'list_price' | 'none' } }
  | { ok: false; error: string }
>;

export type CreatePoLabels = {
  title: string;
  poNumberLabel: string;
  poNumberPlaceholder: string;
  /** Helper under the (now optional) number field: "Leave empty to auto-number…". */
  poNumberHelp: string;
  supplierLabel: string;
  supplierPlaceholder: string;
  destinationWarehouseLabel: string;
  destinationWarehousePlaceholder: string;
  destinationWarehouseLoading: string;
  expectedLabel: string;
  currencyLabel: string;
  notesLabel: string;
  notesPlaceholder: string;
  linesTitle: string;
  addLine: string;
  removeLine: string;
  lineItem: string;
  lineQty: string;
  lineUom: string;
  lineUnitPrice: string;
  lineTaxPct: string;
  taxPctPlaceholder: string;
  /**
   * BUG1 — subtle hint shown beside a line's unit price when it was pre-filled
   * from the supplier data. Keyed by the source so the operator knows whether the
   * price came from the supplier spec or the item list price.
   */
  priceSource: { spec: string; list_price: string };
  uomPlaceholder: string;
  /**
   * Display labels for the UoM dropdown options, keyed by unit code. Covers the
   * canonical units (kg/g/l/…) and any org-defined unit read from the real
   * unit_of_measure master.
   */
  uomOptions: UomOptionLabels;
  /**
   * Ordered unit codes to offer in the UoM dropdown. Sourced from the org's
   * unit_of_measure master so admin-added units appear; when empty the dropdown
   * keeps its canonical default set.
   */
  uomUnits?: readonly string[];
  qtyPlaceholder: string;
  unitPricePlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  errors: {
    poNumberRequired: string;
    supplierRequired: string;
    linesRequired: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    already_exists: string;
    invalid_state: string;
    /** F10 — no resolvable site for the write (org has 0 active sites). */
    no_active_site: string;
    /** F10 — >1 active site, none chosen/default; operator must pick one. */
    ambiguous_site: string;
    /** C051 — destination warehouse belongs to a different site than the PO. */
    warehouse_site_mismatch: string;
    persistence_failed: string;
  };
  picker: {
    trigger: string;
    searchLabel: string;
    searchPlaceholder: string;
    loading: string;
    empty: string;
    cancel: string;
    error: string;
  };
  /** F4 — guidance when the top bar is on "All sites" (write requires a site). */
  siteRequired: {
    bannerTitle: string;
    bannerBody: string;
    pickerLabel: string;
    allSites: string;
    pickerTooltip: string;
  };
};

type CreatePoLine = {
  key: string;
  item: ItemPickerOption | null;
  qty: string;
  uom: string;
  unitPrice: string;
  taxPct: string;
  /** BUG1 — where the pre-filled unitPrice came from (null once user-edited / blank). */
  priceSource: 'spec' | 'list_price' | null;
};

export type CreatePoResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; message?: string };

export type CreatePoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: CreatePoLabels;
  suppliers: PoSupplierOption[];
  /** Server Action seams (passed from the RSC; never authored here). */
  searchPoItemsAction: (input: SearchItemsInput) => Promise<ItemPickerOption[]>;
  /** BUG1 — pre-fill the supplier-effective price on item select (optional seam). */
  getItemSupplierPriceAction?: GetItemSupplierPriceAction;
  createPurchaseOrderAction: (input: {
    /** Optional — createPurchaseOrder auto-generates a per-org number when omitted. */
    poNumber?: string;
    supplierId: string;
    destinationWarehouseId?: string;
    expectedDelivery?: string;
    currency: string;
    notes?: string;
    lines: Array<{ itemId: string; qty: string; uom: string; unitPrice: string; taxPct: string; lineNo: number }>;
  }) => Promise<CreatePoResult>;
  /** Called after a successful create so the list can refresh. */
  onCreated: () => void;
  /** Active site from the mp_site_id cookie; null = All sites (show guidance). */
  activeSiteId: string | null;
  /** Org sites for the inline picker (same source as the top-bar SiteSwitcher). */
  sites: SiteSwitcherOption[];
  /** Cookie write seam — lib/site/site-actions.setActiveSite (never a parallel store). */
  setSiteAction: (siteId: string | null) => Promise<{ ok: boolean }>;
};

const QTY_PATTERN = /^\d+(?:\.\d{1,6})?$/;
const PRICE_PATTERN = /^\d+(?:\.\d{1,4})?$/;
const PCT_PATTERN = /^\d+(?:\.\d{1,4})?$/;

function makeLine(): CreatePoLine {
  return { key: Math.random().toString(36).slice(2), item: null, qty: '', uom: '', unitPrice: '', taxPct: '0', priceSource: null };
}

export function CreatePoModal({
  open,
  onOpenChange,
  labels,
  suppliers,
  searchPoItemsAction,
  getItemSupplierPriceAction,
  createPurchaseOrderAction,
  onCreated,
  activeSiteId,
  sites,
  setSiteAction,
}: CreatePoModalProps) {
  const router = useRouter();
  const [poNumber, setPoNumber] = React.useState('');
  const [supplierId, setSupplierId] = React.useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = React.useState('');
  const [warehouses, setWarehouses] = React.useState<Array<{ id: string; code: string; name: string }>>([]);
  const [warehousesLoading, setWarehousesLoading] = React.useState(false);
  const [expected, setExpected] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<CreatePoLine[]>(() => [makeLine()]);

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Reset all field + status state whenever the modal is closed.
  React.useEffect(() => {
    if (!open) {
      setPoNumber('');
      setSupplierId('');
      setDestinationWarehouseId('');
      setWarehouses([]);
      setWarehousesLoading(false);
      setExpected('');
      setNotes('');
      setLines([makeLine()]);
      setPending(false);
      setFormError(null);
    }
  }, [open]);

  React.useEffect(() => {
    let cancelled = false;
    if (!open || !activeSiteId) {
      setWarehouses([]);
      setDestinationWarehouseId('');
      return;
    }
    setWarehousesLoading(true);
    void listPoWarehouses(activeSiteId)
      .then((rows) => {
        if (!cancelled) setWarehouses(rows);
      })
      .catch(() => {
        if (!cancelled) setWarehouses([]);
      })
      .finally(() => {
        if (!cancelled) setWarehousesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeSiteId]);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const currency = selectedSupplier?.currency ?? 'GBP';
  const needsSiteSelection = !activeSiteId && sites.length > 0;
  const noSitesConfigured = sites.length === 0;
  const createBlocked = needsSiteSelection || noSitesConfigured;

  // BUG2 — every line's ItemPicker must search the SELECTED supplier's items only.
  // The picker calls the action with { query, itemTypes }; inject the supplierId so
  // searchPoItems filters to that supplier. The identity is stable per supplierId so
  // the picker's debounced effect re-runs whenever the supplier changes (re-filter).
  const searchSupplierItems = React.useCallback(
    (input: SearchItemsInput) =>
      searchPoItemsAction({ ...input, ...(supplierId ? { supplierId } : {}) }),
    [searchPoItemsAction, supplierId],
  );

  // When the supplier changes, drop any already-picked line item — it may no longer
  // belong to the new supplier (the picker re-filters; the price hint also resets).
  const prevSupplierRef = React.useRef(supplierId);
  React.useEffect(() => {
    if (prevSupplierRef.current !== supplierId) {
      prevSupplierRef.current = supplierId;
      setLines((prev) => prev.map((l) => (l.item ? { ...l, item: null, unitPrice: '', priceSource: null } : l)));
    }
  }, [supplierId]);

  function updateLine(key: string, patch: Partial<CreatePoLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // BUG1 — on item select pre-fill the line's unit price from the supplier-effective
  // price (spec by date, else item list price). Editable: a manual change clears the
  // source hint (handled in the price input's onChange). Failure is silent — the user
  // simply types the price (blank → '0' submit fallback preserved).
  async function prefillLinePrice(key: string, item: ItemPickerOption) {
    if (!getItemSupplierPriceAction) return;
    try {
      const res = await getItemSupplierPriceAction({
        itemId: item.id,
        supplierId: supplierId || null,
        date: expected || null,
      });
      if (res.ok && res.data.unitPrice != null && res.data.source !== 'none') {
        updateLine(key, { unitPrice: res.data.unitPrice, priceSource: res.data.source });
      }
    } catch {
      /* leave the price blank — user can type it */
    }
  }
  function addLine() {
    setLines((prev) => [...prev, makeLine()]);
  }
  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Number is OPTIONAL: blank → the action auto-numbers per-org. No required check.
    if (!supplierId) {
      setFormError(labels.errors.supplierRequired);
      return;
    }
    const validLines = lines.filter(
      (l) =>
        l.item &&
        QTY_PATTERN.test(l.qty.trim()) &&
        Number(l.qty) > 0 &&
        l.uom.trim().length > 0 &&
        PCT_PATTERN.test(l.taxPct.trim()) &&
        Number(l.taxPct) >= 0 &&
        Number(l.taxPct) <= 100,
    );
    if (validLines.length === 0) {
      setFormError(labels.errors.linesRequired);
      return;
    }

    setPending(true);
    try {
      const result = await createPurchaseOrderAction({
        poNumber: poNumber.trim() || undefined,
        supplierId,
        destinationWarehouseId: destinationWarehouseId || undefined,
        expectedDelivery: expected || undefined,
        currency,
        notes: notes.trim() || undefined,
        lines: validLines.map((l, idx) => ({
          itemId: l.item!.id,
          qty: l.qty.trim(),
          uom: l.uom.trim(),
          unitPrice: PRICE_PATTERN.test(l.unitPrice.trim()) ? l.unitPrice.trim() : '0',
          taxPct: l.taxPct.trim() || '0',
          lineNo: idx + 1,
        })),
      });

      if (!result.ok) {
        const map = labels.errors as Record<string, string>;
        setFormError(map[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      onCreated();
      onOpenChange(false);
    } catch {
      setFormError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="xl" modalId="plan_po_create">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="create-po-form" onSubmit={onSubmit} data-testid="create-po-form" className="flex flex-col gap-4">
          {needsSiteSelection ? (
            <div
              role="status"
              data-testid="create-po-site-required"
              className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
            >
              <div>
                <p className="font-medium">{labels.siteRequired.bannerTitle}</p>
                <p className="mt-1 text-amber-800">{labels.siteRequired.bannerBody}</p>
              </div>
              <SiteSwitcher
                sites={sites}
                activeSiteId={activeSiteId}
                labels={{
                  label: labels.siteRequired.pickerLabel,
                  allSites: labels.siteRequired.allSites,
                  tooltip: labels.siteRequired.pickerTooltip,
                }}
                setSiteAction={async (siteId) => {
                  const res = await setSiteAction(siteId);
                  if (res.ok) router.refresh();
                  return res;
                }}
              />
            </div>
          ) : noSitesConfigured ? (
            <div
              role="alert"
              data-testid="create-po-no-sites"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              {labels.errors.no_active_site}
            </div>
          ) : null}

          {formError ? (
            <div role="alert" data-testid="create-po-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* PO number */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.poNumberLabel}</span>
              <Input
                type="text"
                value={poNumber}
                data-testid="create-po-number"
                placeholder={labels.poNumberPlaceholder}
                onChange={(e) => setPoNumber(e.target.value)}
              />
              <span className="text-xs text-slate-500" data-testid="create-po-number-help">
                {labels.poNumberHelp}
              </span>
            </label>

            {/* Supplier — real suppliers master */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.supplierLabel}</span>
              <Select
                value={supplierId}
                onValueChange={setSupplierId}
                aria-label={labels.supplierLabel}
                placeholder={labels.supplierPlaceholder}
                options={suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
              />
            </label>

            {/* Destination warehouse — optional, real org warehouse master */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.destinationWarehouseLabel}</span>
              <Select
                value={destinationWarehouseId}
                onValueChange={setDestinationWarehouseId}
                aria-label={labels.destinationWarehouseLabel}
                placeholder={warehousesLoading ? labels.destinationWarehouseLoading : labels.destinationWarehousePlaceholder}
                options={[
                  { value: '', label: labels.destinationWarehousePlaceholder },
                  ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
                ]}
              />
            </label>

            {/* Expected delivery */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.expectedLabel}</span>
              <Input
                type="date"
                value={expected}
                data-testid="create-po-expected"
                onChange={(e) => setExpected(e.target.value)}
              />
            </label>

            {/* Currency (derived from supplier, read-only display) */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.currencyLabel}</span>
              <Input type="text" value={currency} data-testid="create-po-currency" readOnly />
            </label>
          </div>

          {/* Line editor */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">{labels.linesTitle}</span>
              <Button type="button" className="btn--secondary btn-sm" data-testid="create-po-add-line" onClick={addLine}>
                {labels.addLine}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm" data-testid="create-po-lines">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">{labels.lineItem}</th>
                    <th className="px-3 py-2 text-right">{labels.lineQty}</th>
                    <th className="px-3 py-2">{labels.lineUom}</th>
                    <th className="px-3 py-2 text-right">{labels.lineUnitPrice}</th>
                    <th className="px-3 py-2 text-right">{labels.lineTaxPct}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key} data-testid={`create-po-line-${line.key}`} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-3 py-2">
                        {line.item ? (
                          <div className="flex items-center gap-2 text-sm" data-testid="create-po-line-item">
                            <span className="font-mono font-semibold text-blue-700">{line.item.itemCode}</span>
                            <span className="text-slate-800">{line.item.name}</span>
                            <button
                              type="button"
                              className="btn btn--ghost btn-sm"
                              data-testid="create-po-line-clear"
                              onClick={() => updateLine(line.key, { item: null })}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <ItemPicker
                            searchItemsAction={searchSupplierItems}
                            onSelect={(item) => {
                              updateLine(line.key, { item, uom: line.uom || item.uomBase });
                              void prefillLinePrice(line.key, item);
                            }}
                            triggerClassName="btn btn--secondary btn-sm"
                            labels={labels.picker}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.qty}
                          data-testid="create-po-line-qty"
                          placeholder={labels.qtyPlaceholder}
                          onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="px-3 py-2" data-testid="create-po-line-uom">
                        {/* No free-text units: constrained dropdown defaulting to the
                            picked item's base UoM (set on ItemPicker.onSelect), kept
                            changeable. */}
                        <UomSelect
                          value={line.uom}
                          onValueChange={(uom) => updateLine(line.key, { uom })}
                          labels={labels.uomOptions}
                          {...(labels.uomUnits && labels.uomUnits.length > 0 ? { units: labels.uomUnits } : {})}
                          placeholder={labels.uomPlaceholder}
                          aria-label={labels.lineUom}
                          className="w-24"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.unitPrice}
                          data-testid="create-po-line-price"
                          placeholder={labels.unitPricePlaceholder}
                          // A manual edit clears the "pre-filled from supplier" hint.
                          onChange={(e) => updateLine(line.key, { unitPrice: e.target.value, priceSource: null })}
                          className="w-28 text-right"
                        />
                        {line.priceSource ? (
                          <span
                            className="mt-0.5 block text-[10px] text-slate-500"
                            data-testid="create-po-line-price-source"
                          >
                            {labels.priceSource[line.priceSource]}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.taxPct}
                          data-testid="create-po-line-tax"
                          placeholder={labels.taxPctPlaceholder}
                          onChange={(e) => updateLine(line.key, { taxPct: e.target.value })}
                          className="w-20 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {lines.length > 1 ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn-sm"
                            aria-label={labels.removeLine}
                            data-testid="create-po-line-remove"
                            onClick={() => removeLine(line.key)}
                          >
                            ✕
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Textarea
              value={notes}
              data-testid="create-po-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm"
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="create-po-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="create-po-form"
          className="btn--primary"
          data-testid="create-po-submit"
          disabled={pending || createBlocked}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
