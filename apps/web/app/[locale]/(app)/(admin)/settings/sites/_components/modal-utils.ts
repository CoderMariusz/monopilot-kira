import {
  DEFAULT_LINES_LABELS,
  type LinesLabels,
} from '../../infra/lines/lines-screen.client';
import type { SiteMutationError } from '../_actions/sites';
import type { SitesModalLabels } from '../sites-screen.client';

/** Null-safe site match for line ↔ warehouse (IS NOT DISTINCT FROM semantics). */
export function warehouseMatchesLineSite(warehouseSiteId: string | null, lineSiteId: string | null): boolean {
  return warehouseSiteId === lineSiteId;
}

export function mapError(error: SiteMutationError, labels: SitesModalLabels): string {
  if (error === 'duplicate_code') return labels.errorDuplicate;
  if (error === 'warehouse_site_mismatch') return labels.errorWarehouseSiteMismatch;
  if (error === 'invalid_input') return labels.errorRequired;
  return labels.errorGeneric;
}

export const STATUS_OPTIONS = (labels: SitesModalLabels) => [
  { value: 'active', label: labels.statusActive },
  { value: 'maintenance', label: labels.statusMaintenance },
  { value: 'inactive', label: labels.statusInactive },
];

export function toLineLabels(labels: SitesModalLabels): LinesLabels {
  return {
    ...DEFAULT_LINES_LABELS,
    fieldCode: labels.fieldLineCode,
    fieldName: labels.fieldName,
    fieldSite: 'Site',
    fieldStatus: labels.fieldStatus,
    statusActive: labels.statusActive,
    createLine: labels.save,
    createLinePending: labels.saving,
    cancel: labels.cancel,
  };
}
