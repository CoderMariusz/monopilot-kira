import { describe, expect, it, vi } from 'vitest';

import {
  ChainQtySyncRollbackError,
  loadAndLockParentChainEdges,
  preflightParentChainEdges,
  propagateParentWoChainQuantities,
  reconcileQtyEnteredOnBaseEdit,
  type ChainEdgeSnapshot,
} from './wo-chain-qty-sync';

describe('reconcileQtyEnteredOnBaseEdit', () => {
  const snap = {
    outputUom: 'box' as const,
    uomBase: 'kg',
    netQtyPerEach: 1.5,
    eachPerBox: 10,
    boxesPerPallet: 40,
    weightMode: 'fixed' as const,
  };

  it('B1a: recomputes box qty_entered when base planned qty changes', () => {
    // 127.5 kg / (10 each/box * 1.5 kg/each) = 8.5 boxes
    expect(
      reconcileQtyEnteredOnBaseEdit({
        nextPlannedBaseQty: '127.5',
        qtyEntered: '7',
        qtyEnteredUom: 'box',
        snapshot: snap,
      }),
    ).toEqual({ qtyEntered: '8.5', qtyEnteredUom: 'box' });
  });

  it('updates base qty_entered when order unit is base', () => {
    expect(
      reconcileQtyEnteredOnBaseEdit({
        nextPlannedBaseQty: '12.750',
        qtyEntered: '10.500',
        qtyEnteredUom: 'base',
        snapshot: snap,
      }),
    ).toEqual({ qtyEntered: '12.750', qtyEnteredUom: 'base' });
  });

  it('clears stale entered qty when pack factors cannot convert', () => {
    expect(
      reconcileQtyEnteredOnBaseEdit({
        nextPlannedBaseQty: '100',
        qtyEntered: '7',
        qtyEnteredUom: 'box',
        snapshot: { ...snap, netQtyPerEach: null },
      }),
    ).toEqual({ qtyEntered: null, qtyEnteredUom: null });
  });
});

describe('loadAndLockParentChainEdges', () => {
  const PARENT_WO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const CHILD_WO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const LINK_PRODUCT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const BOM_LINE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  it('captures material identity (product_id + bom_item_id) before parent delete', async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [{
          child_wo_id: CHILD_WO_ID,
          child_status: 'DRAFT',
          child_product_id: LINK_PRODUCT_ID,
          link_product_id: LINK_PRODUCT_ID,
          link_bom_item_id: BOM_LINE_ID,
        }],
        rowCount: 1,
      })),
    };

    const edges = await loadAndLockParentChainEdges(
      { userId: 'user', orgId: 'org', client },
      PARENT_WO_ID,
    );

    expect(edges).toEqual([{
      childWoId: CHILD_WO_ID,
      childStatus: 'DRAFT',
      childProductId: LINK_PRODUCT_ID,
      linkProductId: LINK_PRODUCT_ID,
      linkBomItemId: BOM_LINE_ID,
    }]);
    expect(String(client.query.mock.calls[0]?.[0])).toContain('wm.product_id::text as link_product_id');
    expect(String(client.query.mock.calls[0]?.[0])).toContain('for update of child, dep');
  });
});

describe('preflightParentChainEdges', () => {
  const CHILD_PRODUCT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  it('rejects IN_PROGRESS child before any mutation', async () => {
    const edges: ChainEdgeSnapshot[] = [{
      childWoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      childStatus: 'IN_PROGRESS',
      childProductId: CHILD_PRODUCT_ID,
      linkProductId: CHILD_PRODUCT_ID,
      linkBomItemId: null,
    }];

    await expect(
      preflightParentChainEdges({ userId: 'user', orgId: 'org', client: { query: vi.fn() } }, edges),
    ).rejects.toThrow(ChainQtySyncRollbackError);
  });
});

