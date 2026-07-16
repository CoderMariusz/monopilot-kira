import { describe, expect, it } from 'vitest';

import {
  resolveSupplierSourcingRequired,
  validateBomLineRmUsability,
  type QueryClient,
} from '../shared';

const RM_ITEM_ID = '11111111-1111-4111-8111-111111111111';
const WIP_ITEM_ID = '22222222-2222-4222-8222-222222222222';

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(handlers: {
  wipActive?: boolean;
  approvedBom?: boolean;
  approvedRouting?: boolean;
  explicitMake?: boolean;
}): QueryClient {
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> {
      const n = normalizeSql(sql);

      if (n.includes('from public.wip_definitions')) {
        return { rows: (handlers.wipActive ? [{ ok: true }] : []) as T[] };
      }
      if (n.includes('from public.bom_headers') && n.includes('technical_approved')) {
        return { rows: (handlers.approvedBom ? [{ ok: true }] : []) as T[] };
      }
      if (n.includes('from public.routings')) {
        return { rows: (handlers.approvedRouting ? [{ ok: true }] : []) as T[] };
      }
      if (n.includes("ext_jsonb->>'supply_mode'")) {
        return { rows: (handlers.explicitMake ? [{ explicit_make: true }] : [{ explicit_make: false }]) as T[] };
      }
      if (n.includes('from public.nutrition_allergens')) {
        return { rows: [] as T[] };
      }
      if (n.startsWith('select id, item_type, status, updated_at from public.items')) {
        const id = String(params?.[0] ?? '');
        const itemType = id === WIP_ITEM_ID ? 'intermediate' : 'rm';
        return {
          rows: [
            {
              id,
              item_type: itemType,
              status: 'active',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ] as T[],
        };
      }
      if (n.includes('from public.supplier_specs')) {
        return { rows: [] as T[] };
      }
      if (n.includes('from public.item_allergen_profiles')) {
        return { rows: [] as T[] };
      }

      throw new Error(`Unhandled SQL in bom-sourcing test: ${n}`);
    },
  };
}

describe('resolveSupplierSourcingRequired — positive-source internal manufacture', () => {
  it('requires supplier sourcing for RM and FG components', async () => {
    const c = makeClient({ wipActive: true });
    await expect(resolveSupplierSourcingRequired(c, { id: RM_ITEM_ID, item_type: 'rm' })).resolves.toBe(true);
    await expect(resolveSupplierSourcingRequired(c, { id: RM_ITEM_ID, item_type: 'fg' })).resolves.toBe(true);
  });

  it('skips supplier sourcing when an active wip_definitions row exists', async () => {
    const c = makeClient({ wipActive: true });
    await expect(resolveSupplierSourcingRequired(c, { id: WIP_ITEM_ID, item_type: 'intermediate' })).resolves.toBe(
      false,
    );
  });

  it('skips supplier sourcing when an approved internal BOM exists', async () => {
    const c = makeClient({ approvedBom: true });
    await expect(resolveSupplierSourcingRequired(c, { id: WIP_ITEM_ID, item_type: 'intermediate' })).resolves.toBe(
      false,
    );
  });

  it('skips supplier sourcing when an approved routing exists', async () => {
    const c = makeClient({ approvedRouting: true });
    await expect(resolveSupplierSourcingRequired(c, { id: WIP_ITEM_ID, item_type: 'intermediate' })).resolves.toBe(
      false,
    );
  });

  it('skips supplier sourcing when make/buy is explicitly make', async () => {
    const c = makeClient({ explicitMake: true });
    await expect(resolveSupplierSourcingRequired(c, { id: WIP_ITEM_ID, item_type: 'intermediate' })).resolves.toBe(
      false,
    );
  });

  it('requires supplier sourcing for purchased intermediates without positive manufacture evidence', async () => {
    const c = makeClient({});
    await expect(resolveSupplierSourcingRequired(c, { id: WIP_ITEM_ID, item_type: 'intermediate' })).resolves.toBe(
      true,
    );
  });
});

describe('validateBomLineRmUsability — intermediate sourcing at factory_spec_approval', () => {
  it('hard-blocks purchased intermediates without supplier specs', async () => {
    const failures = await validateBomLineRmUsability(
      makeClient({}),
      [{ itemId: WIP_ITEM_ID, componentCode: 'WIP-PURCHASED' }],
      'factory_spec_approval',
      'FG-001',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      componentCode: 'WIP-PURCHASED',
      itemId: WIP_ITEM_ID,
      reasons: expect.arrayContaining(['SUPPLIER_NOT_APPROVED', 'SUPPLIER_SPEC_NOT_ACTIVE']),
    });
  });

  it('allows internally manufactured intermediates without supplier specs', async () => {
    const failures = await validateBomLineRmUsability(
      makeClient({ wipActive: true }),
      [{ itemId: WIP_ITEM_ID, componentCode: 'WIP-MFG' }],
      'factory_spec_approval',
      'FG-001',
    );
    expect(failures).toHaveLength(0);
  });

  it('still hard-blocks RM components without supplier specs (no regression)', async () => {
    const failures = await validateBomLineRmUsability(
      makeClient({ wipActive: true }),
      [{ itemId: RM_ITEM_ID, componentCode: 'RM-001' }],
      'factory_spec_approval',
      'FG-001',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reasons).toEqual(
      expect.arrayContaining(['SUPPLIER_NOT_APPROVED', 'SUPPLIER_SPEC_NOT_ACTIVE']),
    );
  });
});
