import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import type { LineMutationResult } from '../_actions/sites';
import type { SitesModalLabels } from '../sites-screen.client';
import { Field } from './Field';
import { mapError, STATUS_OPTIONS } from './modal-utils';

export function LineFormModal({
  title,
  labels,
  modalId,
  testId,
  initial,
  siteLabel,
  onClose,
  onSuccess,
  submit,
}: {
  title: string;
  labels: SitesModalLabels;
  modalId: string;
  testId: string;
  initial: { code: string; name: string; status: string };
  siteLabel: string;
  onClose: () => void;
  onSuccess: () => void;
  submit: (values: { code: string; name: string; status: string }) => Promise<LineMutationResult>;
}) {
  const [code, setCode] = React.useState(initial.code);
  const [name, setName] = React.useState(initial.name);
  const [status, setStatus] = React.useState(initial.status);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const valid = code.trim().length > 0 && name.trim().length > 0;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setError(null);
    setPending(true);
    try {
      const result = await submit({ code: code.trim(), name: name.trim(), status });
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
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId={modalId}>
      <Modal.Header title={title} />
      <form onSubmit={onSubmit} noValidate data-testid={testId}>
        <Modal.Body>
          {/*
            Sites line modal field set: code, name, site (read-only selected site), status.
            Warehouse is not exposed here because this screen's allowed create/update line
            actions only accept site_id/code/name/status.
          */}
          <Field id="line-code" label={labels.fieldLineCode} required requiredLabel={labels.required}>
            <input
              id="line-code"
              className="form-input mono"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
            />
          </Field>
          <Field id="line-name" label={labels.fieldName} required requiredLabel={labels.required}>
            <input
              id="line-name"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </Field>
          <Field id="line-site" label="Site" requiredLabel={labels.required}>
            <input
              id="line-site"
              className="form-input"
              value={siteLabel}
              readOnly
              aria-readonly="true"
            />
          </Field>
          <Field id="line-status" label={labels.fieldStatus} requiredLabel={labels.required}>
            <Select value={status} onValueChange={setStatus} id="line-status" aria-label={labels.fieldStatus}>
              <SelectTrigger className="form-input" aria-label={labels.fieldStatus}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
              {STATUS_OPTIONS(labels).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              </SelectContent>
            </Select>
          </Field>
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
          <button type="submit" className="btn btn-primary btn-sm" disabled={!valid || pending}>
            {pending ? labels.saving : labels.save}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
