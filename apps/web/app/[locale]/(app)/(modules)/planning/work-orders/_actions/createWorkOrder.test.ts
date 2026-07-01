import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkOrder } from './createWorkOrder';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const BOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SPEC_ID = '99999999-9999-4999-8999-999999999999';
const SITE_ID = '88888888-8888-4888-8888-888888888888';

let client: QueryClient;
let allowPermission = true;
let hasActiveSite = true;
let hasBom = true;
let bomLineBasis = 'per_base';
let hasRouting = true;
let generatedSeq = 7;
let failNextHeaderInsert = false;
let itemUom = {
  output_uom: 'base',
  uom_base: 'kg',
  net_qty_per_each: null,
  each_per_box: null,
  boxes_per_pallet: null,
  weight_mode: 'fixed' as const,
};

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      // F10 — resolveWriteSiteId reads public.sites (default lookup + single-active
      // fallback). A single active/default site makes the write-site unambiguous.
      if (normalized.includes('from public.sites')) {
        return { rows: hasActiveSite ? [{ id: SITE_ID }] : [], rowCount: hasActiveSite ? 1 : 0 };
      }
      if (normalized.startsWith('update public.org_document_settings')) {
        return {
          rows: [{ old_seq: generatedSeq++, number_prefix: 'WO', number_date_part: 'YYYYMM', number_seq_padding: 4 }],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.bom_headers')) {
        return { rows: hasBom ? [{ id: BOM_ID, version: 3, line_basis: bomLineBasis }] : [], rowCount: hasBom ? 1 : 0 };
      }
      if (normalized.includes('from public.factory_specs')) {
        return { rows: [{ id: SPEC_ID }], rowCount: 1 };
      }
      if (normalized.includes('from public.items') && normalized.includes('output_uom')) {
        return { rows: [itemUom], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.work_orders')) {
        if (failNextHeaderInsert) {
          failNextHeaderInsert = false;
          const error = new Error('duplicate') as Error & { code: string };
          error.code = '23505';
          throw error;
        }
        const woId = String(params[0]);
        return {
          rows: [
            {
              id: woId,
              wo_number: String(params[1]),
              product_id: PRODUCT_ID,
              item_code: 'FG-NPD-004',
              item_type_at_creation: 'fg',
              planned_quantity: String(params[4]),
              produced_quantity: null,
              uom: String(params[15]),
              status: 'DRAFT',
              scheduled_start_time: null,
              scheduled_end_time: null,
              production_line_id: null,
              machine_id: null,
              priority: 'normal',
              source_of_demand: 'manual',
              source_reference: 'FG-NPD-004',
              notes: 'seed',
              created_at: '2026-06-09T07:00:00.000Z',
              updated_at: '2026-06-09T07:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.wo_materials')) {
        return {
          rows: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              wo_id: String(params[0]),
              product_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              material_name: 'DEMO-RM-FLOUR',
              required_qty: '700.000',
              consumed_qty: '0.000',
              reserved_qty: '0.000',
              uom: 'kg',
              sequence: 1,
              material_source: 'stock',
              bom_item_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              bom_version: 3,
              notes: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.schedule_outputs')) {
        return {
          rows: [
            {
              id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              planned_wo_id: String(params[0]),
              product_id: PRODUCT_ID,
              output_role: 'primary',
              expected_qty: String(params[2]),
              uom: String(params[4]),
              allocation_pct: '100.00',
              disposition: 'to_stock',
              downstream_wo_id: null,
              notes: 'seed',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.wo_operations')) {
        return { rows: [], rowCount: hasRouting ? 2 : 0 };
      }
      if (normalized.startsWith('insert into public.wo_status_history')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('createWorkOrder', () => {
  beforeEach(() => {
    allowPermission = true;
    hasActiveSite = true;
    hasBom = true;
    bomLineBasis = 'per_base';
    hasRouting = true;
    generatedSeq = 7;
    failNextHeaderInsert = false;
    itemUom = {
      output_uom: 'base',
      uom_base: 'kg',
      net_qty_per_each: null,
      each_per_box: null,
      boxes_per_pallet: null,
      weight_mode: 'fixed',
    };
    client = makeClient();
  });

  it('creates a draft WO and snapshots materials from the active BOM', async () => {
    const result = await createWorkOrder({
      productId: PRODUCT_ID,
      itemCode: 'FG-NPD-004',
      plannedQuantity: '1000.000',
      notes: 'seed',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder).toEqual(expect.objectContaining({ status: 'DRAFT', itemCode: 'FG-NPD-004' }));
    expect(result.workOrder.woNumber).toMatch(/^WO-\d{6}-0007$/);
    expect(result.materials).toEqual([expect.objectContaining({ materialName: 'DEMO-RM-FLOUR', bomVersion: 3 })]);
    expect(result.primarySchedule).toEqual(expect.objectContaining({ outputRole: 'primary', expectedQty: '1000.000' }));
    expect(result.warning).toBeUndefined();
  });

  it('retries once with a fresh generated WO number on unique violation', async () => {
    failNextHeaderInsert = true;

    const result = await createWorkOrder({
      productId: PRODUCT_ID,
      itemCode: 'FG-NPD-004',
      plannedQuantity: '1000.000',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder.woNumber).toMatch(/^WO-\d{6}-0008$/);
  });

  it('converts entered output units to base quantity for WO, materials, and schedule output', async () => {
    itemUom = {
      output_uom: 'box',
      uom_base: 'kg',
      net_qty_per_each: '0.1000',
      each_per_box: '10',
      boxes_per_pallet: null,
      weight_mode: 'fixed',
    };

    const result = await createWorkOrder({
      productId: PRODUCT_ID,
      itemCode: 'FG-NPD-004',
      plannedQuantity: '1.000',
      quantityEntered: '300.000',
      quantityEnteredUom: 'box',
      notes: 'seed',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.conversion).toEqual({ qtyEntered: '300.000', qtyEnteredUom: 'box', baseQty: '300.000' });
    expect(result.workOrder.plannedQuantity).toBe('300.000');
    expect(result.materials[0]?.requiredQty).toBe('700.000');
    expect(result.primarySchedule.expectedQty).toBe('300.000');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.work_orders'),
      expect.arrayContaining([
        expect.any(String),
        expect.any(String),
        PRODUCT_ID,
        BOM_ID,
        '300.000',
        null,
        null,
        null,
        'FG-NPD-004',
        expect.any(String),
        USER_ID,
        SPEC_ID,
        '300.000',
        'box',
        JSON.stringify({
          output_uom: 'box',
          uom_base: 'kg',
          net_qty_per_each: '0.1000',
          each_per_box: '10',
          boxes_per_pallet: null,
          weight_mode: 'fixed',
        }),
        'kg',
      ]),
    );
  });

  it('scales per-box BOM material snapshots by planned boxes instead of planned base quantity', async () => {
    bomLineBasis = 'per_box';
    itemUom = {
      output_uom: 'box',
      uom_base: 'kg',
      net_qty_per_each: '0.5000',
      each_per_box: '4',
      boxes_per_pallet: null,
      weight_mode: 'fixed',
    };

    const result = await createWorkOrder({
      productId: PRODUCT_ID,
      itemCode: 'FG-NPD-004',
      plannedQuantity: '100.000',
    });

    expect(result.ok).toBe(true);
    const materialsCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(([sql]: [string]) =>
      String(sql).replace(/\s+/g, ' ').toLowerCase().startsWith('insert into public.wo_materials'),
    );
    expect(materialsCall).toBeDefined();
    const [, params] = materialsCall as [string, readonly unknown[]];
    expect(params[1]).toBe('50.000000');
  });

  it('F-B02: snapshots the active routing into wo_operations at WO create (same point as materials)', async () => {
    const result = await createWorkOrder({
      productId: PRODUCT_ID,
      itemCode: 'FG-NPD-004',
      plannedQuantity: '1000.000',
    });

    expect(result.ok).toBe(true);
    const opsCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(([sql]: [string]) =>
      String(sql).replace(/\s+/g, ' ').toLowerCase().startsWith('insert into public.wo_operations'),
    );
    expect(opsCall).toBeDefined();
    const [sql, params] = opsCall as [string, readonly unknown[]];
    const n = String(sql).replace(/\s+/g, ' ').toLowerCase();
    // Source: the product's ACTIVE routing (routings ⨝ routing_operations).
    expect(n).toContain('from public.routing_operations ro');
    expect(n).toContain("r.status = 'active'");
    // Idempotent per WO via the (wo_id, sequence) unique key.
    expect(n).toContain('on conflict (wo_id, sequence) do nothing');
    // Bound to this WO, the planned BASE qty (run-time × qty duration), the FG item uuid.
    expect(params[1]).toBe('1000.000');
    expect(params[2]).toBe(PRODUCT_ID);

    // F5 (W9 cross-review): duration math hardening —
    // 1. setup NULL no longer NULLs a real run-time sum (coalesce(setup_time_min, 0)).
    expect(n).toContain('coalesce(ro.setup_time_min, 0)');
    // 2. honest-NULL only when BOTH inputs are missing.
    expect(n).toContain('when ro.run_time_per_unit_sec is null and ro.setup_time_min is null then null');
    // 3. int4 overflow guard: computed minutes beyond 2^31−1 cap at NULL instead
    //    of blowing up the whole WO insert with a numeric_value_out_of_range.
    expect(n).toContain('> 2147483647');
    expect(n).toMatch(/> 2147483647\s+then null/);
    // The old broken shape (bare setup + run sum / nullif fallback) is gone.
    expect(n).not.toContain('then (ro.setup_time_min + ceil');
    expect(n).not.toContain('nullif(ro.setup_time_min, 0)');
  });

  it('creates a WO without materials and returns no_active_bom when no active BOM exists', async () => {
    hasBom = false;

    const result = await createWorkOrder({ productId: PRODUCT_ID, itemCode: 'FG-NPD-004', plannedQuantity: '1000.000' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.materials).toEqual([]);
    expect(result.warning).toBe('no_active_bom');
  });

  it('returns forbidden when the caller lacks planning write permission', async () => {
    allowPermission = false;

    await expect(createWorkOrder({ productId: PRODUCT_ID, itemCode: 'FG-NPD-004', plannedQuantity: '1000.000' })).resolves.toEqual({
      ok: false,
      error: 'forbidden',
    });
  });

  it('F10: persists the resolved site_id (never null) on the WO header', async () => {
    const result = await createWorkOrder({ productId: PRODUCT_ID, itemCode: 'FG-NPD-004', plannedQuantity: '1000.000' });

    expect(result.ok).toBe(true);
    const headerCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(([sql]: [string]) =>
      String(sql).replace(/\s+/g, ' ').toLowerCase().startsWith('insert into public.work_orders'),
    );
    expect(headerCall).toBeDefined();
    const [, params] = headerCall as [string, readonly unknown[]];
    // site_id is the 17th bind ($17::uuid) — must be the resolved SITE_ID, not null.
    expect(params[16]).toBe(SITE_ID);
  });

  it('F10: refuses to create with no_active_site instead of writing a null-site WO (fail-closed)', async () => {
    hasActiveSite = false;

    const result = await createWorkOrder({ productId: PRODUCT_ID, itemCode: 'FG-NPD-004', plannedQuantity: '1000.000' });

    expect(result).toEqual({ ok: false, error: 'no_active_site' });
    // No WO header insert may have happened (no orphaned null-site WO).
    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls.map(([sql]: [string]) => String(sql));
    expect(calls.some((sql: string) => sql.includes('insert into public.work_orders'))).toBe(false);
  });
});
