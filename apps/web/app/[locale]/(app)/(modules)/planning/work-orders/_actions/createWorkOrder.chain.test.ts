import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkOrder } from './createWorkOrder';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const WIP_PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const FG_WO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WIP_WO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MATERIAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SCHEDULE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const { createWorkOrderCoreMock, createWorkOrderChainForContextMock } = vi.hoisted(() => ({
  createWorkOrderCoreMock: vi.fn(),
  createWorkOrderChainForContextMock: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('./create-work-order-core', () => ({
  createWorkOrderCore: createWorkOrderCoreMock,
}));

vi.mock('./create-work-order-chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./create-work-order-chain')>();
  return {
    ...actual,
    createWorkOrderChainForContext: createWorkOrderChainForContextMock,
  };
});

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const BOM_LATEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOM_OLDER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let hasWipLinesOnLatest = false;
let client: QueryClient;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.includes('from public.bom_headers')) {
        return {
          rows: [{ id: BOM_LATEST_ID, version: 2, line_basis: 'per_base' }],
          rowCount: 1,
        };
      }
      if (q.includes('from public.bom_lines') && q.includes('component_type = \'wip\'')) {
        const bomId = String(params[0]);
        if (bomId === BOM_LATEST_ID && hasWipLinesOnLatest) {
          return {
            rows: [{
              id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              line_no: 10,
              item_id: WIP_PRODUCT_ID,
              component_code: 'WIP-STAGE-1',
              quantity: '0.5',
              scrap_pct: '0',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }
      if (q.includes('from public.sites')) {
        return { rows: [{ id: SITE_ID }], rowCount: 1 };
      }
      if (q.startsWith('update public.org_document_settings')) {
        return {
          rows: [{ old_seq: 12, number_prefix: 'WO', number_date_part: 'YYYYMM', number_seq_padding: 4 }],
          rowCount: 1,
        };
      }
      if (q.includes('from public.factory_specs')) {
        return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
      }
      if (q.includes('from public.items') && q.includes('output_uom')) {
        return {
          rows: [{
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
      return { rows: [], rowCount: 0, params };
    }),
  };
}

const baseParams = {
  productId: PRODUCT_ID,
  itemCode: 'FG-NPD-004',
  plannedQuantity: '1000.000',
  scheduledStartTime: '2026-07-07T00:00:00.000Z',
  productionLineId: '77777777-7777-4777-8777-777777777777',
  notes: 'planning chain',
};

describe('createWorkOrder WIP chain branch', () => {
  beforeEach(() => {
    hasWipLinesOnLatest = false;
    client = makeClient();
    createWorkOrderCoreMock.mockReset();
    createWorkOrderChainForContextMock.mockReset();
    vi.mocked(withOrgContext).mockImplementation(async (action) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
  });

  it('keeps the single-WO path when allowChain is false even if the latest BOM has WIP lines', async () => {
    hasWipLinesOnLatest = true;
    createWorkOrderCoreMock.mockResolvedValue({
      ok: true,
      workOrder: { id: FG_WO_ID, woNumber: 'WO-0012' },
      materials: [],
      primarySchedule: { id: SCHEDULE_ID },
    });

    const result = await createWorkOrder(baseParams);

    expect(result.ok).toBe(true);
    expect(createWorkOrderCoreMock).toHaveBeenCalledTimes(1);
    expect(createWorkOrderChainForContextMock).not.toHaveBeenCalled();
  });

  it('uses the latest active BOM only — older active BOM with WIP does not trigger chain', async () => {
    hasWipLinesOnLatest = false;
    createWorkOrderCoreMock.mockResolvedValue({
      ok: true,
      workOrder: { id: FG_WO_ID, woNumber: 'WO-0012' },
      materials: [],
      primarySchedule: { id: SCHEDULE_ID },
    });

    const result = await createWorkOrder(baseParams, { allowChain: true });

    expect(result.ok).toBe(true);
    expect(createWorkOrderCoreMock).toHaveBeenCalledTimes(1);
    expect(createWorkOrderChainForContextMock).not.toHaveBeenCalled();
    expect(BOM_OLDER_ID).not.toBe(BOM_LATEST_ID);
  });

  it('keeps the single-WO path when the latest active BOM has no WIP lines', async () => {
    createWorkOrderCoreMock.mockResolvedValue({
      ok: true,
      workOrder: { id: FG_WO_ID, woNumber: 'WO-0012' },
      materials: [],
      primarySchedule: { id: SCHEDULE_ID },
    });

    const result = await createWorkOrder(baseParams);

    expect(result.ok).toBe(true);
    expect(createWorkOrderCoreMock).toHaveBeenCalledTimes(1);
    expect(createWorkOrderCoreMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, orgId: ORG_ID, client }),
      baseParams,
    );
    expect(createWorkOrderChainForContextMock).not.toHaveBeenCalled();
  });

  it('calls createWorkOrderChainForContext when allowChain is true and the latest BOM has WIP lines', async () => {
    hasWipLinesOnLatest = true;
    createWorkOrderChainForContextMock.mockResolvedValue({
      ok: true,
      fgWorkOrder: { id: FG_WO_ID, woNumber: 'WO-0013', productId: PRODUCT_ID },
      wipWorkOrders: [{ id: WIP_WO_ID, woNumber: 'WO-0013-W1', productId: WIP_PRODUCT_ID }],
      dependencies: [{
        parentWoId: FG_WO_ID,
        childWoId: WIP_WO_ID,
        materialLink: MATERIAL_ID,
        requiredQty: '500.0000',
      }],
      created: true,
      fgMaterials: [{ id: MATERIAL_ID, productId: WIP_PRODUCT_ID, requiredQty: '500.000' }],
      fgPrimarySchedule: { id: SCHEDULE_ID, plannedWoId: FG_WO_ID },
    });

    const result = await createWorkOrder(baseParams, { allowChain: true });

    expect(result.ok).toBe(true);
    expect(createWorkOrderCoreMock).not.toHaveBeenCalled();
    expect(createWorkOrderChainForContextMock).toHaveBeenCalledTimes(1);
    expect(createWorkOrderChainForContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, orgId: ORG_ID, client }),
      expect.objectContaining({
        productId: PRODUCT_ID,
        itemCode: 'FG-NPD-004',
        siteId: SITE_ID,
        plannedQuantity: '1000.000',
        scheduledStartTime: baseParams.scheduledStartTime,
        productionLineId: baseParams.productionLineId,
        notes: baseParams.notes,
        documentNumber: expect.stringMatching(/^WO-/),
      }),
    );
    if (result.ok) {
      expect(result.workOrder.id).toBe(FG_WO_ID);
      expect(result.chain).toEqual({
        wipWorkOrders: [{ id: WIP_WO_ID, woNumber: 'WO-0013-W1', productId: WIP_PRODUCT_ID }],
        dependencies: [{
          parentWoId: FG_WO_ID,
          childWoId: WIP_WO_ID,
          materialLink: MATERIAL_ID,
          requiredQty: '500.0000',
        }],
        totalCount: 2,
      });
    }
  });
});
