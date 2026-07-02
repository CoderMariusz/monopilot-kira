'use client';

/**
 * Wave-shipping — Edit Customer modal (detail screen).
 *
 * Prototype parity: customer-screens.jsx:159 (✎ Edit) + modals.jsx M-01 fields.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import type {
  Customer,
  CustomerCategory,
  UpdateCustomerInput,
  UpdateCustomerResult,
} from './customer-types';

export type EditCustomerLabels = {
  title: string;
  subtitle: string;
  codeLabel: string;
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

export type EditCustomerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  labels: EditCustomerLabels;
  updateCustomerAction: (input: UpdateCustomerInput) => Promise<UpdateCustomerResult>;
  onUpdated: () => void;
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONEY_RX = /^\d+(?:\.\d{1,2})?$/;

export function EditCustomerModal({
  open,
  onOpenChange,
  customer,
  labels,
  updateCustomerAction,
  onUpdated,
}: EditCustomerModalProps) {
  const [code, setCode] = React.useState(customer.code);
  const [category, setCategory] = React.useState<CustomerCategory>(customer.category);
  const [name, setName] = React.useState(customer.name);
  const [email, setEmail] = React.useState(customer.email ?? '');
  const [phone, setPhone] = React.useState(customer.phone ?? '');
  const [taxId, setTaxId] = React.useState(customer.taxId ?? '');
  const [creditLimit, setCreditLimit] = React.useState(customer.creditLimitGbp ?? '');
  const [active, setActive] = React.useState(customer.isActive);
  const [pending, setPending] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCode(customer.code);
      setCategory(customer.category);
      setName(customer.name);
      setEmail(customer.email ?? '');
      setPhone(customer.phone ?? '');
      setTaxId(customer.taxId ?? '');
      setCreditLimit(customer.creditLimitGbp ?? '');
      setActive(customer.isActive);
      setPending(false);
      setFieldError(null);
    }
  }, [open, customer]);

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
      const result = await updateCustomerAction({
        customerId: customer.id,
        code: code.trim(),
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
      onUpdated();
      onOpenChange(false);
    } catch {
      setFieldError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="customer_edit_modal">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <form id="edit-customer-form" onSubmit={onSubmit} data-testid="edit-customer-form" className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>
          {fieldError ? (
            <div role="alert" data-testid="edit-customer-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fieldError}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.codeLabel}</span>
              <Input type="text" value={code} data-testid="edit-customer-code" onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" />
            </label>
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
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">{labels.nameLabel}</span>
              <Input type="text" value={name} data-testid="edit-customer-name" placeholder={labels.namePlaceholder} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.emailLabel}</span>
              <Input type="email" value={email} data-testid="edit-customer-email" placeholder={labels.emailPlaceholder} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.phoneLabel}</span>
              <Input type="tel" value={phone} data-testid="edit-customer-phone" placeholder={labels.phonePlaceholder} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.taxIdLabel}</span>
              <Input type="text" value={taxId} data-testid="edit-customer-tax-id" placeholder={labels.taxIdPlaceholder} onChange={(e) => setTaxId(e.target.value)} className="font-mono" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.creditLimitLabel}</span>
              <Input type="text" inputMode="decimal" value={creditLimit} data-testid="edit-customer-credit-limit" placeholder={labels.creditLimitPlaceholder} onChange={(e) => setCreditLimit(e.target.value)} className="text-right font-mono" />
              <span className="text-xs text-slate-400">{labels.creditLimitHelp}</span>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={active} data-testid="edit-customer-active" onChange={(e) => setActive(e.target.checked)} />
            <span>
              <span className="font-medium">{labels.activeLabel}</span>{' '}
              <span className="text-slate-500">{labels.activeHelp}</span>
            </span>
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="edit-customer-cancel" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button type="submit" form="edit-customer-form" className="btn--primary" data-testid="edit-customer-submit" disabled={pending} aria-busy={pending}>
          {pending ? labels.submitting : labels.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
