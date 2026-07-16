/**
 * R15 anti-corruption — D365 export-only policy for field mapping and cost sync.
 *
 * Cost data flows Monopilot → D365 only. Inbound D365 cost pulls that would append
 * to canonical local cost history are blocked at the server boundary.
 */

import type { D365FieldMappingRow } from './field-mapping-manifest';

export const D365_COST_D365_FIELD = 'InventCost.StandardCost';
export const D365_COST_MONOPILOT_FIELD = 'finance.standard_cost_posted';

const COST_FIELD_PATTERN = /cost|standard_cost|cost_per_kg/i;

export function isCostRelatedMapping(row: { d365_field: string; monopilot_field: string }): boolean {
  return COST_FIELD_PATTERN.test(row.d365_field) || COST_FIELD_PATTERN.test(row.monopilot_field);
}

/** R15: inbound D365 cost import is never permitted. */
export function isCostImportPermitted(): boolean {
  return false;
}

/**
 * Drops cost-related mappings that advertise an inbound (D365 → Monopilot) direction.
 * Outgoing cost export rows are retained.
 */
export function normalizeFieldMappingsForExportOnly(rows: D365FieldMappingRow[]): D365FieldMappingRow[] {
  return rows.filter((row) => !isCostRelatedMapping(row) || row.direction === 'outgoing');
}
