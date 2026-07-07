import React from 'react';

import Modal from '@monopilot/ui/Modal';

import type { SiteRow, SiteSettings, SiteSettingsMutationResult } from '../_actions/sites';
import type { SitesModalLabels } from '../sites-screen.client';
import { Field } from './Field';

export type UpdateSiteSettingsAction = (
  orgId: string,
  siteId: string,
  settings: Partial<SiteSettings>,
) => Promise<SiteSettingsMutationResult>;

function mapSettingsError(
  error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed',
  labels: SitesModalLabels,
): string {
  if (error === 'invalid_input') return labels.errorRequired;
  if (error === 'forbidden') return labels.errorForbidden;
  return labels.errorGeneric;
}

export function EditSiteSettingsModal({
  site,
  labels,
  action,
  onClose,
  onSuccess,
}: {
  site: SiteRow;
  labels: SitesModalLabels;
  action?: UpdateSiteSettingsAction;
  onClose: () => void;
  onSuccess: (site: SiteRow) => void;
}) {
  const [primary, setPrimary] = React.useState(site.settings.primary);
  const [operatingHours, setOperatingHours] = React.useState(site.settings.operating_hours);
  const [haccpEnabled, setHaccpEnabled] = React.useState(site.settings.haccp_enabled);
  const [haccpValidUntil, setHaccpValidUntil] = React.useState(site.settings.haccp_valid_until ?? '');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const valid = operatingHours.trim().length > 0 && (!haccpEnabled || /^\d{4}-\d{2}-\d{2}$/.test(haccpValidUntil.trim()));

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || !action) return;
    setError(null);
    setPending(true);
    try {
      const result = await action(site.org_id, site.id, {
        primary,
        operating_hours: operatingHours.trim(),
        haccp_enabled: haccpEnabled,
        haccp_valid_until: haccpEnabled ? haccpValidUntil.trim() : null,
      });
      if (result.ok) {
        onSuccess(result.data);
      } else {
        setError(mapSettingsError(result.error, labels));
      }
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="sitesEditSettings">
      <Modal.Header title={labels.editSiteSettingsTitle} />
      <form onSubmit={onSubmit} noValidate data-testid="sites-edit-settings-form">
        <Modal.Body>
          <div className="ff">
            <label htmlFor="site-settings-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="site-settings-primary"
                type="checkbox"
                checked={primary}
                onChange={(event) => setPrimary(event.currentTarget.checked)}
              />
              {labels.fieldPrimary}
            </label>
          </div>
          <Field id="site-settings-hours" label={labels.fieldOperatingHours} required requiredLabel={labels.required}>
            <input
              id="site-settings-hours"
              className="form-input mono"
              value={operatingHours}
              onChange={(event) => setOperatingHours(event.currentTarget.value)}
            />
          </Field>
          <div className="ff">
            <label htmlFor="site-settings-haccp" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="site-settings-haccp"
                type="checkbox"
                checked={haccpEnabled}
                onChange={(event) => setHaccpEnabled(event.currentTarget.checked)}
              />
              {labels.fieldHaccpEnabled}
            </label>
          </div>
          {haccpEnabled ? (
            <Field id="site-settings-haccp-until" label={labels.fieldHaccpValidUntil} required requiredLabel={labels.required}>
              <input
                id="site-settings-haccp-until"
                className="form-input mono"
                type="date"
                value={haccpValidUntil}
                onChange={(event) => setHaccpValidUntil(event.currentTarget.value)}
              />
            </Field>
          ) : null}
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
