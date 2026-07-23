import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadRecipeCascade } from './load-recipe-cascade';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const ORG_ID = '44444444-4444-4444-8444-444444444444';
const WIP_ITEM_ID = '55555555-5555-4555-8555-555555555555';
const NESTED_WIP_ITEM_ID = '66666666-6666-4666-8666-666666666666';

let client: QueryClient;
let rootCode = 'WIP-A';
let rootItemId: string | null = null;
let versionsByCode: Record<string, string>;
let componentsByVersion: Record<string, Array<Record<string, unknown>>>;
let bomLinesByItemId: Record<string, Array<Record<string, unknown>>>;
let wipDefLinesByItemId: Record<string, Array<Record<string, unknown>>>;
let queries: string[];
let bomShouldFail = false;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const q = normalize(sql);
      queries.push(q);
      if (q.includes('join public.formulation_versions fv') && q.includes('join public.formulation_ingredients fi')) {
        return {
          rows: [
            {
              ingredient_line_id: 'line-root',
              line_sequence: 1,
              item_id: rootItemId,
              item_code: rootCode,
              item_name: rootCode,
            },
          ],
        };
      }
      if (q.includes('f.product_code = $1::text')) {
        const itemCode = String(params?.[0] ?? '');
        const version = versionsByCode[itemCode];
        return { rows: version ? [{ version_id: version }] : [] };
      }
      if (q.includes('from public.formulation_ingredients fi')) {
        const versionId = String(params?.[0] ?? '');
        return { rows: componentsByVersion[versionId] ?? [] };
      }
      if (q.includes('from public.bom_lines bl') && q.includes("h.status = 'active'")) {
        if (bomShouldFail) {
          throw Object.assign(new Error('bom boom'), { code: 'XX000' });
        }
        const itemId = String(params?.[0] ?? '');
        return { rows: bomLinesByItemId[itemId] ?? [] };
      }
      if (
        q.includes('from public.wip_definitions wd') &&
        q.includes('join public.wip_definition_ingredients wdi') &&
        q.includes("wd.status = 'active'")
      ) {
        const itemId = String(params?.[0] ?? '');
        return { rows: wipDefLinesByItemId[itemId] ?? [] };
      }
      throw new Error(`unexpected query: ${q}`);
    }),
  };
}

beforeEach(() => {
  queries = [];
  rootCode = 'WIP-A';
  rootItemId = null;
  versionsByCode = {};
  componentsByVersion = {};
  bomLinesByItemId = {};
  wipDefLinesByItemId = {};
  bomShouldFail = false;
  client = makeClient();
});

