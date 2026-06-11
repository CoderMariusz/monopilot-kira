'use client';

/**
 * P2-PLANNING — Create Supplier modal.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/planning/
 *   suppliers.jsx:409-515 (supplier_form_modal) — the "Create supplier" dense
 *   form (code / name / currency / lead time / status / email / phone / country /
 *   notes) with inline Zod-style field validation and a disabled-until-valid
 *   primary action.
 *
 * Deviations (documented for parity evidence):
 *   - The prototype's rating / certifications / payment-terms-select / "Active"
 *     checkbox + D365-drift warning are dropped: the reviewed SupplierCreateInput
 *     (procurement-shared.ts) accepts only code/name/contact(jsonb)/currency/
 *     leadTimeDays/status/notes. Email / phone / country are written into the
 *     `contact` jsonb (the schema's free-form record), not first-class columns.
 *   - "Active" boolean becomes the real 3-state Status select (active/inactive/
 *     blocked) the action's enum exposes.
 *
 * The action is the source of truth: this surfaces its result and maps
 * already_exists / invalid_input / forbidden / persistence_failed to honest inline
 * states. RBAC is enforced server-side inside createSupplier — never a client flag.
 *
 * UI states: idle, optimistic (pending — submit disabled + busy), success (close +
 * onCreated), error (mapped inline alert).
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';
import { Select } from '@monopilot/ui/Select';

import type { CreateSupplierResult, SupplierStatus } from './supplier-types';

export type CreateSupplierLabels = {
  title: string;
  subtitle: string;
  codeLabel: string;
  codePlaceholder: string;
  nameLabel: string;
  namePlaceholder: string;
  currencyLabel: string;
  leadTimeLabel: string;
  leadTimePlaceholder: string;
  statusLabel: string;
  statusOptions: Record<SupplierStatus, string>;
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
    codeRequired: string;
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
    // W9-K-II/RF5: present in the shared ProcurementError union (TO ship/cancel);
    // supplier flows never return these, so the labels are optional and fall
    // back below.
    insufficient_stock?: string;
    partially_received?: string;
    persistence_failed: string;
  };
};

export type CreateSupplierModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: CreateSupplierLabels;
  /** Server Action seam (passed from the RSC; never authored here). */
  createSupplierAction: (input: {
    code: string;
    name: string;
    currency: string;
    leadTimeDays: number;
    status: SupplierStatus;
    contact?: Record<string, unknown>;
    notes?: string;
  }) => Promise<CreateSupplierResult>;
  onCreated: (result: Extract<CreateSupplierResult, { ok: true }>) => void;
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_RX = /^[A-Z]{2}$/;
const CURRENCY_RX = /^[A-Z]{3}$/;

export function CreateSupplierModal({ open, onOpenChange, labels, createSupplierAction, onCreated }: CreateSupplierModalProps) {
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [currency, setCurrency] = React.useState('EUR');
  const [leadTime, setLeadTime] = React.useState('7');
  const [status, setStatus] = React.useState<SupplierStatus>('active');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [country, setCountry] = React.useState('');
  const [notes, setNotes] = React.useState('');

  const [pending, setPending] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setCode('');
      setName('');
      setCurrency('EUR');
      setLeadTime('7');
      setStatus('active');
      setEmail('');
      setPhone('');
      setCountry('');
      setNotes('');
      setPending(false);
      setFieldError(null);
    }
  }, [open]);

  function validate(): string | null {
    if (!code.trim()) return labels.errors.codeRequired;
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

    const contact: Record<string, unknown> = {};
    if (email.trim()) contact.email = email.trim();
    if (phone.trim()) contact.phone = phone.trim();
    if (country.trim()) contact.country = country.trim().toUpperCase();

    setPending(true);
    try {
      const result = await createSupplierAction({
        code: code.trim(),
        name: name.trim(),
        currency: currency.trim().toUpperCase(),
        leadTimeDays: Number(leadTime),
        status,
        contact: Object.keys(contact).length ? contact : undefined,
        notes: notes.trim() || undefined,
      });
      if (!result.ok) {
        setFieldError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      onCreated(result);
      onOpenChange(false);
    } catch {
      setFieldError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="supplier_form_modal">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="create-supplier-form" onSubmit={onSubmit} data-testid="create-supplier-form" className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {fieldError ? (
            <div role="alert" data-testid="create-supplier-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fieldError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Supplier code */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.codeLabel}</span>
              <Input
                type="text"
                value={code}
                data-testid="create-supplier-code"
                placeholder={labels.codePlaceholder}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </label>

            {/* Name */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.nameLabel}</span>
              <Input
                type="text"
                value={name}
                data-testid="create-supplier-name"
                placeholder={labels.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            {/* Currency */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.currencyLabel}</span>
              <Select
                value={currency}
                onValueChange={setCurrency}
                aria-label={labels.currencyLabel}
                options={[
                  { value: 'EUR', label: 'EUR' },
                  { value: 'GBP', label: 'GBP' },
                  { value: 'PLN', label: 'PLN' },
                  { value: 'USD', label: 'USD' },
                ]}
              />
            </label>

            {/* Lead time */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.leadTimeLabel}</span>
              <Input
                type="number"
                min={0}
                max={3650}
                value={leadTime}
                data-testid="create-supplier-lead-time"
                placeholder={labels.leadTimePlaceholder}
                onChange={(e) => setLeadTime(e.target.value)}
              />
            </label>

            {/* Status */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.statusLabel}</span>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as SupplierStatus)}
                aria-label={labels.statusLabel}
                options={[
                  { value: 'active', label: labels.statusOptions.active },
                  { value: 'inactive', label: labels.statusOptions.inactive },
                  { value: 'blocked', label: labels.statusOptions.blocked },
                ]}
              />
            </label>

            {/* Country */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.countryLabel}</span>
              <Input
                type="text"
                value={country}
                maxLength={2}
                data-testid="create-supplier-country"
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
                data-testid="create-supplier-email"
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
                data-testid="create-supplier-phone"
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
              data-testid="create-supplier-notes"
              placeholder={labels.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm"
            />
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="create-supplier-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="create-supplier-form"
          className="btn--primary"
          data-testid="create-supplier-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
