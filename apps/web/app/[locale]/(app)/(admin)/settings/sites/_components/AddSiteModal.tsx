import React from 'react';

import Modal from '@monopilot/ui/Modal';

import type { CreateSiteAction, SitesModalLabels } from '../sites-screen.client';
import { Field } from './Field';
import { mapError } from './modal-utils';

export function AddSiteModal({
  labels,
  action,
  onClose,
  onSuccess,
}: {
  labels: SitesModalLabels;
  action?: CreateSiteAction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [timezone, setTimezone] = React.useState('UTC');
  const [country, setCountry] = React.useState('');
  const [legalEntity, setLegalEntity] = React.useState('');
  const [isPrimary, setIsPrimary] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const valid = code.trim().length > 0 && name.trim().length > 0;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || !action) return;
    setError(null);
    setPending(true);
    try {
      const result = await action({
        site_code: code.trim(),
        name: name.trim(),
        timezone: timezone.trim() || 'UTC',
        country: country.trim() || null,
        legal_entity: legalEntity.trim() || null,
        is_default: isPrimary,
      });
      if (result.ok) {
        onSuccess();
      } else {
        setError(mapError(result.error, labels));
      }
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="sitesAddSite">
      <Modal.Header title={labels.addSiteTitle} />
      <form onSubmit={onSubmit} noValidate data-testid="sites-add-site-form">
        <Modal.Body>
          <Field id="site-code" label={labels.fieldSiteCode} required requiredLabel={labels.required}>
            <input
              id="site-code"
              className="form-input mono"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
            />
          </Field>
          <Field id="site-name" label={labels.fieldName} required requiredLabel={labels.required}>
            <input
              id="site-name"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </Field>
          <Field id="site-timezone" label={labels.fieldTimezone} requiredLabel={labels.required}>
            <input
              id="site-timezone"
              className="form-input"
              value={timezone}
              onChange={(e) => setTimezone(e.currentTarget.value)}
            />
          </Field>
          <Field id="site-country" label={labels.fieldCountry} requiredLabel={labels.required}>
            <input
              id="site-country"
              className="form-input"
              value={country}
              onChange={(e) => setCountry(e.currentTarget.value)}
            />
          </Field>
          <Field id="site-legal-entity" label={labels.fieldLegalEntity} requiredLabel={labels.required}>
            <input
              id="site-legal-entity"
              className="form-input"
              value={legalEntity}
              onChange={(e) => setLegalEntity(e.currentTarget.value)}
            />
          </Field>
          <div className="ff">
            <label htmlFor="site-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="site-primary"
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.currentTarget.checked)}
              />
              {labels.fieldPrimary}
            </label>
          </div>
          {error ? (
            <div role="alert" className="alert alert-red" data-testid="sites-modal-error">
              {error}
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={pending}>
            {labels.cancel}
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!valid || pending || !action}>
            {pending ? labels.saving : labels.save}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
