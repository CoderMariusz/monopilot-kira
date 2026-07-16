import { describe, expect, it } from 'vitest';

import {
  D365_COST_D365_FIELD,
  D365_COST_MONOPILOT_FIELD,
  isCostImportPermitted,
  isCostRelatedMapping,
  normalizeFieldMappingsForExportOnly,
} from './export-only-policy';
import type { D365FieldMappingRow } from './field-mapping-manifest';

describe('D365 export-only policy (C021)', () => {
  it('blocks inbound cost import per R15 export-only posture', () => {
    expect(isCostImportPermitted()).toBe(false);
  });

  it('drops incoming cost mappings and keeps outgoing cost export rows', () => {
    const rows: D365FieldMappingRow[] = [
      {
        d365_field: D365_COST_D365_FIELD,
        direction: 'incoming',
        monopilot_field: D365_COST_MONOPILOT_FIELD,
        type: 'numeric',
        transform: 'none',
      },
      {
        d365_field: D365_COST_D365_FIELD,
        direction: 'outgoing',
        monopilot_field: D365_COST_MONOPILOT_FIELD,
        type: 'numeric',
        transform: 'none',
      },
      {
        d365_field: 'InventTable.ItemId',
        direction: 'incoming',
        monopilot_field: 'products.sku',
        type: 'text',
        transform: 'none',
      },
    ];

    const normalized = normalizeFieldMappingsForExportOnly(rows);

    expect(normalized).toHaveLength(2);
    expect(normalized.some((row) => isCostRelatedMapping(row) && row.direction === 'incoming')).toBe(false);
    expect(normalized.some((row) => isCostRelatedMapping(row) && row.direction === 'outgoing')).toBe(true);
    expect(normalized.some((row) => row.d365_field === 'InventTable.ItemId')).toBe(true);
  });
});
