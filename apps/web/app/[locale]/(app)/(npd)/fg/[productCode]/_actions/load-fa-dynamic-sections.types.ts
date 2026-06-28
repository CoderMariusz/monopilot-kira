/**
 * A3 (NPD-DYN) · SLICE 1 — types + SECTION_MAP for the FA dynamic-sections data
 * layer (load-fa-dynamic-sections.ts).
 *
 * Lives in a plain (non-`'use server'`) module because a `'use server'` file may
 * export ONLY async functions — Next.js `next build` rejects `export const` /
 * `export class` / `export type` from a server-action module (same reason
 * benchmarks.types.ts / fa-bom-types.ts are split out).
 */

/** RBAC read permission — the SAME one the FG detail page + every FA tab enforce. */
export const FA_DYNAMIC_SECTIONS_READ_PERMISSION = 'npd.fa.read';

/**
 * Owner-facing grouping of the dynamic NPD departments into 3 sections.
 *
 * Departments are matched by their `npd_departments.code` (case-insensitive in
 * the loader). The dynamic catalog seeds 7 dept codes: Core, Planning,
 * Commercial, Production, Technical, MRP, Procurement.
 *
 * PROVISIONAL OWNER ASSUMPTION (kept isolated HERE so it is retunable in one
 * place): MRP folds into "Production & Technical" and Procurement folds into
 * "Commercial & Planning". Change the grouping by editing ONLY this constant —
 * the loader derives everything (section count, order, dept→section mapping, and
 * the lazy trailing 'other' bucket for any unmapped dept) from it.
 */
export const SECTION_MAP: ReadonlyArray<{
  key: string;
  label: string;
  depts: readonly string[];
}> = [
  { key: 'core', label: 'Core', depts: ['Core'] },
  { key: 'commercial', label: 'Commercial & Planning', depts: ['Commercial', 'Planning', 'Procurement'] },
  { key: 'production', label: 'Production & Technical', depts: ['Production', 'Technical', 'MRP'] },
] as const;

/** One dynamic field DEFINITION (no product value in this slice). */
export type FaDynamicField = {
  /** npd_field_catalog.code — the physical/logical field key. */
  code: string;
  /** npd_field_catalog.label — human label (falls back to code). */
  label: string;
  /** npd_field_catalog.data_type — text|number|integer|boolean|date|datetime|dropdown|formula|json. */
  dataType: string;
  /** npd_department_field.required — required-for-done flag for this assignment. */
  required: boolean;
  /** Owning npd_departments.code (so the render slice can sub-group within a section). */
  deptCode: string;
  /** npd_department_field.display_order — order within the dept. */
  displayOrder: number;
  /**
   * mig 374 — auto-derived field (npd_field_catalog.is_auto). When true the field
   * is rendered read-only and its value is read-time derived from
   * `autoSourceField`; the future fully-dynamic render carries this awareness so
   * it can render the same read-only/auto control + value override the current
   * static render does.
   */
  auto?: boolean;
  /** True when the field is non-editable (currently == auto; reserved for PK/formula). */
  readOnly?: boolean;
  /** mig 374 — the code of the catalog field this auto field mirrors at read time. */
  autoSourceField?: string;
};

/** One rendered section = a SECTION_MAP entry resolved to its concrete fields. */
export type FaDynamicSection = {
  key: string;
  label: string;
  fields: FaDynamicField[];
};

/** Success envelope returned by loadFaDynamicSections (definitions/structure only). */
export type FaDynamicSectionsResult = {
  ok: true;
  sections: FaDynamicSection[];
};
