import React from 'react';

import Modal from '@monopilot/ui/Modal';

import type { DeleteSiteInput, DeleteSiteResult, SiteRow } from '../_actions/sites';
import type { SitesModalLabels } from '../sites-screen.client';

export function DeleteSiteModal({ site, labels, action, onClose, onSuccess }: {
  site: SiteRow;
  labels: SitesModalLabels;
  action: (input: DeleteSiteInput) => Promise<DeleteSiteResult>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onDelete = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await action({ id: site.id });
      if (result.ok) onSuccess();
      else setError(result.message ?? labels.errorGeneric);
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="sitesDeleteSite">
      <Modal.Header title={labels.deleteSiteTitle ?? 'Delete site'} />
      <div data-testid="sites-delete-site-dialog">
        <Modal.Body>
          <p>{labels.deleteSiteConfirm ?? `Delete ${site.name}? This cannot be undone.`}</p>
          {error ? <div role="alert" className="alert alert-red">{error}</div> : null}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={pending}>{labels.cancel}</button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={pending}>{pending ? labels.saving : (labels.deleteSite ?? 'Delete site')}</button>
        </Modal.Footer>
      </div>
    </Modal>
  );
}
