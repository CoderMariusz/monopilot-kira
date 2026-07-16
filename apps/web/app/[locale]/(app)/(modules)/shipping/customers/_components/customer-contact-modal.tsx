'use client';

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import type {
  ContactResult,
  CustomerContact,
  CustomerContactInput,
  CustomerContactUpdateInput,
} from './customer-types';

export type CustomerContactModalLabels = {
  createTitle: string;
  editTitle: string;
  subtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  titleLabel: string;
  titlePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  primaryLabel: string;
  primaryHelp: string;
  submitCreate: string;
  submitEdit: string;
  submitting: string;
  cancel: string;
  errors: {
    nameRequired: string;
    emailInvalid: string;
    invalid_input: string;
    forbidden: string;
    not_found: string;
    persistence_failed: string;
  };
};

type CreateAction = (input: CustomerContactInput) => Promise<ContactResult>;
type UpdateAction = (input: CustomerContactUpdateInput) => Promise<ContactResult>;

export type CustomerContactModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  contact?: CustomerContact | null;
  labels: CustomerContactModalLabels;
  createContactAction: CreateAction;
  updateContactAction: UpdateAction;
  onSaved: () => void;
};

export function CustomerContactModal({
  open,
  onOpenChange,
  customerId,
  contact,
  labels,
  createContactAction,
  updateContactAction,
  onSaved,
}: CustomerContactModalProps) {
  const isEdit = Boolean(contact);
  const [name, setName] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [isPrimary, setIsPrimary] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setFieldError(null);
    if (contact) {
      setName(contact.name);
      setTitle(contact.title ?? '');
      setEmail(contact.email ?? '');
      setPhone(contact.phone ?? '');
      setIsPrimary(contact.isPrimary);
    } else {
      setName('');
      setTitle('');
      setEmail('');
      setPhone('');
      setIsPrimary(false);
    }
  }, [open, contact]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFieldError(labels.errors.nameRequired);
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError(labels.errors.emailInvalid);
      return;
    }

    setPending(true);
    setFieldError(null);
    const payload = {
      customerId,
      name: name.trim(),
      title: title.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      isPrimary,
    };
    const result = isEdit
      ? await updateContactAction({ ...payload, contactId: contact!.id })
      : await createContactAction(payload);
    setPending(false);

    if (!result.ok) {
      setFieldError(labels.errors[result.error as keyof typeof labels.errors] ?? labels.errors.persistence_failed);
      return;
    }

    onSaved();
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" modalId="customer_contact_modal">
      <Modal.Header title={isEdit ? labels.editTitle : labels.createTitle} />
      <Modal.Body>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" data-testid="customer-contact-modal">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.nameLabel}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={labels.namePlaceholder} data-testid="customer-contact-name" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.titleLabel}</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={labels.titlePlaceholder} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.emailLabel}</span>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={labels.emailPlaceholder} type="email" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">{labels.phoneLabel}</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={labels.phonePlaceholder} />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} data-testid="customer-contact-primary" />
            <span>
              {labels.primaryLabel}
              <span className="block text-xs text-slate-500">{labels.primaryHelp}</span>
            </span>
          </label>
          {fieldError ? (
            <p role="alert" className="text-sm text-red-600" data-testid="customer-contact-error">
              {fieldError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" className="btn--ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn--primary" disabled={pending} data-testid="customer-contact-submit">
              {pending ? labels.submitting : isEdit ? labels.submitEdit : labels.submitCreate}
            </Button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
}
