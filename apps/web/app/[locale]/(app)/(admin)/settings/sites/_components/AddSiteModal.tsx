import React from 'react';

import Modal from '@monopilot/ui/Modal';

import type { CreateSiteAction, SitesModalLabels } from '../sites-screen.client';
import { Field } from './Field';
import { mapError } from './modal-utils';

/**
 * Schema field path (as returned by the server) → the input it belongs to. The
 * error used to render as a single alert at the BOTTOM of a scrollable
 * `Modal.Body` (max-height 86vh), below six fields — so on a short viewport the
 * user pressed Save and saw nothing change. Anchoring it to the field that was
 * actually rejected puts the message where the fix is.
 */
const FIELD_INPUT_IDS: Record<string, string> = {
  site_code: 'site-code',
  name: 'site-name',
  timezone: 'site-timezone',
  country: 'site-country',
  legal_entity: 'site-legal-entity',
};

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
  const [errorField, setErrorField] = React.useState<string | null>(null);

  const valid = code.trim().length > 0 && name.trim().length > 0;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || !action) return;
    setError(null);
    setErrorField(null);
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
        setError(mapError(result.error, labels, result.message));
        setErrorField(result.field ?? null);
        // Focus moves the offending input into view even when the body is
        // scrolled, and hands the keyboard straight to the field to correct.
        const inputId = result.field ? FIELD_INPUT_IDS[result.field] : undefined;
        if (inputId) document.getElementById(inputId)?.focus();
      }
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  const anchoredField = error && errorField && FIELD_INPUT_IDS[errorField] ? errorField : null;
  const errorAlert = (
    <div role="alert" className="alert alert-red" data-testid="sites-modal-error">
      {error}
    </div>
  );
  const fieldError = (field: string) => (anchoredField === field ? errorAlert : null);

  return (
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="sitesAddSite">
      <Modal.Header title={labels.addSiteTitle} />
      <form onSubmit={onSubmit} noValidate data-testid="sites-add-site-form">
        <Modal.Body>
          {/* Unanchored errors stay at the TOP of the scrollable body so they
              are visible without scrolling; anchored ones render at the field. */}
          {error && !anchoredField ? errorAlert : null}
          <Field id="site-code" label={labels.fieldSiteCode} required requiredLabel={labels.required}>
            <input
              id="site-code"
              className="form-input mono"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
            />
          </Field>
          {fieldError('site_code')}
          <Field id="site-name" label={labels.fieldName} required requiredLabel={labels.required}>
            <input
              id="site-name"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </Field>
          {fieldError('name')}
          <Field id="site-timezone" label={labels.fieldTimezone} requiredLabel={labels.required}>
            <input
              id="site-timezone"
              className="form-input"
              value={timezone}
              onChange={(e) => setTimezone(e.currentTarget.value)}
            />
          </Field>
          {fieldError('timezone')}
          <Field id="site-country" label={labels.fieldCountry} requiredLabel={labels.required}>
            <input
              id="site-country"
              className="form-input"
              value={country}
              onChange={(e) => setCountry(e.currentTarget.value)}
            />
          </Field>
          {fieldError('country')}
          <Field id="site-legal-entity" label={labels.fieldLegalEntity} requiredLabel={labels.required}>
            <input
              id="site-legal-entity"
              className="form-input"
              value={legalEntity}
              onChange={(e) => setLegalEntity(e.currentTarget.value)}
            />
          </Field>
          {fieldError('legal_entity')}
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
