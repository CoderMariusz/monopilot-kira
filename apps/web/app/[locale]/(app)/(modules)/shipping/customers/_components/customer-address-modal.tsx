'use client';

/**
 * Wave-shipping — Add / edit customer address modal.
 *
 * Prototype parity: customer-screens.jsx:210 (＋ Add address) + address table.
 */

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import type {
  AddressResult,
  CustomerAddress,
  CustomerAddressInput,
  CustomerAddressType,
  CustomerAddressUpdateInput,
} from './customer-types';

export type CustomerAddressModalLabels = {
  createTitle: string;
  editTitle: string;
  subtitle: string;
  typeLabel: string;
  typeOptions: Record<CustomerAddressType, string>;
  defaultLabel: string;
  defaultHelp: string;
  line1Label: string;
  line1Placeholder: string;
  line2Label: string;
  line2Placeholder: string;
  cityLabel: string;
  cityPlaceholder: string;
  stateLabel: string;
  statePlaceholder: string;
  postalLabel: string;
  postalPlaceholder: string;
  countryLabel: string;
  countryPlaceholder: string;
  notesLabel: string;
  notesPlaceholder: string;
  submitCreate: string;
  submitEdit: string;
  submitting: string;
  cancel: string;
  errors: {
    line1Required: string;
    cityRequired: string;
    postalRequired: string;
    countryInvalid: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    persistence_failed: string;
  };
};

type CreateAction = (input: CustomerAddressInput) => Promise<AddressResult>;
type UpdateAction = (input: CustomerAddressUpdateInput) => Promise<AddressResult>;

export type CustomerAddressModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  address?: CustomerAddress | null;
  labels: CustomerAddressModalLabels;
  createAddressAction: CreateAction;
  updateAddressAction: UpdateAction;
  onSaved: () => void;
};

const COUNTRY_RX = /^[A-Z]{2}$/;

export function CustomerAddressModal({
  open,
  onOpenChange,
  customerId,
  address,
  labels,
  createAddressAction,
  updateAddressAction,
  onSaved,
}: CustomerAddressModalProps) {
  const isEdit = Boolean(address);
  const [addressType, setAddressType] = React.useState<CustomerAddressType>('shipping');
  const [isDefault, setIsDefault] = React.useState(false);
  const [line1, setLine1] = React.useState('');
  const [line2, setLine2] = React.useState('');
  const [city, setCity] = React.useState('');
  const [state, setState] = React.useState('');
  const [postal, setPostal] = React.useState('');
  const [country, setCountry] = React.useState('GB');
  const [notes, setNotes] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (address) {
      setAddressType(address.addressType);
      setIsDefault(address.isDefault);
      setLine1(address.addressLine1);
      setLine2(address.addressLine2 ?? '');
      setCity(address.city);
      setState(address.state ?? '');
      setPostal(address.postalCode);
      setCountry(address.countryIso2);
      setNotes(address.notes ?? '');
    } else {
      setAddressType('shipping');
      setIsDefault(false);
      setLine1('');
      setLine2('');
      setCity('');
      setState('');
      setPostal('');
      setCountry('GB');
      setNotes('');
    }
    setPending(false);
    setFieldError(null);
  }, [open, address]);

  function validate(): string | null {
    if (line1.trim().length < 1) return labels.errors.line1Required;
    if (city.trim().length < 1) return labels.errors.cityRequired;
    if (postal.trim().length < 1) return labels.errors.postalRequired;
    if (!COUNTRY_RX.test(country.trim().toUpperCase())) return labels.errors.countryInvalid;
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

    const payload = {
      customerId,
      addressType,
      isDefault,
      addressLine1: line1.trim(),
      addressLine2: line2.trim() || undefined,
      city: city.trim(),
      state: state.trim() || undefined,
      postalCode: postal.trim(),
      countryIso2: country.trim().toUpperCase(),
      notes: notes.trim() || undefined,
    };

    try {
      const result = isEdit && address
        ? await updateAddressAction({ ...payload, addressId: address.id })
        : await createAddressAction(payload);
      if (!result.ok) {
        setFieldError(labels.errors[result.error as keyof typeof labels.errors] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      onSaved();
      onOpenChange(false);
    } catch {
      setFieldError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="customer_address_modal">
      <Modal.Header title={isEdit ? labels.editTitle : labels.createTitle} />
      <Modal.Body>
        <form id="customer-address-form" onSubmit={onSubmit} data-testid="customer-address-form" className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>
          {fieldError ? (
            <div role="alert" data-testid="customer-address-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fieldError}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.typeLabel}</span>
              <Select
                value={addressType}
                onValueChange={(v) => setAddressType(v as CustomerAddressType)}
                aria-label={labels.typeLabel}
                options={[
                  { value: 'shipping', label: labels.typeOptions.shipping },
                  { value: 'billing', label: labels.typeOptions.billing },
                ]}
              />
            </label>
            <label className="flex items-end gap-2 pb-1 text-sm text-slate-700">
              <input type="checkbox" checked={isDefault} data-testid="customer-address-default" onChange={(e) => setIsDefault(e.target.checked)} />
              <span>
                <span className="font-medium">{labels.defaultLabel}</span>{' '}
                <span className="text-slate-500">{labels.defaultHelp}</span>
              </span>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">{labels.line1Label}</span>
              <Input type="text" value={line1} data-testid="customer-address-line1" placeholder={labels.line1Placeholder} onChange={(e) => setLine1(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">{labels.line2Label}</span>
              <Input type="text" value={line2} data-testid="customer-address-line2" placeholder={labels.line2Placeholder} onChange={(e) => setLine2(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.cityLabel}</span>
              <Input type="text" value={city} data-testid="customer-address-city" placeholder={labels.cityPlaceholder} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.stateLabel}</span>
              <Input type="text" value={state} data-testid="customer-address-state" placeholder={labels.statePlaceholder} onChange={(e) => setState(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.postalLabel}</span>
              <Input type="text" value={postal} data-testid="customer-address-postal" placeholder={labels.postalPlaceholder} onChange={(e) => setPostal(e.target.value)} className="font-mono" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{labels.countryLabel}</span>
              <Input type="text" value={country} maxLength={2} data-testid="customer-address-country" placeholder={labels.countryPlaceholder} onChange={(e) => setCountry(e.target.value.toUpperCase())} className="font-mono uppercase" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">{labels.notesLabel}</span>
              <Input type="text" value={notes} data-testid="customer-address-notes" placeholder={labels.notesPlaceholder} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button type="submit" form="customer-address-form" className="btn--primary" data-testid="customer-address-submit" disabled={pending} aria-busy={pending}>
          {pending ? labels.submitting : isEdit ? labels.submitEdit : labels.submitCreate}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
