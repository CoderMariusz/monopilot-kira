import { beforeEach, describe, expect, it, vi } from 'vitest';

const { WO_ID, SITE_ID, FACTORY_SPEC_ID } = vi.hoisted(() => ({
  WO_ID: '33333333-3333-4333-8333-333333333333',
  SITE_ID: '44444444-4444-4444-8444-444444444444',
  FACTORY_SPEC_ID: '66666666-6666-4666-8666-666666666666',
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => WO_ID),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BOM_HEADER_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const TXN_ID = '99999999-9999-4999-8999-999999999999';

import { createWorkOrderCore } from '../../../app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-core';
import type { OrgActionContext, QueryClient } from '../../../app/[locale]/(app)/(modules)/planning/work-orders/_actions/shared';
import { type ProductionContext, startWo } from '../start-wo';
import { applyTransition } from '../wo-state-machine';

vi.mock('../../../app/[locale]/(app)/(modules)/planning/work-orders/_actions/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../app/[locale]/(app)/(modules)/planning/work-orders/_actions/shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
  };
});

vi.mock('../../../lib/documents/numbering', () => ({
  nextDocumentNumber: vi.fn(async () => 'WO-0001'),
}));

vi.mock('../../../lib/site/site-context', () => ({
  resolveWriteSiteId: vi.fn(async () => ({ ok: true as const, siteId: SITE_ID })),
}));

vi.mock('../../../lib/planning/factory-release-wo-gate', () => ({
  assertFgReleasedToFactoryForWo: vi.fn(async () => 'released'),
}));

vi.mock('../../../lib/technical/factory-spec-bind-lock', () => ({
  fetchEligibleFactorySpecUnderBindLock: vi.fn(async () => ({ id: FACTORY_SPEC_ID })),
}));

vi.mock('../wo-state-machine', () => ({
  applyTransition: vi.fn(async () => ({
    ok: true,
    data: { startedAt: '2026-07-02T12:00:00.000Z' },
  })),
}));

type SnapshotRow = {
  id: string;
  org_id: string;
  work_order_id: string;
  bom_header_id: string;
  snapshot_json: Record<string, unknown>;
  snapshot_at: Date;
};

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeSharedSnapshotStore() {
  const snapshots: SnapshotRow[] = [];
  let nextId = 1;

  function querySnapshots(sql: string, params?: readonly unknown[]) {
    const q = normalize(sql);
    if (q.includes('from public.bom_snapshots') && q.startsWith('select')) {
      const woId = String(params?.[0]);
      const headerId = params?.[1] != null ? String(params?.[1]) : null;
      const found = snapshots.find(
        (s) => s.work_order_id === woId && (!headerId || s.bom_header_id === headerId),
      );
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }
    if (q.includes('insert into public.bom_snapshots')) {
      const woId = String(params?.[0]);
      const headerId = String(params?.[1]);
      const existing = snapshots.find((s) => s.work_order_id === woId && s.bom_header_id === headerId);
      if (existing) {
        return { rows: [], rowCount: 0 };
      }
      const row: SnapshotRow = {
        id: `snap-${nextId++}`,
        org_id: ORG_ID,
        work_order_id: woId,
        bom_header_id: headerId,
        snapshot_json: JSON.parse(String(params?.[2])),
        snapshot_at: new Date('2026-07-01T00:00:00.000Z'),
      };
      snapshots.push(row);
      return { rows: [row], rowCount: 1 };
    }
    return null;
  }

  return { snapshots, querySnapshots };
}

function makeCreateClient(store: ReturnType<typeof makeSharedSnapshotStore>): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const snap = store.querySnapshots(sql, params);
      if (snap) return snap;
      const q = normalize(sql);
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
        };
      }
      if (q.includes('from public.sites')) return { rows: [{ id: SITE_ID }] };
      if (q.includes('from public.bom_headers') && q.includes('status =')) {
        return { rows: [{ id: BOM_HEADER_ID, version: 3, line_basis: 'per_kg' }] };
      }
      if (q.includes('from public.bom_headers') && q.includes('where org_id = app.current_org_id() and id =')) {
        return {
          rows: [{
            id: BOM_HEADER_ID,
            product_id: PRODUCT_ID,
            npd_project_id: null,
            fa_code: null,
            origin_module: 'technical',
            status: 'active',
            version: 3,
            supersedes_bom_header_id: null,
            yield_pct: '100',
            effective_from: '2026-01-01',
            effective_to: null,
            approved_by: null,
            approved_at: null,
            notes: null,
          }],
        };
      }
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
      if (q.includes('insert into public.wo_materials')) return { rows: [] };
      if (q.includes('insert into public.schedule_outputs')) {
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
  };
}

function makeStartClient(store: ReturnType<typeof makeSharedSnapshotStore>): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const snap = store.querySnapshots(sql, params);
      if (snap) return snap;
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
      if (q.includes('from public.work_orders') && q.startsWith('select')) {
        return {
          rows: [{
            id: WO_ID,
            site_id: SITE_ID,
            item_type_at_creation: 'fg',
            active_bom_header_id: BOM_HEADER_ID,
            active_factory_spec_id: FACTORY_SPEC_ID,
            allergen_profile_snapshot: null,
            production_line_id: null,
          }],
          rowCount: 1,
        };
      }
      if (q.includes('from public.bom_headers') || q.includes('from public.factory_specs')) {
        return {
          rows: [{
            bom_exists: true,
            spec_exists: true,
            spec_site_id: SITE_ID,
            spec_bom_header_id: BOM_HEADER_ID,
          }],
          rowCount: 1,
        };
      }
      if (q.includes('from public.bom_headers') && q.includes('where org_id = app.current_org_id() and id =')) {
        return {
          rows: [{
            id: BOM_HEADER_ID,
            product_id: PRODUCT_ID,
            npd_project_id: null,
            fa_code: null,
            origin_module: 'technical',
            status: 'active',
            version: 3,
            supersedes_bom_header_id: null,
            yield_pct: '100',
            effective_from: '2026-01-01',
            effective_to: null,
            approved_by: null,
            approved_at: null,
            notes: null,
          }],
        };
      }
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
      if (q.includes('from public.changeover_events')) return { rows: [], rowCount: 0 };
      if (q.includes('from public.schedule_outputs')) return { rows: [], rowCount: 0 };
      if (q.startsWith('insert into public.outbox_events')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('create → snapshot → start BOM snapshot reuse (PF-R06-11)', () => {
  beforeEach(() => {
    vi.mocked(applyTransition).mockClear();
  });

  it('freezes at WO creation and reuses the same snapshot id at START', async () => {
    const store = makeSharedSnapshotStore();
    const createCtx: OrgActionContext = { userId: USER_ID, orgId: ORG_ID, client: makeCreateClient(store) };

    const created = await createWorkOrderCore(createCtx, {
      productId: PRODUCT_ID,
      itemCode: 'FG-001',
      plannedQuantity: '100',
      siteId: SITE_ID,
    });

    expect(created.ok).toBe(true);
    expect(store.snapshots).toHaveLength(1);
    const creationSnapshotId = store.snapshots[0]!.id;

    const startCtx: ProductionContext = { userId: USER_ID, orgId: ORG_ID, client: makeStartClient(store) };
    const started = await startWo(startCtx, { woId: WO_ID, transactionId: TXN_ID });

    expect(started.ok).toBe(true);
    expect(store.snapshots).toHaveLength(1);
    expect(applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: expect.objectContaining({ bomSnapshotId: creationSnapshotId }),
      }),
    );
    if (started.ok) {
      expect(started.data.bomSnapshotId).toBe(creationSnapshotId);
    }
  });
});
