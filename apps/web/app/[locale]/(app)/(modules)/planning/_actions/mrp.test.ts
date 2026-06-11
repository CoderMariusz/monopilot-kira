/**
 * W9-M2 — runMrp Server Action tests (mock pg dispatcher, node env).
 *
 * Mirrors the purchase-orders actions.test.ts seam: withOrgContext is mocked to
 * hand the action a fake QueryClient whose dispatcher routes on SQL shape. We
 * assert the RBAC gate, the org-scoped source reads, end-to-end netting through
 * computeMrp, and the error surface.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMrp } from './mrp';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FLOUR_ID = '33333333-3333-4333-8333-333333333333';
const DOUGH_ID = '44444444-4444-4444-8444-444444444444';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let client: QueryClient;
let allowPermission = true;
let failInventoryRead = false;
/**
 * Rework scenario (Codex batch-D F2): WO_REWORK consumes 20 kg dough to make
 * dough (self-referential). Its 50 kg projected output must NOT offset its own
 * demand — the schedule_outputs anti-join has to exclude it.
 */
let reworkSelfSupply = false;
let executed: string[] = [];

const WO_OTHER = '55555555-5555-4555-8555-555555555555';
const WO_REWORK = '66666666-6666-4666-8666-666666666666';

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      executed.push(normalized);

      if (normalized.includes('from public.user_roles')) {
        expect(params).toEqual([USER_ID, ORG_ID, 'scheduler.run.read']);
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.includes('from public.items')) {
        expect(params[0]).toEqual(['rm', 'ingredient', 'intermediate', 'packaging']);
        return {
          rows: [
            {
              id: FLOUR_ID,
              item_code: 'RM-FLOUR',
              name: 'Wheat flour',
              item_type: 'rm',
              uom_base: 'kg',
              output_uom: 'base',
              net_qty_per_each: null,
              each_per_box: null,
            },
            {
              id: DOUGH_ID,
              item_code: 'INT-DOUGH',
              name: 'Bread dough',
              item_type: 'intermediate',
              uom_base: 'kg',
              output_uom: 'base',
              net_qty_per_each: null,
              each_per_box: null,
            },
          ],
          rowCount: 2,
        };
      }
      if (normalized.includes('from public.v_inventory_available')) {
        if (failInventoryRead) throw new Error('boom');
        return {
          rows: [{ product_id: FLOUR_ID, uom: 'kg', on_hand: '40.000', reserved: '10.000' }],
          rowCount: 1,
        };
      }
      // NOTE: schedule_outputs is matched BEFORE wo_materials — its SQL embeds a
      // `not exists (select 1 from public.wo_materials …)` anti-join (batch-D F2).
      if (normalized.includes('from public.schedule_outputs')) {
        expect(params[0]).toEqual(['DRAFT', 'RELEASED', 'IN_PROGRESS']);
        // Simulated DB state: raw open to_stock schedule_outputs rows, each
        // tagged with its WO; open wo_materials (wo, product) demand pairs.
        const raw = [{ wo: WO_OTHER, product_id: DOUGH_ID, uom: 'kg', qty: '12.000' }];
        const openMaterialPairs = new Set([`${WO_OTHER}:${FLOUR_ID}`]);
        if (reworkSelfSupply) {
          raw.push({ wo: WO_REWORK, product_id: DOUGH_ID, uom: 'kg', qty: '50.000' });
          openMaterialPairs.add(`${WO_REWORK}:${DOUGH_ID}`);
        }
        // The mock honours the anti-join ONLY when the action's SQL asks for it —
        // dropping the anti-join from mrp.ts re-admits the self-supply row and
        // fails the rework test below.
        const hasAntiJoin =
          normalized.includes('not exists') &&
          normalized.includes('m.wo_id = so.planned_wo_id') &&
          normalized.includes('m.product_id = so.product_id');
        const visible = hasAntiJoin
          ? raw.filter((r) => !openMaterialPairs.has(`${r.wo}:${r.product_id}`))
          : raw;
        const rows = visible.map(({ product_id, uom, qty }) => ({ product_id, uom, qty }));
        return { rows, rowCount: rows.length };
      }
      if (normalized.includes('from public.wo_materials')) {
        expect(params[0]).toEqual(['DRAFT', 'RELEASED', 'IN_PROGRESS']);
        return {
          rows: [
            { product_id: FLOUR_ID, uom: 'kg', qty: '80.000' },
            // In the rework scenario this dough demand belongs to WO_REWORK,
            // which also projects 50 kg dough output (self-supply loop).
            { product_id: DOUGH_ID, uom: 'kg', qty: '20.000' },
          ],
          rowCount: 2,
        };
      }
      if (normalized.includes('from public.purchase_order_lines')) {
        expect(params[0]).toEqual(['sent', 'confirmed', 'partially_received']);
        // Remainder already netted in SQL (ordered − received via grn_items).
        return { rows: [{ product_id: FLOUR_ID, uom: 'kg', qty: '25.000' }], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${normalized}`);
    }),
  };
}

beforeEach(() => {
  client = makeClient();
  allowPermission = true;
  failInventoryRead = false;
  reworkSelfSupply = false;
  executed = [];
});

describe('runMrp', () => {
  it('nets demand vs on-hand + open supply per item and sorts shortages first', async () => {
    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.ranAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.data.rows).toHaveLength(2);

    // Flour: 40 − 10 + 25 − 80 = −25 → BUY 25 (rm).
    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.onHand).toBe('40.000');
    expect(flour.reserved).toBe('10.000');
    expect(flour.openSupply).toBe('25.000');
    expect(flour.demand).toBe('80.000');
    expect(flour.net).toBe('-25.000');
    expect(flour.severity).toBe('shortage');
    expect(flour.suggestedAction).toEqual({ type: 'buy', qty: '25' });

    // Dough: 0 + 12 − 20 = −8 → MAKE 8 (intermediate; schedule_outputs counted as supply).
    const dough = result.data.rows.find((r) => r.itemCode === 'INT-DOUGH')!;
    expect(dough.openSupply).toBe('12.000');
    expect(dough.net).toBe('-8.000');
    expect(dough.suggestedAction).toEqual({ type: 'make', qty: '8' });

    // Shortage sort: most negative first.
    expect(result.data.rows.map((r) => r.itemCode)).toEqual(['RM-FLOUR', 'INT-DOUGH']);

    expect(result.data.kpis.itemsShort).toBe(2);
    expect(result.data.kpis.itemsAnalyzed).toBe(2);
    expect(result.data.kpis.totalDemand).toBe('100.000');
    // shortage 25 + 8 = 33 of 100 demand → 67% coverage.
    expect(result.data.kpis.coveragePct).toBe(67);
  });

  it('runs all five org-scoped source reads (RLS predicates present)', async () => {
    await runMrp();
    const sources = ['public.items', 'public.v_inventory_available', 'public.wo_materials', 'public.purchase_order_lines', 'public.schedule_outputs'];
    for (const source of sources) {
      const q = executed.find((sql) => sql.includes(`from ${source}`));
      expect(q, `${source} read missing`).toBeTruthy();
      expect(q!, `${source} read not org-scoped`).toContain('app.current_org_id()');
    }
    // PO remainder uses the grn_items aggregate on non-cancelled GRNs.
    const po = executed.find((sql) => sql.includes('from public.purchase_order_lines'))!;
    expect(po).toContain('grn_items');
    expect(po).toContain("status <> 'cancelled'");
    // Read-only slice: nothing is persisted.
    expect(executed.some((sql) => sql.startsWith('insert') || sql.startsWith('update') || sql.startsWith('delete'))).toBe(false);
  });

  it('excludes a rework WO\'s self-supply — its output never offsets its own demand (batch-D F2)', async () => {
    reworkSelfSupply = true;
    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // WO_REWORK consumes 20 kg dough to make dough and projects 50 kg output.
    // Without the anti-join the 50 kg self-supply would swamp the 20 kg demand
    // (net +42 → "covered") and hide the shortage. With it, only WO_OTHER's
    // 12 kg counts: 0 + 12 − 20 = −8 → MAKE 8.
    const dough = result.data.rows.find((r) => r.itemCode === 'INT-DOUGH')!;
    expect(dough.openSupply).toBe('12.000');
    expect(dough.demand).toBe('20.000');
    expect(dough.net).toBe('-8.000');
    expect(dough.severity).toBe('shortage');
    expect(dough.suggestedAction).toEqual({ type: 'make', qty: '8' });

    // The schedule_outputs read carries the org-scoped anti-join on (wo, product).
    const so = executed.find((sql) => sql.includes('from public.schedule_outputs'))!;
    expect(so).toContain('not exists');
    expect(so).toContain('m.wo_id = so.planned_wo_id');
    expect(so).toContain('m.product_id = so.product_id');
    expect(so).toContain('m.required_qty > m.consumed_qty');
  });

  it('returns forbidden when the planning read permission is missing', async () => {
    allowPermission = false;
    const result = await runMrp();
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    // Gate fails fast — no source reads.
    expect(executed.some((sql) => sql.includes('from public.items'))).toBe(false);
  });

  it('maps a failed read to persistence_failed (never throws to the client)', async () => {
    failInventoryRead = true;
    const result = await runMrp();
    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
  });
});
