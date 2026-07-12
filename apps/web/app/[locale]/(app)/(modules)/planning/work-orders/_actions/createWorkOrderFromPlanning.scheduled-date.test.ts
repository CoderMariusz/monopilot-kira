import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkOrderFromPlanning } from './createWorkOrder';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const WIP_PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const BOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SPEC_ID = '99999999-9999-4999-8999-999999999999';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const SCHEDULED = '2026-07-20T00:00:00.000Z';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

vi.mock('../../../../../../../lib/planning/factory-release-wo-gate', () => ({
  assertFgReleasedToFactoryForWo: vi.fn(async () => 'ok'),
}));

vi.mock('./resolve-stage-production-line', () => ({
  loadStageProductionLineIds: vi.fn(async () => new Map([
    [WIP_PRODUCT_ID, '66666666-6666-4666-8666-666666666666'],
    [PRODUCT_ID, '77777777-7777-4777-8777-777777777777'],
  ])),
}));

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

type HeaderInsertCapture = {
  sql: string;
  params: readonly unknown[];
  woNumber: string;
};

let client: QueryClient;
let hasWipLines = true;
let allowPermission = true;
let generatedSeq = 12;
const headerInserts: HeaderInsertCapture[] = [];

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (q.includes('from public.sites')) {
        return { rows: [{ id: SITE_ID }], rowCount: 1 };
      }
      if (q.startsWith('update public.org_document_settings')) {
        return {
          rows: [{ old_seq: generatedSeq++, number_prefix: 'WO', number_date_part: 'YYYYMM', number_seq_padding: 4 }],
          rowCount: 1,
        };
      }
      if (q.includes('from public.bom_headers')) {
        return { rows: [{ id: BOM_ID, version: 2, line_basis: 'per_base' }], rowCount: 1 };
      }
      if (q.includes('component_type = \'wip\'') || (q.includes('from public.bom_lines') && q.includes('wip'))) {
        return hasWipLines
          ? {
              rows: [{
                id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                line_no: 10,
                item_id: WIP_PRODUCT_ID,
                component_code: 'WIP-STAGE-1',
                quantity: '0.5',
                scrap_pct: '0',
              }],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }
      if (q.includes('from public.production_lines') && q.includes("status = 'active'")) {
        return {
          rows: [{ id: String(params[0]), site_id: SITE_ID }],
          rowCount: 1,
        };
      }
      if (q.includes('pg_advisory_xact_lock')) {
        return { rows: [{}], rowCount: 1 };
      }
      if (q.includes('from public.factory_specs')) {
        return { rows: [{ id: SPEC_ID }], rowCount: 1 };
      }
      if (q.includes('from public.items')) {
        return {
          rows: [{
            id: String(params[0] ?? PRODUCT_ID),
            item_code: String(params[0]) === WIP_PRODUCT_ID ? 'WIP-STAGE-1' : 'FG-NPD-004',
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
      if (q.includes('from public.work_orders') && q.includes('wo_number = $1')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.startsWith('insert into public.work_orders')) {
        const woNumber = String(params[1]);
        headerInserts.push({ sql, params, woNumber });
        return {
          rows: [{
            id: woNumber === 'WO-0013' ? 'fg-wo-id' : 'wip-wo-id',
            wo_number: woNumber,
            product_id: woNumber.includes('-W') ? WIP_PRODUCT_ID : PRODUCT_ID,
            item_code: woNumber.includes('-W') ? 'WIP-STAGE-1' : 'FG-NPD-004',
            item_type_at_creation: woNumber.includes('-W') ? 'intermediate' : 'fg',
            planned_quantity: String(params[4]),
            produced_quantity: null,
            uom: String(params[14]),
            status: 'DRAFT',
            scheduled_start_time: params[5] === null ? null : String(params[5]),
            scheduled_end_time: null,
            production_line_id: params[6] === null ? null : String(params[6]),
            priority: 'normal',
            source_of_demand: 'manual',
            source_reference: 'FG-NPD-004',
            notes: null,
            created_at: '2026-07-20T00:00:00.000Z',
            updated_at: '2026-07-20T00:00:00.000Z',
          }],
          rowCount: 1,
        };
      }
      if (q.startsWith('insert into public.wo_materials')) {
        const materialId = 'material-link-id';
        return {
          rows: [{
            id: materialId,
            wo_id: String(params[0]),
            product_id: WIP_PRODUCT_ID,
            material_name: 'WIP-STAGE-1',
            required_qty: '500.000',
            consumed_qty: '0',
            reserved_qty: '0',
            uom: 'kg',
            sequence: 1,
            material_source: 'stock',
            bom_item_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            bom_version: 2,
            notes: null,
          }],
          rowCount: 1,
        };
      }
      if (q.startsWith('insert into public.schedule_outputs')) {
        return {
          rows: [{
            id: 'schedule-id',
            planned_wo_id: String(params[0]),
            product_id: String(params[1]),
            output_role: 'primary',
            expected_qty: String(params[2]),
            uom: String(params[4]),
            allocation_pct: '100.00',
            disposition: 'to_stock',
            downstream_wo_id: null,
            notes: null,
          }],
          rowCount: 1,
        };
      }
      if (q.startsWith('insert into public.wo_dependencies')) {
        return {
          rows: [{
            parent_wo_id: String(params[0]),
            child_wo_id: String(params[1]),
            material_link: String(params[2]),
            required_qty: String(params[3]),
          }],
          rowCount: 1,
        };
      }
      if (q.startsWith('insert into public.wo_status_history') || q.startsWith('insert into public.wo_operations')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('createWorkOrderFromPlanning — scheduled_start_time persistence (C1a)', () => {
  beforeEach(() => {
    hasWipLines = true;
    allowPermission = true;
    generatedSeq = 12;
    headerInserts.length = 0;
    client = makeClient();
    vi.mocked(withOrgContext).mockImplementation(async (action) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
  });

  it('binds scheduledStartTime to INSERT $6 for FG and WIP when planning chains', async () => {
    const result = await createWorkOrderFromPlanning({
      productId: PRODUCT_ID,
      itemCode: 'FG-NPD-004',
      plannedQuantity: '1000.000',
      scheduledStartTime: SCHEDULED,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder.scheduledStartTime).toBe(SCHEDULED);
    expect(headerInserts).toHaveLength(2);

    for (const capture of headerInserts) {
      expect(normalize(capture.sql)).toContain('$6::timestamptz');
      expect(capture.params[5]).toBe(SCHEDULED);
    }

    const fgInsert = headerInserts.find((row) => !row.woNumber.includes('-W'));
    const wipInsert = headerInserts.find((row) => row.woNumber.includes('-W'));
    expect(fgInsert).toBeDefined();
    expect(wipInsert).toBeDefined();
  });

  it('returns invalid_input (not ok success) when scheduledStartTime fails civil-date zod', async () => {
    const result = await createWorkOrderFromPlanning({
      productId: PRODUCT_ID,
      itemCode: 'FG-NPD-004',
      plannedQuantity: '1000.000',
      scheduledStartTime: 'not-a-datetime',
    });

    expect(result).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
    expect(headerInserts).toHaveLength(0);
  });
});
