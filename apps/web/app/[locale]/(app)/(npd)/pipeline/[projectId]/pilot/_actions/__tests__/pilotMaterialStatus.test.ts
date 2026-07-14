import { describe, expect, it, vi } from 'vitest';

import { pilotMaterialStatus } from '../_helpers';

const query = vi.fn();

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '07300000-0000-4000-8000-0000000000aa',
      orgId: '07300000-0000-4000-8000-00000000000a',
      client: { query },
    }),
}));

import { getPilotRecipeMaterials } from '../get-pilot-recipe-materials';

describe('pilotMaterialStatus', () => {
  it.each([
    ['10', '10', 'reserved'],
    ['10', '15', 'reserved'],
    ['10', '5', 'short'],
    ['0', '0', 'reserved'],
  ] as const)('returns %s, %s => %s', (requiredKg, availableKg, expected) => {
    expect(pilotMaterialStatus(requiredKg, availableKg)).toBe(expected);
  });
});

describe('getPilotRecipeMaterials', () => {
  it('scales per-pack quantity to the pilot batch and compares required with available stock', async () => {
    query.mockImplementation(async (sql: string) => {
      if (/role_permissions/.test(sql)) return { rows: [{ ok: true }] };
      if (/from public\.formulations/.test(sql)) return { rows: [{ id: 'formulation' }] };
      if (/from public\.formulation_versions/.test(sql)) {
        return { rows: [{ id: 'version', batch_size_kg: '0.5000' }] };
      }
      if (/from public\.pilot_runs/.test(sql)) return { rows: [{ batch_size_kg: '25.0000' }] };
      if (/from public\.production_lines/.test(sql)) return { rows: [{ warehouse_id: 'warehouse' }] };
      if (/from public\.formulation_ingredients/.test(sql)) {
        return {
          rows: [{ rm_code: 'RM-1', item_id: 'item', qty_kg: '0.1250', ingredient_name: 'Salt' }],
        };
      }
      if (/from public\.v_inventory_available/.test(sql)) return { rows: [{ qty: '10.0000' }] };
      if (/from public\.license_plates/.test(sql)) return { rows: [{ qty: '0.0000' }] };
      return { rows: [] };
    });

    const result = await getPilotRecipeMaterials({
      projectId: '07300000-0000-4000-8000-0000000000c1',
      lineCode: 'LINE-A',
    });

    expect(result[0]).toEqual(expect.objectContaining({ requiredKg: '6.2500', status: 'reserved' }));
  });
});
