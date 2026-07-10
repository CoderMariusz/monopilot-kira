import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkOrderChain, createWorkOrderChainForContext } from './create-work-order-chain';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FG_ITEM_ID = '44444444-4444-4444-8444-444444444444';
const WIP_ITEM_ID = '55555555-5555-4555-8555-555555555555';
const BOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const FG_WO_ID = '11111111-1111-4111-8111-111111111111';
const WIP_WO_ID = '22222222-2222-4222-8222-222222222222';
const MATERIAL_ID = '33333333-3333-4333-8333-333333333333';
const MATERIAL_ID_LINE_2 = '44444444-4444-4444-8444-444444444444';
const BOM_LINE_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOM_LINE_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WIP_WO_ID_2 = '99999999-9999-4999-8999-999999999999';
const WIP_STAGE_LINE_ID = '66666666-6666-4666-8666-666666666666';
const FG_STAGE_LINE_ID = '77777777-7777-4777-8777-777777777777';

const createWorkOrderCoreMock = vi.fn();
const loadStageProductionLineIdsMock = vi.fn();
const transactionEvents: string[] = [];

vi.mock('./create-work-order-core', () => ({
  createWorkOrderCore: (...args: unknown[]) => createWorkOrderCoreMock(...args),
}));

vi.mock('./resolve-stage-production-line', () => ({
  loadStageProductionLineIds: (...args: unknown[]) => loadStageProductionLineIdsMock(...args),
}));

vi.mock('../../../../../../../lib/planning/factory-release-wo-gate', () => ({
  assertFgReleasedToFactoryForWo: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) => {
    try {
      const result = await action({
        userId: USER_ID,
        orgId: ORG_ID,
        client: makeClient(),
      });
      transactionEvents.push('COMMIT');
      return result;
    } catch (error) {
      transactionEvents.push('ROLLBACK');
      throw error;
    }
  }),
}));

import { assertFgReleasedToFactoryForWo } from '../../../../../../../lib/planning/factory-release-wo-gate';

