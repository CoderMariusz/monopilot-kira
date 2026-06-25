'use client';

/**
 * P2-PLANNING — Edit Supplier modal.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/planning/
 *   suppliers.jsx:409-515 (SupplierFormModal, `mode === "edit"`) — the SAME dense
 *   supplier form the create flow uses, opened from the detail header's "Edit"
 *   button (suppliers.jsx:197). In edit mode the prototype: pre-fills every field
 *   from the supplier, disables `code` (immutable natural key), and titles the modal
 *   "Edit supplier — {code}" with the "Changes take effect immediately · audit
 *   logged" subtitle. We mirror that 1:1.
 *
 * This is a deliberate, near-exact mirror of CreateSupplierModal (same shadcn/ui
 * form components, same grid, same inline Zod-style validation, same disabled-while-
 * pending primary action, same inline error mapping) so the two modals stay visually
 * and behaviourally identical — only the seam (updateSupplier), the read-only code,
 * the pre-fill, and the pass-through status differ.
 *
 * Status handling: updateSupplier REQUIRES `status` in its input, but the detail view
 * already owns status via the separate transitionSupplierStatus control. So this modal
 * does NOT expose a second status editor — it threads the supplier's CURRENT status
 * through unchanged. `code` is immutable (the backend ignores it) and is shown disabled.
 *
 * The action is the source of truth: this surfaces its result and maps
 * already_exists / not_found / invalid_input / forbidden / persistence_failed to
 * honest inline states. RBAC is enforced server-side inside updateSupplier — never a
 * client flag.
 *
 * UI states: idle, optimistic (pending — submit disabled + busy), success (close +
 * onUpdated), error (mapped inline alert).
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import { contactField, type Supplier, type UpdateSupplierResult, type SupplierStatus } from './supplier-types';

export type EditSupplierLabels = {
  title: string;
  subtitle: string;
  codeLabel: string;
  codeHint: string;
  nameLabel: string;
  namePlaceholder: string;
  currencyLabel: string;
  leadTimeLabel: string;
  leadTimePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  countryLabel: string;
  countryPlaceholder: string;
  notesLabel: string;
  notesPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  errors: {
    nameRequired: string;
    currencyRequired: string;
    leadTimeRange: string;
    emailInvalid: string;
    countryInvalid: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    already_exists: string;
    invalid_state: string;
    // Present in the shared SupplierError union (TO ship/cancel); supplier update
    // never returns these, so they are optional and fall back to persistence_failed.
    insufficient_stock?: string;
    partially_received?: string;
    persistence_failed: string;
  };
};

export type EditSupplierModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The supplier being edited — source of the pre-fill + the pass-through status/code. */
  supplier: Supplier;
  labels: EditSupplierLabels;
  /** Server Action seam (passed from the RSC; never authored here). */
  updateSupplierAction: (input: {
    id: string;
    code: string;
    name: string;
    currency: string;
    leadTimeDays: number;
    status: SupplierStatus;
    contact?: Record<string, unknown>;
    notes?: string;
  }) => Promise<UpdateSupplierResult>;
  onUpdated: (result: Extract<UpdateSupplierResult, { ok: true }>) => void;
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_RX = /^[A-Z]{2}$/;
const CURRENCY_RX = /^[A-Z]{3}$/;

const CURRENCY_OPTIONS = ['EUR', 'GBP', 'PLN', 'USD'];

