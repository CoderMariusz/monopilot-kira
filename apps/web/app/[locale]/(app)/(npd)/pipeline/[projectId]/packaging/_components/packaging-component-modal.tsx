'use client';

/**
 * NPD PACKAGING stage — add/edit component Modal.
 *
 * Renders the @monopilot/ui Modal with a small form (component / material /
 * supplier / spec / cost-per-unit / status / tier). On submit it calls the
 * `onUpsert` Server Action passed in as a prop (Next16 function-prop crash
 * guard — never a raw closure authored in the RSC). No raw <select> — uses the
 * @monopilot/ui Select primitive. cost_per_unit is kept as a decimal STRING.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import { ItemPicker, type ItemSearchFn } from '../../../../_components/item-picker';
import type { PackagingSupplierOption } from '../_actions/packaging-form-data';
import type { PackagingLabels, MutationOutcome, UpsertCall } from './packaging-screen';
import type {
  PackagingComponentRow,
  PackagingStatus,
  PackagingTier,
} from '../_actions/shared';

type FormState = {
  componentName: string;
  material: string;
  /** Selected supplier FK, legacy sentinel, or empty. */
  supplierId: string;
  legacySupplierCode: string | null;
  spec: string;
  costPerUnit: string;
  /** % lost during packing (0..100), kept as the input string. */
  wastePct: string;
  qtyPerPack: string;
  status: PackagingStatus;
  tier: PackagingTier;
  /** Optional FK to a `packaging` item in the catalog (item picker). */
  itemId: string | null;
  /** Catalog code of the linked item (display-only). */
  itemCode: string | null;
};

const LEGACY_SUPPLIER_VALUE = '__legacy__';

function rowToForm(row: PackagingComponentRow | null, defaultTier: PackagingTier): FormState {
  const legacyCode =
    row?.supplierId == null && row?.supplierCode?.trim() ? row.supplierCode.trim() : null;
  return {
    componentName: row?.componentName ?? '',
    material: row?.material ?? '',
    supplierId: row?.supplierId ?? (legacyCode ? LEGACY_SUPPLIER_VALUE : ''),
    legacySupplierCode: legacyCode,
    spec: row?.spec ?? '',
    costPerUnit: row?.costPerUnit ?? '',
    wastePct: row?.wastePct != null ? String(row.wastePct) : '0',
    qtyPerPack: row?.qtyPerPack != null ? String(row.qtyPerPack) : '',
    status: row?.status ?? 'draft',
    tier: row?.tier ?? defaultTier,
    // The list row does not carry item_id; the link is (re)established via the
    // picker on each open. Editing without re-picking leaves the link untouched
    // on the server only if itemId is undefined — here we send null explicitly,
    // so an edit clears a stale link unless re-picked. (Acceptable: packaging
    // links are advisory and re-pickable.)
    itemId: null,
    itemCode: null,
  };
}

