/**
 * Business columns cloned by create-version.ts on "Add version".
 * Keep in sync with packages/db/schema/formulations.ts + additive migrations
 * (342 processing_overhead_pct; 157 item_id; 397 cost_currency; 424 substitute_item_id;
 * 430 wip_definition_id; 450 npd_wip_process_id).
 */
export const VERSION_CLONE_BUSINESS_COLUMNS = [
  'batch_size_kg',
  'target_yield_pct',
  'target_price_eur',
  'processing_overhead_pct',
  'schema_version',
] as const;

export const INGREDIENT_CLONE_BUSINESS_COLUMNS = [
  'rm_code',
  'item_id',
  'substitute_item_id',
  'wip_definition_id',
  'npd_wip_process_id',
  'qty_kg',
  'pct',
  'cost_per_kg_eur',
  'cost_currency',
  'allergens_inherited',
  'sequence',
  'schema_version',
] as const;
