/**
 * Shared server-side dept-status derivation for the NPD 7-department gate strip.
 *
 * Extracted from the FA-detail page (apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/page.tsx)
 * so BOTH the FA-detail screen and the NPD project-detail screen
 * (apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/page.tsx) derive each
 * department's status from the SAME real, org-scoped product row — never a
 * hardcoded array, never duplicated logic.
 *
 * Strictly server/data-only: it takes already-loaded plain values + column
 * metadata and returns a plain status map. No React, no DB calls, no functions —
 * safe to call from a Server Component.
 *
 * Prototype parity source (1:1) for the strip it feeds:
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:365-385
 */

import type { DeptStatus } from '../../components/npd/dept-status-strip';

export type { DeptStatus } from '../../components/npd/dept-status-strip';

/** Ordered 7-dept model (prototype fa-screens.jsx:368). */
export const DEPT_KEYS = [
  'core',
  'planning',
  'commercial',
  'production',
  'technical',
  'mrp',
  'procurement',
] as const;
export type DeptKey = (typeof DEPT_KEYS)[number];

/** Minimal column descriptor needed to decide required-field completeness. */
export type GenericDeptColumn = {
  key: string;
  dataType: 'text' | 'number' | 'date' | 'boolean' | 'dropdown' | 'formula';
  required: boolean;
  readOnly: boolean;
  auto?: boolean;
  /**
   * mig 374 — when this column is an auto-derived field (`auto` true), the
   * physical key of the catalog field it mirrors at read time
   * (npd_field_catalog.auto_source_field). The page overrides this column's value
   * with the source column's value before render; the column stays read-only.
   */
  autoSourceField?: string;
  dropdownSource?: string;
  displayOrder: number;
  priceGated?: boolean;
  mono?: boolean;
};

/**
 * Derive the per-department status circle (prototype fa-screens.jsx:368-377) from
 * the REAL product row already loaded as `values`:
 *   done    = closed_<dept> = 'Yes' AND every required column for that dept is filled
 *   blocked = the dept is marked closed but a required field is still missing (unmet)
 *   inprog  = at least one of the dept's fields is filled (work started)
 *   pending = nothing filled yet
 *
 * Required-column metadata comes from the live Reference.DeptColumns load
 * (`columnsByDept`); departments not present in `columnsByDept` (e.g. MRP when
 * its columns are not part of a slice's reads) fall back to the `closed_<dept>`
 * flag alone (done when closed, inprog otherwise).
 */
export function deriveDeptStatuses(
  values: Record<string, unknown>,
  columnsByDept: Partial<Record<DeptKey, GenericDeptColumn[]>>,
): Record<DeptKey, DeptStatus> {
  const str = (v: unknown) => (v == null ? '' : String(v).trim());
  const out = {} as Record<DeptKey, DeptStatus>;
  for (const dept of DEPT_KEYS) {
    const closed = str(values[`closed_${dept}`]).toLowerCase() === 'yes';
    const cols = columnsByDept[dept] ?? [];
    const required = cols.filter((c) => c.required);
    const requiredFilled =
      required.length === 0 ? true : required.every((c) => str(values[c.key]) !== '');
    const anyFilled = cols.length === 0 ? closed : cols.some((c) => str(values[c.key]) !== '');

    if (closed && requiredFilled) out[dept] = 'done';
    else if (closed && !requiredFilled) out[dept] = 'blocked';
    else if (anyFilled) out[dept] = 'inprog';
    else out[dept] = 'pending';
  }
  return out;
}