export function PackagingComponentModal({
  open,
  onOpenChange,
  projectId,
  editing,
  defaultTier,
  labels,
  onUpsert,
  onMutated,
  searchItemsAction,
  suppliers = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  editing: PackagingComponentRow | null;
  defaultTier: PackagingTier;
  labels: PackagingLabels;
  onUpsert: (call: UpsertCall) => Promise<MutationOutcome>;
  /** Called after a successful add/edit so the parent can refresh the RSC loader. */
  onMutated?: () => void;
  /** Optional org-scoped item search seam; when present, the catalog picker renders. */
  searchItemsAction?: ItemSearchFn;
  /** Active suppliers from the org master (public.suppliers). */
  suppliers?: PackagingSupplierOption[];
}) {
  const [form, setForm] = React.useState<FormState>(() => rowToForm(editing, defaultTier));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(rowToForm(editing, defaultTier));
      setError(null);
      setSaving(false);
    }
  }, [open, editing, defaultTier]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Picking a catalog packaging item pre-fills name / material / supplier / cost
  // (each still overridable) and records the FK so the saved component links to the
  // item master. Supplier + price come from the item's active+approved supplier spec
  // (unitPrice falls back to list_price_gbp inside searchItems).
  function onPickItem(item: {
    id: string;
    itemCode: string;
    name: string;
    itemType: string;
    costPerKgEur: string | null;
    supplierCode?: string | null;
    unitPrice?: string | null;
  }) {
    const matchedSupplier = item.supplierCode
      ? suppliers.find((s) => s.code === item.supplierCode)
      : undefined;
    setForm((prev) => ({
      ...prev,
      itemId: item.id,
      itemCode: item.itemCode,
      componentName: item.name || prev.componentName,
      material: prev.material || item.itemCode,
      supplierId: matchedSupplier?.id ?? prev.supplierId,
      legacySupplierCode: matchedSupplier ? null : item.supplierCode ?? prev.legacySupplierCode,
      costPerUnit: item.unitPrice ?? item.costPerKgEur ?? prev.costPerUnit,
    }));
    setError(null);
  }

  const supplierOptions = React.useMemo(() => {
    const base = suppliers.map((s) => ({
      value: s.id,
      label: s.name && s.name !== s.code ? `${s.code} — ${s.name}` : s.code,
    }));
    if (form.legacySupplierCode && form.supplierId === LEGACY_SUPPLIER_VALUE) {
      return [
        {
          value: LEGACY_SUPPLIER_VALUE,
          label: labels.supplierLegacyHint.replace('{name}', form.legacySupplierCode),
        },
        ...base,
      ];
    }
    return base;
  }, [suppliers, form.legacySupplierCode, form.supplierId, labels.supplierLegacyHint]);

  function clearPickedItem() {
    setForm((prev) => ({ ...prev, itemId: null, itemCode: null }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const name = form.componentName.trim();
    if (name === '') {
      setError(labels.saveError);
      return;
    }
    const cost = form.costPerUnit.trim();
    if (cost !== '' && !/^\d+(\.\d+)?$/.test(cost)) {
      setError(labels.saveError);
      return;
    }
    const wasteRaw = form.wastePct.trim();
    const wastePct = wasteRaw === '' ? 0 : Number(wasteRaw);
    if (!Number.isFinite(wastePct) || wastePct < 0 || wastePct > 100) {
      setError(labels.saveError);
      return;
    }
    const qtyPerPackRaw = form.qtyPerPack.trim();
    const qtyPerPack = qtyPerPackRaw === '' ? null : Number(qtyPerPackRaw);
    if (qtyPerPack !== null && (!Number.isFinite(qtyPerPack) || qtyPerPack <= 0)) {
      setError(labels.saveError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: editing?.id,
        projectId,
        tier: form.tier,
        componentName: name,
        material: form.material.trim() || null,
        supplierId:
          form.supplierId && form.supplierId !== LEGACY_SUPPLIER_VALUE ? form.supplierId : null,
        legacySupplierCode:
          form.supplierId === LEGACY_SUPPLIER_VALUE ? form.legacySupplierCode : null,
        spec: form.spec.trim() || null,
        costPerUnit: cost || null,
        scrapPct: wastePct,
        wastePct,
        qtyPerPack,
        status: form.status,
        itemId: form.itemId,
      };
      const result = await onUpsert(payload);
      if (result.ok) {
        onOpenChange(false);
        onMutated?.();
      } else {
        setError(labels.saveError);
        setSaving(false);
      }
    } catch {
      setError(labels.saveError);
      setSaving(false);
    }
  }

  const statusOptions = [
    { value: 'approved', label: labels.statusApproved },
    { value: 'pending_artwork', label: labels.statusPendingArtwork },
    { value: 'draft', label: labels.statusDraft },
  ];
  const tierOptions = [
    { value: 'primary', label: labels.tierPrimary },
    { value: 'secondary', label: labels.tierSecondary },
  ];

  return (
    <Modal open={open} onOpenChange={onOpenChange} modalId="npd-packaging-component" size="md">
      <Modal.Header title={editing ? labels.editComponent : labels.addComponent} />
      <form onSubmit={handleSubmit} data-testid="packaging-component-form">
        <Modal.Body>
          <div className="grid gap-3">
            {searchItemsAction ? (
              <div className="flex items-center gap-2" data-testid="packaging-item-picker-row">
                <ItemPicker
                  labels={{
                    trigger: labels.pickerTrigger,
                    searchLabel: labels.pickerSearchLabel,
                    searchPlaceholder: labels.pickerSearchPlaceholder,
                    loading: labels.pickerLoading,
                    empty: labels.pickerEmpty,
                    cancel: labels.pickerCancel,
                    error: labels.pickerError,
                  }}
                  searchItemsAction={searchItemsAction}
                  itemTypes={['packaging']}
                  onSelect={onPickItem}
                  triggerClassName="btn-ghost btn-sm"
                />
                {form.itemCode ? (
                  <span className="flex items-center gap-2 text-xs" data-testid="packaging-linked-item">
                    <span className="badge badge-amber">
                      {labels.pickedHint.replace('{code}', form.itemCode)}
                    </span>
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={clearPickedItem}
                      data-testid="packaging-clear-item"
                    >
                      {labels.pickerClear}
                    </button>
                  </span>
                ) : null}
              </div>
            ) : null}
            <label>
              <span>{labels.fieldComponent}</span>
              <Input
                name="componentName"
                value={form.componentName}
                onChange={(e) => set('componentName', e.target.value)}
                required
                data-testid="field-component-name"
              />
            </label>
            <label>
              <span>{labels.fieldTier}</span>
              <Select
                aria-label={labels.fieldTier}
                value={form.tier}
                options={tierOptions}
                onValueChange={(v) => set('tier', v as PackagingTier)}
              />
            </label>
            <label>
              <span>{labels.fieldMaterial}</span>
              <Input
                name="material"
                value={form.material}
                onChange={(e) => set('material', e.target.value)}
                data-testid="field-material"
              />
            </label>
            <label>
              <span>{labels.fieldSupplier}</span>
              <Select
                aria-label={labels.fieldSupplier}
                value={form.supplierId}
                options={supplierOptions}
                placeholder={labels.supplierPlaceholder}
                onValueChange={(value) => {
                  set('supplierId', value);
                  if (value !== LEGACY_SUPPLIER_VALUE) {
                    set('legacySupplierCode', null);
                  }
                }}
                data-testid="field-supplier"
              />
            </label>
            <label>
              <span>{labels.fieldSpec}</span>
              <Input
                name="spec"
                value={form.spec}
                onChange={(e) => set('spec', e.target.value)}
                data-testid="field-spec"
              />
            </label>
            <label>
              <span>{labels.fieldCostUnit}</span>
              <Input
                name="costPerUnit"
                inputMode="decimal"
                value={form.costPerUnit}
                onChange={(e) => set('costPerUnit', e.target.value)}
                data-testid="field-cost"
              />
            </label>
            <label>
              <span>{labels.fieldWastePct}</span>
              <Input
                name="wastePct"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.wastePct}
                onChange={(e) => set('wastePct', e.target.value)}
                data-testid="field-waste-pct"
              />
              <span className="text-xs text-muted">
                Loss factor used for costing and production material inflation
              </span>
            </label>
            <label>
              <span>{labels.fieldQtyPerBox}</span>
              <Input
                name="qtyPerPack"
                type="number"
                min="0"
                step="0.1"
                value={form.qtyPerPack}
                onChange={(e) => set('qtyPerPack', e.target.value)}
                data-testid="field-qty-per-box"
              />
              <span className="text-xs text-muted">{labels.fieldQtyPerBoxHelp}</span>
            </label>
            <label>
              <span>{labels.fieldStatus}</span>
              <Select
                aria-label={labels.fieldStatus}
                value={form.status}
                options={statusOptions}
                onValueChange={(v) => set('status', v as PackagingStatus)}
              />
            </label>
            {error && (
              <div role="alert" className="alert alert-red" data-testid="form-error">
                {error}
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            className="btn-ghost"
            onClick={() => onOpenChange(false)}
            data-testid="cancel-component"
          >
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            className="btn-primary"
            disabled={saving}
            data-testid="submit-component"
          >
            {saving ? labels.saving : labels.save}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