describe('loadRecipeCascade', () => {
  it('does not mark a terminal leaf at max depth as a max-depth failure', async () => {
    versionsByCode = {
      'WIP-A': 'version-a',
      'WIP-B': 'version-b',
    };
    componentsByVersion = {
      'version-a': [line('WIP-B', 'Blend B', '50', '0.5', '2')],
      'version-b': [line('RM-LEAF', 'Leaf RM', '100', '1', '1')],
    };

    const result = await loadRecipeCascade(PROJECT_ID, VERSION_ID);
    const leaf = result[0]?.subRecipe?.lines[0]?.subRecipe?.lines[0];

    expect(leaf).toMatchObject({
      itemCode: 'RM-LEAF',
      itemName: 'Leaf RM',
    });
    expect(leaf?.hasSubRecipe).toBeFalsy();
    expect(leaf?.subRecipe).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('maxDepthReached');
  });

  it('marks an expandable node at max depth as max-depth reached', async () => {
    versionsByCode = {
      'WIP-A': 'version-a',
      'WIP-B': 'version-b',
      'WIP-C': 'version-c',
    };
    componentsByVersion = {
      'version-a': [line('WIP-B', 'Blend B', '50', '0.5', '2')],
      'version-b': [line('WIP-C', 'Blend C', '25', '0.25', '3')],
      'version-c': [line('RM-D', 'Raw D', '10', '0.1', '4')],
    };

    const result = await loadRecipeCascade(PROJECT_ID, VERSION_ID);
    const first = result[0]?.subRecipe?.lines[0];
    const second = first?.subRecipe?.lines[0];

    expect(second?.subRecipe).toMatchObject({ maxDepthReached: true, lines: [] });
    // version-a + version-b loads, plus one expandability probe for WIP-C at MAX_DEPTH (version-c).
    expect(queries.filter((q) => q.includes('where fi.version_id = $1::uuid'))).toHaveLength(3);
  });

  it('does not mark shallow terminal leaves as max-depth failures', async () => {
    rootCode = 'WIP-20260714-0011';
    rootItemId = WIP_ITEM_ID;
    wipDefLinesByItemId = {
      [WIP_ITEM_ID]: [
        bomLine('flour-id', 'ING-FLOUR', 'Flour', '0.70', '1.0'),
        bomLine('sugar-id', 'ING-SUGAR', 'Sugar', '0.10', '2.0'),
        bomLine('butter-id', 'RM-BUTTER', 'Butter', '0.20', '3.0'),
      ],
    };

    const result = await loadRecipeCascade(PROJECT_ID, VERSION_ID);
    const leaves = result[0]?.subRecipe?.lines ?? [];

    expect(leaves).toHaveLength(3);
    for (const leaf of leaves) {
      expect(leaf.hasSubRecipe).toBeFalsy();
      expect(leaf.subRecipe).toBeUndefined();
    }
    expect(JSON.stringify(result)).not.toContain('maxDepthReached');
  });

  it('marks a repeated item code as a cycle', async () => {
    versionsByCode = { 'WIP-A': 'version-a' };
    componentsByVersion = {
      'version-a': [line('WIP-A', 'Blend A again', '100', '1', '1')],
    };

    const result = await loadRecipeCascade(PROJECT_ID, VERSION_ID);

    expect(result[0]?.subRecipe?.lines[0]?.subRecipe).toMatchObject({ cycle: true, lines: [] });
  });

  it('reads unit cost from public.v_item_effective_cost', async () => {
    versionsByCode = { 'WIP-A': 'version-a' };
    componentsByVersion = {
      'version-a': [line('RM-1', 'Raw 1', '100', '2', '1.23', { protein_g: '12' })],
    };

    const result = await loadRecipeCascade(PROJECT_ID, VERSION_ID);

    expect(result[0]?.subRecipe?.lines[0]).toMatchObject({
      itemCode: 'RM-1',
      unitCost: 1.23,
      nutritionPer100g: { protein_g: 12 },
    });
    expect(result[0]?.subRecipe?.totalCost).toBe(2.46);
    expect(queries.some((q) => q.includes('public.v_item_effective_cost'))).toBe(true);
  });

  it('falls back to ACTIVE BOM when an intermediate has no formulations row', async () => {
    rootCode = 'WIP-20260714-0011';
    rootItemId = WIP_ITEM_ID;
    // no versionsByCode entry → formulations miss
    bomLinesByItemId = {
      [WIP_ITEM_ID]: [
        bomLine('rm-1', 'RM-MILK', 'Milk powder', '60', '1.5', { protein_g: 20 }),
        bomLine(NESTED_WIP_ITEM_ID, 'WIP-NEST', 'Nested blend', '40', '2.0'),
      ],
      [NESTED_WIP_ITEM_ID]: [bomLine('rm-2', 'RM-SUGAR', 'Sugar', '100', '0.5')],
    };

    const result = await loadRecipeCascade(PROJECT_ID, VERSION_ID);

    expect(result[0]).toMatchObject({
      itemCode: 'WIP-20260714-0011',
      hasSubRecipe: true,
    });
    expect(result[0]?.subRecipe?.lines).toEqual([
      expect.objectContaining({
        itemCode: 'RM-MILK',
        itemName: 'Milk powder',
        pct: 60,
        unitCost: 1.5,
        nutritionPer100g: { protein_g: 20 },
      }),
      expect.objectContaining({
        itemCode: 'WIP-NEST',
        itemName: 'Nested blend',
        pct: 40,
        unitCost: 2.0,
        hasSubRecipe: true,
      }),
    ]);
    expect(result[0]?.subRecipe?.lines[1]?.subRecipe?.lines).toEqual([
      expect.objectContaining({ itemCode: 'RM-SUGAR', pct: 100, unitCost: 0.5 }),
    ]);
    expect(result[0]?.subRecipe?.totalCost).toBe(60 * 1.5 + 40 * 2.0);
    expect(queries.some((q) => q.includes('from public.bom_lines bl'))).toBe(true);
  });

  it('surfaces BOM lookup failures instead of returning []', async () => {
    rootCode = 'WIP-FAIL';
    rootItemId = WIP_ITEM_ID;
    bomShouldFail = true;

    await expect(loadRecipeCascade(PROJECT_ID, VERSION_ID)).rejects.toMatchObject({
      code: 'BOM_CASCADE_LOAD_FAILED',
    });
  });

  it('falls back to active wip_definition_ingredients when intermediate has no BOM', async () => {
    rootCode = 'WIP-20260714-0011';
    rootItemId = WIP_ITEM_ID;
    // no formulations, no bom_lines → NPD WIP recipe lives on the active definition
    wipDefLinesByItemId = {
      [WIP_ITEM_ID]: [
        bomLine('flour-id', 'ING-FLOUR', 'Flour', '0.70', '1.0'),
        bomLine('sugar-id', 'ING-SUGAR', 'Sugar', '0.10', '2.0'),
        bomLine('butter-id', 'RM-BUTTER', 'Butter', '0.20', '3.0'),
      ],
    };

    const result = await loadRecipeCascade(PROJECT_ID, VERSION_ID);

    expect(result[0]).toMatchObject({
      itemCode: 'WIP-20260714-0011',
      hasSubRecipe: true,
    });
    expect(result[0]?.subRecipe?.lines).toEqual([
      expect.objectContaining({ itemCode: 'ING-FLOUR', itemName: 'Flour', pct: 70, unitCost: 1.0 }),
      expect.objectContaining({ itemCode: 'ING-SUGAR', itemName: 'Sugar', pct: 10, unitCost: 2.0 }),
      expect.objectContaining({ itemCode: 'RM-BUTTER', itemName: 'Butter', pct: 20, unitCost: 3.0 }),
    ]);
    expect(result[0]?.subRecipe?.totalCost).toBe(0.7 * 1.0 + 0.1 * 2.0 + 0.2 * 3.0);
    expect(queries.some((q) => q.includes('from public.bom_lines bl'))).toBe(true);
    expect(queries.some((q) => q.includes('join public.wip_definition_ingredients wdi'))).toBe(true);
  });
});

function line(
  itemCode: string,
  itemName: string,
  pct: string,
  qtyKg: string,
  unitCost: string,
  nutritionPer100g: Record<string, unknown> | null = null,
  itemId: string | null = null,
): Record<string, unknown> {
  return {
    item_id: itemId,
    item_code: itemCode,
    item_name: itemName,
    pct,
    qty_kg: qtyKg,
    unit_cost: unitCost,
    nutrition_per_100g: nutritionPer100g,
  };
}

function bomLine(
  itemId: string,
  itemCode: string,
  itemName: string,
  qtyKg: string,
  unitCost: string,
  nutritionPer100g: Record<string, unknown> | null = null,
): Record<string, unknown> {
  return {
    item_id: itemId,
    item_code: itemCode,
    item_name: itemName,
    qty_kg: qtyKg,
    unit_cost: unitCost,
    nutrition_per_100g: nutritionPer100g,
  };
}
