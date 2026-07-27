import { beforeEach, describe, expect, it, vi } from 'vitest';

const { WO_ID, SITE_ID } = vi.hoisted(() => ({
  WO_ID: '33333333-3333-4333-8333-333333333333',
  SITE_ID: '44444444-4444-4444-8444-444444444444',
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => WO_ID),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const BOM_V2_ID = '66666666-6666-4666-8666-666666666666';
const BOM_V3_ID = '77777777-7777-4777-8777-777777777777';
const PRODUCT_CODE = 'FG-001';

import { createWorkOrderCore } from '../../../../planning/work-orders/_actions/create-work-order-core';
import type { OrgActionContext, QueryClient } from '../../../../planning/work-orders/_actions/shared';
import { deleteBomVersion } from '../delete-bom-version';
import { getVersionDeleteGuard } from '../delete-guard';

const withOrgContextMock = vi.fn();

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (fn: (ctx: { userId: string; orgId: string; client: unknown }) => Promise<unknown>) =>
    withOrgContextMock(fn),
}));

vi.mock('../../../../../../../../lib/documents/numbering', () => ({
  nextDocumentNumber: vi.fn(async () => 'WO-0001'),
}));

vi.mock('../../../../../../../../lib/site/site-context', () => ({
  resolveWriteSiteId: vi.fn(async () => ({ ok: true as const, siteId: SITE_ID })),
}));

vi.mock('../../../../../../../../lib/planning/factory-release-wo-gate', () => ({
  assertFgReleasedToFactoryForWo: vi.fn(async () => 'released'),
}));

vi.mock('../../../../../../../../lib/technical/factory-spec-bind-lock', () => ({
  fetchEligibleFactorySpecUnderBindLock: vi.fn(async () => ({ id: 'spec-1' })),
}));

vi.mock('../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
  };
});

vi.mock('../../../../planning/work-orders/_actions/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../planning/work-orders/_actions/shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
  };
});

type SnapshotRow = {
  id: string;
  org_id: string;
  work_order_id: string;
  bom_header_id: string;
  snapshot_json: Record<string, unknown>;
  snapshot_at: Date;
};