describe('propagateParentWoChainQuantities', () => {
  const PARENT_WO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const CHILD_WO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const CHILD_WO_ID_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const NEW_MATERIAL_ID = '11111111-1111-4111-8111-111111111111';
  const CHILD_PRODUCT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const BOM_LINE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  const edgeSnapshot: ChainEdgeSnapshot = {
    childWoId: CHILD_WO_ID,
    childStatus: 'DRAFT',
    childProductId: CHILD_PRODUCT_ID,
    linkProductId: CHILD_PRODUCT_ID,
    linkBomItemId: BOM_LINE_ID,
  };

  it('B1a: relinks after resnapshot (material_link null) and propagates child qty from new parent material', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        const n = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (n.includes('from public.wo_materials') && n.includes('and wo_id = $1::uuid')) {
          return {
            rows: [{
              id: NEW_MATERIAL_ID,
              product_id: CHILD_PRODUCT_ID,
              bom_item_id: BOM_LINE_ID,
              required_qty: '10.710',
            }],
            rowCount: 1,
          };
        }
        if (n.startsWith('update public.wo_dependencies') && n.includes('material_link')) {
          return { rows: [], rowCount: 1 };
        }
        if (n.startsWith('update public.work_orders')) {
          return { rows: [{ id: CHILD_WO_ID }], rowCount: 1 };
        }
        if (n.startsWith('update public.schedule_outputs')) {
          return { rows: [], rowCount: 1 };
        }
        if (n.startsWith('select id, item_code, output_uom')) {
          return {
            rows: [{
              id: CHILD_PRODUCT_ID,
              item_code: 'WIP-1',
              output_uom: 'base',
              uom_base: 'kg',
              net_qty_per_each: null,
              each_per_box: null,
              boxes_per_pallet: null,
              weight_mode: 'fixed',
            }],
            rowCount: 1,
          };
        }
        if (n.includes('from public.bom_headers')) {
          return { rows: [], rowCount: 0 };
        }
        if (n.startsWith('delete from public.wo_materials') || n.startsWith('delete from public.wo_operations')) {
          return { rows: [], rowCount: 1 };
        }
        if (n.startsWith('insert into public.wo_operations')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    await propagateParentWoChainQuantities(
      { userId: USER_ID, orgId: 'org', client },
      PARENT_WO_ID,
      USER_ID,
      [edgeSnapshot],
    );

    const relink = calls.find((c) => {
      const n = c.sql.replace(/\s+/g, ' ').trim().toLowerCase();
      return n.startsWith('update public.wo_dependencies') && n.includes('material_link');
    });
    expect(relink?.params).toEqual([PARENT_WO_ID, CHILD_WO_ID, '10.710', NEW_MATERIAL_ID]);

    const childUpdate = calls.find((c) => c.sql.replace(/\s+/g, ' ').trim().toLowerCase().startsWith('update public.work_orders'));
    expect(childUpdate?.params).toEqual([CHILD_WO_ID, '10.710', USER_ID]);
  });

  it('B1a: throws before mutating when a later child is IN_PROGRESS (two-phase preflight)', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        const n = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (n.includes('from public.wo_materials') && n.includes('and wo_id = $1::uuid')) {
          return { rows: [], rowCount: 0 };
        }
        if (n.startsWith('select id, item_code, output_uom')) {
          return {
            rows: [{
              id: CHILD_PRODUCT_ID,
              item_code: 'WIP-1',
              output_uom: 'base',
              uom_base: 'kg',
              net_qty_per_each: null,
              each_per_box: null,
              boxes_per_pallet: null,
              weight_mode: 'fixed',
            }],
            rowCount: 1,
          };
        }
        if (n.includes('from public.bom_headers')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    const edges: ChainEdgeSnapshot[] = [
      {
        childWoId: CHILD_WO_ID,
        childStatus: 'DRAFT',
        childProductId: CHILD_PRODUCT_ID,
        linkProductId: CHILD_PRODUCT_ID,
        linkBomItemId: BOM_LINE_ID,
      },
      {
        childWoId: CHILD_WO_ID_2,
        childStatus: 'IN_PROGRESS',
        childProductId: CHILD_PRODUCT_ID,
        linkProductId: CHILD_PRODUCT_ID,
        linkBomItemId: null,
      },
    ];

    await expect(
      propagateParentWoChainQuantities(
        { userId: USER_ID, orgId: 'org', client },
        PARENT_WO_ID,
        USER_ID,
        edges,
      ),
    ).rejects.toMatchObject({ code: 'chain_child_not_editable' });

    expect(calls.some((c) => c.sql.replace(/\s+/g, ' ').trim().toLowerCase().startsWith('update public.work_orders'))).toBe(false);
    expect(calls.some((c) => {
      const n = c.sql.replace(/\s+/g, ' ').trim().toLowerCase();
      return n.startsWith('update public.wo_dependencies') && n.includes('material_link');
    })).toBe(false);
  });
});
