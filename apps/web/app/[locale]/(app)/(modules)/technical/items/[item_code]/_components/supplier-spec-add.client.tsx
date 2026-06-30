'use client';

/**
 * ITEM SUPPLIER MANAGEMENT — Item Detail · supplier-specs tab "+ Add supplier"
 * modal (client island).
 *
 * CAUSAL CHAIN (why this clears BOM warnings):
 *   The BOM readiness gates SUPPLIER_NOT_APPROVED / SUPPLIER_SPEC_NOT_ACTIVE
 *   (apps/web/lib/technical/rm-usability.ts) hard-block a component unless an
 *   APPROVED + ACTIVE + in-date public.supplier_specs row exists. For an item that
 *   was NOT born in NPD there was previously no UI to author that row, so the
 *   warnings were unsatisfiable. This modal writes that exact row via
 *   createItemSupplierSpec; on success it router.refresh()es so the supplier-specs
 *   tab re-reads and the readiness warnings for this item clear.
 *
 * Five states on the modal:
 *   - permission-denied → the trigger never renders (canEdit is false); a forbidden
 *     server result also renders an inline forbidden banner.
 *   - empty             → no suppliers in the org (Select disabled + helper).
 *   - error             → inline error banner (mapped action error / load failure).
 *   - pending           → submit disabled + "Adding…" label (useTransition).
 *   - ready/optimistic  → success banner, then refresh.
 *
 * shadcn/ui Select only (no raw <select>); RBAC is enforced server-side in the
 * action — canEdit here only governs trigger visibility, never trust.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import {
  Select,
  type SelectOption,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';

import type {
  CreateItemSupplierSpecResult,
  SupplierSpecActionError,
} from '../../_actions/supplier-spec-actions';

/** Currency is optional so the modal can default the price currency to the chosen supplier's. */
export type SupplierOption = { id: string; code: string; name: string; currency?: string | null };

export type SupplierSpecAddLabels = {
  cta: string;
  title: string;
  subtitle: string;
  supplier: string;
  supplierPlaceholder: string;
  specVersion: string;
  issuedDate: string;
  effectiveFrom: string;
  expiryDate: string;
  approveNow: string;
  /** Price + currency fields (new). */
  unitPrice: string;
  unitPricePlaceholder: string;
  priceCurrency: string;
  priceCurrencyPlaceholder: string;
  /** Document attach (new). */
  document: string;
  documentHint: string;
  uploading: string;
  uploadFailed: string;
  submit: string;
  submitting: string;
  cancel: string;
  success: string;
  successUpdated: string;
  noSuppliers: string;
  forbidden: string;
  errors: Record<SupplierSpecActionError | 'load_failed', string>;
};

type AddSupplierSpec = (input: {
  itemCode: string;
  supplierId: string;
  specVersion?: string;
  issuedDate?: string;
  effectiveFrom?: string;
  expiryDate?: string;
  unitPrice?: number | string;
  priceCurrency?: string;
  approveNow: boolean;
}) => Promise<CreateItemSupplierSpecResult>;

type UploadSupplierSpecDoc = (
  formData: FormData,
) => Promise<{ ok: true; data: { url: string } } | { ok: false; error: string }>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ff" style={{ display: 'block', marginBottom: 10 }}>
      <span className="ff-label">{label}</span>
      {children}
    </label>
  );
}

