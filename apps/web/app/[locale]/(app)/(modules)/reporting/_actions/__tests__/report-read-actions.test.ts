/**
 * W9-M3 — 12-Reporting read actions: mocked-dispatcher unit tests.
 *
 * Mocks withOrgContext with a fake org-scoped query client (same pattern as
 * warehouse/_actions/__tests__/location-read-actions.test.ts) and verifies:
 *   - rpt.dashboard.view is enforced fail-closed on every action,
 *   - waste % / avg yield / receipt-cycle math,
 *   - honest NULLs (no output+waste → wastePct null; no GRN → cycle null;
 *     avgConfirmedToFirstGrnDays ALWAYS null — no confirmed_at in schema),
 *   - inventory totals roll up per-warehouse rows,
 *   - day-window clamping.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getReportingExportAccess,
  inventorySnapshot,
  procurementSummary,
  productionSummary,
  qualitySummary,
} from '../report-read-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WH_ID = '33333333-3333-4333-8333-333333333333';

let client: QueryClient;
let grantedPermissions: Set<string>;

let woAggRow: Record<string, unknown>;
let woRows: Array<Record<string, unknown>>;
let outputRow: Record<string, unknown>;
let wasteRow: Record<string, unknown>;
let downtimeRow: Record<string, unknown>;
let lpRows: Array<Record<string, unknown>>;
let holdRows: Array<Record<string, unknown>>;
let inspectionRows: Array<Record<string, unknown>>;
let ncrRow: Record<string, unknown>;
let poStatusRows: Array<Record<string, unknown>>;
let poCycleRows: Array<Record<string, unknown>>;
let toRow: Record<string, unknown>;

let capturedParams: Record<string, unknown[]>;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
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
      if (q.includes('from public.user_roles')) {
        const permission = String(params?.[2]);
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }
      if (q.includes('avg(wo.yield_percent)')) {
        capturedParams.woAgg = [...(params ?? [])];
        return { rows: [woAggRow] };
      }
      if (q.includes('from public.wo_outputs')) return { rows: [outputRow] };
      if (q.includes('from public.wo_waste_log')) return { rows: [wasteRow] };
      if (q.includes('from public.downtime_events')) return { rows: [downtimeRow] };
      if (q.includes('from public.work_orders') && q.includes('order by wo.completed_at')) {
        return { rows: woRows };
      }
      if (q.includes('from public.license_plates')) return { rows: lpRows };
      if (q.includes('from public.quality_holds')) return { rows: holdRows };
      if (q.includes('from public.quality_inspections')) {
        capturedParams.inspections = [...(params ?? [])];
        return { rows: inspectionRows };
      }
      if (q.includes('from public.ncr_reports')) return { rows: [ncrRow] };
      if (q.includes('from public.purchase_orders') && q.includes('group by po.status')) {
        return { rows: poStatusRows };
      }
      if (q.includes('min(g.receipt_date)')) return { rows: poCycleRows };
      if (q.includes('from public.transfer_orders')) return { rows: [toRow] };
      throw new Error(`unexpected query: ${q.slice(0, 120)}`);
    }),
  };
}

beforeEach(() => {
  grantedPermissions = new Set(['rpt.dashboard.view', 'rpt.export.csv']);
  capturedParams = {};

  woAggRow = { wos_completed: '3', avg_yield: '0.9125' };
  woRows = [
    {
      wo_number: 'WO-0002',
      item_code: 'FG001',
      item_name: 'Meat Box',
      planned_qty: '100.000',
      actual_qty: '90.000',
      uom: 'kg',
      yield_percent: '0.9000',
      completed_at: new Date('2026-06-10T10:00:00Z'),
    },
    {
      wo_number: 'WO-0001',
      item_code: null,
      item_name: null,
      planned_qty: '50.000',
      actual_qty: null,
      uom: 'each',
      yield_percent: null,
      completed_at: '2026-06-09T08:00:00Z',
    },
  ];
  outputRow = { output_kg: '80.000' };
  wasteRow = { waste_kg: '20.000' };
  downtimeRow = { downtime_min: '45' };

  lpRows = [
    {
      warehouse_id: WH_ID,
      warehouse_code: 'WH1',
      warehouse_name: 'Main',
      lp_count: '10',
      active_lp_count: '8',
      blocked_lp_count: '2',
      qty_kg: '120.500',
      expired_count: '1',
      expiring_7d_count: '3',
    },
    {
      warehouse_id: '44444444-4444-4444-8444-444444444444',
      warehouse_code: 'WH2',
      warehouse_name: 'Cold',
      lp_count: '5',
      active_lp_count: '5',
      blocked_lp_count: '0',
      qty_kg: null,
      expired_count: '0',
      expiring_7d_count: '0',
    },
  ];

  holdRows = [
    { hold_status: 'open', count: '2' },
    { hold_status: 'investigating', count: '1' },
  ];
  inspectionRows = [
    { status: 'pending', count: '4' },
    { status: 'passed', count: '6' },
  ];
  ncrRow = { open_count: '3', closed_in_window: '5' };

  poStatusRows = [
    { status: 'confirmed', count: '2' },
    { status: 'draft', count: '1' },
  ];
  // 2 days and 4 days → avg 3.0
  poCycleRows = [
    { created_at: '2026-06-01T00:00:00Z', first_grn_at: '2026-06-03T00:00:00Z' },
    { created_at: '2026-06-02T00:00:00Z', first_grn_at: '2026-06-06T00:00:00Z' },
  ];
  toRow = { open_count: '4' };

  client = makeClient();
});

describe('productionSummary', () => {
  it('computes waste %, avg yield and downtime from the windowed aggregates', async () => {
    const res = await productionSummary({ days: 7 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.days).toBe(7);
    expect(res.data.wosCompleted).toBe(3);
    expect(res.data.outputKg).toBe('80.000');
    expect(res.data.wasteKg).toBe('20.000');
    // 20 / (80 + 20) × 100
    expect(res.data.wastePct).toBe('20.00');
    // 0.9125 fraction → 91.25 %
    expect(res.data.avgYieldPct).toBe('91.25');
    expect(res.data.downtimeMinutes).toBe(45);
    expect(res.data.rows).toHaveLength(2);
    expect(res.data.rows[0]).toEqual({
      woNumber: 'WO-0002',
      itemCode: 'FG001',
      itemName: 'Meat Box',
      plannedQty: '100.000',
      actualQty: '90.000',
      uom: 'kg',
      yieldPct: '90.00',
      completedAt: '2026-06-10T10:00:00.000Z',
    });
    // honest NULLs: WO without recorded actual_qty keeps null actual/yield
    expect(res.data.rows[1].actualQty).toBeNull();
    expect(res.data.rows[1].yieldPct).toBeNull();
  });

  it('returns honest NULLs when there is no output, waste or yield data', async () => {
    woAggRow = { wos_completed: '0', avg_yield: null };
    woRows = [];
    outputRow = { output_kg: null };
    wasteRow = { waste_kg: null };
    downtimeRow = { downtime_min: null };
    const res = await productionSummary();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.wosCompleted).toBe(0);
    expect(res.data.outputKg).toBe('0.000');
    expect(res.data.wasteKg).toBe('0.000');
    expect(res.data.wastePct).toBeNull(); // 0/0 → null, never a fabricated 0 %
    expect(res.data.avgYieldPct).toBeNull();
    expect(res.data.downtimeMinutes).toBe(0);
    expect(res.data.rows).toEqual([]);
  });

  it('defaults and clamps the day window (default 7; invalid input → default)', async () => {
    const def = await productionSummary({});
    expect(def.ok && def.data.days).toBe(7);
    expect(capturedParams.woAgg).toEqual([7]);
    const invalid = await productionSummary({ days: -3 });
    expect(invalid.ok && invalid.data.days).toBe(7);
  });

  it('is forbidden without rpt.dashboard.view', async () => {
    grantedPermissions = new Set();
    const res = await productionSummary({ days: 7 });
    expect(res).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('inventorySnapshot', () => {
  it('returns per-warehouse rows and rolls up the totals', async () => {
    const res = await inventorySnapshot();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.rows).toHaveLength(2);
    expect(res.data.rows[0]).toEqual({
      warehouseId: WH_ID,
      warehouseCode: 'WH1',
      warehouseName: 'Main',
      lpCount: 10,
      activeLpCount: 8,
      blockedLpCount: 2,
      qtyKg: '120.500',
      expiredCount: 1,
      expiring7dCount: 3,
    });
    // honest: warehouse with no kg-UoM LPs sums to 0.000 (non-kg LPs excluded by design)
    expect(res.data.rows[1].qtyKg).toBe('0.000');
    expect(res.data.totals).toEqual({
      lpCount: 15,
      activeLpCount: 13,
      blockedLpCount: 2,
      qtyKg: '120.500',
      expiredCount: 1,
      expiring7dCount: 3,
    });
  });

  it('returns an empty snapshot (empty-state) when no LPs are on hand', async () => {
    lpRows = [];
    const res = await inventorySnapshot();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.rows).toEqual([]);
    expect(res.data.totals.lpCount).toBe(0);
    expect(res.data.totals.qtyKg).toBe('0.000');
  });

  it('is forbidden without rpt.dashboard.view', async () => {
    grantedPermissions = new Set();
    expect(await inventorySnapshot()).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('qualitySummary', () => {
  it('aggregates open holds, windowed inspections by status and NCR counts', async () => {
    const res = await qualitySummary({ days: 30 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.days).toBe(30);
    expect(res.data.openHolds).toBe(3);
    expect(res.data.inspectionsByStatus).toEqual([
      { status: 'pending', count: 4 },
      { status: 'passed', count: 6 },
    ]);
    expect(capturedParams.inspections).toEqual([30]);
    expect(res.data.ncrOpen).toBe(3);
    expect(res.data.ncrClosedInWindow).toBe(5);
    expect(res.data.rows).toEqual([
      { entity: 'hold', status: 'open', count: 2 },
      { entity: 'hold', status: 'investigating', count: 1 },
      { entity: 'inspection', status: 'pending', count: 4 },
      { entity: 'inspection', status: 'passed', count: 6 },
      { entity: 'ncr', status: 'open', count: 3 },
      { entity: 'ncr', status: 'closed_in_window', count: 5 },
    ]);
  });

  it('returns zeros (empty-state) when no quality records exist', async () => {
    holdRows = [];
    inspectionRows = [];
    ncrRow = { open_count: '0', closed_in_window: '0' };
    const res = await qualitySummary();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.openHolds).toBe(0);
    expect(res.data.inspectionsByStatus).toEqual([]);
    expect(res.data.rows.every((r) => r.count === 0)).toBe(true);
  });

  it('is forbidden without rpt.dashboard.view', async () => {
    grantedPermissions = new Set();
    expect(await qualitySummary()).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('procurementSummary', () => {
  it('computes the created→first-GRN cycle average and keeps confirmed→GRN honestly null', async () => {
    const res = await procurementSummary({ days: 30 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.days).toBe(30);
    expect(res.data.posByStatus).toEqual([
      { status: 'confirmed', count: 2 },
      { status: 'draft', count: 1 },
    ]);
    // (2 days + 4 days) / 2 = 3.0
    expect(res.data.avgCreatedToFirstGrnDays).toBe('3.0');
    // ALWAYS null: purchase_orders has no confirmed_at column (documented gap)
    expect(res.data.avgConfirmedToFirstGrnDays).toBeNull();
    expect(res.data.openToCount).toBe(4);
  });

  it('returns a null cycle when no PO in the window has a GRN', async () => {
    poCycleRows = [];
    const res = await procurementSummary();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.avgCreatedToFirstGrnDays).toBeNull();
  });

  it('is forbidden without rpt.dashboard.view', async () => {
    grantedPermissions = new Set();
    expect(await procurementSummary()).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('getReportingExportAccess', () => {
  it('reports canExportCsv true when rpt.export.csv is granted', async () => {
    const res = await getReportingExportAccess();
    expect(res).toEqual({ ok: true, data: { canExportCsv: true } });
  });

  it('reports canExportCsv false when only rpt.dashboard.view is granted', async () => {
    grantedPermissions = new Set(['rpt.dashboard.view']);
    const res = await getReportingExportAccess();
    expect(res).toEqual({ ok: true, data: { canExportCsv: false } });
  });

  it('is forbidden without rpt.dashboard.view', async () => {
    grantedPermissions = new Set(['rpt.export.csv']);
    expect(await getReportingExportAccess()).toEqual({ ok: false, reason: 'forbidden' });
  });
});
