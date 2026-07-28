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

/**
 * `invalid_input` deliberately does NOT map to `errorRequired` any more. Every
 * schema rejection used to render as "This field is required." — so a fully
 * filled form refused for a different reason (a free-text timezone that is not
 * a valid IANA name, a duplicate site code rejected before reaching the unique
 * index, an unrecognised key on a `.strict()` schema) told the user to fill in a
 * field that was already filled in, naming no field and offering no way out.
 *
 * The server now sends a `message` naming the real reason (and a `field`) for
 * everything it can explain, so that wins: it is the only text that can be
 * specific about WHICH field and WHY. The translated labels cover everything
 * else, and `errorGeneric` is the honest last resort. (`errorDuplicate` reads
 * "…in use at this site", which is right for a line code but wrong for a site
 * code — the server's message for that case says "in this organisation".)
 */
export function mapError(error: SiteMutationError, labels: SitesModalLabels, message?: string | null): string {
  if (message) return message;
  if (error === 'duplicate_code') return labels.errorDuplicate;
  if (error === 'warehouse_site_mismatch') return labels.errorWarehouseSiteMismatch;
  if (error === 'forbidden') return labels.errorForbidden;
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