function Modal({
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  onClose: () => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
        onMouseDown={(event) => event.stopPropagation()}
        data-testid="supplier-spec-add-modal"
      >
        <div className="modal-head">
          <div>
            <div id={titleId} className="modal-title">
              {title}
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              {subtitle}
            </div>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export function SupplierSpecAdd({
  itemCode,
  canEdit,
  suppliers,
  labels,
  addSupplierSpec,
  uploadSupplierSpecDoc,
}: {
  itemCode: string;
  canEdit: boolean;
  suppliers: SupplierOption[];
  labels: SupplierSpecAddLabels;
  addSupplierSpec: AddSupplierSpec;
  /** Optional — attach a spec document after the spec is created. */
  uploadSupplierSpecDoc?: UploadSupplierSpecDoc;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [supplierId, setSupplierId] = React.useState('');
  const [specVersion, setSpecVersion] = React.useState('v1');
  const [issuedDate, setIssuedDate] = React.useState('');
  const [effectiveFrom, setEffectiveFrom] = React.useState('');
  const [expiryDate, setExpiryDate] = React.useState('');
  const [unitPrice, setUnitPrice] = React.useState('');
  const [priceCurrency, setPriceCurrency] = React.useState('');
  // Whether the user manually edited the currency (so a supplier change won't clobber it).
  const currencyTouchedRef = React.useRef(false);
  const [docFile, setDocFile] = React.useState<File | null>(null);
  const [approveNow, setApproveNow] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Default the price currency to the selected supplier's currency (until the user
  // overrides it). Runs whenever the supplier changes and the field is untouched.
  React.useEffect(() => {
    if (currencyTouchedRef.current) return;
    const cur = suppliers.find((s) => s.id === supplierId)?.currency;
    setPriceCurrency(cur ?? '');
  }, [supplierId, suppliers]);

  // permission-denied: the write trigger is gated server-side (canEdit mirrors
  // technical.items.edit). Hidden entirely when the caller cannot edit.
  if (!canEdit) return null;

  const noSuppliers = suppliers.length === 0;
  const supplierOptions: SelectOption[] = suppliers.map((s) => ({
    value: s.id,
    label: `${s.code} · ${s.name}`,
  }));

  function reset() {
    setSupplierId('');
    setSpecVersion('v1');
    setIssuedDate('');
    setEffectiveFrom('');
    setExpiryDate('');
    setUnitPrice('');
    setPriceCurrency('');
    currencyTouchedRef.current = false;
    setDocFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setApproveNow(true);
    setError(null);
    setSuccess(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function submit() {
    setError(null);
    setSuccess(null);
    if (!supplierId) {
      setError(labels.errors.invalid_input);
      return;
    }
    startTransition(async () => {
      const result = await addSupplierSpec({
        itemCode,
        supplierId,
        specVersion: specVersion.trim() || undefined,
        issuedDate: issuedDate || undefined,
        effectiveFrom: effectiveFrom || undefined,
        expiryDate: expiryDate || undefined,
        unitPrice: unitPrice.trim() ? unitPrice.trim() : undefined,
        priceCurrency: priceCurrency.trim() || undefined,
        approveNow,
      });
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        return;
      }

      // Document attach (optional): the spec now exists, so upload against its id.
      // A failed upload does NOT roll back the spec — surface it honestly inline.
      if (docFile && uploadSupplierSpecDoc) {
        const fd = new FormData();
        fd.append('specId', result.data.id);
        fd.append('file', docFile);
        const up = await uploadSupplierSpecDoc(fd);
        if (!up.ok) {
          setError(labels.uploadFailed);
          router.refresh();
          return;
        }
      }

      setSuccess(result.data.updated ? labels.successUpdated : labels.success);
      // Refresh so the supplier-specs tab re-reads and the BOM readiness warnings
      // (SUPPLIER_NOT_APPROVED / SUPPLIER_SPEC_NOT_ACTIVE) for this item clear.
      router.refresh();
      window.setTimeout(() => close(), 1200);
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        data-testid="supplier-spec-add-cta"
        onClick={() => setOpen(true)}
      >
        {labels.cta}
      </button>

      {open ? (
        <Modal
          onClose={close}
          title={labels.title}
          subtitle={labels.subtitle}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={close} disabled={pending}>
                {labels.cancel}
              </button>
              <Button
                onClick={submit}
                disabled={pending || noSuppliers || !supplierId}
                // Vivid primary so the enabled state reads as actionable — the bare
                // @monopilot/ui Button is `.btn` (neutral/grey) and looked disabled
                // even when ready, matching the rest of the app's `btn btn-primary`.
                className="btn-primary"
                data-testid="supplier-spec-add-submit"
              >
                {pending ? labels.submitting : labels.submit}
              </Button>
            </>
          }
        >
          {error ? (
            <div role="alert" className="alert alert-red" style={{ marginBottom: 10 }}>
              <div className="alert-title">{error}</div>
            </div>
          ) : null}
          {success ? (
            <div role="status" className="alert alert-green" style={{ marginBottom: 10 }}>
              <div className="alert-title">{success}</div>
            </div>
          ) : null}

          {noSuppliers ? (
            <div className="empty-state" data-testid="supplier-spec-add-empty">
              <div className="empty-state-body">{labels.noSuppliers}</div>
            </div>
          ) : (
            <>
              <Field label={labels.supplier}>
                <Select value={supplierId} onValueChange={setSupplierId} options={supplierOptions}>
                  <SelectTrigger aria-label={labels.supplier}>
                    <SelectValue placeholder={labels.supplierPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {supplierOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={labels.specVersion}>
                <Input
                  value={specVersion}
                  onChange={(e) => setSpecVersion(e.target.value)}
                  aria-label={labels.specVersion}
                />
              </Field>

              <div className="ff-inline">
                <Field label={labels.effectiveFrom}>
                  <Input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    aria-label={labels.effectiveFrom}
                  />
                </Field>
                <Field label={labels.expiryDate}>
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    aria-label={labels.expiryDate}
                  />
                </Field>
              </div>

              <Field label={labels.issuedDate}>
                <Input
                  type="date"
                  value={issuedDate}
                  onChange={(e) => setIssuedDate(e.target.value)}
                  aria-label={labels.issuedDate}
                />
              </Field>

              <div className="ff-inline">
                <Field label={labels.unitPrice}>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={unitPrice}
                    placeholder={labels.unitPricePlaceholder}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    aria-label={labels.unitPrice}
                    data-testid="supplier-spec-add-unit-price"
                  />
                </Field>
                <Field label={labels.priceCurrency}>
                  <Input
                    type="text"
                    value={priceCurrency}
                    placeholder={labels.priceCurrencyPlaceholder}
                    onChange={(e) => {
                      currencyTouchedRef.current = true;
                      setPriceCurrency(e.target.value.toUpperCase());
                    }}
                    aria-label={labels.priceCurrency}
                    data-testid="supplier-spec-add-price-currency"
                  />
                </Field>
              </div>

              <Field label={labels.document}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  aria-label={labels.document}
                  data-testid="supplier-spec-add-document"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                />
                <span className="muted" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                  {labels.documentHint}
                </span>
              </Field>

              <label className="flex items-center gap-2" style={{ marginTop: 4, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={approveNow}
                  onChange={(e) => setApproveNow(e.target.checked)}
                  data-testid="supplier-spec-add-approve"
                />
                <span>{labels.approveNow}</span>
              </label>
            </>
          )}
        </Modal>
      ) : null}
    </>
  );
}
