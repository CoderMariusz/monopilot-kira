/**
 * CL2 slice 2 — reorder-thresholds Server Action tests (mock pg dispatcher,
 * node env). Mirrors the mrp.test.ts seam.
 *
 * Covers: read gate (scheduler.run.read) on the list, write gate
 * (npd.planning.write) on upsert/delete, item-type + soft-supplier-FK
 * service-layer validation (mig-178 comment), the DDL-shaped UPSERT (decimal
 * string binds, ON CONFLICT on the (org_id, item_id) unique key), audit
 * writes, and zod validation of quantities.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteReorderThreshold,
  listReorderThresholds,
  upsertReorderThreshold,
} from './reorder-thresholds';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const THRESHOLD_ID = '55555555-5555-4555-8555-555555555555';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let client: QueryClient;
let allowRead = true;
let allowWrite = true;
let itemExists = true;
let supplierExists = true;
let executed: string[] = [];
let upsertParams: readonly unknown[] | null = null;
let auditParams: readonly unknown[] | null = null;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

// The list/picker seams pull in the suppliers + search-items actions; neither
// is exercised here — mock them so the import graph stays test-local.
vi.mock('../suppliers/_actions/actions', () => ({
  listSuppliers: vi.fn(async () => ({ ok: true, data: [] })),
}));
vi.mock('../../../../../(npd)/fa/actions/search-items', () => ({
  searchItems: vi.fn(async () => []),
}));

const THRESHOLD_ROW = {
  id: THRESHOLD_ID,
  item_id: ITEM_ID,
  item_code: 'RM-FLOUR',
  item_name: 'Wheat flour',
  uom_base: 'kg',
  min_qty: '20.000000',
  reorder_qty: '50.000000',
  preferred_supplier_id: SUPPLIER_ID,
  supplier_code: 'SUP-01',
  supplier_name: 'Mill & Co',
  lead_time_days: 7,
  updated_at: '2026-06-11T09:00:00.000Z',
};

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      executed.push(normalized);

      if (normalized.includes('from public.user_roles')) {
        expect(params[0]).toBe(USER_ID);
        expect(params[1]).toBe(ORG_ID);
        const permission = params[2];
        if (permission === 'scheduler.run.read') {
          return { rows: allowRead ? [{ ok: true }] : [], rowCount: allowRead ? 1 : 0 };
        }
        if (permission === 'npd.planning.write') {
          return { rows: allowWrite ? [{ ok: true }] : [], rowCount: allowWrite ? 1 : 0 };
        }
        throw new Error(`unexpected permission probe: ${String(permission)}`);
      }
      if (normalized.includes('insert into public.reorder_thresholds')) {
        upsertParams = params;
        return { rows: [{ id: THRESHOLD_ID }], rowCount: 1 };
      }
      if (normalized.includes('delete from public.reorder_thresholds')) {
        return { rows: [{ id: THRESHOLD_ID, item_id: ITEM_ID }], rowCount: 1 };
      }
      if (normalized.includes('from public.reorder_thresholds rt')) {
        return { rows: [THRESHOLD_ROW], rowCount: 1 };
      }
      if (normalized.includes('from public.items')) {
        expect(params[1]).toEqual(['rm', 'ingredient', 'intermediate', 'packaging']);
        return { rows: itemExists ? [{ id: ITEM_ID }] : [], rowCount: itemExists ? 1 : 0 };
      }
      if (normalized.includes('from public.suppliers')) {
        return { rows: supplierExists ? [{ id: SUPPLIER_ID }] : [], rowCount: supplierExists ? 1 : 0 };
      }
      if (normalized.includes('insert into public.audit_events')) {
        auditParams = params;
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${normalized}`);
    }),
  };
}

beforeEach(() => {
  client = makeClient();
  allowRead = true;
  allowWrite = true;
  itemExists = true;
  supplierExists = true;
  executed = [];
  upsertParams = null;
  auditParams = null;
});

describe('listReorderThresholds', () => {
  it('returns org-scoped thresholds joined to items + suppliers, camel-mapped', async () => {
    const result = await listReorderThresholds();
    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: THRESHOLD_ID,
          itemId: ITEM_ID,
          itemCode: 'RM-FLOUR',
          itemName: 'Wheat flour',
          uomBase: 'kg',
          minQty: '20.000000',
          reorderQty: '50.000000',
          preferredSupplierId: SUPPLIER_ID,
          supplierCode: 'SUP-01',
          supplierName: 'Mill & Co',
          leadTimeDays: 7,
          updatedAt: '2026-06-11T09:00:00.000Z',
        },
      ],
    });
    const sql = executed.find((s) => s.includes('from public.reorder_thresholds rt'))!;
    expect(sql).toContain('rt.org_id = app.current_org_id()');
    expect(sql).toContain('left join public.suppliers');
  });

  it('returns forbidden without the planning read permission', async () => {
    allowRead = false;
    expect(await listReorderThresholds()).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('upsertReorderThreshold', () => {
  const INPUT = {
    itemId: ITEM_ID,
    minQty: '20.5',
    reorderQty: '50.000001',
    preferredSupplierId: SUPPLIER_ID,
  };

  it('upserts on the mig-178 (org_id, item_id) unique key with decimal-string binds', async () => {
    const result = await upsertReorderThreshold(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(THRESHOLD_ID);

    const sql = executed.find((s) => s.includes('insert into public.reorder_thresholds'))!;
    expect(sql).toContain('app.current_org_id()');
    expect(sql).toContain('on conflict on constraint reorder_thresholds_org_item_unique');
    expect(sql).toContain('do update set min_qty = excluded.min_qty');
    // Quantities travel as the exact decimal strings the caller sent (6dp ok).
    expect(upsertParams).toEqual([ITEM_ID, '20.5', '50.000001', SUPPLIER_ID, USER_ID]);

    // Audited.
    expect(auditParams).not.toBeNull();
    expect(auditParams![2]).toBe('planning.reorder_threshold.upserted');
  });

  it('accepts a null preferred supplier (soft FK is optional)', async () => {
    const result = await upsertReorderThreshold({ ...INPUT, preferredSupplierId: null });
    expect(result.ok).toBe(true);
    expect(upsertParams![3]).toBeNull();
    // No supplier probe when none is provided.
    expect(executed.some((s) => s.includes('from public.suppliers'))).toBe(false);
  });

  it('service-layer-validates the soft supplier FK (mig-178 comment)', async () => {
    supplierExists = false;
    expect(await upsertReorderThreshold(INPUT)).toEqual({ ok: false, error: 'not_found' });
    expect(upsertParams).toBeNull();
  });

  it('rejects an item outside the org / MRP-planned types', async () => {
    itemExists = false;
    expect(await upsertReorderThreshold(INPUT)).toEqual({ ok: false, error: 'not_found' });
    expect(upsertParams).toBeNull();
  });

  it('zod-rejects negative / malformed / >6dp quantities before touching the DB', async () => {
    for (const bad of [
      { ...INPUT, minQty: '-1' },
      { ...INPUT, minQty: '1,5' },
      { ...INPUT, reorderQty: '1.0000001' },
      { ...INPUT, itemId: 'not-a-uuid' },
    ]) {
      expect(await upsertReorderThreshold(bad)).toEqual({ ok: false, error: 'invalid_input' });
    }
    expect(executed).toHaveLength(0);
  });

  it('returns forbidden without the planning WRITE permission', async () => {
    allowWrite = false;
    expect(await upsertReorderThreshold(INPUT)).toEqual({ ok: false, error: 'forbidden' });
    expect(upsertParams).toBeNull();
  });
});

describe('deleteReorderThreshold', () => {
  it('deletes org-scoped and audits', async () => {
    const result = await deleteReorderThreshold(THRESHOLD_ID);
    expect(result).toEqual({ ok: true, data: { id: THRESHOLD_ID } });
    const sql = executed.find((s) => s.includes('delete from public.reorder_thresholds'))!;
    expect(sql).toContain('org_id = app.current_org_id()');
    expect(auditParams![2]).toBe('planning.reorder_threshold.deleted');
  });

  it('rejects a non-uuid id', async () => {
    expect(await deleteReorderThreshold('nope')).toEqual({ ok: false, error: 'invalid_input' });
    expect(executed).toHaveLength(0);
  });

  it('returns forbidden without the planning WRITE permission', async () => {
    allowWrite = false;
    expect(await deleteReorderThreshold(THRESHOLD_ID)).toEqual({ ok: false, error: 'forbidden' });
  });
});