let dependencyInserts: Array<{
  parentWoId: string;
  childWoId: string;
  materialLink: string | null;
  requiredQty: string | null;
  sql: string;
}>;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (q.includes('from public.items') && q.includes('item_code')) {
        return {
          rows: [{
            id: FG_ITEM_ID,
            item_code: 'FG-CHAIN',
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
      if (q.includes('from public.work_orders') && q.includes('wo_number = $1')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.includes('from public.bom_headers')) {
        return { rows: [{ id: BOM_ID, version: 1, line_basis: 'per_base' }], rowCount: 1 };
      }
      if (q.includes('component_type = \'wip\'') || (q.includes('from public.bom_lines') && q.includes('wip'))) {
        return {
          rows: [{
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            line_no: 10,
            item_id: WIP_ITEM_ID,
            component_code: 'WIP-STAGE-1',
            quantity: '0.5',
            scrap_pct: '0',
          }],
          rowCount: 1,
        };
      }
      if (q.startsWith('insert into public.wo_dependencies')) {
        dependencyInserts.push({
          parentWoId: String(params[0]),
          childWoId: String(params[1]),
          materialLink: params[2] == null ? null : String(params[2]),
          requiredQty: params[3] == null ? null : String(params[3]),
          sql,
        });
        return {
          rows: [{
            parent_wo_id: String(params[0]),
            child_wo_id: String(params[1]),
            material_link: params[2] == null ? null : String(params[2]),
            required_qty: params[3] == null ? null : String(params[3]),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('createWorkOrderChain wo_dependencies overlap contract', () => {
  beforeEach(() => {
    dependencyInserts = [];
    transactionEvents.length = 0;
    createWorkOrderCoreMock.mockReset();
    loadStageProductionLineIdsMock.mockReset();
    loadStageProductionLineIdsMock.mockResolvedValue(new Map([
      [WIP_ITEM_ID, WIP_STAGE_LINE_ID],
      [FG_ITEM_ID, FG_STAGE_LINE_ID],
    ]));
    vi.mocked(assertFgReleasedToFactoryForWo).mockResolvedValue('ok');
    createWorkOrderCoreMock
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: WIP_WO_ID,
          woNumber: 'WO-CHAIN-W1',
          productId: WIP_ITEM_ID,
          itemTypeAtCreation: 'intermediate',
          plannedQuantity: '500.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: SITE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [],
        primarySchedule: { id: 'schedule-wip' },
      })
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: FG_WO_ID,
          woNumber: 'WO-CHAIN',
          productId: FG_ITEM_ID,
          itemTypeAtCreation: 'fg',
          plannedQuantity: '1000.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: SITE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [{
          id: MATERIAL_ID,
          woId: FG_WO_ID,
          productId: WIP_ITEM_ID,
          materialName: 'WIP-STAGE-1',
          requiredQty: '500.000',
          consumedQty: '0.000',
          reservedQty: '0.000',
          uom: 'kg',
          sequence: 1,
          materialSource: 'stock',
          bomItemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          bomVersion: 1,
          notes: null,
        }],
        primarySchedule: { id: 'schedule-fg', plannedWoId: FG_WO_ID },
      });
  });

  it('persists wo_dependencies with material_link + required_qty only (no status gate columns)', async () => {
    const client = makeClient();
    const result = await createWorkOrderChainForContext(
      { userId: USER_ID, orgId: ORG_ID, client },
      {
        productId: FG_ITEM_ID,
        itemCode: 'FG-CHAIN',
        documentNumber: 'WO-CHAIN',
        siteId: SITE_ID,
        plannedQuantity: '1000.0000',
        productionLineId: SITE_ID,
      },
    );

    expect(result.ok).toBe(true);
    expect(dependencyInserts).toHaveLength(1);
    expect(dependencyInserts[0]).toEqual({
      parentWoId: FG_WO_ID,
      childWoId: WIP_WO_ID,
      materialLink: MATERIAL_ID,
      requiredQty: '500.000',
      sql: expect.stringContaining('wo_dependencies'),
    });
    expect(normalize(dependencyInserts[0]!.sql)).not.toMatch(/status|parent_status|child_status/);
    const wipCall = createWorkOrderCoreMock.mock.calls[0]?.[1] as { productionLineId?: string };
    const fgCall = createWorkOrderCoreMock.mock.calls[1]?.[1] as { productionLineId?: string };
    expect(wipCall.productionLineId).toBe(WIP_STAGE_LINE_ID);
    expect(fgCall.productionLineId).toBe(FG_STAGE_LINE_ID);
    if (result.ok) {
      expect(result.dependencies[0]).toEqual({
        parentWoId: FG_WO_ID,
        childWoId: WIP_WO_ID,
        materialLink: MATERIAL_ID,
        requiredQty: '500.000',
      });
    }
  });
});

describe('createWorkOrderChain duplicate WIP BOM lines', () => {
  beforeEach(() => {
    dependencyInserts = [];
    transactionEvents.length = 0;
    createWorkOrderCoreMock.mockReset();
    loadStageProductionLineIdsMock.mockReset();
    loadStageProductionLineIdsMock.mockResolvedValue(new Map([
      [WIP_ITEM_ID, WIP_STAGE_LINE_ID],
      [FG_ITEM_ID, FG_STAGE_LINE_ID],
    ]));
    vi.mocked(assertFgReleasedToFactoryForWo).mockResolvedValue('ok');
    createWorkOrderCoreMock
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: WIP_WO_ID,
          woNumber: 'WO-DUP-W1',
          productId: WIP_ITEM_ID,
          itemTypeAtCreation: 'intermediate',
          plannedQuantity: '300.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: WIP_STAGE_LINE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [],
        primarySchedule: { id: 'schedule-wip-1' },
      })
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: WIP_WO_ID_2,
          woNumber: 'WO-DUP-W2',
          productId: WIP_ITEM_ID,
          itemTypeAtCreation: 'intermediate',
          plannedQuantity: '700.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: WIP_STAGE_LINE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [],
        primarySchedule: { id: 'schedule-wip-2' },
      })
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: FG_WO_ID,
          woNumber: 'WO-DUP',
          productId: FG_ITEM_ID,
          itemTypeAtCreation: 'fg',
          plannedQuantity: '1000.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: FG_STAGE_LINE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [
          {
            id: MATERIAL_ID,
            woId: FG_WO_ID,
            productId: WIP_ITEM_ID,
            materialName: 'WIP-STAGE-A',
            requiredQty: '300.000',
            consumedQty: '0.000',
            reservedQty: '0.000',
            uom: 'kg',
            sequence: 1,
            materialSource: 'stock',
            bomItemId: BOM_LINE_1,
            bomVersion: 1,
            notes: null,
          },
          {
            id: MATERIAL_ID_LINE_2,
            woId: FG_WO_ID,
            productId: WIP_ITEM_ID,
            materialName: 'WIP-STAGE-B',
            requiredQty: '700.000',
            consumedQty: '0.000',
            reservedQty: '0.000',
            uom: 'kg',
            sequence: 2,
            materialSource: 'stock',
            bomItemId: BOM_LINE_2,
            bomVersion: 1,
            notes: null,
          },
        ],
        primarySchedule: { id: 'schedule-fg', plannedWoId: FG_WO_ID },
      });
  });

  it('links each child dependency to its own BOM-line material row and qty', async () => {
    const client: QueryClient = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        const q = normalize(sql);
        if (q.includes('from public.user_roles')) {
          return { rows: [{ ok: true }], rowCount: 1 };
        }
        if (q.includes('from public.items') && q.includes('item_code')) {
          return {
            rows: [{
              id: FG_ITEM_ID,
              item_code: 'FG-DUP',
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
        if (q.includes('from public.work_orders') && q.includes('wo_number = $1')) {
          return { rows: [], rowCount: 0 };
        }
        if (q.includes('from public.bom_headers')) {
          return { rows: [{ id: BOM_ID, version: 1, line_basis: 'per_base' }], rowCount: 1 };
        }
        if (q.includes('component_type = \'wip\'') || (q.includes('from public.bom_lines') && q.includes('wip'))) {
          return {
            rows: [
              {
                id: BOM_LINE_1,
                line_no: 10,
                item_id: WIP_ITEM_ID,
                component_code: 'WIP-STAGE-A',
                quantity: '0.3',
                scrap_pct: '0',
              },
              {
                id: BOM_LINE_2,
                line_no: 20,
                item_id: WIP_ITEM_ID,
                component_code: 'WIP-STAGE-B',
                quantity: '0.7',
                scrap_pct: '5',
              },
            ],
            rowCount: 2,
          };
        }
        if (q.startsWith('insert into public.wo_dependencies')) {
          dependencyInserts.push({
            parentWoId: String(params[0]),
            childWoId: String(params[1]),
            materialLink: params[2] == null ? null : String(params[2]),
            requiredQty: params[3] == null ? null : String(params[3]),
            sql,
          });
          return {
            rows: [{
              parent_wo_id: String(params[0]),
              child_wo_id: String(params[1]),
              material_link: params[2] == null ? null : String(params[2]),
              required_qty: params[3] == null ? null : String(params[3]),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    const result = await createWorkOrderChainForContext(
      { userId: USER_ID, orgId: ORG_ID, client },
      {
        productId: FG_ITEM_ID,
        itemCode: 'FG-DUP',
        documentNumber: 'WO-DUP',
        siteId: SITE_ID,
        plannedQuantity: '1000.0000',
      },
    );

    expect(result.ok).toBe(true);
    expect(dependencyInserts).toHaveLength(2);
    expect(dependencyInserts[0]).toMatchObject({
      parentWoId: FG_WO_ID,
      childWoId: WIP_WO_ID,
      materialLink: MATERIAL_ID,
      requiredQty: '300.000',
    });
    expect(dependencyInserts[1]).toMatchObject({
      parentWoId: FG_WO_ID,
      childWoId: WIP_WO_ID_2,
      materialLink: MATERIAL_ID_LINE_2,
      requiredQty: '700.000',
    });
  });
});

describe('createWorkOrderChain duplicate WIP BOM lines with missing bomItemId', () => {
  beforeEach(() => {
    dependencyInserts = [];
    transactionEvents.length = 0;
    createWorkOrderCoreMock.mockReset();
    loadStageProductionLineIdsMock.mockReset();
    loadStageProductionLineIdsMock.mockResolvedValue(new Map([
      [WIP_ITEM_ID, WIP_STAGE_LINE_ID],
      [FG_ITEM_ID, FG_STAGE_LINE_ID],
    ]));
    vi.mocked(assertFgReleasedToFactoryForWo).mockResolvedValue('ok');
    createWorkOrderCoreMock
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: WIP_WO_ID,
          woNumber: 'WO-DUP-W1',
          productId: WIP_ITEM_ID,
          itemTypeAtCreation: 'intermediate',
          plannedQuantity: '300.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: WIP_STAGE_LINE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [],
        primarySchedule: { id: 'schedule-wip-1' },
      })
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: WIP_WO_ID_2,
          woNumber: 'WO-DUP-W2',
          productId: WIP_ITEM_ID,
          itemTypeAtCreation: 'intermediate',
          plannedQuantity: '700.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: WIP_STAGE_LINE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [],
        primarySchedule: { id: 'schedule-wip-2' },
      })
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: FG_WO_ID,
          woNumber: 'WO-DUP',
          productId: FG_ITEM_ID,
          itemTypeAtCreation: 'fg',
          plannedQuantity: '1000.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: FG_STAGE_LINE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [
          {
            id: MATERIAL_ID,
            woId: FG_WO_ID,
            productId: WIP_ITEM_ID,
            materialName: 'WIP-STAGE-A',
            requiredQty: '300.000',
            consumedQty: '0.000',
            reservedQty: '0.000',
            uom: 'kg',
            sequence: 1,
            materialSource: 'stock',
            bomItemId: BOM_LINE_1,
            bomVersion: 1,
            notes: null,
          },
          {
            id: MATERIAL_ID_LINE_2,
            woId: FG_WO_ID,
            productId: WIP_ITEM_ID,
            materialName: 'WIP-STAGE-B',
            requiredQty: '700.000',
            consumedQty: '0.000',
            reservedQty: '0.000',
            uom: 'kg',
            sequence: 2,
            materialSource: 'stock',
            bomItemId: null,
            bomVersion: 1,
            notes: null,
          },
        ],
        primarySchedule: { id: 'schedule-fg', plannedWoId: FG_WO_ID },
      });
  });

  it('fails explicitly when a duplicate WIP line material is missing bomItemId', async () => {
    const client: QueryClient = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        const q = normalize(sql);
        if (q.includes('from public.user_roles')) {
          return { rows: [{ ok: true }], rowCount: 1 };
        }
        if (q.includes('from public.items') && q.includes('item_code')) {
          return {
            rows: [{
              id: FG_ITEM_ID,
              item_code: 'FG-DUP',
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
        if (q.includes('from public.work_orders') && q.includes('wo_number = $1')) {
          return { rows: [], rowCount: 0 };
        }
        if (q.includes('from public.bom_headers')) {
          return { rows: [{ id: BOM_ID, version: 1, line_basis: 'per_base' }], rowCount: 1 };
        }
        if (q.includes('component_type = \'wip\'') || (q.includes('from public.bom_lines') && q.includes('wip'))) {
          return {
            rows: [
              {
                id: BOM_LINE_1,
                line_no: 10,
                item_id: WIP_ITEM_ID,
                component_code: 'WIP-STAGE-A',
                quantity: '0.3',
                scrap_pct: '0',
              },
              {
                id: BOM_LINE_2,
                line_no: 20,
                item_id: WIP_ITEM_ID,
                component_code: 'WIP-STAGE-B',
                quantity: '0.7',
                scrap_pct: '5',
              },
            ],
            rowCount: 2,
          };
        }
        if (q.startsWith('insert into public.wo_dependencies')) {
          dependencyInserts.push({
            parentWoId: String(params[0]),
            childWoId: String(params[1]),
            materialLink: params[2] == null ? null : String(params[2]),
            requiredQty: params[3] == null ? null : String(params[3]),
            sql,
          });
          return {
            rows: [{
              parent_wo_id: String(params[0]),
              child_wo_id: String(params[1]),
              material_link: params[2] == null ? null : String(params[2]),
              required_qty: params[3] == null ? null : String(params[3]),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    const result = await createWorkOrderChainForContext(
      { userId: USER_ID, orgId: ORG_ID, client },
      {
        productId: FG_ITEM_ID,
        itemCode: 'FG-DUP',
        documentNumber: 'WO-DUP',
        siteId: SITE_ID,
        plannedQuantity: '1000.0000',
      },
    );

    expect(result).toEqual({
      ok: false,
      error: 'persistence_failed',
      planningError: 'wip_material_link_ambiguous',
      message: 'wip_material_link_ambiguous',
    });
    expect(dependencyInserts).toHaveLength(1);
    expect(dependencyInserts[0]).toMatchObject({
      parentWoId: FG_WO_ID,
      childWoId: WIP_WO_ID,
      materialLink: MATERIAL_ID,
      requiredQty: '300.000',
    });
    expect(dependencyInserts.some((row) => row.childWoId === WIP_WO_ID_2)).toBe(false);
  });
});

describe('createWorkOrderChain mid-chain failure + factory-release gate', () => {
  beforeEach(() => {
    dependencyInserts = [];
    transactionEvents.length = 0;
    createWorkOrderCoreMock.mockReset();
    loadStageProductionLineIdsMock.mockReset();
    loadStageProductionLineIdsMock.mockResolvedValue(new Map([
      [WIP_ITEM_ID, WIP_STAGE_LINE_ID],
      [FG_ITEM_ID, FG_STAGE_LINE_ID],
    ]));
    vi.mocked(assertFgReleasedToFactoryForWo).mockReset();
  });

  it('rolls back and returns { ok:false } when FG creation fails after a WIP child insert', async () => {
    vi.mocked(assertFgReleasedToFactoryForWo).mockResolvedValue('ok');
    createWorkOrderCoreMock
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: WIP_WO_ID,
          woNumber: 'WO-CHAIN-W1',
          productId: WIP_ITEM_ID,
          itemTypeAtCreation: 'intermediate',
          plannedQuantity: '500.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: SITE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [],
        primarySchedule: { id: 'schedule-wip' },
      })
      .mockResolvedValueOnce({ ok: false, error: 'not_released_to_factory' });

    const result = await createWorkOrderChain({
      productId: FG_ITEM_ID,
      itemCode: 'FG-CHAIN',
      documentNumber: 'WO-CHAIN',
      siteId: SITE_ID,
      plannedQuantity: '1000.0000',
      productionLineId: SITE_ID,
    });

    expect(result).toEqual({
      ok: false,
      error: 'not_released_to_factory',
      planningError: 'not_released_to_factory',
      message: 'not_released_to_factory',
    });
    expect(transactionEvents).toEqual(['ROLLBACK']);
    expect(transactionEvents).not.toContain('COMMIT');
  });

  it('creates the chain when the FG is released even if WIP child items are unreleased', async () => {
    vi.mocked(assertFgReleasedToFactoryForWo).mockResolvedValue('ok');
    createWorkOrderCoreMock
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: WIP_WO_ID,
          woNumber: 'WO-CHAIN-W1',
          productId: WIP_ITEM_ID,
          itemTypeAtCreation: 'intermediate',
          plannedQuantity: '500.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: SITE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [],
        primarySchedule: { id: 'schedule-wip' },
      })
      .mockResolvedValueOnce({
        ok: true,
        workOrder: {
          id: FG_WO_ID,
          woNumber: 'WO-CHAIN',
          productId: FG_ITEM_ID,
          itemTypeAtCreation: 'fg',
          plannedQuantity: '1000.0000',
          producedQuantity: null,
          uom: 'kg',
          status: 'DRAFT',
          scheduledStartTime: null,
          scheduledEndTime: null,
          productionLineId: SITE_ID,
          priority: 'normal',
          sourceOfDemand: 'manual',
          sourceReference: null,
          notes: null,
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        materials: [{
          id: MATERIAL_ID,
          woId: FG_WO_ID,
          productId: WIP_ITEM_ID,
          materialName: 'WIP-STAGE-1',
          requiredQty: '500.000',
          consumedQty: '0.000',
          reservedQty: '0.000',
          uom: 'kg',
          sequence: 1,
          materialSource: 'stock',
          bomItemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          bomVersion: 1,
          notes: null,
        }],
        primarySchedule: { id: 'schedule-fg', plannedWoId: FG_WO_ID },
      });

    const client = makeClient();
    const result = await createWorkOrderChainForContext(
      { userId: USER_ID, orgId: ORG_ID, client },
      {
        productId: FG_ITEM_ID,
        itemCode: 'FG-CHAIN',
        documentNumber: 'WO-CHAIN',
        siteId: SITE_ID,
        plannedQuantity: '1000.0000',
        productionLineId: SITE_ID,
      },
    );

    expect(result.ok).toBe(true);
    expect(assertFgReleasedToFactoryForWo).toHaveBeenCalledTimes(1);
    expect(assertFgReleasedToFactoryForWo).toHaveBeenCalledWith(client, FG_ITEM_ID);
    const wipCall = createWorkOrderCoreMock.mock.calls[0]?.[1] as { itemTypeAtCreation?: string };
    expect(wipCall.itemTypeAtCreation).toBe('intermediate');
  });

  it('blocks before any write when the FG root is not released to factory', async () => {
    vi.mocked(assertFgReleasedToFactoryForWo).mockResolvedValue('not_released_to_factory');

    const client = makeClient();
    const result = await createWorkOrderChainForContext(
      { userId: USER_ID, orgId: ORG_ID, client },
      {
        productId: FG_ITEM_ID,
        itemCode: 'FG-CHAIN',
        documentNumber: 'WO-CHAIN',
        siteId: SITE_ID,
        plannedQuantity: '1000.0000',
        productionLineId: SITE_ID,
      },
    );

    expect(result).toEqual({ ok: false, error: 'not_released_to_factory' });
    expect(createWorkOrderCoreMock).not.toHaveBeenCalled();
  });
});
