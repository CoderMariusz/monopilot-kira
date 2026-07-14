import React from 'react';

import Modal from '@monopilot/ui/Modal';

import type { RenameSiteInput, RenameSiteResult, SiteRow } from '../_actions/sites';
import type { SitesModalLabels } from '../sites-screen.client';
import { Field } from './Field';
import { mapError } from './modal-utils';

export function RenameSiteModal({ site, labels, action, onClose, onSuccess }: {
  site: SiteRow;
  labels: SitesModalLabels;
  action: (input: RenameSiteInput) => Promise<RenameSiteResult>;
  onClose: () => void;
  onSuccess: (name: string) => void;
}) {
  const [name, setName] = React.useState(site.name);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) return;
    setPending(true);
    setError(null);
    try {
      const result = await action({ id: site.id, name: nextName });
      if (result.ok) onSuccess(result.data.name);
      else setError(mapError(result.error, labels));
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="sitesRenameSite">
      <Modal.Header title={labels.renameSiteTitle ?? 'Rename site'} />
      <form onSubmit={onSubmit} noValidate data-testid="sites-rename-site-form">
        <Modal.Body>
          <Field id="rename-site-name" label={labels.fieldName} required requiredLabel={labels.required}>
            <input id="rename-site-name" className="form-input" value={name} onChange={(event) => setName(event.currentTarget.value)} />
          </Field>
          {error ? <div role="alert" className="alert alert-red">{error}</div> : null}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={pending}>{labels.cancel}</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim() || pending}>{pending ? labels.saving : labels.save}</button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
