import type { LineRow } from '../_actions/sites';
import type { SitesModalLabels, UpdateLineAction } from '../sites-screen.client';
import { LineFormModal } from './LineFormModal';

export function EditLineModal({
  labels,
  siteId,
  siteLabel,
  line,
  action,
  onClose,
  onSuccess,
}: {
  labels: SitesModalLabels;
  siteId: string;
  siteLabel: string;
  line: LineRow;
  action?: UpdateLineAction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  return (
    <LineFormModal
      title={labels.editLineTitle}
      labels={labels}
      modalId="sitesEditLine"
      testId="sites-edit-line-form"
      initial={{ code: line.code, name: line.name, status: line.status }}
      siteLabel={siteLabel}
      onClose={onClose}
      onSuccess={onSuccess}
      submit={async (values) => {
        if (!action) return { ok: false, error: 'persistence_failed' };
        return action({
          id: line.id,
          site_id: siteId,
          code: values.code,
          name: values.name,
          status: values.status,
        });
      }}
    />
  );
}
