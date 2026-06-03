/**
 * D365 field-mapping manifest — CI/CD source of truth.
 *
 * Per the prototype (settings/admin-screens.jsx:109-143) the D365 field mapping
 * is read-only on this screen and "deployed via CI/CD. To change a mapping, raise
 * a PR in the monopilot/integrations-d365 repo." This module is the single
 * canonical manifest the read-only mapping screen renders when an org has no
 * per-org override rows in reference_tables. It is product configuration (the
 * R15 anti-corruption field map), NOT illustrative prototype mock data.
 *
 * The map is deliberately export-only for MES → D365 directions and never
 * includes D365-owned fields (factory_release_state, customer billing addr,
 * GL chart) — see MON-integrations-compliance / d365-posture.md.
 */

export type D365MappingDirection = 'incoming' | 'outgoing' | 'both';

export type D365FieldMappingRow = {
  d365_field: string;
  direction: D365MappingDirection;
  monopilot_field: string;
  type: string;
  transform: string;
  unmapped?: boolean;
};

export const D365_FIELD_MAPPING_TABLE_CODE = 'd365_field_mapping';

export const D365_FIELD_MAPPING_MANIFEST: readonly D365FieldMappingRow[] = [
  {
    d365_field: 'InventTable.ItemId',
    direction: 'incoming',
    monopilot_field: 'products.sku',
    type: 'text',
    transform: 'none',
  },
  {
    d365_field: 'VendTable.CurrencyCode',
    direction: 'incoming',
    monopilot_field: 'partners.currency',
    type: 'enum',
    transform: 'upper',
  },
  {
    d365_field: 'SalesTable.SalesId',
    direction: 'outgoing',
    monopilot_field: 'planning.d365_so_ref',
    type: 'text',
    transform: 'prefix:SO-',
  },
  {
    d365_field: 'Item.allergens[]',
    direction: 'outgoing',
    monopilot_field: 'products.allergens',
    type: 'json',
    transform: 'unmapped',
    unmapped: true,
  },
] as const;
