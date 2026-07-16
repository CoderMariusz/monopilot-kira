import React from 'react';

import Modal from '@monopilot/ui/Modal';

import { LineCreateFields, type CreateLineInput as InfraCreateLineInput } from '../../infra/lines/lines-screen.client';
import type { LineFormOptions } from '../_actions/sites';
import type { CreateLineAction, SitesModalLabels } from '../sites-screen.client';
import { mapError, toLineLabels, warehouseMatchesLineSite } from './modal-utils';

export function AddLineModal({
  labels,
  siteId,
  siteLabel,
  options,
  action,
  onClose,
  onSuccess,
}: {
  labels: SitesModalLabels;
  siteId: string;
  siteLabel: string;
  options: LineFormOptions;
  action?: CreateLineAction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const lineLabels = React.useMemo(() => toLineLabels(labels), [labels]);
  const [line, setLine] = React.useState<InfraCreateLineInput>({
    siteId,
    warehouseId: null,
    defaultOutputLocationId: null,
    code: '',
    name: '',
    status: 'active',
  });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const valid = line.code.trim().length > 0 && line.name.trim().length > 0;

  React.useEffect(() => {
    setLine((current) => ({ ...current, siteId }));
  }, [siteId]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || !action) return;
    setError(null);
    setPending(true);
    try {
      const result = await action({
        site_id: siteId,
        siteId,
        warehouseId: line.warehouseId ?? null,
        defaultOutputLocationId: line.defaultOutputLocationId ?? null,
        code: line.code.trim(),
        name: line.name.trim(),
        status: line.status,
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
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="sitesAddLine">
      <Modal.Header title={labels.addLineTitle} />
      <form onSubmit={onSubmit} noValidate data-testid="sites-add-line-form">
        <Modal.Body>
          <div className="mt-4 space-y-4">
            <LineCreateFields
              labels={lineLabels}
              value={line}
              sites={options.sites}
              warehouses={options.warehouses.filter((warehouse) => warehouseMatchesLineSite(warehouse.siteId, siteId))}
              locations={options.locations}
              pending={pending}
              siteReadOnlyLabel={siteLabel}
              onChange={setLine}
            />
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
