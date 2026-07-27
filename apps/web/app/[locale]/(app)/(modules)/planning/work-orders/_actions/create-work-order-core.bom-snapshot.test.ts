import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createBomSnapshotMock, WO_ID } = vi.hoisted(() => ({
  createBomSnapshotMock: vi.fn(),
  WO_ID: '66666666-6666-4666-8666-666666666666',
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => WO_ID),
}));

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
  assertFgReleasedToFactoryForWo: vi.fn(async () => 'released'),
}));

vi.mock('../../../../../../../lib/technical/bom/snapshot', () => ({
  createBomSnapshot: (...args: unknown[]) => createBomSnapshotMock(...args),
  BomSnapshotError: class BomSnapshotError extends Error {
    readonly code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  },
}));

vi.mock('./shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
  };
});

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ID = '44444444-4444-4444-8444-444444444444';
const BOM_HEADER_ID = '55555555-5555-4555-8555-555555555555';

function makeCtx(client: QueryClient): OrgActionContext {
  return { userId: USER_ID, orgId: ORG_ID, client };
}

function makeSuccessfulClient(overrides?: { bom?: { id: string; version: number; line_basis: string } | null }) {
  const bom = overrides && 'bom' in overrides ? overrides.bom : { id: BOM_HEADER_ID, version: 3, line_basis: 'per_kg' };
  return {
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
        return { rows: bom ? [bom] : [] };
      }
      if (sql.includes('from public.factory_specs')) {
        return { rows: [{ id: 'spec-1' }] };
      }
      if (sql.includes('insert into public.work_orders')) {
        return {
          rows: [{
            id: WO_ID,
            wo_number: 'WO-0001',
            product_id: PRODUCT_ID,
            item_code: 'FG-001',
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
      if (sql.includes('insert into public.wo_materials')) {
        return { rows: [] };
      }
      if (sql.includes('insert into public.schedule_outputs')) {
        return {
          rows: [{
            id: 'sched-1',
            planned_wo_id: WO_ID,
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
}

describe('createWorkOrderCore BOM snapshot at creation (PF-R06-11)', () => {
  beforeEach(() => {
    vi.mocked(hasPermission).mockResolvedValue(true);
    createBomSnapshotMock.mockReset();
    createBomSnapshotMock.mockResolvedValue({
      id: 'snap-1',
      orgId: ORG_ID,
      workOrderId: WO_ID,
      bomHeaderId: BOM_HEADER_ID,
      snapshotJson: {},
      snapshotAt: '2026-07-27T00:00:00.000Z',
    });
  });

  it('freezes the active BOM into bom_snapshots when a WO header is created', async () => {
    const client = makeSuccessfulClient();

    const result = await createWorkOrderCore(makeCtx(client), {
      productId: PRODUCT_ID,
      itemCode: 'FG-001',
      plannedQuantity: '100',
      siteId: SITE_ID,
    });

    expect(result.ok).toBe(true);
    expect(createBomSnapshotMock).toHaveBeenCalledTimes(1);
    expect(createBomSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, orgId: ORG_ID, client }),
      { woId: WO_ID, bomHeaderId: BOM_HEADER_ID },
    );
  });

  it('does not call createBomSnapshot when there is no active BOM and surfaces no_active_bom', async () => {
    const client = makeSuccessfulClient({ bom: null });

    const result = await createWorkOrderCore(makeCtx(client), {
      productId: PRODUCT_ID,
      itemCode: 'FG-001',
      plannedQuantity: '100',
      siteId: SITE_ID,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warning).toBe('no_active_bom');
    }
    expect(createBomSnapshotMock).not.toHaveBeenCalled();
  });

  it('rethrows BomSnapshotError so withOrgContext can roll back the WO header', async () => {
    const { BomSnapshotError } = await import('../../../../../../../lib/technical/bom/snapshot');
    createBomSnapshotMock.mockRejectedValueOnce(new BomSnapshotError('BOM_NOT_FOUND'));
    const client = makeSuccessfulClient();

    await expect(
      createWorkOrderCore(makeCtx(client), {
        productId: PRODUCT_ID,
        itemCode: 'FG-001',
        plannedQuantity: '100',
        siteId: SITE_ID,
      }),
    ).rejects.toBeInstanceOf(BomSnapshotError);
  });
});