export function EditSupplierModal({ open, onOpenChange, supplier, labels, updateSupplierAction, onUpdated }: EditSupplierModalProps) {
  const [name, setName] = React.useState(supplier.name);
  const [currency, setCurrency] = React.useState(supplier.currency);
  const [leadTime, setLeadTime] = React.useState(String(supplier.leadTimeDays));
  const [email, setEmail] = React.useState(contactField(supplier.contact, 'email') ?? '');
  const [phone, setPhone] = React.useState(contactField(supplier.contact, 'phone') ?? '');
  const [country, setCountry] = React.useState(contactField(supplier.contact, 'country') ?? '');
  const [notes, setNotes] = React.useState(supplier.notes ?? '');

  const [pending, setPending] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  // Re-seed the form whenever the modal (re)opens or the underlying supplier changes,
  // mirroring the prototype's `useEffect([open, mode, supplier?.id])` re-fill.
  React.useEffect(() => {
    if (!open) {
      setPending(false);
      setFieldError(null);
      return;
    }
    setName(supplier.name);
    setCurrency(supplier.currency);
    setLeadTime(String(supplier.leadTimeDays));
    setEmail(contactField(supplier.contact, 'email') ?? '');
    setPhone(contactField(supplier.contact, 'phone') ?? '');
    setCountry(contactField(supplier.contact, 'country') ?? '');
    setNotes(supplier.notes ?? '');
    setPending(false);
    setFieldError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier.id]);

  // Currency may be a code outside the four common options (free-form text column);
  // keep the supplier's actual value selectable so editing other fields never silently
  // rewrites it.
  const currencyOptions = React.useMemo(() => {
    const opts = CURRENCY_OPTIONS.map((c) => ({ value: c, label: c }));
    const current = (supplier.currency || '').toUpperCase();
    if (current && !CURRENCY_OPTIONS.includes(current)) opts.unshift({ value: current, label: current });
    return opts;
  }, [supplier.currency]);

  function validate(): string | null {
    if (name.trim().length < 2) return labels.errors.nameRequired;
    if (!CURRENCY_RX.test(currency.trim().toUpperCase())) return labels.errors.currencyRequired;
    const days = Number(leadTime);
    if (!Number.isInteger(days) || days < 0 || days > 3650) return labels.errors.leadTimeRange;
    if (email.trim() && !EMAIL_RX.test(email.trim())) return labels.errors.emailInvalid;
    if (country.trim() && !COUNTRY_RX.test(country.trim().toUpperCase())) return labels.errors.countryInvalid;
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError(null);

    // Preserve any extra contact sub-fields the create modal does not expose
    // (e.g. paymentTerms) so editing never silently drops them.
    const contact: Record<string, unknown> = { ...supplier.contact };
    delete contact.email;
    delete contact.phone;
    delete contact.country;
    if (email.trim()) contact.email = email.trim();
    if (phone.trim()) contact.phone = phone.trim();
    if (country.trim()) contact.country = country.trim().toUpperCase();

    setPending(true);
    try {
      const result = await updateSupplierAction({
        id: supplier.id,
        // `code` is immutable — sent for the input shape but ignored by the backend.
        code: supplier.code,
        name: name.trim(),
        currency: currency.trim().toUpperCase(),
        leadTimeDays: Number(leadTime),
        // Thread the CURRENT status through unchanged — status is owned by the
        // separate transitionSupplierStatus control, not this form.
        status: supplier.status.toLowerCase() as SupplierStatus,
        contact: Object.keys(contact).length ? contact : undefined,
        notes: notes.trim() || undefined,
      });
      if (!result.ok) {
        setFieldError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      onUpdated(result);
      onOpenChange(false);
    } catch {
      setFieldError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="supplier_form_modal">
      <Modal.Header title={`${labels.title} — ${supplier.code}`} />
      <Modal.Body>
        <form id="edit-supplier-form" onSubmit={onSubmit} data-testid="edit-supplier-form" className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {fieldError ? (
            <div role="alert" data-testid="edit-supplier-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fieldError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Supplier code — IMMUTABLE natural key, shown read-only (parity: code disabled in edit mode) */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.codeLabel}</span>
              <Input type="text" value={supplier.code} data-testid="edit-supplier-code" disabled readOnly aria-readonly="true" />
              <span className="text-xs text-slate-400">{labels.codeHint}</span>
            </label>

            {/* Name */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.nameLabel}</span>
              <Input
                type="text"
                value={name}
                data-testid="edit-supplier-name"
                placeholder={labels.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            {/* Currency */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.currencyLabel}</span>
              <Select value={currency} onValueChange={setCurrency} aria-label={labels.currencyLabel} options={currencyOptions} />
            </label>

            {/* Lead time */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.leadTimeLabel}</span>
              <Input
                type="number"
                min={0}
                max={3650}
                value={leadTime}
                data-testid="edit-supplier-lead-time"
                placeholder={labels.leadTimePlaceholder}
                onChange={(e) => setLeadTime(e.target.value)}
              />
            </label>

            {/* Country */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.countryLabel}</span>
              <Input
                type="text"
                value={country}
                maxLength={2}
                data-testid="edit-supplier-country"
                placeholder={labels.countryPlaceholder}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
              />
            </label>

            {/* Email */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.emailLabel}</span>
              <Input
                type="email"
                value={email}
                data-testid="edit-supplier-email"
                placeholder={labels.emailPlaceholder}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            {/* Phone */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.phoneLabel}</span>
              <Input
                type="tel"
                value={phone}
                data-testid="edit-supplier-phone"
                placeholder={labels.phonePlaceholder}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>

          {/* Notes */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
            <Textarea
              value={notes}
              data-testid="edit-supplier-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm"
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="edit-supplier-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="edit-supplier-form"
          className="btn--primary"
          data-testid="edit-supplier-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
