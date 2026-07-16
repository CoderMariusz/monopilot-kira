import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkOrder } from './createWorkOrder';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const BOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOM_LINE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SPEC_ID = '99999999-9999-4999-8999-999999999999';
const SITE_ID = '55555555-5555-4555-8555-555555555555';

let client: QueryClient;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/planning/factory-release-wo-gate', () => ({
  assertFgReleasedToFactoryForWo: vi.fn(async () => 'ok'),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = normalize(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      // F10 — resolveWriteSiteId reads public.sites; a single active/default site
      // makes the write-site unambiguous (this suite postdates F10's site gate).
      if (normalized.includes('from public.sites')) {
        return { rows: [{ id: SITE_ID }], rowCount: 1 };
      }

      if (normalized.startsWith('update public.org_document_settings')) {
        return {
          rows: [{ old_seq: 7, number_prefix: 'WO', number_date_part: 'YYYYMM', number_seq_padding: 4 }],
          rowCount: 1,
        };
      }

      if (normalized.includes('from public.bom_headers')) {
        return { rows: [{ id: BOM_ID, version: 3, line_basis: 'per_base' }], rowCount: 1 };
      }

      if (normalized.includes('from public.factory_specs')) {
        return { rows: [{ id: SPEC_ID }], rowCount: 1 };
      }

      if (normalized.includes('from public.items') && normalized.includes('output_uom')) {
        return {
          rows: [
            {
              output_uom: 'base',
              uom_base: 'kg',
              net_qty_per_each: null,
              each_per_box: null,
              boxes_per_pallet: null,
              weight_mode: 'fixed',
            },
          ],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('insert into public.work_orders')) {
        return {
          rows: [
            {
              id: String(params[0]),
              wo_number: String(params[1]),
              product_id: PRODUCT_ID,
              item_code: 'FG-NPD-004',
              item_type_at_creation: 'fg',
              planned_quantity: String(params[4]),
              produced_quantity: null,
              uom: String(params[14]),
              status: 'DRAFT',
              scheduled_start_time: null,
              scheduled_end_time: null,
              production_line_id: null,
              priority: 'normal',
              source_of_demand: 'manual',
              source_reference: 'FG-NPD-004',
              notes: null,
              created_at: '2026-06-09T07:00:00.000Z',
              updated_at: '2026-06-09T07:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('insert into public.wo_materials')) {
        expect(normalized).toContain('select app.current_org_id(), $1::uuid, i.id, bl.component_code');
        expect(normalized).not.toContain('coalesce(i.id, bl.id)');
        return {
          rows: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              wo_id: String(params[0]),
              product_id: null,
              material_name: 'NPD-FLAKE-TEST',
              required_qty: '700.000',
              consumed_qty: '0.000',
              reserved_qty: '0.000',
              uom: 'kg',
              sequence: 1,
              material_source: 'stock',
              bom_item_id: BOM_LINE_ID,
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
              notes: null,
            },
          ],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('insert into public.wo_operations')) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.startsWith('insert into public.wo_status_history')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('createWorkOrder NPD BOM material product_id', () => {
  beforeEach(() => {
    client = makeClient();
  });

  it('keeps wo_materials.product_id null when a BOM component has no matching item row', async () => {
    const result = await createWorkOrder({
      productId: PRODUCT_ID,
      itemCode: 'FG-NPD-004',
      plannedQuantity: '1000.000',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.materials).toEqual([
      expect.objectContaining({
        productId: null,
        bomItemId: BOM_LINE_ID,
        materialName: 'NPD-FLAKE-TEST',
      }),
    ]);
  });
});