type BomHeaderRow = {
  id: string;
  product_id: string;
  version: number;
  status: string;
  yield_pct: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  item_code?: string;
};

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeFlowStore() {
  const snapshots: SnapshotRow[] = [];
  let nextSnapshotId = 1;
  const headers: BomHeaderRow[] = [
    {
      id: BOM_V2_ID,
      product_id: ITEM_ID,
      version: 2,
      status: 'draft',
      yield_pct: '100',
      effective_from: '2026-01-01',
      effective_to: null,
      notes: null,
      item_code: PRODUCT_CODE,
    },
    {
      id: BOM_V3_ID,
      product_id: ITEM_ID,
      version: 3,
      status: 'active',
      yield_pct: '100',
      effective_from: '2026-01-01',
      effective_to: null,
      notes: null,
      item_code: PRODUCT_CODE,
    },
  ];

  function queryClient(): QueryClient {
    return {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        const q = normalize(sql);

        if (q.includes('from public.bom_snapshots')) {
          if (q.includes('count(*)')) {
            const headerId = String(params?.[0]);
            const n = snapshots.filter((s) => s.bom_header_id === headerId).length;
            return { rows: [{ n, snapshot_count: n }] };
          }
          const woId = String(params?.[0]);
          const headerId = params?.[1] != null ? String(params?.[1]) : null;
          const found = snapshots.find(
            (s) => s.work_order_id === woId && (!headerId || s.bom_header_id === headerId),
          );
          return { rows: found ? [found] : [] };
        }

        if (q.includes('insert into public.bom_snapshots')) {
          const woId = String(params?.[0]);
          const headerId = String(params?.[1]);
          const existing = snapshots.find((s) => s.work_order_id === woId && s.bom_header_id === headerId);
          if (existing) return { rows: [] };
          const row: SnapshotRow = {
            id: `snap-${nextSnapshotId++}`,
            org_id: ORG_ID,
            work_order_id: woId,
            bom_header_id: headerId,
            snapshot_json: JSON.parse(String(params?.[2])),
            snapshot_at: new Date('2026-07-01T00:00:00.000Z'),
          };
          snapshots.push(row);
          return { rows: [row] };
        }

        if (q.startsWith('delete from public.bom_headers')) {
          return { rowCount: 0 };
        }

        if (q.includes('from public.bom_headers')) {
          if (q.includes('count(*)')) {
            const n = headers.filter((h) => h.product_id === ITEM_ID).length;
            return { rows: [{ version_count: n }] };
          }
          // Matches both the un-aliased lookup (`and version = $2`, delete-guard.ts)
          // and the aliased one (`and bh.version = $2`, delete-bom-version.ts, which
          // joins public.items to project item_code as product_id).
          if (q.includes('version = $2')) {
            const version = Number(params?.[1]);
            const header = headers.find((h) => h.version === version);
            if (!header) return { rows: [] };
            return {
              rows: [{
                id: header.id,
                product_id: header.item_code ?? PRODUCT_CODE,
                version: header.version,
                status: header.status,
                yield_pct: header.yield_pct,
                effective_from: header.effective_from,
                effective_to: header.effective_to,
                notes: header.notes,
              }],
            };
          }
          if (q.includes('status =')) {
            const active = headers.find((h) => h.status === 'active');
            return { rows: active ? [{ id: active.id, version: active.version, line_basis: 'per_kg' }] : [] };
          }
          const headerId = String(params?.[0]);
          const header = headers.find((h) => h.id === headerId);
          if (!header) return { rows: [] };
          return {
            rows: [{
              id: header.id,
              product_id: header.product_id,
              npd_project_id: null,
              fa_code: null,
              origin_module: 'technical',
              status: header.status,
              version: header.version,
              supersedes_bom_header_id: null,
              yield_pct: header.yield_pct,
              effective_from: header.effective_from,
              effective_to: header.effective_to,
              approved_by: null,
              approved_at: null,
              notes: header.notes,
            }],
          };
        }

        if (q.includes('from public.items')) {
          if (q.includes('item_code = $1')) return { rows: [{ id: ITEM_ID }] };
          if (q.includes('output_uom')) {
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
        }

        if (q.includes('from public.sites')) return { rows: [{ id: SITE_ID }] };
        if (q.includes('from public.bom_lines')) {
          return {
            rows: [{
              id: 'line-1',
              line_no: 1,
              item_id: null,
              component_code: 'RM-1',
              component_type: 'rm',
              quantity: '1',
              uom: 'kg',
              scrap_pct: '0',
              manufacturing_operation_name: null,
              sequence: 1,
              is_phantom: false,
              notes: null,
            }],
          };
        }
        if (q.includes('from public.bom_co_products')) return { rows: [] };
        if (q.includes('insert into public.work_orders')) {
          return {
            rows: [{
              id: WO_ID,
              wo_number: 'WO-0001',
              product_id: ITEM_ID,
              item_code: PRODUCT_CODE,
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
              source_reference: PRODUCT_CODE,
              notes: null,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            }],
          };
        }
        if (q.includes('insert into public.wo_materials')) return { rows: [] };
        if (q.includes('insert into public.schedule_outputs')) {
          return {
            rows: [{
              id: 'sched-1',
              planned_wo_id: WO_ID,
              product_id: ITEM_ID,
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
    };
  }

  return { snapshots, headers, queryClient };
}

describe('create → deleteBomVersion planned WO snapshot protection (PF-R06-11)', () => {
  beforeEach(() => {
    withOrgContextMock.mockReset();
    withOrgContextMock.mockImplementation(async (fn) =>
      fn({ userId: USER_ID, orgId: ORG_ID, client: makeFlowStore().queryClient() }),
    );
  });

  it('blocks deleteBomVersion after createWorkOrderCore froze the active BOM version', async () => {
    const store = makeFlowStore();
    withOrgContextMock.mockImplementation(async (fn) =>
      fn({ userId: USER_ID, orgId: ORG_ID, client: store.queryClient() }),
    );

    const createCtx: OrgActionContext = { userId: USER_ID, orgId: ORG_ID, client: store.queryClient() };
    const created = await createWorkOrderCore(createCtx, {
      productId: ITEM_ID,
      itemCode: PRODUCT_CODE,
      plannedQuantity: '100',
      siteId: SITE_ID,
    });
    expect(created.ok).toBe(true);
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0]?.bom_header_id).toBe(BOM_V3_ID);

    const guard = await getVersionDeleteGuard(PRODUCT_CODE, 3);
    expect(guard).toEqual({
      ok: true,
      data: {
        bomHeaderId: BOM_V3_ID,
        versionLabel: 'v3',
        snapshotCount: 1,
        deletable: false,
      },
    });

    const v3 = store.headers.find((h) => h.version === 3);
    if (v3) v3.status = 'draft';

    const deleted = await deleteBomVersion({ productId: PRODUCT_CODE, version: 3 });
    expect(deleted).toEqual({
      ok: false,
      error: 'snapshot_referenced',
      message: 'Cannot delete a BOM version referenced by snapshots',
      snapshotCount: 1,
    });
  });
});
