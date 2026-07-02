'use client';

/**
 * Wave-shipping — Create Customer modal.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/shipping/
 *   modals.jsx:36-66 (M-01 customer create / edit) — the "Create customer" dense
 *   form (code [auto if blank] / category / full name / email / phone / tax ID /
 *   credit limit / active) with disabled-until-pending primary action.
 *
 * Deviations (documented for parity evidence):
 *   - Trading name / payment terms / notes are dropped: the real public.customers
 *     master (mig 211 / 288 — see customer-types.ts) has NO column for them
 *     (customers = customer_code/name/email/phone/tax_id/category/credit_limit_gbp/
 *     is_active). Allergen restrictions / addresses are their own child tables and
 *     are out of scope for the create form (added on the detail screen in a later
 *     wave).
 *   - "Customer code · auto-generated if blank · CUST-YYYY-NNNNN" is honoured: the
 *     code field is optional and the createCustomer action generates the next
 *     org-scoped CUST-YYYY-NNNNN when blank (matches the prototype help text + the
 *     SO/PO/TO org-document-number convention).
 *   - Category becomes the real 3-state Select (retail/wholesale/distributor) the
 *     customers_category_check enum exposes — never a raw <select>.
 *
 * The action is the source of truth: this surfaces its result and maps
 * already_exists / invalid_input / forbidden / persistence_failed to honest inline
 * states. RBAC (ship.so.create) is enforced server-side inside createCustomer —
 * never a client flag.
 *
 * UI states: idle, optimistic (pending — submit disabled + busy), success (close +
 * onCreated), error (mapped inline alert).
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import type { CreateCustomerInput, CreateCustomerResult, CustomerCategory } from './customer-types';

export type CreateCustomerLabels = {
  title: string;
  subtitle: string;
  codeLabel: string;
  codeHelp: string;
  codePlaceholder: string;
  categoryLabel: string;
  categoryOptions: Record<CustomerCategory, string>;
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  taxIdLabel: string;
  taxIdPlaceholder: string;
  creditLimitLabel: string;
  creditLimitHelp: string;
  creditLimitPlaceholder: string;
  activeLabel: string;
  activeHelp: string;
  submit: string;
  submitting: string;
  cancel: string;
  errors: {
    nameRequired: string;
    emailInvalid: string;
    creditLimitInvalid: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    already_exists: string;
    address_in_use: string;
    persistence_failed: string;
  };
};

export type CreateCustomerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: CreateCustomerLabels;
  /** Server Action seam (passed from the RSC; never authored here). */
  createCustomerAction: (input: CreateCustomerInput) => Promise<CreateCustomerResult>;
  onCreated: (result: Extract<CreateCustomerResult, { ok: true }>) => void;
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONEY_RX = /^\d+(?:\.\d{1,2})?$/;

export function CreateCustomerModal({ open, onOpenChange, labels, createCustomerAction, onCreated }: CreateCustomerModalProps) {
  const [code, setCode] = React.useState('');
  const [category, setCategory] = React.useState<CustomerCategory>('retail');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [taxId, setTaxId] = React.useState('');
  const [creditLimit, setCreditLimit] = React.useState('');
  const [active, setActive] = React.useState(true);

  const [pending, setPending] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setCode('');
      setCategory('retail');
      setName('');
      setEmail('');
      setPhone('');
      setTaxId('');
      setCreditLimit('');
      setActive(true);
      setPending(false);
      setFieldError(null);
    }
  }, [open]);

  function validate(): string | null {
    if (name.trim().length < 2) return labels.errors.nameRequired;
    if (email.trim() && !EMAIL_RX.test(email.trim())) return labels.errors.emailInvalid;
    if (creditLimit.trim() && !MONEY_RX.test(creditLimit.trim())) return labels.errors.creditLimitInvalid;
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

    setPending(true);
    try {
      const result = await createCustomerAction({
        code: code.trim() || undefined,
        name: name.trim(),
        category,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        taxId: taxId.trim() || undefined,
        creditLimitGbp: creditLimit.trim() || undefined,
        isActive: active,
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
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="customer_create_modal">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="create-customer-form" onSubmit={onSubmit} data-testid="create-customer-form" className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {fieldError ? (
            <div role="alert" data-testid="create-customer-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fieldError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Customer code (auto-generated if blank) */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.codeLabel}</span>
              <Input
                type="text"
                value={code}
                data-testid="create-customer-code"
                placeholder={labels.codePlaceholder}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-mono"
              />
              <span className="text-xs text-slate-400">{labels.codeHelp}</span>
            </label>

            {/* Category */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.categoryLabel}</span>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as CustomerCategory)}
                aria-label={labels.categoryLabel}
                options={[
                  { value: 'retail', label: labels.categoryOptions.retail },
                  { value: 'wholesale', label: labels.categoryOptions.wholesale },
                  { value: 'distributor', label: labels.categoryOptions.distributor },
                ]}
              />
            </label>

            {/* Full name */}
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">{labels.nameLabel}</span>
              <Input
                type="text"
                value={name}
                maxLength={255}
                data-testid="create-customer-name"
                placeholder={labels.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            {/* Email */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.emailLabel}</span>
              <Input
                type="email"
                value={email}
                data-testid="create-customer-email"
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
                data-testid="create-customer-phone"
                placeholder={labels.phonePlaceholder}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>

            {/* Tax ID */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.taxIdLabel}</span>
              <Input
                type="text"
                value={taxId}
                data-testid="create-customer-tax-id"
                placeholder={labels.taxIdPlaceholder}
                onChange={(e) => setTaxId(e.target.value)}
                className="font-mono"
              />
            </label>

            {/* Credit limit (GBP) */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.creditLimitLabel}</span>
              <Input
                type="text"
                inputMode="decimal"
                value={creditLimit}
                data-testid="create-customer-credit-limit"
                placeholder={labels.creditLimitPlaceholder}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="text-right font-mono"
              />
              <span className="text-xs text-slate-400">{labels.creditLimitHelp}</span>
            </label>
          </div>

          {/* Active */}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={active}
              data-testid="create-customer-active"
              onChange={(e) => setActive(e.target.checked)}
            />
            <span>
              <span className="font-medium">{labels.activeLabel}</span>{' '}
              <span className="text-slate-500">{labels.activeHelp}</span>
            </span>
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="create-customer-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          form="create-customer-form"
          className="btn--primary"
          data-testid="create-customer-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
