import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkOrderCore } from './create-work-order-core';
import { hasPermission } from './shared';
import type { OrgActionContext, QueryClient } from './shared';

vi.mock('../../../../../../../lib/documents/numbering', () => ({
  nextDocumentNumber: vi.fn(async () => 'WO-0001'),
}));

vi.mock('../../../../../../../lib/site/site-context', () => ({
  resolveWriteSiteId: vi.fn(async () => ({ ok: true as const, siteId: 'site-1' })),
}));

vi.mock('../../../../../../../lib/planning/factory-release-wo-gate', () => ({
  assertFgReleasedToFactoryForWo: vi.fn(),
}));

vi.mock('./shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
  };
});

import { assertFgReleasedToFactoryForWo } from '../../../../../../../lib/planning/factory-release-wo-gate';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ID = '44444444-4444-4444-8444-444444444444';

function makeCtx(client: QueryClient): OrgActionContext {
  return { userId: USER_ID, orgId: ORG_ID, client };
}

describe('createWorkOrderCore factory-release gate', () => {
  beforeEach(() => {
    vi.mocked(hasPermission).mockResolvedValue(true);
    vi.mocked(assertFgReleasedToFactoryForWo).mockReset();
  });

  it('returns not_released_to_factory when the FG is not owner-released', async () => {
    vi.mocked(assertFgReleasedToFactoryForWo).mockResolvedValue('not_released_to_factory');
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('from public.items') && sql.includes('output_uom')) {
          return {
            rows: [{
              output_uom: 'base',
              uom_base: 'kg',
              net_qty_per_each: null,
              each_per_box: null,
              boxes_per_pallet: null,
              weight_mode: 'fixed',
            }],
          };
        }
        if (sql.includes('from public.sites')) {
          return { rows: [{ id: SITE_ID }] };
        }
        return { rows: [] };
      }),
    } as unknown as QueryClient;

    const result = await createWorkOrderCore(makeCtx(client), {
      productId: PRODUCT_ID,
      itemCode: 'FG-001',
      plannedQuantity: '100',
      siteId: SITE_ID,
    });

    expect(result).toEqual({ ok: false, error: 'not_released_to_factory' });
  });

  it('skips the factory-release gate for the NPD pilot path', async () => {
    vi.mocked(assertFgReleasedToFactoryForWo).mockResolvedValue('not_released_to_factory');
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('from public.items') && sql.includes('output_uom')) {
          return {
            rows: [{
              output_uom: 'base',
              uom_base: 'kg',
              net_qty_per_each: null,
              each_per_box: null,
              boxes_per_pallet: null,
              weight_mode: 'fixed',
            }],
          };
        }
        if (sql.includes('from public.sites')) {
          return { rows: [{ id: SITE_ID }] };
        }
        if (sql.includes('insert into public.work_orders')) {
          return {
            rows: [{
              id: 'wo-1',
              wo_number: 'WO-PILOT',
              product_id: PRODUCT_ID,
              item_type_at_creation: 'fg',
              planned_quantity: '100',
              produced_quantity: '0',
              uom: 'kg',
              status: 'DRAFT',
              scheduled_start_time: null,
              scheduled_end_time: null,
              production_line_id: null,
              priority: 'normal',
              source_of_demand: 'manual',
              source_reference: 'FG-001',
              notes: null,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            }],
          };
        }
        if (sql.includes('insert into public.schedule_outputs')) {
          return {
            rows: [{
              id: 'sched-1',
              planned_wo_id: 'wo-1',
              product_id: PRODUCT_ID,
              output_role: 'primary',
              expected_qty: '100',
              uom: 'kg',
              allocation_pct: '100',
              disposition: 'to_stock',
              downstream_wo_id: null,
              notes: null,
            }],
          };
        }
        return { rows: [] };
      }),
    } as unknown as QueryClient;

    const result = await createWorkOrderCore(
      makeCtx(client),
      {
        productId: PRODUCT_ID,
        itemCode: 'FG-001',
        plannedQuantity: '100',
        siteId: SITE_ID,
      },
      { skipFactoryReleaseGate: true },
    );

    expect(assertFgReleasedToFactoryForWo).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('skips the factory-release gate for upstream WIP children (intermediate item type)', async () => {
    vi.mocked(assertFgReleasedToFactoryForWo).mockResolvedValue('not_released_to_factory');
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('from public.items') && sql.includes('output_uom')) {
          return {
            rows: [{
              output_uom: 'base',
              uom_base: 'kg',
              net_qty_per_each: null,
              each_per_box: null,
              boxes_per_pallet: null,
              weight_mode: 'fixed',
            }],
          };
        }
        if (sql.includes('from public.sites')) {
          return { rows: [{ id: SITE_ID }] };
        }
        if (sql.includes('from public.bom_headers')) {
          return { rows: [] };
        }
        if (sql.startsWith('insert into public.work_orders')) {
          return {
            rows: [{
              id: 'wo-wip-1',
              wo_number: 'WO-WIP-1',
              product_id: PRODUCT_ID,
              item_code: 'WIP-001',
              item_type_at_creation: 'intermediate',
              planned_quantity: '100',
              produced_quantity: null,
              uom: 'kg',
              status: 'DRAFT',
              scheduled_start_time: null,
              scheduled_end_time: null,
              production_line_id: null,
              priority: 'normal',
              source_of_demand: 'manual',
              source_reference: null,
              notes: null,
              created_at: '2026-07-07T00:00:00.000Z',
              updated_at: '2026-07-07T00:00:00.000Z',
            }],
          };
        }
        if (sql.startsWith('insert into public.schedule_outputs')) {
          return {
            rows: [{
              id: 'sched-wip-1',
              planned_wo_id: 'wo-wip-1',
              product_id: PRODUCT_ID,
              output_role: 'primary',
              expected_qty: '100',
              uom: 'kg',
              allocation_pct: '100.00',
              disposition: 'to_stock',
              downstream_wo_id: null,
              notes: null,
            }],
          };
        }
        return { rows: [] };
      }),
    } as unknown as QueryClient;

    const result = await createWorkOrderCore(makeCtx(client), {
      productId: PRODUCT_ID,
      itemCode: 'WIP-001',
      itemTypeAtCreation: 'intermediate',
      plannedQuantity: '100',
      siteId: SITE_ID,
    });

    expect(assertFgReleasedToFactoryForWo).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('ignores skipFactoryReleaseGate smuggled in client params — gate still blocks', async () => {
    vi.mocked(assertFgReleasedToFactoryForWo).mockResolvedValue('not_released_to_factory');
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('from public.items') && sql.includes('output_uom')) {
          return {
            rows: [{
              output_uom: 'base',
              uom_base: 'kg',
              net_qty_per_each: null,
              each_per_box: null,
              boxes_per_pallet: null,
              weight_mode: 'fixed',
            }],
          };
        }
        if (sql.includes('from public.sites')) {
          return { rows: [{ id: SITE_ID }] };
        }
        return { rows: [] };
      }),
    } as unknown as QueryClient;

    const result = await createWorkOrderCore(makeCtx(client), {
      productId: PRODUCT_ID,
      itemCode: 'FG-001',
      plannedQuantity: '100',
      siteId: SITE_ID,
      skipFactoryReleaseGate: true,
    } as Parameters<typeof createWorkOrderCore>[1] & { skipFactoryReleaseGate: boolean });

    expect(assertFgReleasedToFactoryForWo).toHaveBeenCalledWith(client, PRODUCT_ID);
    expect(result).toEqual({ ok: false, error: 'not_released_to_factory' });
  });
});
